import { IsNotEmpty, IsString } from 'class-validator';

export class DeleteAccountDto {
  /** Текущий пароль: удаление необратимо, одного токена мало */
  @IsString()
  @IsNotEmpty()
  password: string;
}
