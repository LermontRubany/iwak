import { useState, useEffect, useCallback } from 'react';
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

export default function PromoTab() {
  const [cfg, setCfg] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    authFetch('/api/promo/config')
      .then(r => r.json())
      .then(d => { if (d?.config && typeof d.config === 'object') setCfg({ ...DEFAULTS, ...d.config }); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const r = await authFetch('/api/promo/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: cfg }),
      });
      const d = await r.json();
      if (d.ok) {
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

  const togglePage = (pageVal) => {
    setCfg(prev => {
      const pages = Array.isArray(prev.pages) ? [...prev.pages] : [];
      const idx = pages.indexOf(pageVal);
      if (idx >= 0) pages.splice(idx, 1);
      else pages.push(pageVal);
      return { ...prev, pages };
    });
  };

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
        <h3 className="promo-tab__title">Промо-баннер</h3>

        {/* Preview */}
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

        {/* Enabled toggle */}
        <label className="promo-tab__toggle">
          <input type="checkbox" checked={cfg.enabled} onChange={e => upd('enabled', e.target.checked)} />
          <span>Включён</span>
        </label>

        {/* Position */}
        <div className="promo-tab__field">
          <label className="promo-tab__label">Позиция баннера</label>
          <select className="adm-input promo-tab__input promo-tab__input--sm"
            value={cfg.position || 'bottom'} onChange={e => upd('position', e.target.value)}>
            <option value="bottom">Внизу экрана</option>
            <option value="top">Под шапкой</option>
          </select>
        </div>

        {/* Text + Emoji */}
        <div className="promo-tab__field">
          <label className="promo-tab__label">Текст баннера</label>
          <input type="text" className="adm-input promo-tab__input"
            value={cfg.text} onChange={e => upd('text', e.target.value)}
            placeholder="Бесплатная доставка от 5000₽" />
        </div>

        <div className="promo-tab__field">
          <label className="promo-tab__label">Emoji</label>
          <input type="text" className="adm-input promo-tab__input promo-tab__input--sm"
            value={cfg.emoji} onChange={e => upd('emoji', e.target.value)}
            placeholder="🔥" />
        </div>

        {/* Colors */}
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

        {/* Font */}
        <div className="promo-tab__row">
          <div className="promo-tab__field">
            <label className="promo-tab__label">Размер шрифта (px)</label>
            <input type="number" className="adm-input promo-tab__input promo-tab__input--sm" min="10" max="32"
              value={cfg.fontSize} onChange={e => upd('fontSize', Number(e.target.value) || 14)} />
          </div>
          <div className="promo-tab__field">
            <label className="promo-tab__label">Жирность</label>
            <select className="adm-input promo-tab__input promo-tab__input--sm"
              value={cfg.fontWeight} onChange={e => upd('fontWeight', e.target.value)}>
              <option value="400">400 (обычный)</option>
              <option value="500">500 (средний)</option>
              <option value="600">600 (полужирный)</option>
              <option value="700">700 (жирный)</option>
            </select>
          </div>
        </div>

        {/* Shape */}
        <div className="promo-tab__row">
          <div className="promo-tab__field">
            <label className="promo-tab__label">Скругление (px)</label>
            <input type="number" className="adm-input promo-tab__input promo-tab__input--sm" min="0" max="40"
              value={cfg.borderRadius} onChange={e => upd('borderRadius', Number(e.target.value) || 0)} />
          </div>
          <div className="promo-tab__field">
            <label className="promo-tab__label">Padding (px)</label>
            <input type="number" className="adm-input promo-tab__input promo-tab__input--sm" min="4" max="32"
              value={cfg.padding} onChange={e => upd('padding', Number(e.target.value) || 10)} />
          </div>
        </div>

        {/* Max Width */}
        <div className="promo-tab__field">
          <label className="promo-tab__label">Макс. ширина (px)</label>
          <input type="number" className="adm-input promo-tab__input promo-tab__input--sm" min="200" max="1200"
            value={cfg.maxWidth} onChange={e => upd('maxWidth', Number(e.target.value) || 480)} />
          <span className="promo-tab__hint">На мобильных баннер автоматически займёт всю ширину экрана</span>
        </div>

        {/* Link */}
        <div className="promo-tab__field">
          <label className="promo-tab__label">Ссылка (необязательно)</label>
          <input type="text" className="adm-input promo-tab__input"
            value={cfg.link} onChange={e => upd('link', e.target.value)}
            placeholder="https://example.com" />
        </div>

        {/* Pages */}
        <div className="promo-tab__field">
          <label className="promo-tab__label">Показывать на страницах</label>
          <div className="promo-tab__pages">
            {PAGE_OPTIONS.map(opt => (
              <label key={opt.value} className="promo-tab__page-check">
                <input type="checkbox"
                  checked={Array.isArray(cfg.pages) && cfg.pages.includes(opt.value)}
                  onChange={() => togglePage(opt.value)} />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
          <span className="promo-tab__hint">Если ничего не выбрано — баннер на всех страницах</span>
        </div>

        <button className="adm-btn adm-btn--primary promo-tab__save" disabled={saving} onClick={handleSave}>
          {saving ? 'Сохранение…' : 'Сохранить'}
        </button>
      </div>
    </div>
  );
}
