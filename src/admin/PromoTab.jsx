import { useState, useEffect, useCallback, useMemo } from 'react';
import imageCompression from 'browser-image-compression';
import authFetch from './authFetch';
import { notifyGlobal } from '../context/NotificationsContext';

const DEFAULTS = {
  enabled: false,
  text: '',
  emoji: '',
  backgroundColor: '#000000',
  textColor: '#ffffff',
  fontSize: 14,
  fontWeight: '600',
  borderRadius: 12,
  padding: 10,
  maxWidth: 480,
  link: '',
  pages: [],
  position: 'bottom',
  catalogTheme: {
    saleColor: '#d32f2f',
    badgeBg: '#d32f2f',
    badgeText: '#ffffff',
  },
  iwakSelect: {
    enabled: false,
    title: 'IWAK SELECT',
    subtitle: 'сейчас по скидке',
    palette: {
      titleColor: '#ffffff',
      subtitleColor: '#cccccc',
    },
    cards: [
      { id: 'sale-heat', active: true, featured: true, title: 'SALE HEAT', subtitle: 'все скидки', meta: 'до -46%', cta: 'смотреть', link: '/catalog?sale=true', image: '' },
      { id: 'all-black', active: true, featured: false, title: 'ALL BLACK', subtitle: 'чёрные пары', meta: 'sale', cta: 'смотреть', link: '/catalog?sale=true&q=black', image: '' },
      { id: 'street-fit', active: true, featured: false, title: 'STREET FIT', subtitle: 'кроссовки', meta: 'sale', cta: 'смотреть', link: '/catalog?sale=true&category=кроссовки', image: '' },
      { id: 'vans-classic', active: true, featured: false, title: 'VANS CLASSIC', subtitle: 'vans sale', meta: 'sale', cta: 'смотреть', link: '/catalog?sale=true&brand=vans', image: '' },
      { id: 'for-her', active: true, featured: false, title: 'FOR HER', subtitle: 'женский sale', meta: 'sale', cta: 'смотреть', link: '/catalog?sale=true&gender=womens', image: '' },
    ],
  },
};

const PAGE_OPTIONS = [
  { value: '/catalog', label: 'Каталог' },
  { value: '/product', label: 'Карточка товара' },
  { value: '/cart', label: 'Корзина' },
];

const PROMO_PRESETS = [
  {
    id: 'delivery',
    label: 'Доставка',
    config: {
      enabled: true,
      emoji: '🚚',
      text: 'Бесплатная доставка от 5000₽',
      link: '/catalog',
      pages: ['/catalog', '/product'],
      backgroundColor: '#111111',
      textColor: '#ffffff',
      fontSize: 14,
      fontWeight: '600',
      borderRadius: 10,
      padding: 10,
      maxWidth: 520,
      position: 'bottom',
    },
  },
  {
    id: 'sale',
    label: 'Скидки',
    config: {
      enabled: true,
      emoji: '🔥',
      text: 'Скидки на выбранные модели до конца дня',
      link: '/catalog',
      pages: ['/catalog'],
      backgroundColor: '#0f766e',
      textColor: '#ffffff',
      fontSize: 14,
      fontWeight: '700',
      borderRadius: 10,
      padding: 10,
      maxWidth: 560,
      position: 'top',
    },
  },
  {
    id: 'drop',
    label: 'Новый дроп',
    config: {
      enabled: true,
      emoji: '✨',
      text: 'Новый дроп уже в каталоге',
      link: '/catalog',
      pages: ['/catalog', '/product'],
      backgroundColor: '#f3f4f6',
      textColor: '#111111',
      fontSize: 14,
      fontWeight: '600',
      borderRadius: 10,
      padding: 10,
      maxWidth: 520,
      position: 'bottom',
    },
  },
];

const STYLE_PRESETS = [
  { id: 'black', label: 'Black', backgroundColor: '#111111', textColor: '#ffffff' },
  { id: 'mint', label: 'Mint', backgroundColor: '#00b4a0', textColor: '#ffffff' },
  { id: 'light', label: 'Light', backgroundColor: '#f3f4f6', textColor: '#111111' },
  { id: 'sale', label: 'Sale', backgroundColor: '#0f766e', textColor: '#ffffff' },
];

