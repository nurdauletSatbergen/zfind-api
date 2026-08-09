import { ApiProperty } from '@nestjs/swagger';

export class LostEpisodeDto {
  id: number;

  petId: number;

  lostAt: Date;

  @ApiProperty({ nullable: true, type: Date })
  foundAt: Date | null;

  /** Широта места пропажи; владельцу отдаётся без округления */
  @ApiProperty({ nullable: true, type: Number })
  lat: number | null;

  /** Долгота места пропажи; владельцу отдаётся без округления */
  @ApiProperty({ nullable: true, type: Number })
  lng: number | null;

  @ApiProperty({ nullable: true, type: String })
  address: string | null;

  /** Телефоны из объявления; пустой список = звонить владельцу */
  @ApiProperty({ type: [String] })
  contactPhones: string[];
}
