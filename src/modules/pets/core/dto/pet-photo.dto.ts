export class PetPhotoDto {
  id: number;
  url: string;
  position: number;
}

export class FailedUploadDto {
  filename: string;
}

export class UploadPhotosResultDto {
  uploaded: PetPhotoDto[];
  failed: FailedUploadDto[];
}
