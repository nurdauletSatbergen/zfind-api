import { PermissionDto } from '../../permissions/dto/permission.dto';

export class RoleDto {
  id: number;
  name: string;
  permissions: PermissionDto[];
}
