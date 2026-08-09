import { Module } from '@nestjs/common';
import { PetsService } from './core/pets.service';
import { PetsController } from './core/pets.controller';
import { PrismaModule } from '../../libs/database/prisma.module';
import { UsersModule } from '../users/users.module';
import { FilesModule } from '../files/files.module';
import { LostModeService } from './lost-mode/lost-mode.service';
import { SightingsService } from './sightings/sightings.service';
import { PetsPublicController } from './public/pets-public.controller';
import { PublicPetsService } from './public/public-pets.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  controllers: [PetsController, PetsPublicController],
  providers: [
    PetsService,
    LostModeService,
    SightingsService,
    PublicPetsService,
  ],
  imports: [PrismaModule, UsersModule, FilesModule, NotificationsModule],
})
export class PetsModule {}
