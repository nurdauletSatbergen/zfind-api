import { Module } from '@nestjs/common';
import { PetsService } from './pets.service';
import { PetsController } from './pets.controller';
import { PrismaModule } from '../../libs/database/prisma.module';

@Module({
  controllers: [PetsController],
  providers: [PetsService],
  imports: [PrismaModule]
})
export class PetsModule {}
