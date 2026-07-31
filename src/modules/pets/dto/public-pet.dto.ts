import { ApiProperty } from '@nestjs/swagger';

export class PublicPetDto {
  publicCode: string;

  name: string;

  @ApiProperty({ enum: ['HOME', 'LOST'] })
  status: 'HOME' | 'LOST';

  photos: string[];

  recentlyFound: boolean;

  /** только при status === 'LOST' */
  rewardAmount?: string | null;

  /** только при status === 'LOST' */
  ownerPhone?: string | null;

  /** только при status === 'LOST' */
  lostAt?: Date;
}
