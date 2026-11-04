import { ArrayMinSize, IsArray, IsInt } from 'class-validator';

export class ReorderPhotosDto {
  /** Id всех фото питомца в новом порядке; первое становится обложкой */
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  photoIds: number[];
}
