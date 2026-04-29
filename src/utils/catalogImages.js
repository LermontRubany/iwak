export const USE_CATALOG_THUMBNAILS = true;

export function getCatalogImage(src) {
  if (!USE_CATALOG_THUMBNAILS || !src?.startsWith('/uploads/') || src.startsWith('/uploads/catalog/')) {
    return src;
  }
  return src.replace('/uploads/', '/uploads/catalog/').replace(/\.(jpe?g|png|webp|avif)$/i, '.webp');
}

export function preloadImage(src) {
  if (!src || typeof Image === 'undefined') return;
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
}
