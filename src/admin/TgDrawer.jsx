import { useState, useEffect, useCallback, useRef } from 'react';
import authFetch, { getToken } from './authFetch';
import ButtonConstructor from './ButtonConstructor';

// Fallback buttons used before templates load from server
const FALLBACK_PRODUCT_BUTTONS = [
  [{ text: 'Смотреть товар', type: 'product', url: '', filter: { category: '', gender: [], brand: [], sale: false } }],
  [{ text: 'Заказать', type: 'order' }, { text: 'Скидки', type: 'filter', filter: { sale: true } }],
  [{ text: 'Отзывы', type: 'url', url: 'https://t.me/iwakotzivi' }, { text: 'Канал', type: 'url', url: 'https://t.me/IWAK3' }],
  [{ text: 'Мы в Max', type: 'url', url: 'https://max.ru/join/XJio5vHkjIhHJfk4CqNB09pvE0bKwDCVxGuYMxI1buo' }],
];
const FALLBACK_CUSTOM_BUTTONS = [
  [{ text: 'Каталог', type: 'url', url: 'https://iwak.ru/catalog' }],
  [{ text: 'Скидки', type: 'filter', filter: { sale: true } }, { text: 'Канал', type: 'url', url: 'https://t.me/IWAK3' }],
  [{ text: 'Отзывы', type: 'url', url: 'https://t.me/iwakotzivi' }, { text: 'Мы в Max', type: 'url', url: 'https://max.ru/join/XJio5vHkjIhHJfk4CqNB09pvE0bKwDCVxGuYMxI1buo' }],
];
const CUSTOM_POST_PRESETS = [
  {
    id: 'drop',
    label: 'Дроп',
    text: 'Новый дроп уже на сайте.\n\nСобрали свежие позиции, размеры быстро уходят.',
  },
  {
    id: 'sale',
    label: 'Скидки',
    text: 'Добавили позиции со скидками.\n\nПроверьте каталог, пока есть размеры.',
  },
  {
    id: 'reminder',
    label: 'Напоминание',
    text: 'Напоминаем: доставка бесплатная.\n\nЕсли нужна помощь с размером, напишите менеджеру.',
  },
  {
    id: 'reviews',
    label: 'Отзывы',
    text: 'Перед заказом можно посмотреть отзывы покупателей.\n\nСсылка ниже.',
  },
];

function renderTgHtml(text) {
  return text.split('\n').map((line, i) => {
    // parse <b>...</b>, <s>...</s>, <a href="...">...</a>, plain text
    const parts = [];
    let last = 0;
    const re = /<b>(.*?)<\/b>|<s>(.*?)<\/s>|<a\s+href="([^"]*)"[^>]*>(.*?)<\/a>/g;
    let m;
    while ((m = re.exec(line)) !== null) {
      if (m.index > last) parts.push(line.slice(last, m.index));
      if (m[1] != null) parts.push(<strong key={`${i}-${m.index}`}>{m[1]}</strong>);
      else if (m[2] != null) parts.push(<s key={`${i}-${m.index}`}>{m[2]}</s>);
      else if (m[3] != null) parts.push(<a key={`${i}-${m.index}`} href={m[3]} target="_blank" rel="noreferrer" className="tg-link">{m[4]}</a>);
      last = re.lastIndex;
    }
    if (last < line.length) parts.push(line.slice(last));
    return <div key={i}>{parts.length > 0 ? parts : '\u00A0'}</div>;
  });
}

const TEMPLATES = [
  { id: 'basic', label: '📦 Базовый' },
  { id: 'new',   label: '🆕 Новинка' },
  { id: 'sale',  label: '🔥 Скидка' },
  { id: 'premium', label: '✨ Премиум' },
];

