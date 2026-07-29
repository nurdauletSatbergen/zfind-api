# Система оповещений — план реализации

> Workflow: разработчик реализует задачи сам, по одной. После каждой задачи — ревью (Claude), затем коммит и переход к следующей. Без юнит-тестов (решение разработчика); проверка — сборка + ручной smoke в Task 7.

**Goal:** In-app уведомления: админ рассылает объявления по роли (с отзывом), пользователь читает/удаляет свои, открытые вкладки получают их по WebSocket.

**Architecture:** Fan-out on write — копия `Notification` на получателя, `Broadcast` — запись о рассылке для истории и отзыва. Прямой вызов `NotificationsService` из контроллера, без очередей. Socket.IO-гейтвей с JWT в handshake, комнаты `user:{id}`. Новый `PermissionsGuard` (в проекте его ещё нет) проверяет права по БД.

**Tech Stack:** NestJS 11, Prisma 7 (PostgreSQL), Socket.IO (`@nestjs/websockets` + `@nestjs/platform-socket.io`), class-validator.

**Спека:** `docs/superpowers/specs/2026-07-29-notifications-design.md`
**Ветка:** `feature/notifications`

**Ключевые паттерны проекта, которые надо соблюдать:**
- Prisma-клиент: `import { Prisma } from '../../generated/prisma/client'`.
- `JwtAuthGuard` глобальный (`APP_GUARD` в `AuthModule`) — JWT нужен везде, кроме `@Public()`. В `request.user` лежит `JwtPayload` (`{ id, email }`), достаётся декоратором `@GetUser()`.
- Атомарные `updateMany`/`deleteMany` с `{ id, userId }` в `where` вместо `findOne`+операция; `count: 0` → 404 либо идемпотентный no-op.
- Никаких `new Service()` — только constructor injection.

---

### Task 1: Зависимости, схема Prisma, миграция, сид

**Files:** `prisma/schema.prisma`, `prisma/seed.ts`

- [ ] Установить зависимости:

```bash
npm install @nestjs/websockets @nestjs/platform-socket.io socket.io
```

- [ ] Добавить в конец `prisma/schema.prisma`:

```prisma
enum NotificationType {
  ANNOUNCEMENT
}

model Notification {
  id          Int              @id @default(autoincrement())
  user        User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId      Int
  type        NotificationType @default(ANNOUNCEMENT)
  title       String
  body        String
  data        Json?
  readAt      DateTime?
  broadcast   Broadcast?       @relation(fields: [broadcastId], references: [id], onDelete: SetNull)
  broadcastId Int?
  createdAt   DateTime         @default(now())

  @@index([userId, readAt])
  @@map("notifications")
}

model Broadcast {
  id            Int            @id @default(autoincrement())
  title         String
  body          String
  roleName      String
  recipients    Int
  createdBy     User?          @relation(fields: [createdById], references: [id], onDelete: SetNull)
  createdById   Int?
  recalledAt    DateTime?
  createdAt     DateTime       @default(now())
  notifications Notification[]

  @@map("broadcasts")
}
```

- [ ] В модель `User` добавить обратные связи (ничего не удаляя):

```prisma
  notifications Notification[]
  broadcasts    Broadcast[]
```

- [ ] Миграция: `npx prisma migrate dev --name notifications` (БД должна быть запущена).

- [ ] В `prisma/seed.ts` добавить `'notifications:broadcast'` в `ALL_PERMISSIONS` (в `USER_PERMISSIONS` — НЕ добавлять). Прогнать: `npx tsx prisma/seed.ts`.

- [ ] Ревью → коммит: `Add notifications schema, migration and broadcast permission`

---

### Task 2: RequirePermissions + PermissionsGuard

**Files:**
- Create: `src/shared/decorators/require-permissions.decorator.ts`
- Create: `src/shared/guards/permissions.guard.ts`

Гвард работает ПОСЛЕ глобального `JwtAuthGuard` (user уже в request) и проверяет права по БД на каждый запрос — по RBAC-спеке права в JWT не зашиваются, смена прав действует мгновенно.

`require-permissions.decorator.ts`:

```typescript
import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'required_permissions';

export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
```

`permissions.guard.ts`:

```typescript
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../libs/database/prisma.service';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { JwtPayload } from '../../modules/auth/interfaces/jwt-payload.interface';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const user: JwtPayload | undefined = context
      .switchToHttp()
      .getRequest().user;
    if (!user) throw new ForbiddenException();

    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: {
        role: {
          select: { permissions: { select: { name: true } } },
        },
      },
    });

    const owned = dbUser?.role?.permissions.map((p) => p.name) ?? [];
    if (!required.every((p) => owned.includes(p))) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return true;
  }
}
```

- [ ] Ревью → коммит: `Add RequirePermissions decorator and PermissionsGuard`

---

### Task 3: NotificationsGateway (WebSocket)

**Files:**
- Create: `src/modules/notifications/notifications.gateway.ts`

