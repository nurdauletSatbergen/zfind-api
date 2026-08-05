import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { hash, compare } from 'bcrypt';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { JwtService } from '@nestjs/jwt';
import { Prisma, User } from '../../generated/prisma/client';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { PrismaService } from '../../libs/database/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { FilesService } from '../files/files.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private prisma: PrismaService,
    private filesService: FilesService,
  ) {}

  async validateUser(
    email: string,
    pass: string,
  ): Promise<Omit<User, 'password'> | null> {
    const user = await this.usersService.findOne({ email });
    if (user && (await compare(pass, user.password))) {
      const { password, ...result } = user;
      return result;
    }

    return null;
  }

  async signIn(user: Omit<User, 'password'>) {
    const payload: JwtPayload = { id: user.id, email: user.email };
    return {
      access_token: this.jwtService.sign(payload),
    };
  }

  async signUp(createUserDto: CreateUserDto) {
    const hashedPassword = await hash(createUserDto.password, 10);
    try {
      const user = await this.usersService.create({
        ...createUserDto,
        password: hashedPassword,
        role: {
          connect: { name: 'user' },
        },
      });
      const payload: JwtPayload = { id: user.id, email: user.email };
      return {
        access_token: this.jwtService.sign(payload),
      };
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2025'
      ) {
        throw new InternalServerErrorException(
          'Default role "user" not found — run "npx prisma db seed"',
        );
      }
      throw e;
    }
  }

  /**
   * Смена пароля с подтверждением текущего.
   *
   * Сверка обязательна: без неё перехваченный токен превращается в захват
   * аккаунта — злоумышленник меняет пароль и запирает владельца.
   */
  async changePassword(userId: number, dto: ChangePasswordDto): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (!(await compare(dto.currentPassword, user.password))) {
      // 400, а НЕ 401: на 401 глобальный интерцептор фронта считает сессию
      // протухшей и разлогинивает — опечатка в пароле не должна выкидывать
      // человека из аккаунта посреди смены пароля
      throw new BadRequestException('Текущий пароль неверен');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { password: await hash(dto.newPassword, 10) },
    });
  }

  /**
   * Удаление собственного аккаунта.
   *
   * Каскад в схеме убирает питомцев, фото-связки, sightings, эпизоды и
   * уведомления, но строки `File` и объекты в MinIO каскадом НЕ удаляются
   * (`PetPhoto.file` каскадит в обратную сторону, `Sighting.photo` — SetNull),
   * поэтому идентификаторы файлов собираются до удаления и чистятся после.
   */
  async deleteAccount(userId: number, dto: DeleteAccountDto): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (!(await compare(dto.password, user.password))) {
      throw new BadRequestException('Пароль неверен');
    }

    const [petPhotos, sightings] = await Promise.all([
      this.prisma.petPhoto.findMany({
        where: { pet: { ownerId: userId } },
        select: { fileId: true },
      }),
      this.prisma.sighting.findMany({
        where: { pet: { ownerId: userId }, photoFileId: { not: null } },
        select: { photoFileId: true },
      }),
    ]);

    const fileIds = [
      ...petPhotos.map((photo) => photo.fileId),
      ...sightings.flatMap((s) =>
        s.photoFileId != null ? [s.photoFileId] : [],
      ),
      ...(user.avatarId != null ? [user.avatarId] : []),
    ];

    await this.prisma.user.delete({ where: { id: userId } });

    // Аккаунт уже удалён — сбой хранилища оставит мусор в MinIO, но не должен
    // отменять само удаление, поэтому чистим best-effort с предупреждением.
    for (const fileId of fileIds) {
      try {
        await this.filesService.delete(fileId);
      } catch (e) {
        this.logger.warn(
          `Не удалён файл ${fileId} при удалении аккаунта ${userId}: ${String(e)}`,
        );
      }
    }
  }

  /**
   * Обновляет профиль текущего пользователя и возвращает его в том же виде,
   * что и getProfile, — чтобы фронт положил ответ в стор без второго запроса.
   */
  async updateProfile(id: number, dto: UpdateProfileDto) {
    await this.prisma.user.update({ where: { id }, data: { ...dto } });
    return this.getProfile(id);
  }

  async getProfile(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      omit: { password: true },
      include: {
        userSetting: {
          select: {
            smsEnabled: true,
            notificationsOn: true,
          },
        },
        role: {
          include: {
            permissions: true,
          },
        },
      },
    });

    if (!user) throw new NotFoundException('User not found');

    const { role, ...profile } = user;

    return {
      ...profile,
      role: role?.name ?? null,
      permissions: role?.permissions.map((p) => p.name) ?? [],
    };
  }
}
