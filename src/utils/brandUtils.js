/**
 * Normalize a brand string to a stable lowercase key.
 * "ASICS", "Asics", " asics " → "asics"
 */
export function normalizeBrand(brand) {
  if (!brand) return null;
  return brand.trim().toLowerCase();
}

/**
 * Format a normalized brand key for display.
 * "asics" → "ASICS"
 */
export function formatBrand(normalizedKey) {
  if (!normalizedKey) return '';
  return normalizedKey.toUpperCase();
}

/**
 * Build a deduplicated, sorted list of brands from a products array.
 * Returns [{ key: "asics", label: "ASICS", count: N }, ...]
 */
export function getUniqueBrands(products) {
  if (!Array.isArray(products)) return [];
  const map = {};
  for (const p of products) {
    const norm = normalizeBrand(p?.brand);
    if (!norm) continue;
    if (!map[norm]) map[norm] = { key: norm, label: formatBrand(norm), count: 0 };
    map[norm].count++;
  }
  return Object.values(map).sort((a, b) => a.key.localeCompare(b.key, 'ru'));
}
