import { ApiProperty } from '@nestjs/swagger';

export class LostEpisodeDto {
  id: number;

  petId: number;

  lostAt: Date;

  @ApiProperty({ nullable: true, type: Date })
  foundAt: Date | null;
}
