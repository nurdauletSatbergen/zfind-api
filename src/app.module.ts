import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './libs/database/prisma.module';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { PetsModule } from './modules/pets/pets.module';
import { RolesModule } from './modules/roles/roles.module';
import { PermissionsModule } from './modules/permissions/permissions.module';

@Module({
  imports: [
    ConfigModule.forRoot(),
    PrismaModule,
    UsersModule,
    AuthModule,
    PetsModule,
    RolesModule,
    PermissionsModule,
  ]
})
export class AppModule {}
