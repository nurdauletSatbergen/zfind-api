# Swagger/OpenAPI Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Подключить Swagger UI (`/docs`) и OpenAPI-спеку (`/docs-json`) к zfind-api с точными схемами запросов/ответов, пригодными для кодогенерации типизированного клиента.

**Architecture:** CLI-плагин `@nestjs/swagger` генерирует схемы из TS-типов DTO и декораторов class-validator на этапе сборки. Вручную добавляются: bootstrap в `main.ts` (только вне production), `@ApiTags`/`@ApiBearerAuth` на контроллеры, response-DTO классы + `@ApiOkResponse`/`@ApiCreatedResponse` на эндпоинты. Спека: `docs/superpowers/specs/2026-08-01-swagger-openapi-design.md`.

**Tech Stack:** NestJS 11 (Express), `@nestjs/swagger`, class-validator, Prisma 7.

**Тестирование:** в этом проекте юнит-тесты не пишем (предпочтение владельца) — каждая задача проверяется `npm run build` и/или smoke-проверкой через запущенное приложение. Финальная проверка — Task 8.

**Важно про response-DTO:** это документирующие классы, рантайм не меняется. Поля с `null` в ответах помечаем `@ApiProperty({ nullable: true })` — CLI-плагин сам nullable из union-типов не выводит. Prisma `Decimal` сериализуется в JSON как строка → в DTO это `string`.

---

### Task 1: Установка пакета и CLI-плагина

**Files:**
- Modify: `package.json` (через npm install)
- Modify: `nest-cli.json`

- [ ] **Step 1: Установить @nestjs/swagger**

```bash
npm install --save @nestjs/swagger
```

- [ ] **Step 2: Включить CLI-плагин в nest-cli.json**

Заменить содержимое `nest-cli.json` на:

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "deleteOutDir": true,
    "plugins": [
      {
        "name": "@nestjs/swagger",
        "options": {
          "classValidatorShim": true,
          "introspectComments": true
        }
      }
    ]
  }
}
```

- [ ] **Step 3: Проверить сборку**

Run: `npm run build`
Expected: сборка проходит без ошибок (плагин подхватывается, существующие DTO компилируются).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json nest-cli.json
git commit -m "feat(swagger): install @nestjs/swagger and enable CLI plugin"
```

---

### Task 2: Bootstrap Swagger в main.ts

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Добавить настройку Swagger (только вне production)**

Заменить содержимое `src/main.ts` на:

```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('zfind API')
      .setVersion('0.0.1')
      .addBearerAuth()
      .build();
    const documentFactory = () =>
      SwaggerModule.createDocument(app, config, {
        operationIdFactory: (controllerKey, methodKey) =>
          `${controllerKey.replace(/Controller$/, '')}_${methodKey}`,
      });
    SwaggerModule.setup('docs', app, documentFactory);
  }

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
```

Примечания:
- `operationIdFactory` даёт уникальные читаемые id: `Pets_create`, `Auth_signIn` — под кодогенерацию.
- Пути в спеке автоматически включают глобальный префикс `/api`.
- UI: `http://localhost:3000/docs`, JSON-спека: `http://localhost:3000/docs-json`.

- [ ] **Step 2: Smoke-проверка**