```typescript
import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@WebSocketGateway({ namespace: '/notifications', cors: { origin: '*' } })
export class NotificationsGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  constructor(private jwtService: JwtService) {}

  async handleConnection(client: Socket): Promise<void> {
    const token = client.handshake.auth?.token as string | undefined;
    try {
      if (!token) throw new Error('Missing token');
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
      await client.join(`user:${payload.id}`);
    } catch {
      client.disconnect(true);
    }
  }

  sendToUser(userId: number, payload: unknown): void {
    this.server.to(`user:${userId}`).emit('notification', payload);
  }
}
```

- [ ] Ревью → коммит: `Add notifications WebSocket gateway with JWT handshake`

---

### Task 4: NotificationsService — пользовательские методы

**Files:**
- Create: `src/modules/notifications/notifications.service.ts`

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../libs/database/prisma.service';
import { NotificationsGateway } from './notifications.gateway';

@Injectable()
export class NotificationsService {
  constructor(
    private prisma: PrismaService,
    private gateway: NotificationsGateway,
  ) {}

  async findAllFor(userId: number, page: number, limit: number) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.notification.count({ where: { userId } }),
    ]);
    return { items, total, page, limit };
  }

  async unreadCount(userId: number): Promise<{ count: number }> {
    const count = await this.prisma.notification.count({
      where: { userId, readAt: null },
    });
    return { count };
  }

  async markRead(userId: number, id: number): Promise<void> {
    // идемпотентно: чужая, прочитанная или несуществующая строка — no-op
    await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  markAllRead(userId: number): Promise<{ count: number }> {
    return this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  async removeOne(userId: number, id: number): Promise<void> {
    const { count } = await this.prisma.notification.deleteMany({
      where: { id, userId },
    });
    if (count === 0) throw new NotFoundException('Notification not found');
  }

  removeAll(userId: number, onlyRead: boolean): Promise<{ count: number }> {
    return this.prisma.notification.deleteMany({
      where: { userId, ...(onlyRead ? { readAt: { not: null } } : {}) },
    });
  }
}
```

- [ ] Ревью → коммит: `Add NotificationsService user-facing methods`

---

### Task 5: DTO + broadcast, история, отзыв

**Files:**
- Create: `src/modules/notifications/dto/create-broadcast.dto.ts`
- Modify: `src/modules/notifications/notifications.service.ts`

`dto/create-broadcast.dto.ts`:

```typescript
import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateBroadcastDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  body: string;

  @IsString()
  @IsNotEmpty()
  roleName: string;

  @IsObject()
  @IsOptional()
  data?: Record<string, unknown>;
}
```

В `notifications.service.ts` обновить импорты:

```typescript
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateBroadcastDto } from './dto/create-broadcast.dto';
import { Prisma } from '../../generated/prisma/client';
```

Добавить методы:

```typescript
  async broadcast(createdById: number, dto: CreateBroadcastDto) {
    const role = await this.prisma.role.findUnique({
      where: { name: dto.roleName },
      select: {
        users: {
          select: {
            id: true,
            userSetting: { select: { notificationsOn: true } },
          },
        },
      },
    });
    if (!role) throw new NotFoundException('Role not found');

    const broadcast = await this.prisma.broadcast.create({
      data: {
        title: dto.title,
        body: dto.body,
        roleName: dto.roleName,
        recipients: role.users.length,
        createdById,
      },
    });

    if (role.users.length > 0) {
      const created = await this.prisma.notification.createManyAndReturn({
        data: role.users.map((u) => ({
          userId: u.id,
          title: dto.title,
          body: dto.body,
          data: (dto.data ?? undefined) as Prisma.InputJsonValue | undefined,
          broadcastId: broadcast.id,
        })),
        select: { id: true, userId: true },
      });

      const idByUser = new Map(created.map((n) => [n.userId, n.id]));
      for (const u of role.users) {
        if (!u.userSetting?.notificationsOn) continue;
        this.gateway.sendToUser(u.id, {
          id: idByUser.get(u.id),
          type: 'ANNOUNCEMENT',
          title: dto.title,
          body: dto.body,
          data: dto.data ?? null,
          createdAt: broadcast.createdAt,
        });
      }
    }

    return { id: broadcast.id, recipients: role.users.length };
  }

  listBroadcasts() {
    return this.prisma.broadcast.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async recallBroadcast(id: number): Promise<{ removed: number }> {
    const broadcast = await this.prisma.broadcast.findUnique({ where: { id } });
    if (!broadcast) throw new NotFoundException('Broadcast not found');
    if (broadcast.recalledAt) {
      throw new ConflictException('Broadcast already recalled');
    }

    const [{ count }] = await this.prisma.$transaction([
      this.prisma.notification.deleteMany({ where: { broadcastId: id } }),
      this.prisma.broadcast.update({
        where: { id },
        data: { recalledAt: new Date() },
      }),
    ]);
    return { removed: count };
  }
```

- [ ] Ревью → коммит: `Add broadcast, history and recall to NotificationsService`

---

### Task 6: Контроллер, модуль, подключение в AppModule

**Files:**
- Create: `src/modules/notifications/notifications.controller.ts`
- Create: `src/modules/notifications/notifications.module.ts`
- Modify: `src/app.module.ts`

ВАЖНО про порядок маршрутов: статические сегменты (`broadcasts`, `unread-count`, `read-all`) объявляются РАНЬШЕ параметрических (`:id`), иначе `PATCH /notifications/read-all` сматчится на `:id`-маршрут и `ParseIntPipe` вернёт 400.

`notifications.controller.ts`:

```typescript
import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { CreateBroadcastDto } from './dto/create-broadcast.dto';
import { GetUser } from '../auth/decorators/get-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { PermissionsGuard } from '../../shared/guards/permissions.guard';
import { RequirePermissions } from '../../shared/decorators/require-permissions.decorator';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  // --- админские (permission notifications:broadcast) ---

  @Post('broadcasts')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('notifications:broadcast')
  createBroadcast(
    @GetUser() user: JwtPayload,
    @Body() dto: CreateBroadcastDto,
  ) {
    return this.notificationsService.broadcast(user.id, dto);
  }

  @Get('broadcasts')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('notifications:broadcast')
  listBroadcasts() {
    return this.notificationsService.listBroadcasts();
  }

  @Delete('broadcasts/:id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('notifications:broadcast')
  recallBroadcast(@Param('id', ParseIntPipe) id: number) {
    return this.notificationsService.recallBroadcast(id);
  }

  // --- пользовательские ---

  @Get('unread-count')
  unreadCount(@GetUser() user: JwtPayload) {
    return this.notificationsService.unreadCount(user.id);
  }

  @Patch('read-all')
  markAllRead(@GetUser() user: JwtPayload) {
    return this.notificationsService.markAllRead(user.id);
  }

  @Get()
  findAll(
    @GetUser() user: JwtPayload,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.notificationsService.findAllFor(user.id, page, limit);
  }

  @Patch(':id/read')
  @HttpCode(204)
  async markRead(
    @GetUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.notificationsService.markRead(user.id, id);
  }

  @Delete(':id')
  @HttpCode(204)
  async removeOne(
    @GetUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.notificationsService.removeOne(user.id, id);
  }

  @Delete()
  removeAll(@GetUser() user: JwtPayload, @Query('read') read?: string) {
    return this.notificationsService.removeAll(user.id, read === 'true');
  }
}
```

`notifications.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsGateway } from './notifications.gateway';
import { PrismaModule } from '../../libs/database/prisma.module';
import { jwtConstants } from '../auth/constants';

