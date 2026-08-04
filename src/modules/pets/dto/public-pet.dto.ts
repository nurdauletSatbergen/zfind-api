import { ApiProperty } from '@nestjs/swagger';

export class PublicPetDto {
  publicCode: string;

  name: string;

  @ApiProperty({ enum: ['HOME', 'LOST'] })
  status: 'HOME' | 'LOST';

  photos: string[];

  recentlyFound: boolean;

  @ApiProperty({ enum: ['DOG', 'CAT', 'BIRD', 'OTHER'], nullable: true })
  species: 'DOG' | 'CAT' | 'BIRD' | 'OTHER' | null;

  /** Окрас — помогает нашедшему опознать питомца */
  @ApiProperty({ nullable: true, type: String })
  color: string | null;

  @ApiProperty({ enum: ['MALE', 'FEMALE'], nullable: true })
  sex: 'MALE' | 'FEMALE' | null;

  /** Полных лет; точная дата рождения публично не раскрывается */
  @ApiProperty({ nullable: true, type: Number })
  age: number | null;

  /** Особые приметы — ключевая информация для опознания */
  @ApiProperty({ nullable: true, type: String })
  traits: string | null;

  /** Вес в килограммах — помогает оценить размер животного */
  @ApiProperty({ nullable: true, type: Number })
  weightKg: number | null;

  /** Есть ли микрочип — сигнал нашедшему/клинике, что питомца можно отсканировать */
  @ApiProperty({ nullable: true, type: Boolean })
  hasMicrochip: boolean | null;

  /** только при status === 'LOST' */
  rewardAmount?: string | null;

  /** только при status === 'LOST' */
  ownerPhone?: string | null;

  /** только при status === 'LOST' */
  lostAt?: Date;
}
