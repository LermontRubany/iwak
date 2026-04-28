export function stripBrandFromName(product) {
  const name = (product?.name || '').trim();
  const brand = (product?.brand || '').trim();
  if (!name || !brand) return name;

  const lowerName = name.toLowerCase();
  const lowerBrand = brand.toLowerCase();
  if (lowerName === lowerBrand) return '';
  if (!lowerName.startsWith(lowerBrand)) return name;

  const nextChar = name.charAt(brand.length);
  if (nextChar && /[a-zа-яё0-9]/i.test(nextChar)) return name;

  return name.slice(brand.length).trim().replace(/^[-–—:|/\\]+/, '').trim() || name;
}

export function productDisplayName(product) {
  const brand = (product?.brand || '').trim();
  const name = stripBrandFromName(product);
  return [brand, name].filter(Boolean).join(' ') || 'Товар';
}
