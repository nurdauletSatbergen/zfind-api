# Система оповещений пользователей — дизайн

Дата: 2026-07-29
Статус: утверждён (устно в сессии; финальное ревью спеки — см. ниже)

## Цель

Дать zfind-api систему in-app уведомлений: администратор рассылает
информационные сообщения (обновления, объявления) всем пользователям
с заданной ролью; пользователь видит свой список уведомлений, счётчик
непрочитанных, отмечает прочитанным и удаляет. Открытые вкладки получают
уведомления мгновенно по WebSocket. Фундамент рассчитан на будущие
каналы (email, FCM push для мобильного приложения) и на будущие
личные уведомления (события вокруг питомцев) без переделки ядра.

## Ключевые решения

| Решение | Выбор | Отклонённые альтернативы |
|---|---|---|
| Хранение рассылки | Fan-out on write: копия-строка `Notification` на каждого получателя, каждая живёт независимо (свой `readAt`, своё удаление) | Fan-out on read (одна запись + таблица состояний) — нужен на масштабе миллионов получателей, сложнее запросы и пагинация |
| Порождение уведомлений | Прямой вызов `NotificationsService` из админского endpoint | Событийная шина `@nestjs/event-emitter` — не нужна: источник один (админ); добавим, когда появятся доменные триггеры |
| Очередь и статусы доставки | Нет. Для in-app «доставка» = INSERT в Postgres; единственный статус — `readAt` | BullMQ/Redis, статусы sent/delivered/failed (архитектура MagicBell) — имеют смысл только с внешними провайдерами (email/FCM/SMS); точка вставки очереди изолирована внутри сервиса |
| Real-time транспорт | WebSocket: `@nestjs/websockets` + Socket.IO, комнаты `user:{id}` | SSE (нет комнат/переподключения из коробки); Web Push (отложен — потребует service worker и согласия пользователя) |
| Удаление пользователем | Hard delete своих строк | Soft delete (`deletedAt`) — уведомления не критичные данные |
| Отзыв рассылки | Таблица `Broadcast` + `Notification.broadcastId`; отзыв удаляет строки получателей, запись рассылки остаётся с `recalledAt` (аудит) | Отзыв по совпадению title/type — ненадёжно; без отзыва — отклонено пользователем, отзыв нужен |
| `UserSetting.notificationsOn` | Строка в БД создаётся всегда; флаг управляет только активными каналами (сейчас — real-time событие, позже push/email) | Не создавать строку при выключенном флаге — админское объявление должно быть видно в списке |

## Схема БД

Изменения к `prisma/schema.prisma` (+ одна миграция):

```prisma
model Notification {
  id          Int        @id @default(autoincrement())
  user        User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId      Int
  type        String     // пока "ANNOUNCEMENT"; поле — задел под будущие виды
  title       String
  body        String
  data        Json?      // произвольная нагрузка для фронта
  readAt      DateTime?  // null = непрочитано
  broadcast   Broadcast? @relation(fields: [broadcastId], references: [id], onDelete: SetNull)
  broadcastId Int?
  createdAt   DateTime   @default(now())

  @@index([userId, readAt])
  @@map("notifications")
}

model Broadcast {
  id            Int            @id @default(autoincrement())
  title         String
  body          String
  roleName      String         // кому рассылалось
  recipients    Int            // сколько строк создано при отправке
  createdBy     User?          @relation(fields: [createdById], references: [id], onDelete: SetNull)
  createdById   Int?
  recalledAt    DateTime?      // null = активна
  createdAt     DateTime       @default(now())
  notifications Notification[]

  @@map("broadcasts")
}
```

`User` получает обратные связи `notifications Notification[]` и
`broadcasts Broadcast[]`.

## Модуль

`src/modules/notifications/` по стандартной раскладке проекта:
`notifications.module.ts`, `notifications.controller.ts`,
`notifications.service.ts`, `notifications.gateway.ts`, `dto/`.

