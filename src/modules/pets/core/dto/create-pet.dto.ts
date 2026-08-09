import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxDate,
  MaxLength,
  Min,
} from 'class-validator';

export class CreatePetDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsIn(['DOG', 'CAT', 'BIRD', 'OTHER'])
  species?: 'DOG' | 'CAT' | 'BIRD' | 'OTHER';

  /** Окрас в свободной форме, например «рыжий с белой грудкой» */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  color?: string;

  @IsOptional()
  @IsIn(['MALE', 'FEMALE'])
  sex?: 'MALE' | 'FEMALE';

  /** Дата рождения (может быть приблизительной) — возраст вычисляется из неё */
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  @MaxDate(new Date(), { message: 'birthDate must be in the past' })
  birthDate?: Date;

  /** Особые приметы: шрамы, повадки, ошейник — помогают опознать питомца */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  traits?: string;

  /** Вес в килограммах */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(200)
  weightKg?: number;

  /** Есть ли микрочип; не передано = неизвестно */
  @IsOptional()
  @IsBoolean()
  hasMicrochip?: boolean;
}
