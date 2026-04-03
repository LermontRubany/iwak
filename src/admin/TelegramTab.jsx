import { useState, useEffect, useCallback } from 'react';
import { useProducts } from '../context/ProductsContext';

function getToken() {
  return localStorage.getItem('iwak_admin_token');
}

function renderTgMarkdown(text) {
  return text.split('\n').map((line, i) => {
    const parts = [];
    let last = 0;
    // Links: [text](url), Bold: *text*, Strike: ~text~
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

export default function TelegramTab() {
  const { products } = useProducts();

  // ── Config state ──
  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [configured, setConfigured] = useState(false);
  const [masked, setMasked] = useState('');
  const [configSaving, setConfigSaving] = useState(false);
  const [configMsg, setConfigMsg] = useState(null);

  // ── Preview / Send state ──
  const [selectedId, setSelectedId] = useState('');
  const [preview, setPreview] = useState(null);
  const [editText, setEditText] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);

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
      // Refresh masked value
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

  // ── Load preview ──
  const handlePreview = useCallback(async () => {
    if (!selectedId) return;
    setPreviewLoading(true);
    setPreview(null);
    setSendResult(null);
    try {
      const res = await fetch(`/api/tg/preview/${selectedId}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error();
      const json = await res.json();
      setPreview(json);
      setEditText(json.text);
    } catch {
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  }, [selectedId]);

  // ── Send ──
  const handleSend = useCallback(async () => {
    if (!preview) return;
    setSending(true);
    setSendResult(null);
    try {
      const body = { productId: parseInt(selectedId) };
      if (editText !== preview.text) body.text = editText;
      const res = await fetch('/api/tg/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setSendResult({ type: 'ok', text: 'Отправлено в Telegram' });
      } else {
        setSendResult({ type: 'error', text: json.error || json.details || 'Ошибка' });
      }
    } catch {
      setSendResult({ type: 'error', text: 'Ошибка отправки' });
    } finally {
      setSending(false);
    }
  }, [preview, selectedId, editText]);

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
          <button
            className="adm-btn adm-btn--accent adm-btn--sm"
            onClick={handleSaveConfig}
            disabled={configSaving}
          >
            {configSaving ? 'Сохранение...' : 'Сохранить'}
          </button>
          {configMsg && (
            <div className={`tg-msg tg-msg--${configMsg.type}`}>{configMsg.text}</div>
          )}
        </div>
      </div>

      {/* ── Preview + Send ── */}
      <div className="tg-section">
        <h3 className="tg-section__title">Отправка товара</h3>
        {!configured && (
          <div className="tg-empty">Сначала настройте Telegram</div>
        )}
        {configured && (
          <div className="tg-send">
            <div className="tg-send__row">
              <select
                className="adm-input tg-select"
                value={selectedId}
                onChange={e => { setSelectedId(e.target.value); setPreview(null); setEditText(''); setSendResult(null); }}
              >
                <option value="">Выберите товар</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.brand ? `${p.brand} — ` : ''}{p.name}</option>
                ))}
              </select>
              <button
                className="adm-btn adm-btn--accent adm-btn--sm"
                onClick={handlePreview}
                disabled={!selectedId || previewLoading}
              >
                {previewLoading ? '...' : 'Preview'}
              </button>
            </div>

            {preview && (
              <div className="tg-preview">
                <div className="tg-preview__text">{renderTgMarkdown(editText)}</div>
                {preview.photos.length > 0 && (
                  <div className="tg-preview__photos">
                    {preview.photos.map((src, i) => (
                      <img key={i} src={src} alt="" className="tg-preview__img" />
                    ))}
                  </div>
                )}
                <label className="tg-label">Текст поста</label>
                <textarea
                  className="adm-input tg-textarea"
                  value={editText}
                  onChange={e => setEditText(e.target.value)}
                  rows={8}
                />
                {editText !== preview.text && (
                  <button
                    className="adm-btn adm-btn--sm tg-reset-btn"
                    onClick={() => setEditText(preview.text)}
                  >
                    ← Сбросить к шаблону
                  </button>
                )}
                <button
                  className="adm-btn adm-btn--accent"
                  onClick={handleSend}
                  disabled={sending || !editText.trim()}
                >
                  {sending ? 'Отправка...' : '📤 Отправить в Telegram'}
                </button>
                {sendResult && (
                  <div className={`tg-msg tg-msg--${sendResult.type}`}>{sendResult.text}</div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
