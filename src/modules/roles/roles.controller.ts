import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseIntPipe,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { SetRolePermissionsDto } from './dto/set-role-permissions.dto';
import { RoleDto } from './dto/role.dto';

@ApiTags('roles')
@ApiBearerAuth()
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Post()
  @ApiCreatedResponse({ type: RoleDto })
  @ApiConflictResponse({ description: 'Role name already exists' })
  @ApiNotFoundResponse({ description: 'One of the permissions not found' })
  create(@Body() createRoleDto: CreateRoleDto) {
    return this.rolesService.create(createRoleDto);
  }

  @Get()
  @ApiOkResponse({ type: RoleDto, isArray: true })
  findAll() {
    return this.rolesService.findAll();
  }

  @Get(':id')
  @ApiOkResponse({ type: RoleDto })
  @ApiNotFoundResponse()
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const role = await this.rolesService.findOne({ id });
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }

  @Patch(':id/permissions')
  @ApiOkResponse({ type: RoleDto })
  @ApiNotFoundResponse()
  setPermissions(
    @Param('id', ParseIntPipe) id: number,
    @Body() setRolePermissionsDto: SetRolePermissionsDto,
  ) {
    return this.rolesService.setPermissions(
      id,
      setRolePermissionsDto.permissionIds,
    );
  }

  @Patch(':id')
  @ApiOkResponse({ type: RoleDto })
  @ApiNotFoundResponse()
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateRoleDto: UpdateRoleDto,
  ) {
    return this.rolesService.update({
      where: { id },
      data: updateRoleDto,
    });
  }

  @Delete(':id')
  @ApiOkResponse({ type: RoleDto })
  @ApiNotFoundResponse()
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.rolesService.remove({ id });
  }
}
