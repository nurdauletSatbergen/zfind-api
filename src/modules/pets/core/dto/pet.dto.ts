import { ApiProperty } from '@nestjs/swagger';
import { PetPhotoDto } from './pet-photo.dto';

export class PetDto {
  id: number;

  name: string;

  ownerId: number;

  @ApiProperty({ enum: ['HOME', 'LOST'] })
  status: 'HOME' | 'LOST';

  publicCode: string;

  @ApiProperty({ nullable: true, type: String })
  rewardAmount: string | null;

  @ApiProperty({ enum: ['DOG', 'CAT', 'BIRD', 'OTHER'], nullable: true })
  species: 'DOG' | 'CAT' | 'BIRD' | 'OTHER' | null;

  /** Окрас в свободной форме */
  @ApiProperty({ nullable: true, type: String })
  color: string | null;

  @ApiProperty({ enum: ['MALE', 'FEMALE'], nullable: true })
  sex: 'MALE' | 'FEMALE' | null;

  @ApiProperty({ nullable: true, type: Date })
  birthDate: Date | null;

  /** Особые приметы в свободной форме */
  @ApiProperty({ nullable: true, type: String })
  traits: string | null;

  /** Вес в килограммах */
  @ApiProperty({ nullable: true, type: Number })
  weightKg: number | null;

  /** Есть ли микрочип; null = не указано */
  @ApiProperty({ nullable: true, type: Boolean })
  hasMicrochip: boolean | null;

  /** Полных лет, вычисляется из birthDate; null, если дата не указана */
  @ApiProperty({ nullable: true, type: Number })
  age: number | null;

  /**
   * Начало открытого эпизода пропажи (ISO); null, если питомец дома
   */
  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  lostAt: string | null;

  /** Сколько всего сообщений «видели питомца» */
  sightingsCount: number;

  /**
   * Сколько сообщений создано позже `sightingsSeenAt`; пока владелец их не
   * открывал (`sightingsSeenAt: null`) — все
   */
  newSightingsCount: number;

  /**
   * Когда владелец последний раз отметил сообщения просмотренными
   * (`POST /pets/:id/sightings/seen`); null — ни разу
   */
  @ApiProperty({ nullable: true, type: Date })
  sightingsSeenAt: Date | null;
}

export class PetWithPhotosDto extends PetDto {
  photos: PetPhotoDto[];
}

export class PetListItemDto extends PetDto {
  /** URL первого фото питомца — обложка для карточки списка */
  @ApiProperty({ nullable: true, type: String })
  coverUrl: string | null;
}

export class PaginatedPetsDto {
  items: PetListItemDto[];

  total: number;

  page: number;

  limit: number;
}
