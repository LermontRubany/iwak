import { useState, useEffect, useCallback } from 'react';

function getToken() {
  return localStorage.getItem('iwak_admin_token');
}

function renderTgMarkdown(text) {
  return text.split('\n').map((line, i) => {
    const parts = [];
    let last = 0;
    const re = /\[([^\]]+)\]\(([^)]+)\)|\*(.*?)\*|~(.*?)~/g;
    let m;
    while ((m = re.exec(line)) !== null) {
      if (m.index > last) parts.push(line.slice(last, m.index));
      if (m[1] != null) parts.push(<a key={`${i}-${m.index}`} href={m[2]} target="_blank" rel="noreferrer" className="tg-link">{m[1]}</a>);
      else if (m[3] != null) parts.push(<strong key={`${i}-${m.index}`}>{m[3]}</strong>);
      else if (m[4] != null) parts.push(<s key={`${i}-${m.index}`}>{m[4]}</s>);
      last = re.lastIndex;
    }
    if (last < line.length) parts.push(line.slice(last));
    return <div key={i}>{parts.length > 0 ? parts : '\u00A0'}</div>;
  });
}

const TEMPLATES = [
  { id: 'basic', label: 'Базовый' },
  { id: 'new',   label: '🆕 Новинка' },
  { id: 'sale',  label: '🔥 Скидка' },
];

export default function TgDrawer({ productIds, onClose, onSent }) {
  const [template, setTemplate] = useState('basic');
  const [previews, setPreviews] = useState([]); // [{text, photos, url, product}]
  const [activeIdx, setActiveIdx] = useState(0);
  const [editText, setEditText] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState(null); // "2/5"
  const [result, setResult] = useState(null); // {type, text}

  // Load previews when productIds or template changes
  useEffect(() => {
    if (!productIds || productIds.length === 0) return;
    let cancelled = false;
    setLoading(true);
    setResult(null);
    setSendProgress(null);

    Promise.all(
      productIds.map(id =>
        fetch(`/api/tg/preview/${id}?template=${template}`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        }).then(r => r.ok ? r.json() : null)
      )
    ).then(results => {
      if (cancelled) return;
      const valid = results.filter(Boolean);
      setPreviews(valid);
      setActiveIdx(0);
      if (valid.length > 0) setEditText(valid[0].text);
      setLoading(false);
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [productIds, template]);

  // Sync editText when switching active product
  useEffect(() => {
    if (previews[activeIdx]) {
      setEditText(previews[activeIdx].text);
    }
  }, [activeIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSend = useCallback(async () => {
    if (previews.length === 0 || sending) return;
    setSending(true);
    setResult(null);

    let ok = 0;
    let fail = 0;
    const total = previews.length;

    for (let i = 0; i < total; i++) {
      const p = previews[i];
      setSendProgress({ current: i + 1, total });
      try {
        const body = { productId: p.product.id, template };
        // For single product, use edited text if changed
        if (total === 1 && editText !== p.text) {
          body.text = editText;
        }
        const res = await fetch('/api/tg/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (res.ok && json.ok) ok++;
        else fail++;
      } catch {
        fail++;
      }
    }

    setSending(false);
    setSendProgress(null);
    if (fail === 0) {
      setResult({ type: 'ok', text: total === 1 ? 'Отправлено в Telegram' : `Отправлено: ${ok} пост(ов)` });
      if (onSent) setTimeout(onSent, 1200);
    } else {
      setResult({ type: 'error', text: `Успешно: ${ok}, ошибок: ${fail}` });
    }
  }, [previews, sending, editText, template, onSent]);

  const current = previews[activeIdx];
  const isSingle = previews.length === 1;
  const limit = current && current.photos.length > 0 ? 1024 : 4096;
  const charLen = editText.length;
  const overLimit = charLen > limit;

  return (
    <>
      <div className="tg-drawer-overlay" onClick={onClose} />
      <div className="tg-drawer">
        <div className="tg-drawer__header">
          <span className="tg-drawer__title">
            {isSingle ? '📤 Telegram пост' : `📤 Отправка ${previews.length} товаров`}
          </span>
          <button className="tg-drawer__close" onClick={onClose}>✕</button>
        </div>

        {loading && <div className="tg-drawer__loading">Загрузка...</div>}

        {!loading && previews.length === 0 && (
          <div className="tg-drawer__empty">Не удалось загрузить товары</div>
        )}

        {!loading && current && (
          <div className="tg-drawer__body">
            {/* Template selector */}
            <div className="tg-drawer__templates">
              {TEMPLATES.map(t => (
                <button
                  key={t.id}
                  className={`adm-filter-chip${template === t.id ? ' adm-filter-chip--active' : ''}`}
                  onClick={() => setTemplate(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>

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

            {/* Preview */}
            <div className="tg-drawer__preview">
              {current.photos.length > 0 && (
                <div className="tg-drawer__photos">
                  {current.photos.slice(0, 4).map((src, i) => (
                    <img key={i} src={src} alt="" className="tg-drawer__photo" />
                  ))}
                  {current.photos.length > 4 && (
                    <span className="tg-drawer__more-photos">+{current.photos.length - 4}</span>
                  )}
                </div>
              )}
              <div className="tg-drawer__text-preview">
                {renderTgMarkdown(isSingle ? editText : current.text)}
              </div>
              <div className="tg-drawer__button-preview">
                <span className="tg-drawer__inline-btn">🛒 Купить</span>
              </div>
            </div>

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
