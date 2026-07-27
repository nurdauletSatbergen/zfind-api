import { Module } from '@nestjs/common';
import { PetsService } from './pets.service';
import { PetsController } from './pets.controller';
import { PrismaModule } from '../../libs/database/prisma.module';
import { UsersModule } from '../users/users.module';
import { FilesModule } from '../files/files.module';

@Module({
  controllers: [PetsController],
  providers: [PetsService],
  imports: [PrismaModule, UsersModule, FilesModule]
})
export class PetsModule {}
