import sortSizes from './sortSizes';

/**
 * Canonical URL system for catalog filters.
 *
 * Strict parameter order:
 *   category → gender → brand → size → sort → q → sale → utm_*
 *
 * Rules:
 *   - values: lowercase, slug-format (spaces → hyphens), deduplicated, sorted
 *   - multi-values: comma-separated (brand=adidas,nike)
 *   - empty params omitted
 *   - utm_* params preserved transparently
 *
 * Types:
 *   - category: string (single value)
 *   - gender:   string[] (mens, womens, kids)
 *   - brand:    string[] (normalized slugs)
 *   - size:     string[] (sorted by sortSizes)
 *   - sort:     string   (price-asc | price-desc)
 */

const VALID_SORTS = ['price-asc', 'price-desc'];

const EMPTY_FILTERS = Object.freeze({
  category: '',
  genders: [],
  brands: [],
  sizes: [],
});

// ── Helpers ──

function slugify(v) {
  return v.trim().toLowerCase().replace(/\s+/g, '-');
}

function splitParam(value) {
  if (!value) return [];
  return value.split(',').map(slugify).filter(Boolean);
}

function dedupeSorted(arr) {
  return [...new Set(arr)].sort();
}

function extractUtm(searchParams) {
  const utm = [];
  for (const [key, val] of searchParams.entries()) {
    if (key.startsWith('utm_') && val) utm.push([key, val]);
  }
  return utm.sort((a, b) => a[0].localeCompare(b[0]));
}

// ── Core: append filter+sort params in canonical order ──

function appendFilterParams(params, filters, sortBy) {
  if (filters.category) params.set('category', filters.category);
  if (filters.genders.length) params.set('gender', dedupeSorted(filters.genders).join(','));
  if (filters.brands.length) params.set('brand', dedupeSorted(filters.brands).join(','));
  if (filters.sizes.length) params.set('size', sortSizes([...new Set(filters.sizes)]).join(','));
  if (sortBy && sortBy !== 'default') params.set('sort', sortBy);
}

// ── Parse URL → state ──

function parseFiltersFromURL(searchParams) {
  const raw = searchParams.get('category') || '';
  const category = slugify(raw) || '';

  const filters = {
    category,
    genders: dedupeSorted(splitParam(searchParams.get('gender'))),
    brands: dedupeSorted(splitParam(searchParams.get('brand'))),
    sizes: sortSizes([...new Set(splitParam(searchParams.get('size')))]),
  };

  const sort = searchParams.get('sort');
  const sortBy = VALID_SORTS.includes(sort) ? sort : 'default';

  return { filters, sortBy };
}

// ── Build state → canonical URLSearchParams ──
// Strict order: category → gender → brand → size → sort → q → sale → utm_*

function buildFilterParams(filters, sortBy, searchParams) {
  const params = new URLSearchParams();

  appendFilterParams(params, filters, sortBy);

  // Non-filter params
  const q = searchParams.get('q');
  if (q) params.set('q', q);
  if (searchParams.get('sale') === 'true') params.set('sale', 'true');

  // UTM params — pass through untouched, sorted by key
  for (const [key, val] of extractUtm(searchParams)) {
    params.set(key, val);
  }

  return params;
}

// ── Full canonical URL (for Telegram, clipboard, marketing) ──

function buildCanonicalURL(filters, sortBy, extra = {}) {
  const params = new URLSearchParams();

  appendFilterParams(params, filters, sortBy);

  if (extra.q) params.set('q', extra.q);
  if (extra.sale) params.set('sale', 'true');

  if (extra.utm) {
    for (const [key, val] of Object.entries(extra.utm).sort(([a], [b]) => a.localeCompare(b))) {
      if (key.startsWith('utm_') && val) params.set(key, val);
    }
  }

  const qs = params.toString();
  return qs ? `/catalog?${qs}` : '/catalog';
}

// ── Compare ──

function filtersEqual(a, b) {
  return (
    a.category === b.category &&
    arrEq(a.genders, b.genders) &&
    arrEq(a.brands, b.brands) &&
    arrEq(a.sizes, b.sizes)
  );
}

function arrEq(a, b) {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

// ── Hash (for caching / analytics dedup) ──

function getFilterHash(filters, sortBy) {
  const parts = [
    filters.category || '-',
    dedupeSorted(filters.genders).join(',') || '-',
    dedupeSorted(filters.brands).join(',') || '-',
    sortSizes([...new Set(filters.sizes)]).join(',') || '-',
    sortBy || 'default',
  ];
  return parts.join('|');
}

// ── Check if URL needs canonical redirect ──

function needsCanonicalRedirect(searchParams) {
  const { filters, sortBy } = parseFiltersFromURL(searchParams);
  const canonical = buildFilterParams(filters, sortBy, searchParams);
  return canonical.toString() !== searchParams.toString();
}

export {
  EMPTY_FILTERS,
  parseFiltersFromURL,
  buildFilterParams,
  buildCanonicalURL,
  filtersEqual,
  getFilterHash,
  needsCanonicalRedirect,
};
