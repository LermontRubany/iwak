import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import { useProducts } from '../context/ProductsContext';
import { useCart } from '../context/CartContext';
import ProductCard from '../components/ProductCard';
import { idFromSlug, makeProductSlug } from '../utils/slug';
import sortSizes from '../utils/sortSizes';
import { track } from '../utils/tracker';
import { productDisplayName, stripBrandFromName } from '../utils/productDisplay';

function setMetaTag(attr, name, value) {
  const selector = `meta[${attr}="${name}"]`;
  let el = document.querySelector(selector);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', value);
}

export default function ProductPage() {

  const { slug } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { addItem } = useCart();
  const { products, loading } = useProducts();

  const [selectedSize, setSelectedSize] = useState(null);
  const [currentImage, setCurrentImage] = useState(0);
  const [added, setAdded] = useState(false);
  const [sizeShake, setSizeShake] = useState(false);
  const [copied, setCopied] = useState(false);
  const [lightboxIdx, setLightboxIdx] = useState(null);

  // Gallery scroll-snap ref
  const galleryRef = useRef(null);
  const saleTrackRef = useRef(null);
  const saleAutoFrameRef = useRef(null);
  const saleAutoLastTsRef = useRef(null);
  const saleAutoPauseUntilRef = useRef(0);

  // Track whether this is the initial mount (skip scroll on first open)
  const overlayRef = useRef(null);
  const prevSlugRef = useRef(slug);

  // Swipe-back refs
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const swiping = useRef(false);

  // Находим товар по id, закодированному в slug (slug = name-id)
  const productId = idFromSlug(slug);
  const productFromList = productId != null
    ? products.find((p) => String(p.id) === String(productId))
    : undefined;

  // ── Fallback: прямой запрос по ID если товар не найден в списке ──
  const [fallbackProduct, setFallbackProduct] = useState(null);
  const [fallbackLoading, setFallbackLoading] = useState(false);

  useEffect(() => {
    if (productFromList || loading || !productId) {
      setFallbackProduct(null);
      return;
    }
    let cancelled = false;
    setFallbackLoading(true);
    fetch(`/api/products/${productId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data && data.id != null) setFallbackProduct(data);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setFallbackLoading(false); });
    return () => { cancelled = true; };
  }, [productFromList, loading, productId]);

  const product = productFromList || fallbackProduct;

  // ── Sale carousel items ──
  const saleItems = useMemo(() => {
    if (!product) return [];
    const isSale = (p) => p.originalPrice && p.originalPrice > p.price;
    const discountPct = (p) => (p.originalPrice - p.price) / p.originalPrice;

    // Step 1: same category + sale
    const sameCat = products.filter(
      (p) => p.id !== product.id && p.category === product.category && isSale(p)
    );
    // Step 2: fallback — all sale items
    const picked = new Set(sameCat.map((p) => p.id));
    picked.add(product.id);
    const rest = sameCat.length < 7
      ? products.filter((p) => !picked.has(p.id) && isSale(p))
      : [];
    // Merge, sort by discount, take 7
    return [...sameCat, ...rest]
      .sort((a, b) => discountPct(b) - discountPct(a))
      .slice(0, 7);
  }, [products, product?.id, product?.category]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset on product change
  useEffect(() => {
    setCurrentImage(0);
    setSelectedSize(null);
    setAdded(false);
    setLightboxIdx(null);
    galleryRef.current?.scrollTo({ left: 0 });

    if (prevSlugRef.current !== slug) {
      prevSlugRef.current = slug;
      overlayRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [slug]);

  // Analytics: track product view
  useEffect(() => {
    if (product) track('product_view', { productId: product.id });
  }, [product?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // OG meta tags — обновляем при каждом открытии товара
  useEffect(() => {
    if (!product) return;
    const title = `${productDisplayName(product)} — IWAK`;
    const priceStr = product.originalPrice && product.originalPrice > product.price
      ? `₽${product.price.toLocaleString('ru-RU')} (было ₽${product.originalPrice.toLocaleString('ru-RU')})`
      : `₽${product.price.toLocaleString('ru-RU')}`;
    const description = `${priceStr} · Размеры: ${sortSizes(product.sizes).join(', ')}`;

    // og:image теперь всегда /og-image/:id
    const image = `${window.location.origin}/og-image/${product.id}`;
    const url = `${window.location.origin}/product/${makeProductSlug(product)}`;

    document.title = title;
    setMetaTag('property', 'og:title', title);
    setMetaTag('property', 'og:description', description);
    setMetaTag('property', 'og:image', image);
    setMetaTag('property', 'og:url', url);
    setMetaTag('property', 'og:type', 'product');
    setMetaTag('name', 'twitter:title', title);
    setMetaTag('name', 'twitter:description', description);
    setMetaTag('name', 'twitter:image', image);

    return () => {
      document.title = 'IWAK';
      setMetaTag('property', 'og:title', 'IWAK — Одежда и обувь');
      setMetaTag('property', 'og:description', 'Официальный интернет-магазин IWAK.');
    };
  }, [product]);

  // Track scroll position → update currentImage
  useEffect(() => {
    const el = galleryRef.current;
    if (!el) return;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const w = el.clientWidth;
        if (w > 0) {
          const idx = Math.round(el.scrollLeft / w);
          setCurrentImage(idx);
        }
        ticking = false;
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [product]);

  // Slow, touch-friendly auto-scroll for the sale carousel.
  useEffect(() => {
    const el = saleTrackRef.current;
    if (!el || saleItems.length < 3) return undefined;
    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const stepSize = prefersReducedMotion ? 0.45 : 1.15;

    const pause = (ms = 2800) => {
      saleAutoPauseUntilRef.current = Date.now() + ms;
    };

    pause(1800);

    const onPointerDown = () => pause(4200);
    const onWheel = () => pause(4200);

    el.addEventListener('pointerdown', onPointerDown, { passive: true });
    el.addEventListener('touchstart', onPointerDown, { passive: true });
    el.addEventListener('wheel', onWheel, { passive: true });

    saleAutoFrameRef.current = window.setInterval(() => {
      if (document.hidden) return;
      if (Date.now() >= saleAutoPauseUntilRef.current) {
        const maxScroll = el.scrollWidth - el.clientWidth;
        if (maxScroll > 10) {
          if (el.scrollLeft >= maxScroll - 2) {
            el.scrollTo({ left: 0, behavior: 'instant' });
            pause(1400);
          } else {
            el.scrollLeft = Math.min(maxScroll, el.scrollLeft + stepSize);
          }
        }
      }
    }, 50);

    return () => {
      if (saleAutoFrameRef.current) window.clearInterval(saleAutoFrameRef.current);
      saleAutoFrameRef.current = null;
      saleAutoLastTsRef.current = null;
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('touchstart', onPointerDown);
      el.removeEventListener('wheel', onWheel);
    };
  }, [saleItems.length, product?.id]);

  const handleBack = useCallback(() => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/catalog', { replace: true });
    }
  }, [navigate]);

  // Swipe-back gesture (left-to-right)
  const onTouchStart = useCallback((e) => {
    const t = e.touches[0];
    touchStartX.current = t.clientX;
    touchStartY.current = t.clientY;
    swiping.current = false;

  }, []);

  const onTouchMove = useCallback((e) => {
    if (swiping.current) return;
    const t = e.touches[0];
    const dx = t.clientX - touchStartX.current;
    const dy = Math.abs(t.clientY - touchStartY.current);
    // Only trigger if horizontal swipe from left 12% edge zone
    if (dx > 60 && dy < 40 && touchStartX.current < window.innerWidth * 0.12) {
      swiping.current = true;
      handleBack();
    }
  }, [handleBack]);

  const handleAddToCart = () => {
    if (!selectedSize) {
      setSizeShake(true);
      setTimeout(() => setSizeShake(false), 600);
      return;
    }
    addItem(product, selectedSize);
    setAdded(true);
    setTimeout(() => setAdded(false), 2500);
  };

  const handleShare = useCallback(() => {
    if (!product) return;
    track('share', { productId: product.id });
    const url = `${window.location.origin}/product/${makeProductSlug(product)}`;
    const title = productDisplayName(product);
    const sharePrice = product.originalPrice && product.originalPrice > product.price
      ? `₽${product.price.toLocaleString('ru-RU')} (было ₽${product.originalPrice.toLocaleString('ru-RU')})`
      : `₽${product.price.toLocaleString('ru-RU')}`;
    const text = `${productDisplayName(product)} — ${sharePrice}`;

    if (navigator.share) {
      navigator.share({ title, text, url }).catch(() => {});
    } else {
      navigator.clipboard
        .writeText(url)
        .then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        })
        .catch(() => {
          // Fallback: выделяем текст в prompt
          window.prompt('Скопируйте ссылку:', url);
        });
    }
  }, [product]);

  // Загрузка
  if (loading || fallbackLoading) {
    return (
      <div className="overlay overlay--open">
        <div className="product-page" style={{ textAlign: 'center', paddingTop: 120 }}>
          <p style={{ fontSize: 14, color: '#999', letterSpacing: '0.05em' }}>Загрузка...</p>
        </div>
      </div>
    );
  }

  // Товар не найден — возврат на каталог
  if (!product) {
    return (
      <div className="overlay overlay--open">
        <div className="product-page" style={{ textAlign: 'center', paddingTop: 120 }}>
          <p style={{ fontSize: 14, color: '#999', letterSpacing: '0.05em' }}>Товар не найден</p>
          <button className="btn-primary" style={{ marginTop: 24 }} onClick={() => navigate('/catalog', { replace: true })}>
            ВЕРНУТЬСЯ В КАТАЛОГ
          </button>
        </div>
      </div>
    );
  }

  const allImages = product.images?.length > 0 ? product.images : [product.image];

  const goToSlide = (index) => {
    galleryRef.current?.scrollTo({ left: index * galleryRef.current.clientWidth, behavior: 'instant' });
  };

  return (
    <div className="overlay overlay--open" ref={overlayRef}>
    <div className="product-page">
      <div
        className="product-page__gallery"
      >
        {/* Invisible back zone (left 30%) — tap disabled, use arrow */}
        <div className="back-zone" aria-hidden="true" />

        {/* Back button — glassmorphism */}
        <button className="back-btn" onClick={handleBack} aria-label="Назад">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M12.5 4L6.5 10L12.5 16" stroke="rgba(0,0,0,0.8)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        {/* Badges on gallery */}
        {(() => {
          const radius = { rect: '1px', rounded: '4px', pill: '999px', circle: '50%' };
          const groups = {};
          [product.badge, product.badge2].forEach((b, idx) => {
            if (b?.enabled && b?.text) {
              const filled = b.type === 'filled';
              const bc = b.borderColor || 'rgba(0,0,0,0.8)';
              const pos = b.position || 'top-left';
              (groups[pos] ||= []).push(
                <span
                  key={`custom-${idx}`}
                  className={`product-badge product-badge--${b.size || 'm'}${filled ? ' product-badge--filled' : ''}`}
                  style={{
                    border: `1px solid ${bc}`,
                    color: filled ? undefined : (b.textColor || '#000'),
                    borderRadius: radius[b.shape] || '1px',
                    ...(filled ? { background: bc } : {}),
                  }}
                >
                  {b.text}
                </span>
              );
            }
          });
          return Object.entries(groups).map(([pos, items]) => (
            <div key={pos} className={`product-badges product-badges--page product-badges--${pos}`}>{items}</div>
          ));
        })()}

        {/* Horizontal scroll-snap gallery */}
        <div className="pp-gallery-track" ref={galleryRef}>
          {allImages.map((img, i) => (
            <div
              key={i}
              className="pp-gallery-slide"
              onClick={() => setLightboxIdx(i)}
            >
              <img
                src={img}
                alt={`${product.name} ${i + 1}`}
                className="pp-main-img"
                draggable={false}
                loading={i === 0 ? 'eager' : 'lazy'}
                decoding="async"
              />
            </div>
          ))}
        </div>

        {/* Dots */}
        {allImages.length > 1 && (
          <div className="pp-dots">
            {allImages.map((_, i) => (
              <button
                key={i}
                className={`pp-dot ${i === currentImage ? 'pp-dot--active' : ''}`}
                onClick={() => goToSlide(i)}
                aria-label={`Изображение ${i + 1}`}
              />
            ))}
          </div>
        )}

        {/* Desktop prev/next arrows */}
        {allImages.length > 1 && (
          <div className="pp-gallery-arrows">
            <button
              className="pp-gallery-arrow pp-gallery-arrow--prev"
              onClick={() => goToSlide(Math.max(0, currentImage - 1))}
              disabled={currentImage === 0}
              aria-label="Предыдущее"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M10 2L4 8L10 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <button
              className="pp-gallery-arrow pp-gallery-arrow--next"
              onClick={() => goToSlide(Math.min(allImages.length - 1, currentImage + 1))}
              disabled={currentImage === allImages.length - 1}
              aria-label="Следующее"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M6 2L12 8L6 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        )}

        {/* Desktop thumbnails */}
        {allImages.length > 1 && (
          <div className="product-page__thumbnails">
            {allImages.map((img, i) => (
              <button
                key={i}
                className={`thumbnail ${currentImage === i ? 'thumbnail--active' : ''}`}
                onClick={() => goToSlide(i)}
              >
                <img src={img} alt={`${product.name} ${i + 1}`} decoding="async" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="product-page__info" onTouchStart={onTouchStart} onTouchMove={onTouchMove}>
        <div className="pp-title-row">
          <span className="product-page__brand">{product.brand}</span>
          <button
            className={`pp-info-share ${copied ? 'pp-info-share--copied' : ''}`}
            onClick={handleShare}
            aria-label="Поделиться"
          >
            {copied ? (
              <span>✓</span>
            ) : (
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M7.5 6.5L10 4L12.5 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M10 4V12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M5 9.5V15C5 15.55 5.45 16 6 16H14C14.55 16 15 15.55 15 15V9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            )}
          </button>
        </div>
        <h1 className="product-page__name">{stripBrandFromName(product)}</h1>
        <p className="product-page__price">
          {product.originalPrice && product.originalPrice > product.price ? (
            <>
              <span className="product-page__price--sale">₽{product.price.toLocaleString('ru-RU')}</span>
              <span className="product-page__price--old">₽{product.originalPrice.toLocaleString('ru-RU')}</span>
              <span className="product-page__badge">-{Math.round(100 - (product.price / product.originalPrice) * 100)}%</span>
            </>
          ) : (
            <>₽{product.price.toLocaleString('ru-RU')}</>
          )}
        </p>

        {/* Trust block */}
        <div className="pp-trust">
          <span>Доставка РФ / РБ</span>
        </div>

        <div className="product-page__details product-page__details--compact">
          {product.color ? <span>Цвет: <strong>{product.color}</strong></span> : null}
          <span>Пол: <strong>
            {product.gender === 'mens' ? 'Мужское' :
             product.gender === 'womens' ? 'Женское' :
             product.gender === 'kids' ? 'Детское' : 'Унисекс'}
          </strong></span>
        </div>

        {/* Size buttons */}
        <div className={`pp-sizes ${sizeShake ? 'pp-sizes--shake' : ''}`}>
          <div className="pp-sizes__head">
            <span className="pp-sizes__label">Размер</span>
          </div>
          <div className={`pp-sizes__grid${sortSizes(product.sizes).length > 5 ? ' pp-sizes__grid--many' : ''}`}>
            {sortSizes(product.sizes).map((size) => (
              <button
                key={size}
                className={`pp-size-btn ${selectedSize === size ? 'pp-size-btn--active' : ''}`}
                onClick={() => { setSelectedSize(size); track('size_select', { productId: product.id, size }); }}
              >
                {size}
              </button>
            ))}
          </div>
        </div>

        <div className="pp-actions">
          <button
            className="btn-buy-now"
            onClick={() => {
              if (!selectedSize) {
                setSizeShake(true);
                setTimeout(() => setSizeShake(false), 600);
                return;
              }
              track('buy_now', { productId: product.id, size: selectedSize, price: product.price, brand: product.brand });
              const productUrl = `${window.location.origin}/product/${makeProductSlug(product)}`;
              const text = [
                'Здравствуйте!',
                '',
                'Хочу заказать:',
                '',
                `${productDisplayName(product)} — ${selectedSize}`,
                '',
                `Цена: ₽${product.price.toLocaleString('ru-RU')}`,
                '',
                'Товар:',
                productUrl,
              ].join('\n');
              window.open(`https://t.me/IWAKm?text=${encodeURIComponent(text)}`, '_blank');
            }}
          >
            КУПИТЬ СЕЙЧАС
          </button>

          <button
            className={`btn-add-to-cart ${added ? 'btn-add-to-cart--added' : ''}`}
            onClick={handleAddToCart}
          >
            {added ? 'Добавлено' : 'В корзину'}
          </button>
        </div>

        {saleItems.length >= 2 && (
          <div className="pp-sale">
            <div className="pp-sale-header">
              <span className="pp-sale-title">Сейчас по скидке</span>
              <Link to="/catalog?sale=true" className="pp-sale-link">
                Все&nbsp;›
              </Link>
            </div>
            <div className="pp-sale-track" ref={saleTrackRef}>
              {saleItems.map((p) => (
                <div key={p.id} className="pp-sale-card">
                  <ProductCard product={p} />
                </div>
              ))}
              <Link to="/catalog?sale=true" className="pp-sale-more">
                Смотреть ещё&nbsp;›
              </Link>
            </div>
          </div>
        )}

      </div>
    </div>

    {/* Fullscreen lightbox */}
    {lightboxIdx !== null && (
      <div className="pp-lightbox" onClick={() => setLightboxIdx(null)}>
        <button className="pp-lightbox__close" onClick={() => setLightboxIdx(null)} aria-label="Закрыть">✕</button>
        <img
          src={allImages[lightboxIdx]}
          alt={product.name}
          className="pp-lightbox__img"
          draggable={false}
        />
      </div>
    )}
    </div>
  );
}
