# Спецификация: Потеряшки (Lost Mode) — модуль pets

**Дата:** 2026-07-30
**Репозиторий:** `zfind-api` (NestJS + Prisma + PostgreSQL)
**Статус:** согласована владельцем продукта, готова к реализации
**Для кого:** самодостаточный документ для агента/разработчика, реализующего подсистему потеряшек. Контекста переписки не требуется — всё нужное здесь.

---

## 1. Продуктовый контекст

ZFIND — карточка домашнего животного. Подсистема «Потеряшки» решает задачу: **потерявшийся питомец возвращается домой**. Владелец переводит карточку в режим «Потерялся»; любой человек, встретивший питомца (по QR-коду на бирке), открывает публичную страницу **без регистрации** и в один тап сообщает владельцу, где видел питомца. Владелец получает мгновенное уведомление и видит хронологию «где видели».

Дизайн-решения (уже утверждены, не пересматривать):
- **Два статуса** `HOME`/`LOST` + история эпизодов (`LostEpisode`). «Нашли» — НЕ статус, а вычисляемый бейдж (эпизод закрыт < 14 дней назад). Статистика воссоединений считается по закрытым эпизодам, а не по статусу.
- **Единая модель `Sighting`** («видели питомца») с опциональными полями. Два пути создания: лёгкий (один тап — только геолокация) и полный (форма: комментарий, фото, телефон). Просмотр страницы НЕ логируется — событие создаётся только по явному действию нашедшего.
- Фичи потеряшки гейтятся статусом: вознаграждение, телефон владельца на публичной странице, приём sightings — **только при `LOST`**.

## 2. Текущее состояние репозитория (на что опираться)

Уже реализовано и **должно переиспользоваться**:

| Что | Где | Использование в этой спеке |
|---|---|---|
| Prisma + PrismaService | `src/libs/database/` | весь доступ к БД |
| Модель `Pet` (id, name, ownerId → User, photos: PetPhoto[]) | `prisma/models/pet.prisma`, `src/modules/pets/` | расширяется полями ниже |
| Файлы: модели `File`, `PetPhoto`; StorageService (S3/MinIO) | `src/libs/storage/`, `src/modules/files/` | фото sighting — через `File` |
| Auth: JWT, `JwtAuthGuard`, декораторы `@Public()`, `@GetUser()` | `src/modules/auth/` | публичные эндпоинты — `@Public()` |
| RBAC: Role/Permission, `RequirePermissions` | `src/shared/` | владелец проверяется по `ownerId`, RBAC не нужен |
| Notifications: `NotificationsService`, WebSocket-gateway, модель `Notification` (type, title, body, data Json) | `src/modules/notifications/` | уведомление владельцу о sighting |
| Конвенции: модули в `src/modules/<name>`, DTO в `dto/`, поля camelCase, таблицы `@@map("snake_case")` | весь репо | следовать им |

Generator Prisma: `prisma-client` → `src/generated/prisma` (cjs). После изменения схемы: `npx prisma migrate dev --name <имя>`.

Схема многофайловая (`schema: "prisma"` в `prisma.config.ts`): `prisma/schema.prisma` содержит только generator/datasource, модели — в `prisma/models/*.prisma` по доменам (`pet.prisma`, `user.prisma`, `file.prisma`, `notification.prisma`, `post.prisma`).

## 3. Изменения модели данных (prisma/models/*.prisma)

### 3.1 Расширение `Pet` (в `prisma/models/pet.prisma`)

```prisma
enum PetStatus {
  HOME
  LOST
}

model Pet {
  id      Int    @id @default(autoincrement())
  name    String
  owner   User   @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  ownerId Int
  photos  PetPhoto[]

  // ─── новое ───
  publicCode   String    @unique                    // публичный код для QR, формат XXX-XXX
  status       PetStatus @default(HOME)
  rewardAmount Decimal?  @db.Decimal(10, 2)          // вознаграждение, показывается только при LOST

  lostEpisodes LostEpisode[]
  sightings    Sighting[]

  @@index([status])
  @@map("pets")
}
```

- **`publicCode`**: 6 символов `A–Z0–9` в формате `XXX-XXX` (например `ABC-123`). Генерируется при создании питомца; при коллизии — повторная генерация (до 10 попыток, потом 500). Backfill для существующих строк — в миграции (сгенерировать код каждому существующему питомцу; допустимо сделать поле сначала nullable, заполнить скриптом/SQL, затем сделать NOT NULL — или через `prisma db seed`-подобный скрипт в той же миграции).
- Каталог «красивых» платных кодов, перегенерация кода — **вне рамок** этой спеки.

### 3.2 Новая модель `LostEpisode` (в `prisma/models/pet.prisma`)

