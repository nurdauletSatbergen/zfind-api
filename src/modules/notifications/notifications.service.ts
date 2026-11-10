import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../libs/database/prisma.service';
import { NotificationsGateway } from './notifications.gateway';
import {
  Prisma,
  NotificationType,
  type Notification,
} from '../../generated/prisma/client';
import { CreateBroadcastDto } from './dto/create-broadcast.dto';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { Cron, CronExpression } from '@nestjs/schedule';

export const NOTIFICATION_RETENTION_DAYS = 90;

@Injectable()
export class NotificationsService {
  constructor(
    private prisma: PrismaService,
    private gateway: NotificationsGateway,
  ) {}

  async findAllFor(userId: number, query: ListNotificationsQueryDto) {
    const { page, limit, type, unread } = query;
    // фильтры необязательные; `total` считается с теми же, что и список
    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(type ? { type } : {}),
      ...(unread ? { readAt: null } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
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
      select: { users: { select: { id: true } } },
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
      });

      // В сокет — каждому получателю, флаг `userSetting.notificationsOn`
      // здесь не проверяется (решение владельца 2026-11-05): экрана настроек
      // нет, а рассылка приходит без тоста — только счётчик. Поле остаётся в
      // базе под будущие push-уведомления.
      for (const n of created) {
        this.gateway.sendToUser(n.userId, this.toSocketPayload(n));
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

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupOld(): Promise<void> {
    const cutoff = new Date(
      Date.now() - NOTIFICATION_RETENTION_DAYS * 86_400_000,
    );
    await this.prisma.notification.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
  }

  // Адресное уведомление одному пользователю. В отличие от broadcast,
  // WS-эмит не гейтится notificationsOn — sighting критичен для владельца.
  async notifyUser(
    userId: number,
    input: {
      type: NotificationType;
      title: string;
      body: string;
      data?: Prisma.InputJsonValue;
    },
  ) {
    const notification = await this.prisma.notification.create({
      data: {
        userId,
        type: input.type,
        title: input.title,
        body: input.body,
        data: input.data,
      },
    });
    this.gateway.sendToUser(userId, this.toSocketPayload(notification));
    return notification;
  }

  // Событие сокета `notification` — ровно элемент списка `GET /notifications`
  // (`NotificationDto`), чтобы клиент вставлял его в список без запроса.
  private toSocketPayload(n: Notification) {
    return {
      id: n.id,
      userId: n.userId,
      type: n.type,
      title: n.title,
      body: n.body,
      data: n.data,
      readAt: n.readAt,
      createdAt: n.createdAt,
      broadcastId: n.broadcastId,
    };
  }
}
