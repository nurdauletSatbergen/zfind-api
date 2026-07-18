import { PartialType, PickType } from '@nestjs/mapped-types';
import { CreateRoleDto } from './create-role.dto';

export class UpdateRoleDto extends PartialType(PickType(CreateRoleDto, ['name'] as const)) {}
