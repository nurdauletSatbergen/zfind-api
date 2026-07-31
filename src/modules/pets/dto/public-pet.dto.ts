export interface PublicPetDto {
  publicCode: string;
  name: string;
  status: 'HOME' | 'LOST';
  photos: string[];
  recentlyFound: boolean;
  // только при status === 'LOST':
  rewardAmount?: string | null;
  ownerPhone?: string | null;
  lostAt?: Date;
}
