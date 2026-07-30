import {
  Injectable,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';
import {
  PRIVATE_BUCKET,
  PUBLIC_BUCKET,
  publicReadPolicy,
} from './storage.constants';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly client: Minio.Client;

  constructor(private readonly config: ConfigService) {
    this.client = new Minio.Client({
      endPoint: this.config.getOrThrow('MINIO_ENDPOINT'),
      port: Number(this.config.getOrThrow('MINIO_PORT')),
      useSSL: this.config.get('MINIO_USE_SSL') === 'true',
      accessKey: this.config.getOrThrow('MINIO_ACCESS_KEY'),
      secretKey: this.config.getOrThrow('MINIO_SECRET_KEY'),
    });
  }

  async onModuleInit() {
    await this.ensureBucket(PUBLIC_BUCKET, publicReadPolicy(PUBLIC_BUCKET));
    await this.ensureBucket(PRIVATE_BUCKET);
  }

  private async ensureBucket(name: string, policy?: string) {
    const exists = await this.client.bucketExists(name);
    if (!exists) await this.client.makeBucket(name);
    if (policy) await this.client.setBucketPolicy(name, policy);
  }

  async upload(
    bucket: string,
    key: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<void> {
    try {
      await this.client.putObject(bucket, key, buffer, buffer.length, {
        'Content-Type': mimeType,
      });
    } catch {
      throw new ServiceUnavailableException('File storage is unavailable');
    }
  }

  async remove(bucket: string, key: string): Promise<void> {
    try {
      await this.client.removeObject(bucket, key);
    } catch {
      throw new ServiceUnavailableException('File storage is unavailable');
    }
  }

  publicUrl(bucket: string, key: string): string {
    return `${this.config.getOrThrow('MINIO_PUBLIC_URL')}/${bucket}/${key}`;
  }

  presignedGetUrl(
    bucket: string,
    key: string,
    expirySec = 3600,
  ): Promise<string> {
    return this.client.presignedGetObject(bucket, key, expirySec);
  }
}