const CATALOG_THEME_PRESETS = [
  { id: 'classic-red', label: 'Red', saleColor: '#d32f2f', badgeBg: '#d32f2f', badgeText: '#ffffff' },
  { id: 'deep-red', label: 'Deep', saleColor: '#b91c1c', badgeBg: '#b91c1c', badgeText: '#ffffff' },
  { id: 'graphite', label: 'Graphite', saleColor: '#111111', badgeBg: '#111111', badgeText: '#ffffff' },
  { id: 'green', label: 'Green', saleColor: '#16834a', badgeBg: '#16834a', badgeText: '#ffffff' },
];

const PROMO_ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/heic',
  'image/heif',
];
const PROMO_MAX_ORIGINAL_SIZE = 25 * 1024 * 1024;

const clamp = (value, min, max, fallback) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
};

const normalizeHex = (value, fallback) => {
  const text = String(value || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(text) ? text : fallback;
};

function cleanConfig(cfg) {
  const catalogTheme = {
    ...DEFAULTS.catalogTheme,
    ...(cfg.catalogTheme && typeof cfg.catalogTheme === 'object' ? cfg.catalogTheme : {}),
  };
  const rawSelect = cfg.iwakSelect && typeof cfg.iwakSelect === 'object' ? cfg.iwakSelect : {};
  const rawCards = Array.isArray(rawSelect.cards) ? rawSelect.cards : [];
  const rawPalette = rawSelect.palette && typeof rawSelect.palette === 'object' ? rawSelect.palette : {};
  const iwakSelect = {
    ...DEFAULTS.iwakSelect,
    ...rawSelect,
    title: String(rawSelect.title || DEFAULTS.iwakSelect.title).trim().slice(0, 32),
    subtitle: String(rawSelect.subtitle || DEFAULTS.iwakSelect.subtitle).trim().slice(0, 60),
    palette: {
      titleColor: normalizeHex(rawPalette.titleColor, DEFAULTS.iwakSelect.palette.titleColor),
      subtitleColor: normalizeHex(rawPalette.subtitleColor, DEFAULTS.iwakSelect.palette.subtitleColor),
    },
    cards: rawCards.slice(0, 8).map((card, idx) => ({
      id: String(card.id || `select-${idx}-${Date.now()}`),
      active: card.active !== false,
      featured: Boolean(card.featured),
      title: String(card.title || '').trim().slice(0, 28),
      subtitle: String(card.subtitle || '').trim().slice(0, 34),
      meta: String(card.meta || '').trim().slice(0, 24),
      cta: String(card.cta || 'смотреть').trim().slice(0, 18),
      link: String(card.link || '/catalog').trim(),
      image: String(card.image || '').trim(),
      titleColor: normalizeHex(card.titleColor, ''),
      subtitleColor: normalizeHex(card.subtitleColor, ''),
    })).filter((card) => card.title && card.link),
  };
  if (iwakSelect.cards.length > 0 && !iwakSelect.cards.some((card) => card.featured)) {
    iwakSelect.cards[0].featured = true;
  }
  return {
    ...DEFAULTS,
    ...cfg,
    catalogTheme: {
      saleColor: normalizeHex(catalogTheme.saleColor, DEFAULTS.catalogTheme.saleColor),
      badgeBg: normalizeHex(catalogTheme.badgeBg, DEFAULTS.catalogTheme.badgeBg),
      badgeText: normalizeHex(catalogTheme.badgeText, DEFAULTS.catalogTheme.badgeText),
    },
    iwakSelect,
    text: String(cfg.text || '').trim(),
    emoji: String(cfg.emoji || '').trim().slice(0, 4),
    link: String(cfg.link || '').trim(),
    position: cfg.position === 'top' ? 'top' : 'bottom',
    pages: Array.isArray(cfg.pages)
      ? cfg.pages.filter(p => PAGE_OPTIONS.some(opt => opt.value === p))
      : [],
    fontSize: clamp(cfg.fontSize, 10, 32, DEFAULTS.fontSize),
    borderRadius: clamp(cfg.borderRadius, 0, 40, DEFAULTS.borderRadius),
    padding: clamp(cfg.padding, 4, 32, DEFAULTS.padding),
    maxWidth: clamp(cfg.maxWidth, 200, 1200, DEFAULTS.maxWidth),
  };
}

export default function PromoTab() {
  const [cfg, setCfg] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDesign, setShowDesign] = useState(false);

  useEffect(() => {
    authFetch('/api/promo/config')
      .then(r => r.json())
      .then(d => { if (d?.config && typeof d.config === 'object') setCfg({ ...DEFAULTS, ...d.config }); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = useCallback(async () => {
    const nextCfg = cleanConfig(cfg);
    if (nextCfg.enabled && !nextCfg.text) {
      notifyGlobal('error', 'Добавьте текст баннера или выключите промо');
      return;
    }
    setSaving(true);
    try {
      const r = await authFetch('/api/promo/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: nextCfg }),
      });
      const d = await r.json();
      if (d.ok) {
        setCfg(nextCfg);
        notifyGlobal('success', 'Баннер сохранён');
        // Clear storefront cache so changes appear immediately
        try { sessionStorage.removeItem('iwak_promo_cfg'); } catch {}
        window.dispatchEvent(new Event('promo-updated'));
      } else {
        notifyGlobal('error', d.error || 'Ошибка сохранения');
      }
    } catch {
      notifyGlobal('error', 'Ошибка сети');
    } finally {
      setSaving(false);
    }
  }, [cfg]);

  const upd = (key, val) => setCfg(prev => ({ ...prev, [key]: val }));
  const mergeCfg = (patch) => setCfg(prev => ({ ...prev, ...patch }));
  const updCatalogTheme = (key, val) => setCfg(prev => ({
    ...prev,
    catalogTheme: {
      ...DEFAULTS.catalogTheme,
      ...(prev.catalogTheme || {}),
      [key]: val,
    },
  }));

  const updSelect = (key, val) => setCfg(prev => ({
    ...prev,
    iwakSelect: {
      ...DEFAULTS.iwakSelect,
      ...(prev.iwakSelect || {}),
      [key]: val,
    },
  }));
  const updSelectPalette = (key, val) => setCfg(prev => ({
    ...prev,
    iwakSelect: {
      ...DEFAULTS.iwakSelect,
      ...(prev.iwakSelect || {}),
      palette: {
        ...DEFAULTS.iwakSelect.palette,
        ...((prev.iwakSelect && prev.iwakSelect.palette) || {}),
        [key]: val,
      },
    },
  }));

  const updSelectCard = (idx, patch) => setCfg(prev => {
    const select = { ...DEFAULTS.iwakSelect, ...(prev.iwakSelect || {}) };
    const cards = [...(Array.isArray(select.cards) ? select.cards : [])];
    cards[idx] = { ...cards[idx], ...patch };
    if (patch.featured) {
      cards.forEach((card, cardIdx) => { if (cardIdx !== idx) card.featured = false; });
    }
    return { ...prev, iwakSelect: { ...select, cards } };
  });

  const addSelectCard = () => setCfg(prev => {
    const select = { ...DEFAULTS.iwakSelect, ...(prev.iwakSelect || {}) };
    const cards = Array.isArray(select.cards) ? [...select.cards] : [];
    cards.push({
      id: `select-${Date.now()}`,
      active: true,
      featured: cards.length === 0,
      title: 'NEW SELECT',
      subtitle: 'подборка',
      meta: 'sale',
      cta: 'смотреть',
      link: '/catalog',
      image: '',
      titleColor: '',
      subtitleColor: '',
    });
    return { ...prev, iwakSelect: { ...select, cards: cards.slice(0, 8) } };
  });

  const removeSelectCard = (idx) => setCfg(prev => {
    const select = { ...DEFAULTS.iwakSelect, ...(prev.iwakSelect || {}) };
    let cards = (Array.isArray(select.cards) ? select.cards : []).filter((_, cardIdx) => cardIdx !== idx);
    if (cards.length > 0 && !cards.some(card => card.featured)) cards = cards.map((card, cardIdx) => ({ ...card, featured: cardIdx === 0 }));
    return { ...prev, iwakSelect: { ...select, cards } };
  });

  const moveSelectCard = (idx, dir) => setCfg(prev => {
    const select = { ...DEFAULTS.iwakSelect, ...(prev.iwakSelect || {}) };
    const cards = [...(Array.isArray(select.cards) ? select.cards : [])];
    const nextIdx = idx + dir;
    if (nextIdx < 0 || nextIdx >= cards.length) return prev;
    [cards[idx], cards[nextIdx]] = [cards[nextIdx], cards[idx]];
    return { ...prev, iwakSelect: { ...select, cards } };
  });

  const uploadSelectImage = async (idx, file) => {
    if (!file) return;
    if (!String(file.type || '').startsWith('image/')) {
      notifyGlobal('error', 'Нужен файл изображения');
      return;
    }
    if (file.size > PROMO_MAX_ORIGINAL_SIZE) {
      notifyGlobal('error', 'Файл слишком большой (макс. 25 МБ)');
      return;
    }
    if (!PROMO_ALLOWED_TYPES.includes(file.type)) {
      notifyGlobal('error', 'Формат не поддерживается (JPEG, PNG, WebP, AVIF, HEIC)');
      return;
    }

    let fileToUpload = file;
    try {
      fileToUpload = await imageCompression(file, {
        maxSizeMB: 1,
        maxWidthOrHeight: 1600,
        useWebWorker: true,
        initialQuality: 0.82,
        fileType: 'image/jpeg',
      });
    } catch {
      // Fallback: upload original
    }

    const form = new FormData();
    form.append('image', fileToUpload);
    try {
      const res = await authFetch('/api/upload', { method: 'POST', body: form });
      const text = await res.text();
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch {}
      if (!res.ok || !data.path) {
        notifyGlobal('error', data.error || text || `Не удалось загрузить картинку (${res.status})`);
        return;
      }
      updSelectCard(idx, { image: data.path });
      notifyGlobal('success', 'Картинка добавлена');
    } catch {
      notifyGlobal('error', 'Ошибка загрузки картинки');
    }
  };
  const mergeCatalogTheme = (patch) => setCfg(prev => ({
    ...prev,
    catalogTheme: {
      ...DEFAULTS.catalogTheme,
      ...(prev.catalogTheme || {}),
      ...patch,
    },
  }));

  const togglePage = (pageVal) => {
    setCfg(prev => {
      const pages = Array.isArray(prev.pages) ? [...prev.pages] : [];
      const idx = pages.indexOf(pageVal);
      if (idx >= 0) pages.splice(idx, 1);
      else pages.push(pageVal);
      return { ...prev, pages };
    });
  };

  const visiblePages = useMemo(() => {
    if (!Array.isArray(cfg.pages) || cfg.pages.length === 0) return 'Все страницы';
    return PAGE_OPTIONS
      .filter(opt => cfg.pages.includes(opt.value))
      .map(opt => opt.label)
      .join(', ');
  }, [cfg.pages]);

  if (loading) return <div className="promo-tab" style={{ padding: 24 }}>Загрузка…</div>;

  const previewStyle = {
    backgroundColor: cfg.backgroundColor || '#000',
    color: cfg.textColor || '#fff',
    fontSize: cfg.fontSize ? `${cfg.fontSize}px` : '14px',
    fontWeight: cfg.fontWeight || '600',
    borderRadius: cfg.borderRadius ? `${cfg.borderRadius}px` : '12px',
    padding: cfg.padding ? `${cfg.padding}px ${cfg.padding * 1.5}px` : '10px 16px',
    maxWidth: cfg.maxWidth ? `${cfg.maxWidth}px` : '480px',
    width: '100%',
    boxSizing: 'border-box',
    textAlign: 'center',
    wordWrap: 'break-word',
    overflowWrap: 'break-word',
    lineHeight: 1.4,
    margin: '0 auto',
    boxShadow: '0 2px 12px rgba(0,0,0,0.18)',
  };
  const catalogTheme = {
    ...DEFAULTS.catalogTheme,
    ...(cfg.catalogTheme || {}),
  };
  const iwakSelect = {
    ...DEFAULTS.iwakSelect,
    ...(cfg.iwakSelect || {}),
    palette: {
      ...DEFAULTS.iwakSelect.palette,
      ...((cfg.iwakSelect && cfg.iwakSelect.palette) || {}),
    },
    cards: Array.isArray(cfg.iwakSelect?.cards) ? cfg.iwakSelect.cards : DEFAULTS.iwakSelect.cards,
  };

  return (
    <div className="promo-tab">
      <div className="promo-tab__section">
        <div className="promo-tab__hero">
          <div>
            <h3 className="promo-tab__title">Промо-баннер</h3>
            <div className="promo-tab__subtitle">{cfg.enabled ? 'Активен на витрине' : 'Сейчас выключен'} · {visiblePages}</div>
          </div>
          <label className="promo-tab__switch">
            <input type="checkbox" checked={cfg.enabled} onChange={e => upd('enabled', e.target.checked)} />
            <span>{cfg.enabled ? 'Вкл' : 'Выкл'}</span>
          </label>
        </div>

        <div className="promo-tab__preview">
          <div className="promo-tab__preview-label">Превью</div>
          <div className="promo-tab__preview-area">
            {cfg.enabled && cfg.text ? (
              <div style={previewStyle}>
                {cfg.emoji ? <span style={{ marginRight: 6 }}>{cfg.emoji}</span> : null}
                {cfg.text}
              </div>
            ) : (
              <span className="promo-tab__preview-empty">Баннер выключен</span>
            )}
          </div>
        </div>

        <div className="promo-tab__block">
          <div className="promo-tab__block-head">
            <span>Быстрые сценарии</span>
            <small>Можно применить и отредактировать текст</small>
          </div>
          <div className="promo-tab__preset-grid">
            {PROMO_PRESETS.map(preset => (
              <button
                key={preset.id}
                type="button"
                className="promo-tab__preset"
                onClick={() => mergeCfg(preset.config)}
              >
                <span>{preset.label}</span>
                <small>{preset.config.text}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="promo-tab__block">
          <div className="promo-tab__field">
            <label className="promo-tab__label">Текст баннера</label>
            <input type="text" className="adm-input promo-tab__input"
              value={cfg.text} onChange={e => upd('text', e.target.value)}
              placeholder="Бесплатная доставка от 5000₽" />
          </div>

          <div className="promo-tab__row">
            <div className="promo-tab__field">
              <label className="promo-tab__label">Emoji</label>
              <input type="text" className="adm-input promo-tab__input promo-tab__input--sm"
                value={cfg.emoji} onChange={e => upd('emoji', e.target.value)}
                placeholder="🔥" />
            </div>
            <div className="promo-tab__field">
              <label className="promo-tab__label">Ссылка</label>
              <input type="text" className="adm-input promo-tab__input"
                value={cfg.link} onChange={e => upd('link', e.target.value)}
                placeholder="/catalog или https://..." />
            </div>
          </div>
        </div>

        <div className="promo-tab__block">
          <div className="promo-tab__field">
            <label className="promo-tab__label">Позиция</label>
            <div className="promo-tab__chips">
              <button type="button" className={`promo-tab__chip${(cfg.position || 'bottom') === 'bottom' ? ' promo-tab__chip--active' : ''}`} onClick={() => upd('position', 'bottom')}>Внизу экрана</button>
              <button type="button" className={`promo-tab__chip${cfg.position === 'top' ? ' promo-tab__chip--active' : ''}`} onClick={() => upd('position', 'top')}>Под шапкой</button>
            </div>
          </div>

          <div className="promo-tab__field">
            <label className="promo-tab__label">Показывать на страницах</label>
            <div className="promo-tab__chips">
              {PAGE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  className={`promo-tab__chip${Array.isArray(cfg.pages) && cfg.pages.includes(opt.value) ? ' promo-tab__chip--active' : ''}`}
                  onClick={() => togglePage(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <span className="promo-tab__hint">Если ничего не выбрано — баннер виден на всех страницах</span>
          </div>
        </div>

        <div className="promo-tab__block">
          <div className="promo-tab__block-head promo-tab__block-head--row">
            <div>
              <span>Дизайн</span>
              <small>Основные цвета и тонкие настройки</small>
            </div>
            <button type="button" className="adm-btn adm-btn--ghost adm-btn--sm" onClick={() => setShowDesign(v => !v)}>
              {showDesign ? 'Свернуть' : 'Настроить'}
            </button>
          </div>
          <div className="promo-tab__style-row">
            {STYLE_PRESETS.map(preset => (
              <button
                key={preset.id}
                type="button"
                className="promo-tab__style-swatch"
                onClick={() => mergeCfg({ backgroundColor: preset.backgroundColor, textColor: preset.textColor })}
                title={preset.label}
              >
                <span style={{ background: preset.backgroundColor, color: preset.textColor }}>Aa</span>
                {preset.label}
              </button>
            ))}
          </div>

          {showDesign ? (
            <div className="promo-tab__advanced">
              <div className="promo-tab__row">
                <div className="promo-tab__field">
                  <label className="promo-tab__label">Цвет фона</label>
                  <div className="promo-tab__color-wrap">
                    <input type="color" value={cfg.backgroundColor} onChange={e => upd('backgroundColor', e.target.value)} />
                    <input type="text" className="adm-input promo-tab__input promo-tab__input--sm"
                      value={cfg.backgroundColor} onChange={e => upd('backgroundColor', e.target.value)} />
                  </div>
                </div>
                <div className="promo-tab__field">
                  <label className="promo-tab__label">Цвет текста</label>
                  <div className="promo-tab__color-wrap">
                    <input type="color" value={cfg.textColor} onChange={e => upd('textColor', e.target.value)} />
                    <input type="text" className="adm-input promo-tab__input promo-tab__input--sm"
                      value={cfg.textColor} onChange={e => upd('textColor', e.target.value)} />
                  </div>
                </div>
              </div>

              <div className="promo-tab__row">
                <div className="promo-tab__field">
                  <label className="promo-tab__label">Размер шрифта</label>
                  <input type="number" className="adm-input promo-tab__input promo-tab__input--sm" min="10" max="32"
                    value={cfg.fontSize} onChange={e => upd('fontSize', Number(e.target.value) || 14)} />
                </div>
                <div className="promo-tab__field">
                  <label className="promo-tab__label">Жирность</label>
                  <select className="adm-input promo-tab__input promo-tab__input--sm"
                    value={cfg.fontWeight} onChange={e => upd('fontWeight', e.target.value)}>
                    <option value="400">400</option>
                    <option value="500">500</option>
                    <option value="600">600</option>
                    <option value="700">700</option>
                  </select>
                </div>
              </div>

              <div className="promo-tab__row">
                <div className="promo-tab__field">
                  <label className="promo-tab__label">Скругление</label>
                  <input type="number" className="adm-input promo-tab__input promo-tab__input--sm" min="0" max="40"
                    value={cfg.borderRadius} onChange={e => upd('borderRadius', Number(e.target.value) || 0)} />
                </div>
                <div className="promo-tab__field">
                  <label className="promo-tab__label">Padding</label>
                  <input type="number" className="adm-input promo-tab__input promo-tab__input--sm" min="4" max="32"
                    value={cfg.padding} onChange={e => upd('padding', Number(e.target.value) || 10)} />
                </div>
                <div className="promo-tab__field">
                  <label className="promo-tab__label">Макс. ширина</label>
                  <input type="number" className="adm-input promo-tab__input promo-tab__input--sm" min="200" max="1200"
                    value={cfg.maxWidth} onChange={e => upd('maxWidth', Number(e.target.value) || 480)} />
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="promo-tab__block">
          <div className="promo-tab__block-head">
            <span>Цвета скидок в каталоге</span>
            <small>Цена со скидкой и плашка процента на карточках</small>
          </div>

          <div className="promo-tab__style-row">
            {CATALOG_THEME_PRESETS.map(preset => (
              <button
                key={preset.id}
                type="button"
                className="promo-tab__style-swatch"
                onClick={() => mergeCatalogTheme({
                  saleColor: preset.saleColor,
                  badgeBg: preset.badgeBg,
                  badgeText: preset.badgeText,
                })}
                title={preset.label}
              >
                <span style={{ background: preset.badgeBg, color: preset.badgeText }}>-%</span>
                {preset.label}
              </button>
            ))}
          </div>

          <div className="promo-tab__row">
            <div className="promo-tab__field">
              <label className="promo-tab__label">Цена со скидкой</label>
              <div className="promo-tab__color-wrap">
                <input type="color" value={catalogTheme.saleColor} onChange={e => updCatalogTheme('saleColor', e.target.value)} />
                <input type="text" className="adm-input promo-tab__input promo-tab__input--sm"
                  value={catalogTheme.saleColor} onChange={e => updCatalogTheme('saleColor', e.target.value)} />
              </div>
            </div>
            <div className="promo-tab__field">
              <label className="promo-tab__label">Плашка скидки</label>
              <div className="promo-tab__color-wrap">
                <input type="color" value={catalogTheme.badgeBg} onChange={e => updCatalogTheme('badgeBg', e.target.value)} />
                <input type="text" className="adm-input promo-tab__input promo-tab__input--sm"
                  value={catalogTheme.badgeBg} onChange={e => updCatalogTheme('badgeBg', e.target.value)} />
              </div>
            </div>
            <div className="promo-tab__field">
              <label className="promo-tab__label">Текст плашки</label>
              <div className="promo-tab__color-wrap">
                <input type="color" value={catalogTheme.badgeText} onChange={e => updCatalogTheme('badgeText', e.target.value)} />
                <input type="text" className="adm-input promo-tab__input promo-tab__input--sm"
                  value={catalogTheme.badgeText} onChange={e => updCatalogTheme('badgeText', e.target.value)} />
              </div>
            </div>
          </div>

          <div className="promo-tab__catalog-preview">
            <span className="promo-tab__catalog-price" style={{ color: catalogTheme.saleColor }}>₽3 990</span>
            <span className="promo-tab__catalog-old">₽5 500</span>
            <span
              className="promo-tab__catalog-badge"
              style={{ background: catalogTheme.badgeBg, color: catalogTheme.badgeText }}
            >
              -27%
            </span>
          </div>
        </div>

        <div className="promo-tab__block promo-tab__select">
          <div className="promo-tab__block-head promo-tab__block-head--row">
            <div>
              <span>IWAK SELECT</span>
              <small>Витрина подборок на главной каталога</small>
            </div>
            <label className="promo-tab__switch">
              <input type="checkbox" checked={Boolean(iwakSelect.enabled)} onChange={e => updSelect('enabled', e.target.checked)} />
              <span>{iwakSelect.enabled ? 'Вкл' : 'Выкл'}</span>
            </label>
          </div>

          <div className="promo-tab__row">
            <div className="promo-tab__field">
              <label className="promo-tab__label">Заголовок</label>
              <input className="adm-input promo-tab__input" value={iwakSelect.title} onChange={e => updSelect('title', e.target.value)} />
            </div>
            <div className="promo-tab__field">
              <label className="promo-tab__label">Подпись</label>
              <input className="adm-input promo-tab__input" value={iwakSelect.subtitle} onChange={e => updSelect('subtitle', e.target.value)} />
            </div>
          </div>

          <div className="promo-tab__row">
            <div className="promo-tab__field">
              <label className="promo-tab__label">Цвет названия (глобально)</label>
              <div className="promo-tab__color-wrap">
                <input type="color" value={normalizeHex(iwakSelect.palette?.titleColor, DEFAULTS.iwakSelect.palette.titleColor)} onChange={e => updSelectPalette('titleColor', e.target.value)} />
                <input type="text" className="adm-input promo-tab__input promo-tab__input--sm"
                  value={iwakSelect.palette?.titleColor || DEFAULTS.iwakSelect.palette.titleColor}
                  onChange={e => updSelectPalette('titleColor', e.target.value)} />
              </div>
            </div>
            <div className="promo-tab__field">
              <label className="promo-tab__label">Цвет подписи (глобально)</label>
              <div className="promo-tab__color-wrap">
                <input type="color" value={normalizeHex(iwakSelect.palette?.subtitleColor, '#cccccc')} onChange={e => updSelectPalette('subtitleColor', e.target.value)} />
                <input type="text" className="adm-input promo-tab__input promo-tab__input--sm"
                  value={iwakSelect.palette?.subtitleColor || '#cccccc'}
                  onChange={e => updSelectPalette('subtitleColor', e.target.value)} />
              </div>
            </div>
          </div>

          <div className="promo-tab__select-preview">
            <div className="iwak-select-mini">
              <span>{iwakSelect.title || 'IWAK SELECT'}</span>
              <small>{iwakSelect.subtitle || 'сейчас по скидке'}</small>
              <div className="iwak-select-mini__cards">
                {(iwakSelect.cards || []).filter(card => card.active !== false).slice(0, 5).map((card) => (
                  <div key={card.id} className={`iwak-select-mini__card${card.featured ? ' iwak-select-mini__card--main' : ''}`}>
                    {card.image ? <img src={card.image} alt="" /> : null}
                    <b style={{ color: card.titleColor || iwakSelect.palette?.titleColor || '#fff' }}>{card.title}</b>
                    <em style={{ color: card.subtitleColor || iwakSelect.palette?.subtitleColor || 'rgba(255,255,255,0.82)' }}>{card.meta || card.subtitle}</em>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="promo-tab__select-list">
            {(iwakSelect.cards || []).map((card, idx) => (
              <div className="promo-tab__select-card" key={card.id || idx}>
                <div className="promo-tab__select-card-media">
                  {card.image ? <img src={card.image} alt="" /> : <span>авто</span>}
                  <label className="promo-tab__select-upload">
                    <input type="file" accept="image/*" onChange={(e) => uploadSelectImage(idx, e.target.files?.[0])} />
                    Фото
                  </label>
                </div>
                <div className="promo-tab__select-card-form">
                  <div className="promo-tab__row">
                    <div className="promo-tab__field">
                      <label className="promo-tab__label">Название</label>
                      <input className="adm-input promo-tab__input" value={card.title || ''} onChange={e => updSelectCard(idx, { title: e.target.value })} />
                    </div>
                    <div className="promo-tab__field">
                      <label className="promo-tab__label">Подпись</label>
                      <input className="adm-input promo-tab__input" value={card.subtitle || ''} onChange={e => updSelectCard(idx, { subtitle: e.target.value })} />
                    </div>
                  </div>
                  <div className="promo-tab__row">
                    <div className="promo-tab__field">
                      <label className="promo-tab__label">Акцент</label>
                      <input className="adm-input promo-tab__input" value={card.meta || ''} onChange={e => updSelectCard(idx, { meta: e.target.value })} placeholder="до -46%" />
                    </div>
                    <div className="promo-tab__field">
                      <label className="promo-tab__label">Ссылка</label>
                      <input className="adm-input promo-tab__input" value={card.link || ''} onChange={e => updSelectCard(idx, { link: e.target.value })} placeholder="/catalog?sale=true" />
                    </div>
                  </div>
                  <div className="promo-tab__row">
                    <div className="promo-tab__field">
                      <label className="promo-tab__label">Цвет названия (карточка)</label>
                      <div className="promo-tab__color-wrap">
                        <input type="color" value={normalizeHex(card.titleColor, iwakSelect.palette?.titleColor || '#ffffff')} onChange={e => updSelectCard(idx, { titleColor: e.target.value })} />
                        <input className="adm-input promo-tab__input promo-tab__input--sm" value={card.titleColor || ''} onChange={e => updSelectCard(idx, { titleColor: e.target.value })} placeholder="HEX или пусто = глобально" />
                      </div>
                    </div>
                    <div className="promo-tab__field">
                      <label className="promo-tab__label">Цвет подписи (карточка)</label>
                      <div className="promo-tab__color-wrap">
                        <input type="color" value={normalizeHex(card.subtitleColor, iwakSelect.palette?.subtitleColor || '#cccccc')} onChange={e => updSelectCard(idx, { subtitleColor: e.target.value })} />
                        <input className="adm-input promo-tab__input promo-tab__input--sm" value={card.subtitleColor || ''} onChange={e => updSelectCard(idx, { subtitleColor: e.target.value })} placeholder="HEX или пусто = глобально" />
                      </div>
                    </div>
                  </div>
                  <div className="promo-tab__select-actions">
                    <label><input type="checkbox" checked={card.active !== false} onChange={e => updSelectCard(idx, { active: e.target.checked })} /> Активна</label>
                    <label><input type="checkbox" checked={Boolean(card.featured)} onChange={e => updSelectCard(idx, { featured: e.target.checked })} /> Главная</label>
                    <button type="button" className="adm-btn adm-btn--ghost adm-btn--sm" onClick={() => moveSelectCard(idx, -1)}>↑</button>
                    <button type="button" className="adm-btn adm-btn--ghost adm-btn--sm" onClick={() => moveSelectCard(idx, 1)}>↓</button>
                    <button type="button" className="adm-btn adm-btn--ghost adm-btn--sm" onClick={() => removeSelectCard(idx)}>Удалить</button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button type="button" className="adm-btn adm-btn--ghost" onClick={addSelectCard} disabled={(iwakSelect.cards || []).length >= 8}>
            + Добавить карточку
          </button>
        </div>

        <div className="promo-tab__actions">
          <button className="adm-btn adm-btn--primary promo-tab__save" disabled={saving} onClick={handleSave}>
            {saving ? 'Сохранение…' : 'Сохранить промо'}
          </button>
          <button type="button" className="adm-btn adm-btn--ghost" onClick={() => setCfg(DEFAULTS)}>
            Сбросить
          </button>
        </div>
      </div>
    </div>
  );
}
