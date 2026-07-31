import { Module } from '@nestjs/common';
import { PetsService } from './pets.service';
import { PetsController } from './pets.controller';
import { PrismaModule } from '../../libs/database/prisma.module';
import { UsersModule } from '../users/users.module';
import { FilesModule } from '../files/files.module';
import { LostModeService } from './lost-mode.service';
import { SightingsService } from './sightings.service';
import { PetsPublicController } from './pets-public.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  controllers: [PetsController, PetsPublicController],
  providers: [PetsService, LostModeService, SightingsService],
  imports: [PrismaModule, UsersModule, FilesModule, NotificationsModule],
})
export class PetsModule {}
