import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
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
}
