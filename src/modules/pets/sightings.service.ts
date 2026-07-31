import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../libs/database/prisma.service';
import { FilesService } from '../files/files.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PetsService } from './pets.service';
import { CreateSightingDto } from './dto/create-sighting.dto';

@Injectable()
export class SightingsService {
  private readonly logger = new Logger(SightingsService.name);

  constructor(
    private prisma: PrismaService,
    private filesService: FilesService,
    private notificationsService: NotificationsService,
    private petsService: PetsService,
  ) {}

  async createPublic(
    code: string,
    dto: CreateSightingDto,
    photo?: Express.Multer.File,
  ) {
    const pet = await this.prisma.pet.findUnique({
      where: { publicCode: code },
      select: { id: true, name: true, status: true, ownerId: true },
    });
    if (!pet) throw new NotFoundException('Pet not found');
    if (pet.status !== 'LOST') {
      throw new ConflictException('Pet is not lost');
    }

    const hasLat = dto.lat != null;
    const hasLng = dto.lng != null;
    if (hasLat !== hasLng) {
      throw new BadRequestException('lat and lng must be provided together');
    }
    // правило минимума: гео | адрес | комментарий (фото/телефон недостаточны)
    if (!hasLat && !dto.address && !dto.comment) {
      throw new BadRequestException(
        'Provide at least coordinates, address or comment',
      );
    }

    // мягкая деградация: сбой S3 не роняет создание sighting
    let photoFileId: number | null = null;
    if (photo) {
      try {
        const file = await this.filesService.uploadPublic(
          'sightings',
          pet.id,
          photo,
          null,
        );
        photoFileId = file.id;
      } catch (e) {
        this.logger.warn(
          `Sighting photo upload failed for pet ${pet.id}: ${String(e)}`,
        );
      }
    }

    const sighting = await this.prisma.sighting.create({
      data: {
        petId: pet.id,
        lat: dto.lat,
        lng: dto.lng,
        address: dto.address,
        comment: dto.comment,
        reporterPhone: dto.reporterPhone,
        photoFileId,
      },
    });

    try {
      await this.notificationsService.notifyUser(pet.ownerId, {
        type: 'SIGHTING',
        title: `🐾 ${pet.name}: питомца видели!`,
        body: dto.address ?? dto.comment ?? 'Отмечена геолокация',
        data: {
          petId: pet.id,
          sightingId: sighting.id,
          lat: dto.lat ?? null,
          lng: dto.lng ?? null,
        },
      });
    } catch (e) {
      this.logger.warn(
        `Sighting notification failed for pet ${pet.id}: ${String(e)}`,
      );
    }

    return { id: sighting.id, createdAt: sighting.createdAt };
  }

  async listForOwner(petId: number, userId: number) {
    await this.petsService.findOwnedPet(petId, userId);
    const sightings = await this.prisma.sighting.findMany({
      where: { petId },
      orderBy: { createdAt: 'desc' },
      include: { photo: true },
    });
    return Promise.all(
      sightings.map(async ({ photo, photoFileId, ...rest }) => ({
        ...rest,
        photoUrl: photo ? await this.filesService.url(photo) : null,
      })),
    );
  }
}
