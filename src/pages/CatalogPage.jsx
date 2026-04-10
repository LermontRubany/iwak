import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useProducts } from '../context/ProductsContext';
import { track } from '../utils/tracker';
import ProductCard from '../components/ProductCard';
import FilterPanel from '../components/FilterPanel';
import MiniPlayer from '../components/MiniPlayer';
import { normalizeBrand, formatBrand, getUniqueBrands } from '../utils/brandUtils';
import {
  parseFiltersFromURL, buildFilterParams, buildCanonicalURL,
  filtersEqual, getFilterHash, needsCanonicalRedirect, EMPTY_FILTERS,
} from '../utils/catalogUrl';

const SEARCH_FIELDS = ['name', 'brand', 'category'];
const URL_DEBOUNCE_MS = 300;

const SIZE_PATTERN = /^[a-z]{1,3}$|^\d{1,3}$/;

// Label maps for chips
const GENDER_LABELS = { mens: 'Мужское', womens: 'Женское', kids: 'Дети' };

function applySearch(items, query) {
  if (!query) return items;

  const words = query.replace(/\s+/g, ' ').trim().toLowerCase().split(' ').filter((w) => w.length > 0);
  if (words.length === 0) return items;

  return items.filter((product) => {
    const fields = SEARCH_FIELDS.map((f) => (product[f] || '').toLowerCase());
    return words.every((word) => {
      const textMatch = fields.some((field) => field.includes(word));

      const isNumber = /^\d+$/.test(word);
      const couldBeSize = SIZE_PATTERN.test(word);
      const sizeMatch = couldBeSize && product.sizes?.some((size) => {
        if (isNumber) return size === word;
        return size.toLowerCase() === word;
      });

      return textMatch || sizeMatch;
    });
  });
}

/**
 * Pure filter function — used both for catalog grid and matchCount preview.
 * All filter state (categories, genders, brands, sizes) comes from `filters`.
 */
function applyFilters(products, filters, sortBy, query, sale) {
  let result = applySearch(products, query);

  if (sale) {
    result = result.filter((p) => p.originalPrice && p.originalPrice > p.price);
  }

  if (filters.category) {
    result = result.filter((p) => p.category === filters.category);
  }

  if (filters.genders.length > 0) {
    result = result.filter((p) =>
      filters.genders.includes(p.gender) ||
      (p.gender === 'unisex' && !filters.genders.includes('kids'))
    );
  }

  if (filters.brands.length > 0) {
    result = result.filter((p) => filters.brands.includes(normalizeBrand(p?.brand)));
  }

  if (filters.sizes.length > 0) {
    result = result.filter((p) => p.sizes?.some((s) => filters.sizes.includes(s)));
  }

  switch (sortBy) {
    case 'price-asc':
      result = [...result].sort((a, b) => a.price - b.price || b.id - a.id);
      break;
    case 'price-desc':
      result = [...result].sort((a, b) => b.price - a.price || b.id - a.id);
      break;
    default:
      result = [...result].sort((a, b) => (b.priority ?? 50) - (a.priority ?? 50) || b.id - a.id);
      break;
  }

  return result;
}

