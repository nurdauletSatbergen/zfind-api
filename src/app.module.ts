import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './libs/database/prisma.module';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { auth } from '../auth';

@Module({
  imports: [
    AuthModule.forRoot({ auth, disableGlobalAuthGuard: true }),
    PrismaModule,
    ConfigModule.forRoot({
      isGlobal: true
    }),
  ]
})
export class AppModule {}
