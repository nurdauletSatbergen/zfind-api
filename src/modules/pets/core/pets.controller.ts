import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseIntPipe,
  HttpCode,
  UseInterceptors,
  UploadedFiles,
  Query,
  DefaultValuePipe,
} from '@nestjs/common';
import { MAX_PET_PHOTOS, PetsService } from './pets.service';
import { CreatePetDto } from './dto/create-pet.dto';
import { UpdatePetDto } from './dto/update-pet.dto';
import { GetUser } from '../../auth/decorators/get-user.decorator';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { FilesInterceptor } from '@nestjs/platform-express';
import { imageFilePipe } from '../../../shared/pipes/image-file.pipe';
import { LostModeService } from '../lost-mode/lost-mode.service';
import { SightingsService } from '../sightings/sightings.service';
import { ChangeStatusDto } from '../lost-mode/dto/change-status.dto';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PaginatedPetsDto, PetDto, PetWithPhotosDto } from './dto/pet.dto';
import { UploadPhotosResultDto } from './dto/pet-photo.dto';
import { SightingDto } from '../sightings/dto/sighting.dto';
import { LostEpisodeDto } from '../lost-mode/dto/lost-episode.dto';

@ApiTags('pets')
@Controller('pets')
export class PetsController {
  constructor(
    private readonly petsService: PetsService,
    private readonly lostModeService: LostModeService,
    private readonly sightingsService: SightingsService,
  ) {}

  /**
   * Создать питомца
   *
   * @remarks Питомец привязывается к текущему пользователю. Уникальный
   * `publicCode` для публичной карточки генерируется автоматически.
   */
  @ApiBearerAuth()
  @ApiCreatedResponse({ type: PetDto })
  @Post()
  create(@Body() createPetDto: CreatePetDto, @GetUser() user: JwtPayload) {
    return this.petsService.create(user.id, createPetDto);
  }

  /**
   * Мои питомцы
   *
   * @remarks Только питомцы текущего пользователя, постранично,
   * от новых к старым: `page` (с 1) и `limit` (по умолчанию 20).
   */
  @ApiBearerAuth()
  @ApiOkResponse({ type: PaginatedPetsDto })
  @Get()
  findAll(
    @GetUser() user: JwtPayload,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.petsService.findAllForOwner(user.id, page, limit);
  }

  /**
   * Питомец по id с фотографиями
   *
   * @remarks Только владелец. Фото отсортированы по позиции, для каждого —
   * готовый URL. Анониму предназначена публичная карточка по коду с жетона
   * (`GET /public/pets/{code}`): она усечена и не раскрывает `publicCode`,
   * `rewardAmount` и `ownerId`.
   */
  @ApiBearerAuth()
  @ApiOkResponse({ type: PetWithPhotosDto })
  @ApiForbiddenResponse({
    description: 'Питомец принадлежит другому владельцу',
  })
  @ApiNotFoundResponse()
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @GetUser() user: JwtPayload) {
    return this.petsService.findOne(id, user.id);
  }

  /**
   * Обновить питомца
   *
   * @remarks Только владелец. Кличка, окрас, пол, дата рождения.
   * Статус меняется отдельной командой `PATCH /pets/:id/status`.
   */
  @ApiBearerAuth()
  @ApiOkResponse({ type: PetDto })
  @ApiNotFoundResponse()
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @GetUser() user: JwtPayload,
    @Body() updatePetDto: UpdatePetDto,
  ) {
    return this.petsService.update(id, user.id, updatePetDto);
  }

  /**
   * Сменить статус питомца (HOME/LOST)
   *
   * @remarks Только владелец. Переход в `LOST` открывает эпизод пропажи и
   * принимает опциональный `rewardAmount`; возврат в `HOME` закрывает
   * открытые эпизоды и сбрасывает вознаграждение.
   */
  @ApiBearerAuth()
  @ApiOkResponse({ type: PetDto })
  @ApiNotFoundResponse()
  @Patch(':id/status')
  changeStatus(
    @Param('id', ParseIntPipe) id: number,
    @GetUser() user: JwtPayload,
    @Body() dto: ChangeStatusDto,
  ) {
    return this.lostModeService.changeStatus(id, user.id, dto);
  }

  /**
   * Сообщения «видели питомца» (для владельца)
   *
   * @remarks Только владелец. Отсортированы от новых к старым,
   * с URL фото очевидца, если оно было приложено.
   */
  @ApiBearerAuth()
  @ApiOkResponse({ type: SightingDto, isArray: true })
  @ApiNotFoundResponse()
  @Get(':id/sightings')
  listSightings(
    @Param('id', ParseIntPipe) id: number,
    @GetUser() user: JwtPayload,
  ) {
    return this.sightingsService.listForOwner(id, user.id);
  }

  /**
   * История эпизодов пропажи питомца
   *
   * @remarks Только владелец. Открытый эпизод имеет `foundAt: null`.
   */
  @ApiBearerAuth()
  @ApiOkResponse({ type: LostEpisodeDto, isArray: true })
  @ApiNotFoundResponse()
  @Get(':id/lost-episodes')
  listLostEpisodes(
    @Param('id', ParseIntPipe) id: number,
    @GetUser() user: JwtPayload,
  ) {
    return this.lostModeService.listEpisodes(id, user.id);
  }

  /**
   * Удалить питомца
   *
   * @remarks Только владелец. Каскадно удаляет фотографии из хранилища.
   */
  @ApiBearerAuth()
  @ApiNotFoundResponse()
  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number, @GetUser() user: JwtPayload) {
    return this.petsService.remove(id, user.id);
  }

  /**
   * Загрузить фотографии питомца
   *
   * @remarks Только владелец. Multipart-поле `files`, до 10 фото на питомца
   * суммарно. Ответ разделяет успешно загруженные и отклонённые файлы.
   */
  @ApiBearerAuth()
  @ApiCreatedResponse({ type: UploadPhotosResultDto })
  @ApiNotFoundResponse()
  @Post(':id/photos')
  @UseInterceptors(FilesInterceptor('files', MAX_PET_PHOTOS))
  addPhotos(
    @Param('id', ParseIntPipe) id: number,
    @GetUser() user: JwtPayload,
    @UploadedFiles(imageFilePipe()) files: Express.Multer.File[],
  ) {
    return this.petsService.addPhotos(id, user.id, files);
  }

  /**
   * Удалить фотографию питомца
   *
   * @remarks Только владелец. Файл удаляется и из хранилища.
   */
  @ApiBearerAuth()
  @ApiNotFoundResponse()
  @Delete(':id/photos/:photoId')
  @HttpCode(204)
  removePhoto(
    @Param('id', ParseIntPipe) id: number,
    @Param('photoId', ParseIntPipe) photoId: number,
    @GetUser() user: JwtPayload,
  ) {
    return this.petsService.removePhoto(id, photoId, user.id);
  }
}
