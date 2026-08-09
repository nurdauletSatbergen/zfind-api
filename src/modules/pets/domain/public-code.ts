import { randomInt } from 'node:crypto';

const CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/**
 * Код для QR-жетона в виде `ABC-123`.
 *
 * Уникальность за кодом не закреплена — её обеспечивает уникальный индекс в
 * БД, а вызывающий повторяет генерацию при коллизии. Проверять занятость
 * заранее бессмысленно: между проверкой и вставкой всё равно есть гонка.
 */
export function generatePublicCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}
