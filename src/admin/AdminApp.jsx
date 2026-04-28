import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useProducts } from '../context/ProductsContext';
import { useNotifications } from '../context/NotificationsContext';
import AdminProductForm from './AdminProductForm';
import NotificationBell from './NotificationBell';
import authFetch from './authFetch';
import AnalyticsTab from './AnalyticsTab';
import TelegramTab from './TelegramTab';
import PromoTab from './PromoTab';
import sortSizes from '../utils/sortSizes';
import { normalizeBrand, getUniqueBrands } from '../utils/brandUtils';
import { logout } from './authFetch';

const GENDER_LABELS = { mens: 'М', womens: 'Ж', kids: 'Дети', unisex: 'U' };

function formatDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}.${mm} · ${hh}:${mi}`;
}

export default function AdminApp() {
  const { products, updateProduct, deleteProduct, bulkDelete, bulkUpdate, bulkUpdatePrices, bulkResetPrices, bulkSetFeatured, bulkUpdatePriority, reloadProducts, verifyAdminPin } = useProducts();
  const { notify } = useNotifications();
  const [view, setView] = useState('list'); // 'list' | 'add' | 'edit'
  const [editTarget, setEditTarget] = useState(null);
  const [section, setSection] = useState('products'); // 'products' | 'analytics' | 'automation' | 'promo'
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [genderFilter, setGenderFilter] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [filterPanel, setFilterPanel] = useState(null);
  const [brandSearch, setBrandSearch] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [trashMode, setTrashMode] = useState(false);
  const [trashProducts, setTrashProducts] = useState([]);
  const [trashLoading, setTrashLoading] = useState(false);
  const [showPricePanel, setShowPricePanel] = useState(false);
  const [priceMode, setPriceMode] = useState('discount'); // 'discount' | 'markup' | 'fixed'
  const [priceValue, setPriceValue] = useState('');
  const [showBadgePanel, setShowBadgePanel] = useState(false);
  const [showPriorityPanel, setShowPriorityPanel] = useState(false);
  const [bulkBadge, setBulkBadge] = useState({ enabled: true, text: '', borderColor: 'rgba(0,0,0,0.8)', textColor: '#000', shape: 'rect', type: 'outline', position: 'top-left', size: 'm' });

  // Inline editing
  const [editingField, setEditingField] = useState(null); // {id, field}
  const [editValue, setEditValue] = useState('');
  const [bulkConfirmedSession, setBulkConfirmedSession] = useState(false);
  const [bulkConfirmPending, setBulkConfirmPending] = useState(null);
  const debounceRef = useRef(null);

  // Блокировка UI во время bulk-операций
  const [bulkActionLoading, setBulkActionLoading] = useState(false);

  // PIN-защита массового удаления
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);

  // ADMIN_PIN больше не хранится на клиенте — проверка идёт через /api/admin/verify-pin

  // Category management
  const [catList, setCatList] = useState([]);
  const [showAddCatInput, setShowAddCatInput] = useState(false);
  const [newCatName, setNewCatName] = useState('');

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  // Load categories from API (source of truth)
  const loadCategories = useCallback(async () => {
    try {
      const res = await authFetch('/api/filters');
      if (res.ok) {
        const data = await res.json();
        // API returns [{name, count}]
        setCatList(Array.isArray(data.categories) ? data.categories : []);
      }
    } catch { /* ignore */ }
  }, []);
  useEffect(() => { loadCategories(); }, [loadCategories]);

  const loadTrashProducts = useCallback(async () => {
    setTrashLoading(true);
    try {
      const res = await authFetch('/api/products?deleted=true&limit=2000');
      if (!res.ok) return;
      const data = await res.json();
      const raw = Array.isArray(data.items) ? data.items : [];
      setTrashProducts(raw.filter((p) => p && p.id != null));
    } catch {
      // authFetch уже показал ошибку
    } finally {
      setTrashLoading(false);
    }
  }, []);

  useEffect(() => {
    if (trashMode) loadTrashProducts();
  }, [trashMode, loadTrashProducts]);

  const handleAddCat = async () => {
    const val = newCatName.trim().toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '-').replace(/^-|-$/g, '');
    if (!val) return;
    try {
      const res = await authFetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: val }),
      });
      if (res.ok) {
        setNewCatName('');
        setShowAddCatInput(false);
        loadCategories();
        notify('success', `Категория «${val}» создана`);
      }
    } catch { notify('error', 'Ошибка создания категории'); }
  };

  const handleDeleteCat = async (name) => {
    if (!confirm(`Удалить категорию «${name}»?`)) return;
    try {
      const res = await authFetch(`/api/categories/${encodeURIComponent(name)}`, { method: 'DELETE' });
      if (res.ok) {
        if (catFilter === name) setCatFilter('');
        loadCategories();
        notify('success', `Категория «${name}» удалена`);
      } else {
        const body = await res.json().catch(() => ({}));
        notify('error', body.error || 'Ошибка удаления категории');
      }
    } catch { notify('error', 'Ошибка удаления категории'); }
  };

  const GENDER_DISPLAY = { mens: 'Мужское', womens: 'Женское', kids: 'Детское', unisex: 'Унисекс' };

  // Derive gender filter chips from product data
  const genderFilterOptions = useMemo(() => {
    const source = trashMode ? trashProducts : products;
    const gs = [...new Set((Array.isArray(source) ? source : []).map((p) => p?.gender).filter(Boolean))].sort();
    return [{ id: '', label: 'Все' }, ...gs.map((g) => ({ id: g, label: GENDER_LABELS[g] || g }))];
  }, [products, trashMode, trashProducts]);

  const brandFilterOptions = useMemo(() => {
    const source = trashMode ? trashProducts : products;
    const brands = getUniqueBrands(Array.isArray(source) ? source : []);
    return [{ id: '', label: 'Все', count: null }, ...brands.map((b) => ({ id: b.key, label: b.label, count: b.count }))];
  }, [products, trashMode, trashProducts]);

  const visibleBrandFilterOptions = useMemo(() => {
    const q = brandSearch.trim().toLowerCase();
    if (!q) return brandFilterOptions;
    return brandFilterOptions.filter((b) => !b.id || b.label.toLowerCase().includes(q));
  }, [brandFilterOptions, brandSearch]);

  const toggleFilterPanel = (panel) => {
    setFilterPanel((current) => (current === panel ? null : panel));
  };

  const clearProductFilters = () => {
    setCatFilter('');
    setGenderFilter('');
    setBrandFilter('');
    setBrandSearch('');
    setFilterPanel(null);
  };

  // Live-превью итоговой цены для bulk-изменения
  const pricePreview = useMemo(() => {
    const val = Number(priceValue);
    if (!priceValue || isNaN(val) || val <= 0) return null;
    if (selected.size === 0) return null;
    const selectedProducts = products.filter((p) => selected.has(p.id));
    const entries = selectedProducts
      .filter((p) => Number.isFinite(p.price))
      .map((p) => {
        let newP;
        if (priceMode === 'discount') newP = Math.round(p.price * (1 - val / 100));
        else if (priceMode === 'markup') newP = Math.round(p.price * (1 + val / 100));
        else newP = Math.round(val); // fixed
        return { old: p.price, newP };
      })
      .filter((e) => e.newP > 0);
    if (entries.length === 0) return null;
    const newPrices = entries.map((e) => e.newP);
    const min = Math.min(...newPrices);
    const max = Math.max(...newPrices);
    return {
      min,
      max,
      isSingle: entries.length === 1,
      oldPrice: entries.length === 1 ? entries[0].old : null,
    };
  }, [priceValue, priceMode, selected, products]);

  const handleLogout = () => {
    logout('user clicked logout');
  };

  const handleSave = () => {
    setView('list');
    setEditTarget(null);
    loadCategories();
  };

  const handleEdit = (product) => {
    setEditTarget(product);
    setView('edit');
  };

  const handleDelete = async (id) => {
    if (window.confirm('Перенести товар в корзину на 30 дней?')) {
      try {
        await deleteProduct(id);
        setSelected((prev) => { const next = new Set(prev); next.delete(id); return next; });
        notify('success', 'Товар перенесён в корзину');
      } catch {} // apiFetch уже уведомил
    }
  };

  const handleRestore = async (id) => {
    try {
      const res = await authFetch(`/api/products/${id}/restore`, { method: 'POST' });
      if (!res.ok) return;
      const restored = await res.json();
      setTrashProducts((prev) => prev.filter((p) => p.id !== id));
      setSelected((prev) => { const next = new Set(prev); next.delete(id); return next; });
      await reloadProducts();
      notify('success', `Восстановлено: ${restored.brand ? `${restored.brand} ` : ''}${restored.name || `#${id}`}`);
    } catch {} // authFetch уже уведомил
  };

  const handleBulkRestore = async () => {
    const ids = [...selected];
    if (ids.length === 0 || bulkActionLoading) return;
    setBulkActionLoading(true);
    try {
      const apiRes = await authFetch('/api/products/bulk-restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      if (!apiRes.ok) return;
      const res = await apiRes.json();
      const restoredIds = new Set((res.updated || []).map((p) => p.id));
      setTrashProducts((prev) => prev.filter((p) => !restoredIds.has(p.id)));
      setSelected(new Set());
      await reloadProducts();
      notify('success', `Восстановлено: ${res.restored || ids.length} товар(ов)`);
    } catch {} finally {
      setBulkActionLoading(false);
    }
  };

  const handleRestoreAll = async () => {
    if (trashProducts.length === 0 || bulkActionLoading) return;
    if (!window.confirm(`Восстановить все товары из корзины (${trashProducts.length})?`)) return;
    setBulkActionLoading(true);
    try {
      const apiRes = await authFetch('/api/products/restore-all', { method: 'POST' });
      if (!apiRes.ok) return;
      const res = await apiRes.json();
      setTrashProducts([]);
      setSelected(new Set());
      await reloadProducts();
      notify('success', `Восстановлено: ${res.restored || 0} товар(ов)`);
    } catch {} finally {
      setBulkActionLoading(false);
    }
  };

  const handleReset = () => {
    if (window.confirm('Перезагрузить все товары из базы?')) {
      reloadProducts();
      setSelected(new Set());
    }
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0 || bulkActionLoading) return;
    if (selected.size >= 10) {
      setShowDeleteModal(true);
      setPinInput('');
      setPinError(false);
      return;
    }
    if (!window.confirm(`Перенести ${selected.size} товар(ов) в корзину на 30 дней?`)) return;
    setBulkActionLoading(true);
    try {
      await bulkDelete([...selected]);
      notify('success', `Перенесено в корзину: ${selected.size} товар(ов)`);
      setSelected(new Set());
    } catch {} // apiFetch уже уведомил
    setBulkActionLoading(false);
  };

  const handleConfirmPinDelete = async () => {
    setBulkActionLoading(true);
    let pinOk = false;
    try {
      pinOk = await verifyAdminPin(pinInput);
    } catch {
      // apiFetch уже показал toast
    }
    if (!pinOk) {
      setPinError(true);
      setBulkActionLoading(false);
      return;
    }
    const count = selected.size;
    try {
      await bulkDelete([...selected]);
      notify('success', `Перенесено в корзину: ${count} товар(ов)`);
      setSelected(new Set());
    } catch {} // apiFetch уже уведомил
    setBulkActionLoading(false);
    setShowDeleteModal(false);
    setPinInput('');
    setPinError(false);
  };

  const handleBulkPrice = async () => {
    if (bulkActionLoading) return;
    const val = Number(priceValue);
    if (!val || val <= 0) return;
    const ids = [...selected];
    setBulkActionLoading(true);
    notify('info', `Обновление цен (${ids.length} товаров)...`);
    try {
      await bulkUpdatePrices(ids, { type: priceMode, value: val });
      notify('success', 'Цены обновлены');
    } catch {} // apiFetch уже уведомил
    setBulkActionLoading(false);
    setShowPricePanel(false);
    setPriceValue('');
  };

  const handleBulkResetPrices = async () => {
    if (bulkActionLoading) return;
    if (!window.confirm('Сбросить скидки для выбранных товаров?')) return;
    setBulkActionLoading(true);
    notify('info', `Сброс скидок (${selected.size} товаров)...`);
    try {
      await bulkResetPrices([...selected]);
      notify('success', 'Скидки сброшены');
    } catch {} // apiFetch уже уведомил
    setBulkActionLoading(false);
  };

  const handleBulkBadgeApply = async () => {
    if (bulkActionLoading) return;
    const ids = [...selected];
    const badge = bulkBadge.enabled
      ? { ...bulkBadge, text: bulkBadge.text.trim().toUpperCase() }
      : { ...bulkBadge, enabled: false };
    setBulkActionLoading(true);
    notify('info', `Обновление бейджей (${ids.length} товаров)...`);
    try {
      await bulkUpdate(ids, { badge });
      notify('success', 'Бейджи обновлены');
    } catch {} // apiFetch уже уведомил
    setBulkActionLoading(false);
    setShowBadgePanel(false);
  };

  const handleBulkBadgeRemove = async () => {
    if (bulkActionLoading) return;
    const ids = [...selected];
    const removedBadge = { enabled: false, text: '', borderColor: 'rgba(0,0,0,0.8)', textColor: '#000', shape: 'rect' };
    setBulkActionLoading(true);
    notify('info', `Удаление бейджей (${ids.length} товаров)...`);
    try {
      await bulkUpdate(ids, { badge: removedBadge });
      notify('success', 'Бейджи убраны');
    } catch {} // apiFetch уже уведомил
    setBulkActionLoading(false);
    setShowBadgePanel(false);
  };

  const handleBulkPriority = async (priority) => {
    if (bulkActionLoading) return;
    setBulkActionLoading(true);
    notify('info', `Установка приоритета (${selected.size} товаров)...`);
    try {
      await bulkUpdatePriority([...selected], priority);
      notify('success', `Приоритет установлен: ${priority}`);
      setSelected(new Set());
    } catch {} // apiFetch уже уведомил
    setBulkActionLoading(false);
    setShowPriorityPanel(false);
  };

  // eslint-disable-next-line no-unused-vars
  const handleBulkFeatured = async (featured) => {
    if (bulkActionLoading) return;
    setBulkActionLoading(true);
    try {
      await bulkSetFeatured([...selected], featured);
    } catch {}
    setBulkActionLoading(false);
  };

  // — Inline editing —
  const applyInlineChange = async (id, field, value) => {
    const val = field === 'price' ? Number(value) : value;
    if (field === 'price' && (!val || val <= 0)) return;
    try {
      if (selected.size > 0) {
        if (bulkActionLoading) return;
        setBulkActionLoading(true);
        const ids = [...selected];
        await bulkUpdate(ids, { [field]: val });
        setBulkActionLoading(false);
      } else {
        await updateProduct(id, { [field]: val });
      }
    } catch {
      setBulkActionLoading(false);
    } // apiFetch уже уведомил
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
      debounceRef.current = null;
      applyInlineChange(id, field, value);
    }, 400);
  };

  const commitInlineEdit = () => {
    if (debounceRef.current) {
      // Дебаунс ещё пендинг — отменяем его и сами запускаем
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
      if (editingField) {
        applyInlineChange(editingField.id, editingField.field, editValue);
      }
    }
    // Если дебаунс уже отработал (null) — ничего не делаем, запрос уже ушёл
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

  // Categories from API table — single source of truth
  const categoryFilterOptions = useMemo(() => {
    if (trashMode) {
      const counts = new Map();
      for (const p of trashProducts) {
        if (!p?.category) continue;
        counts.set(p.category, (counts.get(p.category) || 0) + 1);
      }
      return [
        { id: '', label: 'Все', count: null },
        ...[...counts.entries()].sort().map(([id, count]) => ({ id, label: id, count })),
      ];
    }
    const items = (Array.isArray(catList) ? catList : []).map((c) =>
      typeof c === 'string' ? { id: c, label: c, count: null } : { id: c.name, label: c.name, count: c.count }
    );
    return [{ id: '', label: 'Все', count: null }, ...items];
  }, [catList, trashMode, trashProducts]);

  const selectedCategoryLabel = categoryFilterOptions.find((c) => c.id === catFilter)?.label || 'Все';
  const selectedGenderLabel = genderFilterOptions.find((g) => g.id === genderFilter)?.label || 'Все';
  const selectedBrandLabel = brandFilterOptions.find((b) => b.id === brandFilter)?.label || 'Все';
  const hasProductFilters = Boolean(catFilter || genderFilter || brandFilter);

  const filtered = useMemo(() => {
    const source = trashMode ? trashProducts : products;
    let list = (Array.isArray(source) ? source : []).filter((p) => p && p.id != null);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((p) =>
        [p.name, p.brand, p.category].join(' ').toLowerCase().includes(q)
      );
    }
    if (catFilter) {
      list = list.filter((p) => p.category === catFilter);
    }
    if (genderFilter) {
      list = list.filter((p) => p.gender === genderFilter);
    }
    if (brandFilter) {
      list = list.filter((p) => normalizeBrand(p?.brand) === brandFilter);
    }
    return list;
  }, [products, trashMode, trashProducts, search, catFilter, genderFilter, brandFilter]);

  const switchTrashMode = () => {
    setTrashMode((v) => !v);
    setSelected(new Set());
    setCatFilter('');
    setGenderFilter('');
    setBrandFilter('');
    setBrandSearch('');
    setFilterPanel(null);
    setSearch('');
  };

  const selectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      // фильтруем null/undefined ids — защита от краша рендера
      setSelected(new Set(filtered.map((p) => p.id).filter((id) => id != null)));
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

  if (section === 'analytics') {
    return (
      <div className="adm-root">
        <div className="adm-header">
          <span className="adm-header__brand">IWAK ADMIN</span>
          <div className="adm-header__right">
            <NotificationBell />
            <button className="adm-logout" onClick={handleLogout}>ВЫЙТИ</button>
          </div>
        </div>
        <div className="adm-tabs">
          <button className="adm-tab" onClick={() => setSection('products')}>ТОВАРЫ</button>
          <button className="adm-tab adm-tab--active">АНАЛИТИКА</button>
          <button className="adm-tab" onClick={() => setSection('automation')}>АВТОМАТИЗАЦИЯ</button>
          <button className="adm-tab" onClick={() => setSection('promo')}>ПРОМО</button>
        </div>
        <AnalyticsTab />
      </div>
    );
  }

  if (section === 'automation') {
    return (
      <div className="adm-root">
        <div className="adm-header">
          <span className="adm-header__brand">IWAK ADMIN</span>
          <div className="adm-header__right">
            <NotificationBell />
            <button className="adm-logout" onClick={handleLogout}>ВЫЙТИ</button>
          </div>
        </div>
        <div className="adm-tabs">
          <button className="adm-tab" onClick={() => setSection('products')}>ТОВАРЫ</button>
          <button className="adm-tab" onClick={() => setSection('analytics')}>АНАЛИТИКА</button>
          <button className="adm-tab adm-tab--active">АВТОМАТИЗАЦИЯ</button>
          <button className="adm-tab" onClick={() => setSection('promo')}>ПРОМО</button>
        </div>
        <TelegramTab />
      </div>
    );
  }

  if (section === 'promo') {
    return (
      <div className="adm-root">
        <div className="adm-header">
          <span className="adm-header__brand">IWAK ADMIN</span>
          <div className="adm-header__right">
            <NotificationBell />
            <button className="adm-logout" onClick={handleLogout}>ВЫЙТИ</button>
          </div>
        </div>
        <div className="adm-tabs">
          <button className="adm-tab" onClick={() => setSection('products')}>ТОВАРЫ</button>
          <button className="adm-tab" onClick={() => setSection('analytics')}>АНАЛИТИКА</button>
          <button className="adm-tab" onClick={() => setSection('automation')}>АВТОМАТИЗАЦИЯ</button>
          <button className="adm-tab adm-tab--active">ПРОМО</button>
        </div>
        <PromoTab />
      </div>
    );
  }

  return (
    <div className="adm-root">
      <div className="adm-header">
        <span className="adm-header__brand">IWAK ADMIN</span>
        <div className="adm-header__right">
          <NotificationBell />
          <button className="adm-logout" onClick={handleLogout}>ВЫЙТИ</button>
        </div>
      </div>

      <div className="adm-tabs">
        <button className="adm-tab adm-tab--active">ТОВАРЫ</button>
        <button className="adm-tab" onClick={() => setSection('analytics')}>АНАЛИТИКА</button>
        <button className="adm-tab" onClick={() => setSection('automation')}>АВТОМАТИЗАЦИЯ</button>
        <button className="adm-tab" onClick={() => setSection('promo')}>ПРОМО</button>
      </div>

      <div className="adm-toolbar">
        <input
          className="adm-input adm-search"
          type="text"
          placeholder="Поиск товара..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {!trashMode && (
          <button className="adm-btn adm-btn--primary adm-add-btn" onClick={() => setView('add')}>
            + ДОБАВИТЬ
          </button>
        )}
        <button className="adm-btn adm-btn--ghost adm-add-btn" onClick={switchTrashMode}>
          {trashMode ? '← ТОВАРЫ' : `КОРЗИНА${trashProducts.length ? ` (${trashProducts.length})` : ''}`}
        </button>
        {trashMode && trashProducts.length > 0 && (
          <button className="adm-btn adm-btn--accent adm-add-btn" disabled={bulkActionLoading} onClick={handleRestoreAll}>
            ВОССТАНОВИТЬ ВСЁ
          </button>
        )}
      </div>

      <div className="adm-filters adm-filters--compact">
        <div className="adm-filter-summary">
          <button
            type="button"
            className={`adm-filter-control${filterPanel === 'category' ? ' adm-filter-control--open' : ''}${catFilter ? ' adm-filter-control--active' : ''}`}
            onClick={() => toggleFilterPanel('category')}
          >
            <span>Категория</span>
            <strong>{selectedCategoryLabel}</strong>
          </button>
          <button
            type="button"
            className={`adm-filter-control${filterPanel === 'gender' ? ' adm-filter-control--open' : ''}${genderFilter ? ' adm-filter-control--active' : ''}`}
            onClick={() => toggleFilterPanel('gender')}
          >
            <span>Пол</span>
            <strong>{selectedGenderLabel}</strong>
          </button>
          <button
            type="button"
            className={`adm-filter-control${filterPanel === 'brand' ? ' adm-filter-control--open' : ''}${brandFilter ? ' adm-filter-control--active' : ''}`}
            onClick={() => toggleFilterPanel('brand')}
          >
            <span>Бренд</span>
            <strong>{selectedBrandLabel}</strong>
          </button>
          {hasProductFilters && (
            <button type="button" className="adm-filter-reset" onClick={clearProductFilters}>
              Сбросить
            </button>
          )}
        </div>

        {hasProductFilters && (
          <div className="adm-active-filters">
            {catFilter && <button type="button" onClick={() => setCatFilter('')}>{selectedCategoryLabel} ×</button>}
            {genderFilter && <button type="button" onClick={() => setGenderFilter('')}>{selectedGenderLabel} ×</button>}
            {brandFilter && <button type="button" onClick={() => setBrandFilter('')}>{selectedBrandLabel} ×</button>}
          </div>
        )}

        {filterPanel === 'category' && (
          <div className="adm-filter-panel">
            <div className="adm-filter-panel__head">
              <span>Категории</span>
              {!trashMode && (
                <button type="button" className="adm-filter-panel__link" onClick={() => setShowAddCatInput((v) => !v)}>
                  {showAddCatInput ? 'Скрыть добавление' : '+ категория'}
                </button>
              )}
            </div>
            {showAddCatInput && !trashMode && (
              <div className="adm-filter-row adm-cat-add-row">
                <input
                  className="adm-input adm-input--small"
                  type="text"
                  placeholder="Новая категория"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCat(); } if (e.key === 'Escape') setShowAddCatInput(false); }}
                  autoFocus
                />
                <button className="adm-btn adm-btn--primary adm-btn--sm" onClick={handleAddCat}>Добавить</button>
              </div>
            )}
            <div className="adm-filter-row">
              {categoryFilterOptions.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`adm-filter-chip${catFilter === c.id ? ' adm-filter-chip--active' : ''}`}
                  onClick={() => setCatFilter(c.id)}
                >
                  {c.label}{c.count != null && c.id ? ` (${c.count})` : ''}
                </button>
              ))}
            </div>
          </div>
        )}

        {filterPanel === 'gender' && (
          <div className="adm-filter-panel">
            <div className="adm-filter-panel__head"><span>Пол</span></div>
            <div className="adm-filter-row">
              {genderFilterOptions.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className={`adm-filter-chip${genderFilter === g.id ? ' adm-filter-chip--active' : ''}`}
                  onClick={() => setGenderFilter(g.id)}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {filterPanel === 'brand' && brandFilterOptions.length > 1 && (
          <div className="adm-filter-panel">
            <div className="adm-filter-panel__head"><span>Бренды</span></div>
            <input
              className="adm-input adm-input--small adm-brand-filter-search"
              type="text"
              placeholder="Найти бренд..."
              value={brandSearch}
              onChange={(e) => setBrandSearch(e.target.value)}
              autoFocus
            />
            <div className="adm-filter-row adm-filter-row--brand-list">
              {visibleBrandFilterOptions.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className={`adm-filter-chip${brandFilter === b.id ? ' adm-filter-chip--active' : ''}`}
                  onClick={() => setBrandFilter(b.id)}
                >
                  {b.label}{b.count !== null ? ` (${b.count})` : ''}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="adm-stats">
        <span>{trashMode ? 'В корзине' : 'Товаров'}: {trashMode ? trashProducts.length : products.length} · Показано: {filtered.length}</span>
        <button className="adm-select-all" onClick={selectAll}>
          {selected.size === filtered.length && filtered.length > 0 ? 'Снять всё' : 'Выбрать все'}
        </button>
      </div>

      {selected.size > 0 && (
        <div className="adm-bulk-banner">
          <span>Выбрано: {selected.size} товар(ов)</span>
          {bulkActionLoading
            ? <span className="adm-bulk-banner__badge">Обновление...</span>
            : <span className="adm-bulk-banner__badge">Массовое редактирование активно</span>}
        </div>
      )}

      <div className={`adm-list${selected.size > 0 ? ' adm-list--with-bar' : ''}`}>
        {filtered.length === 0 && (
          <div className="adm-empty">Ничего не найдено</div>
        )}
        {filtered.filter(Boolean).map((product) => (
	          <div
	            key={product.id}
	            className={`adm-card adm-card--clickable${selected.has(product.id) ? ' adm-card--selected' : ''}`}
	            onClick={() => { if (!trashMode) handleEdit(product); }}
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
                {product.category || '—'} · {GENDER_DISPLAY[product.gender] || product.gender} · {sortSizes(product.sizes)?.join(', ')}
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
                  <span className="adm-card__price adm-card__price--sale">₽{Number.isFinite(product.price) ? product.price.toLocaleString('ru-RU') : product.price}</span>
                  <span className="adm-card__price--old">₽{Number.isFinite(product.originalPrice) ? product.originalPrice.toLocaleString('ru-RU') : product.originalPrice}</span>
                  <span className="adm-card__badge">-{Number.isFinite(product.price) && Number.isFinite(product.originalPrice) && product.originalPrice > 0 ? Math.round(100 - (product.price / product.originalPrice) * 100) : 0}%</span>
                </span>
              ) : (
                <span className="adm-card__price adm-inline-editable" onClick={(e) => startInlineEdit(product.id, 'price', product.price, e)}>₽{product.price != null ? product.price?.toLocaleString('ru-RU') : '—'}</span>
              )}
              {product.createdAt && (
                <div className="adm-card__meta-row">
                  <span className="adm-card__date">{formatDate(product.createdAt)}</span>
                  <span className="adm-card__meta-badge">⭐{product.priority ?? 50}</span>
                  {product.badge && product.badge.enabled && <span className="adm-card__meta-badge">🏷</span>}
                </div>
              )}
            </div>
	            <div className="adm-card__actions">
	              {trashMode ? (
	                <button className="adm-action-btn" title="Восстановить" onClick={(e) => { e.stopPropagation(); handleRestore(product.id); }}>↩</button>
	              ) : (
	                <button className="adm-action-btn adm-action-btn--del" onClick={(e) => { e.stopPropagation(); handleDelete(product.id); }}>✕</button>
	              )}
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

	          {trashMode ? (
	            <div className="adm-selection-bar__actions">
	              <button className="adm-btn adm-btn--accent adm-btn--sm" disabled={bulkActionLoading} onClick={handleBulkRestore}>ВОССТАНОВИТЬ</button>
	            </div>
	          ) : showPricePanel ? (
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
              {pricePreview && (
                <div className="adm-price-panel__preview">
                  {pricePreview.isSingle ? (
                    <>
                      {pricePreview.oldPrice != null && (
                        <span className="adm-price-panel__preview-old">Старая: {pricePreview.oldPrice.toLocaleString('ru-RU')} ₽</span>
                      )}
                      <span className="adm-price-panel__preview-new">Новая: <strong>{pricePreview.min.toLocaleString('ru-RU')} ₽</strong></span>
                    </>
                  ) : pricePreview.min === pricePreview.max ? (
                    <span className="adm-price-panel__preview-new">Итого: <strong>~ {pricePreview.min.toLocaleString('ru-RU')} ₽</strong></span>
                  ) : (
                    <span className="adm-price-panel__preview-new">Диапазон: <strong>от {pricePreview.min.toLocaleString('ru-RU')} ₽ до {pricePreview.max.toLocaleString('ru-RU')} ₽</strong></span>
                  )}
                </div>
              )}
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
                    maxLength={80}
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
                <button className="adm-btn adm-btn--primary adm-btn--sm" disabled={bulkActionLoading} onClick={handleBulkBadgeApply}>{bulkBadge.enabled ? 'ПРИМЕНИТЬ' : 'ВЫКЛЮЧИТЬ ВСЕ'}</button>
                <button className="adm-btn adm-btn--ghost adm-btn--sm" disabled={bulkActionLoading} onClick={handleBulkBadgeRemove}>УБРАТЬ ВСЕ</button>
              </div>
            </div>
          ) : showPriorityPanel ? (
            <div className="adm-priority-panel">
              <div className="adm-priority-panel__header">
                <span>Приоритет для {selected.size} товар(ов)</span>
                <button className="adm-btn adm-btn--ghost adm-btn--sm" onClick={() => setShowPriorityPanel(false)}>✕</button>
              </div>
              <div className="adm-priority-panel__options">
                <button className="adm-btn adm-btn--accent adm-btn--sm" disabled={bulkActionLoading} onClick={() => handleBulkPriority(100)}>Топ (100)</button>
                <button className="adm-btn adm-btn--accent adm-btn--sm" disabled={bulkActionLoading} onClick={() => handleBulkPriority(80)}>Выше среднего (80)</button>
                <button className="adm-btn adm-btn--accent adm-btn--sm" disabled={bulkActionLoading} onClick={() => handleBulkPriority(50)}>Стандарт (50)</button>
                <button className="adm-btn adm-btn--accent adm-btn--sm" disabled={bulkActionLoading} onClick={() => handleBulkPriority(10)}>Вниз (10)</button>
              </div>
            </div>
          ) : (
            <div className="adm-selection-bar__actions">
              <button className="adm-btn adm-btn--accent adm-btn--sm" disabled={bulkActionLoading} onClick={() => setShowPricePanel(true)}>ЦЕНЫ</button>
              <button className="adm-btn adm-btn--accent adm-btn--sm" disabled={bulkActionLoading} onClick={() => { setShowBadgePanel(true); setBulkBadge({ enabled: true, text: '', borderColor: 'rgba(0,0,0,0.8)', textColor: '#000', shape: 'rect', type: 'outline', position: 'top-left' }); }}>БЕЙДЖ</button>
              <button className="adm-btn adm-btn--accent adm-btn--sm" disabled={bulkActionLoading} onClick={() => setShowPriorityPanel(true)}>ПРИОРИТЕТ</button>
              <button className="adm-btn adm-btn--accent adm-btn--sm" disabled={bulkActionLoading} onClick={handleBulkResetPrices}>СБРОС СКИДОК</button>
              <button className="adm-btn adm-btn--danger adm-btn--sm" disabled={bulkActionLoading} onClick={handleBulkDelete}>УДАЛИТЬ</button>
            </div>
          )}
        </div>
      )}

	      <div className="adm-footer">
	        <button className="adm-btn adm-btn--ghost adm-reset-btn" onClick={trashMode ? loadTrashProducts : handleReset}>
	          {trashMode ? (trashLoading ? 'Загрузка корзины...' : 'Перезагрузить корзину') : 'Перезагрузить товары'}
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

      {showDeleteModal && (
        <div className="adm-bulk-confirm-overlay" onClick={() => { setShowDeleteModal(false); setPinInput(''); setPinError(false); }}>
          <div className="adm-delete-modal" onClick={(e) => e.stopPropagation()}>
	            <div className="adm-delete-modal__title">⚠️ Перенос в корзину</div>
	            <p className="adm-delete-modal__text">
	              Вы собираетесь перенести <strong>{selected.size}</strong> товаров в корзину<br/>
	              Их можно будет восстановить в течение 30 дней
            </p>
            <label className="adm-delete-modal__label">Введите PIN-код:</label>
            <input
              className={`adm-input adm-delete-modal__input${pinError ? ' adm-delete-modal__input--error' : ''}`}
              type="password"
              maxLength={4}
              inputMode="numeric"
              value={pinInput}
              onChange={(e) => { setPinInput(e.target.value); setPinError(false); }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleConfirmPinDelete(); }}
              autoFocus
              placeholder="••••"
            />
            {pinError && <span className="adm-delete-modal__error">Неверный PIN-код</span>}
            <div className="adm-delete-modal__actions">
              <button className="adm-btn adm-btn--ghost" onClick={() => { setShowDeleteModal(false); setPinInput(''); setPinError(false); }}>Отмена</button>
	              <button className="adm-btn adm-btn--danger" disabled={!pinInput} onClick={handleConfirmPinDelete}>В корзину</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
