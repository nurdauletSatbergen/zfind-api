import { ApiProperty } from '@nestjs/swagger';
import { UserDto } from '../../users/dto/user.dto';

export class ProfileSettingDto {
  smsEnabled: boolean;
  notificationsOn: boolean;
}

export class ProfileDto extends UserDto {
  @ApiProperty({ nullable: true, type: ProfileSettingDto })
  userSetting: ProfileSettingDto | null;

  @ApiProperty({ nullable: true, type: String })
  role: string | null;

  permissions: string[];
}