Run: `npm run start:dev` (в фоне), затем:

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/docs
```

Expected: `200`.

```bash
curl -s http://localhost:3000/docs-json | head -c 300
```

Expected: JSON, начинающийся с `{"openapi":"3...`, в `paths` видны `/api/...` роуты.

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "feat(swagger): bootstrap Swagger UI at /docs outside production"
```

---

### Task 3: SignInDto и аннотации auth-контроллера

**Files:**
- Create: `src/modules/auth/dto/sign-in.dto.ts`
- Modify: `src/modules/auth/auth.controller.ts`

- [ ] **Step 1: Создать SignInDto**

`src/modules/auth/dto/sign-in.dto.ts`:

```typescript
import { IsEmail, IsString } from 'class-validator';

export class SignInDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}
```

- [ ] **Step 2: Аннотировать AuthController**

В `src/modules/auth/auth.controller.ts`:

Добавить импорты:

```typescript
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import { SignInDto } from './dto/sign-in.dto';
```

Навесить декораторы:
- `@ApiTags('auth')` на класс (над `@Controller('auth')`);
- `@ApiBody({ type: SignInDto })` на метод `signIn` (тело читает `LocalAuthGuard`, DTO нужен только для схемы — поведение не меняется);
- `@ApiBearerAuth()` на метод `getProfile` (единственный защищённый роут контроллера).

Результат:

```typescript
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @UseGuards(LocalAuthGuard)
  @ApiBody({ type: SignInDto })
  @Post('sign-in')
  signIn(@GetUser() user: Omit<User, 'password'>) {
    return this.authService.signIn(user);
  }

  @Public()
  @Post('sign-up')
  signUp(@Body() createUserDto: CreateUserDto) {
    return this.authService.signUp(createUserDto);
  }

  @ApiBearerAuth()
  @Get('profile')
  getProfile(@GetUser() user: JwtPayload) {
    return this.authService.getProfile(user.id);
  }
}
```

- [ ] **Step 3: Проверить сборку**

Run: `npm run build`
Expected: без ошибок.

- [ ] **Step 4: Commit**

```bash
git add src/modules/auth
git commit -m "feat(swagger): annotate auth controller, add SignInDto for docs"
```

---

### Task 4: @ApiTags и @ApiBearerAuth на остальных контроллерах

**Files:**
- Modify: `src/modules/users/users.controller.ts`
- Modify: `src/modules/roles/roles.controller.ts`
- Modify: `src/modules/permissions/permissions.controller.ts`
- Modify: `src/modules/notifications/notifications.controller.ts`
- Modify: `src/modules/pets/pets.controller.ts`
- Modify: `src/modules/pets/pets-public.controller.ts`

- [ ] **Step 1: Полностью защищённые контроллеры — декораторы на класс**

В каждом из четырёх файлов добавить импорт и два декоратора над `@Controller(...)`:

```typescript
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
```

- `users.controller.ts` → `@ApiTags('users')` + `@ApiBearerAuth()`
- `roles.controller.ts` → `@ApiTags('roles')` + `@ApiBearerAuth()`
- `permissions.controller.ts` → `@ApiTags('permissions')` + `@ApiBearerAuth()`
- `notifications.controller.ts` → `@ApiTags('notifications')` + `@ApiBearerAuth()`

Образец (users):

```typescript
@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
```

- [ ] **Step 2: PetsController — тег на класс, bearer на защищённые методы**

`findAll` и `findOne` помечены `@Public()` — класс-уровневый `@ApiBearerAuth()` наврал бы в доке. Поэтому:

```typescript
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
```

- `@ApiTags('pets')` на класс;
- `@ApiBearerAuth()` на каждый из методов: `create`, `update`, `changeStatus`, `listSightings`, `listLostEpisodes`, `remove`, `addPhotos`, `removePhoto` (все, кроме `findAll` и `findOne`).

- [ ] **Step 3: PetsPublicController — только тег**

```typescript
import { ApiTags } from '@nestjs/swagger';
```

`@ApiTags('public')` на класс. `@ApiBearerAuth()` не добавлять — все роуты публичные.

- [ ] **Step 4: Проверить сборку и UI**

Run: `npm run build`
Expected: без ошибок.

Smoke: открыть `http://localhost:3000/docs` — эндпоинты сгруппированы по тегам `auth`, `users`, `roles`, `permissions`, `pets`, `public`, `notifications`; кнопка Authorize принимает bearer-токен; у защищённых роутов — иконка замка.

- [ ] **Step 5: Commit**

```bash
git add src/modules
git commit -m "feat(swagger): add ApiTags and ApiBearerAuth across controllers"
```

---

### Task 5: Response-DTO — auth и users

**Files:**
- Create: `src/modules/auth/dto/auth-token.dto.ts`
- Create: `src/modules/auth/dto/profile.dto.ts`
- Create: `src/modules/users/dto/user.dto.ts`
- Create: `src/modules/users/dto/user-setting.dto.ts`
- Modify: `src/modules/auth/auth.controller.ts`
- Modify: `src/modules/users/users.controller.ts`

- [ ] **Step 1: AuthTokenDto**

`src/modules/auth/dto/auth-token.dto.ts` (форма — из `AuthService.signIn`/`signUp`):

```typescript
export class AuthTokenDto {
  access_token: string;
}
```

- [ ] **Step 2: UserDto и UserSettingDto**

`src/modules/users/dto/user.dto.ts` (модель `User` без `password`):

```typescript
import { ApiProperty } from '@nestjs/swagger';

export class UserDto {
  id: number;

  email: string;

  @ApiProperty({ nullable: true, type: String })
  name: string | null;

  @ApiProperty({ nullable: true, type: String })
  phone: string | null;

  createdAt: Date;

  updatedAt: Date;

  @ApiProperty({ nullable: true, type: Number })
  roleId: number | null;

  @ApiProperty({ nullable: true, type: Number })
  avatarId: number | null;
}
```

