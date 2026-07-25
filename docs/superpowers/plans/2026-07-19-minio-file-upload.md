# Загрузка файлов в MinIO — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Примечание:** этот план исполняет сам разработчик пошагово (режим обучения).

**Goal:** Фото питомцев (до 10, с порядком) и аватары пользователей хранятся в MinIO; загрузка через API с валидацией, раздача публичных файлов напрямую с MinIO.

**Architecture:** Три слоя по спеке `docs/superpowers/specs/2026-07-19-minio-file-upload-design.md`: `libs/storage` (обёртка MinIO, @Global) → `modules/files` (таблица `File`, единая точка записи) → доменные эндпоинты в `pets`/`users`. Одна таблица `files` + модели-связки (`PetPhoto`, `User.avatarId`).

**Tech Stack:** NestJS 11 (Express, Multer), Prisma 7 + Postgres, пакет `minio`, docker-compose для dev-MinIO.

**Проверка перед стартом:** ветка `feature/minio-file-upload`, `git status` чистый.

---

### Task 1: Довести существующий compose и переменные окружения

MinIO уже поднят в монорепо-compose `../docker/docker-compose.yml`
(postgres + minio + api + web) — новый compose не создаём, только правим.

**Files:**
- Modify: `../docker/docker-compose.yml`
- Modify: `../docker/.env`
- Modify: `.env` (zfind-api)

- [ ] **Step 1: Убрать сервис `minio-init` из `../docker/docker-compose.yml`**

Принятое решение — бакеты и политику создаёт приложение (`ensureBucket`
в Task 4); init-контейнер стал бы вторым источником истины (и сейчас он
создаёт один бакет из `MINIO_BUCKET` без публичной policy). Удалить весь
блок `minio-init:` и переменную `MINIO_BUCKET` из окружения сервиса `api`
и из `../docker/.env`.

- [ ] **Step 2: Дополнить окружение сервиса `api` в compose**

В `environment` сервиса `api` добавить:

```yaml
      MINIO_USE_SSL: "false"
      MINIO_PUBLIC_URL: http://localhost:9000
```

Ключевой момент: `MINIO_ENDPOINT: minio` — адрес *внутри* docker-сети
(им пользуется сервер для загрузки), а `MINIO_PUBLIC_URL` — адрес,
который увидит *браузер* пользователя, поэтому `localhost:9000`.
Это две разные вещи, и путать их нельзя.

- [ ] **Step 3: Поправить `.env` в zfind-api** (для запуска `npm run start:dev` без docker)

Сейчас в нём есть `MINIO_ENDPOINT/PORT/ACCESS_KEY/SECRET_KEY` и лишний
`MINIO_BUCKET`. Удалить `MINIO_BUCKET`, добавить:

```env
MINIO_USE_SSL=false
MINIO_PUBLIC_URL=http://localhost:9000
```

При запуске на хосте `MINIO_ENDPOINT` должен быть `localhost`.
`.env` не коммитим.

- [ ] **Step 4: Запустить и проверить**

Run: `docker compose -f ../docker/docker-compose.yml up -d minio && curl -s http://localhost:9000/minio/health/live -o /dev/null -w "%{http_code}\n"`
Expected: `200`. Консоль MinIO — http://localhost:9001.

Папка `../docker` не под git — коммитить нечего (позже стоит завести
для неё репозиторий, вне скоупа этого плана).

---

### Task 2: Зависимости

- [ ] **Step 1: Установить**

Run: `npm i minio && npm i -D @types/multer`
Expected: обе записи появились в `package.json` (`minio` в dependencies, `@types/multer` в devDependencies).

`minio` включает собственные типы. `@types/multer` даёт тип `Express.Multer.File`.

- [ ] **Step 2: Проверить сборку**

Run: `npm run build`
Expected: сборка без ошибок.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "Added minio and multer types"
```

---

### Task 3: Prisma-схема и миграция

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Добавить enum и модели** (в конец `schema.prisma`)

```prisma
enum FileVisibility {
  PUBLIC
  PRIVATE
}

model File {
  id           Int            @id @default(autoincrement())
  bucket       String
  key          String         @unique
  mimeType     String
  size         Int
  visibility   FileVisibility @default(PUBLIC)
  uploadedBy   User?          @relation("uploaded_files", fields: [uploadedById], references: [id], onDelete: SetNull)
  uploadedById Int?
  createdAt    DateTime       @default(now())

  petPhoto     PetPhoto?
  avatarOfUser User?          @relation("user_avatar")

  @@map("files")
}

