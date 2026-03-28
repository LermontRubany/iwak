import { useState, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useProducts } from '../context/ProductsContext';
import ProductCard from '../components/ProductCard';
import FilterPanel from '../components/FilterPanel';
import MiniPlayer from '../components/MiniPlayer';

const SEARCH_FIELDS = ['name', 'brand', 'category'];

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
 * Filters derive from product data — no preset groups.
 */
function applyFilters(products, filters, sortBy, query, categoryFromURL, gendersFromURL, sale) {
  let result = applySearch(products, query);

  if (sale) {
    result = result.filter((p) => p.originalPrice && p.originalPrice > p.price);
  }

  if (categoryFromURL) {
    result = result.filter((p) => p.category === categoryFromURL);
  }

  if (filters.categories.length > 0) {
    result = result.filter((p) => filters.categories.includes(p.category));
  }

  if (filters.genders.length > 0) {
    result = result.filter((p) =>
      p.gender === 'unisex' || filters.genders.includes(p.gender)
    );
  }

  if (gendersFromURL.length > 0) {
    result = result.filter((p) =>
      p.gender === 'unisex' || gendersFromURL.includes(p.gender)
    );
  }

  if (filters.brands.length > 0) {
    result = result.filter((p) => filters.brands.includes(p.brand));
  }

  if (filters.sizes.length > 0) {
    result = result.filter((p) => p.sizes?.some((s) => filters.sizes.includes(s)));
  }

  switch (sortBy) {
    case 'price-asc':
      result = [...result].sort((a, b) => a.price - b.price);
      break;
    case 'price-desc':
      result = [...result].sort((a, b) => b.price - a.price);
      break;
    default:
      break;
  }

  return result;
}

export default function CatalogPage() {
  const { products } = useProducts();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filterOpen, setFilterOpen] = useState(false);

  const query = searchParams.get('q') || '';
  const categoryFromURL = searchParams.get('category') || '';
  const genderParam = searchParams.get('gender') || '';
  const gendersFromURL = genderParam ? [genderParam] : [];
  const saleParam = searchParams.get('sale') === 'true';

  const [filters, setFilters] = useState({
    categories: [],
    genders: [],
    sizes: [],
    brands: [],
  });

  const [sortBy, setSortBy] = useState('default');

  // Derive all filter options from product data
  const productCategories = useMemo(() =>
    [...new Set(products.map((p) => p.category).filter(Boolean))].sort(),
    [products]
  );

  const brands = useMemo(() =>
    [...new Set(products.map((p) => p.brand).filter(Boolean))].sort(),
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
    applyFilters(products, filters, sortBy, query, categoryFromURL, gendersFromURL, saleParam),
    [products, filters, sortBy, query, categoryFromURL, genderParam, saleParam]
  );

  const getMatchCount = useCallback((draftFilters, draftSort) => {
    return applyFilters(products, draftFilters, draftSort, query, categoryFromURL, gendersFromURL, saleParam).length;
  }, [products, query, categoryFromURL, genderParam, saleParam]);

  const toggleFilter = (key, value, bulk) => {
    if (bulk) {
      setFilters(bulk);
      return;
    }
    setFilters((prev) => {
      const arr = prev[key];
      return {
        ...prev,
        [key]: arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value],
      };
    });
  };

  const removeFilter = (key, value) => {
    if (key === 'url-gender') {
      setSearchParams((prev) => { prev.delete('gender'); return prev; });
      return;
    }
    if (key === 'url-sale') {
      setSearchParams((prev) => { prev.delete('sale'); return prev; });
      return;
    }
    setFilters((prev) => ({
      ...prev,
      [key]: prev[key].filter((v) => v !== value),
    }));
  };

  const clearFilters = () => {
    setFilters({ categories: [], genders: [], sizes: [], brands: [] });
    setSortBy('default');
  };

  const clearAll = () => {
    clearFilters();
    setSearchParams({});
  };

  const activeCount =
    filters.categories.length + filters.genders.length + filters.sizes.length + filters.brands.length +
    (genderParam ? 1 : 0) + (saleParam ? 1 : 0);

  // Build chips in fixed order: URL gender → Category → Gender → Brand → Size
  const chips = useMemo(() => {
    const list = [];
    if (saleParam) list.push({ key: 'url-sale', id: 'sale', label: 'Скидки' });
    if (genderParam) list.push({ key: 'url-gender', id: genderParam, label: GENDER_LABELS[genderParam] || genderParam });
    for (const id of filters.categories) list.push({ key: 'categories', id, label: id });
    for (const id of filters.genders) list.push({ key: 'genders', id, label: GENDER_LABELS[id] || id });
    for (const id of filters.brands) list.push({ key: 'brands', id, label: id });
    for (const id of filters.sizes) list.push({ key: 'sizes', id, label: id });
    return list;
  }, [filters, genderParam, saleParam]);

  return (
    <div className="catalog-page">
      {query && (
        <div className="search-results-header">
          <span className="search-results-label">Результаты для «{query}»</span>
          <span className="search-results-count">{filtered.length}</span>
        </div>
      )}

      <div className="catalog-toolbar">
        <button className="toolbar-btn" onClick={() => setFilterOpen(true)}>
          ФИЛЬТР &amp; СОРТИРОВКА
          <span className="toolbar-plus">{activeCount > 0 ? `(${activeCount})` : '+'}</span>
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
        {filtered.length === 0 ? (
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
          filtered.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))
        )}
      </div>

      <FilterPanel
        isOpen={filterOpen}
        onClose={() => setFilterOpen(false)}
        filters={filters}
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
