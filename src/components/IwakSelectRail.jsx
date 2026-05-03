import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { track } from '../utils/tracker';

const CACHE_KEY = 'iwak_promo_cfg';
const CACHE_TTL = 5 * 60 * 1000;
const DEFAULT_SELECT_PALETTE = {
  titleColor: '#ffffff',
  subtitleColor: 'rgba(255,255,255,0.80)',
};

const DEV_SELECT_CONFIG = {
  iwakSelect: {
    enabled: true,
    title: 'IWAK SELECT',
    subtitle: 'быстрые подборки',
    cards: [
      { id: 'sale', active: true, title: 'Скидки', subtitle: 'до -46%', link: '/catalog?sale=true', image: '' },
      { id: 'catalog-plus', active: true, title: 'Каталог+', subtitle: 'подбор', link: '/catalog?catalogPlus=1', image: '' },
      { id: 'nike', active: true, title: 'Nike', subtitle: 'в наличии', link: '/catalog?brand=nike', image: '' },
      { id: 'vans', active: true, title: 'Vans', subtitle: 'classic', link: '/catalog?brand=vans', image: '' },
      { id: 'women', active: true, title: 'Женское', subtitle: 'street', link: '/catalog?gender=womens', image: '' },
      { id: 'men', active: true, title: 'Мужское', subtitle: 'fit', link: '/catalog?gender=mens', image: '' },
    ],
  },
};

