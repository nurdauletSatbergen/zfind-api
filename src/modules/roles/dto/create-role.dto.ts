import { IsArray, IsInt, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateRoleDto {
  @IsString()
  @MinLength(3)
  name: string;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  permissionIds?: number[];
}