@Module({
  imports: [
    PrismaModule,
    // гейтвею нужен JwtService с тем же секретом, что у JwtStrategy
    JwtModule.register({ secret: jwtConstants.secret }),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsGateway],
})
export class NotificationsModule {}
```

В `src/app.module.ts` добавить `NotificationsModule` в `imports`.

- [ ] Проверка сборки: `npm run build` — без ошибок.
- [ ] Ревью → коммит: `Add notifications controller and module`

---

### Task 7: Ручная проверка (smoke)

- [ ] `npm run start:dev` — старт без ошибок, в логе маршруты `/api/notifications*`.

- [ ] Админ (токен пользователя с ролью `admin` через `POST /api/auth/login`):

```bash
curl -s -X POST http://localhost:3000/api/notifications/broadcasts \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Тест","body":"Проверка рассылки","roleName":"user"}'
```

Expected: `{"id":1,"recipients":N}`.

- [ ] Пользователь роли `user`: `GET /api/notifications/unread-count` → `{"count":1}`; `GET /api/notifications` → уведомление «Тест»; `PATCH /:id/read` → 204, счётчик 0; `DELETE /:id` → 204.

- [ ] Запрет: `POST /api/notifications/broadcasts` с токеном пользователя → `403`.

- [ ] Отзыв: `DELETE /api/notifications/broadcasts/1` админом → `{"removed":N}`, список пользователя пуст; повторно → `409`.

- [ ] WebSocket (опционально): из консоли браузера

```javascript
const socket = io('http://localhost:3000/notifications', {
  auth: { token: '<USER_TOKEN>' },
});
socket.on('notification', (n) => console.log('notification:', n));
```

Broadcast админом → событие в консоли (у пользователя `notificationsOn: true`).

---

### Task 8 (опционально): retention-чистка

Можно пропустить и добавить позже — схему не меняет.

- [ ] `npm install @nestjs/schedule`; в `app.module.ts` добавить `ScheduleModule.forRoot()`.

- [ ] В `notifications.service.ts`:

```typescript
import { Cron, CronExpression } from '@nestjs/schedule';

export const NOTIFICATION_RETENTION_DAYS = 90;
```

```typescript
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupOld(): Promise<void> {
    const cutoff = new Date(
      Date.now() - NOTIFICATION_RETENTION_DAYS * 86_400_000,
    );
    await this.prisma.notification.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
  }
```

- [ ] Ревью → коммит: `Add daily notifications retention cleanup`
