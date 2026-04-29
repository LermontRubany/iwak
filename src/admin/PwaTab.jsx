import { useCallback, useEffect, useState } from 'react';
import authFetch from './authFetch';

function fmtDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function PwaTab() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({
    title: 'IWAK',
    body: 'Новый дроп уже на сайте',
    url: '/catalog',
  });

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/push/stats');
      if (!res.ok) throw new Error(res.status);
      setStats(await res.json());
    } catch {
      setMessage('Не удалось загрузить push-статистику');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  const sendTest = async () => {
    if (!window.confirm('Отправить тестовый push на последнее подписанное устройство?')) return;
    setSending(true);
    setMessage('');
    try {
      const res = await authFetch('/api/push/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, sendAll: false }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Ошибка отправки');
      setMessage(`Готово: отправлено ${body.sent}, ошибок ${body.failed}`);
      loadStats();
    } catch (err) {
      setMessage(err.message || 'Ошибка отправки push');
    } finally {
      setSending(false);
    }
  };

  const active = Number(stats?.active || 0);

  return (
    <div className="adm-body pwa-admin">
      <div className="pwa-admin__hero">
        <div>
          <span className="pwa-admin__eyebrow">PWA</span>
          <h2>Приложение и push</h2>
          <p>Счётчик подписок и безопасная тестовая отправка. Массовую рассылку включим отдельным этапом, когда проверим доставку.</p>
        </div>
        <button className="adm-btn adm-btn--ghost" type="button" onClick={loadStats} disabled={loading}>
          ОБНОВИТЬ
        </button>
      </div>

      <div className="pwa-admin__stats">
        <div className="pwa-admin__card">
          <span>{active}</span>
          <p>Активных подписок</p>
        </div>
        <div className="pwa-admin__card">
          <span>{Number(stats?.ios || 0)}</span>
          <p>iOS</p>
        </div>
        <div className="pwa-admin__card">
          <span>{Number(stats?.android || 0)}</span>
          <p>Android</p>
        </div>
        <div className="pwa-admin__card">
          <span>{Number(stats?.disabled || 0)}</span>
          <p>Отключены</p>
        </div>
      </div>

      <div className="pwa-admin__panel">
        <div className="pwa-admin__panel-head">
          <h3>Тестовое уведомление</h3>
          <span>Отправляется только на последнее подписанное устройство</span>
        </div>
        <label className="adm-label">
          Заголовок
          <input className="adm-input" value={form.title} onChange={(e) => setForm((v) => ({ ...v, title: e.target.value }))} />
        </label>
        <label className="adm-label">
          Текст
          <input className="adm-input" value={form.body} onChange={(e) => setForm((v) => ({ ...v, body: e.target.value }))} />
        </label>
        <label className="adm-label">
          Ссылка после клика
          <input className="adm-input" value={form.url} onChange={(e) => setForm((v) => ({ ...v, url: e.target.value }))} />
        </label>
        <button className="adm-btn adm-btn--primary" type="button" onClick={sendTest} disabled={sending || active === 0}>
          {sending ? 'ОТПРАВЛЯЕМ...' : 'ОТПРАВИТЬ ТЕСТ'}
        </button>
        {message && <div className="pwa-admin__message">{message}</div>}
      </div>

      <div className="pwa-admin__meta">
        <span>Всего подписок: {Number(stats?.total || 0)}</span>
        <span>Последняя активность: {fmtDate(stats?.last_seen_at)}</span>
        <span>Последняя отправка: {fmtDate(stats?.last_sent_at)}</span>
      </div>
    </div>
  );
}
