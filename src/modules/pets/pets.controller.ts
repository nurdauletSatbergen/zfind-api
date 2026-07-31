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
} from '@nestjs/common';
import { MAX_PET_PHOTOS, PetsService } from './pets.service';
import { CreatePetDto } from './dto/create-pet.dto';
import { UpdatePetDto } from './dto/update-pet.dto';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { FilesInterceptor } from '@nestjs/platform-express';
import { imageFilePipe } from '../../shared/pipes/image-file.pipe';
import { LostModeService } from './lost-mode.service';
import { SightingsService } from './sightings.service';
import { ChangeStatusDto } from './dto/change-status.dto';

@Controller('pets')
export class PetsController {
  constructor(
    private readonly petsService: PetsService,
    private readonly lostModeService: LostModeService,
    private readonly sightingsService: SightingsService,
  ) {}

  @Post()
  create(@Body() createPetDto: CreatePetDto, @GetUser() user: JwtPayload) {
    return this.petsService.create(user.id, createPetDto);
  }

  // TODO: findAll/findOne публичные и отдают сущность целиком (publicCode, rewardAmount) —
  // сузить выдачу/закрыть авторизацией отдельной задачей
  @Public()
  @Get()
  findAll() {
    return this.petsService.findAll();
  }

  @Public()
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.petsService.findOne(+id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updatePetDto: UpdatePetDto,
  ) {
    return this.petsService.update(id, updatePetDto);
  }

  @Patch(':id/status')
  changeStatus(
    @Param('id', ParseIntPipe) id: number,
    @GetUser() user: JwtPayload,
    @Body() dto: ChangeStatusDto,
  ) {
    return this.lostModeService.changeStatus(id, user.id, dto);
  }

  @Get(':id/sightings')
  listSightings(
    @Param('id', ParseIntPipe) id: number,
    @GetUser() user: JwtPayload,
  ) {
    return this.sightingsService.listForOwner(id, user.id);
  }

  @Get(':id/lost-episodes')
  listLostEpisodes(
    @Param('id', ParseIntPipe) id: number,
    @GetUser() user: JwtPayload,
  ) {
    return this.lostModeService.listEpisodes(id, user.id);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number, @GetUser() user: JwtPayload) {
    return this.petsService.remove(id, user.id);
  }

  @Post(':id/photos')
  @UseInterceptors(FilesInterceptor('files', MAX_PET_PHOTOS))
  addPhotos(
    @Param('id', ParseIntPipe) id: number,
    @GetUser() user: JwtPayload,
    @UploadedFiles(imageFilePipe()) files: Express.Multer.File[],
  ) {
    return this.petsService.addPhotos(id, user.id, files);
  }

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
