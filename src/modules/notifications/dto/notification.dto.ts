import { ApiProperty } from '@nestjs/swagger';

export class NotificationDto {
  id: number;

  userId: number;

  @ApiProperty({ enum: ['ANNOUNCEMENT', 'SIGHTING'] })
  type: 'ANNOUNCEMENT' | 'SIGHTING';

  title: string;

  body: string;

  /**
   * Полезная нагрузка под тип уведомления.
   * Для `SIGHTING`: `{ petId, sightingId, lat, lng }`.
   */
  @ApiProperty({ nullable: true, type: Object })
  data: Record<string, unknown> | null;

  @ApiProperty({ nullable: true, type: Date })
  readAt: Date | null;

  createdAt: Date;

  /** Заполнен, если уведомление пришло из массовой рассылки */
  @ApiProperty({ nullable: true, type: Number })
  broadcastId: number | null;
}

export class PaginatedNotificationsDto {
  items: NotificationDto[];

  total: number;

  page: number;

  limit: number;
}

export class UnreadCountDto {
  count: number;
}

/** Сколько записей затронула массовая операция */
export class AffectedCountDto {
  count: number;
}

export class BroadcastDto {
  id: number;

  title: string;

  body: string;

  roleName: string;

  /** Сколько пользователей получили рассылку */
  recipients: number;

  @ApiProperty({ nullable: true, type: Number })
  createdById: number | null;

  @ApiProperty({ nullable: true, type: Date })
  recalledAt: Date | null;

  createdAt: Date;
}

export class BroadcastCreatedDto {
  id: number;

  recipients: number;
}

export class BroadcastRecalledDto {
  /** Сколько уведомлений удалено при отзыве рассылки */
  removed: number;
}
