import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Permission, Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../libs/database/prisma.service';

@Injectable()
export class PermissionsService {
  constructor(
    private prisma: PrismaService
  ) {}

  async create(data: Prisma.PermissionCreateInput) {
    try {
      return await this.prisma.permission.create({ data });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Permission with this name already exists');
      }
      throw e;
    }
  }

  findAll() {
    return this.prisma.permission.findMany();
  }

  findOne(where: Prisma.PermissionWhereUniqueInput) {
    return this.prisma.permission.findUnique({ where })
  }

  async update(
    { data, where}: { where: Prisma.PermissionWhereUniqueInput, data: Prisma.PermissionUpdateInput}
  ): Promise<Permission> {
    try {
      return await this.prisma.permission.update({ data, where });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        throw new NotFoundException('Permission not found');
      }
      throw e;
    }
  }

  async remove(where: Prisma.PermissionWhereUniqueInput): Promise<Permission> {
    try {
      return await this.prisma.permission.delete({ where });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        throw new NotFoundException('Permission not found');
      }
      throw e;
    }
  }
}
