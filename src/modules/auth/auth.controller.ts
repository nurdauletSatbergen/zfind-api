import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { GetUser } from './decorators/get-user.decorator';
import { User } from '../../generated/prisma/client';
import { Public } from './decorators/public.decorator';
import type { JwtPayload } from './interfaces/jwt-payload.interface';
import { SignInDto } from './dto/sign-in.dto';
import { AuthTokenDto } from './dto/auth-token.dto';
import { ProfileDto } from './dto/profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  /**
   * Вход по email и паролю
   *
   * @remarks Возвращает JWT для заголовка `Authorization: Bearer <token>`.
   */
  @Public()
  @UseGuards(LocalAuthGuard)
  @ApiBody({ type: SignInDto })
  @ApiCreatedResponse({ type: AuthTokenDto })
  @Post('sign-in')
  signIn(@GetUser() user: Omit<User, 'password'>) {
    return this.authService.signIn(user);
  }

  /**
   * Регистрация нового пользователя
   *
   * @remarks Создаёт пользователя с ролью `user` и сразу возвращает JWT —
   * отдельный вход после регистрации не нужен.
   */
  @Public()
  @ApiCreatedResponse({ type: AuthTokenDto })
  @ApiConflictResponse({ description: 'Email already registered' })
  @Post('sign-up')
  signUp(@Body() createUserDto: CreateUserDto) {
    return this.authService.signUp(createUserDto);
  }

  /**
   * Профиль текущего пользователя
   *
   * @remarks Пользователь определяется по JWT. В ответе — настройки,
   * имя роли и плоский список прав.
   */
  @ApiBearerAuth()
  @ApiOkResponse({ type: ProfileDto })
  @Get('profile')
  getProfile(@GetUser() user: JwtPayload) {
    return this.authService.getProfile(user.id);
  }

  /**
   * Обновить свой профиль
   *
   * @remarks Пользователь определяется по JWT — id в URL не передаётся.
   * Меняются только имя и телефон; телефон нормализуется к виду
   * `+7XXXXXXXXXX`, пустая строка удаляет его. Ответ — тот же профиль,
   * что отдаёт `GET /auth/profile`.
   */
  @ApiBearerAuth()
  @ApiOkResponse({ type: ProfileDto })
  @Patch('profile')
  updateProfile(@GetUser() user: JwtPayload, @Body() dto: UpdateProfileDto) {
    return this.authService.updateProfile(user.id, dto);
  }

  /**
   * Сменить пароль
   *
   * @remarks Пользователь определяется по JWT. Требуется текущий пароль:
   * без него перехваченного токена хватало бы, чтобы запереть владельца
   * в собственном аккаунте. Неверный текущий пароль — `400`, а не `401`:
   * `401` означает «сессия истекла» и разлогинивает пользователя.
   * Выданные ранее токены после смены пароля остаются действительными.
   */
  @ApiBearerAuth()
  @ApiNoContentResponse({ description: 'Пароль изменён' })
  @ApiBadRequestResponse({ description: 'Текущий пароль неверен' })
  @HttpCode(204)
  @Patch('password')
  async changePassword(
    @GetUser() user: JwtPayload,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    await this.authService.changePassword(user.id, dto);
  }

  /**
   * Удалить свой аккаунт
   *
   * @remarks Необратимо. Требуется подтверждение текущим паролем.
   * Вместе с аккаунтом удаляются питомцы, их фотографии, сообщения
   * очевидцев, эпизоды пропажи и уведомления — включая файлы в хранилище.
   */
  @ApiBearerAuth()
  @ApiNoContentResponse({ description: 'Аккаунт удалён' })
  @ApiBadRequestResponse({ description: 'Пароль неверен' })
  @HttpCode(204)
  @Delete('account')
  async deleteAccount(
    @GetUser() user: JwtPayload,
    @Body() dto: DeleteAccountDto,
  ): Promise<void> {
    await this.authService.deleteAccount(user.id, dto);
  }
}
