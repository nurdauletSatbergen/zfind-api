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
