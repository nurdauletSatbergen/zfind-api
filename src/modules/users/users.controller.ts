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
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PermissionsGuard } from '../../shared/guards/permissions.guard';
import { RequirePermissions } from '../../shared/decorators/require-permissions.decorator';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserSettingsDto } from './dto/update-user-settings.dto';
import { UserDto } from './dto/user.dto';
import { UserSettingDto } from './dto/user-setting.dto';
import { UserDetailDto, UserWithSettingDto } from './dto/user-detail.dto';

/**
 * Административное управление пользователями.
 *
 * Весь контроллер закрыт правами: глобальный `JwtAuthGuard` проверяет только
 * подлинность токена, поэтому без `PermissionsGuard` любой зарегистрированный
 * пользователь мог читать чужие email и телефоны, менять чужие данные и
 * удалять чужие аккаунты. Свой профиль пользователь правит через
 * `PATCH /auth/profile`, где id берётся из токена, а не из URL.
 */
@ApiTags('users')
@ApiBearerAuth()
@ApiForbiddenResponse({ description: 'Недостаточно прав' })
@UseGuards(PermissionsGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * Создать пользователя
   *
   * @remarks Email должен быть уникален, иначе 409. Настройки
   * пользователя создаются автоматически с выключенными уведомлениями.
   */
  @ApiCreatedResponse({ type: UserDto })
  @ApiConflictResponse()
  @RequirePermissions('users:manage')
  @Post()
  async create(@Body() createUserDto: CreateUserDto) {
    const { password, ...user } = await this.usersService.create(createUserDto);
    return user;
  }

  /**
   * Список всех пользователей
   *
   * @remarks Каждый элемент включает настройки пользователя.
   */
  @ApiOkResponse({ type: UserWithSettingDto, isArray: true })
  @RequirePermissions('users:read')
  @Get()
  async findAll() {
    const users = await this.usersService.findAll();
    return users.map(({ password, ...user }) => user);
  }

  /**
   * Пользователь по id
   *
   * @remarks Детальная карточка: настройки, питомцы и роль
   * со списком прав.
   */
  @ApiOkResponse({ type: UserDetailDto })
  @ApiNotFoundResponse()
  @RequirePermissions('users:read')
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const user = await this.usersService.findOne({ id });
    if (!user) throw new NotFoundException(`User with ID ${id} not found`);
    const { password, ...result } = user;
    return result;
  }

  /**
   * Обновить пользователя
   *
   * @remarks Только имя и телефон. Пароль и email через эту ручку не меняются:
   * пароль требует хеширования, email — подтверждения нового адреса.
   */
  @ApiOkResponse({ type: UserDto })
  @ApiNotFoundResponse()
  @RequirePermissions('users:manage')
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

  /**
   * Удалить пользователя
   *
   * @remarks Возвращает удалённую запись.
   */
  @ApiOkResponse({ type: UserDto })
  @ApiNotFoundResponse()
  @RequirePermissions('users:manage')
  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    const { password, ...user } = await this.usersService.remove({ id });
    return user;
  }

  /**
   * Обновить настройки уведомлений пользователя
   */
  @ApiOkResponse({ type: UserSettingDto })
  @ApiNotFoundResponse()
  @RequirePermissions('users:manage')
  @Patch(':id/setting')
  updateUserSettings(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateUserSettingsDto: UpdateUserSettingsDto,
  ) {
    return this.usersService.updateUserSettings(id, updateUserSettingsDto);
  }
}
