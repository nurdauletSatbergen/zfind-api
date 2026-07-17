import { IsString, Matches } from 'class-validator';

export class CreatePermissionDto {
  @IsString()
  @Matches(/^[a-z]+:[a-z-]+$/, {
    message: 'Permission name must look like "resource:action"',
  })
  name: string;
}
