/** Казахстанский номер в каноническом виде: +7 и 10 цифр */
export const KZ_PHONE_REGEX = /^\+7\d{10}$/;

export const KZ_PHONE_MESSAGE =
  'Номер должен быть казахстанским, например +77001234567';

/**
 * Приводит номер к виду +7XXXXXXXXXX: убирает пробелы, скобки и дефисы,
 * ведущую 8 заменяет на +7. Нераспознанное значение возвращает как есть —
 * его отбракует @Matches с понятным сообщением.
 */
export function normalizeKzPhone(value: unknown): unknown {
  if (typeof value !== 'string') return value;

  const digits = value.replace(/\D/g, '');
  if (
    digits.length === 11 &&
    (digits.startsWith('7') || digits.startsWith('8'))
  ) {
    return `+7${digits.slice(1)}`;
  }
  return value;
}
