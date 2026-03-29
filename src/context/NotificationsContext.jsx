import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';

const NotificationsContext = createContext(null);

const MAX_EVENTS = 50;
let _globalNotify = null;

// ── Вызов из-за пределов React (apiFetch) ──
export function notifyGlobal(type, message) {
  if (_globalNotify) _globalNotify(type, message);
}

export function NotificationsProvider({ children }) {
  const [events, setEvents] = useState([]);
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const notify = useCallback((type, message) => {
    const ev = { id: ++idRef.current, type, message, timestamp: Date.now(), read: false };
    setEvents((prev) => [ev, ...prev].slice(0, MAX_EVENTS));
    // toast — auto-dismiss after 3.5s
    setToasts((prev) => [...prev, ev]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== ev.id)), 3500);
  }, []);

  // Register global bridge
  useEffect(() => { _globalNotify = notify; return () => { _globalNotify = null; }; }, [notify]);

  // ── Online / Offline ──
  useEffect(() => {
    const onOnline = () => notify('system', 'Соединение восстановлено');
    const onOffline = () => notify('error', 'Нет соединения с интернетом');
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, [notify]);

  const unreadCount = events.filter((e) => !e.read).length;
  const hasUnreadErrors = events.some((e) => !e.read && e.type === 'error');

  const markAllRead = useCallback(() => {
    setEvents((prev) => prev.map((e) => e.read ? e : { ...e, read: true }));
  }, []);

  const clearAll = useCallback(() => { setEvents([]); }, []);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <NotificationsContext.Provider value={{ events, toasts, notify, unreadCount, hasUnreadErrors, markAllRead, clearAll, dismissToast }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationsContext);
}
