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

  /**
   * HOME → LOST: открыть эпизод (+ опц. reward); LOST → HOME: закрыть эпизод,
   * обнулить reward.
   *
   * Инвариант «≤1 активного эпизода» держится условным апдейтом: смена статуса
   * идёт через updateMany с ожидаемым статусом в where, и ноль затронутых строк
   * означает, что параллельный запрос нас опередил. Простой проверки прочитанного
   * статуса тут мало — два одновременных перехода в LOST оба увидели бы HOME и
   * оба создали бы эпизод. Проверка ниже осталась ради внятного ответа в обычном
   * случае, гарантию даёт БД.
   */
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

      // интерактивная транзакция, а не массив: исключение внутри неё
      // откатывает уже созданный эпизод, если гонку выиграл не этот запрос
      return this.prisma.$transaction(async (tx) => {
        const { count } = await tx.pet.updateMany({
          where: { id: petId, status: 'HOME' },
          data: { status: 'LOST', rewardAmount: dto.rewardAmount ?? null },
        });
        if (count === 0) {
          throw new BadRequestException('Pet is already in status LOST');
        }

        await tx.lostEpisode.create({
          data: {
            petId,
            lostAt: dto.lostAt,
            lat: dto.lat,
            lng: dto.lng,
            address: dto.address,
            contactPhones: dto.contactPhones ?? [],
          },
        });

        return tx.pet.findUniqueOrThrow({ where: { id: petId } });
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.pet.updateMany({
        where: { id: petId, status: 'LOST' },
        data: { status: 'HOME', rewardAmount: null },
      });
      if (count === 0) {
        throw new BadRequestException('Pet is already in status HOME');
      }

      await tx.lostEpisode.updateMany({
        where: { petId, foundAt: null },
        data: { foundAt: new Date() },
      });

      return tx.pet.findUniqueOrThrow({ where: { id: petId } });
    });
  }

  async listEpisodes(petId: number, userId: number) {
    await this.petsService.findOwnedPet(petId, userId);
    return this.prisma.lostEpisode.findMany({
      where: { petId },
      orderBy: { lostAt: 'desc' },
    });
  }
}
