import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { SightingThrottlerGuard } from './guards/sighting-throttler.guard';
import { Public } from '../auth/decorators/public.decorator';
import { imageFilePipe } from '../../shared/pipes/image-file.pipe';
import { LostModeService } from './lost-mode.service';
import { SightingsService } from './sightings.service';
import { CreateSightingDto } from './dto/create-sighting.dto';
import { PaginatedPublicPetsDto, PublicPetDto } from './dto/public-pet.dto';
import { PublicPetsQueryDto } from './dto/public-pets-query.dto';
import { PublicStatsDto } from './dto/public-stats.dto';
import { SightingCreatedDto } from './dto/sighting.dto';

@ApiTags('public')
@Controller('public')
export class PetsPublicController {
  constructor(
    private readonly lostModeService: LostModeService,
    private readonly sightingsService: SightingsService,
  ) {}

  /**
   * Публичная статистика сервиса
   *
   * @remarks Количество воссоединений и питомцев в поиске —
   * для лендинга, без авторизации.
   */
  @Public()
  @ApiOkResponse({ type: PublicStatsDto })
  @Get('stats')
  stats() {
    return this.lostModeService.stats();
  }

  /**
   * Лента пропавших питомцев
   *
   * @remarks Без авторизации, постранично, от свежих пропаж к старым.
   * `lat`, `lng` и `radius` (км) работают только вместе и фильтруют по месту
   * пропажи: в выборку попадает квадрат вокруг точки, а точное расстояние
   * до каждого питомца возвращается в `distanceKm` — по нему клиент может
   * отсечь углы квадрата. Питомцы без координат в гео-выборку не попадают.
   * Телефоны в ленте не отдаются — они есть только на карточке питомца.
   */
  @Public()
  @ApiOkResponse({ type: PaginatedPublicPetsDto })
  @Get('pets')
  feed(@Query() query: PublicPetsQueryDto) {
    return this.lostModeService.publicFeed(query);
  }

  /**
   * Публичная карточка питомца по коду с QR-жетона
   *
   * @remarks Контакты владельца, вознаграждение и время пропажи
   * присутствуют в ответе только когда питомец в статусе `LOST`.
   */
  @Public()
  @ApiOkResponse({ type: PublicPetDto })
  @ApiNotFoundResponse({ description: 'Unknown public code' })
  @Get('pets/:code')
  publicCard(@Param('code') code: string) {
    return this.lostModeService.publicCard(code);
  }

  /**
   * Сообщить, что питомца видели
   *
   * @remarks Для нашедшего, без авторизации; защищено rate-limit.
   * Принимает координаты/адрес, комментарий, телефон и опциональное
   * фото (multipart-поле `photo`). Владелец получает уведомление.
   *
   * Статус питомца не важен: жетон сканируют и тогда, когда владелец
   * ещё не знает о пропаже. Для питомца в `HOME` уведомление приходит
   * с текстом про скан жетона, для `LOST` — про то, что его видели.
   *
   * Лимит считается по паре «IP + код питомца»: 5 сообщений за 10 минут
   * об одном питомце с одного адреса. Сообщения о разных питомцах друг
   * друга не блокируют, поэтому `429` здесь означает «вы уже писали об
   * этом питомце», а не «слишком много запросов вообще».
   */
  @Public()
  @UseGuards(SightingThrottlerGuard)
  @ApiCreatedResponse({ type: SightingCreatedDto })
  @ApiNotFoundResponse({ description: 'Unknown public code' })
  @ApiTooManyRequestsResponse({
    description:
      'Лимит по паре «IP + код питомца»: 5 сообщений об одном питомце за 10 минут',
  })
  @Post('pets/:code/sightings')
  @UseInterceptors(FileInterceptor('photo'))
  createSighting(
    @Param('code') code: string,
    @Body() dto: CreateSightingDto,
    @UploadedFile(imageFilePipe({ optional: true }))
    photo?: Express.Multer.File,
  ) {
    return this.sightingsService.createPublic(code, dto, photo);
  }
}
