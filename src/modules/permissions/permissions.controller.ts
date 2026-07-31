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
import { PermissionsService } from './permissions.service';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import { PermissionDto } from './dto/permission.dto';

@ApiTags('permissions')
@ApiBearerAuth()
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  /**
   * Создать право
   *
   * @remarks Имя уникально; конвенция — `ресурс:действие`,
   * например `pets:create`.
   */
  @Post()
  @ApiCreatedResponse({ type: PermissionDto })
  @ApiConflictResponse({ description: 'Permission name already exists' })
  create(@Body() createPermissionDto: CreatePermissionDto) {
    return this.permissionsService.create(createPermissionDto);
  }

  /**
   * Список всех прав
   */
  @Get()
  @ApiOkResponse({ type: PermissionDto, isArray: true })
  findAll() {
    return this.permissionsService.findAll();
  }

  /**
   * Право по id
   */
  @Get(':id')
  @ApiOkResponse({ type: PermissionDto })
  @ApiNotFoundResponse()
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const permission = await this.permissionsService.findOne({ id });
    if (!permission) throw new NotFoundException('Permission not found');
    return permission;
  }

  /**
   * Переименовать право
   */
  @Patch(':id')
  @ApiOkResponse({ type: PermissionDto })
  @ApiNotFoundResponse()
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updatePermissionDto: UpdatePermissionDto,
  ) {
    return this.permissionsService.update({
      where: { id },
      data: updatePermissionDto,
    });
  }

  /**
   * Удалить право
   *
   * @remarks Возвращает удалённую запись; у ролей это право снимается.
   */
  @Delete(':id')
  @ApiOkResponse({ type: PermissionDto })
  @ApiNotFoundResponse()
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.permissionsService.remove({ id });
  }
}
