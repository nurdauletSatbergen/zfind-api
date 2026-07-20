# Загрузка файлов в MinIO — дизайн

Дата: 2026-07-19
Статус: утверждён

## Цель

Дать zfind-api универсальный фундамент для хранения файлов в MinIO:
сейчас — фото питомцев (несколько на питомца) и аватары пользователей
(публичные), в будущем — приватные документы. Загрузка идёт через API
(Multer), раздача публичных файлов — напрямую с MinIO.

## Ключевые решения

| Решение | Выбор | Отклонённые альтернативы |
|---|---|---|
| Механизм загрузки | Через API (multipart → Multer → MinIO) | Presigned PUT с клиента (сложнее, валидация постфактум; можно добавить позже — архитектура не блокирует) |
| Учёт файлов | Одна таблица `File` на все файлы | Таблица файлов на каждую сущность (дублирование метаданных, нет единого учёта — так не делает ни один крупный фреймворк); без БД вообще (нет прав доступа) |
| Привязка к сущностям | Модели-связки в доменных модулях (`PetPhoto`), для 1:1 — FK-колонка (`User.avatarId`) | Полиморфизм `entityType`+`entityId` (Prisma не поддерживает, нет FK-целостности); nullable FK в `File` (таблица растёт с каждой сущностью) |
| Бакеты | По уровню доступа: `zfind-public`, `zfind-private`; смысл — в префиксах ключей | Бакет на категорию (`zfind-pets`, …) — дублирует ось доступа, больше объектов управления |
| Модульная структура | `libs/storage` (инфра) → `modules/files` (логика) → доменные эндпоинты | Generic `POST /files` + attach (двухшаговый протокол, сироты); всё в одном StorageModule (бизнес-логика в libs) |

### Prior art (на чём основаны решения)

Схема повторяет Rails Active Storage, переведённый на Prisma:
`File` ≈ `active_storage_blobs`, `PetPhoto` ≈ `active_storage_attachments`,
но с настоящими FK вместо полиморфной пары `record_type`+`record_id`.
Тот же паттерн «одна таблица файлов + привязки»: Laravel Spatie
MediaLibrary (`media` с `collection_name` и `order_column` — аналоги
нашего префикса scope и `position`), Strapi (`files` +
`files_related_morphs`), WordPress, GitLab, Discourse. Контрпример —
Django (`FileField`-колонка, без центральной таблицы) — платит
отсутствием учёта и чистки сирот.

Правило для будущих категорий: связь 1:N или связь с собственными
данными (порядок, подпись, статус) → своя модель-связка в фичевом
модуле; связь 1:1 без данных → FK-колонка (как `UserSetting.userId`).
Обратные стороны связей в модели `File` — виртуальные поля Prisma
(+1 строка на категорию), колонок в таблице `files` они не создают.

## Схема Prisma

```prisma
enum FileVisibility {
  PUBLIC
  PRIVATE
}

model File {
  id           Int            @id @default(autoincrement())
  bucket       String                            // zfind-public | zfind-private
  key          String         @unique            // pets/42/9f3c1b7e….jpg
  mimeType     String
  size         Int
  visibility   FileVisibility @default(PUBLIC)
  uploadedBy   User?          @relation("uploaded_files", fields: [uploadedById], references: [id], onDelete: SetNull)
  uploadedById Int?
  createdAt    DateTime       @default(now())

  petPhoto     PetPhoto?                         // виртуальные обратные стороны,
  avatarOfUser User?          @relation("user_avatar") // объявляются доменом

  @@map("files")
}

model PetPhoto {
  id       Int  @id @default(autoincrement())
  pet      Pet  @relation(fields: [petId], references: [id], onDelete: Cascade)
  petId    Int                                   // без @unique → у питомца много фото
  file     File @relation(fields: [fileId], references: [id])
  fileId   Int  @unique                          // файл занят ровно одной связкой
  position Int  @default(0)                      // порядок в галерее; 0 = главное фото

  @@map("pet_photos")
}

// User: + avatar File? @relation("user_avatar", fields: [avatarId], references: [id])
//       + avatarId Int? @unique
//       + uploadedFiles File[] @relation("uploaded_files")
// Pet:  + photos PetPhoto[]
```

Ключ объекта: `{scope}/{entityId}/{uuid}.{ext}` (`pets/42/…jpg`,
`avatars/7/…png`). Расширение выводится из mime-типа, не из имени файла.

## Структура модулей

