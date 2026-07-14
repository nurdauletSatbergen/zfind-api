import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './libs/database/prisma.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [ConfigModule.forRoot(), PrismaModule, UsersModule]
})
export class AppModule {}
