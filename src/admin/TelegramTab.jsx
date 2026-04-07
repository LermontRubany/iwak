import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useProducts } from '../context/ProductsContext';
import { notifyGlobal } from '../context/NotificationsContext';
import TgDrawer from './TgDrawer';
import AutoPlanSection from './AutoPlanSection';
import authFetch from './authFetch';
import sortSizes from '../utils/sortSizes';
import { normalizeBrand, getUniqueBrands } from '../utils/brandUtils';

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
  const { products, reloadProducts } = useProducts();

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
  const [sentFilter, setSentFilter] = useState('');
  const [quickSending, setQuickSending] = useState(false);
  const [scheduledMap, setScheduledMap] = useState({});
  const [autoplanIds, setAutoplanIds] = useState(null);
  const autoplanRef = useRef(null);

  // ── Load scheduled products map ──
  const loadScheduled = useCallback(async () => {
    try {
      const r = await authFetch('/api/tg/scheduled-products');
      if (r.ok) setScheduledMap(await r.json());
    } catch { /* */ }
  }, []);
  useEffect(() => { if (configured) loadScheduled(); }, [configured, loadScheduled]);

  // ── Load config on mount ──
  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch('/api/tg/config');
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
  const [fieldError, setFieldError] = useState(null); // {botToken?, chatId?}

  const handleSaveConfig = useCallback(async () => {
    if (!botToken.trim() || !chatId.trim()) {
      setConfigMsg({ type: 'error', text: 'Заполните оба поля' });
      return;
    }
    setConfigSaving(true);
    setConfigMsg(null);
    setFieldError(null);
    try {
      const res = await authFetch('/api/tg/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botToken: botToken.trim(), chatId: chatId.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        const msg = json.error || 'Ошибка сохранения';
        setConfigMsg({ type: 'error', text: msg });
        notifyGlobal('error', msg);
        if (json.field) setFieldError({ [json.field]: msg });
        return;
      }
      setConfigMsg({ type: 'ok', text: '✅ Telegram успешно подключен' });
      notifyGlobal('success', 'Telegram успешно подключен');
      setBotToken('');
      setConfigured(true);
      setFieldError(null);
      const r2 = await authFetch('/api/tg/config');
      if (r2.ok) {
        const j = await r2.json();
        setMasked(j.botTokenMasked || '');
      }
    } catch {
      const msg = 'Нет соединения с сервером';
      setConfigMsg({ type: 'error', text: msg });
      notifyGlobal('error', msg);
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
      const res = await authFetch('/api/tg/test', {
        method: 'POST',
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
      const res = await authFetch('/api/tg/config', {
        method: 'DELETE',
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
    if (sentFilter === 'unsent') list = list.filter(p => !p.tgSentAt);
    if (sentFilter === 'sent') list = list.filter(p => !!p.tgSentAt);
    if (sentFilter === 'scheduled') list = list.filter(p => !!scheduledMap[p.id]);
    return list;
  }, [products, search, catFilter, genderFilter, brandFilter, sentFilter, scheduledMap]);

  const toggleSelect = useCallback((id, e) => {
    if (e) e.stopPropagation();
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleQuickSend = useCallback(async () => {
    if (quickSending || selected.size === 0) return;
    const ids = [...selected];
    if (ids.length > 10 && !window.confirm(`Отправить ${ids.length} товаров в Telegram?`)) return;
    setQuickSending(true);
    try {
      if (ids.length === 1) {
        const res = await authFetch('/api/tg/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId: ids[0], template: 'basic' }),
        });
        const json = await res.json();
        if (res.ok && json.ok) {
          notifyGlobal('success', 'Отправлено в Telegram');
          setSelected(new Set());
          reloadProducts();
        } else {
          notifyGlobal('error', json.error || 'Ошибка отправки');
        }
      } else {
        const res = await authFetch('/api/tg/send-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productIds: ids, template: 'basic' }),
        });
        if (res.ok) {
          const { batchId } = await res.json();
          setSelected(new Set());
          notifyGlobal('success', `Отправка: 0 из ${ids.length}...`);
          const batchPoll = setInterval(async () => {
            try {
              const sr = await authFetch(`/api/tg/batch/${batchId}`);
              if (!sr.ok) { clearInterval(batchPoll); reloadProducts(); return; }
              const st = await sr.json();
              if (st.done) {
                clearInterval(batchPoll);
                notifyGlobal(st.failed === 0 ? 'success' : 'error',
                  st.failed === 0 ? `Отправлено: ${st.sent} пост(ов)` : `Успешно: ${st.sent}, ошибок: ${st.failed}`);
                reloadProducts();
              } else {
                notifyGlobal('info', `Отправка: ${st.sent + st.failed} из ${st.total}...`);
              }
            } catch { clearInterval(batchPoll); reloadProducts(); }
          }, 2000);
        } else {
          const json = await res.json().catch(() => ({}));
          notifyGlobal('error', json.error || 'Ошибка batch');
        }
      }
    } catch {
      notifyGlobal('error', 'Ошибка соединения');
    } finally {
      setQuickSending(false);
    }
  }, [quickSending, selected, reloadProducts]);

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
            className={`adm-input tg-input${fieldError?.botToken ? ' tg-input--error' : ''}`}
            type="password"
            placeholder={configured ? 'Введите новый токен для замены' : 'Вставьте Bot Token'}
            value={botToken}
            onChange={e => { setBotToken(e.target.value); setFieldError(null); }}
          />
          {fieldError?.botToken && <div className="tg-field-error">{fieldError.botToken}</div>}
          <label className="tg-label">Chat ID</label>
          <input
            className={`adm-input tg-input${fieldError?.chatId ? ' tg-input--error' : ''}`}
            type="text"
            placeholder="-100... или @channel"
            value={chatId}
            onChange={e => { setChatId(e.target.value); setFieldError(null); }}
          />
          {fieldError?.chatId && <div className="tg-field-error">{fieldError.chatId}</div>}
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

      {/* ── Autoplan ── */}
      {configured && (
        <div ref={autoplanRef}>
          <AutoPlanSection
            products={products}
            onPlansChanged={loadScheduled}
            preselectedIds={autoplanIds}
            onPreselectedClear={() => setAutoplanIds(null)}
          />
        </div>
      )}

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

            {/* TG status filter */}
            <div className="adm-filter-row">
              {[{ id: '', label: 'Все' }, { id: 'unsent', label: '📤 Не отправлены' }, { id: 'sent', label: '✅ Отправлены' }, { id: 'scheduled', label: '📅 Запланированы' }].map((s) => (
                <button
                  key={s.id}
                  className={`adm-filter-chip${sentFilter === s.id ? ' adm-filter-chip--active' : ''}`}
                  onClick={() => setSentFilter(s.id)}
                >
                  {s.label}
                </button>
              ))}
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
                        {product.tgSentAt && <span className="adm-card__meta-badge" style={{color:'#4caf50'}}>✓ TG</span>}
                        {scheduledMap[product.id] && <span className="adm-card__meta-badge" style={{color:'#1976d2'}}>📅 {new Date(scheduledMap[product.id]).toLocaleDateString('ru-RU', {day:'2-digit',month:'2-digit'})}</span>}
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
                  <button className="adm-btn adm-btn--accent adm-btn--sm" onClick={() => setDrawerOpen(true)}>� Открыть</button>                  <button className="adm-btn adm-btn--primary adm-btn--sm" onClick={handleQuickSend} disabled={quickSending}>
                    {quickSending ? '⏳ Отправка...' : '⚡ Быстрая отправка'}
                  </button>                  {configured && (
                    <button className="adm-btn adm-btn--sm" onClick={() => {
                      setAutoplanIds([...selected]);
                      autoplanRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}>📅 В автоплан</button>
                  )}
                  <button className="adm-btn adm-btn--ghost adm-btn--sm" onClick={() => setSelected(new Set())}>❌ Снять выбор</button>
                </div>
              </div>
            )}

            {drawerOpen && selected.size > 0 && (
              <TgDrawer
                productIds={[...selected]}
                onClose={() => setDrawerOpen(false)}
                onSent={() => { setDrawerOpen(false); setSelected(new Set()); reloadProducts(); }}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
