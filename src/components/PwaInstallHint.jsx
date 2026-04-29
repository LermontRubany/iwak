import { useEffect, useMemo, useState } from 'react';
import { track } from '../utils/tracker';

const STORAGE_KEY = 'iwak_pwa_hint_dismissed';
const OPENED_KEY = 'iwak_pwa_opened_tracked';
const INSTALL_KEY = 'iwak_pwa_install_detected';
const DISMISS_MS = 14 * 24 * 60 * 60 * 1000;

function isIosDevice() {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone;
}

export default function PwaInstallHint() {
  const [visible, setVisible] = useState(false);
  const forceVisible = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('pwaHint') === '1';
  }, []);

  useEffect(() => {
    if (isStandalone()) {
      if (!sessionStorage.getItem(OPENED_KEY)) {
        sessionStorage.setItem(OPENED_KEY, '1');
        track('pwa_opened', { source: 'standalone' });
      }
      if (!window.localStorage.getItem(INSTALL_KEY)) {
        window.localStorage.setItem(INSTALL_KEY, '1');
        track('pwa_install_detected', { source: 'standalone' });
      }
    }

    if (isStandalone()) return;
    if (!forceVisible && !isIosDevice()) return;
    if (!forceVisible) {
      const dismissedAt = parseInt(window.localStorage.getItem(STORAGE_KEY) || '0', 10);
      if (dismissedAt && Date.now() - dismissedAt < DISMISS_MS) return;
    }

    const timer = window.setTimeout(() => {
      setVisible(true);
      if (!forceVisible) track('pwa_hint_shown', { forced: false });
    }, forceVisible ? 250 : 1400);
    return () => window.clearTimeout(timer);
  }, [forceVisible]);

  const handleClose = () => {
    window.localStorage.setItem(STORAGE_KEY, String(Date.now()));
    if (!forceVisible) track('pwa_hint_closed');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="pwa-install-hint" role="dialog" aria-label="Добавить IWAK на экран Домой">
      <div className="pwa-install-hint__icon">
        <img src="/icons/apple-touch-icon.png" alt="" />
      </div>
      <div className="pwa-install-hint__content">
        <div className="pwa-install-hint__title">IWAK как приложение</div>
        <div className="pwa-install-hint__text">
          На iPhone нажмите <span>Поделиться</span>, затем <span>На экран «Домой»</span>.
        </div>
      </div>
      <button className="pwa-install-hint__close" type="button" onClick={handleClose} aria-label="Закрыть подсказку">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <line x1="1" y1="1" x2="11" y2="11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          <line x1="11" y1="1" x2="1" y2="11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
