import { ApiProperty } from '@nestjs/swagger';

export class UserDto {
  id: number;

  email: string;

  @ApiProperty({ nullable: true, type: String })
  name: string | null;

  @ApiProperty({ nullable: true, type: String })
  phone: string | null;

  createdAt: Date;

  updatedAt: Date;

  @ApiProperty({ nullable: true, type: Number })
  roleId: number | null;

  @ApiProperty({ nullable: true, type: Number })
  avatarId: number | null;
}
