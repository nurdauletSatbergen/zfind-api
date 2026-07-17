import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../libs/database/prisma.service';
import { User, Prisma } from '../../generated/prisma/client';

type UserWithSettings = Prisma.UserGetPayload<{
  include: {
    userSetting: {
      select: {
        smsEnabled: true,
        notificationsOn: true
      }
    },
    pets: true
  }
}>;


@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService
  ) {}

  async create(data: Prisma.UserCreateInput): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { email: data.email } });
    if (user) throw new ConflictException('User with this email already exists');

    try {
      return await this.prisma.user.create({
        data: {
          ...data,
          userSetting: {
            create: {
              smsEnabled: false,
              notificationsOn: false
            }
          }
        }
      })
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('User with this email already exists');
      }
      throw e;
    }
  }

  findAll(): Promise<User[]> {
    return this.prisma.user.findMany({
      include: {
        userSetting: true
      }
    });
  }

  async findOne(where: Prisma.UserWhereUniqueInput): Promise<UserWithSettings | null> {
    return this.prisma.user.findUnique({
      where,
      include: {
        userSetting: {
          select: {
            smsEnabled: true,
            notificationsOn: true
          }
        },
        pets: true
      }
    });
  }

  async update(params: { where: Prisma.UserWhereUniqueInput; data: Prisma.UserUpdateInput }): Promise<User> {
    const { where, data } = params;
    const user = await this.findOne(where);
    if (!user) throw new NotFoundException(`User with ID ${ where.id } not found`);
    return this.prisma.user.update({ data, where });
  }

  async remove(where: Prisma.UserWhereUniqueInput): Promise<User> {
    const user = await this.findOne(where);
    if (!user) throw new NotFoundException(`User with ID ${ where.id } not found`);
    return this.prisma.user.delete({ where });
  }

  async updateUserSettings(userId: number, data: Prisma.UserSettingUpdateInput) {
    const user = await this.findOne({ id: userId });
    if (!user) throw new NotFoundException(`User with ID ${ userId} not found`);

    console.log(user)
    if (!user.userSetting) throw new BadRequestException('Bad request');

    return this.prisma.userSetting.update({
      where: { userId },
      data
    })
  }
}
