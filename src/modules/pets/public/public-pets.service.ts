import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../libs/database/prisma.service';
import { Prisma } from '../../../generated/prisma/client';
import { FilesService } from '../../files/files.service';
import { calculateAge } from '../domain/age';
import { boundingBox, haversineKm, roundCoord } from '../domain/geo';
import { PaginatedPublicPetsDto, PublicPetDto } from './dto/public-pet.dto';
import {
  FEED_DEFAULT_LIMIT,
  PublicPetsQueryDto,
} from './dto/public-pets-query.dto';

export const RECENTLY_FOUND_DAYS = 14;

/**
 * Read-модель публичного контура: всё, что видит аноним по коду с жетона.
 *
 * Здесь и только здесь решается, какие поля питомца выходят наружу — округление
 * координат, показ контактов исключительно при статусе LOST, отсутствие
 * телефонов в ленте. Ничего не пишет в БД.
 */
@Injectable()
export class PublicPetsService {
  constructor(
    private prisma: PrismaService,
    private filesService: FilesService,
  ) {}

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