export default function TgDrawer({ productIds, onClose, onSent, filterOptions, initialMode }) {
  const [mode, setMode] = useState(initialMode || 'product');
  const [template, setTemplate] = useState('basic');
  const [previews, setPreviews] = useState([]); // [{text, photos, url, product}]
  const [activeIdx, setActiveIdx] = useState(0);
  const [selectedPhoto, setSelectedPhoto] = useState(0);
  const [editText, setEditText] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState(null); // "2/5"
  const [result, setResult] = useState(null); // {type, text}
  const [withBadge, setWithBadge] = useState(false);
  const [buttons, setButtons] = useState(FALLBACK_PRODUCT_BUTTONS);
  const [tplMap, setTplMap] = useState(null); // { basic: {defaultButtons}, ... }
  const [customPhotos, setCustomPhotos] = useState([]);
  const [customUploading, setCustomUploading] = useState(false);
  const pollRef = useRef(null);

  // Load templates config from server
  useEffect(() => {
    authFetch('/api/tg/templates').then(r => r.ok ? r.json() : null).then(list => {
      if (!list) return;
      const map = {};
      for (const t of list) map[t.id] = t;
      setTplMap(map);
      // Set initial buttons from template
      const initTpl = (initialMode === 'custom') ? 'custom' : 'basic';
      if (map[initTpl]?.defaultButtons) setButtons(map[initTpl].defaultButtons);
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const getDefaultButtonsFor = useCallback((tplId) => {
    if (tplMap && tplMap[tplId]?.defaultButtons) return tplMap[tplId].defaultButtons;
    return tplId === 'custom' ? FALLBACK_CUSTOM_BUTTONS : FALLBACK_PRODUCT_BUTTONS;
  }, [tplMap]);

  // Cleanup polling on unmount
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // Load previews when productIds or template changes (product mode only)
  useEffect(() => {
    if (mode === 'custom') return;
    if (!productIds || productIds.length === 0) return;
    let cancelled = false;
    setLoading(true);
    setResult(null);
    setSendProgress(null);

    Promise.all(
      productIds.map(id =>
        authFetch(`/api/tg/preview/${id}?template=${template}`)
          .then(r => r.ok ? r.json() : null)
      )
    ).then(results => {
      if (cancelled) return;
      const valid = results.filter(Boolean);
      setPreviews(valid);
      setActiveIdx(0);
      setSelectedPhoto(0);
      if (valid.length > 0) setEditText(valid[0].text);
      setWithBadge(false);
      setLoading(false);
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [productIds, template, mode]);

  // Sync editText when switching active product
  useEffect(() => {
    if (previews[activeIdx]) {
      setEditText(previews[activeIdx].text);
      setSelectedPhoto(0);
    }
  }, [activeIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSend = useCallback(async () => {
    if (sending) return;

    // Custom mode: text/photos/buttons without product
    if (mode === 'custom') {
      setSending(true);
      setResult(null);
      setSendProgress({ current: 1, total: 1 });
      try {
        const res = await authFetch('/api/tg/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'custom',
            text: editText,
            buttons,
            photos: customPhotos.map(p => p.path),
          }),
        });
        const json = await res.json();
        setSending(false);
        setSendProgress(null);
        if (res.ok && json.ok) {
          setResult({ type: 'ok', text: 'Отправлено в Telegram' });
          if (onSent) setTimeout(onSent, 1200);
        } else {
          setResult({ type: 'error', text: json.error || 'Ошибка отправки' });
        }
      } catch {
        setSending(false);
        setSendProgress(null);
        setResult({ type: 'error', text: 'Ошибка соединения' });
      }
      return;
    }

    // Product mode
    if (previews.length === 0) return;
    setSending(true);
    setResult(null);

    const total = previews.length;

    if (total === 1) {
      // Single product — direct send with custom text support
      const p = previews[0];
      setSendProgress({ current: 1, total: 1 });
      try {
        const body = { productId: p.product.id, template, imageIndex: selectedPhoto, buttons };
        if (editText !== p.text) body.text = editText;
        if (withBadge) body.withBadge = true;
        const res = await authFetch('/api/tg/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const json = await res.json();
        setSending(false);
        setSendProgress(null);
        if (res.ok && json.ok) {
          setResult({ type: 'ok', text: 'Отправлено в Telegram' });
          if (onSent) setTimeout(onSent, 1200);
        } else {
          setResult({ type: 'error', text: json.error || 'Ошибка отправки' });
        }
      } catch {
        setSending(false);
        setSendProgress(null);
        setResult({ type: 'error', text: 'Ошибка соединения' });
      }
      return;
    }

    // Batch — server-side queue with polling
    try {
      const res = await authFetch('/api/tg/send-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productIds: previews.map(p => p.product.id), template, buttons, ...(withBadge ? { withBadge: true } : {}) }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setSending(false);
        setResult({ type: 'error', text: json.error || 'Ошибка запуска batch' });
        return;
      }
      const { batchId } = await res.json();

      pollRef.current = setInterval(async () => {
        try {
          const sr = await authFetch(`/api/tg/batch/${batchId}`);
          if (!sr.ok) { clearInterval(pollRef.current); pollRef.current = null; setSending(false); return; }
          const status = await sr.json();
          setSendProgress({ current: status.sent + status.failed, total: status.total });
          if (status.done) {
            clearInterval(pollRef.current);
            pollRef.current = null;
            setSending(false);
            setSendProgress(null);
            if (status.failed === 0) {
              setResult({ type: 'ok', text: `Отправлено: ${status.sent} пост(ов)` });
              if (onSent) setTimeout(onSent, 1200);
            } else {
              const errMsg = status.errors.length > 0 ? `\n${status.errors.slice(0, 3).join('\n')}` : '';
              setResult({ type: 'error', text: `Успешно: ${status.sent}, ошибок: ${status.failed}${errMsg}` });
            }
          }
        } catch {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setSending(false);
          setResult({ type: 'error', text: 'Потеряно соединение' });
        }
      }, 1500);
    } catch {
      setSending(false);
      setResult({ type: 'error', text: 'Ошибка запуска отправки' });
    }
  }, [previews, sending, editText, template, selectedPhoto, withBadge, buttons, mode, onSent, customPhotos]);

  const current = previews[activeIdx];
  const isSingle = mode === 'custom' || previews.length === 1;
  const customLimit = customPhotos.length > 0 ? 1024 : 4096;
  const limit = mode === 'custom' ? customLimit : (current && current.photos.length > 0 ? 1024 : 4096);
  const charLen = editText.length;
  const overLimit = charLen > limit;
  const hasCustomButton = mode === 'custom' && (buttons || []).some(row => (row || []).some(btn => btn?.text));
  const canSendCustom = editText.trim() || customPhotos.length > 0 || hasCustomButton;

  const handleModeSwitch = (m) => {
    if (m === mode) return;
    setMode(m);
    setResult(null);
    if (m === 'custom') {
      setEditText('');
      setButtons(getDefaultButtonsFor('custom'));
    } else {
      setButtons(getDefaultButtonsFor(template));
      if (current) setEditText(current.text);
    }
  };

  const applyCustomPreset = (text) => {
    setEditText(prev => {
      const currentText = prev.trim();
      return currentText ? `${currentText}\n\n${text}` : text;
    });
  };

  const uploadCustomPhotos = async (files) => {
    const selected = Array.from(files || []).slice(0, Math.max(0, 10 - customPhotos.length));
    if (selected.length === 0) return;
    setCustomUploading(true);
    setResult(null);
    try {
      const uploaded = [];
      for (const file of selected) {
        const formData = new FormData();
        formData.append('image', file);
        const res = await fetch('/api/upload', {
          method: 'POST',
          headers: { Authorization: `Bearer ${getToken()}` },
          body: formData,
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || 'Ошибка загрузки фото');
        uploaded.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          path: json.path,
        });
      }
      setCustomPhotos(prev => [...prev, ...uploaded].slice(0, 10));
    } catch (err) {
      setResult({ type: 'error', text: err.message || 'Ошибка загрузки фото' });
    } finally {
      setCustomUploading(false);
    }
  };

  const removeCustomPhoto = (id) => {
    setCustomPhotos(prev => prev.filter(photo => photo.id !== id));
  };

  return (
    <>
      <div className="tg-drawer-overlay" onClick={onClose} />
      <div className="tg-drawer">
        <div className="tg-drawer__header">
          <span className="tg-drawer__title">
            {mode === 'custom' ? '📝 Свой пост' : isSingle ? '📤 Telegram пост' : `📤 Отправка ${previews.length} товаров`}
          </span>
          <button className="tg-drawer__close" onClick={onClose}>✕</button>
        </div>

        {/* Mode toggle */}
        <div className="tg-drawer__mode-toggle">
          <button className={`adm-filter-chip${mode === 'product' ? ' adm-filter-chip--active' : ''}`} onClick={() => handleModeSwitch('product')}>🛍 Товар</button>
          <button className={`adm-filter-chip${mode === 'custom' ? ' adm-filter-chip--active' : ''}`} onClick={() => handleModeSwitch('custom')}>📝 Свой пост</button>
        </div>

        {/* Custom mode body */}
        {mode === 'custom' && (
          <div className="tg-drawer__body">
            <div className="tg-custom-tools">
              <span className="tg-custom-tools__label">Заготовки</span>
              <div className="tg-custom-tools__chips">
                {CUSTOM_POST_PRESETS.map(preset => (
                  <button
                    key={preset.id}
                    type="button"
                    className="tg-custom-tools__chip"
                    onClick={() => applyCustomPreset(preset.text)}
                  >
                    {preset.label}
                  </button>
                ))}
                {editText && (
                  <button
                    type="button"
                    className="tg-custom-tools__chip tg-custom-tools__chip--muted"
                    onClick={() => setEditText('')}
                  >
                    Очистить
                  </button>
                )}
              </div>
            </div>

            <div className="tg-drawer__text-preview">
              {editText.trim() ? renderTgHtml(editText) : <span className="tg-drawer__placeholder">Введите текст поста...</span>}
            </div>
            {customPhotos.length > 0 && (
              <div className="tg-drawer__photos">
                {customPhotos.map((photo) => (
                  <div key={photo.id} className="tg-drawer__photo-wrap tg-drawer__photo-wrap--selected">
                    <img src={photo.path} alt="" className="tg-drawer__photo" />
                    <button
                      type="button"
                      className="tg-drawer__photo-remove"
                      onClick={() => removeCustomPhoto(photo.id)}
                      title="Убрать фото"
                    >
                      x
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="tg-drawer__button-preview">
              {(buttons || EMPTY_BUTTONS).map((row, ri) => (
                <div key={ri} className="tg-drawer__btn-row">
                  {row.map((btn, ci) => (
                    <span key={ci} className="tg-drawer__inline-btn">{btn.text || '—'}</span>
                  ))}
                </div>
              ))}
            </div>

            <ButtonConstructor
              value={buttons}
              onChange={setButtons}
              filterOptions={filterOptions}
            />

            <div className="tg-drawer__editor">
              <label className="tg-custom-upload">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={e => {
                    uploadCustomPhotos(e.target.files);
                    e.target.value = '';
                  }}
                  disabled={customUploading || customPhotos.length >= 10}
                />
                <span>{customUploading ? 'Загрузка фото...' : customPhotos.length > 0 ? `Фото: ${customPhotos.length} / 10` : 'Добавить фото'}</span>
              </label>
              <label className="tg-label">Текст поста</label>
              <textarea
                className="adm-input tg-textarea"
                value={editText}
                onChange={e => setEditText(e.target.value)}
                rows={6}
                placeholder="Введите текст поста..."
              />
              <div className={`tg-charcount${overLimit ? ' tg-charcount--over' : ''}`}>
                {charLen} / {limit}{overLimit ? ' — превышен лимит' : ''}
              </div>
            </div>

            <div className="tg-drawer__footer">
              <button
                className="adm-btn adm-btn--primary tg-drawer__send"
                onClick={handleSend}
                disabled={sending || customUploading || overLimit || !canSendCustom}
              >
                {sending ? 'Отправка...' : '📤 Отправить в Telegram'}
              </button>
              {result && (
                <div className={`tg-msg tg-msg--${result.type}`}>{result.text}</div>
              )}
            </div>
          </div>
        )}

        {/* Product mode */}
        {mode === 'product' && loading && <div className="tg-drawer__loading">Загрузка...</div>}

        {mode === 'product' && !loading && previews.length === 0 && (
          <div className="tg-drawer__empty">Не удалось загрузить товары</div>
        )}

        {mode === 'product' && !loading && current && (
          <div className="tg-drawer__body">
            {/* Template selector */}
            <div className="tg-drawer__templates">
              {TEMPLATES.map(t => (
                <button
                  key={t.id}
                  className={`adm-filter-chip${template === t.id ? ' adm-filter-chip--active' : ''}`}
                  onClick={() => { setTemplate(t.id); setButtons(getDefaultButtonsFor(t.id)); }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Badge toggle */}
            {previews.some(p => p.hasBadge) && (
              <label className="tg-drawer__badge-toggle">
                <input type="checkbox" checked={withBadge} onChange={e => setWithBadge(e.target.checked)} />
                <span>С бейджом на фото</span>
              </label>
            )}

            {/* Multi-product tabs */}
            {!isSingle && (
              <div className="tg-drawer__tabs">
                {previews.map((p, i) => (
                  <button
                    key={p.product.id}
                    className={`tg-drawer__tab${i === activeIdx ? ' tg-drawer__tab--active' : ''}`}
                    onClick={() => setActiveIdx(i)}
                  >
                    {p.product.brand ? `${p.product.brand} — ` : ''}{p.product.name}
                  </button>
                ))}
              </div>
            )}

            {/* Sale fallback warning */}
            {current.saleFallback && (
              <div className="tg-msg tg-msg--warning">⚠️ У товара нет скидки — используется базовый шаблон</div>
            )}

            {/* Preview */}
            <div className="tg-drawer__preview">
              {current.photos.length > 0 && (
                <div className="tg-drawer__photos">
                  {current.photos.slice(0, 8).map((src, i) => (
                    <div
                      key={i}
                      className={`tg-drawer__photo-wrap${selectedPhoto === i ? ' tg-drawer__photo-wrap--selected' : ''}`}
                      onClick={() => setSelectedPhoto(i)}
                    >
                      <img src={src} alt="" className="tg-drawer__photo" />
                      {selectedPhoto === i && <span className="tg-drawer__photo-check">✓</span>}
                    </div>
                  ))}
                  {current.photos.length > 8 && (
                    <span className="tg-drawer__more-photos">+{current.photos.length - 8}</span>
                  )}
                </div>
              )}
              <div className="tg-drawer__text-preview">
                {renderTgHtml(isSingle ? editText : current.text)}
              </div>
              <div className="tg-drawer__button-preview">
                {(buttons || DEFAULT_BUTTONS).map((row, ri) => (
                  <div key={ri} className="tg-drawer__btn-row">
                    {row.map((btn, ci) => (
                      <span key={ci} className="tg-drawer__inline-btn">{btn.text || '—'}</span>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            {/* Button constructor */}
            <ButtonConstructor
              value={buttons}
              onChange={setButtons}
              filterOptions={filterOptions}
            />

            {/* Editor (single product only) */}
            {isSingle && (
              <div className="tg-drawer__editor">
                <label className="tg-label">Текст поста</label>
                <textarea
                  className="adm-input tg-textarea"
                  value={editText}
                  onChange={e => setEditText(e.target.value)}
                  rows={6}
                />
                <div className={`tg-charcount${overLimit ? ' tg-charcount--over' : ''}`}>
                  {charLen} / {limit}{overLimit ? ' — превышен лимит' : ''}
                </div>
                {editText !== current.text && (
                  <button
                    className="adm-btn adm-btn--sm tg-reset-btn"
                    onClick={() => setEditText(current.text)}
                  >
                    ← Сбросить к шаблону
                  </button>
                )}
              </div>
            )}

            {/* Send */}
            <div className="tg-drawer__footer">
              {sending && sendProgress && sendProgress.total > 1 && (
                <div className="tg-drawer__progress">
                  <div className="tg-drawer__progress-bar">
                    <div className="tg-drawer__progress-fill" style={{ width: `${(sendProgress.current / sendProgress.total) * 100}%` }} />
                  </div>
                  <span className="tg-drawer__progress-text">Отправлено {sendProgress.current} из {sendProgress.total}</span>
                </div>
              )}
              <button
                className="adm-btn adm-btn--primary tg-drawer__send"
                onClick={handleSend}
                disabled={sending || (isSingle && (overLimit || !editText.trim()))}
              >
                {sending
                  ? sendProgress && sendProgress.total > 1
                    ? `Отправка ${sendProgress.current}/${sendProgress.total}...`
                    : 'Отправка...'
                  : isSingle
                    ? '📤 Отправить в Telegram'
                    : `📤 Отправить ${previews.length} пост(ов)`}
              </button>
              {result && (
                <div className={`tg-msg tg-msg--${result.type}`}>{result.text}</div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
