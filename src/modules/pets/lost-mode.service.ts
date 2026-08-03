import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../libs/database/prisma.service';
import { FilesService } from '../files/files.service';
import { calculateAge, PetsService } from './pets.service';
import { ChangeStatusDto } from './dto/change-status.dto';
import { PublicPetDto } from './dto/public-pet.dto';

export const RECENTLY_FOUND_DAYS = 14;

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
    if (dto.status === 'HOME' && dto.rewardAmount != null) {
      throw new BadRequestException(
        'rewardAmount is only allowed when switching to LOST',
      );
    }

    if (dto.status === 'LOST') {
      const [updated] = await this.prisma.$transaction([
        this.prisma.pet.update({
          where: { id: petId },
          data: { status: 'LOST', rewardAmount: dto.rewardAmount ?? null },
        }),
        this.prisma.lostEpisode.create({ data: { petId } }),
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
    };

    if (pet.status === 'LOST') {
      dto.rewardAmount = pet.rewardAmount?.toString() ?? null;
      dto.ownerPhone = pet.owner.phone ?? null;
      dto.lostAt = pet.lostEpisodes[0]?.lostAt;
    }
    return dto;
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
