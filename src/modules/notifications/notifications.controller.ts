import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { CreateBroadcastDto } from './dto/create-broadcast.dto';
import { GetUser } from '../auth/decorators/get-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { PermissionsGuard } from '../../shared/guards/permissions.guard';
import { RequirePermissions } from '../../shared/decorators/require-permissions.decorator';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * Разослать объявление роли
   *
   * @remarks Требует право `notifications:broadcast`. Создаёт уведомление
   * каждому пользователю указанной роли и шлёт его в realtime через
   * WebSocket.
   */
  @Post('broadcasts')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('notifications:broadcast')
  createBroadcast(
    @GetUser() user: JwtPayload,
    @Body() dto: CreateBroadcastDto,
  ) {
    return this.notificationsService.broadcast(user.id, dto);
  }

  /**
   * История рассылок
   *
   * @remarks Требует право `notifications:broadcast`.
   */
  @Get('broadcasts')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('notifications:broadcast')
  listBroadcasts() {
    return this.notificationsService.listBroadcasts();
  }

  /**
   * Отозвать рассылку
   *
   * @remarks Требует право `notifications:broadcast`. Удаляет уведомления
   * этой рассылки у получателей.
   */
  @Delete('broadcasts/:id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('notifications:broadcast')
  recallBroadcast(@Param('id', ParseIntPipe) id: number) {
    return this.notificationsService.recallBroadcast(id);
  }

  /**
   * Количество непрочитанных уведомлений
   */
  @Get('unread-count')
  unreadCount(@GetUser() user: JwtPayload) {
    return this.notificationsService.unreadCount(user.id);
  }

  /**
   * Отметить все уведомления прочитанными
   */
  @Patch('read-all')
  markAllRead(@GetUser() user: JwtPayload) {
    return this.notificationsService.markAllRead(user.id);
  }

  /**
   * Уведомления текущего пользователя
   *
   * @remarks Постранично, от новых к старым: `page` (с 1) и
   * `limit` (по умолчанию 20).
   */
  @Get()
  findAll(
    @GetUser() user: JwtPayload,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.notificationsService.findAllFor(user.id, page, limit);
  }

  /**
   * Отметить уведомление прочитанным
   */
  @Patch(':id/read')
  @HttpCode(204)
  async markRead(
    @GetUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.notificationsService.markRead(user.id, id);
  }

  /**
   * Удалить уведомление
   */
  @Delete(':id')
  @HttpCode(204)
  async removeOne(
    @GetUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.notificationsService.removeOne(user.id, id);
  }

  /**
   * Удалить уведомления пользователя
   *
   * @remarks Без параметров удаляет все; с `?read=true` — только
   * прочитанные.
   */
  @Delete()
  removeAll(@GetUser() user: JwtPayload, @Query('read') read?: string) {
    return this.notificationsService.removeAll(user.id, read === 'true');
  }
}
