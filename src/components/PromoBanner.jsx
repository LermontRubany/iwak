import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { track } from '../utils/tracker';

const CACHE_KEY = 'iwak_promo_cfg';
const CACHE_TTL = 5 * 60 * 1000; // 5 min

function getCached() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) { sessionStorage.removeItem(CACHE_KEY); return null; }
    return data;
  } catch { return null; }
}
function setCache(data) {
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data })); } catch {}
}

function isHexColor(value) {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}

function applyCatalogTheme(theme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const saleColor = isHexColor(theme?.saleColor) ? theme.saleColor : '#d32f2f';
  const badgeBg = isHexColor(theme?.badgeBg) ? theme.badgeBg : saleColor;
  const badgeText = isHexColor(theme?.badgeText) ? theme.badgeText : '#ffffff';
  root.style.setProperty('--iwak-sale-color', saleColor);
  root.style.setProperty('--iwak-sale-badge-bg', badgeBg);
  root.style.setProperty('--iwak-sale-badge-text', badgeText);
}

export default function PromoBanner({ position = 'bottom' }) {
  const [cfg, setCfg] = useState(getCached);
  const fetchedRef = useRef(false);
  const location = useLocation();

  const refetch = useCallback(() => {
    fetch('/api/promo/config')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.config) { setCache(d.config); setCfg(d.config); } })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    const cached = getCached();
    if (cached) { setCfg(cached); return; }
    refetch();
  }, [refetch]);

  useEffect(() => {
    const onUpdate = () => refetch();
    const onFocus = () => { if (!getCached()) refetch(); };
    window.addEventListener('promo-updated', onUpdate);
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('promo-updated', onUpdate);
      window.removeEventListener('focus', onFocus);
    };
  }, [refetch]);

  useEffect(() => {
    applyCatalogTheme(cfg?.catalogTheme);
  }, [cfg]);

  if (!cfg || !cfg.enabled || !cfg.text) return null;

  // Only render for the matching position
  const cfgPosition = cfg.position || 'bottom';
  if (cfgPosition !== position) return null;

  // Page filtering: if pages array is non-empty, check current path
  if (Array.isArray(cfg.pages) && cfg.pages.length > 0) {
    const path = location.pathname;
    const match = cfg.pages.some(p => {
      if (p === '/catalog') return path === '/catalog' || path === '/';
      if (p === '/product') return path.startsWith('/product/');
      if (p === '/cart') return path === '/cart';
      return path === p || path.startsWith(p + '/');
    });
    if (!match) return null;
  }

  const bannerStyle = {
    backgroundColor: cfg.backgroundColor || '#000',
    color: cfg.textColor || '#fff',
    fontSize: cfg.fontSize ? `${cfg.fontSize}px` : '14px',
    fontWeight: cfg.fontWeight || '600',
    borderRadius: cfg.borderRadius ? `${cfg.borderRadius}px` : '12px',
    padding: cfg.padding ? `${cfg.padding}px ${cfg.padding * 1.5}px` : '10px 16px',
    maxWidth: cfg.maxWidth ? `${cfg.maxWidth}px` : '480px',
  };

  const content = (
    <span>
      {cfg.emoji ? <span style={{ marginRight: 6 }}>{cfg.emoji}</span> : null}
      {cfg.text}
    </span>
  );

  const inner = cfg.link ? (
    <a href={cfg.link} className="promo-banner__inner" style={bannerStyle}
       target="_blank" rel="noopener noreferrer"
       onClick={() => track('promo_click', { position, text: cfg.text, link: cfg.link })}>
      {content}
    </a>
  ) : (
    <div className="promo-banner__inner" style={bannerStyle}>
      {content}
    </div>
  );

  return (
    <div className={`promo-banner promo-banner--${position}`}>
      {inner}
    </div>
  );
}
