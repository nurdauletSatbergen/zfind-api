import { PartialType, PickType } from '@nestjs/swagger';
import { CreateRoleDto } from './create-role.dto';

export class UpdateRoleDto extends PartialType(
  PickType(CreateRoleDto, ['name'] as const),
) {}