`src/modules/users/dto/user-setting.dto.ts` (модель `UserSetting`):

```typescript
export class UserSettingDto {
  id: number;
  notificationsOn: boolean;
  smsEnabled: boolean;
  userId: number;
}
```

- [ ] **Step 3: ProfileDto**

`src/modules/auth/dto/profile.dto.ts` (форма — из `AuthService.getProfile`: user без password + userSetting + плоские role/permissions):

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { UserDto } from '../../users/dto/user.dto';

export class ProfileSettingDto {
  smsEnabled: boolean;
  notificationsOn: boolean;
}

export class ProfileDto extends UserDto {
  @ApiProperty({ nullable: true, type: ProfileSettingDto })
  userSetting: ProfileSettingDto | null;

  @ApiProperty({ nullable: true, type: String })
  role: string | null;

  permissions: string[];
}
```

- [ ] **Step 4: Аннотировать эндпоинты auth**

В `src/modules/auth/auth.controller.ts` добавить к импортам из `@nestjs/swagger`: `ApiCreatedResponse`, `ApiOkResponse`; импортировать `AuthTokenDto`, `ProfileDto`:

- `signIn` → `@ApiCreatedResponse({ type: AuthTokenDto })`
- `signUp` → `@ApiCreatedResponse({ type: AuthTokenDto })`
- `getProfile` → `@ApiOkResponse({ type: ProfileDto })`

- [ ] **Step 5: Аннотировать эндпоинты users**

В `src/modules/users/users.controller.ts` добавить импорты `ApiCreatedResponse`, `ApiOkResponse` из `@nestjs/swagger`, `UserDto`, `UserSettingDto` из `./dto/...`:

- `create` → `@ApiCreatedResponse({ type: UserDto })`
- `findAll` → `@ApiOkResponse({ type: UserDto, isArray: true })`
- `findOne` → `@ApiOkResponse({ type: UserDto })`
- `update` → `@ApiOkResponse({ type: UserDto })`
- `remove` → `@ApiOkResponse({ type: UserDto })`
- `updateUserSettings` → `@ApiOkResponse({ type: UserSettingDto })`

- [ ] **Step 6: Проверить сборку**

Run: `npm run build`
Expected: без ошибок.

- [ ] **Step 7: Commit**

```bash
git add src/modules/auth src/modules/users
git commit -m "feat(swagger): response DTOs for auth and users"
```

---

### Task 6: Response-DTO — pets (приватный и публичный контроллеры)

**Files:**
- Create: `src/modules/pets/dto/pet.dto.ts`
- Create: `src/modules/pets/dto/pet-photo.dto.ts`
- Create: `src/modules/pets/dto/sighting.dto.ts`
- Create: `src/modules/pets/dto/lost-episode.dto.ts`
- Create: `src/modules/pets/dto/public-stats.dto.ts`
- Modify: `src/modules/pets/dto/public-pet.dto.ts` (interface → class)
- Modify: `src/modules/pets/pets.controller.ts`
- Modify: `src/modules/pets/pets-public.controller.ts`

- [ ] **Step 1: PetDto и PetPhotoDto**

`src/modules/pets/dto/pet.dto.ts` (модель `Pet`; `rewardAmount` — Prisma Decimal → строка в JSON):

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { PetPhotoDto } from './pet-photo.dto';

export class PetDto {
  id: number;

  name: string;

  ownerId: number;

  @ApiProperty({ enum: ['HOME', 'LOST'] })
  status: 'HOME' | 'LOST';

  publicCode: string;

  @ApiProperty({ nullable: true, type: String })
  rewardAmount: string | null;
}

export class PetWithPhotosDto extends PetDto {
  photos: PetPhotoDto[];
}
```

`src/modules/pets/dto/pet-photo.dto.ts` (форма — из `PetsService.findOne`/`addPhotos`):

```typescript
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
```

- [ ] **Step 2: SightingDto и LostEpisodeDto**

`src/modules/pets/dto/sighting.dto.ts` (форма — из `SightingsService.listForOwner`: поля модели без `photoFileId`, плюс `photoUrl`; и из `createPublic`: `{ id, createdAt }`):

```typescript
import { ApiProperty } from '@nestjs/swagger';

export class SightingDto {
  id: number;

  petId: number;

  @ApiProperty({ nullable: true, type: Number })
  lat: number | null;

  @ApiProperty({ nullable: true, type: Number })
  lng: number | null;

  @ApiProperty({ nullable: true, type: String })
  address: string | null;

  @ApiProperty({ nullable: true, type: String })
  comment: string | null;

  @ApiProperty({ nullable: true, type: String })
  reporterPhone: string | null;

  createdAt: Date;

  @ApiProperty({ nullable: true, type: String })
  photoUrl: string | null;
}

export class SightingCreatedDto {
  id: number;
  createdAt: Date;
}
```

