import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { GetUser } from './decorators/get-user.decorator';
import { User } from '../../generated/prisma/client';
import { Public } from './decorators/public.decorator';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService
  ) {}

  @Public()
  @UseGuards(LocalAuthGuard)
  @Post('sign-in')
  signIn(@GetUser() user: Omit<User, "password">) {
    return this.authService.signIn(user);
  }

  @Public()
  @Post('sign-up')
  signUp(@Body() createUserDto: CreateUserDto) {
    return this.authService.signUp(createUserDto);
  }
}
