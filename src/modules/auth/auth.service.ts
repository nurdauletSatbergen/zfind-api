import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { hash, compare } from 'bcrypt';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { JwtService } from '@nestjs/jwt';
import { Prisma, User } from '../../generated/prisma/client';
import { JwtPayload } from './interfaces/jwt-payload.interface';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService
  ) {}


  async validateUser(email: string, pass: string): Promise<Omit<User, "password"> | null> {
    const user = await this.usersService.findOne({ email });
    if (user && await compare(pass, user.password)) {
      const { password, ...result } = user;
      return result;
    }

    return null;
  }

  async signIn(user: Omit<User, "password">) {
    const payload: JwtPayload = { id: user.id, email: user.email };
    return {
      access_token: this.jwtService.sign(payload)
    }
  }


  async signUp(createUserDto: CreateUserDto) {
    const hashedPassword = await hash(createUserDto.password, 10);
    try {
      const user = await this.usersService.create({
        ...createUserDto,
        password: hashedPassword,
        role: {
          connect: { name: 'user' }
        }
      });
      const payload: JwtPayload = { id: user.id, email: user.email };
      return {
        access_token: this.jwtService.sign(payload)
      }
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        throw new InternalServerErrorException('Default role "user" not found — run "npx prisma db seed"');
      }
      throw e;
    }
  }

}