`src/modules/pets/dto/lost-episode.dto.ts` (модель `LostEpisode`):

```typescript
import { ApiProperty } from '@nestjs/swagger';

export class LostEpisodeDto {
  id: number;

  petId: number;

  lostAt: Date;

  @ApiProperty({ nullable: true, type: Date })
  foundAt: Date | null;
}
```

- [ ] **Step 3: PublicPetDto interface → class, PublicStatsDto**

Заменить содержимое `src/modules/pets/dto/public-pet.dto.ts` на:

```typescript
import { ApiProperty } from '@nestjs/swagger';

export class PublicPetDto {
  publicCode: string;

  name: string;

  @ApiProperty({ enum: ['HOME', 'LOST'] })
  status: 'HOME' | 'LOST';

  photos: string[];

  recentlyFound: boolean;

  /** только при status === 'LOST' */
  rewardAmount?: string | null;

  /** только при status === 'LOST' */
  ownerPhone?: string | null;

  /** только при status === 'LOST' */
  lostAt?: Date;
}
```

Класс структурно совместим с интерфейсом — `LostModeService.publicCard(): Promise<PublicPetDto>` продолжит компилироваться без изменений (объект собирается литералом, `new` не нужен).

`src/modules/pets/dto/public-stats.dto.ts` (форма — из `LostModeService.stats`):

```typescript
export class PublicStatsDto {
  reunions: number;
  searching: number;
}
```

- [ ] **Step 4: Аннотировать PetsController**

Импорты в `src/modules/pets/pets.controller.ts` (дополнить существующий импорт из `@nestjs/swagger`): `ApiCreatedResponse`, `ApiOkResponse`; импортировать DTO:

```typescript
import { PetDto, PetWithPhotosDto } from './dto/pet.dto';
import { UploadPhotosResultDto } from './dto/pet-photo.dto';
import { SightingDto } from './dto/sighting.dto';
import { LostEpisodeDto } from './dto/lost-episode.dto';
```

- `create` → `@ApiCreatedResponse({ type: PetDto })`
- `findAll` → `@ApiOkResponse({ type: PetDto, isArray: true })`
- `findOne` → `@ApiOkResponse({ type: PetWithPhotosDto })`
- `update` — НЕ аннотировать: сервисный метод — заглушка, возвращает строку; аннотация появится вместе с реализацией
- `changeStatus` → `@ApiOkResponse({ type: PetDto })`
- `listSightings` → `@ApiOkResponse({ type: SightingDto, isArray: true })`
- `listLostEpisodes` → `@ApiOkResponse({ type: LostEpisodeDto, isArray: true })`
- `addPhotos` → `@ApiCreatedResponse({ type: UploadPhotosResultDto })`
- `remove`, `removePhoto` — ничего: 204 No Content уже корректно выводится из `@HttpCode(204)`

- [ ] **Step 5: Аннотировать PetsPublicController**

Импорты: `ApiCreatedResponse`, `ApiOkResponse` из `@nestjs/swagger`; `PublicPetDto`, `PublicStatsDto`, `SightingCreatedDto` из `./dto/...`:

- `stats` → `@ApiOkResponse({ type: PublicStatsDto })`
- `publicCard` → `@ApiOkResponse({ type: PublicPetDto })`
- `createSighting` → `@ApiCreatedResponse({ type: SightingCreatedDto })`

- [ ] **Step 6: Проверить сборку**

Run: `npm run build`
Expected: без ошибок (в т.ч. `lost-mode.service.ts` с классом `PublicPetDto`).

- [ ] **Step 7: Commit**

```bash
git add src/modules/pets
git commit -m "feat(swagger): response DTOs for pets and public lost-pets endpoints"
```

---

### Task 7: Response-DTO — roles и permissions + точечные ошибки

**Files:**
- Create: `src/modules/permissions/dto/permission.dto.ts`
- Create: `src/modules/roles/dto/role.dto.ts`
- Modify: `src/modules/roles/roles.controller.ts`
- Modify: `src/modules/permissions/permissions.controller.ts`
- Modify: `src/modules/auth/auth.controller.ts` (409 на sign-up)
- Modify: `src/modules/users/users.controller.ts` (404/409)
- Modify: `src/modules/pets/pets.controller.ts` (404)
- Modify: `src/modules/pets/pets-public.controller.ts` (404)

