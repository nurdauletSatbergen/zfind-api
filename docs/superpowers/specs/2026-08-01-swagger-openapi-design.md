# Swagger / OpenAPI для zfind-api — дизайн

Дата: 2026-08-01
Статус: утверждён

## Цель

Подключить OpenAPI-документацию (Swagger UI) к zfind-api для внутренней
разработки и фронтенда, с полноценной кодогенерацией типизированного
клиента из спеки.

Требования, зафиксированные на брейншторминге:

- Аудитория: разработчик бэкенда + фронтенд-команда.
- Доступность: только вне production (`NODE_ENV !== 'production'`).
- Кодогенерация клиента нужна → обязательны читаемые уникальные
  `operationId` и точные схемы ответов (response-DTO), а не только запросов.

## Выбранный подход

Вариант A: CLI-плагин `@nestjs/swagger` + точечные ручные декораторы.
Плагин на этапе сборки генерирует схемы из TypeScript-типов DTO и
декораторов class-validator. Вручную добавляется только то, что плагин
вывести не может: теги, bearer-auth, response-DTO.

Отклонённые альтернативы:

- Полностью ручные `@ApiProperty` — сотни декораторов, дублирование
  class-validator, схема неизбежно разъедется с кодом.
- Spec-first (OpenAPI YAML отдельно) — код уже написан, ручное описание
  ~40 эндпоинтов без выгоды.

## 1. Подключение (инфраструктура)

- Зависимость: `@nestjs/swagger` (пакет включает swagger-ui-express).
- `nest-cli.json` → `compilerOptions.plugins`:

  ```json
  {
    "name": "@nestjs/swagger",
    "options": { "classValidatorShim": true, "introspectComments": true }
  }
  ```

- `main.ts`: блок за проверкой `NODE_ENV !== 'production'`:
  - `DocumentBuilder`: title «zfind API», version из package.json,
    `.addBearerAuth()`.
  - `SwaggerModule.createDocument(app, config, { operationIdFactory })`,
    где `operationIdFactory = (controllerKey, methodKey) =>
    controllerKey.replace(/Controller$/, '') + '_' + methodKey`
    (примеры: `Pets_create`, `Auth_signIn`) — уникальные читаемые id
    для кодогенератора.
  - UI: `SwaggerModule.setup('docs', app, documentFactory)` →
    `/docs`, сырая спека на `/docs-json`.

## 2. Аннотации контроллеров

- `@ApiTags(...)` на каждый контроллер: `auth`, `users`, `roles`,
  `permissions`, `pets`, `public`, `notifications`, `files`.
- `@ApiBearerAuth()` на защищённые контроллеры (JWT — глобальный гард,
  Swagger о нём не знает). Публичные роуты (`PetsPublicController`,
  `sign-in`, `sign-up`) — без него.
- `SignInDto` (email, password) в `src/modules/auth/dto/`, вешается на
  `sign-in` через `@ApiBody({ type: SignInDto })`. `LocalAuthGuard`
  продолжает читать тело сам — DTO нужен только для схемы,
  рантайм-поведение не меняется.

## 3. Response-DTO (ядро работы под кодогенерацию)

Контроллеры возвращают Prisma-объекты (интерфейсы) — CLI-плагин не может
построить из них схему, ответы в спеке будут пустыми. Поэтому:

- Классы response-DTO в `dto/` соответствующих модулей (следуя структуре
  фичемодулей из CLAUDE.md).
- На эндпоинты — `@ApiOkResponse({ type })` / `@ApiCreatedResponse`.
- Скоуп:
  - auth: `AuthTokenDto`, `ProfileDto`
  - users: `UserDto` (без password)
  - pets: `PetDto`, `SightingDto`, `LostEpisodeDto`; `PublicPetDto`
    уже существует — переиспользуется
  - roles: `RoleDto`; permissions: `PermissionDto`
- Это документирующие классы: сериализация и рантайм-ответы не меняются.

## 4. Ошибки

Точечно, без кастомных схем — стандартного формата ошибок Nest достаточно:

- `@ApiNotFoundResponse` на роуты с `:id`.
- `@ApiConflictResponse` на `sign-up` (дубликат email → 409).
- `@ApiUnauthorizedResponse` подразумевается для bearer-роутов; отдельная
  разметка каждого роута не требуется.

## 5. Проверка (smoke, без юнит-тестов)

1. `npm run start:dev`, открыть `/docs`: все контроллеры видны по тегам,
   Authorize принимает реальный токен, схемы запросов и ответов не пустые.
2. `npx openapi-typescript http://localhost:3000/docs-json -o /tmp/api.d.ts`
   — спека пригодна для кодогенерации, без ошибок.

## Порядок работ

1 (инфраструктура) → 2 (теги/auth) → 3 (response-DTO) → 4 (ошибки) →
5 (smoke). После шага 1 UI уже доступен — прогресс виден сразу.

## Вне скоупа

- Swagger в production (в т.ч. за паролем).
- Версионирование API-документа.
- Настройка самого кодогенератора на стороне фронтенда.
- Файлы/notifications: response-DTO по остаточному принципу — если ответ
  тривиален (например, `{ url }`), допустимо описать при реализации;
  обязательный скоуп — auth, users, pets, roles, permissions.
