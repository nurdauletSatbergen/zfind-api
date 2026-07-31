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
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserSettingsDto } from './dto/update-user-settings.dto';
import { UserDto } from './dto/user.dto';
import { UserSettingDto } from './dto/user-setting.dto';
import { UserDetailDto, UserWithSettingDto } from './dto/user-detail.dto';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @ApiCreatedResponse({ type: UserDto })
  @ApiConflictResponse()
  @Post()
  async create(@Body() createUserDto: CreateUserDto) {
    const { password, ...user } = await this.usersService.create(createUserDto);
    return user;
  }

  @ApiOkResponse({ type: UserWithSettingDto, isArray: true })
  @Get()
  async findAll() {
    const users = await this.usersService.findAll();
    return users.map(({ password, ...user }) => user);
  }

  @ApiOkResponse({ type: UserDetailDto })
  @ApiNotFoundResponse()
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const user = await this.usersService.findOne({ id });
    if (!user) throw new NotFoundException(`User with ID ${id} not found`);
    const { password, ...result } = user;
    return result;
  }

  @ApiOkResponse({ type: UserDto })
  @ApiNotFoundResponse()
  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: UpdateUserDto,
  ) {
    const { password, ...user } = await this.usersService.update({
      where: { id },
      data,
    });
    return user;
  }

  @ApiOkResponse({ type: UserDto })
  @ApiNotFoundResponse()
  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    const { password, ...user } = await this.usersService.remove({ id });
    return user;
  }

  @ApiOkResponse({ type: UserSettingDto })
  @ApiNotFoundResponse()
  @Patch(':id/setting')
  updateUserSettings(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateUserSettingsDto: UpdateUserSettingsDto,
  ) {
    return this.usersService.updateUserSettings(id, updateUserSettingsDto);
  }
}
