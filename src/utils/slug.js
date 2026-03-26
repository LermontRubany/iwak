// Кириллица → латиница
const TRANSLIT = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh',
  з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
  п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts',
  ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu',
  я: 'ya',
};

export function toSlug(str) {
  return str
    .toLowerCase()
    .split('')
    .map((c) => {
      if (TRANSLIT[c] !== undefined) return TRANSLIT[c];
      if (/[a-z0-9]/.test(c)) return c;
      return '-';
    })
    .join('')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Slug формата: {transliterated-name}-{id}
 * id в конце позволяет мгновенно найти товар без полного сканирования
 */
export function makeProductSlug(product) {
  return `${toSlug(product.name)}-${product.id}`;
}

/**
 * Извлечь id из slug.
 * Поддерживает два формата:
 *   - числовой id (seed): name-123  →  123 (number)
 *   - UUID (admin):        name-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx  →  "xxxxxxxx-..." (string)
 */
export function idFromSlug(slug) {
  if (!slug) return null;

  // Пробуем UUID (8-4-4-4-12 hex) в конце slug
  const uuidRe = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
  const m = slug.match(uuidRe);
  if (m) return m[1];

  // Иначе числовой id — последний сегмент
  const parts = slug.split('-');
  const last = parts[parts.length - 1];
  const n = Number(last);
  return Number.isInteger(n) && n > 0 ? n : null;
}
