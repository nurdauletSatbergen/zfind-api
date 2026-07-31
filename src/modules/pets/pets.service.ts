import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { UpdatePetDto } from './dto/update-pet.dto';
import { PrismaService } from '../../libs/database/prisma.service';
import { Prisma, NotificationType } from '../../generated/prisma/client';
import { FilesService } from '../files/files.service';
import { randomInt } from 'node:crypto';
import { CreatePetDto } from './dto/create-pet.dto';

export const MAX_PET_PHOTOS = 10;
const CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const CODE_GENERATION_ATTEMPTS = 10;

export function generatePublicCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}

@Injectable()
export class PetsService {
  constructor(
    private prisma: PrismaService,
    private filesService: FilesService,
  ) {}

  async create(ownerId: number, createPetDto: CreatePetDto) {
    for (let attempt = 0; attempt < CODE_GENERATION_ATTEMPTS; attempt++) {
      try {
        return await this.prisma.pet.create({
          data: {
            ...createPetDto,
            ownerId,
            publicCode: generatePublicCode(),
          },
        });
      } catch (e) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2002'
        )
          continue;
        throw e;
      }
    }
    throw new InternalServerErrorException(
      'Failed to generate a unique public code',
    );
  }

  findAll() {
    return this.prisma.pet.findMany();
  }

  async findOne(id: number) {
    const pet = await this.prisma.pet.findUnique({
      where: { id },
      include: {
        photos: {
          include: { file: true },
          orderBy: { position: 'asc' },
        },
      },
    });

    if (!pet) throw new NotFoundException(`Pet with ID ${id} not found`);

    const { photos, ...rest } = pet;

    return {
      ...rest,
      photos: await Promise.all(
        photos.map(async (photo) => ({
          id: photo.id,
          url: await this.filesService.url(photo.file),
          position: photo.position,
        })),
      ),
    };
  }

  update(id: number, updatePetDto: UpdatePetDto) {
    return `This action updates a #${id} pet`;
  }

  async remove(id: number, userId: number) {
    const pet = await this.findOwnedPet(id, userId);
    const photos = await this.prisma.petPhoto.findMany({
      where: { petId: pet.id },
    });
    for (const photo of photos) {
      await this.filesService.delete(photo.fileId);
    }
    await this.prisma.pet.delete({ where: { id: pet.id } });
  }

  async addPhotos(petId: number, userId: number, files: Express.Multer.File[]) {
    const pet = await this.findOwnedPet(petId, userId);

    if (pet._count.photos + files.length > MAX_PET_PHOTOS) {
      throw new UnprocessableEntityException(
        `Pet can have at most ${MAX_PET_PHOTOS} photos`,
      );
    }

    const uploaded: { id: number; url: string; position: number }[] = [];
    const failed: { filename: string }[] = [];
    let position = pet._count.photos;

    for (const file of files) {
      try {
        const savedFile = await this.filesService.uploadPublic(
          'pets',
          petId,
          file,
          userId,
        );
        const photo = await this.prisma.petPhoto.create({
          data: { petId, fileId: savedFile.id, position: position++ },
          include: { file: true },
        });
        uploaded.push({
          id: photo.id,
          url: await this.filesService.url(photo.file),
          position: photo.position,
        });
      } catch {
        failed.push({ filename: file.originalname });
      }
    }

    return { uploaded, failed };
  }

  async removePhoto(petId: number, photoId: number, userId: number) {
    const pet = await this.findOwnedPet(petId, userId);

    const photo = await this.prisma.petPhoto.findUnique({
      where: { id: photoId },
    });
    if (!photo || photo.petId !== pet.id) {
      throw new NotFoundException(`Photo with ID ${photoId} not found`);
    }

    await this.filesService.delete(photo.fileId);
    await this.prisma.petPhoto.updateMany({
      where: { petId: pet.id, position: { gt: photo.position } },
      data: { position: { decrement: 1 } },
    });
  }

  async findOwnedPet(id: number, userId: number) {
    const pet = await this.prisma.pet.findUnique({
      where: { id },
      include: { _count: { select: { photos: true } } },
    });
    if (!pet) throw new NotFoundException(`Pet with ID ${id} not found`);
    if (pet.ownerId !== userId) {
      throw new ForbiddenException('You are not the owner of this pet');
    }
    return pet;
  }
}
