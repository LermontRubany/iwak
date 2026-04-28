import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { lockScroll, unlockScroll } from '../utils/scrollLock';
import { formatBrand } from '../utils/brandUtils';

const GENDER_LABELS = { mens: 'Мужское', womens: 'Женское', kids: 'Детское', unisex: 'Унисекс' };
const CONSULT_CATEGORY_LABELS = {
  'кроссовки': 'Нужны кроссовки',
  'одежда': 'Нужна одежда',
  'аксессуары': 'Ищу аксессуар',
};

const sortOptions = [
  { id: 'default', label: 'Популярное' },
  { id: 'price-asc', label: 'Дешевле' },
  { id: 'price-desc', label: 'Дороже' },
];

function formatVariantCount(count) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} ВАРИАНТ`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} ВАРИАНТА`;
  return `${count} ВАРИАНТОВ`;
}

export default function FilterPanel({
  isOpen,
  onClose,
  filters,
  onToggleFilter,
  onApply,
  sortBy,
  onSort,
  sale,
  onSaleChange,
  onCopyLink,
  copied,
  brands,
  categories,
  genders,
  sizes,
  getMatchCount,
}) {
  const panelRef = useRef(null);
  const sizeSectionRef = useRef(null);
  const brandSectionRef = useRef(null);
  const sortSectionRef = useRef(null);
  const [closing, setClosing] = useState(false);
  const [showAllBrands, setShowAllBrands] = useState(false);
  const [showBrandPicker, setShowBrandPicker] = useState(false);
  const [showSortPicker, setShowSortPicker] = useState(false);
  const [showSizePicker, setShowSizePicker] = useState(false);

  const handleClose = () => {
    if (closing) return;
    setClosing(true);
    setTimeout(() => {
      onClose();
      setClosing(false);
    }, 300);
  };

  useEffect(() => {
    if (!isOpen) setClosing(false);
  }, [isOpen]);

  const [draft, setDraft] = useState({ categories: [], genders: [], sizes: [], brands: [], sortBy, sale: false });

  useEffect(() => {
    if (isOpen) {
      setDraft({ ...filters, sortBy, sale: !!sale });
      setShowAllBrands(false);
      setShowBrandPicker(false);
      setShowSortPicker(false);
      setShowSizePicker(false);
      lockScroll();
      requestAnimationFrame(() => {
        const body = panelRef.current?.querySelector('.filter-panel__body');
        if (body) body.scrollTop = 0;
      });
    } else {
      unlockScroll();
    }
    return () => { unlockScroll(); };
  }, [isOpen, filters, sortBy, sale]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, closing]);

  useEffect(() => {
    if (!isOpen || !panelRef.current) return;
    const panel = panelRef.current;
    const focusable = panel.querySelectorAll('button, input, [tabindex]:not([tabindex="-1"])');
    if (focusable.length) focusable[0].focus();

    const trap = (e) => {
      if (e.key !== 'Tab' || !focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', trap);
    return () => document.removeEventListener('keydown', trap);
  }, [isOpen]);

  const toggleDraft = useCallback((key, value) => {
    setDraft((prev) => {
      const arr = prev[key];
      const next = arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
      return { ...prev, [key]: next };
    });
  }, []);

  const setDraftSort = useCallback((id) => {
    setDraft((prev) => ({ ...prev, sortBy: id }));
  }, []);

  const setDraftCategory = useCallback((id) => {
    setDraft((prev) => ({
      ...prev,
      categories: prev.categories.includes(id) ? [] : [id],
      sizes: [],
    }));
  }, []);

  const toggleDraftSale = useCallback(() => {
    setDraft((prev) => ({ ...prev, sale: !prev.sale }));
  }, []);

  const scrollToSection = useCallback((sectionRef) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const body = panelRef.current?.querySelector('.filter-panel__body');
        const section = sectionRef.current;
        if (!body || !section) return;
        body.scrollTo({
          top: Math.max(0, section.offsetTop - 10),
          behavior: 'smooth',
        });
      });
    });
  }, []);

  const toggleSizePicker = useCallback(() => {
    const shouldOpen = !showSizePicker;
    setShowSizePicker(shouldOpen);
    if (shouldOpen) scrollToSection(sizeSectionRef);
  }, [showSizePicker, scrollToSection]);

  const toggleBrandPicker = useCallback(() => {
    const shouldOpen = !showBrandPicker;
    setShowBrandPicker(shouldOpen);
    if (shouldOpen) scrollToSection(brandSectionRef);
  }, [showBrandPicker, scrollToSection]);

  const toggleSortPicker = useCallback(() => {
    const shouldOpen = !showSortPicker;
    setShowSortPicker(shouldOpen);
    if (shouldOpen) scrollToSection(sortSectionRef);
  }, [showSortPicker, scrollToSection]);

  const handleApply = () => {
    const { sortBy: draftSort, sale: draftSale, ...draftFilters } = draft;
    const handled = onApply?.({ filters: draftFilters, sortBy: draftSort, sale: draftSale });
    if (handled) return;
    onToggleFilter(null, null, draftFilters);
    onSort(draftSort);
    if (onSaleChange) onSaleChange(draftSale);
  };

  const handleClear = () => {
    setDraft({ categories: [], genders: [], sizes: [], brands: [], sortBy: 'default', sale: false });
  };

  const totalSelected = useMemo(() => {
    return draft.categories.length + draft.genders.length + draft.sizes.length + draft.brands.length + (draft.sale ? 1 : 0) + (draft.sortBy !== 'default' ? 1 : 0);
  }, [draft]);

  const hasChanges = useMemo(() => {
    return JSON.stringify({ ...filters, sortBy, sale: !!sale }) !== JSON.stringify(draft);
  }, [filters, sortBy, sale, draft]);

  const matchCount = useMemo(() => {
    if (!getMatchCount) return null;
    const { sortBy: _s, sale: draftSale, ...draftFilters } = draft;
    return getMatchCount(draftFilters, draft.sortBy, draftSale);
  }, [draft, getMatchCount]);

  const getDraftCount = useCallback((patch = {}) => {
    if (!getMatchCount) return null;
    const next = { ...draft, ...patch };
    const { sortBy: draftSort, sale: draftSale, ...draftFilters } = next;
    return getMatchCount(draftFilters, draftSort, draftSale);
  }, [draft, getMatchCount]);

  const categoryOptions = useMemo(() => (categories || []).map((c) => ({ id: c, label: c })), [categories]);
  const genderOptions = useMemo(() => (genders || []).map((g) => ({ id: g, label: GENDER_LABELS[g] || g })), [genders]);
  const selectedCategory = draft.categories[0] || '';
  const primaryCategories = useMemo(() => {
    const priority = ['кроссовки', 'одежда', 'аксессуары'];
    return priority
      .map((id) => categoryOptions.find((item) => item.id === id))
      .filter(Boolean);
  }, [categoryOptions]);
  const categoryCounts = useMemo(() => {
    const map = {};
    primaryCategories.forEach((item) => {
      map[item.id] = getDraftCount({ categories: [item.id], sizes: [] });
    });
    return map;
  }, [primaryCategories, getDraftCount]);
  const genderCounts = useMemo(() => {
    const map = {};
    genderOptions.forEach((item) => {
      const next = draft.genders.includes(item.id)
        ? draft.genders.filter((g) => g !== item.id)
        : [...draft.genders, item.id];
      map[item.id] = getDraftCount({ genders: next });
    });
    return map;
  }, [genderOptions, draft.genders, getDraftCount]);
  const shouldShowSizes = selectedCategory && !selectedCategory.includes('аксесс');
  const sizeOptions = useMemo(() => {
    const list = sizes || [];
    if (selectedCategory.includes('кроссов')) return list.filter((s) => /^\d/.test(String(s)));
    if (selectedCategory.includes('одеж')) return list.filter((s) => /^[a-z]{1,3}$/i.test(String(s)));
    if (selectedCategory.includes('аксесс')) return list.filter((s) => ['OS', 'ONE SIZE'].includes(String(s).toUpperCase()));
    return list.slice(0, 18);
  }, [sizes, selectedCategory]);
  const brandOptions = useMemo(() => (brands || []).map((b) => ({ id: b, label: formatBrand(b) })), [brands]);
  const visibleBrands = useMemo(() => {
    if (showAllBrands) return brandOptions;
    const priority = ['nike', 'adidas', 'jordan', 'new-balance', 'asics', 'puma', 'stone-island', 'the-north-face'];
    const picked = [];
    for (const id of priority) {
      const item = brandOptions.find((b) => b.id === id);
      if (item) picked.push(item);
    }
    for (const item of brandOptions) {
      if (picked.length >= 8) break;
      if (!picked.some((b) => b.id === item.id)) picked.push(item);
    }
    return picked;
  }, [brandOptions, showAllBrands]);
  const brandSummary = draft.brands.length
    ? draft.brands.map((b) => formatBrand(b)).join(', ')
    : 'любой';
  const sortSummary = sortOptions.find((item) => item.id === draft.sortBy)?.label || 'Популярное';
  const sizeSummary = draft.sizes.length ? draft.sizes.join(', ') : 'любой';
  const hasExactOptions = shouldShowSizes || brandOptions.length > 0;

  const summary = useMemo(() => {
    const parts = [];
    if (draft.categories[0]) parts.push(draft.categories[0]);
    draft.genders.forEach((g) => parts.push(GENDER_LABELS[g] || g));
    if (draft.sale) parts.push('скидки');
    draft.sizes.forEach((s) => parts.push(s));
    draft.brands.forEach((b) => parts.push(formatBrand(b)));
    return parts;
  }, [draft]);

  useEffect(() => {
    if (!isOpen) return;
    const body = panelRef.current?.querySelector('.filter-panel__body');
    if (body && body.scrollTop < 140) body.scrollTop = 0;
  }, [isOpen, draft.categories, draft.genders, draft.sale]);

  const renderChips = (items, draftKey) =>
    items.map((item) => (
      <li key={item.id}>
        <button
          type="button"
          className={`filter-chip-btn${draft[draftKey].includes(item.id) ? ' filter-chip-btn--selected' : ''}`}
          onClick={() => toggleDraft(draftKey, item.id)}
        >
          {item.label}
        </button>
      </li>
    ));

  return (
    <>
      <div className={`filter-backdrop ${isOpen && !closing ? 'filter-backdrop--open' : ''}`} onClick={handleClose} />
      <aside
        ref={panelRef}
        className={`filter-panel ${isOpen && !closing ? 'filter-panel--open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Каталог плюс"
      >
        <div className="filter-panel__header">
          <div>
            <span className="filter-panel__title">Каталог+</span>
            <p className="filter-panel__subtitle">Выберите пару пунктов — покажем подходящее</p>
          </div>
          <button className="filter-close" onClick={handleClose} aria-label="Закрыть фильтр">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <line x1="1" y1="1" x2="13" y2="13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              <line x1="13" y1="1" x2="1" y2="13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="filter-summary-card">
          <span className="filter-summary-card__label">Ваш запрос</span>
          {summary.length ? (
            <div className="filter-summary-card__chips">
              {summary.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          ) : (
            <div className="filter-summary-card__value">пока ничего не выбрано</div>
          )}
        </div>

        <div className="filter-panel__body">
          {primaryCategories.length > 0 && (
          <div className="filter-section filter-section--primary">
            <div className="filter-section__label">
              Чем помочь?
              {draft.categories.length > 0 && <span className="filter-section__count"> ({draft.categories.length})</span>}
            </div>
            <ul className="filter-options filter-options--consult">
              {primaryCategories.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`filter-choice-card${draft.categories.includes(item.id) ? ' filter-choice-card--selected' : ''}`}
                    onClick={() => setDraftCategory(item.id)}
                  >
                    <span>{CONSULT_CATEGORY_LABELS[item.id] || item.label}</span>
                    {categoryCounts[item.id] != null && (
                      <small>{categoryCounts[item.id]}</small>
                    )}
                  </button>
                </li>
              ))}
              <li>
                <button
                  type="button"
                  className={`filter-choice-card${draft.sale ? ' filter-choice-card--selected' : ''}`}
                  onClick={toggleDraftSale}
                >
                  <span>Хочу скидку</span>
                  {getDraftCount({ sale: !draft.sale }) != null && (
                    <small>{getDraftCount({ sale: !draft.sale })}</small>
                  )}
                </button>
              </li>
            </ul>
          </div>
          )}

          {genderOptions.length > 0 && (
          <div className="filter-section">
            <div className="filter-section__label">
              Кому?
              {draft.genders.length > 0 && <span className="filter-section__count"> ({draft.genders.length})</span>}
            </div>
            <ul className="filter-options">
              {genderOptions.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`filter-chip-btn${draft.genders.includes(item.id) ? ' filter-chip-btn--selected' : ''}`}
                    onClick={() => toggleDraft('genders', item.id)}
                  >
                    {item.label}
                    {genderCounts[item.id] != null && <small>{genderCounts[item.id]}</small>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          )}

          {hasExactOptions && (
          <div className="filter-section filter-section--details">
            <div className="filter-section__label">Есть конкретный запрос?</div>
            <div className="filter-detail-list">
              {shouldShowSizes && (
              <button
                type="button"
                className="filter-detail-row"
                onClick={toggleSizePicker}
              >
                <span>Размер</span>
                <strong>{sizeSummary}</strong>
              </button>
              )}
              <button
                type="button"
                className="filter-detail-row"
                onClick={toggleBrandPicker}
              >
                <span>Бренд</span>
                <strong>{brandSummary}</strong>
              </button>
              <button
                type="button"
                className="filter-detail-row"
                onClick={toggleSortPicker}
              >
                <span>Сначала</span>
                <strong>{sortSummary}</strong>
              </button>
            </div>
          </div>
          )}

          {showSizePicker && shouldShowSizes && sizeOptions.length > 0 && (
          <div className="filter-section" ref={sizeSectionRef}>
            <div className="filter-section__label">
              Размер
              {draft.sizes.length > 0 && <span className="filter-section__count"> ({draft.sizes.length})</span>}
            </div>
            <ul className="filter-options filter-options--sizes">
              {sizeOptions.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    className={`filter-size-btn${draft.sizes.includes(s) ? ' filter-size-btn--selected' : ''}`}
                    onClick={() => toggleDraft('sizes', s)}
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          )}

          {showBrandPicker && brandOptions.length > 0 && (
            <div className="filter-section" ref={brandSectionRef}>
              <div className="filter-section__label">
                Бренд
                {draft.brands.length > 0 && <span className="filter-section__count"> ({draft.brands.length})</span>}
              </div>
              <ul className="filter-options">
                {renderChips(visibleBrands, 'brands')}
              </ul>
              {brandOptions.length > visibleBrands.length && (
                <button className="filter-more-btn" type="button" onClick={() => setShowAllBrands(true)}>
                  Все бренды
                </button>
              )}
            </div>
          )}

          {showSortPicker && (
          <div className="filter-section filter-section--compact" ref={sortSectionRef}>
            <div className="filter-section__label">
              Сначала
              {draft.sortBy !== 'default' && <span className="filter-section__count"> (1)</span>}
            </div>
            <ul className="filter-options">
              {sortOptions.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className={`filter-sort-btn${draft.sortBy === s.id ? ' filter-sort-btn--selected' : ''}`}
                    onClick={() => setDraftSort(s.id)}
                  >
                    {s.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          )}
        </div>

        <div className="filter-panel__footer">
          <button
            className={`filter-btn-apply ${hasChanges ? '' : 'filter-btn-apply--inactive'}`}
            onClick={handleApply}
          >
            {matchCount != null ? `ПОКАЗАТЬ ${formatVariantCount(matchCount)}` : 'ПОКАЗАТЬ ВАРИАНТЫ'}
          </button>
          {totalSelected > 0 && onCopyLink && !hasChanges && (
            <button className="filter-btn-copy" type="button" onClick={onCopyLink}>
              {copied ? 'Ссылка скопирована' : 'Скопировать подборку'}
            </button>
          )}
          <button
            className="filter-btn-clear"
            onClick={handleClear}
            disabled={totalSelected === 0}
          >
            СБРОСИТЬ
          </button>
        </div>
      </aside>
    </>
  );
}
