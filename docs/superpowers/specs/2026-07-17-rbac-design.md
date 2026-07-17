# RBAC с permissions — дизайн

Дата: 2026-07-17
Ветка: feature/many-to-many
Статус: утверждён пользователем

## Цель

Добавить в zfind-api контроль доступа по модели RBAC с permissions:
роль — это именованный контейнер прав, права выдаются ролям в рантайме
через API без деплоя. Паттерн соответствует индустриальному стандарту
(spatie/laravel-permission, Django groups/permissions, Keycloak).

## Утверждённые решения

1. **Модель доступа**: RBAC с permissions (не простой RBAC по именам ролей,
   не CASL/ABAC, не ReBAC).
2. **User ↔ Role**: одна роль на пользователя (`User.roleId`, nullable).
   Many-to-many user_roles не делаем; при необходимости расширяется миграцией.
3. **Источник прав при проверке**: БД по `userId` на каждый защищённый запрос.
   В JWT-payload роль и права НЕ зашиваются — смена прав действует мгновенно.
4. **Ownership**: проверяется точечно в сервисе (не в guard, без CASL):
   `pet.ownerId === user.id || user.permissions.includes('pets:manage-any')`.
5. **Каталог permissions**: таблица `permissions` (уже есть в схеме),
   строки добавляются и через API (`POST /permissions`), и через сид.
   Ограничение принято осознанно: право «работает» только если в коде есть
   соответствующий `@RequirePermissions(...)` — таблица и код синхронизируются
   вручную.
6. **Модули**: два feature-модуля — `permissions` (каталог) и `roles`
   (роли + раздача прав). Оба защищены правом `users:manage`.

## Схема БД

Изменения к `prisma/schema.prisma`:

```prisma
model User {
  // ...существующие поля без изменений
  role   Role? @relation(fields: [roleId], references: [id])
  roleId Int?
}

model Role {
  // ...существующие поля
  users User[]
}
```

- `roleId` nullable: существующие пользователи остаются без роли
  (нет роли = нет прав), миграция без бэкфилла.
- Попутное улучшение: переименовать модель `Permissions` → `Permission`
  (единственное число, конвенция Prisma), таблица остаётся `permissions`
  через `@@map`.
- Связь Role ↔ Permission — существующая implicit many-to-many
  `role_permissions`, не меняется.

### Сид (prisma/seed.ts)

- Permissions: `pets:create`, `pets:read`, `pets:update`, `pets:delete`,
  `pets:manage-any`, `users:read`, `users:manage`.
- Роли: `admin` (все permissions), `user` (`pets:create`, `pets:read`,
  `pets:update`, `pets:delete`).
- Сид идемпотентен (upsert по уникальному `name`).

### Signup

При регистрации новому пользователю назначается роль `user`
(поиск по имени). Если роль не найдена (сид не прогнан) — 500 с понятным
сообщением.

## Компоненты

Shared-инфраструктура (по правилам проекта — в `src/shared/`):

- `src/shared/decorators/require-permissions.decorator.ts` —
  `@RequirePermissions('pets:delete')` через `SetMetadata`
  (тот же паттерн, что существующий `@Public()`).
- `src/shared/guards/permissions.guard.ts` — глобальный guard,
  зарегистрирован через `APP_GUARD` ПОСЛЕ `JwtAuthGuard`. Логика:
  - нет метаданных `@RequirePermissions` на хендлере/классе → пропустить;
  - иначе загрузить из БД пользователя с `role.permissions` по `req.user.id`;
  - положить массив имён прав в `req.user.permissions`;
  - каждое требуемое право должно присутствовать, иначе `ForbiddenException` (403).

Feature-модули:

```
src/modules/permissions/
  permissions.module.ts
  permissions.controller.ts   # POST /permissions, GET /permissions,
                              # DELETE /permissions/:id
  permissions.service.ts
  dto/create-permission.dto.ts

src/modules/roles/
  roles.module.ts
  roles.controller.ts         # POST /roles, GET /roles, GET /roles/:id,
                              # PATCH /roles/:id/permissions, DELETE /roles/:id
  roles.service.ts
  dto/create-role.dto.ts
  dto/set-role-permissions.dto.ts
```

- Все эндпоинты обоих модулей требуют `users:manage`.
- `PATCH /roles/:id/permissions` принимает массив id прав, применяет через
  Prisma `set` по many-to-many (полная замена набора).
- Ошибки Prisma по паттерну из памяти проекта: P2002 → 409 Conflict,
  P2025 → 404 NotFound.

Изменения в существующих модулях:

- `PetsService`: ownership-проверка в `update`/`remove` (403 для чужого
  питомца без `pets:manage-any`).
- `PetsController`: `@RequirePermissions` на мутирующих эндпоинтах.
- `AuthService.signup`: назначение роли `user`.
- `AppModule`: импорт `RolesModule`, `PermissionsModule`.

## Поток запроса

```
Bearer token
  → JwtAuthGuard        (401: нет/невалиден токен; @Public пропускает)
  → PermissionsGuard    (403: не хватает права; без метаданных — пропуск)
  → Controller
  → Service             (403: чужой ресурс без pets:manage-any)
```

## Обработка ошибок

- 401 — отсутствующий/невалидный JWT (существующее поведение).
- 403 — нет требуемого permission или чужой ресурс.
- 404 — роль/permission/pet не найдены (P2025).
- 409 — дубликат имени роли/permission (P2002).
- 500 — роль `user` не найдена при signup (не прогнан сид), с явным сообщением.

## Тестирование

- Unit `PermissionsGuard`: нет метаданных → пропуск; право есть → пропуск;
  права нет → 403; пользователь без роли → 403.
- Unit `PetsService`: владелец редактирует своего → ок; чужого → 403;
  с `pets:manage-any` чужого → ок.
- Unit `RolesService`: `set` permissions заменяет набор полностью.

## Вне скоупа

- Несколько ролей на пользователя (user_roles M2M).
- CASL/ABAC, иерархия ролей, наследование прав.
- Кэширование прав (Redis и т.п.) — при необходимости позже.
- Автогенерация permissions из кода (как в Django).
