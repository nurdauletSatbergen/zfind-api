import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MinLength } from 'class-validator';
import {
  KZ_PHONE_MESSAGE,
  KZ_PHONE_REGEX,
  normalizeKzPhone,
} from '../../../shared/utils/phone';

/**
 * Административное обновление пользователя.
 *
 * НАМЕРЕННО не `PartialType(CreateUserDto)`: через наследование в тело
 * попадали `password` (уходил в БД без хеширования) и `email` (смена
 * учётных данных без подтверждения адреса). Смена пароля и почты —
 * отдельные сценарии со своими проверками.
 */
export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  name?: string;

  @IsOptional()
  @Transform(({ value }) => normalizeKzPhone(value))
  @Matches(KZ_PHONE_REGEX, { message: KZ_PHONE_MESSAGE })
  phone?: string;
}
