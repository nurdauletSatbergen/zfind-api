import { ApiProperty } from '@nestjs/swagger';

export class SightingDto {
  id: number;

  petId: number;

  @ApiProperty({ nullable: true, type: Number })
  lat: number | null;

  @ApiProperty({ nullable: true, type: Number })
  lng: number | null;

  @ApiProperty({ nullable: true, type: String })
  address: string | null;

  @ApiProperty({ nullable: true, type: String })
  comment: string | null;

  @ApiProperty({ nullable: true, type: String })
  reporterPhone: string | null;

  createdAt: Date;

  @ApiProperty({ nullable: true, type: String })
  photoUrl: string | null;
}

export class SightingCreatedDto {
  id: number;
  createdAt: Date;
}