function isLocalDev() {
  if (!import.meta.env.DEV || typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.startsWith('192.168.') ||
    host.startsWith('10.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  );
}

function getCached() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) {
      sessionStorage.removeItem(CACHE_KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function setCache(data) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
  } catch {}
}

function getInitials(title = '') {
  return String(title)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase() || 'I';
}

function pickColor(value, fallback) {
  const text = String(value || '').trim();
  if (!text) return fallback;
  if (/^#[0-9a-fA-F]{6}$/.test(text)) return text;
  if (/^rgba?\(/i.test(text)) return text;
  return fallback;
}

function getStoryPresentation(rawOffset, stageWidth = 390) {
  const clamped = Math.max(-3, Math.min(3, rawOffset));
  const abs = Math.abs(clamped);
  const side = clamped < 0 ? -1 : 1;
  const nearX = Math.min(108, stageWidth * 0.255);
  const farStep = Math.min(78, stageWidth * 0.185);
  const easedNear = abs <= 1 ? Math.pow(abs, 0.86) : 1;
  const x = side * (abs <= 1 ? easedNear * nearX : nearX + (abs - 1) * farStep);
  const y = abs <= 1 ? easedNear * 17 : 17 + (abs - 1) * 12;
  const scale = abs <= 1
    ? 1 - easedNear * 0.2
    : Math.max(0.58, 0.8 - Math.min(abs - 1, 1.4) * 0.2);
  const opacity = abs > 2.65 ? 0 : Math.max(0.58, 1 - Math.max(0, abs - 0.15) * 0.16);
  const zIndex = Math.max(1, 20 - Math.round(abs * 4));
  const brightness = Math.max(0.72, 1 - Math.max(0, abs - 0.1) * 0.12);

  return { abs, x, y, scale, opacity, zIndex, brightness };
}

function getInitialStoryStyle(rawOffset) {
  const stageWidth = typeof window !== 'undefined' ? Math.min(520, window.innerWidth || 390) : 390;
  const p = getStoryPresentation(rawOffset, stageWidth);
  return {
    '--story-x': `${p.x}px`,
    '--story-y': `${p.y}px`,
    '--story-scale': p.scale,
    opacity: p.opacity,
    zIndex: p.zIndex,
    filter: `brightness(${p.brightness}) saturate(${Math.max(0.9, 1 - p.abs * 0.025)})`,
    pointerEvents: p.abs > 2.4 ? 'none' : undefined,
  };
}

function getStoryElementFromTarget(target) {
  if (!target) return null;
  if (target instanceof Element) return target.closest('.iwak-select__story');
  if (target.nodeType === Node.TEXT_NODE) return target.parentElement?.closest('.iwak-select__story') || null;
  return null;
}

export default function IwakSelectRail({ hidden = false }) {
  const [cfg, setCfg] = useState(() => getCached() || (isLocalDev() ? DEV_SELECT_CONFIG : null));
  const fetchedRef = useRef(false);
  const stageRef = useRef(null);
  const storyRefs = useRef([]);
  const pointerRef = useRef(null);
  const touchActiveRef = useRef(false);
  const suppressClickRef = useRef(false);
  const activeIndexRef = useRef(0);
  const rafRef = useRef(0);
  const dragProgressRef = useRef(0);
  const draggingRef = useRef(false);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    const cached = getCached();
    if (cached) {
      setCfg(cached);
      return;
    }
    fetch('/api/promo/config')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.config) {
          setCache(data.config);
          setCfg(data.config);
        }
      })
      .catch(() => {
        if (isLocalDev()) setCfg(DEV_SELECT_CONFIG);
      });
  }, []);

  useEffect(() => {
    const onUpdate = () => {
      fetch('/api/promo/config')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.config) {
            setCache(data.config);
            setCfg(data.config);
          }
        })
        .catch(() => {});
    };
    window.addEventListener('promo-updated', onUpdate);
    return () => window.removeEventListener('promo-updated', onUpdate);
  }, []);

  const select = cfg?.iwakSelect;
  const cards = useMemo(() => {
    const raw = Array.isArray(select?.cards) ? select.cards : [];
    return raw
      .filter((card) => card && card.active !== false && card.title && card.link)
      .slice(0, 10);
  }, [select]);
  const palette = useMemo(() => {
    const raw = select?.palette && typeof select.palette === 'object' ? select.palette : {};
    return {
      titleColor: pickColor(raw.titleColor, DEFAULT_SELECT_PALETTE.titleColor),
      subtitleColor: pickColor(raw.subtitleColor, DEFAULT_SELECT_PALETTE.subtitleColor),
    };
  }, [select]);

  useEffect(() => {
    if (activeIndex > cards.length - 1) setActiveIndex(0);
  }, [activeIndex, cards.length]);

  const getCircularOffset = useCallback((index, currentIndex = activeIndexRef.current) => {
    if (cards.length <= 1) return 0;
    let diff = index - currentIndex;
    const half = cards.length / 2;
    if (diff > half) diff -= cards.length;
    if (diff < -half) diff += cards.length;
    return Math.max(-3, Math.min(3, diff));
  }, [cards.length]);

  const getFluidOffset = useCallback((index, virtualIndex = activeIndexRef.current) => {
    if (cards.length <= 1) return 0;
    let diff = index - virtualIndex;
    const half = cards.length / 2;
    while (diff > half) diff -= cards.length;
    while (diff < -half) diff += cards.length;
    return diff;
  }, [cards.length]);

  const positionStories = useCallback((progress = 0, dragging = false) => {
    const width = stageRef.current?.clientWidth || 390;
    const virtualIndex = activeIndexRef.current - progress;

    storyRefs.current.forEach((node, index) => {
      if (!node) return;
      const rawOffset = dragging
        ? getFluidOffset(index, virtualIndex)
        : getCircularOffset(index);
      const p = getStoryPresentation(rawOffset, width);
      const visible = p.abs <= 2.65;

      node.style.transition = dragging ? 'none' : '';
      node.style.setProperty('--story-x', `${p.x}px`);
      node.style.setProperty('--story-y', `${p.y}px`);
      node.style.setProperty('--story-scale', String(p.scale));
      node.style.opacity = visible ? String(p.opacity) : '0';
      node.style.zIndex = visible ? String(p.zIndex) : '1';
      node.style.filter = dragging ? '' : `brightness(${p.brightness}) saturate(${Math.max(0.9, 1 - p.abs * 0.025)})`;
      node.style.pointerEvents = p.abs > 2.4 ? 'none' : '';
    });
  }, [getCircularOffset, getFluidOffset]);

  const schedulePositionStories = useCallback((progress = dragProgressRef.current, dragging = draggingRef.current) => {
    dragProgressRef.current = progress;
    draggingRef.current = dragging;
    if (rafRef.current) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = 0;
      positionStories(dragProgressRef.current, draggingRef.current);
    });
  }, [positionStories]);

  useEffect(() => {
    activeIndexRef.current = activeIndex;
    schedulePositionStories(0, false);
  }, [activeIndex, cards.length, schedulePositionStories]);

  useEffect(() => {
    const onResize = () => schedulePositionStories(0, false);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
    };
  }, [schedulePositionStories]);

  const goTo = useCallback((nextIndex) => {
    if (cards.length === 0) return;
    const normalized = (nextIndex + cards.length) % cards.length;
    activeIndexRef.current = normalized;
    setActiveIndex(normalized);
    schedulePositionStories(0, false);
  }, [cards.length, schedulePositionStories]);

  const handlePointerDown = useCallback((event) => {
    if (touchActiveRef.current) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const story = getStoryElementFromTarget(event.target);
    if (!story?.classList.contains('iwak-select__story--active')) return;
    pointerRef.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      lastX: event.clientX,
      lastTime: performance.now(),
      velocityX: 0,
      dragging: false,
      captured: true,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }, []);

  const handlePointerMove = useCallback((event) => {
    if (touchActiveRef.current) return;
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    const deltaX = event.clientX - pointer.x;
    if (!pointer.dragging && Math.abs(deltaX) < 2) return;
    event.preventDefault();
    const now = performance.now();
    const dt = Math.max(1, now - pointer.lastTime);
    pointer.velocityX = (event.clientX - pointer.lastX) / dt;
    pointer.lastX = event.clientX;
    pointer.lastTime = now;
    pointer.dragging = true;
    suppressClickRef.current = true;
    const width = event.currentTarget.clientWidth || 390;
    const progress = Math.max(-1, Math.min(1, deltaX / (width * 0.22)));
    schedulePositionStories(progress, true);
  }, [schedulePositionStories]);

  const handlePointerUp = useCallback((event) => {
    if (touchActiveRef.current) return;
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    const deltaX = event.clientX - pointer.x;
    const deltaY = event.clientY - pointer.y;
    const velocityX = pointer.velocityX;
    const wasDragging = pointer.dragging;
    const wasCaptured = pointer.captured;
    pointerRef.current = null;
    if (wasCaptured) event.currentTarget.releasePointerCapture?.(event.pointerId);

    if (!wasDragging || (Math.abs(deltaX) < 42 && Math.abs(velocityX) < 0.48) || Math.abs(deltaX) < Math.abs(deltaY) * 1.1) {
      window.setTimeout(() => { suppressClickRef.current = false; }, 120);
      return;
    }

    event.preventDefault();
    const direction = deltaX < 0 || velocityX < -0.48 ? 1 : -1;
    goTo(activeIndex + direction);
    window.setTimeout(() => { suppressClickRef.current = false; }, 180);
  }, [activeIndex, goTo, schedulePositionStories]);

  const handlePointerCancel = useCallback((event) => {
    if (touchActiveRef.current) return;
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    pointerRef.current = null;
    if (pointer.captured) event.currentTarget.releasePointerCapture?.(event.pointerId);
    schedulePositionStories(0, false);
    window.setTimeout(() => { suppressClickRef.current = false; }, 120);
  }, [schedulePositionStories]);

  const handleTouchStart = useCallback((event) => {
    const touch = event.touches?.[0];
    if (!touch) return;
    const story = getStoryElementFromTarget(event.target);
    if (!story?.classList.contains('iwak-select__story--active')) return;
    touchActiveRef.current = true;
    pointerRef.current = {
      id: 'touch',
      x: touch.clientX,
      y: touch.clientY,
      lastX: touch.clientX,
      lastY: touch.clientY,
      lastTime: performance.now(),
      velocityX: 0,
      dragging: false,
      captured: false,
    };
  }, []);

  const handleTouchMove = useCallback((event) => {
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== 'touch') return;
    const touch = event.touches?.[0];
    if (!touch) return;
    const deltaX = touch.clientX - pointer.x;
    if (!pointer.dragging && Math.abs(deltaX) < 2) return;
    event.preventDefault();
    const now = performance.now();
    const dt = Math.max(1, now - pointer.lastTime);
    pointer.velocityX = (touch.clientX - pointer.lastX) / dt;
    pointer.lastX = touch.clientX;
    pointer.lastY = touch.clientY;
    pointer.lastTime = now;
    pointer.dragging = true;
    suppressClickRef.current = true;
    const width = stageRef.current?.clientWidth || 390;
    const progress = Math.max(-1, Math.min(1, deltaX / (width * 0.22)));
    schedulePositionStories(progress, true);
  }, [schedulePositionStories]);

  const handleTouchEnd = useCallback(() => {
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== 'touch') {
      touchActiveRef.current = false;
      return;
    }
    const deltaX = pointer.lastX - pointer.x;
    const deltaY = (pointer.lastY ?? pointer.y) - pointer.y;
    const velocityX = pointer.velocityX;
    const wasDragging = pointer.dragging;
    pointerRef.current = null;
    touchActiveRef.current = false;

    if (!wasDragging || (Math.abs(deltaX) < 42 && Math.abs(velocityX) < 0.48) || Math.abs(deltaX) < Math.abs(deltaY) * 1.1) {
      window.setTimeout(() => { suppressClickRef.current = false; }, 120);
      return;
    }

    const direction = deltaX < 0 || velocityX < -0.48 ? 1 : -1;
    goTo(activeIndex + direction);
    window.setTimeout(() => { suppressClickRef.current = false; }, 180);
  }, [activeIndex, goTo]);

  const handleTouchCancel = useCallback(() => {
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== 'touch') {
      touchActiveRef.current = false;
      return;
    }
    pointerRef.current = null;
    touchActiveRef.current = false;
    schedulePositionStories(0, false);
    window.setTimeout(() => { suppressClickRef.current = false; }, 120);
  }, [schedulePositionStories]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const onStart = (event) => handleTouchStart(event);
    const onMove = (event) => handleTouchMove(event);
    const onEnd = () => handleTouchEnd();
    const onCancel = () => handleTouchCancel();

    stage.addEventListener('touchstart', onStart, { passive: false });
    stage.addEventListener('touchmove', onMove, { passive: false });
    stage.addEventListener('touchend', onEnd, { passive: false });
    stage.addEventListener('touchcancel', onCancel, { passive: false });

    return () => {
      stage.removeEventListener('touchstart', onStart);
      stage.removeEventListener('touchmove', onMove);
      stage.removeEventListener('touchend', onEnd);
      stage.removeEventListener('touchcancel', onCancel);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd, handleTouchCancel]);

  if (hidden || !select?.enabled || cards.length === 0) return null;

  return (
    <section className="iwak-select" aria-label={select.title || 'Быстрые подборки'}>
      <div
        ref={stageRef}
        className="iwak-select__stage"
        aria-label="Разделы IWAK"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        {cards.map((card, index) => {
          const title = String(card.title || '').trim();
          const subtitle = String(card.subtitle || card.meta || '').trim();
          const link = String(card.link || '/catalog').trim();
          const image = String(card.image || '').trim();
          const titleColor = pickColor(card.titleColor, palette.titleColor);
          const subtitleColor = pickColor(card.subtitleColor, palette.subtitleColor);
          const offset = getCircularOffset(index, activeIndex);
          const absOffset = Math.abs(offset);
          const isActive = absOffset < 0.18;
          const storyContent = (
            <>
              <span className="iwak-select__story-media">
                {image ? (
                  <img src={image} alt="" loading={index < 6 ? 'eager' : 'lazy'} decoding="async" draggable="false" />
                ) : (
                  <span>{getInitials(title)}</span>
                )}
              </span>
              <span className="iwak-select__story-shade" />
              <span className="iwak-select__story-copy">
                <b style={{ color: titleColor }}>{title}</b>
                {subtitle ? <small style={{ color: subtitleColor }}>{subtitle}</small> : null}
              </span>
            </>
          );
          if (!isActive) {
            return (
              <div
                key={card.id || `${title}-${index}`}
                ref={(node) => { storyRefs.current[index] = node; }}
                className="iwak-select__story"
                style={getInitialStoryStyle(offset)}
                aria-hidden={absOffset > 2}
              >
                {storyContent}
              </div>
            );
          }
          return (
            <button
              key={card.id || `${title}-${index}`}
              ref={(node) => { storyRefs.current[index] = node; }}
              className="iwak-select__story iwak-select__story--active"
              style={getInitialStoryStyle(offset)}
              type="button"
              draggable="false"
              aria-hidden={absOffset > 2}
              onClick={(event) => {
                if (suppressClickRef.current) {
                  return;
                }
                track('promo_click', { position: 'top_dock', text: title, link });
                window.location.href = link;
              }}
            >
              {storyContent}
            </button>
          );
        })}
        <div className="iwak-select__dots" aria-hidden="true">
          {cards.slice(0, 10).map((card, index) => (
            <span key={card.id || index} className={index === activeIndex ? 'is-active' : ''} />
          ))}
        </div>
      </div>
    </section>
  );
}
