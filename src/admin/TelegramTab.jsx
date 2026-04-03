import { useState, useEffect, useCallback, useMemo } from 'react';
import { useProducts } from '../context/ProductsContext';
import TgDrawer from './TgDrawer';
import sortSizes from '../utils/sortSizes';
import { normalizeBrand, getUniqueBrands } from '../utils/brandUtils';

function getToken() {
  return localStorage.getItem('iwak_admin_token');
}

const GENDER_LABELS = { mens: 'М', womens: 'Ж', kids: 'Дети', unisex: 'U' };
const GENDER_DISPLAY = { mens: 'Мужское', womens: 'Женское', kids: 'Детское', unisex: 'Унисекс' };

function formatDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}`;
}

export default function TelegramTab() {
  const { products } = useProducts();

  // ── Config state ──
  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [configured, setConfigured] = useState(false);
  const [masked, setMasked] = useState('');
  const [configSaving, setConfigSaving] = useState(false);
  const [configMsg, setConfigMsg] = useState(null);

  // ── Posting state ──
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [genderFilter, setGenderFilter] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [drawerOpen, setDrawerOpen] = useState(false);

  // ── Load config on mount ──
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/tg/config', {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        if (res.ok) {
          const json = await res.json();
          setMasked(json.botTokenMasked || '');
          setChatId(json.chatId || '');
          setConfigured(json.configured);
        }
      } catch { /* ignore */ }
    })();
  }, []);

  // ── Save config ──
  const handleSaveConfig = useCallback(async () => {
    if (!botToken.trim() || !chatId.trim()) {
      setConfigMsg({ type: 'error', text: 'Заполните оба поля' });
      return;
    }
    setConfigSaving(true);
    setConfigMsg(null);
    try {
      const res = await fetch('/api/tg/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ botToken: botToken.trim(), chatId: chatId.trim() }),
      });
      if (!res.ok) throw new Error();
      setConfigMsg({ type: 'ok', text: 'Сохранено' });
      setBotToken('');
      setConfigured(true);
      const r2 = await fetch('/api/tg/config', { headers: { Authorization: `Bearer ${getToken()}` } });
      if (r2.ok) {
        const j = await r2.json();
        setMasked(j.botTokenMasked || '');
      }
    } catch {
      setConfigMsg({ type: 'error', text: 'Ошибка сохранения' });
    } finally {
      setConfigSaving(false);
    }
  }, [botToken, chatId]);

  // ── Test bot ──
  const [testing, setTesting] = useState(false);

  const handleTestBot = useCallback(async () => {
    setTesting(true);
    setConfigMsg(null);
    try {
      const res = await fetch('/api/tg/test', {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setConfigMsg({ type: 'ok', text: `Бот работает: @${json.username}` });
      } else {
        setConfigMsg({ type: 'error', text: json.error || 'Ошибка проверки' });
      }
    } catch {
      setConfigMsg({ type: 'error', text: 'Ошибка соединения' });
    } finally {
      setTesting(false);
    }
  }, []);

  // ── Delete config ──
  const handleDeleteConfig = useCallback(async () => {
    if (!window.confirm('Удалить настройки Telegram бота?')) return;
    try {
      const res = await fetch('/api/tg/config', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        setConfigured(false);
        setMasked('');
        setChatId('');
        setBotToken('');
        setConfigMsg({ type: 'ok', text: 'Бот удалён' });
      }
    } catch {
      setConfigMsg({ type: 'error', text: 'Ошибка удаления' });
    }
  }, []);

  // ── Product filtering ──
  const categoryOptions = useMemo(() => {
    const cats = [...new Set((Array.isArray(products) ? products : []).map(p => p?.category).filter(Boolean))].sort();
    return [{ id: '', label: 'Все' }, ...cats.map(c => ({ id: c, label: c }))];
  }, [products]);

  const genderOptions = useMemo(() => {
    const gs = [...new Set((Array.isArray(products) ? products : []).map(p => p?.gender).filter(Boolean))].sort();
    return [{ id: '', label: 'Все' }, ...gs.map(g => ({ id: g, label: GENDER_LABELS[g] || g }))];
  }, [products]);

  const brandOptions = useMemo(() => {
    const brands = getUniqueBrands(Array.isArray(products) ? products : []);
    return [{ id: '', label: 'Все', count: null }, ...brands.map(b => ({ id: b.key, label: b.label, count: b.count }))];
  }, [products]);

  const filtered = useMemo(() => {
    let list = (Array.isArray(products) ? products : []).filter(p => p && p.id != null);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p => [p.name, p.brand, p.category].join(' ').toLowerCase().includes(q));
    }
    if (catFilter) list = list.filter(p => p.category === catFilter);
    if (genderFilter) list = list.filter(p => p.gender === genderFilter);
    if (brandFilter) list = list.filter(p => normalizeBrand(p?.brand) === brandFilter);
    return list;
  }, [products, search, catFilter, genderFilter, brandFilter]);

  const toggleSelect = useCallback((id, e) => {
    if (e) e.stopPropagation();
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(p => p.id).filter(id => id != null)));
  };

  return (
    <div className="tg">
      {/* ── Config ── */}
      <div className="tg-section">
        <h3 className="tg-section__title">Telegram настройки</h3>
        <div className="tg-config">
          {configured && (
            <div className="tg-config__status">
              <span className="tg-config__dot tg-config__dot--ok" />
              Настроено · {masked}
            </div>
          )}
          <label className="tg-label">Bot Token</label>
          <input
            className="adm-input tg-input"
            type="password"
            placeholder={configured ? 'Введите новый токен для замены' : 'Вставьте Bot Token'}
            value={botToken}
            onChange={e => setBotToken(e.target.value)}
          />
          <label className="tg-label">Chat ID</label>
          <input
            className="adm-input tg-input"
            type="text"
            placeholder="-100... или @channel"
            value={chatId}
            onChange={e => setChatId(e.target.value)}
          />
          <div className="tg-config__actions">
            <button
              className="adm-btn adm-btn--accent adm-btn--sm"
              onClick={handleSaveConfig}
              disabled={configSaving}
            >
              {configSaving ? 'Сохранение...' : 'Сохранить'}
            </button>
            {configured && (
              <>
                <button
                  className="adm-btn adm-btn--sm"
                  onClick={handleTestBot}
                  disabled={testing}
                >
                  {testing ? 'Проверка...' : 'Проверить'}
                </button>
                <button
                  className="adm-btn adm-btn--ghost adm-btn--sm tg-config__delete"
                  onClick={handleDeleteConfig}
                >
                  Удалить бота
                </button>
              </>
            )}
          </div>
          {configMsg && (
            <div className={`tg-msg tg-msg--${configMsg.type}`}>{configMsg.text}</div>
          )}
        </div>
      </div>

      {/* ── Posting ── */}
      <div className="tg-section">
        <h3 className="tg-section__title">📤 Постинг в Telegram</h3>
        {!configured && (
          <div className="tg-empty">Сначала настройте Telegram</div>
        )}
        {configured && (
          <>
            <div className="adm-toolbar">
              <input
                className="adm-input adm-search"
                type="text"
                placeholder="Поиск товара..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            {/* Category + Gender + Brand filter chips */}
            <div className="adm-filters">
              <div className="adm-filter-row">
                {categoryOptions.map((c) => (
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
                {genderOptions.map((g) => (
                  <button
                    key={g.id}
                    className={`adm-filter-chip${genderFilter === g.id ? ' adm-filter-chip--active' : ''}`}
                    onClick={() => setGenderFilter(g.id)}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
              {brandOptions.length > 1 && (
                <div className="adm-filter-row adm-filter-row--scroll">
                  {brandOptions.map((b) => (
                    <button
                      key={b.id}
                      className={`adm-filter-chip${brandFilter === b.id ? ' adm-filter-chip--active' : ''}`}
                      onClick={() => setBrandFilter(b.id)}
                    >
                      {b.label}{b.count !== null ? ` (${b.count})` : ''}
                    </button>
                  ))}
                </div>
              )}
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
                <span className="adm-bulk-banner__badge">Telegram отправка</span>
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
                  onClick={(e) => toggleSelect(product.id, e)}
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
                    <span className="adm-card__brand">{product.brand}</span>
                    <span className="adm-card__name">{product.name}</span>
                    <span className="adm-card__meta">
                      {product.category || '—'} · {GENDER_DISPLAY[product.gender] || product.gender} · {sortSizes(product.sizes)?.join(', ')}
                    </span>
                    {product.originalPrice && product.originalPrice > product.price ? (
                      <span className="adm-card__price-row">
                        <span className="adm-card__price adm-card__price--sale">₽{Number.isFinite(product.price) ? product.price.toLocaleString('ru-RU') : product.price}</span>
                        <span className="adm-card__price--old">₽{Number.isFinite(product.originalPrice) ? product.originalPrice.toLocaleString('ru-RU') : product.originalPrice}</span>
                        <span className="adm-card__badge">-{Number.isFinite(product.price) && Number.isFinite(product.originalPrice) && product.originalPrice > 0 ? Math.round(100 - (product.price / product.originalPrice) * 100) : 0}%</span>
                      </span>
                    ) : (
                      <span className="adm-card__price">₽{product.price != null ? product.price?.toLocaleString('ru-RU') : '—'}</span>
                    )}
                    {product.createdAt && (
                      <div className="adm-card__meta-row">
                        <span className="adm-card__date">{formatDate(product.createdAt)}</span>
                        <span className="adm-card__meta-badge">⭐{product.priority ?? 50}</span>
                        {product.badge && product.badge.enabled && <span className="adm-card__meta-badge">🏷</span>}
                      </div>
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
                <div className="adm-selection-bar__actions">
                  <button className="adm-btn adm-btn--accent adm-btn--sm" onClick={() => setDrawerOpen(true)}>👁 Preview</button>
                  <button className="adm-btn adm-btn--accent adm-btn--sm" onClick={() => setDrawerOpen(true)}>✏️ Редактировать</button>
                  <button className="adm-btn adm-btn--primary adm-btn--sm" onClick={() => setDrawerOpen(true)}>📤 Отправить</button>
                  <button className="adm-btn adm-btn--ghost adm-btn--sm" onClick={() => setSelected(new Set())}>❌ Снять выбор</button>
                </div>
              </div>
            )}

            {drawerOpen && selected.size > 0 && (
              <TgDrawer
                productIds={[...selected]}
                onClose={() => setDrawerOpen(false)}
                onSent={() => { setDrawerOpen(false); setSelected(new Set()); }}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
