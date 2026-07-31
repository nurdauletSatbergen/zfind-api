import { ApiProperty } from '@nestjs/swagger';

export class PetDto {
  id: number;

  name: string;

  ownerId: number;

  @ApiProperty({ enum: ['HOME', 'LOST'] })
  status: 'HOME' | 'LOST';

  publicCode: string;

  @ApiProperty({ nullable: true, type: String })
  rewardAmount: string | null;
}
