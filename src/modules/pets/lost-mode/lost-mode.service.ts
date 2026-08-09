import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../libs/database/prisma.service';
import { PetsService } from '../core/pets.service';
import { ChangeStatusDto } from './dto/change-status.dto';

/**
 * Статусная машина «дома ↔ потерялся».
 *
 * Только запись: публичное представление питомца (карточка, лента, статистика)
 * живёт в PublicPetsService — там же собраны все правила о том, что видят
 * анонимы.
 */
@Injectable()
export class LostModeService {
  constructor(
    private prisma: PrismaService,
    private petsService: PetsService,
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
}