```
src/libs/storage/                  инфраструктура (@Global, образец — PrismaModule)
  storage.module.ts
  minio.service.ts                 обёртка над Minio.Client (пакет `minio`):
                                   upload / remove / publicUrl / presignedGetUrl;
                                   onModuleInit: bucketExists → makeBucket +
                                   anonymous read-only policy на zfind-public
  storage.constants.ts             PUBLIC_BUCKET, PRIVATE_BUCKET, policy JSON

src/modules/files/                 фича «файлы» — БЕЗ контроллера
  files.module.ts                  экспортирует FilesService
  files.service.ts                 uploadPublic(scope, entityId, file, userId),
                                   delete(fileId), url(file);
                                   единственная точка записи в таблицу File
  entities/file.entity.ts

src/modules/pets/                  правки существующего модуля
  pets.controller.ts               + POST /:id/photos (FilesInterceptor, до 10),
                                   + DELETE /:id/photos/:photoId
  pets.service.ts                  + addPhotos(), removePhoto();
                                   remove() питомца сначала удаляет файлы

src/modules/users/                 правки существующего модуля
  users.controller.ts              + PUT /me/avatar (FileInterceptor)
  users.service.ts                 + setAvatar()

docker-compose.yml                 minio + volume (dev)
.env                               MINIO_ENDPOINT, MINIO_PORT, MINIO_USE_SSL,
                                   MINIO_ACCESS_KEY, MINIO_SECRET_KEY,
                                   MINIO_PUBLIC_URL
```

У `FilesModule` нет контроллера: файлы доступны снаружи только через
доменные эндпоинты — файл всегда привязан к сущности с проверкой прав
в момент загрузки.

## API

```
PUT    /users/me/avatar            multipart "file"        → { avatarUrl }
POST   /pets/:id/photos            multipart "files" ×1–10 → PhotoResponseDto[]
GET    /pets/:id                   → photos: [{ id, url, position }] по position
DELETE /pets/:id/photos/:photoId   → 204
```

Все — под существующим JWT-guard. Валидация каждого файла:
`ParseFilePipeBuilder` — mime `image/(jpeg|png|webp)` по magic bytes
содержимого, размер ≤ 10 МБ. Лимит фото на питомца: 10
(константа `MAX_PET_PHOTOS`).

## Потоки

**Загрузка фото** (`POST /pets/42/photos`): guard → Multer (memory) →
валидация каждого файла → `pet.ownerId === user.id` (иначе 403) →
`текущее число фото + files.length ≤ 10` проверяется до загрузки
(иначе 422, ни один файл не заливается) → для каждого файла:
объект в MinIO → строка `File` → строка `PetPhoto` со следующим
`position`. Каждый файл фиксируется независимо: упал пятый — первые
четыре сохранены, ответ сообщает что загрузилось.

**Раздача**: публичные файлы браузер грузит напрямую с MinIO по
`{MINIO_PUBLIC_URL}/{bucket}/{key}` (anonymous read-only policy),
API в раздаче не участвует. Приватные (будущее) — presignedGetUrl
с истечением срока.

**Замена аватара** (`PUT /users/me/avatar`): загрузить новый →
обновить `user.avatarId` → удалить старый (объект + строка) только
после успеха — при сбое пользователь не остаётся без аватара.

**Удаление фото**: проверка владельца → объект из MinIO → строка
`File` (строка `PetPhoto` уходит каскадом) → у фото правее
удалённого `position` сдвигается на −1; главным становится следующее.

**Удаление питомца**: `PetsService.remove()` сначала удаляет фото
через `FilesService`, затем питомца. На каскады БД для файлов не
полагаемся — MinIO про них не знает.

## Консистентность

Строка `File` — источник истины. Объект в MinIO без строки —
допустимый мусор; строка без объекта — недопустима. Отсюда порядок:
запись — сначала MinIO, потом БД (упала БД → компенсация: удалить
объект, пробросить ошибку); удаление — сначала MinIO, потом БД.
Фоновый чистильщик сирот сейчас не делаем (YAGNI).

## Обработка ошибок

| Ситуация | Ответ |
|---|---|
| Не изображение / битый файл (magic bytes) | 422 из ParseFilePipe |
| Файл > 10 МБ | 422 |
| Питомец не найден | 404 (паттерн P2025) |
| Питомец чужой | 403 ForbiddenException |
| Превышен лимит 10 фото | 422 с сообщением |
| MinIO недоступен | 503 ServiceUnavailableException (ловим в FilesService) |
| MinIO ok, БД упала | компенсация + проброс ошибки |

## Тестирование

- Юнит `FilesService` (моки MinioService/PrismaService): генерация
  ключа, компенсация при падении БД, выбор public/presigned URL.
- Юнит `PetsService.addPhotos` / `UsersService.setAvatar`: 403 чужой
  питомец, лимит фото, порядок замены аватара.
- E2e: happy path загрузки через supertest `.attach()` с MinIO из
  docker-compose; скип, если MinIO не поднят.

## Вне скоупа (сознательно)

Ресайз/тумбнейлы (sharp), presigned upload, CDN, антивирус, фоновая
чистка сирот, перестановка фото (`PATCH /pets/:id/photos/order` —
схема готова, добавится при необходимости).
