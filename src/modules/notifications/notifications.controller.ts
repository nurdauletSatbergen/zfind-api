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
import { NotificationsService } from './notifications.service';
import { CreateBroadcastDto } from './dto/create-broadcast.dto';
import { GetUser } from '../auth/decorators/get-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { PermissionsGuard } from '../../shared/guards/permissions.guard';
import { RequirePermissions } from '../../shared/decorators/require-permissions.decorator';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  // --- админские (permission notifications:broadcast) ---
  @Post('broadcasts')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('notifications:broadcast')
  createBroadcast(
    @GetUser() user: JwtPayload,
    @Body() dto: CreateBroadcastDto,
  ) {
    return this.notificationsService.broadcast(user.id, dto);
  }

  @Get('broadcasts')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('notifications:broadcast')
  listBroadcasts() {
    return this.notificationsService.listBroadcasts();
  }

  @Delete('broadcasts/:id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('notifications:broadcast')
  recallBroadcast(@Param('id', ParseIntPipe) id: number) {
    return this.notificationsService.recallBroadcast(id);
  }

  // --- пользовательские ---

  @Get('unread-count')
  unreadCount(@GetUser() user: JwtPayload) {
    return this.notificationsService.unreadCount(user.id);
  }

  @Patch('read-all')
  markAllRead(@GetUser() user: JwtPayload) {
    return this.notificationsService.markAllRead(user.id);
  }

  @Get()
  findAll(
    @GetUser() user: JwtPayload,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.notificationsService.findAllFor(user.id, page, limit);
  }

  @Patch(':id/read')
  @HttpCode(204)
  async markRead(
    @GetUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.notificationsService.markRead(user.id, id);
  }

  @Delete(':id')
  @HttpCode(204)
  async removeOne(
    @GetUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.notificationsService.removeOne(user.id, id);
  }

  @Delete()
  removeAll(@GetUser() user: JwtPayload, @Query('read') read?: string) {
    return this.notificationsService.removeAll(user.id, read === 'true');
  }
}