```prisma
model LostEpisode {
  id      Int       @id @default(autoincrement())
  pet     Pet       @relation(fields: [petId], references: [id], onDelete: Cascade)
  petId   Int
  lostAt  DateTime  @default(now())
  foundAt DateTime?                     // null = эпизод активен (питомец в поиске)

  @@index([petId, lostAt])
  @@map("lost_episodes")
}
```

Инвариант: у питомца **не более одного** активного эпизода (`foundAt = null`), и он существует ⇔ `pet.status = LOST`. Оба изменения делаются в одной транзакции.

### 3.3 Новая модель `Sighting` (в `prisma/models/pet.prisma`)

```prisma
model Sighting {
  id            Int      @id @default(autoincrement())
  pet           Pet      @relation(fields: [petId], references: [id], onDelete: Cascade)
  petId         Int
  lat           Float?
  lng           Float?
  address       String?
  comment       String?
  reporterPhone String?
  photo         File?    @relation(fields: [photoFileId], references: [id], onDelete: SetNull)
  photoFileId   Int?     @unique
  createdAt     DateTime @default(now())

  @@index([petId, createdAt])
  @@map("sightings")
}
```

В `File` (`prisma/models/file.prisma`) добавить обратную связь: `sighting Sighting?`.

### 3.4 Расширение уведомлений (`prisma/models/notification.prisma`) и владельца (`prisma/models/user.prisma`)

```prisma
enum NotificationType {
  ANNOUNCEMENT
  SIGHTING        // ← новое значение
}
```

В `User` добавить телефон (нужен для публичного контакта при LOST):

```prisma
  phone String?
```

## 4. Бизнес-правила

### 4.1 Переключение статуса (машина состояний)

- `HOME → LOST`: создать `LostEpisode { lostAt: now() }`. Опционально в том же запросе можно передать `rewardAmount`.
- `LOST → HOME`: у активного эпизода проставить `foundAt = now()`; обнулить `rewardAmount` (null).
- Переход в тот же статус → `400 Bad Request` («питомец уже в этом статусе»).
- Только владелец питомца (`pet.ownerId === user.id`), иначе `403`.
- Обе операции — транзакцией (`prisma.$transaction`).

### 4.2 Публичная карточка (по коду)

`GET /public/pets/:code` — без авторизации (`@Public()`).

Возвращает **ограниченный** DTO (не сущность целиком):
- всегда: `publicCode`, `name`, `status`, фото (публичные URL из существующего storage-механизма), бейдж `recentlyFound: boolean` (см. 4.4);
- только при `status = LOST` дополнительно: `rewardAmount`, `ownerPhone` (из `owner.phone`, если заполнен), `lostAt` активного эпизода.
- Никогда: `ownerId`, email владельца, внутренние id других сущностей.
- Код не найден → `404`.

### 4.3 Sightings

`POST /public/pets/:code/sightings` — без авторизации, `multipart/form-data`.

