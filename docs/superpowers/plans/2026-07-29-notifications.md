# Система оповещений — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In-app уведомления: админ рассылает объявления по роли (с отзывом), пользователь читает/удаляет свои, открытые вкладки получают их по WebSocket.

**Architecture:** Fan-out on write — копия `Notification` на получателя, `Broadcast` — запись о рассылке для истории и отзыва. Прямой вызов `NotificationsService` из контроллера, без очередей. Socket.IO-гейтвей с JWT в handshake, комнаты `user:{id}`. Новый `PermissionsGuard` (в проекте его ещё нет) проверяет права по БД.

**Tech Stack:** NestJS 11, Prisma 7 (PostgreSQL), Socket.IO (`@nestjs/websockets` + `@nestjs/platform-socket.io`), class-validator, Jest.

**Спека:** `docs/superpowers/specs/2026-07-29-notifications-design.md`
**Ветка:** `feature/notifications`

**Контекст проекта (для исполнителя без контекста):**
- Prisma-клиент генерируется в `src/generated/prisma` (`import { Prisma } from '../../generated/prisma/client'`).
- `JwtAuthGuard` подключён глобально через `APP_GUARD` в `AuthModule` — все маршруты требуют JWT, кроме помеченных `@Public()`. В `request.user` лежит `JwtPayload` (`{ id, email }`).
- Глобальный `ValidationPipe({ whitelist: true })` и префикс `api` в `main.ts`.
- Юнит-тесты лежат рядом с кодом (`*.spec.ts`, jest `rootDir: src`). Запуск: `npm test`.
- Паттерн ошибок проекта: атомарные `updateMany`/`deleteMany` с `{ id, userId }` в where; `count: 0` → 404 либо идемпотентный no-op; P2002 → 409, P2025 → 404.

---

### Task 1: Зависимости, схема Prisma, миграция, сид

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `prisma/seed.ts`

- [ ] **Step 1: Установить зависимости**

```bash
npm install @nestjs/websockets @nestjs/platform-socket.io socket.io
```

- [ ] **Step 2: Добавить в `prisma/schema.prisma`**

В конец файла добавить:

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

В модель `User` добавить два поля (к существующим, ничего не удаляя):

```prisma
  notifications Notification[]
  broadcasts    Broadcast[]
```

- [ ] **Step 3: Миграция и генерация клиента**

```bash
npx prisma migrate dev --name notifications
```

Expected: миграция создана и применена, клиент перегенерирован (`Generated Prisma Client`). Если БД не запущена — поднять docker-compose проекта и повторить.

- [ ] **Step 4: Добавить permission в сид**

В `prisma/seed.ts` в массив `ALL_PERMISSIONS` добавить строку `'notifications:broadcast'` (в `USER_PERMISSIONS` НЕ добавлять — право только у admin):

```typescript
const ALL_PERMISSIONS = [
  'pets:create',
  'pets:read',
  'pets:update',
  'pets:delete',
  'pets:manage-any',
  'users:read',
  'users:manage',
  'notifications:broadcast',
];
```

- [ ] **Step 5: Прогнать сид**

```bash
npx tsx prisma/seed.ts
```

Expected: завершается без ошибок; роль `admin` получает новое право (в сиде upsert с `set` — безопасно перезапускать).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json prisma
git commit -m "Add notifications schema, migration and broadcast permission"
```

---

### Task 2: RequirePermissions + PermissionsGuard (в проекте их ещё нет)

**Files:**
- Create: `src/shared/decorators/require-permissions.decorator.ts`
- Create: `src/shared/guards/permissions.guard.ts`
- Test: `src/shared/guards/permissions.guard.spec.ts`

Гвард работает ПОСЛЕ глобального `JwtAuthGuard` (тот уже положил `JwtPayload` в `request.user`) и проверяет права по БД на каждый запрос — решение из RBAC-спеки: права в JWT не зашиваются, смена прав действует мгновенно.

- [ ] **Step 1: Написать декоратор**

`src/shared/decorators/require-permissions.decorator.ts`:

```typescript
import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'required_permissions';

