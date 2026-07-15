import { ConflictException, Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { hash } from 'bcrypt';
import { CreateUserDto } from '../users/dto/create-user.dto';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService
  ) {}


  async validateUser(email: string, pass: string): Promise<any> {
    const user = await this.usersService.findOne({ email });
    if (user && user.password == pass) {
      const { password, ...result } = user;
      return result;
    }

    return null;
  }


  async signUp(createUserDto: CreateUserDto) {
    const existingUser = await this.usersService.findOne({ email: createUserDto.email });
    if (existingUser) throw new ConflictException(`User with email ${createUserDto.email} already exists`);

    const user = await this.usersService.create(createUserDto);

    return {

    }
  }

}
