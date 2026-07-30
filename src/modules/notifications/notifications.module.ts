import { Module } from '@nestjs/common';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsService } from './notifications.service';
import { PrismaModule } from '../../libs/database/prisma.module';
import { NotificationsController } from './notifications.controller';
import { JwtModule } from '@nestjs/jwt';
import { jwtConstants } from '../auth/constants';

@Module({
  providers: [NotificationsGateway, NotificationsService],
  imports: [
    PrismaModule,
    JwtModule.register({ secret: jwtConstants.secret })
  ],
  controllers: [NotificationsController]
})
export class NotificationsModule {}
