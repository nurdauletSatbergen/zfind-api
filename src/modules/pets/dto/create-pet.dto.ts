import { Type } from 'class-transformer';
import {
  IsDate,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxDate,
  MaxLength,
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
}
