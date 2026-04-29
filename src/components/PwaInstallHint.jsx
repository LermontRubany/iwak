import { useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'iwak_pwa_hint_dismissed';

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
    if (isStandalone()) return;
    if (!forceVisible && !isIosDevice()) return;
    if (!forceVisible && window.localStorage.getItem(STORAGE_KEY) === '1') return;

    const timer = window.setTimeout(() => setVisible(true), forceVisible ? 250 : 1400);
    return () => window.clearTimeout(timer);
  }, [forceVisible]);

  const handleClose = () => {
    window.localStorage.setItem(STORAGE_KEY, '1');
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
