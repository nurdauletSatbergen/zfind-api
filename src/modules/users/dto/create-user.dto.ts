import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import {
  KZ_PHONE_MESSAGE,
  KZ_PHONE_REGEX,
  normalizeKzPhone,
} from '../../../shared/utils/phone';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(3)
  name: string;

  @IsString()
  @MinLength(6)
  password: string;

  /** Контактный телефон владельца: подставляется в объявление о пропаже */
  @IsOptional()
  @Transform(({ value }) => normalizeKzPhone(value))
  @Matches(KZ_PHONE_REGEX, { message: KZ_PHONE_MESSAGE })
  phone?: string;
}
