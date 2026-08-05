import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../libs/database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { FilesService } from '../files/files.service';
import { calculateAge, PetsService } from './pets.service';
import { ChangeStatusDto } from './dto/change-status.dto';
import { PaginatedPublicPetsDto, PublicPetDto } from './dto/public-pet.dto';
import {
  FEED_DEFAULT_LIMIT,
  PublicPetsQueryDto,
} from './dto/public-pets-query.dto';

export const RECENTLY_FOUND_DAYS = 14;

// Публично координаты пропажи округляем: место пропажи обычно рядом с домом
// владельца, поэтому нашедшему отдаём район (~110 м), а не точную метку.
const PUBLIC_COORD_PRECISION = 3;

function roundCoord(value: number | null | undefined): number | null {
  if (value == null) return null;
  const factor = 10 ** PUBLIC_COORD_PRECISION;
  return Math.round(value * factor) / factor;
}

const KM_PER_LAT_DEGREE = 111.32;
const EARTH_RADIUS_KM = 6371;

const toRadians = (deg: number): number => (deg * Math.PI) / 180;

/**
 * Границы квадрата, описанного вокруг круга поиска. Фильтруем по нему в БД:
 * это попадает в индекс [lat, lng] и корректно работает с пагинацией.
 * Углы квадрата дальше радиуса — точное расстояние отдаём в distanceKm,
 * чтобы клиент мог отсечь лишнее.
 */
function boundingBox(lat: number, lng: number, radiusKm: number) {
  const latDelta = radiusKm / KM_PER_LAT_DEGREE;
  const lngDelta =
    radiusKm / (KM_PER_LAT_DEGREE * Math.max(Math.cos(toRadians(lat)), 0.01));
  return {
    latMin: lat - latDelta,
    latMax: lat + latDelta,
    lngMin: lng - lngDelta,
    lngMax: lng + lngDelta,
  };
}

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

@Injectable()
export class LostModeService {
  constructor(
    private prisma: PrismaService,
    private petsService: PetsService,
    private filesService: FilesService,
  ) {}

