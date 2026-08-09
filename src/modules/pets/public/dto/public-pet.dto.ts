import { ApiProperty } from '@nestjs/swagger';

export class PublicPetDto {
  publicCode: string;

  name: string;

  @ApiProperty({ enum: ['HOME', 'LOST'] })
  status: 'HOME' | 'LOST';

  photos: string[];

  recentlyFound: boolean;

  @ApiProperty({ enum: ['DOG', 'CAT', 'BIRD', 'OTHER'], nullable: true })
  species: 'DOG' | 'CAT' | 'BIRD' | 'OTHER' | null;

  /** Окрас — помогает нашедшему опознать питомца */
  @ApiProperty({ nullable: true, type: String })
  color: string | null;

  @ApiProperty({ enum: ['MALE', 'FEMALE'], nullable: true })
  sex: 'MALE' | 'FEMALE' | null;

  /** Полных лет; точная дата рождения публично не раскрывается */
  @ApiProperty({ nullable: true, type: Number })
  age: number | null;

  /** Особые приметы — ключевая информация для опознания */
  @ApiProperty({ nullable: true, type: String })
  traits: string | null;

  /** Вес в килограммах — помогает оценить размер животного */
  @ApiProperty({ nullable: true, type: Number })
  weightKg: number | null;

  /** Есть ли микрочип — сигнал нашедшему/клинике, что питомца можно отсканировать */
  @ApiProperty({ nullable: true, type: Boolean })
  hasMicrochip: boolean | null;

  /** только при status === 'LOST' */
  rewardAmount?: string | null;

  /**
   * Телефоны для связи, только при status === 'LOST'.
   * Берутся из объявления; если владелец их не указал — его собственный номер.
   * Пустой список означает, что связаться напрямую нельзя.
   */
  @ApiProperty({ type: [String], required: false })
  contactPhones?: string[];

  /** только при status === 'LOST' */
  lostAt?: Date;

  /**
   * Широта места пропажи, только при status === 'LOST'.
   * Округлена до ~110 м: район поиска нужен, точный адрес владельца — нет.
   */
  @ApiProperty({ nullable: true, type: Number, required: false })
  lostLat?: number | null;

  /** Долгота места пропажи, округлена так же, как lostLat */
  @ApiProperty({ nullable: true, type: Number, required: false })
  lostLng?: number | null;

  /** Место пропажи словами, как его описал владелец */
  @ApiProperty({ nullable: true, type: String, required: false })
  lostAddress?: string | null;
}

/**
 * Элемент публичной ленты пропавших. Отличается от карточки: одна обложка
 * вместо всех фото и НЕТ contactPhones — телефоны показываются только на
 * странице конкретного питомца, чтобы список нельзя было выкачать ради номеров.
 */
export class PublicPetListItemDto {
  publicCode: string;

  name: string;

  /** Обложка — первое фото питомца */
  @ApiProperty({ nullable: true, type: String })
  coverUrl: string | null;

  @ApiProperty({ enum: ['DOG', 'CAT', 'BIRD', 'OTHER'], nullable: true })
  species: 'DOG' | 'CAT' | 'BIRD' | 'OTHER' | null;

  @ApiProperty({ nullable: true, type: String })
  color: string | null;

  @ApiProperty({ enum: ['MALE', 'FEMALE'], nullable: true })
  sex: 'MALE' | 'FEMALE' | null;

  @ApiProperty({ nullable: true, type: Number })
  age: number | null;

  @ApiProperty({ nullable: true, type: String })
  traits: string | null;

  @ApiProperty({ nullable: true, type: Number })
  weightKg: number | null;

  @ApiProperty({ nullable: true, type: Boolean })
  hasMicrochip: boolean | null;

  @ApiProperty({ nullable: true, type: String })
  rewardAmount: string | null;

  lostAt: Date;

  /** Округлена до ~110 м, как на карточке */
  @ApiProperty({ nullable: true, type: Number })
  lostLat: number | null;

  /** Округлена до ~110 м, как на карточке */
  @ApiProperty({ nullable: true, type: Number })
  lostLng: number | null;

  @ApiProperty({ nullable: true, type: String })
  lostAddress: string | null;

  /**
   * Расстояние от переданной точки в километрах, округлено до 100 м.
   * null, если гео-параметры не переданы или у объявления нет координат.
   */
  @ApiProperty({ nullable: true, type: Number })
  distanceKm: number | null;
}

export class PaginatedPublicPetsDto {
  items: PublicPetListItemDto[];

  total: number;

  page: number;

  limit: number;
}
