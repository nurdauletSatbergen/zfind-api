import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../libs/database/prisma.service';
import { NotificationsGateway } from './notifications.gateway';
import { Prisma } from '../../generated/prisma/client';
import { CreateBroadcastDto } from './dto/create-broadcast.dto';

@Injectable()
export class NotificationsService {
  constructor(
    private prisma: PrismaService,
    private gateway: NotificationsGateway
  ) {}

  async findAllFor(userId: number, page: number, limit: number) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.notification.count({ where: { userId } }),
    ]);
    return { items, total, page, limit };
  }

  async unreadCount(userId: number): Promise<{ count: number }> {
    const count = await this.prisma.notification.count({
      where: { userId, readAt: null },
    });
    return { count };
  }

  async markRead(userId: number, id: number): Promise<void> {
    // идемпотентно: чужая, прочитанная или несуществующая строка — no-op
    await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  markAllRead(userId: number): Promise<{ count: number }> {
    return this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  async removeOne(userId: number, id: number): Promise<void> {
    const { count } = await this.prisma.notification.deleteMany({
      where: { id, userId },
    });
    if (count === 0) throw new NotFoundException('Notification not found');
  }

  removeAll(userId: number, onlyRead: boolean): Promise<{ count: number }> {
    return this.prisma.notification.deleteMany({
      where: { userId, ...(onlyRead ? { readAt: { not: null } } : {}) },
    });
  }

  async broadcast(createdById: number, dto: CreateBroadcastDto) {
    const role = await this.prisma.role.findUnique({
      where: { name: dto.roleName },
      select: {
        users: {
          select: {
            id: true,
            userSetting: { select: { notificationsOn: true } },
          },
        },
      },
    });
    if (!role) throw new NotFoundException('Role not found');

    const broadcast = await this.prisma.broadcast.create({
      data: {
        title: dto.title,
        body: dto.body,
        roleName: dto.roleName,
        recipients: role.users.length,
        createdById,
      },
    });

    if (role.users.length > 0) {
      const created = await this.prisma.notification.createManyAndReturn({
        data: role.users.map((u) => ({
          userId: u.id,
          title: dto.title,
          body: dto.body,
          data: (dto.data ?? undefined) as Prisma.InputJsonValue | undefined,
          broadcastId: broadcast.id,
        })),
        select: { id: true, userId: true },
      });

      const idByUser = new Map(created.map((n) => [n.userId, n.id]));
      for (const u of role.users) {
        if (!u.userSetting?.notificationsOn) continue;
        this.gateway.sendToUser(u.id, {
          id: idByUser.get(u.id),
          type: 'ANNOUNCEMENT',
          title: dto.title,
          body: dto.body,
          data: dto.data ?? null,
          createdAt: broadcast.createdAt,
        });
      }
    }

    return { id: broadcast.id, recipients: role.users.length };
  }

  listBroadcasts() {
    return this.prisma.broadcast.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async recallBroadcast(id: number): Promise<{ removed: number }> {
    const broadcast = await this.prisma.broadcast.findUnique({ where: { id } });
    if (!broadcast) throw new NotFoundException('Broadcast not found');
    if (broadcast.recalledAt) {
      throw new ConflictException('Broadcast already recalled');
    }

    const [{ count }] = await this.prisma.$transaction([
      this.prisma.notification.deleteMany({ where: { broadcastId: id } }),
      this.prisma.broadcast.update({
        where: { id },
        data: { recalledAt: new Date() },
      }),
    ]);
    return { removed: count };
  }
}
