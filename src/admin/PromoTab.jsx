import { useState, useEffect, useCallback, useMemo } from 'react';
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

const clamp = (value, min, max, fallback) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
};

function cleanConfig(cfg) {
  return {
    ...DEFAULTS,
    ...cfg,
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
