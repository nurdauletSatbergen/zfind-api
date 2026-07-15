import { ConflictException, Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { hash } from 'bcrypt';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { JwtService } from '@nestjs/jwt';
import { User } from '../../generated/prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService
  ) {}


  async validateUser(email: string, pass: string): Promise<Omit<User, "password"> | null> {
    const user = await this.usersService.findOne({ email });
    if (user && user.password == pass) {
      const { password, ...result } = user;
      return result;
    }

    return null;
  }

  async signIn(payload: Omit<User, "password">) {
    return {
      access_token: this.jwtService.sign(payload)
    }
  }


  async signUp(createUserDto: CreateUserDto) {
    const existingUser = await this.usersService.findOne({ email: createUserDto.email });
    if (existingUser) throw new ConflictException(`User with email ${createUserDto.email} already exists`);
    const hashedPassword = await hash(createUserDto.password, 10);
    const user = await this.usersService.create({
      ...createUserDto,
      password: hashedPassword
    });

    const { password, ...payload } = user;

    return {
      access_token: this.jwtService.sign(payload)
    }
  }

}