export default function CatalogPage() {
  const { products, loading } = useProducts();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filterOpen, setFilterOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const skipUrlParse = useRef(false);

  useEffect(() => { track('page_view', { path: '/catalog' }); }, []);

  // ── Canonical redirect: normalize URL on first render ──
  const didRedirect = useRef(false);
  useEffect(() => {
    if (didRedirect.current) return;
    if (needsCanonicalRedirect(searchParams)) {
      didRedirect.current = true;
      const { filters: parsed, sortBy: parsedSort } = parseFiltersFromURL(searchParams);
      const canonical = buildFilterParams(parsed, parsedSort, searchParams);
      skipUrlParse.current = true;
      setSearchParams(canonical, { replace: true });
    }
  }, []);

  // Non-filter params
  const query = searchParams.get('q') || '';
  const saleParam = searchParams.get('sale') === 'true';

  // ── URL → State ──
  const [filters, setFilters] = useState(() => parseFiltersFromURL(searchParams).filters);
  const [sortBy, setSortBy] = useState(() => parseFiltersFromURL(searchParams).sortBy);

  useEffect(() => {
    if (skipUrlParse.current) {
      skipUrlParse.current = false;
      return;
    }
    const { filters: parsed, sortBy: parsedSort } = parseFiltersFromURL(searchParams);
    if (!filtersEqual(parsed, filters) || parsedSort !== sortBy) {
      setFilters(parsed);
      setSortBy(parsedSort);
    }
  }, [searchParams]);

  // ── State → URL (debounced) ──
  useEffect(() => {
    const timer = setTimeout(() => {
      const nextParams = buildFilterParams(filters, sortBy, searchParams);
      if (nextParams.toString() !== searchParams.toString()) {
        skipUrlParse.current = true;
        setSearchParams(nextParams, { replace: true });
      }
    }, URL_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [filters, sortBy]);

  // Derive filter options from product data
  const productCategories = useMemo(() =>
    [...new Set(products.map((p) => p.category).filter(Boolean))].sort(),
    [products]
  );

  const brands = useMemo(() =>
    getUniqueBrands(products).map((b) => b.key),
    [products]
  );

  const productGenders = useMemo(() =>
    [...new Set(products.map((p) => p.gender).filter(Boolean))].sort(),
    [products]
  );

  const productSizes = useMemo(() =>
    [...new Set(products.flatMap((p) => p.sizes || []))].sort((a, b) => {
      const na = Number(a), nb = Number(b);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.localeCompare(b);
    }),
    [products]
  );

  const filtered = useMemo(() =>
    applyFilters(products, filters, sortBy, query, saleParam),
    [products, filters, sortBy, query, saleParam]
  );

  // ── Adapter: FilterPanel expects {categories[], genders[], brands[], sizes[]} ──
  const panelFilters = useMemo(() => ({
    categories: filters.category ? [filters.category] : [],
    genders: filters.genders,
    brands: filters.brands,
    sizes: filters.sizes,
  }), [filters]);

  const getMatchCount = useCallback((draftFilters, draftSort) => {
    // draftFilters comes from FilterPanel in {categories[], genders[], ...} shape
    const adapted = {
      category: draftFilters.categories?.[0] || '',
      genders: draftFilters.genders || [],
      brands: draftFilters.brands || [],
      sizes: draftFilters.sizes || [],
    };
    return applyFilters(products, adapted, draftSort, query, saleParam).length;
  }, [products, query, saleParam]);

  const toggleFilter = (key, value, bulk) => {
    if (bulk) {
      // bulk comes from FilterPanel: {categories[], genders[], brands[], sizes[]}
      const next = {
        category: bulk.categories?.[0] || '',
        genders: bulk.genders || [],
        brands: bulk.brands || [],
        sizes: bulk.sizes || [],
      };
      setFilters(next);
      track('filter_apply', { hash: getFilterHash(next, sortBy) });
      return;
    }
    setFilters((prev) => {
      if (key === 'categories') {
        return { ...prev, category: prev.category === value ? '' : value };
      }
      const arr = prev[key];
      return {
        ...prev,
        [key]: arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value],
      };
    });
  };

  const removeFilter = (key, value) => {
    if (key === 'url-sale') {
      setSearchParams((prev) => { prev.delete('sale'); return prev; }, { replace: true });
      return;
    }
    if (key === 'category') {
      setFilters((prev) => ({ ...prev, category: '' }));
      return;
    }
    setFilters((prev) => ({
      ...prev,
      [key]: prev[key].filter((v) => v !== value),
    }));
  };

  const clearFilters = () => {
    setFilters({ ...EMPTY_FILTERS });
    setSortBy('default');
  };

  const clearAll = () => {
    clearFilters();
    setSearchParams((prev) => {
      const next = new URLSearchParams();
      const q = prev.get('q');
      if (q) next.set('q', q);
      // Preserve utm_* on clear
      for (const [k, v] of prev.entries()) {
        if (k.startsWith('utm_') && v) next.set(k, v);
      }
      return next;
    }, { replace: true });
  };

  const activeCount =
    (filters.category ? 1 : 0) + filters.genders.length + filters.sizes.length + filters.brands.length +
    (saleParam ? 1 : 0) + (sortBy !== 'default' ? 1 : 0);

  const handleCopyLink = useCallback(() => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }, []);

  // Build chips: Sale → Category → Gender → Brand → Size
  const chips = useMemo(() => {
    const list = [];
    if (saleParam) list.push({ key: 'url-sale', id: 'sale', label: 'Скидки' });
    if (filters.category) list.push({ key: 'category', id: filters.category, label: filters.category });
    for (const id of filters.genders) list.push({ key: 'genders', id, label: GENDER_LABELS[id] || id });
    for (const id of filters.brands) list.push({ key: 'brands', id, label: formatBrand(id) });
    for (const id of filters.sizes) list.push({ key: 'sizes', id, label: id });
    return list;
  }, [filters, saleParam]);

  return (
    <div className="catalog-page">
      {query && (
        <div className="search-results-header">
          <span className="search-results-label">Результаты для «{query}»</span>
          <span className="search-results-count">{filtered.length}</span>
        </div>
      )}

      <div className="catalog-toolbar">
        {activeCount > 0 && (
          <button
            className={`toolbar-copy-btn${copied ? ' toolbar-copy-btn--copied' : ''}`}
            onClick={handleCopyLink}
          >
            {copied ? 'ССЫЛКА СКОПИРОВАНА ✓' : 'СКОПИРОВАТЬ ПОДБОРКУ'}
          </button>
        )}
        <button className={`toolbar-btn${activeCount > 0 ? ' toolbar-btn--active' : ''}`} onClick={() => setFilterOpen(true)}>
          {activeCount > 0 ? `ПОДОБРАТЬ ТОВАРЫ (${activeCount})` : 'ПОДОБРАТЬ ТОВАРЫ +'}
        </button>
      </div>

      {chips.length > 0 && (
        <div className="filter-chips">
          {chips.map((chip) => (
            <button
              key={`${chip.key}-${chip.id}`}
              className="filter-chip"
              onClick={() => removeFilter(chip.key, chip.id)}
            >
              {chip.label}
              <span className="filter-chip__x">&times;</span>
            </button>
          ))}
          {chips.length > 1 && (
            <button className="filter-chips__clear" onClick={clearFilters}>
              Очистить всё
            </button>
          )}
        </div>
      )}

      <div className="product-grid">
        {loading ? (
          Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="product-card-skeleton">
              <div className="product-card-skeleton__image" />
              <div className="product-card-skeleton__info">
                <div className="product-card-skeleton__line product-card-skeleton__line--short" />
                <div className="product-card-skeleton__line" />
                <div className="product-card-skeleton__line product-card-skeleton__line--medium" />
              </div>
            </div>
          ))
        ) : filtered.length === 0 ? (
          saleParam ? (
            <div className="empty-state">
              <MiniPlayer />
              <button className="btn-link" onClick={() => setSearchParams({})}>
                Смотреть все товары
              </button>
            </div>
          ) : (
            <div className="empty-state">
              <p>Товары не найдены</p>
              <button className="btn-link" onClick={clearAll}>Сбросить фильтры</button>
            </div>
          )
        ) : (
          filtered.map((product, i) => (
            <ProductCard key={product.id} product={product} priority={i < 4} />
          ))
        )}
      </div>

      <FilterPanel
        isOpen={filterOpen}
        onClose={() => setFilterOpen(false)}
        filters={panelFilters}
        onToggleFilter={toggleFilter}
        onApply={() => setFilterOpen(false)}
        sortBy={sortBy}
        onSort={setSortBy}
        brands={brands}
        categories={productCategories}
        genders={productGenders}
        sizes={productSizes}
        getMatchCount={getMatchCount}
      />
    </div>
  );
}
