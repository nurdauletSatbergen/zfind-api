import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateBroadcastDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  body: string;

  @IsString()
  @IsNotEmpty()
  roleName: string;

  @IsObject()
  @IsOptional()
  data?: Record<string, unknown>;
}
