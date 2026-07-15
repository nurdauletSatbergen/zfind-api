import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { AuthGuard } from '@nestjs/passport';
import { Request } from '@nestjs/common';

@Controller('auth')
export class AuthController {
  @UseGuards(AuthGuard('local'))
  @Post('sign-in')
  signIn(@Request() req) {
    return req.user;
  }

  @Post('sign-up')
  signUp(@Body() body: CreateUserDto) {}


}