export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
```

- [ ] **Step 2: Написать падающий тест гварда**

`src/shared/guards/permissions.guard.spec.ts`:

```typescript
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import { PrismaService } from '../../libs/database/prisma.service';

describe('PermissionsGuard', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let prisma: { user: { findUnique: jest.Mock } };
  let guard: PermissionsGuard;

  const contextFor = (user?: { id: number }): ExecutionContext =>
    ({
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    prisma = { user: { findUnique: jest.fn() } };
    guard = new PermissionsGuard(
      reflector as unknown as Reflector,
      prisma as unknown as PrismaService,
    );
  });

  it('пропускает, если у маршрута нет требуемых прав', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    await expect(guard.canActivate(contextFor({ id: 1 }))).resolves.toBe(true);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('пропускает пользователя со всеми требуемыми правами', async () => {
    reflector.getAllAndOverride.mockReturnValue(['notifications:broadcast']);
    prisma.user.findUnique.mockResolvedValue({
      role: { permissions: [{ name: 'notifications:broadcast' }] },
    });
    await expect(guard.canActivate(contextFor({ id: 1 }))).resolves.toBe(true);
  });

  it('кидает ForbiddenException без нужного права', async () => {
    reflector.getAllAndOverride.mockReturnValue(['notifications:broadcast']);
    prisma.user.findUnique.mockResolvedValue({
      role: { permissions: [{ name: 'pets:read' }] },
    });
    await expect(guard.canActivate(contextFor({ id: 1 }))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('кидает ForbiddenException для пользователя без роли', async () => {
    reflector.getAllAndOverride.mockReturnValue(['notifications:broadcast']);
    prisma.user.findUnique.mockResolvedValue({ role: null });
    await expect(guard.canActivate(contextFor({ id: 1 }))).rejects.toThrow(
      ForbiddenException,
    );
  });
});
```

- [ ] **Step 3: Убедиться, что тест падает**

Run: `npm test -- permissions.guard`
Expected: FAIL — `Cannot find module './permissions.guard'`

- [ ] **Step 4: Реализовать гвард**

`src/shared/guards/permissions.guard.ts`:

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

- [ ] **Step 5: Убедиться, что тесты зелёные**

Run: `npm test -- permissions.guard`
Expected: PASS (4 теста)

- [ ] **Step 6: Commit**

```bash
git add src/shared
git commit -m "Add RequirePermissions decorator and PermissionsGuard"
```

---

### Task 3: NotificationsGateway (WebSocket)

**Files:**
- Create: `src/modules/notifications/notifications.gateway.ts`
- Test: `src/modules/notifications/notifications.gateway.spec.ts`

- [ ] **Step 1: Написать падающий тест**

`src/modules/notifications/notifications.gateway.spec.ts`:

```typescript
import { JwtService } from '@nestjs/jwt';
import { Socket } from 'socket.io';
import { NotificationsGateway } from './notifications.gateway';

describe('NotificationsGateway', () => {
  let jwtService: { verifyAsync: jest.Mock };
  let gateway: NotificationsGateway;

  const clientWith = (token?: string) => {
    const client = {
      handshake: { auth: { token } },
      join: jest.fn(),
      disconnect: jest.fn(),
    };
    return client as unknown as Socket;
  };

  beforeEach(() => {
    jwtService = { verifyAsync: jest.fn() };
    gateway = new NotificationsGateway(jwtService as unknown as JwtService);
  });

  it('кладёт сокет с валидным JWT в комнату user:{id}', async () => {
    jwtService.verifyAsync.mockResolvedValue({ id: 42, email: 'a@b.c' });
    const client = clientWith('valid-token');

    await gateway.handleConnection(client);

    expect(client.join).toHaveBeenCalledWith('user:42');
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('отключает сокет с невалидным JWT', async () => {
    jwtService.verifyAsync.mockRejectedValue(new Error('invalid'));
    const client = clientWith('bad-token');

    await gateway.handleConnection(client);

    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.join).not.toHaveBeenCalled();
  });

  it('отключает сокет без токена', async () => {
    const client = clientWith(undefined);

    await gateway.handleConnection(client);

    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it('sendToUser эмитит notification в комнату пользователя', () => {
    const emit = jest.fn();
    gateway.server = { to: jest.fn().mockReturnValue({ emit }) } as never;
    const payload = { id: 1, title: 'Hi' };

    gateway.sendToUser(42, payload);

    expect(gateway.server.to).toHaveBeenCalledWith('user:42');
    expect(emit).toHaveBeenCalledWith('notification', payload);
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `npm test -- notifications.gateway`
Expected: FAIL — `Cannot find module './notifications.gateway'`

- [ ] **Step 3: Реализовать гейтвей**

`src/modules/notifications/notifications.gateway.ts`:

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

- [ ] **Step 4: Убедиться, что тесты зелёные**

Run: `npm test -- notifications.gateway`
Expected: PASS (4 теста)

- [ ] **Step 5: Commit**

```bash
git add src/modules/notifications
git commit -m "Add notifications WebSocket gateway with JWT handshake"
```

---

### Task 4: NotificationsService — пользовательские методы

**Files:**
- Create: `src/modules/notifications/notifications.service.ts`
- Test: `src/modules/notifications/notifications.service.spec.ts`

- [ ] **Step 1: Написать падающие тесты**

`src/modules/notifications/notifications.service.spec.ts`:

```typescript
import { NotFoundException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../../libs/database/prisma.service';
import { NotificationsGateway } from './notifications.gateway';

describe('NotificationsService', () => {
  let prisma: {
    notification: {
      findMany: jest.Mock;
      count: jest.Mock;
      updateMany: jest.Mock;
      deleteMany: jest.Mock;
      createManyAndReturn: jest.Mock;
    };
    role: { findUnique: jest.Mock };
    broadcast: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let gateway: { sendToUser: jest.Mock };
  let service: NotificationsService;

  beforeEach(() => {
    prisma = {
      notification: {
        findMany: jest.fn(),
        count: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
        createManyAndReturn: jest.fn(),
      },
      role: { findUnique: jest.fn() },
      broadcast: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn((ops) => Promise.all(ops)),
    };
    gateway = { sendToUser: jest.fn() };
    service = new NotificationsService(
      prisma as unknown as PrismaService,
      gateway as unknown as NotificationsGateway,
    );
  });

  describe('findAllFor', () => {
    it('возвращает страницу уведомлений пользователя с total', async () => {
      const items = [{ id: 2 }, { id: 1 }];
      prisma.$transaction.mockResolvedValue([items, 12]);

      const result = await service.findAllFor(5, 1, 2);

      expect(result).toEqual({ items, total: 12, page: 1, limit: 2 });
      expect(prisma.notification.findMany).toHaveBeenCalledWith({
        where: { userId: 5 },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 2,
      });
      expect(prisma.notification.count).toHaveBeenCalledWith({
        where: { userId: 5 },
      });
    });
  });

  describe('unreadCount', () => {
    it('считает только непрочитанные строки пользователя', async () => {
      prisma.notification.count.mockResolvedValue(3);

      await expect(service.unreadCount(5)).resolves.toEqual({ count: 3 });
      expect(prisma.notification.count).toHaveBeenCalledWith({
        where: { userId: 5, readAt: null },
      });
    });
  });

  describe('markRead', () => {
    it('проставляет readAt только своей непрочитанной строке', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 1 });

      await service.markRead(5, 10);

      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { id: 10, userId: 5, readAt: null },
        data: { readAt: expect.any(Date) },
      });
    });

    it('идемпотентен: count 0 (чужая/прочитанная/нет) — не ошибка', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.markRead(5, 999)).resolves.toBeUndefined();
    });
  });

  describe('markAllRead', () => {
    it('проставляет readAt всем непрочитанным пользователя', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 4 });

      await expect(service.markAllRead(5)).resolves.toEqual({ count: 4 });
      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { userId: 5, readAt: null },
        data: { readAt: expect.any(Date) },
      });
    });
  });

  describe('removeOne', () => {
    it('удаляет свою строку', async () => {
      prisma.notification.deleteMany.mockResolvedValue({ count: 1 });

      await service.removeOne(5, 10);

      expect(prisma.notification.deleteMany).toHaveBeenCalledWith({
        where: { id: 10, userId: 5 },
      });
    });

    it('кидает 404, если строки нет или она чужая', async () => {
      prisma.notification.deleteMany.mockResolvedValue({ count: 0 });
      await expect(service.removeOne(5, 999)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('removeAll', () => {
    it('с onlyRead=true удаляет только прочитанные', async () => {
      prisma.notification.deleteMany.mockResolvedValue({ count: 2 });

      await expect(service.removeAll(5, true)).resolves.toEqual({ count: 2 });
      expect(prisma.notification.deleteMany).toHaveBeenCalledWith({
        where: { userId: 5, readAt: { not: null } },
      });
    });

    it('с onlyRead=false удаляет всё пользователя', async () => {
      prisma.notification.deleteMany.mockResolvedValue({ count: 7 });

      await service.removeAll(5, false);

      expect(prisma.notification.deleteMany).toHaveBeenCalledWith({
        where: { userId: 5 },
      });
    });
  });
});
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `npm test -- notifications.service`
Expected: FAIL — `Cannot find module './notifications.service'`

- [ ] **Step 3: Реализовать сервис (пока без broadcast-методов)**

`src/modules/notifications/notifications.service.ts`:

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

- [ ] **Step 4: Убедиться, что тесты зелёные**

Run: `npm test -- notifications.service`
Expected: PASS (9 тестов)

- [ ] **Step 5: Commit**

```bash
git add src/modules/notifications
git commit -m "Add NotificationsService user-facing methods"
```

---

### Task 5: NotificationsService — broadcast, история, отзыв

**Files:**
- Modify: `src/modules/notifications/notifications.service.ts`
- Create: `src/modules/notifications/dto/create-broadcast.dto.ts`
- Test: `src/modules/notifications/notifications.service.spec.ts` (дописать)

- [ ] **Step 1: Создать DTO (нужен сервису для типа аргумента)**

`src/modules/notifications/dto/create-broadcast.dto.ts`:

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

- [ ] **Step 2: Дописать падающие тесты в `notifications.service.spec.ts`**

Добавить внутрь корневого `describe('NotificationsService', ...)`:

```typescript
  describe('broadcast', () => {
    const dto = { title: 'v2.0', body: 'Обновление', roleName: 'user' };

    it('кидает 404 для несуществующей роли', async () => {
      prisma.role.findUnique.mockResolvedValue(null);
      await expect(service.broadcast(1, dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('роль без пользователей — не ошибка, recipients: 0, строки не создаются', async () => {
      prisma.role.findUnique.mockResolvedValue({ users: [] });
      prisma.broadcast.create.mockResolvedValue({ id: 7, createdAt: new Date() });

      await expect(service.broadcast(1, dto)).resolves.toEqual({
        id: 7,
        recipients: 0,
      });
      expect(prisma.notification.createManyAndReturn).not.toHaveBeenCalled();
      expect(gateway.sendToUser).not.toHaveBeenCalled();
    });

    it('создаёт Broadcast и копию Notification каждому пользователю роли', async () => {
      prisma.role.findUnique.mockResolvedValue({
        users: [
          { id: 5, userSetting: { notificationsOn: true } },
          { id: 8, userSetting: null },
        ],
      });
      prisma.broadcast.create.mockResolvedValue({ id: 7, createdAt: new Date() });
      prisma.notification.createManyAndReturn.mockResolvedValue([
        { id: 101, userId: 5 },
        { id: 102, userId: 8 },
      ]);

      const result = await service.broadcast(1, dto);

      expect(result).toEqual({ id: 7, recipients: 2 });
      expect(prisma.broadcast.create).toHaveBeenCalledWith({
        data: {
          title: 'v2.0',
          body: 'Обновление',
          roleName: 'user',
          recipients: 2,
          createdById: 1,
        },
      });
      expect(prisma.notification.createManyAndReturn).toHaveBeenCalledWith({
        data: [
          { userId: 5, title: 'v2.0', body: 'Обновление', data: undefined, broadcastId: 7 },
          { userId: 8, title: 'v2.0', body: 'Обновление', data: undefined, broadcastId: 7 },
        ],
        select: { id: true, userId: true },
      });
    });

    it('шлёт WS-событие только пользователям с notificationsOn=true', async () => {
      prisma.role.findUnique.mockResolvedValue({
        users: [
          { id: 5, userSetting: { notificationsOn: true } },
          { id: 8, userSetting: { notificationsOn: false } },
          { id: 9, userSetting: null },
        ],
      });
      const createdAt = new Date();
      prisma.broadcast.create.mockResolvedValue({ id: 7, createdAt });
      prisma.notification.createManyAndReturn.mockResolvedValue([
        { id: 101, userId: 5 },
        { id: 102, userId: 8 },
        { id: 103, userId: 9 },
      ]);

      await service.broadcast(1, dto);

      expect(gateway.sendToUser).toHaveBeenCalledTimes(1);
      expect(gateway.sendToUser).toHaveBeenCalledWith(5, {
        id: 101,
        type: 'ANNOUNCEMENT',
        title: 'v2.0',
        body: 'Обновление',
        data: null,
        createdAt,
      });
    });
  });

  describe('listBroadcasts', () => {
    it('возвращает рассылки, новые сверху', async () => {
      const rows = [{ id: 2 }, { id: 1 }];
      prisma.broadcast.findMany.mockResolvedValue(rows);

      await expect(service.listBroadcasts()).resolves.toBe(rows);
      expect(prisma.broadcast.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('recallBroadcast', () => {
    it('кидает 404 для несуществующей рассылки', async () => {
      prisma.broadcast.findUnique.mockResolvedValue(null);
      await expect(service.recallBroadcast(99)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('кидает 409 для уже отозванной', async () => {
      prisma.broadcast.findUnique.mockResolvedValue({
        id: 7,
        recalledAt: new Date(),
      });
      await expect(service.recallBroadcast(7)).rejects.toThrow(
        ConflictException,
      );
    });

    it('удаляет строки получателей и помечает recalledAt', async () => {
      prisma.broadcast.findUnique.mockResolvedValue({ id: 7, recalledAt: null });
      prisma.$transaction.mockResolvedValue([{ count: 3000 }, {}]);

      await expect(service.recallBroadcast(7)).resolves.toEqual({
        removed: 3000,
      });
      expect(prisma.notification.deleteMany).toHaveBeenCalledWith({
        where: { broadcastId: 7 },
      });
      expect(prisma.broadcast.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { recalledAt: expect.any(Date) },
      });
    });
  });
```

И дополнить импорт в шапке файла:

```typescript
import { ConflictException, NotFoundException } from '@nestjs/common';
```

- [ ] **Step 3: Убедиться, что новые тесты падают**

Run: `npm test -- notifications.service`
Expected: FAIL — `service.broadcast is not a function` (старые 9 тестов остаются зелёными)

- [ ] **Step 4: Дописать методы в `notifications.service.ts`**

Обновить импорты:

```typescript
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../libs/database/prisma.service';
import { NotificationsGateway } from './notifications.gateway';
import { CreateBroadcastDto } from './dto/create-broadcast.dto';
import { Prisma } from '../../generated/prisma/client';
```

Добавить методы в класс:

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

- [ ] **Step 5: Убедиться, что все тесты зелёные**

Run: `npm test -- notifications.service`
Expected: PASS (16 тестов)

- [ ] **Step 6: Commit**

```bash
git add src/modules/notifications
git commit -m "Add broadcast, history and recall to NotificationsService"
```

---

### Task 6: Контроллер, модуль, подключение в AppModule

**Files:**
- Create: `src/modules/notifications/notifications.controller.ts`
- Create: `src/modules/notifications/notifications.module.ts`
- Modify: `src/app.module.ts`
- Test: `src/modules/notifications/notifications.controller.spec.ts`

- [ ] **Step 1: Написать падающий тест контроллера**

Тест проверяет делегирование в сервис и — главное — что админские маршруты закрыты метаданными `notifications:broadcast` (сам гвард уже протестирован в Task 2).

`src/modules/notifications/notifications.controller.spec.ts`:

```typescript
import 'reflect-metadata';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PERMISSIONS_KEY } from '../../shared/decorators/require-permissions.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

describe('NotificationsController', () => {
  const user: JwtPayload = { id: 5, email: 'a@b.c' };
  let service: Record<string, jest.Mock>;
  let controller: NotificationsController;

  beforeEach(() => {
    service = {
      findAllFor: jest.fn(),
      unreadCount: jest.fn(),
      markRead: jest.fn(),
      markAllRead: jest.fn(),
      removeOne: jest.fn(),
      removeAll: jest.fn(),
      broadcast: jest.fn(),
      listBroadcasts: jest.fn(),
      recallBroadcast: jest.fn(),
    };
    controller = new NotificationsController(
      service as unknown as NotificationsService,
    );
  });

  it.each([
    ['createBroadcast'],
    ['listBroadcasts'],
    ['recallBroadcast'],
  ])('%s требует permission notifications:broadcast', (method) => {
    const required = Reflect.getMetadata(
      PERMISSIONS_KEY,
      (NotificationsController.prototype as Record<string, unknown>)[method],
    );
    expect(required).toEqual(['notifications:broadcast']);
  });

  it('findAll передаёт userId и пагинацию в сервис', () => {
    controller.findAll(user, 2, 10);
    expect(service.findAllFor).toHaveBeenCalledWith(5, 2, 10);
  });

  it('removeAll трактует только read=true как onlyRead', () => {
    controller.removeAll(user, 'true');
    expect(service.removeAll).toHaveBeenCalledWith(5, true);

    controller.removeAll(user, undefined);
    expect(service.removeAll).toHaveBeenCalledWith(5, false);
  });

  it('createBroadcast передаёт id админа и dto', () => {
    const dto = { title: 't', body: 'b', roleName: 'user' };
    controller.createBroadcast(user, dto);
    expect(service.broadcast).toHaveBeenCalledWith(5, dto);
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `npm test -- notifications.controller`
Expected: FAIL — `Cannot find module './notifications.controller'`

- [ ] **Step 3: Реализовать контроллер**

ВАЖНО про порядок маршрутов: статические сегменты (`broadcasts`, `unread-count`, `read-all`) объявляются РАНЬШЕ параметрических (`:id`), иначе Nest сматчит `PATCH /notifications/read-all` на `PATCH /notifications/:id/read`-подобные маршруты и `ParseIntPipe` вернёт 400.

`src/modules/notifications/notifications.controller.ts`:

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

- [ ] **Step 4: Убедиться, что тесты контроллера зелёные**

Run: `npm test -- notifications.controller`
Expected: PASS (7 тестов)

- [ ] **Step 5: Создать модуль**

`src/modules/notifications/notifications.module.ts`:

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

- [ ] **Step 6: Подключить в AppModule**

В `src/app.module.ts` добавить импорт и элемент в массив `imports`:

```typescript
import { NotificationsModule } from './modules/notifications/notifications.module';
```

```typescript
    NotificationsModule,
```

- [ ] **Step 7: Полный прогон тестов и сборка**

```bash
npm test && npm run build
```

Expected: все тесты PASS, сборка без ошибок.

- [ ] **Step 8: Commit**

```bash
git add src/modules/notifications src/app.module.ts
git commit -m "Add notifications controller and module"
```

---

### Task 7: Ручная проверка (smoke)

**Files:** нет изменений кода (кроме возможных фиксов по итогам).

- [ ] **Step 1: Запустить приложение**

```bash
npm run start:dev
```

Expected: старт без ошибок, в логе маршруты `/api/notifications*`.

- [ ] **Step 2: Проверить сценарий админа**

Получить токен админа (пользователь с ролью `admin` должен существовать; логин — `POST /api/auth/login` с email/password), затем:

```bash
curl -s -X POST http://localhost:3000/api/notifications/broadcasts \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Тест","body":"Проверка рассылки","roleName":"user"}'
```

Expected: `{"id":1,"recipients":N}` где N — число пользователей роли `user`.

- [ ] **Step 3: Проверить сценарий пользователя**

С токеном пользователя роли `user`:

```bash
curl -s http://localhost:3000/api/notifications/unread-count -H "Authorization: Bearer $USER_TOKEN"
curl -s http://localhost:3000/api/notifications -H "Authorization: Bearer $USER_TOKEN"
```

Expected: `{"count":1}`; в списке уведомление «Тест». Затем пометить прочитанным и удалить, счётчик вернётся к 0.

- [ ] **Step 4: Проверить запреты**

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/notifications/broadcasts \
  -H "Authorization: Bearer $USER_TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"x","body":"y","roleName":"user"}'
```

Expected: `403`.

- [ ] **Step 5: Проверить отзыв**

```bash
curl -s -X DELETE http://localhost:3000/api/notifications/broadcasts/1 \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

Expected: `{"removed":N}`; у пользователя список пуст; повторный вызов → `409`.

- [ ] **Step 6: Проверить WebSocket (опционально, если есть под рукой клиент)**

Из браузерной консоли фронта или node-скрипта:

```javascript
const socket = io('http://localhost:3000/notifications', {
  auth: { token: '<USER_TOKEN>' },
});
socket.on('notification', (n) => console.log('notification:', n));
```

Отправить broadcast админом — в консоли появится событие (у пользователя должен быть `notificationsOn: true` в настройках).

---

### Task 8 (опционально, по желанию): retention-чистка

Спека помечает это опциональным последним шагом — можно пропустить и добавить позже без изменения схемы.

**Files:**
- Modify: `src/modules/notifications/notifications.service.ts`
- Modify: `src/app.module.ts`
- Test: `src/modules/notifications/notifications.service.spec.ts` (дописать)

- [ ] **Step 1: Установить `@nestjs/schedule`**

```bash
npm install @nestjs/schedule
```

- [ ] **Step 2: Подключить в AppModule**

В `src/app.module.ts`:

```typescript
import { ScheduleModule } from '@nestjs/schedule';
```

и в `imports`:

```typescript
    ScheduleModule.forRoot(),
```

- [ ] **Step 3: Дописать падающий тест**

В `notifications.service.spec.ts`:

```typescript
  describe('cleanupOld', () => {
    it('удаляет уведомления старше 90 дней', async () => {
      prisma.notification.deleteMany.mockResolvedValue({ count: 100 });

      await service.cleanupOld();

      const arg = prisma.notification.deleteMany.mock.calls[0][0];
      const cutoff = arg.where.createdAt.lt as Date;
      const days = (Date.now() - cutoff.getTime()) / 86_400_000;
      expect(days).toBeGreaterThan(89.9);
      expect(days).toBeLessThan(90.1);
    });
  });
```

Run: `npm test -- notifications.service` → FAIL (`cleanupOld is not a function`).

- [ ] **Step 4: Реализовать**

В `notifications.service.ts` добавить импорт и метод:

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

- [ ] **Step 5: Тесты и сборка зелёные**

```bash
npm test && npm run build
```

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src
git commit -m "Add daily notifications retention cleanup"
```
