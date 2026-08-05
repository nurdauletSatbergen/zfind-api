import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  /** Текущий пароль — подтверждение, что аккаунтом управляет владелец */
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @IsString()
  @MinLength(6)
  newPassword: string;
}
