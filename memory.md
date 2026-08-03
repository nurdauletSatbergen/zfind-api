# Memory — Swagger/OpenAPI интеграция

Last updated: 2026-08-01 (обновлено после Task 9 — JSDoc-описания)

## Дополнение: Task 9 (описания эндпоинтов)

- Все 42 эндпоинта получили русские JSDoc summary/@remarks
  (коммиты bcef099, 0b18f65) — introspectComments превращает их в
  описания операций. Проверено на временном сервере: 42/42.
- Грабли плагина: JSDoc игнорируется, если между ним и методом есть
  `//`-комментарий. TODO перенесён в тело pets.findAll, маркеры секций
  `// --- админские/пользовательские ---` из notifications удалены
  (их смысл теперь в @remarks).
- **ВАЖНО: дев-сервер пользователя (`nest start --watch`) запущен
  30 июля — ДО добавления плагина в nest-cli.json. Его инкрементальные
  пересборки идут БЕЗ плагина → summary/схемы пропадают из /docs после
  каждой его пересборки. Пользователю нужно перезапустить start:dev.**

## What was built

Ветка `feature/open-api`, 12 коммитов (87ff996..32864eb), НЕ смерджена — решение
владельца «оставить как есть». Финальный ревью: Ready to merge.

- `@nestjs/swagger` + CLI-плагин в `nest-cli.json`
  (`classValidatorShim`, `introspectComments`)
- `src/main.ts`: Swagger UI на `/docs`, спека на `/docs-json`, только при
  `NODE_ENV !== 'production'`; `operationIdFactory` → id вида `Pets_create`;
  версия из `process.env.npm_package_version`
- `@ApiTags` на всех 7 контроллерах; `@ApiBearerAuth` точно по реальным
  `@Public()` (в pets — по-методно)
- `SignInDto` (docs-only, тело читает LocalAuthGuard) + `@ApiBody` на sign-in
- Response-DTO: auth (`AuthTokenDto`, `ProfileDto`), users (`UserDto`,
  `UserWithSettingDto`, `UserDetailDto`, `UserSettingDto`), pets (`PetDto`,
  `PetWithPhotosDto`, `PetPhotoDto`, `SightingDto`, `LostEpisodeDto`,
  `PublicPetDto` interface→class, `PublicStatsDto`), roles/permissions
  (`RoleDto`, `PermissionDto`)
- Точечные `@ApiNotFoundResponse`/`@ApiConflictResponse`
- Спека и план: `docs/superpowers/specs/2026-08-01-swagger-openapi-design.md`,
  `docs/superpowers/plans/2026-08-01-swagger-openapi.md`

## Decisions made

- Вариант A (CLI-плагин + точечные декораторы), не ручные @ApiProperty и не
  spec-first.
- Nullable-поля в response-DTO — явный `@ApiProperty({ nullable: true, type })`:
  плагин не выводит nullable из union-типов. Prisma Decimal → `string` в DTO.
- **Утечка пароля исправлена**: `/users` create/findAll/findOne/update/remove
  возвращали bcrypt-хэш. Срезано деструктуризацией НА УРОВНЕ КОНТРОЛЛЕРА;
  `users.service.findOne` намеренно не тронут — он отдаёт хэш
  `auth.validateUser` для логина.
- `RolesService.update/remove` получили `include: { permissions: true }` —
  чтобы ответ соответствовал `RoleDto` (как остальные 4 метода).
- `pets.update` — заглушка (возвращает строку): без response/404 аннотаций,
  задокументируем вместе с реализацией.

## Problems solved

- `PublicPetDto` был interface — плагин не строит схемы из интерфейсов;
  конвертирован в класс, `lost-mode.service` компилируется без правок
  (структурная типизация, объект-литерал).
- Прямой импорт `../package.json` в main.ts сломал бы рантайм-резолв
  (entry — `dist/src/main.js` → `dist/package.json` не существует), поэтому
  версия — через `npm_package_version` с фолбэком.

## Current state

- Всё работает: /docs 200 в dev, 404 в prod (проверено на PORT=3001);
  кодогенерация `npx openapi-typescript` из /docs-json проходит, 42 операции.
- Известные мелочи (осознанно не сделано): operationId публичных роутов —
  `PetsPublic_*` при теге `public` (имя класса); notifications без
  response-DTO и без 404 на :id (остаточный скоуп по спеке); prod-гейт
  требует `NODE_ENV=production` в окружении деплоя (в .env его нет);
  pre-existing lint-долг вне ветки (8 eslint-ошибок, prettier в
  notifications.module.ts).

## Next session starts with

1. Решить судьбу `feature/open-api`: merge в main или PR.
2. Опционально: реализовать `PetsService.update` (сейчас заглушка) и
   задокументировать его; response-DTO для notifications.
3. Из старой памяти (июль): решить про связи `User`↔`UserSetting`/`Post` — 
   и незакоммиченную ветку `feature/crud-prisma`, если она ещё жива.

## Open questions

- TODO в pets.controller: `findAll`/`findOne` публичные и отдают сущность
  целиком (publicCode, rewardAmount) — сузить выдачу отдельной задачей.
- Глобальный `PrismaClientExceptionFilter` vs точечные try/catch — идея
  из июльской сессии, всё ещё актуальна.
