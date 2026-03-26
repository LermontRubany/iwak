import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { lockScroll, unlockScroll } from '../utils/scrollLock';

const TYPE_OPTIONS = [
  { id: 'shoes', label: 'Кроссовки' },
  { id: 'clothing', label: 'Одежда' },
  { id: 'accessories', label: 'Аксессуары' },
];

const GENDER_OPTIONS = [
  { id: 'mens', label: 'Мужское' },
  { id: 'womens', label: 'Женское' },
  { id: 'kids', label: 'Дети' },
];

const CLOTHING_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const SHOE_SIZES = ['36', '37', '38', '39', '40', '41', '42', '43', '44', '45'];

const sortOptions = [
  { id: 'default', label: 'По умолчанию' },
  { id: 'price-asc', label: 'Дешевле' },
  { id: 'price-desc', label: 'Дороже' },
];

function getSizeOptions(types) {
  const hasShoes = types.includes('shoes');
  const hasClothing = types.includes('clothing') || types.includes('accessories');
  if (hasShoes && !hasClothing) return SHOE_SIZES;
  if (hasClothing && !hasShoes) return CLOTHING_SIZES;
  return [...CLOTHING_SIZES, ...SHOE_SIZES];
}

export default function FilterPanel({
  isOpen,
  onClose,
  filters,
  onToggleFilter,
  onApply,
  sortBy,
  onSort,
  brands,
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

  const [draft, setDraft] = useState({ types: [], genders: [], sizes: [], brands: [], sortBy });

  useEffect(() => {
    if (isOpen) {
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
      const updated = { ...prev, [key]: next };
      // Clear invalid sizes when type changes
      if (key === 'types') {
        const validSizes = getSizeOptions(next);
        updated.sizes = updated.sizes.filter((s) => validSizes.includes(s));
      }
      return updated;
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
    setDraft({ types: [], genders: [], sizes: [], brands: [], sortBy: 'default' });
  };

  const totalSelected = useMemo(() => {
    return draft.types.length + draft.genders.length + draft.sizes.length + draft.brands.length + (draft.sortBy !== 'default' ? 1 : 0);
  }, [draft]);

  const hasChanges = useMemo(() => {
    return JSON.stringify({ ...filters, sortBy }) !== JSON.stringify(draft);
  }, [filters, sortBy, draft]);

  const matchCount = useMemo(() => {
    if (!getMatchCount) return null;
    const { sortBy: _s, ...draftFilters } = draft;
    return getMatchCount(draftFilters, draft.sortBy);
  }, [draft, getMatchCount]);

  const sizeOptions = useMemo(() => getSizeOptions(draft.types), [draft.types]);
  const brandOptions = useMemo(() => (brands || []).map((b) => ({ id: b, label: b })), [brands]);

  const renderCheckboxes = (items, draftKey) =>
    items.map((item) => (
      <li key={item.id}>
        <label className="filter-option">
          <input
            type="checkbox"
            checked={draft[draftKey].includes(item.id)}
            onChange={() => toggleDraft(draftKey, item.id)}
          />
          <span>{item.label}</span>
        </label>
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
          <div className="filter-section">
            <div className="filter-section__label">
              ТИП ТОВАРА
              {draft.types.length > 0 && <span className="filter-section__count"> ({draft.types.length})</span>}
            </div>
            <ul className="filter-options filter-options--open">
              {renderCheckboxes(TYPE_OPTIONS, 'types')}
            </ul>
          </div>

          <div className="filter-section">
            <div className="filter-section__label">
              ПОЛ
              {draft.genders.length > 0 && <span className="filter-section__count"> ({draft.genders.length})</span>}
            </div>
            <ul className="filter-options filter-options--open">
              {renderCheckboxes(GENDER_OPTIONS, 'genders')}
            </ul>
          </div>

          <div className="filter-section">
            <div className="filter-section__label">
              РАЗМЕР
              {draft.sizes.length > 0 && <span className="filter-section__count"> ({draft.sizes.length})</span>}
            </div>
            <ul className="filter-options filter-options--open">
              {sizeOptions.map((s) => (
                <li key={s}>
                  <label className="filter-option">
                    <input
                      type="checkbox"
                      checked={draft.sizes.includes(s)}
                      onChange={() => toggleDraft('sizes', s)}
                    />
                    <span>{s}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>

          {brandOptions.length > 0 && (
            <div className="filter-section">
              <div className="filter-section__label">
                БРЕНД
                {draft.brands.length > 0 && <span className="filter-section__count"> ({draft.brands.length})</span>}
              </div>
              <ul className="filter-options filter-options--open">
                {renderCheckboxes(brandOptions, 'brands')}
              </ul>
            </div>
          )}

          <div className="filter-section">
            <div className="filter-section__label">
              СОРТИРОВКА
              {draft.sortBy !== 'default' && <span className="filter-section__count"> (1)</span>}
            </div>
            <ul className="filter-options filter-options--open">
              {sortOptions.map((s) => (
                <li key={s.id}>
                  <label className="filter-option">
                    <input
                      type="radio"
                      name="sort"
                      checked={draft.sortBy === s.id}
                      onChange={() => setDraftSort(s.id)}
                    />
                    <span>{s.label}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="filter-panel__footer">
          <button
            className="filter-btn-clear"
            onClick={handleClear}
            disabled={totalSelected === 0}
          >
            СБРОСИТЬ
          </button>
          <button
            className={`filter-btn-apply ${hasChanges ? '' : 'filter-btn-apply--inactive'}`}
            onClick={handleApply}
          >
            {matchCount != null ? `ПОКАЗАТЬ ТОВАРЫ (${matchCount})` : 'ПРИМЕНИТЬ'}
          </button>
        </div>
      </aside>
    </>
  );
}
