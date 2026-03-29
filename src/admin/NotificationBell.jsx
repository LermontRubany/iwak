import { useState, useRef, useEffect } from 'react';
import { useNotifications } from '../context/NotificationsContext';

const TYPE_ICON = { error: '✕', success: '✓', info: 'ℹ', system: '⚙' };
const TYPE_CLASS = { error: 'ntf--error', success: 'ntf--success', info: 'ntf--info', system: 'ntf--system' };

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'только что';
  if (s < 3600) return `${Math.floor(s / 60)} мин назад`;
  if (s < 86400) return `${Math.floor(s / 3600)} ч назад`;
  return new Date(ts).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function NotificationBell() {
  const { events, toasts, unreadCount, hasUnreadErrors, markAllRead, clearAll, dismissToast } = useNotifications();
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handle = (e) => { if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', handle);
    return () => document.removeEventListener('pointerdown', handle);
  }, [open]);

  const toggle = () => {
    setOpen((v) => !v);
    if (!open && unreadCount > 0) markAllRead();
  };

  return (
    <>
      {/* ── Bell icon ── */}
      <button className="ntf-bell" onClick={toggle} aria-label="Уведомления">
        <svg className="ntf-bell__icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {unreadCount > 0 && (
          <span className={`ntf-bell__badge${hasUnreadErrors ? ' ntf-bell__badge--error' : ''}`}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* ── Dropdown panel ── */}
      {open && (
        <div className="ntf-panel" ref={panelRef}>
          <div className="ntf-panel__header">
            <span className="ntf-panel__title">Уведомления</span>
            <div className="ntf-panel__actions">
              {events.length > 0 && (
                <button className="ntf-panel__btn" onClick={clearAll}>Очистить</button>
              )}
            </div>
          </div>
          <div className="ntf-panel__list">
            {events.length === 0 && (
              <div className="ntf-panel__empty">Нет уведомлений</div>
            )}
            {events.map((ev) => (
              <div key={ev.id} className={`ntf-item ${TYPE_CLASS[ev.type] || ''}`}>
                <span className="ntf-item__icon">{TYPE_ICON[ev.type] || '•'}</span>
                <div className="ntf-item__body">
                  <span className="ntf-item__msg">{ev.message}</span>
                  <span className="ntf-item__time">{timeAgo(ev.timestamp)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Toast stack ── */}
      {toasts.length > 0 && (
        <div className="ntf-toasts">
          {toasts.map((t) => (
            <div key={t.id} className={`ntf-toast ${TYPE_CLASS[t.type] || ''}`} onClick={() => dismissToast(t.id)}>
              <span className="ntf-toast__icon">{TYPE_ICON[t.type]}</span>
              <span className="ntf-toast__msg">{t.message}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