### Пользовательские endpoints (JWT, текущий пользователь)

- `GET /notifications?page=&limit=` — список, новые сверху
- `GET /notifications/unread-count` — `{ count }` для «колокольчика»
- `PATCH /notifications/:id/read` — отметить прочитанным
  (`updateMany({ where: { id, userId, readAt: null } })`; повторный
  вызов и чужой id — не ошибка, идемпотентно)
- `PATCH /notifications/read-all`
- `DELETE /notifications/:id` — `deleteMany({ where: { id, userId } })`,
  `count: 0` → 404 (не раскрываем существование чужих)
- `DELETE /notifications?read=true` — очистить прочитанные;
  без параметра — очистить всё

### Админские endpoints (permission `notifications:broadcast`)

- `POST /notifications/broadcasts` — DTO `{ title, body, roleName }`.
  Находит пользователей роли, создаёт `Broadcast`, затем `createMany`
  строк `Notification`, шлёт WS-событие получателям.
  Роль без пользователей — не ошибка: `{ recipients: 0 }`.
  Несуществующая роль — 404.
- `GET /notifications/broadcasts` — история рассылок (для выбора при отзыве)
- `DELETE /notifications/broadcasts/:id` — отзыв: `deleteMany` строк
  по `broadcastId`, в `Broadcast` проставляется `recalledAt`.
  Уже отозванная — 409, несуществующая — 404.

Порядок маршрутов: статические `/broadcasts`-маршруты объявляются
в контроллере раньше параметрических `/:id`.

## Real-time (WebSocket)

- Зависимости: `@nestjs/websockets`, `@nestjs/platform-socket.io`,
  `socket.io`.
- `NotificationsGateway`, namespace `/notifications`.
- Handshake: клиент передаёт JWT (`auth.token`); гейтвей валидирует его
  существующим `JwtService` (тот же секрет из `constants.ts`, что и
  `JwtStrategy`), кладёт сокет в комнату `user:{id}`; невалидный
  токен — disconnect.
- После broadcast сервис эмитит событие `notification`
  (`{ id, type, title, body, data, createdAt }`) в комнаты получателей,
  у которых `UserSetting.notificationsOn = true`.
- WS — ускорение для открытых вкладок, не канал с гарантиями:
  офлайн-пользователь увидит уведомление через REST при следующем заходе.

## Обработка ошибок

Паттерн проекта: атомарные `updateMany`/`deleteMany` с `{ id, userId }`
в `where` вместо предварительного `findOne`; `count: 0` → 404 там,
где ресурс обязан существовать, и идемпотентный no-op там, где
повторный вызов легален (mark read). Валидация DTO — class-validator
(`title`, `body` непустые, `roleName` строка).

## Retention (опционально, последним шагом)

`@nestjs/schedule`, cron раз в сутки: `deleteMany` уведомлений старше
90 дней. Схему не меняет; можно отложить без последствий.

## Тесты

- Unit `NotificationsService`: broadcast (создание строк по роли,
  recipients, пустая роль), отзыв (удаление по broadcastId, повторный
  отзыв → 409), mark read / read-all, удаление своих/чужих строк,
  unread-count.
- Guard: `POST /notifications/broadcasts` недоступен без
  `notifications:broadcast`.

## Масштаб (зафиксированные ожидания)

Рассылка на N пользователей = N строк одним `createMany` (при
необходимости — пачками по 10k, правка внутри сервиса). 5k пользователей
× 10 рассылок/мес ≈ 50k строк/мес; с retention 90 дней таблица
стабилизируется на ~150k строк — мегабайты. Порог смены подхода
(миллионы получателей) изолирован внутри `NotificationsService`.

## Вне скоупа v1

- Email, SMS, Web Push, FCM (мобильное приложение — позже)
- Очередь (BullMQ/Redis), статусы доставки, dead letter queue
- Доменные триггеры (события вокруг питомцев) и событийная шина
- Адресация конкретному пользователю или произвольному сегменту
  (только роль целиком)
