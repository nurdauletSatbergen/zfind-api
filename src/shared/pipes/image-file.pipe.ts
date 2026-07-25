import { HttpStatus, ParseFilePipeBuilder } from '@nestjs/common';

export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

export const imageFilePipe = () =>
  new ParseFilePipeBuilder()
    .addFileTypeValidator({ fileType: /^image\/(jpeg|png|webp)$/ })
    .addMaxSizeValidator({ maxSize: MAX_IMAGE_SIZE_BYTES })
    .build({ errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY });
