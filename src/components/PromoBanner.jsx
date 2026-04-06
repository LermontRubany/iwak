import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

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

export default function PromoBanner() {
  const [cfg, setCfg] = useState(getCached);
  const fetchedRef = useRef(false);
  const location = useLocation();

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    const cached = getCached();
    if (cached) { setCfg(cached); return; }
    fetch('/api/promo/config')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.config) { setCache(d.config); setCfg(d.config); } })
      .catch(() => {});
  }, []);

  if (!cfg || !cfg.enabled || !cfg.text) return null;

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
       target="_blank" rel="noopener noreferrer">
      {content}
    </a>
  ) : (
    <div className="promo-banner__inner" style={bannerStyle}>
      {content}
    </div>
  );

  return (
    <div className="promo-banner">
      {inner}
    </div>
  );
}