model PetPhoto {
  id       Int  @id @default(autoincrement())
  pet      Pet  @relation(fields: [petId], references: [id], onDelete: Cascade)
  petId    Int
  file     File @relation(fields: [fileId], references: [id], onDelete: Cascade)
  fileId   Int  @unique
  position Int  @default(0)

  @@map("pet_photos")
}
```

Обратите внимание на `onDelete: Cascade` у `file` в `PetPhoto`: удаление строки `files` автоматически удаляет строку-связку. Без него `prisma.file.delete` упадёт по FK-констрейнту (у обязательных связей Prisma по умолчанию `Restrict`).

- [ ] **Step 2: Расширить `User` и `Pet`** (добавить поля в существующие модели)

```prisma
model User {
  // ...существующие поля без изменений...
  avatar        File?  @relation("user_avatar", fields: [avatarId], references: [id])
  avatarId      Int?   @unique
  uploadedFiles File[] @relation("uploaded_files")
}

model Pet {
  // ...существующие поля без изменений...
  photos PetPhoto[]
}
```

- [ ] **Step 3: Миграция и генерация клиента**

Run: `npx prisma migrate dev --name files`
Expected: `Your database is now in sync with your schema`, в `src/generated/prisma/models/` появились `File.ts` и `PetPhoto.ts`.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/generated
git commit -m "Added File and PetPhoto models"
```

---

### Task 4: StorageModule — инфраструктурная обёртка MinIO

**Files:**
- Create: `src/libs/storage/storage.constants.ts`
- Create: `src/libs/storage/storage.service.ts`
- Create: `src/libs/storage/storage.module.ts`
- Modify: `src/app.module.ts`

- [ ] **Step 1: Константы — `storage.constants.ts`**

