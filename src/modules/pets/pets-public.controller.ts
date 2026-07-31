import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { imageFilePipe } from '../../shared/pipes/image-file.pipe';
import { LostModeService } from './lost-mode.service';
import { SightingsService } from './sightings.service';
import { CreateSightingDto } from './dto/create-sighting.dto';
import { PublicPetDto } from './dto/public-pet.dto';
import { PublicStatsDto } from './dto/public-stats.dto';
import { SightingCreatedDto } from './dto/sighting.dto';

@ApiTags('public')
@Controller('public')
export class PetsPublicController {
  constructor(
    private readonly lostModeService: LostModeService,
    private readonly sightingsService: SightingsService,
  ) {}

  @Public()
  @ApiOkResponse({ type: PublicStatsDto })
  @Get('stats')
  stats() {
    return this.lostModeService.stats();
  }

  @Public()
  @ApiOkResponse({ type: PublicPetDto })
  @Get('pets/:code')
  publicCard(@Param('code') code: string) {
    return this.lostModeService.publicCard(code);
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @ApiCreatedResponse({ type: SightingCreatedDto })
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
