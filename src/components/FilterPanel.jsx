import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { lockScroll, unlockScroll } from '../utils/scrollLock';

const GENDER_LABELS = { mens: 'Мужское', womens: 'Женское', kids: 'Детское', unisex: 'Унисекс' };

const sortOptions = [
  { id: 'default', label: 'По умолчанию' },
  { id: 'price-asc', label: 'Дешевле' },
  { id: 'price-desc', label: 'Дороже' },
];

export default function FilterPanel({
  isOpen,
  onClose,
  filters,
  onToggleFilter,
  onApply,
  sortBy,
  onSort,
  brands,
  categories,
  genders,
  sizes,
  getMatchCount,
}) {
  const panelRef = useRef(null);
  const [closing, setClosing] = useState(false);

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

  const [draft, setDraft] = useState({ categories: [], genders: [], sizes: [], brands: [], sortBy });

  useEffect(() => {
    if (isOpen) {
      setDraft({ ...filters, sortBy });
      lockScroll();
    } else {
      unlockScroll();
    }
    return () => { unlockScroll(); };
  }, [isOpen]);

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

  const handleApply = () => {
    const { sortBy: draftSort, ...draftFilters } = draft;
    onToggleFilter(null, null, draftFilters);
    onSort(draftSort);
    onApply();
  };

  const handleClear = () => {
    setDraft({ categories: [], genders: [], sizes: [], brands: [], sortBy: 'default' });
  };

  const totalSelected = useMemo(() => {
    return draft.categories.length + draft.genders.length + draft.sizes.length + draft.brands.length + (draft.sortBy !== 'default' ? 1 : 0);
  }, [draft]);

  const hasChanges = useMemo(() => {
    return JSON.stringify({ ...filters, sortBy }) !== JSON.stringify(draft);
  }, [filters, sortBy, draft]);

  const matchCount = useMemo(() => {
    if (!getMatchCount) return null;
    const { sortBy: _s, ...draftFilters } = draft;
    return getMatchCount(draftFilters, draft.sortBy);
  }, [draft, getMatchCount]);

  const categoryOptions = useMemo(() => (categories || []).map((c) => ({ id: c, label: c })), [categories]);
  const genderOptions = useMemo(() => (genders || []).map((g) => ({ id: g, label: GENDER_LABELS[g] || g })), [genders]);
  const sizeOptions = useMemo(() => sizes || [], [sizes]);
  const brandOptions = useMemo(() => (brands || []).map((b) => ({ id: b, label: b })), [brands]);

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
        aria-label="Фильтр и сортировка"
      >
        <div className="filter-panel__header">
          <span className="filter-panel__title">ФИЛЬТР</span>
          <button className="filter-close" onClick={handleClose} aria-label="Закрыть фильтр">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <line x1="1" y1="1" x2="13" y2="13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              <line x1="13" y1="1" x2="1" y2="13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="filter-panel__body">
          {categoryOptions.length > 0 && (
          <div className="filter-section">
            <div className="filter-section__label">
              КАТЕГОРИЯ
              {draft.categories.length > 0 && <span className="filter-section__count"> ({draft.categories.length})</span>}
            </div>
            <ul className="filter-options">
              {renderChips(categoryOptions, 'categories')}
            </ul>
          </div>
          )}

          {genderOptions.length > 0 && (
          <div className="filter-section">
            <div className="filter-section__label">
              ПОЛ
              {draft.genders.length > 0 && <span className="filter-section__count"> ({draft.genders.length})</span>}
            </div>
            <ul className="filter-options">
              {renderChips(genderOptions, 'genders')}
            </ul>
          </div>
          )}

          {sizeOptions.length > 0 && (
          <div className="filter-section">
            <div className="filter-section__label">
              РАЗМЕР
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

          {brandOptions.length > 0 && (
            <div className="filter-section">
              <div className="filter-section__label">
                БРЕНД
                {draft.brands.length > 0 && <span className="filter-section__count"> ({draft.brands.length})</span>}
              </div>
              <ul className="filter-options">
                {renderChips(brandOptions, 'brands')}
              </ul>
            </div>
          )}

          <div className="filter-section">
            <div className="filter-section__label">
              СОРТИРОВКА
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
        </div>

        <div className="filter-panel__footer">
          <button
            className={`filter-btn-apply ${hasChanges ? '' : 'filter-btn-apply--inactive'}`}
            onClick={handleApply}
          >
            {matchCount != null ? `ПОКАЗАТЬ ТОВАРЫ (${matchCount})` : 'ПРИМЕНИТЬ'}
          </button>
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
