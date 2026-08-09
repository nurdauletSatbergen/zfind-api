import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';

export const FEED_DEFAULT_LIMIT = 20;
export const FEED_MAX_LIMIT = 100;
export const FEED_MAX_RADIUS_KM = 200;

export class PublicPetsQueryDto {
  /** Пока поддерживается только LOST; параметр оставлен на вырост */
  @IsOptional()
  @IsIn(['LOST'])
  status? = 'LOST' as const;

  /** Широта точки поиска; работает только вместе с lng и radius */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  /** Долгота точки поиска; работает только вместе с lat и radius */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;

  /** Радиус поиска в километрах; работает только вместе с lat и lng */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  @Max(FEED_MAX_RADIUS_KM)
  radius?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(FEED_MAX_LIMIT)
  limit?: number = FEED_DEFAULT_LIMIT;
}