```typescript
export const PUBLIC_BUCKET = 'zfind-public';
export const PRIVATE_BUCKET = 'zfind-private';

export const publicReadPolicy = (bucket: string): string =>
  JSON.stringify({
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Principal: { AWS: ['*'] },
        Action: ['s3:GetObject'],
        Resource: [`arn:aws:s3:::${bucket}/*`],
      },
    ],
  });
```

Это стандартная S3-policy «анонимное чтение любого объекта бакета» — благодаря ей браузер получает картинки напрямую с MinIO.

- [ ] **Step 2: Сервис — `storage.service.ts`**

```typescript
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

  presignedGetUrl(bucket: string, key: string, expirySec = 3600): Promise<string> {
    return this.client.presignedGetObject(bucket, key, expirySec);
  }
}
```

Маппинг «MinIO недоступен → 503» живёт здесь (а не в FilesService): так его бесплатно получают все будущие потребители.

- [ ] **Step 3: Модуль — `storage.module.ts`**

```typescript
import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service';

@Global()
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
```

`@Global()` — по конвенции проекта (CLAUDE.md): инфраструктурный модуль импортируется один раз в AppModule и виден везде.

- [ ] **Step 4: Подключить в `app.module.ts`**

Заменить `ConfigModule.forRoot(),` на `ConfigModule.forRoot({ isGlobal: true }),` (иначе `ConfigService` не виден внутри StorageModule) и добавить `StorageModule` в imports:

```typescript
import { StorageModule } from './libs/storage/storage.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    StorageModule,
    UsersModule,
    AuthModule,
    PetsModule,
    RolesModule,
    PermissionsModule,
  ]
})
export class AppModule {}
```

- [ ] **Step 5: Проверить создание бакетов**

Run: `npm run start:dev` (дождаться старта), затем в другом терминале:
`curl -s http://localhost:9000/zfind-public/ -o /dev/null -w "%{http_code}\n"`
Expected: `404` (бакет существует, но листинг анонимно запрещён — это норма; несуществующий бакет дал бы `404` с другим телом, надёжнее проверить в консоли http://localhost:9001 → Buckets: видны `zfind-public` и `zfind-private`, у `zfind-public` Access Policy = Custom).

- [ ] **Step 6: Commit**

```bash
git add src/libs/storage src/app.module.ts
git commit -m "Added StorageModule with MinIO client"
```

---

### Task 5: FilesModule + FilesService (TDD)

**Files:**
- Create: `src/modules/files/files.module.ts`
- Create: `src/modules/files/files.service.ts`
- Test: `src/modules/files/files.service.spec.ts`

- [ ] **Step 1: Написать падающий тест — `files.service.spec.ts`**

```typescript
import { Test } from '@nestjs/testing';
import { FilesService } from './files.service';
import { StorageService } from '../../libs/storage/storage.service';
import { PrismaService } from '../../libs/database/prisma.service';
import { PUBLIC_BUCKET } from '../../libs/storage/storage.constants';

describe('FilesService', () => {
  let service: FilesService;

  const minio = {
    upload: jest.fn(),
    remove: jest.fn(),
    publicUrl: jest.fn(),
    presignedGetUrl: jest.fn(),
  };
  const prisma = {
    file: {
      create: jest.fn(),
      delete: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
  };

  const multerFile = {
    buffer: Buffer.from('fake-image'),
    mimetype: 'image/jpeg',
    size: 10,
    originalname: 'cat.jpg',
  } as Express.Multer.File;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        FilesService,
        { provide: StorageService, useValue: minio },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(FilesService);
  });

  describe('uploadPublic', () => {
    it('generates key as {scope}/{entityId}/{uuid}.{ext} and saves File row', async () => {
      prisma.file.create.mockImplementation(({ data }) => Promise.resolve({ id: 1, ...data }));

      const result = await service.uploadPublic('pets', 42, multerFile, 7);

      expect(result.key).toMatch(/^pets\/42\/[0-9a-f-]{36}\.jpg$/);
      expect(minio.upload).toHaveBeenCalledWith(
        PUBLIC_BUCKET,
        result.key,
        multerFile.buffer,
        'image/jpeg',
      );
      expect(prisma.file.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          bucket: PUBLIC_BUCKET,
          key: result.key,
          mimeType: 'image/jpeg',
          size: 10,
          visibility: 'PUBLIC',
          uploadedById: 7,
        }),
      });
    });

    it('removes MinIO object and rethrows when DB insert fails (compensation)', async () => {
      const dbError = new Error('db down');
      prisma.file.create.mockRejectedValue(dbError);

      await expect(service.uploadPublic('pets', 42, multerFile, 7)).rejects.toThrow(dbError);

      expect(minio.remove).toHaveBeenCalledTimes(1);
      const [bucket, key] = minio.remove.mock.calls[0];
      expect(bucket).toBe(PUBLIC_BUCKET);
      expect(key).toMatch(/^pets\/42\//);
    });
  });

  describe('delete', () => {
    it('removes MinIO object before deleting the File row', async () => {
      const file = { id: 5, bucket: PUBLIC_BUCKET, key: 'pets/42/x.jpg' };
      prisma.file.findUniqueOrThrow.mockResolvedValue(file);

      await service.delete(5);

      expect(minio.remove).toHaveBeenCalledWith(PUBLIC_BUCKET, 'pets/42/x.jpg');
      expect(prisma.file.delete).toHaveBeenCalledWith({ where: { id: 5 } });
      expect(minio.remove.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.file.delete.mock.invocationCallOrder[0],
      );
    });
  });

  describe('url', () => {
    it('returns direct public URL for PUBLIC files', async () => {
      minio.publicUrl.mockReturnValue('http://localhost:9000/zfind-public/pets/42/x.jpg');
      const file = { bucket: PUBLIC_BUCKET, key: 'pets/42/x.jpg', visibility: 'PUBLIC' };

      await expect(service.url(file as never)).resolves.toBe(
        'http://localhost:9000/zfind-public/pets/42/x.jpg',
      );
      expect(minio.presignedGetUrl).not.toHaveBeenCalled();
    });

    it('returns presigned URL for PRIVATE files', async () => {
      minio.presignedGetUrl.mockResolvedValue('http://signed');
      const file = { bucket: 'zfind-private', key: 'docs/1/x.pdf', visibility: 'PRIVATE' };

      await expect(service.url(file as never)).resolves.toBe('http://signed');
      expect(minio.publicUrl).not.toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `npm test -- src/modules/files/files.service.spec.ts`
Expected: FAIL — `Cannot find module './files.service'`.

- [ ] **Step 3: Реализация — `files.service.ts`**

```typescript
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
    private minio: StorageService,
  ) {}

  async uploadPublic(
    scope: FileScope,
    entityId: number,
    file: Express.Multer.File,
    uploadedById: number,
  ): Promise<File> {
    const ext = MIME_EXTENSIONS[file.mimetype] ?? 'bin';
    const key = `${scope}/${entityId}/${randomUUID()}.${ext}`;

    await this.minio.upload(PUBLIC_BUCKET, key, file.buffer, file.mimetype);
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
      await this.minio.remove(PUBLIC_BUCKET, key).catch(() => undefined);
      throw e;
    }
  }

  async delete(fileId: number): Promise<void> {
    const file = await this.prisma.file.findUniqueOrThrow({
      where: { id: fileId },
    });
    await this.minio.remove(file.bucket, file.key);
    await this.prisma.file.delete({ where: { id: fileId } });
  }

  async url(file: File): Promise<string> {
    return file.visibility === 'PUBLIC'
      ? this.minio.publicUrl(file.bucket, file.key)
      : this.minio.presignedGetUrl(file.bucket, file.key);
  }
}
```

Порядок операций — из спеки: строка `File` — источник истины, поэтому объект без строки допустим (мусор), строка без объекта — нет. Расширение берём из mime-типа (проверенного по magic bytes), а не из имени файла, которым управляет клиент.

- [ ] **Step 4: Убедиться, что тесты проходят**

Run: `npm test -- src/modules/files/files.service.spec.ts`
Expected: PASS, 5 тестов.

- [ ] **Step 5: Модуль — `files.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { FilesService } from './files.service';
import { PrismaModule } from '../../libs/database/prisma.module';

@Module({
  providers: [FilesService],
  exports: [FilesService],
  imports: [PrismaModule],
})
export class FilesModule {}
```

Контроллера нет намеренно: файлы доступны только через доменные эндпоинты.

- [ ] **Step 6: Commit**

```bash
git add src/modules/files
git commit -m "Added FilesModule with FilesService"
```

---

### Task 6: Общий пайп валидации изображений

**Files:**
- Create: `src/shared/pipes/image-file.pipe.ts`

- [ ] **Step 1: Создать пайп**

```typescript
import { HttpStatus, ParseFilePipeBuilder } from '@nestjs/common';

export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

export const imageFilePipe = () =>
  new ParseFilePipeBuilder()
    .addFileTypeValidator({ fileType: /^image\/(jpeg|png|webp)$/ })
    .addMaxSizeValidator({ maxSize: MAX_IMAGE_SIZE_BYTES })
    .build({ errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY });
```

`FileTypeValidator` в NestJS проверяет тип по magic bytes содержимого файла, а не по расширению — переименованный `.exe` не пройдёт. Один и тот же пайп работает и с `@UploadedFile` (один файл), и с `@UploadedFiles` (массив — валидируется каждый). Живёт в `src/shared/` по конвенции проекта.

- [ ] **Step 2: Проверить сборку**

Run: `npm run build`
Expected: без ошибок.

- [ ] **Step 3: Commit**

```bash
git add src/shared
git commit -m "Added shared image validation pipe"
```

---

### Task 7: PetsService — методы работы с фото (TDD)

**Files:**
- Modify: `src/modules/pets/pets.service.ts`
- Modify: `src/modules/pets/pets.module.ts`
- Test: `src/modules/pets/pets.service.spec.ts`

- [ ] **Step 1: Написать падающий тест — `pets.service.spec.ts`**

```typescript
import { Test } from '@nestjs/testing';
import {
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PetsService, MAX_PET_PHOTOS } from './pets.service';
import { PrismaService } from '../../libs/database/prisma.service';
import { FilesService } from '../files/files.service';

describe('PetsService photos', () => {
  let service: PetsService;

  const prisma = {
    pet: { findUnique: jest.fn(), delete: jest.fn() },
    petPhoto: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const filesService = {
    uploadPublic: jest.fn(),
    delete: jest.fn(),
    url: jest.fn().mockResolvedValue('http://url'),
  };

  const multerFile = {
    buffer: Buffer.from('img'),
    mimetype: 'image/jpeg',
    size: 3,
    originalname: 'cat.jpg',
  } as Express.Multer.File;

  const petOwnedBy7 = { id: 42, name: 'Барсик', ownerId: 7, _count: { photos: 2 } };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        PetsService,
        { provide: PrismaService, useValue: prisma },
        { provide: FilesService, useValue: filesService },
      ],
    }).compile();
    service = module.get(PetsService);
  });

  describe('addPhotos', () => {
    it('throws 404 when pet does not exist', async () => {
      prisma.pet.findUnique.mockResolvedValue(null);
      await expect(service.addPhotos(99, 7, [multerFile])).rejects.toThrow(NotFoundException);
    });

    it('throws 403 when user is not the owner', async () => {
      prisma.pet.findUnique.mockResolvedValue(petOwnedBy7);
      await expect(service.addPhotos(42, 8, [multerFile])).rejects.toThrow(ForbiddenException);
    });

    it('throws 422 when limit would be exceeded, before uploading anything', async () => {
      prisma.pet.findUnique.mockResolvedValue({
        ...petOwnedBy7,
        _count: { photos: MAX_PET_PHOTOS - 1 },
      });
      await expect(service.addPhotos(42, 7, [multerFile, multerFile])).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(filesService.uploadPublic).not.toHaveBeenCalled();
    });

    it('uploads each file and assigns sequential positions after existing ones', async () => {
      prisma.pet.findUnique.mockResolvedValue(petOwnedBy7);
      filesService.uploadPublic
        .mockResolvedValueOnce({ id: 11 })
        .mockResolvedValueOnce({ id: 12 });
      prisma.petPhoto.create.mockImplementation(({ data }) =>
        Promise.resolve({ id: data.position + 100, ...data, file: { id: data.fileId } }),
      );

      const result = await service.addPhotos(42, 7, [multerFile, multerFile]);

      expect(prisma.petPhoto.create).toHaveBeenNthCalledWith(1, expect.objectContaining({
        data: { petId: 42, fileId: 11, position: 2 },
      }));
      expect(prisma.petPhoto.create).toHaveBeenNthCalledWith(2, expect.objectContaining({
        data: { petId: 42, fileId: 12, position: 3 },
      }));
      expect(result.uploaded).toHaveLength(2);
      expect(result.failed).toHaveLength(0);
    });

    it('keeps successfully uploaded files and reports the failed one', async () => {
      prisma.pet.findUnique.mockResolvedValue(petOwnedBy7);
      filesService.uploadPublic
        .mockResolvedValueOnce({ id: 11 })
        .mockRejectedValueOnce(new Error('minio down'));
      prisma.petPhoto.create.mockImplementation(({ data }) =>
        Promise.resolve({ id: 1, ...data, file: { id: data.fileId } }),
      );

      const result = await service.addPhotos(42, 7, [multerFile, multerFile]);

      expect(result.uploaded).toHaveLength(1);
      expect(result.failed).toEqual([{ filename: 'cat.jpg' }]);
    });
  });

  describe('removePhoto', () => {
    it('deletes the file and shifts positions of photos after it', async () => {
      prisma.pet.findUnique.mockResolvedValue(petOwnedBy7);
      prisma.petPhoto.findUnique.mockResolvedValue({ id: 3, petId: 42, fileId: 12, position: 1 });

      await service.removePhoto(42, 3, 7);

      expect(filesService.delete).toHaveBeenCalledWith(12);
      expect(prisma.petPhoto.updateMany).toHaveBeenCalledWith({
        where: { petId: 42, position: { gt: 1 } },
        data: { position: { decrement: 1 } },
      });
    });

    it('throws 404 when photo belongs to another pet', async () => {
      prisma.pet.findUnique.mockResolvedValue(petOwnedBy7);
      prisma.petPhoto.findUnique.mockResolvedValue({ id: 3, petId: 99, fileId: 12, position: 0 });

      await expect(service.removePhoto(42, 3, 7)).rejects.toThrow(NotFoundException);
      expect(filesService.delete).not.toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `npm test -- src/modules/pets/pets.service.spec.ts`
Expected: FAIL — `MAX_PET_PHOTOS` не экспортируется / методы не существуют.

- [ ] **Step 3: Реализация — заменить содержимое `pets.service.ts`**

```typescript
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { UpdatePetDto } from './dto/update-pet.dto';
import { PrismaService } from '../../libs/database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { FilesService } from '../files/files.service';

export const MAX_PET_PHOTOS = 10;

@Injectable()
export class PetsService {
  constructor(
    private prisma: PrismaService,
    private filesService: FilesService,
  ) {}

  create(ownerId: number, createPetDto: Prisma.PetCreateWithoutOwnerInput) {
    return this.prisma.pet.create({
      data: {
        ...createPetDto,
        ownerId
      }
    })
  }

  findAll() {
    return this.prisma.pet.findMany();
  }

  async findOne(id: number) {
    const pet = await this.prisma.pet.findUnique({
      where: { id },
      include: {
        photos: {
          include: { file: true },
          orderBy: { position: 'asc' },
        },
      },
    });
    if (!pet) throw new NotFoundException(`Pet with ID ${id} not found`);

    const { photos, ...rest } = pet;
    return {
      ...rest,
      photos: await Promise.all(
        photos.map(async (photo) => ({
          id: photo.id,
          url: await this.filesService.url(photo.file),
          position: photo.position,
        })),
      ),
    };
  }

  update(id: number, updatePetDto: UpdatePetDto) {
    return `This action updates a #${id} pet`;
  }

  async remove(id: number, userId: number) {
    const pet = await this.findOwnedPet(id, userId);
    const photos = await this.prisma.petPhoto.findMany({
      where: { petId: pet.id },
    });
    for (const photo of photos) {
      await this.filesService.delete(photo.fileId);
    }
    await this.prisma.pet.delete({ where: { id: pet.id } });
  }

  async addPhotos(petId: number, userId: number, files: Express.Multer.File[]) {
    const pet = await this.findOwnedPet(petId, userId);

    if (pet._count.photos + files.length > MAX_PET_PHOTOS) {
      throw new UnprocessableEntityException(
        `Pet can have at most ${MAX_PET_PHOTOS} photos`,
      );
    }

    const uploaded: { id: number; url: string; position: number }[] = [];
    const failed: { filename: string }[] = [];
    let position = pet._count.photos;

    for (const file of files) {
      try {
        const savedFile = await this.filesService.uploadPublic('pets', petId, file, userId);
        const photo = await this.prisma.petPhoto.create({
          data: { petId, fileId: savedFile.id, position: position++ },
          include: { file: true },
        });
        uploaded.push({
          id: photo.id,
          url: await this.filesService.url(photo.file),
          position: photo.position,
        });
      } catch {
        failed.push({ filename: file.originalname });
      }
    }

    return { uploaded, failed };
  }

  async removePhoto(petId: number, photoId: number, userId: number) {
    const pet = await this.findOwnedPet(petId, userId);

    const photo = await this.prisma.petPhoto.findUnique({ where: { id: photoId } });
    if (!photo || photo.petId !== pet.id) {
      throw new NotFoundException(`Photo with ID ${photoId} not found`);
    }

    await this.filesService.delete(photo.fileId);
    await this.prisma.petPhoto.updateMany({
      where: { petId: pet.id, position: { gt: photo.position } },
      data: { position: { decrement: 1 } },
    });
  }

  private async findOwnedPet(id: number, userId: number) {
    const pet = await this.prisma.pet.findUnique({
      where: { id },
      include: { _count: { select: { photos: true } } },
    });
    if (!pet) throw new NotFoundException(`Pet with ID ${id} not found`);
    if (pet.ownerId !== userId) {
      throw new ForbiddenException('You are not the owner of this pet');
    }
    return pet;
  }
}
```

Что здесь важно понять: `PetPhoto.delete` нигде не вызывается — строка-связка удаляется каскадом при `FilesService.delete` (см. `onDelete: Cascade` из Task 3). Удаление питомца сначала чистит файлы через сервис (MinIO про каскады БД не знает), и только потом удаляет питомца.

- [ ] **Step 4: Убедиться, что тесты проходят**

Run: `npm test -- src/modules/pets/pets.service.spec.ts`
Expected: PASS, 7 тестов.

- [ ] **Step 5: Подключить FilesModule — `pets.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { PetsService } from './pets.service';
import { PetsController } from './pets.controller';
import { PrismaModule } from '../../libs/database/prisma.module';
import { UsersModule } from '../users/users.module';
import { FilesModule } from '../files/files.module';

@Module({
  controllers: [PetsController],
  providers: [PetsService],
  imports: [PrismaModule, UsersModule, FilesModule]
})
export class PetsModule {}
```

- [ ] **Step 6: Commit**

```bash
git add src/modules/pets
git commit -m "Added photo methods to PetsService"
```

---

### Task 8: PetsController — эндпоинты фото

**Files:**
- Modify: `src/modules/pets/pets.controller.ts`

- [ ] **Step 1: Заменить содержимое `pets.controller.ts`**

```typescript
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseIntPipe,
  UseInterceptors,
  UploadedFiles,
  HttpCode,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { PetsService, MAX_PET_PHOTOS } from './pets.service';
import { CreatePetDto } from './dto/create-pet.dto';
import { UpdatePetDto } from './dto/update-pet.dto';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { imageFilePipe } from '../../shared/pipes/image-file.pipe';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@Controller('pets')
export class PetsController {
  constructor(private readonly petsService: PetsService) {}

  @Post()
  create(
    @Body() createPetDto: CreatePetDto,
    @GetUser() user: JwtPayload
  ) {
    return this.petsService.create(user.id, createPetDto);
  }

  @Public()
  @Get()
  findAll() {
    return this.petsService.findAll();
  }

  @Public()
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.petsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() updatePetDto: UpdatePetDto) {
    return this.petsService.update(id, updatePetDto);
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
```

Попутные изменения существующих ручек: `findOne` переведён на `ParseIntPipe` и помечен `@Public()` (фото питомцев публичные — карточку должно быть видно без логина), `remove` теперь передаёт владельца. `FilesInterceptor('files', 10)` сам вернёт 400, если файлов больше десяти.

- [ ] **Step 2: Ручная проверка (нужны запущенные MinIO и `npm run start:dev`)**

```bash
# 1. Зарегистрироваться и получить токен
curl -s -X POST http://localhost:3000/api/auth/sign-up \
  -H 'Content-Type: application/json' \
  -d '{"email":"photo-test@example.com","password":"secret123","name":"Test"}'
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/sign-in \
  -H 'Content-Type: application/json' \
  -d '{"email":"photo-test@example.com","password":"secret123"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).access_token')

# 2. Создать питомца (запомните id из ответа)
curl -s -X POST http://localhost:3000/api/pets \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"Барсик"}'

# 3. Загрузить фото (любой настоящий jpg с диска; id питомца подставьте свой)
curl -s -X POST http://localhost:3000/api/pets/1/photos \
  -H "Authorization: Bearer $TOKEN" \
  -F "files=@/путь/к/фото.jpg"
```

Expected: ответ `{"uploaded":[{"id":1,"url":"http://localhost:9000/zfind-public/pets/1/….jpg","position":0}],"failed":[]}`; URL из ответа открывается в браузере и показывает картинку; `GET http://localhost:3000/api/pets/1` возвращает массив `photos`.

Проверьте и отказ: загрузка `.txt`-файла → 422, фото к чужому питомцу (второй пользователь) → 403.

- [ ] **Step 3: Commit**

```bash
git add src/modules/pets/pets.controller.ts
git commit -m "Added pet photo endpoints"
```

---

### Task 9: Аватар пользователя (TDD)

**Files:**
- Modify: `src/modules/users/users.service.ts`
- Modify: `src/modules/users/users.controller.ts`
- Modify: `src/modules/users/users.module.ts`
- Test: `src/modules/users/users.avatar.spec.ts`

- [ ] **Step 1: Написать падающий тест — `users.avatar.spec.ts`**

```typescript
import { Test } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../../libs/database/prisma.service';
import { FilesService } from '../files/files.service';

describe('UsersService.setAvatar', () => {
  let service: UsersService;

  const prisma = {
    user: { findUniqueOrThrow: jest.fn(), update: jest.fn() },
  };
  const filesService = {
    uploadPublic: jest.fn(),
    delete: jest.fn(),
    url: jest.fn().mockResolvedValue('http://avatar-url'),
  };

  const multerFile = {
    buffer: Buffer.from('img'),
    mimetype: 'image/png',
    size: 3,
    originalname: 'me.png',
  } as Express.Multer.File;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        { provide: FilesService, useValue: filesService },
      ],
    }).compile();
    service = module.get(UsersService);
  });

  it('uploads new avatar, updates user, then deletes the old file', async () => {
    prisma.user.findUniqueOrThrow.mockResolvedValue({ id: 7, avatarId: 3 });
    filesService.uploadPublic.mockResolvedValue({ id: 15 });

    const result = await service.setAvatar(7, multerFile);

    expect(filesService.uploadPublic).toHaveBeenCalledWith('avatars', 7, multerFile, 7);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { avatarId: 15 },
    });
    expect(filesService.delete).toHaveBeenCalledWith(3);
    expect(prisma.user.update.mock.invocationCallOrder[0]).toBeLessThan(
      filesService.delete.mock.invocationCallOrder[0],
    );
    expect(result).toEqual({ avatarUrl: 'http://avatar-url' });
  });

  it('does not try to delete anything when user had no avatar', async () => {
    prisma.user.findUniqueOrThrow.mockResolvedValue({ id: 7, avatarId: null });
    filesService.uploadPublic.mockResolvedValue({ id: 15 });

    await service.setAvatar(7, multerFile);

    expect(filesService.delete).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `npm test -- src/modules/users/users.avatar.spec.ts`
Expected: FAIL — `setAvatar` не существует (и DI не находит FilesService).

- [ ] **Step 3: Реализация**

В `users.service.ts` — добавить `FilesService` в конструктор и метод `setAvatar`:

```typescript
// к импортам:
import { FilesService } from '../files/files.service';

// конструктор:
constructor(
  private prisma: PrismaService,
  private filesService: FilesService,
) {}

// новый метод:
async setAvatar(userId: number, file: Express.Multer.File) {
  const user = await this.prisma.user.findUniqueOrThrow({
    where: { id: userId },
  });

  const uploaded = await this.filesService.uploadPublic('avatars', userId, file, userId);
  await this.prisma.user.update({
    where: { id: userId },
    data: { avatarId: uploaded.id },
  });

  if (user.avatarId) {
    await this.filesService.delete(user.avatarId);
  }

  return { avatarUrl: await this.filesService.url(uploaded) };
}
```

Порядок «сначала новый, потом удалить старый» — осознанный: при сбое пользователь остаётся со старым аватаром, а не без аватара.

В `users.module.ts` — добавить `FilesModule` в imports:

```typescript
import { FilesModule } from '../files/files.module';

@Module({
  controllers: [UsersController],
  providers: [UsersService],
  imports: [PrismaModule, FilesModule],
  exports: [UsersService]
})
export class UsersModule {}
```

В `users.controller.ts` — добавить ручку (и импорты):

```typescript
// к импортам @nestjs/common добавить: Put, UseInterceptors, UploadedFile
import { FileInterceptor } from '@nestjs/platform-express';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { imageFilePipe } from '../../shared/pipes/image-file.pipe';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

// новая ручка:
@Put('me/avatar')
@UseInterceptors(FileInterceptor('file'))
setAvatar(
  @GetUser() user: JwtPayload,
  @UploadedFile(imageFilePipe()) file: Express.Multer.File,
) {
  return this.usersService.setAvatar(user.id, file);
}
```

- [ ] **Step 4: Убедиться, что все тесты проходят**

Run: `npm test`
Expected: PASS — все спеки, включая новые.

- [ ] **Step 5: Ручная проверка**

```bash
curl -s -X PUT http://localhost:3000/api/users/me/avatar \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/путь/к/фото.jpg"
```

Expected: `{"avatarUrl":"http://localhost:9000/zfind-public/avatars/…"}`; повторная загрузка возвращает новый URL, а старый объект исчезает из бакета (консоль MinIO → zfind-public/avatars/…).

- [ ] **Step 6: Commit**

```bash
git add src/modules/users
git commit -m "Added user avatar upload"
```

---

### Task 10: E2e happy path

**Files:**
- Create: `test/files.e2e-spec.ts`

Перед запуском должны быть подняты Postgres и MinIO (`docker compose up -d`).

- [ ] **Step 1: Создать `files.e2e-spec.ts`**

```typescript
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

// минимальный валидный JPEG 1×1 — magic bytes настоящие, иначе FileTypeValidator отклонит
const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==',
  'base64',
);

describe('Pet photos (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let petId: number;
  const email = `photo-e2e-${Date.now()}@example.com`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    await request(app.getHttpServer())
      .post('/api/auth/sign-up')
      .send({ email, password: 'secret123', name: 'E2e' })
      .expect(201);

    const signIn = await request(app.getHttpServer())
      .post('/api/auth/sign-in')
      .send({ email, password: 'secret123' })
      .expect(201);
    token = signIn.body.access_token;

    const pet = await request(app.getHttpServer())
      .post('/api/pets')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Барсик' })
      .expect(201);
    petId = pet.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('uploads a photo and returns its public URL', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/pets/${petId}/photos`)
      .set('Authorization', `Bearer ${token}`)
      .attach('files', TINY_JPEG, 'cat.jpg')
      .expect(201);

    expect(res.body.failed).toHaveLength(0);
    expect(res.body.uploaded).toHaveLength(1);
    expect(res.body.uploaded[0]).toMatchObject({ position: 0 });
    expect(res.body.uploaded[0].url).toMatch(
      new RegExp(`/zfind-public/pets/${petId}/[0-9a-f-]{36}\\.jpg$`),
    );
  });

  it('returns photos in pet details', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/pets/${petId}`)
      .expect(200);

    expect(res.body.photos).toHaveLength(1);
  });

  it('rejects a non-image file with 422', async () => {
    await request(app.getHttpServer())
      .post(`/api/pets/${petId}/photos`)
      .set('Authorization', `Bearer ${token}`)
      .attach('files', Buffer.from('just text'), 'not-image.txt')
      .expect(422);
  });
});
```

Если поле в ответе sign-in называется иначе (посмотрите `auth.service.ts`) — поправьте `signIn.body.access_token`.

- [ ] **Step 2: Запустить**

Run: `npm run test:e2e -- test/files.e2e-spec.ts`
Expected: PASS, 3 теста.

- [ ] **Step 3: Прогнать всё напоследок**

Run: `npm run build && npm test && npm run test:e2e`
Expected: всё зелёное.

- [ ] **Step 4: Commit**

```bash
git add test/files.e2e-spec.ts
git commit -m "Added pet photos e2e test"
```

---

## Готово — критерии приёмки

- `POST /api/pets/:id/photos` грузит 1–10 изображений, отвечает `{uploaded, failed}`, позиции последовательные.
- URL фото открывается в браузере напрямую (без API и токена).
- `PUT /api/users/me/avatar` заменяет аватар, старый файл исчезает из MinIO.
- Чужой питомец → 403; не-изображение → 422; лимит 10 → 422; несуществующий питомец → 404.
- Удаление фото сдвигает позиции; удаление питомца чистит его файлы из MinIO.
- Все юнит- и e2e-тесты зелёные.
