import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, Min } from 'class-validator';

export class ChangeStatusDto {
  @IsIn(['HOME', 'LOST'])
  status: 'HOME' | 'LOST';

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  rewardAmount?: number;
}
