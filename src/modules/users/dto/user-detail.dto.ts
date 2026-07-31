import { ApiProperty } from '@nestjs/swagger';
import { UserDto } from './user.dto';
import { UserSettingDto } from './user-setting.dto';
import { PetDto } from '../../pets/dto/pet.dto';

export class UserSettingSummaryDto {
  smsEnabled: boolean;
  notificationsOn: boolean;
}

export class PermissionNameDto {
  name: string;
}

export class UserRoleDto {
  name: string;
  permissions: PermissionNameDto[];
}

export class UserWithSettingDto extends UserDto {
  @ApiProperty({ nullable: true, type: UserSettingDto })
  userSetting: UserSettingDto | null;
}

export class UserDetailDto extends UserDto {
  @ApiProperty({ nullable: true, type: UserSettingSummaryDto })
  userSetting: UserSettingSummaryDto | null;

  pets: PetDto[];

  @ApiProperty({ nullable: true, type: UserRoleDto })
  role: UserRoleDto | null;
}
