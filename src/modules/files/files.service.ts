import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../libs/database/prisma.service';
import { StorageService } from '../../libs/storage/storage.service';
import { PUBLIC_BUCKET } from '../../libs/storage/storage.constants';
import { File } from '../../generated/prisma/client';

export type FileScope = 'pets' | 'avatars';

const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

@Injectable()
export class FilesService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService
  ) {}

  async uploadPublic(
    scope: FileScope,
    entityId: number,
    file: Express.Multer.File,
    uploadedById: number,
  ): Promise<File> {
    const ext = MIME_EXTENSIONS[file.mimetype] ?? 'bin';
    const key = `${scope}/${entityId}/${randomUUID()}.${ext}`;

    await this.storage.upload(PUBLIC_BUCKET, key, file.buffer, file.mimetype);
    try {
      return await this.prisma.file.create({
        data: {
          bucket: PUBLIC_BUCKET,
          key,
          mimeType: file.mimetype,
          size: file.size,
          visibility: 'PUBLIC',
          uploadedById,
        },
      });
    } catch (e) {
      await this.storage.remove(PUBLIC_BUCKET, key).catch(() => undefined);
      throw e;
    }
  }

  async delete(fileId: number): Promise<void> {
    const file = await this.prisma.file.findUniqueOrThrow({
      where: { id: fileId },
    });
    await this.storage.remove(file.bucket, file.key);
    await this.prisma.file.delete({ where: { id: fileId } });
  }

  async url(file: File): Promise<string> {
    return file.visibility === 'PUBLIC'
      ? this.storage.publicUrl(file.bucket, file.key)
      : this.storage.presignedGetUrl(file.bucket, file.key);
  }
}
