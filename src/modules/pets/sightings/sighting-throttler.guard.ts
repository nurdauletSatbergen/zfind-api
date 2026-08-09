import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Rate-limit сообщений «видел питомца» с ключом «IP + код питомца».
 *
 * Чистый IP тут не годится: мобильные операторы раздают абонентов через NAT,
 * за одним внешним адресом сидят сотни людей — и сообщение о второй находке
 * получало бы 429 из-за чужого сообщения о первой. Ложная блокировка здесь
 * дороже пропущенного спама: спам владелец прочитает и проигнорирует, а
 * несостоявшееся сообщение о находке восстановить нечем.
 *
 * Флуд по одному питомцу с одного адреса режется как и раньше.
 */
@Injectable()
export class SightingThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, unknown>): Promise<string> {
    const ip = typeof req.ip === 'string' ? req.ip : 'unknown-ip';
    const params = req.params as Record<string, string> | undefined;
    const code = params?.code ?? 'unknown-pet';
    return Promise.resolve(`${ip}:${code}`);
  }
}
