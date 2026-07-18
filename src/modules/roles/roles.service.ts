import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../libs/database/prisma.service';

@Injectable()
export class RolesService {
  constructor(
    private prisma: PrismaService
  ) {}

  async create({ permissionIds, ...data }: { name: string; permissionIds?: number[] }) {
    try {
      return await this.prisma.role.create({
        data: {
          ...data,
          permissions: {
            connect: (permissionIds ?? []).map((id) => ({ id }))
          }
        },
        include: { permissions: true }
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Role with this name already exists');
      }
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        throw new NotFoundException('One of the permissions not found');
      }
      throw e;
    }
  }

  findAll() {
    return this.prisma.role.findMany({
      include: { permissions: true }
    });
  }

  findOne(where: Prisma.RoleWhereUniqueInput) {
    return this.prisma.role.findUnique({
      where,
      include: { permissions: true }
    });
  }

  async update(
    { where, data }: { where: Prisma.RoleWhereUniqueInput, data: Prisma.RoleUpdateInput }
  ) {
    try {
      return await this.prisma.role.update({ where, data });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        throw new NotFoundException('Role not found');
      }
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Role with this name already exists');
      }
      throw e;
    }
  }

  async setPermissions(id: number, permissionIds: number[]) {
    try {
      return await this.prisma.role.update({
        where: { id },
        data: {
          permissions: { set: permissionIds.map((pid) => ({ id: pid })) }
        },
        include: { permissions: true }
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        throw new NotFoundException('Role or one of the permissions not found');
      }
      throw e;
    }
  }

  async remove(where: Prisma.RoleWhereUniqueInput) {
    try {
      return await this.prisma.role.delete({ where });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        throw new NotFoundException('Role not found');
      }
      throw e;
    }
  }
}
