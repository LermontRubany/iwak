import { useEffect, useMemo, useState } from 'react';
import { track } from '../utils/tracker';

const DISMISSED_KEY = 'iwak_push_prompt_dismissed';
const SUBSCRIBED_KEY = 'iwak_push_subscribed';
const SESSION_KEY = 'iwak_sid';
const DISMISS_MS = 5 * 24 * 60 * 60 * 1000;

function isStandalone() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone;
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

async function getExistingSubscription() {
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

export default function PwaPushPrompt() {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const forceVisible = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('pushPrompt') === '1';
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;
    if (Notification.permission === 'denied') return;
    if (!forceVisible && !isStandalone()) return;
    if (!forceVisible && window.localStorage.getItem(SUBSCRIBED_KEY) === '1') return;

    const dismissedAt = parseInt(window.localStorage.getItem(DISMISSED_KEY) || '0', 10);
    if (!forceVisible && dismissedAt && Date.now() - dismissedAt < DISMISS_MS) return;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const existing = await getExistingSubscription();
        if (existing) {
          window.localStorage.setItem(SUBSCRIBED_KEY, '1');
          return;
        }
      } catch {
        return;
      }
      if (!cancelled) {
        setVisible(true);
        if (!forceVisible) track('pwa_push_prompt_shown');
      }
    }, forceVisible ? 400 : 2600);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [forceVisible]);

  const close = () => {
    window.localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    setVisible(false);
  };

  const subscribe = async () => {
    setBusy(true);
    setError('');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        track('pwa_push_denied');
        close();
        return;
      }

      const [{ publicKey }, registration] = await Promise.all([
        fetch('/api/push/public-key').then((r) => {
          if (!r.ok) throw new Error('key');
          return r.json();
        }),
        navigator.serviceWorker.ready,
      ]);

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      const sessionId = window.sessionStorage.getItem(SESSION_KEY) || null;
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription, sessionId }),
      });
      if (!res.ok) throw new Error('save');

      window.localStorage.setItem(SUBSCRIBED_KEY, '1');
      track('pwa_push_subscribed');
      setVisible(false);
    } catch {
      setError('Не получилось включить. Попробуйте позже.');
    } finally {
      setBusy(false);
    }
  };

  if (!visible) return null;

  return (
    <div className="pwa-push-prompt" role="dialog" aria-label="Уведомления IWAK">
      <button className="pwa-push-prompt__close" type="button" onClick={close} aria-label="Закрыть">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <line x1="1" y1="1" x2="11" y2="11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          <line x1="11" y1="1" x2="1" y2="11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </button>
      <div className="pwa-push-prompt__eyebrow">IWAK DROP ALERT</div>
      <div className="pwa-push-prompt__title">Дропы и скидки раньше всех</div>
      <div className="pwa-push-prompt__text">Сообщим только о важном: новые поступления, скидки и редкие позиции.</div>
      {error && <div className="pwa-push-prompt__error">{error}</div>}
      <button className="pwa-push-prompt__action" type="button" onClick={subscribe} disabled={busy}>
        {busy ? 'ВКЛЮЧАЕМ...' : 'ВКЛЮЧИТЬ'}
      </button>
    </div>
  );
}
