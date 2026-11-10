import {
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  registerDecorator,
  ValidationOptions,
} from 'class-validator';

/** Ссылка рассылки: `http(s)://…` или путь сайта с одним `/` в начале */
const isHttpUrlOrSitePath = (url: string): boolean => {
  // `//host` и `/\host` браузер читает как внешний адрес, а не путь сайта
  if (/^\/(?![/\\])\S*$/.test(url)) return true;
  if (!/^https?:\/\//i.test(url)) return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

/**
 * `data.url`, если задан, — http(s) URL или путь сайта. Без проверки в
 * `javascript:`-ссылку по клику на уведомление попал бы любой текст.
 */
function IsBroadcastDataUrl(options?: ValidationOptions): PropertyDecorator {
  return (target, propertyName) =>
    registerDecorator({
      name: 'isBroadcastDataUrl',
      target: target.constructor,
      propertyName: propertyName as string,
      options: {
        message: 'data.url must be an http(s) URL or a site path',
        ...options,
      },
      validator: {
        validate(value: unknown) {
          if (typeof value !== 'object' || value === null) return true;
          const url = (value as Record<string, unknown>).url;
          if (url === undefined) return true;
          return typeof url === 'string' && isHttpUrlOrSitePath(url);
        },
      },
    });
}

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

  /**
   * Полезная нагрузка рассылки. `data.url` — ссылка «Подробнее»:
   * `https://…`, `http://…` или путь сайта (`/lost`, но не `//host`).
   */
  @IsObject()
  @IsOptional()
  @IsBroadcastDataUrl()
  data?: Record<string, unknown>;
}