- [ ] **Step 1: PermissionDto и RoleDto**

`src/modules/permissions/dto/permission.dto.ts` (модель `Permission`):

```typescript
export class PermissionDto {
  id: number;
  name: string;
}
```

`src/modules/roles/dto/role.dto.ts` (все методы `RolesService` возвращают роль с `include: { permissions: true }`):

```typescript
import { PermissionDto } from '../../permissions/dto/permission.dto';

export class RoleDto {
  id: number;
  name: string;
  permissions: PermissionDto[];
}
```

- [ ] **Step 2: Аннотировать RolesController**

Импорты: `ApiCreatedResponse`, `ApiOkResponse` (дополнить импорт из `@nestjs/swagger`), `RoleDto` из `./dto/role.dto`:

- `create` → `@ApiCreatedResponse({ type: RoleDto })`
- `findAll` → `@ApiOkResponse({ type: RoleDto, isArray: true })`
- `findOne` → `@ApiOkResponse({ type: RoleDto })`
- `setPermissions` → `@ApiOkResponse({ type: RoleDto })`
- `update` → `@ApiOkResponse({ type: RoleDto })`
- `remove` → `@ApiOkResponse({ type: RoleDto })`

- [ ] **Step 3: Аннотировать PermissionsController**

По той же схеме с `PermissionDto` — `@ApiCreatedResponse({ type: PermissionDto })` на create, `@ApiOkResponse({ type: PermissionDto, isArray: true })` на findAll, `@ApiOkResponse({ type: PermissionDto })` на остальные CRUD-методы.

- [ ] **Step 4: Точечные аннотации ошибок**

Стандартный формат ошибки Nest — кастомные схемы не нужны, декораторы без аргументов:

- `auth.controller.ts` / `signUp` → `@ApiConflictResponse({ description: 'Email already registered' })`
- `users.controller.ts` / `findOne`, `update`, `remove`, `updateUserSettings` → `@ApiNotFoundResponse()`; `create` → `@ApiConflictResponse()`
- `roles.controller.ts` / `findOne`, `setPermissions`, `update`, `remove` → `@ApiNotFoundResponse()`
- `pets.controller.ts` / все методы с `:id` → `@ApiNotFoundResponse()`
- `pets-public.controller.ts` / `publicCard`, `createSighting` → `@ApiNotFoundResponse({ description: 'Unknown public code' })`

Импортировать `ApiConflictResponse` / `ApiNotFoundResponse` из `@nestjs/swagger` в соответствующих файлах.

- [ ] **Step 5: Проверить сборку**

Run: `npm run build`
Expected: без ошибок.

- [ ] **Step 6: Commit**

```bash
git add src/modules
git commit -m "feat(swagger): response DTOs for roles/permissions, error annotations"
```

---

### Task 8: Финальный smoke и проверка кодогенерацией

**Files:** нет изменений кода (при ошибках — точечные правки аннотаций из Task 3–7).

- [ ] **Step 1: Поднять приложение**

Run: `npm run start:dev` (в фоне). Дождаться `Nest application successfully started`.

- [ ] **Step 2: Чек-лист в Swagger UI (`http://localhost:3000/docs`)**

- Все 7 тегов на месте: auth, users, roles, permissions, pets, public, notifications.
- `POST /api/auth/sign-in`: схема запроса — `SignInDto` (email, password), ответ 201 — `AuthTokenDto`.
- Authorize: получить токен через sign-in, вставить, вызвать `GET /api/auth/profile` из UI → 200, ответ соответствует `ProfileDto`.
- `GET /api/pets/{id}`: схема ответа `PetWithPhotosDto` с вложенным `photos[]`.
- `GET /api/public/pets/{code}`: схема `PublicPetDto`.
- В схемах запросов видны ограничения из class-validator (required/optional, email formats) — работа CLI-плагина.

- [ ] **Step 3: Проверка спеки кодогенератором**

```bash
npx openapi-typescript http://localhost:3000/docs-json -o /tmp/zfind-api.d.ts
```

Expected: файл сгенерирован без ошибок; в нём есть `operations` с ключами вида `Pets_create`, `Auth_signIn`; у операций непустые `responses` со схемами.

- [ ] **Step 4: Проверить, что в production Swagger выключен**

```bash
NODE_ENV=production npm run start &
sleep 5 && curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/docs
```

Expected: `404`. Остановить процесс после проверки.

- [ ] **Step 5: Финальный commit (если были правки)**

```bash
git add -A src
git commit -m "fix(swagger): smoke-test fixes"
```

Если правок не было — шаг пропустить.
