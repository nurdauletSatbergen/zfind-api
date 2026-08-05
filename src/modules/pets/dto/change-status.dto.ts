import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDate,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxDate,
  MaxLength,
  Min,
} from 'class-validator';
import {
  KZ_PHONE_MESSAGE,
  KZ_PHONE_REGEX,
  normalizeKzPhone,
} from '../../../shared/utils/phone';

export const MAX_CONTACT_PHONES = 3;

export class ChangeStatusDto {
  @IsIn(['HOME', 'LOST'])
  status: 'HOME' | 'LOST';

  /** Вознаграждение нашедшему; допустимо только при переходе в LOST */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  rewardAmount?: number;

  /** Когда питомец пропал; по умолчанию — текущее время */
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  @MaxDate(new Date(), { message: 'lostAt не может быть в будущем' })
  lostAt?: Date;

  /** Широта предполагаемого места пропажи; передаётся вместе с lng */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  /** Долгота предполагаемого места пропажи; передаётся вместе с lat */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;

  /** Человекочитаемое место: «Алматы, парк Первого Президента» */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  /** Телефоны для объявления; если не передать — покажем телефон владельца */
  @IsOptional()
  @Transform(({ value }): unknown =>
    Array.isArray(value) ? (value as unknown[]).map(normalizeKzPhone) : value,
  )
  @IsArray()
  @ArrayMaxSize(MAX_CONTACT_PHONES)
  @Matches(KZ_PHONE_REGEX, { each: true, message: KZ_PHONE_MESSAGE })
  contactPhones?: string[];
}
