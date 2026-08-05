import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MinLength } from 'class-validator';
import {
  KZ_PHONE_MESSAGE,
  KZ_PHONE_REGEX,
  normalizeKzPhone,
} from '../../../shared/utils/phone';

/**
 * Правка собственного профиля: пользователь берётся из токена, id в теле
 * и в URL не участвует.
 *
 * Список полей закрытый и намеренно не наследуется от `CreateUserDto`:
 * именно расширение через `PartialType` открыло дыру, в которой в тело
 * можно было положить `password` и `email`.
 */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  name?: string;

  /**
   * Контактный телефон для объявления о пропаже.
   * Пустая строка удаляет телефон.
   */
  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : normalizeKzPhone(value)))
  @Matches(KZ_PHONE_REGEX, { message: KZ_PHONE_MESSAGE })
  phone?: string | null;
}