Поля (все опциональны, но действует правило минимума):
- `lat`, `lng` (числа; валидные диапазоны -90..90 / -180..180) — приходят от «одного тапа» с геолокацией браузера;
- `address` (строка ≤ 300);
- `comment` (строка ≤ 500);
- `reporterPhone` (строка ≤ 20);
- файл `photo` (image/*, ≤ 10 МБ) — сохранять через существующий StorageService → `File`, связать `photoFileId`.

Правила:
1. **Минимум содержимого**: запрос отклоняется `400`, если не передано ни одно из: (`lat`+`lng`) | `address` | `comment`. (Фото/телефон сами по себе недостаточны.)
2. Питомец не найден по коду → `404`. ~~Питомец не в `LOST` → `409 Conflict`~~ — **правило отменено 2026-08-05** (запрос фронта): жетон сканируют именно тогда, когда питомец потерялся, а владелец ещё не знает, поэтому сообщения принимаются при любом статусе. Текст уведомления зависит от статуса (см. п. 4).
3. **Rate-limit**: не более 5 запросов с одного IP за 10 минут на этот эндпоинт (использовать `@nestjs/throttler`; пакет в репо не установлен — добавить). Превышение → `429`.
4. После сохранения — **уведомление владельцу** через существующий `NotificationsService` (и gateway, чтобы прилетело в реальном времени): `type: SIGHTING`, `data: { petId, sightingId, lat, lng }`, `body` из address/comment. Заголовок зависит от статуса: при `LOST` — `"🐾 {pet.name}: питомца видели!"`, при `HOME` — `"🐾 {pet.name}: кто-то отсканировал жетон"` (владелец может ещё не знать о пропаже).
5. Мягкая деградация: если загрузка фото в S3 упала — sighting сохраняется без фото, ошибка логируется (warning), запрос НЕ падает.

`GET /pets/:id/sightings` — JWT, только владелец (`403` иначе). Хронология по `createdAt desc`, с публичными URL фото.

### 4.4 Бейдж «вернулся домой» и статистика

- `recentlyFound = true`, если существует эпизод с `foundAt >= now() - 14 дней`. Вычисляется в сервисе, в БД не хранится.
- `GET /public/stats` (или расширение существующего публичного эндпоинта, если появится): `{ reunions: count(LostEpisode, foundAt != null), searching: count(Pet, status = LOST) }`.

### 4.5 История эпизодов

`GET /pets/:id/lost-episodes` — JWT, только владелец. Список по `lostAt desc`.

## 5. Поверхность API (сводно)

| Метод | Путь | Auth | Назначение | Ошибки |
|---|---|---|---|---|
| PATCH | `/pets/:id/status` | JWT, владелец | `{ status: 'HOME'\|'LOST', rewardAmount? }` — переход + эпизод | 400 (тот же статус / reward при HOME), 403, 404 |
| GET | `/pets/:id/sightings` | JWT, владелец | хронология «где видели» | 403, 404 |
| GET | `/pets/:id/lost-episodes` | JWT, владелец | история эпизодов | 403, 404 |
| GET | `/public/pets/:code` | публичный | ограниченная карточка | 404 |
| POST | `/public/pets/:code/sightings` | публичный | сообщить «видел» (multipart) | 400, 404, 409, 429 |
| GET | `/public/stats` | публичный | счётчики воссоединений/в поиске | — |

Роутинг публичных эндпоинтов: либо отдельный контроллер `pets-public.controller.ts` в `src/modules/pets/` с префиксом `public/pets` (рекомендуется), либо по конвенции репо. Всё задокументировать в Swagger, если он подключён в проекте; если нет — оставить как есть (подключение Swagger — вне рамок).

## 6. Структура изменений в коде

```
src/modules/pets/
├─ pets.module.ts            // + новые провайдеры/контроллер
├─ pets.controller.ts        // + PATCH /pets/:id/status, GET sightings, GET lost-episodes
├─ pets-public.controller.ts // NEW: GET /public/pets/:code, POST .../sightings, GET /public/stats
├─ pets.service.ts           // + генерация publicCode при создании, проверка владения
├─ lost-mode.service.ts      // NEW: переходы статусов + эпизоды (транзакции), recentlyFound, stats
├─ sightings.service.ts      // NEW: создание (+File через StorageService), выборка, уведомление
└─ dto/
   ├─ change-status.dto.ts   // NEW
   ├─ create-sighting.dto.ts // NEW
   └─ public-pet.dto.ts      // NEW: маппинг Pet → публичный ответ
```

Проверку «владелец ли» вынести в приватный хелпер `pets.service` (используется всеми owner-эндпоинтами). В существующих CRUD-эндпоинтах pets проверки владения не трогать в рамках этой спеки, если они уже есть; если отсутствуют — отметить TODO-комментарием (исправление — отдельная задача).

## 7. Тесты (Jest, конвенции репо)

Юнит (`*.spec.ts` рядом с сервисами; Prisma — мокать):
1. `lost-mode.service`: HOME→LOST создаёт эпизод; LOST→HOME закрывает эпизод и обнуляет reward; повторный переход в тот же статус → ошибка; не-владелец → Forbidden; инвариант «один активный эпизод».
2. `sightings.service`: минимум содержимого (400-случаи); отказ при статусе HOME (409); уведомление вызывается с типом SIGHTING; сбой S3 не роняет создание.
3. `pets.service`: `publicCode` генерируется в формате `/^[A-Z0-9]{3}-[A-Z0-9]{3}$/`; коллизия → повторная попытка.
4. `public-pet.dto`: при HOME нет `ownerPhone`/`rewardAmount`; при LOST есть; `recentlyFound` по границе 14 дней.

E2E (supertest, `test/`): публичная карточка 404 по несуществующему коду; создание sighting оба пути (только гео / полная форма); 429 после превышения лимита.

## 8. Definition of Done

- [ ] Миграция применяется на чистую БД и на БД с существующими питомцами (backfill publicCode).
- [ ] Все эндпоинты из §5 работают с указанными кодами ошибок.
- [ ] Уведомление о sighting доставляется владельцу (в т.ч. через gateway).
- [ ] ~~Юнит- и e2e-тесты из §7 зелёные~~ (снято решением разработчика 2026-07-31 — проверка ручным smoke); `npm run lint` чистый.
- [ ] Существующая функциональность (auth, files, notifications, текущие pets CRUD) не сломана.

## 9. Вне рамок этой спеки

Каталог платных «красивых» кодов и перегенерация; вознаграждение-эскроу/выплаты; медкарта и верификация прививок; кабинет ветклиники; community-алерты по гео; PWA/push вне существующего gateway; Swagger-подключение, если его нет в репо.
