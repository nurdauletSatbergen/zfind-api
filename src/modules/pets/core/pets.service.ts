import {
pets  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { UpdatePetDto } from './dto/update-pet.dto';
import { PrismaService } from '../../../libs/database/prisma.service';
import { Prisma, PetStatus } from '../../../generated/prisma/client';
import { FilesService } from '../../files/files.service';
import { CreatePetDto } from './dto/create-pet.dto';
import { calculateAge } from '../domain/age';
import { generatePublicCode } from '../domain/public-code';

export const MAX_PET_PHOTOS = 10;

/** Питомец, дополненный `withOwnerStats` */
export type OwnerPetStats<T> = T & {
  age: number | null;
  lostAt: string | null;
  sightingsCount: number;
  newSightingsCount: number;
};
const CODE_GENERATION_ATTEMPTS = 10;

@Injectable()
export class PetsService {
  constructor(
    private prisma: PrismaService,
    private filesService: FilesService,
  ) {}

  async create(ownerId: number, createPetDto: CreatePetDto) {
    for (let attempt = 0; attempt < CODE_GENERATION_ATTEMPTS; attempt++) {
      try {
        const pet = await this.prisma.pet.create({
          data: {
            ...createPetDto,
            ownerId,
            publicCode: generatePublicCode(),
          },
        });
        return await this.withOwnerStats(pet);
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

  async findAllForOwner(ownerId: number, page: number, limit: number) {
    const [pets, total] = await this.prisma.$transaction([
      this.prisma.pet.findMany({
        where: { ownerId },
        // enum PetStatus объявлен как HOME, LOST — в Postgres enum сортируется
        // по порядку объявления, поэтому desc ставит LOST первыми
        orderBy: [{ status: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          // обложка карточки — первое фото; полный набор отдаёт findOne
          photos: {
            include: { file: true },
            orderBy: { position: 'asc' },
            take: 1,
          },
        },
      }),
      this.prisma.pet.count({ where: { ownerId } }),
    ]);

    const withStats = await this.withOwnerStats(pets);
    const items = await Promise.all(
      withStats.map(async ({ photos, ...pet }) => ({
        ...pet,
        coverUrl: photos[0]
          ? await this.filesService.url(photos[0].file)
          : null,
      })),
    );
    return { items, total, page, limit };
  }

  /**
   * Полная карточка питомца — только владельцу.
   *
   * Анониму соответствует публичная карточка по коду с жетона: она усечена и
   * не раскрывает publicCode, rewardAmount и ownerId. Здесь проверка владения
   * сделана после выборки, а не через findOwnedPet, чтобы не ходить в БД дважды.
   */
  async findOne(id: number, userId: number) {
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
    if (pet.ownerId !== userId) {
      throw new ForbiddenException('You are not the owner of this pet');
    }

    const { photos, ...rest } = await this.withOwnerStats(pet);

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

  async update(id: number, userId: number, updatePetDto: UpdatePetDto) {
    await this.findOwnedPet(id, userId);
    const pet = await this.prisma.pet.update({
      where: { id },
      data: updatePetDto,
    });
    return this.withOwnerStats(pet);
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

  /**
   * Задаёт порядок фото питомца: первое в списке становится обложкой.
   *
   * @remarks Набор id должен точно совпадать с фото питомца — без лишних,
   * повторов и пропусков, иначе 400. Позиции переписываются 0…n−1 в одной
   * транзакции; возвращается список в новом порядке.
   */
  async reorderPhotos(petId: number, userId: number, photoIds: number[]) {
    await this.findOwnedPet(petId, userId);

    const photos = await this.prisma.petPhoto.findMany({
      where: { petId },
      include: { file: true },
    });
    const ownIds = new Set(photos.map((photo) => photo.id));
    if (
      photoIds.length !== ownIds.size ||
      new Set(photoIds).size !== photoIds.length ||
      !photoIds.every((id) => ownIds.has(id))
    ) {
      throw new BadRequestException('Список фото не совпадает с фото питомца');
    }

    await this.prisma.$transaction(
      photoIds.map((id, position) =>
        this.prisma.petPhoto.update({ where: { id }, data: { position } }),
      ),
    );

    const byId = new Map(photos.map((photo) => [photo.id, photo]));
    return Promise.all(
      photoIds.map(async (id, position) => ({
        id,
        url: await this.filesService.url(byId.get(id)!.file),
        position,
      })),
    );
  }

  /**
   * Дополняет питомцев (или одного) данными кабинета владельца: `age`,
   * `lostAt` и счётчики сообщений. Общая точка для всех ответов владельцу.
   *
   * @remarks Без N+1: открытые эпизоды и счётчики берутся тремя запросами на
   * весь список, а не по запросу на питомца. `lostAt` — начало открытого
   * эпизода (`foundAt: null`) и только у питомца со статусом `LOST`, иначе
   * `null` (даже при открытом эпизоде). `newSightingsCount` —
   * сообщения позже `sightingsSeenAt`; при `null` считаются все.
   */
  async withOwnerStats<
    T extends {
      id: number;
      status: PetStatus;
      birthDate: Date | null;
      sightingsSeenAt: Date | null;
    },
  >(pet: T): Promise<OwnerPetStats<T>>;
  async withOwnerStats<
    T extends {
      id: number;
      status: PetStatus;
      birthDate: Date | null;
      sightingsSeenAt: Date | null;
    },
  >(pets: T[]): Promise<OwnerPetStats<T>[]>;
  async withOwnerStats<
    T extends {
      id: number;
      status: PetStatus;
      birthDate: Date | null;
      sightingsSeenAt: Date | null;
    },
  >(input: T | T[]): Promise<OwnerPetStats<T> | OwnerPetStats<T>[]> {
    const pets = Array.isArray(input) ? input : [input];
    if (pets.length === 0) return [];
    const ids = pets.map((pet) => pet.id);

    const [episodes, totals, news] = await Promise.all([
      this.prisma.lostEpisode.findMany({
        where: { petId: { in: ids }, foundAt: null },
        select: { petId: true, lostAt: true },
        orderBy: { lostAt: 'asc' },
      }),
      this.prisma.sighting.groupBy({
        by: ['petId'],
        where: { petId: { in: ids } },
        _count: { _all: true },
      }),
      this.prisma.sighting.groupBy({
        by: ['petId'],
        where: {
          OR: pets.map((pet) => ({
            petId: pet.id,
            ...(pet.sightingsSeenAt && {
              createdAt: { gt: pet.sightingsSeenAt },
            }),
          })),
        },
        _count: { _all: true },
      }),
    ]);

    // эпизодов ≤1 на питомца; при нарушении инварианта берём самый свежий
    const lostAtByPet = new Map(episodes.map((e) => [e.petId, e.lostAt]));
    const totalByPet = new Map(totals.map((r) => [r.petId, r._count._all]));
    const newByPet = new Map(news.map((r) => [r.petId, r._count._all]));

    const result = pets.map((pet) => ({
      ...pet,
      age: calculateAge(pet.birthDate),
      lostAt:
        pet.status === 'LOST'
          ? (lostAtByPet.get(pet.id)?.toISOString() ?? null)
          : null,
      sightingsCount: totalByPet.get(pet.id) ?? 0,
      newSightingsCount: newByPet.get(pet.id) ?? 0,
    }));
    return Array.isArray(input) ? result : result[0];
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
