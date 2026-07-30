import { Module } from '@nestjs/common';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsService } from './notifications.service';
import { PrismaModule } from '../../libs/database/prisma.module';

@Module({
  providers: [NotificationsGateway, NotificationsService],
  imports: [
    PrismaModule
  ]
})
export class NotificationsModule {}
