import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useProducts } from '../context/ProductsContext';
import { genders } from '../data/products';
import { getCategories } from '../utils/categoryStorage';
import AdminProductForm from './AdminProductForm';
import AdminCategories from './AdminCategories';

const AUTH_KEY = 'iwak_admin_auth';

const CATEGORY_FILTERS = [
  { id: '', label: 'Все' },
  { id: 'shoes', label: 'Обувь' },
  { id: 'clothing', label: 'Одежда' },
  { id: 'accessories', label: 'Аксессуары' },
];

const GENDER_FILTERS = [
  { id: '', label: 'Все' },
  { id: 'mens', label: 'М' },
  { id: 'womens', label: 'Ж' },
  { id: 'kids', label: 'Дети' },
];

export default function AdminApp() {
  const { products, addProduct, updateProduct, deleteProduct, bulkDelete, bulkUpdatePrices, bulkResetPrices, bulkSetFeatured, resetToSeed } = useProducts();
  const [view, setView] = useState('list'); // 'list' | 'add' | 'edit'
  const [editTarget, setEditTarget] = useState(null);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [genderFilter, setGenderFilter] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [showPricePanel, setShowPricePanel] = useState(false);
  const [priceMode, setPriceMode] = useState('discount'); // 'discount' | 'markup' | 'fixed'
  const [priceValue, setPriceValue] = useState('');
  const [showBadgePanel, setShowBadgePanel] = useState(false);
  const [bulkBadge, setBulkBadge] = useState({ enabled: true, text: '', borderColor: 'rgba(0,0,0,0.8)', textColor: '#000', shape: 'rect', type: 'outline', position: 'top-left', size: 'm' });
  const [tab, setTab] = useState('products'); // 'products' | 'categories'

  // Inline editing
  const [editingField, setEditingField] = useState(null); // {id, field}
  const [editValue, setEditValue] = useState('');
  const [bulkConfirmedSession, setBulkConfirmedSession] = useState(false);
  const [bulkConfirmPending, setBulkConfirmPending] = useState(null);
  const debounceRef = useRef(null);

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  const catLabels = useMemo(() => {
    const map = {};
    for (const c of getCategories()) map[c.id] = c.label;
    return map;
  }, []);
  const genderLabels = useMemo(() => {
    const map = {};
    for (const g of genders) map[g.id] = g.label;
    return map;
  }, []);

  const handleLogout = () => {
    localStorage.removeItem(AUTH_KEY);
    window.location.reload();
  };

  const handleSave = (data) => {
    if (editTarget) {
      updateProduct(editTarget.id, data);
    } else {
      addProduct(data);
    }
    setView('list');
    setEditTarget(null);
  };

  const handleEdit = (product) => {
    setEditTarget(product);
    setView('edit');
  };

  const handleDelete = (id) => {
    if (window.confirm('Удалить товар?')) {
      deleteProduct(id);
      setSelected((prev) => { const next = new Set(prev); next.delete(id); return next; });
    }
  };

  const handleReset = () => {
    if (window.confirm('Сбросить все товары к исходным? Это удалит все изменения.')) {
      resetToSeed();
      setSelected(new Set());
    }
  };

  const handleBulkDelete = () => {
    if (selected.size === 0) return;
    if (!window.confirm(`Удалить ${selected.size} товар(ов)?`)) return;
    bulkDelete([...selected]);
    setSelected(new Set());
  };

  const handleBulkPrice = () => {
    const val = Number(priceValue);
    if (!val || val <= 0) return;
    const ids = [...selected];
    if (priceMode === 'discount') {
      bulkUpdatePrices(ids, (p) => p * (1 - val / 100));
    } else if (priceMode === 'markup') {
      bulkUpdatePrices(ids, (p) => p * (1 + val / 100));
    } else {
      // Фикс. цена — просто устанавливаем новую цену, убираем originalPrice
      ids.forEach((id) => {
        updateProduct(id, { price: val, originalPrice: undefined });
      });
    }
    setShowPricePanel(false);
    setPriceValue('');
  };

  const handleBulkResetPrices = () => {
    if (!window.confirm('Сбросить скидки для выбранных товаров?')) return;
    bulkResetPrices([...selected]);
  };

  const handleBulkBadgeApply = () => {
    const ids = [...selected];
    const badge = bulkBadge.enabled
      ? { ...bulkBadge, text: bulkBadge.text.trim().toUpperCase() }
      : { ...bulkBadge, enabled: false };
    ids.forEach((id) => updateProduct(id, { badge }));
    setShowBadgePanel(false);
  };

  const handleBulkBadgeRemove = () => {
    const ids = [...selected];
    ids.forEach((id) => updateProduct(id, { badge: { enabled: false, text: '', borderColor: 'rgba(0,0,0,0.8)', textColor: '#000', shape: 'rect' } }));
    setShowBadgePanel(false);
  };

  const handleBulkFeatured = (featured) => {
    bulkSetFeatured([...selected], featured);
  };

  // — Inline editing —
  const applyInlineChange = (id, field, value) => {
    const val = field === 'price' ? Number(value) : value;
    if (field === 'price' && (!val || val <= 0)) return;
    if (selected.size > 0) {
      [...selected].forEach((pid) => updateProduct(pid, { [field]: val }));
    } else {
      updateProduct(id, { [field]: val });
    }
  };

  const startInlineEdit = (productId, field, currentValue, e) => {
    e.stopPropagation();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (selected.size > 1 && !bulkConfirmedSession) {
      setBulkConfirmPending({ id: productId, field, value: currentValue });
      return;
    }
    setEditingField({ id: productId, field });
    setEditValue(String(currentValue ?? ''));
  };

  const handleInlineChange = (value) => {
    setEditValue(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!editingField) return;
    const { id, field } = editingField;
    debounceRef.current = setTimeout(() => {
      applyInlineChange(id, field, value);
    }, 400);
  };

  const commitInlineEdit = () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (editingField) {
      applyInlineChange(editingField.id, editingField.field, editValue);
    }
    setEditingField(null);
    setEditValue('');
  };

  const cancelInlineEdit = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setEditingField(null);
    setEditValue('');
  };

  const handleBulkConfirm = () => {
    setBulkConfirmedSession(true);
    if (bulkConfirmPending) {
      const { id, field, value } = bulkConfirmPending;
      setEditingField({ id, field });
      setEditValue(String(value ?? ''));
    }
    setBulkConfirmPending(null);
  };

  const handleBulkCancel = () => {
    setBulkConfirmPending(null);
  };

  const renderInlineField = (product, field, className, displayContent) => {
    const isEditing = editingField?.id === product.id && editingField?.field === field;
    if (isEditing) {
      return (
        <input
          className={`adm-inline-input adm-inline-input--${field}`}
          type={field === 'price' ? 'number' : 'text'}
          min={field === 'price' ? '1' : undefined}
          value={editValue}
          onChange={(e) => handleInlineChange(e.target.value)}
          onBlur={commitInlineEdit}
          onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') cancelInlineEdit(); }}
          autoFocus
          onClick={(e) => e.stopPropagation()}
        />
      );
    }
    return (
      <span
        className={`${className} adm-inline-editable`}
        onClick={(e) => startInlineEdit(product.id, field, product[field], e)}
      >
        {displayContent ?? product[field]}
      </span>
    );
  };

  const toggleSelect = useCallback((id, e) => {
    e.stopPropagation();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const filtered = useMemo(() => {
    let list = products;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((p) =>
        [p.name, p.brand, p.category].join(' ').toLowerCase().includes(q)
      );
    }
    if (catFilter) {
      list = list.filter((p) => {
        if (catFilter === 'shoes') return p.category === 'shoes';
        if (catFilter === 'clothing') return !['shoes', 'accessories'].includes(p.category);
        if (catFilter === 'accessories') return p.category === 'accessories';
        return true;
      });
    }
    if (genderFilter) {
      list = list.filter((p) => p.gender === genderFilter);
    }
    return list;
  }, [products, search, catFilter, genderFilter]);

  const selectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((p) => p.id)));
    }
  };

  if (view === 'add' || view === 'edit') {
    return (
      <div className="adm-root">
        <div className="adm-header">
          <button className="adm-back" onClick={() => { setView('list'); setEditTarget(null); }}>
            ← НАЗАД
          </button>
          <span className="adm-header__title">
            {view === 'edit' ? 'РЕДАКТИРОВАТЬ' : 'НОВЫЙ ТОВАР'}
          </span>
        </div>
        <div className="adm-body">
          <AdminProductForm
            initial={editTarget}
            onSave={handleSave}
            onCancel={() => { setView('list'); setEditTarget(null); }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="adm-root">
      <div className="adm-header">
        <span className="adm-header__brand">IWAK ADMIN</span>
        <button className="adm-logout" onClick={handleLogout}>ВЫЙТИ</button>
      </div>

      {/* Tabs */}
      <div className="adm-tabs">
        <button className={`adm-tab${tab === 'products' ? ' adm-tab--active' : ''}`} onClick={() => setTab('products')}>ТОВАРЫ</button>
        <button className={`adm-tab${tab === 'categories' ? ' adm-tab--active' : ''}`} onClick={() => setTab('categories')}>КАТЕГОРИИ</button>
      </div>

      {tab === 'categories' ? (
        <AdminCategories />
      ) : (
      <>

      <div className="adm-toolbar">
        <input
          className="adm-input adm-search"
          type="text"
          placeholder="Поиск товара..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="adm-btn adm-btn--primary adm-add-btn" onClick={() => setView('add')}>
          + ДОБАВИТЬ
        </button>
      </div>

      {/* Category + Gender filter chips */}
      <div className="adm-filters">
        <div className="adm-filter-row">
          {CATEGORY_FILTERS.map((c) => (
            <button
              key={c.id}
              className={`adm-filter-chip${catFilter === c.id ? ' adm-filter-chip--active' : ''}`}
              onClick={() => setCatFilter(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="adm-filter-row">
          {GENDER_FILTERS.map((g) => (
            <button
              key={g.id}
              className={`adm-filter-chip${genderFilter === g.id ? ' adm-filter-chip--active' : ''}`}
              onClick={() => setGenderFilter(g.id)}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>

      <div className="adm-stats">
        <span>Товаров: {products.length} · Показано: {filtered.length}</span>
        <button className="adm-select-all" onClick={selectAll}>
          {selected.size === filtered.length && filtered.length > 0 ? 'Снять всё' : 'Выбрать все'}
        </button>
      </div>

      {selected.size > 0 && (
        <div className="adm-bulk-banner">
          <span>Выбрано: {selected.size} товар(ов)</span>
          <span className="adm-bulk-banner__badge">Массовое редактирование активно</span>
        </div>
      )}

      <div className={`adm-list${selected.size > 0 ? ' adm-list--with-bar' : ''}`}>
        {filtered.length === 0 && (
          <div className="adm-empty">Ничего не найдено</div>
        )}
        {filtered.map((product) => (
          <div
            key={product.id}
            className={`adm-card adm-card--clickable${selected.has(product.id) ? ' adm-card--selected' : ''}`}
            onClick={() => handleEdit(product)}
          >
            <button
              className={`adm-checkbox${selected.has(product.id) ? ' adm-checkbox--on' : ''}`}
              onClick={(e) => toggleSelect(product.id, e)}
              aria-label="Выбрать"
            >
              {selected.has(product.id) ? '✓' : ''}
            </button>
            <div className="adm-card__img">
              {product.image ? (
                <img src={product.image} alt={product.name} loading="lazy" />
              ) : (
                <div className="adm-card__img-placeholder" style={{ background: product.colorHex || '#eee' }} />
              )}
            </div>
            <div className="adm-card__info">
              {renderInlineField(product, 'brand', 'adm-card__brand')}
              {renderInlineField(product, 'name', 'adm-card__name')}
              <span className="adm-card__meta">
                {catLabels[product.category] || product.category} · {genderLabels[product.gender] || product.gender} · {product.sizes?.join(', ')}
              </span>
              {editingField?.id === product.id && editingField?.field === 'price' ? (
                <input
                  className="adm-inline-input adm-inline-input--price"
                  type="number"
                  min="1"
                  value={editValue}
                  onChange={(e) => handleInlineChange(e.target.value)}
                  onBlur={commitInlineEdit}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') cancelInlineEdit(); }}
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                />
              ) : product.originalPrice && product.originalPrice > product.price ? (
                <span className="adm-card__price-row adm-inline-editable" onClick={(e) => startInlineEdit(product.id, 'price', product.price, e)}>
                  <span className="adm-card__price adm-card__price--sale">₽{product.price?.toLocaleString('ru-RU')}</span>
                  <span className="adm-card__price--old">₽{product.originalPrice.toLocaleString('ru-RU')}</span>
                  <span className="adm-card__badge">-{Math.round(100 - (product.price / product.originalPrice) * 100)}%</span>
                </span>
              ) : (
                <span className="adm-card__price adm-inline-editable" onClick={(e) => startInlineEdit(product.id, 'price', product.price, e)}>₽{product.price?.toLocaleString('ru-RU')}</span>
              )}
            </div>
            <div className="adm-card__actions">
              <button className="adm-action-btn adm-action-btn--del" onClick={(e) => { e.stopPropagation(); handleDelete(product.id); }}>✕</button>
            </div>
          </div>
        ))}
      </div>

      {/* Selection toolbar */}
      {selected.size > 0 && (
        <div className="adm-selection-bar">
          <div className="adm-selection-bar__top">
            <span className="adm-selection-bar__count">Выбрано: {selected.size}</span>
            <button className="adm-selection-bar__close" onClick={() => setSelected(new Set())}>✕</button>
          </div>

          {showPricePanel ? (
            <div className="adm-price-panel">
              <div className="adm-price-panel__modes">
                <button className={`adm-filter-chip${priceMode === 'discount' ? ' adm-filter-chip--active' : ''}`} onClick={() => setPriceMode('discount')}>Скидка %</button>
                <button className={`adm-filter-chip${priceMode === 'markup' ? ' adm-filter-chip--active' : ''}`} onClick={() => setPriceMode('markup')}>Наценка %</button>
                <button className={`adm-filter-chip${priceMode === 'fixed' ? ' adm-filter-chip--active' : ''}`} onClick={() => setPriceMode('fixed')}>Фикс. цена</button>
              </div>
              <div className="adm-price-panel__input-row">
                <input
                  className="adm-input adm-input--dark"
                  type="number"
                  min="1"
                  placeholder={priceMode === 'fixed' ? 'Цена ₽' : 'Процент'}
                  value={priceValue}
                  onChange={(e) => setPriceValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleBulkPrice(); } }}
                  autoFocus
                />
                <button className="adm-btn adm-btn--primary adm-btn--sm" onClick={handleBulkPrice}>OK</button>
                <button className="adm-btn adm-btn--ghost adm-btn--sm" onClick={() => { setShowPricePanel(false); setPriceValue(''); }}>✕</button>
              </div>
            </div>
          ) : showBadgePanel ? (
            <div className="adm-badge-panel">
              <div className="adm-badge-panel__header">
                <span>Бейдж для {selected.size} товар(ов)</span>
                <button className="adm-btn adm-btn--ghost adm-btn--sm" onClick={() => setShowBadgePanel(false)}>✕</button>
              </div>
              <div className="adm-badge-panel__toggle">
                <span style={{color:'rgba(255,255,255,0.7)',fontSize:11}}>Включить</span>
                <button
                  type="button"
                  className={`adm-toggle${bulkBadge.enabled ? ' adm-toggle--on' : ''}`}
                  onClick={() => setBulkBadge((b) => ({ ...b, enabled: !b.enabled }))}
                >
                  {bulkBadge.enabled ? 'ДА' : 'НЕТ'}
                </button>
              </div>
              {bulkBadge.enabled && (
                <>
                  <input
                    className="adm-input adm-input--dark"
                    type="text"
                    maxLength={18}
                    placeholder="NEW IN, LIMITED..."
                    value={bulkBadge.text}
                    onChange={(e) => setBulkBadge((b) => ({ ...b, text: e.target.value }))}
                    style={{ textTransform: 'uppercase' }}
                  />
                  <div className="adm-badge-panel__row">
                    <span style={{color:'rgba(255,255,255,0.5)',fontSize:10}}>Бейдж:</span>
                    <input type="color" className="adm-color-picker adm-color-picker--dark" value={bulkBadge.borderColor.startsWith('#') ? bulkBadge.borderColor : '#000000'} onChange={(e) => setBulkBadge((b)=>({...b,borderColor:e.target.value}))} />
                    <span style={{color:'rgba(255,255,255,0.5)',fontSize:10,marginLeft:8}}>Текст:</span>
                    <input type="color" className="adm-color-picker adm-color-picker--dark" value={bulkBadge.textColor.startsWith('#') ? bulkBadge.textColor : '#000000'} onChange={(e) => setBulkBadge((b)=>({...b,textColor:e.target.value}))} />
                  </div>
                  <div className="adm-badge-panel__row">
                    {[{id:'rect',l:'▬'},{id:'rounded',l:'▢'},{id:'pill',l:'⬭'},{id:'circle',l:'●'}].map((s)=>(
                      <button key={s.id} type="button" className={`adm-filter-chip${bulkBadge.shape===s.id?' adm-filter-chip--active':''}`} onClick={() => setBulkBadge((b)=>({...b,shape:s.id}))}>{s.l}</button>
                    ))}
                  </div>
                  <div className="adm-badge-panel__row">
                    <span style={{color:'rgba(255,255,255,0.5)',fontSize:10}}>Тип:</span>
                    <button type="button" className={`adm-filter-chip${(bulkBadge.type||'outline')==='outline'?' adm-filter-chip--active':''}`} onClick={() => setBulkBadge((b)=>({...b,type:'outline'}))}>Контур</button>
                    <button type="button" className={`adm-filter-chip${bulkBadge.type==='filled'?' adm-filter-chip--active':''}`} onClick={() => setBulkBadge((b)=>({...b,type:'filled'}))}>Заливка</button>
                  </div>
                  <div className="adm-badge-panel__row">
                    <span style={{color:'rgba(255,255,255,0.5)',fontSize:10}}>Размер:</span>
                    {[{id:'s',l:'S'},{id:'m',l:'M'},{id:'l',l:'L'}].map((p)=>(
                      <button key={p.id} type="button" className={`adm-filter-chip${(bulkBadge.size||'m')===p.id?' adm-filter-chip--active':''}`} onClick={() => setBulkBadge((b)=>({...b,size:p.id}))}>{p.l}</button>
                    ))}
                  </div>
                  <div className="adm-badge-panel__row">
                    <span style={{color:'rgba(255,255,255,0.5)',fontSize:10}}>Позиция:</span>
                    {[{id:'top-left',l:'↖'},{id:'top-right',l:'↗'},{id:'bottom-left',l:'↙'},{id:'bottom-right',l:'↘'}].map((p)=>(
                      <button key={p.id} type="button" className={`adm-filter-chip${(bulkBadge.position||'top-left')===p.id?' adm-filter-chip--active':''}`} onClick={() => setBulkBadge((b)=>({...b,position:p.id}))}>{p.l}</button>
                    ))}
                  </div>
                  {bulkBadge.text.trim() && (
                    <div className="adm-badge-panel__preview">
                      <span className="product-badge" style={{border:`1px solid ${bulkBadge.borderColor}`,color:bulkBadge.textColor,borderRadius:({rect:'1px',rounded:'4px',pill:'999px',circle:'50%'})[bulkBadge.shape]||'1px'}}>{bulkBadge.text.trim().toUpperCase()}</span>
                    </div>
                  )}
                </>
              )}
              <div className="adm-badge-panel__actions">
                <button className="adm-btn adm-btn--primary adm-btn--sm" onClick={handleBulkBadgeApply}>{bulkBadge.enabled ? 'ПРИМЕНИТЬ' : 'ВЫКЛЮЧИТЬ ВСЕ'}</button>
                <button className="adm-btn adm-btn--ghost adm-btn--sm" onClick={handleBulkBadgeRemove}>УБРАТЬ ВСЕ</button>
              </div>
            </div>
          ) : (
            <div className="adm-selection-bar__actions">
              <button className="adm-btn adm-btn--accent adm-btn--sm" onClick={() => setShowPricePanel(true)}>ЦЕНЫ</button>
              <button className="adm-btn adm-btn--accent adm-btn--sm" onClick={() => { setShowBadgePanel(true); setBulkBadge({ enabled: true, text: '', borderColor: 'rgba(0,0,0,0.8)', textColor: '#000', shape: 'rect', type: 'outline', position: 'top-left' }); }}>БЕЙДЖ</button>
              <button className="adm-btn adm-btn--accent adm-btn--sm" onClick={handleBulkResetPrices}>СБРОС СКИДОК</button>
              <button className="adm-btn adm-btn--danger adm-btn--sm" onClick={handleBulkDelete}>УДАЛИТЬ</button>
            </div>
          )}
        </div>
      )}

      <div className="adm-footer">
        <button className="adm-btn adm-btn--ghost adm-reset-btn" onClick={handleReset}>
          Сбросить к исходным
        </button>
      </div>

      {bulkConfirmPending && (
        <div className="adm-bulk-confirm-overlay" onClick={handleBulkCancel}>
          <div className="adm-bulk-confirm" onClick={(e) => e.stopPropagation()}>
            <p className="adm-bulk-confirm__text">Изменения применятся к {selected.size} товарам</p>
            <div className="adm-bulk-confirm__actions">
              <button className="adm-btn adm-btn--primary" onClick={handleBulkConfirm}>Продолжить</button>
              <button className="adm-btn adm-btn--ghost" onClick={handleBulkCancel}>Отмена</button>
            </div>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
}