  // HOME → LOST: открыть эпизод (+ опц. reward); LOST → HOME: закрыть эпизод, обнулить reward.
  // Инвариант «≤1 активного эпизода» держится тем, что оба изменения идут одной транзакцией,
  // а вход в LOST возможен только из HOME (тот же статус → 400).
  async changeStatus(petId: number, userId: number, dto: ChangeStatusDto) {
    const pet = await this.petsService.findOwnedPet(petId, userId);

    if (pet.status === dto.status) {
      throw new BadRequestException(`Pet is already in status ${dto.status}`);
    }
    if (dto.status === 'HOME') {
      // всё это — данные объявления о пропаже, при возврате домой они бессмысленны
      const announcementFields = [
        dto.rewardAmount,
        dto.lostAt,
        dto.lat,
        dto.lng,
        dto.address,
        dto.contactPhones,
      ];
      if (announcementFields.some((field) => field != null)) {
        throw new BadRequestException(
          'rewardAmount, lostAt, lat, lng, address и contactPhones допустимы только при переходе в LOST',
        );
      }
    }

    if (dto.status === 'LOST') {
      if ((dto.lat == null) !== (dto.lng == null)) {
        throw new BadRequestException('lat и lng передаются вместе');
      }

      const [updated] = await this.prisma.$transaction([
        this.prisma.pet.update({
          where: { id: petId },
          data: { status: 'LOST', rewardAmount: dto.rewardAmount ?? null },
        }),
        this.prisma.lostEpisode.create({
          data: {
            petId,
            lostAt: dto.lostAt,
            lat: dto.lat,
            lng: dto.lng,
            address: dto.address,
            contactPhones: dto.contactPhones ?? [],
          },
        }),
      ]);
      return updated;
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.pet.update({
        where: { id: petId },
        data: { status: 'HOME', rewardAmount: null },
      }),
      this.prisma.lostEpisode.updateMany({
        where: { petId, foundAt: null },
        data: { foundAt: new Date() },
      }),
    ]);
    return updated;
  }

  async listEpisodes(petId: number, userId: number) {
    await this.petsService.findOwnedPet(petId, userId);
    return this.prisma.lostEpisode.findMany({
      where: { petId },
      orderBy: { lostAt: 'desc' },
    });
  }

  async publicCard(code: string): Promise<PublicPetDto> {
    const pet = await this.prisma.pet.findUnique({
      where: { publicCode: code },
      include: {
        owner: { select: { phone: true } },
        photos: { include: { file: true }, orderBy: { position: 'asc' } },
        lostEpisodes: { where: { foundAt: null }, take: 1 },
      },
    });
    if (!pet) throw new NotFoundException('Pet not found');

    const dto: PublicPetDto = {
      publicCode: pet.publicCode,
      name: pet.name,
      status: pet.status,
      photos: await Promise.all(
        pet.photos.map((photo) => this.filesService.url(photo.file)),
      ),
      recentlyFound: await this.hasRecentReunion(pet.id),
      species: pet.species,
      color: pet.color,
      sex: pet.sex,
      age: calculateAge(pet.birthDate),
      traits: pet.traits,
      weightKg: pet.weightKg,
      hasMicrochip: pet.hasMicrochip,
    };

    if (pet.status === 'LOST') {
      const episode = pet.lostEpisodes[0];
      const ownerFallback = pet.owner.phone ? [pet.owner.phone] : [];

      dto.rewardAmount = pet.rewardAmount?.toString() ?? null;
      dto.contactPhones = episode?.contactPhones.length
        ? episode.contactPhones
        : ownerFallback;
      dto.lostAt = episode?.lostAt;
      dto.lostLat = roundCoord(episode?.lat);
      dto.lostLng = roundCoord(episode?.lng);
      dto.lostAddress = episode?.address ?? null;
    }
    return dto;
  }

  /**
   * Публичная лента пропавших: корень запроса — активные эпизоды, поэтому
   * сортировка по времени пропажи и гео-фильтр по месту идут прямо в БД
   * и не ломают пагинацию.
   */
  async publicFeed(query: PublicPetsQueryDto): Promise<PaginatedPublicPetsDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? FEED_DEFAULT_LIMIT;

    const geoGiven = [query.lat, query.lng, query.radius].filter(
      (value) => value != null,
    ).length;
    if (geoGiven > 0 && geoGiven < 3) {
      throw new BadRequestException(
        'lat, lng и radius передаются только вместе',
      );
    }

    const hasGeo = geoGiven === 3;
    const box = hasGeo
      ? boundingBox(query.lat!, query.lng!, query.radius!)
      : null;

    const where: Prisma.LostEpisodeWhereInput = {
      foundAt: null,
      pet: { status: 'LOST' },
      ...(box && {
        lat: { gte: box.latMin, lte: box.latMax },
        lng: { gte: box.lngMin, lte: box.lngMax },
      }),
    };

    const [episodes, total] = await this.prisma.$transaction([
      this.prisma.lostEpisode.findMany({
        where,
        orderBy: { lostAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          pet: {
            include: {
              photos: {
                include: { file: true },
                orderBy: { position: 'asc' },
                take: 1,
              },
            },
          },
        },
      }),
      this.prisma.lostEpisode.count({ where }),
    ]);

    const items = await Promise.all(
      episodes.map(async ({ pet, ...episode }) => {
        const cover = pet.photos[0];
        // расстояние считаем от публичных (округлённых) координат — иначе
        // из него можно восстановить точное место
        const lostLat = roundCoord(episode.lat);
        const lostLng = roundCoord(episode.lng);

        return {
          publicCode: pet.publicCode,
          name: pet.name,
          coverUrl: cover ? await this.filesService.url(cover.file) : null,
          species: pet.species,
          color: pet.color,
          sex: pet.sex,
          age: calculateAge(pet.birthDate),
          traits: pet.traits,
          weightKg: pet.weightKg,
          hasMicrochip: pet.hasMicrochip,
          rewardAmount: pet.rewardAmount?.toString() ?? null,
          lostAt: episode.lostAt,
          lostLat,
          lostLng,
          lostAddress: episode.address,
          distanceKm:
            hasGeo && lostLat != null && lostLng != null
              ? Math.round(
                  haversineKm(query.lat!, query.lng!, lostLat, lostLng) * 10,
                ) / 10
              : null,
        };
      }),
    );

    return { items, total, page, limit };
  }

  async stats() {
    const [reunions, searching] = await this.prisma.$transaction([
      this.prisma.lostEpisode.count({ where: { foundAt: { not: null } } }),
      this.prisma.pet.count({ where: { status: 'LOST' } }),
    ]);
    return { reunions, searching };
  }

  private async hasRecentReunion(petId: number): Promise<boolean> {
    const cutoff = new Date(Date.now() - RECENTLY_FOUND_DAYS * 86_400_000);
    const count = await this.prisma.lostEpisode.count({
      where: { petId, foundAt: { gte: cutoff } },
    });
    return count > 0;
  }
}
