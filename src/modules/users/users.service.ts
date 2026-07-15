import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../libs/database/prisma.service';
import { User, Prisma } from '../../generated/prisma/client';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService
  ) {}

  async create(data: Prisma.UserCreateInput): Promise<User> {
    return this.prisma.user.create({ data })
  }

  findAll() {
    return this.prisma.user.findMany();
  }

  findOne(userWhereUniqueInput: Prisma.UserWhereUniqueInput): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: userWhereUniqueInput
    })
  }

  update(params: { where: Prisma.UserWhereUniqueInput; data: Prisma.UserUpdateInput; }) {
    const { where, data } = params;
    return this.prisma.user.update({ data, where });
  }

  remove(where: Prisma.UserWhereUniqueInput) {
    return this.prisma.user.delete({
      where
    })
  }
}
