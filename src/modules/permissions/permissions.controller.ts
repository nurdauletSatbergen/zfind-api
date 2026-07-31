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

  @Post()
  @ApiCreatedResponse({ type: PermissionDto })
  create(@Body() createPermissionDto: CreatePermissionDto) {
    return this.permissionsService.create(createPermissionDto);
  }

  @Get()
  @ApiOkResponse({ type: PermissionDto, isArray: true })
  findAll() {
    return this.permissionsService.findAll();
  }

  @Get(':id')
  @ApiOkResponse({ type: PermissionDto })
  @ApiNotFoundResponse()
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const permission = await this.permissionsService.findOne({ id });
    if (!permission) throw new NotFoundException('Permission not found');
    return permission;
  }

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

  @Delete(':id')
  @ApiOkResponse({ type: PermissionDto })
  @ApiNotFoundResponse()
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.permissionsService.remove({ id });
  }
}
