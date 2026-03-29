import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useProducts } from '../context/ProductsContext';
import { useCart } from '../context/CartContext';
import { idFromSlug, makeProductSlug } from '../utils/slug';

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

  // Swipe-back refs
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const swiping = useRef(false);

  // Находим товар по id, закодированному в slug (slug = name-id)
  const productId = idFromSlug(slug);
  const product = productId != null
    ? products.find((p) => String(p.id) === String(productId))
    : undefined;

  // Reset on product change
  useEffect(() => {
    setCurrentImage(0);
    setSelectedSize(null);
    setAdded(false);
    setLightboxIdx(null);
    galleryRef.current?.scrollTo({ left: 0 });
  }, [slug]);

  // OG meta tags — обновляем при каждом открытии товара
  useEffect(() => {
    if (!product) return;
    const title = `${product.name} — IWAK`;
    const priceStr = product.originalPrice && product.originalPrice > product.price
      ? `₽${product.price.toLocaleString('ru-RU')} (было ₽${product.originalPrice.toLocaleString('ru-RU')})`
      : `₽${product.price.toLocaleString('ru-RU')}`;
    const description = `${priceStr} · Размеры: ${product.sizes.join(', ')}`;
    const image = product.image;
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
    // Only trigger if horizontal movement dominates and started from left 40%
    if (dx > 60 && dy < 40 && touchStartX.current < window.innerWidth * 0.4) {
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
    const url = `${window.location.origin}/product/${makeProductSlug(product)}`;
    const title = product.name;
    const sharePrice = product.originalPrice && product.originalPrice > product.price
      ? `₽${product.price.toLocaleString('ru-RU')} (было ₽${product.originalPrice.toLocaleString('ru-RU')})`
      : `₽${product.price.toLocaleString('ru-RU')}`;
    const text = `${product.name} — ${sharePrice}`;

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
  if (loading) {
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
    <div className="overlay overlay--open">
    <div className="product-page">
      <div
        className="product-page__gallery"
      >
        {/* Invisible back zone (left 30%) */}
        <div className="back-zone" onClick={handleBack} aria-label="Назад" role="button" tabIndex={-1} />

        {/* Minimal arrow hint */}
        <span className="back-arrow" onClick={handleBack} aria-hidden="true">←</span>

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
            className={`share-btn ${copied ? 'share-btn--copied' : ''}`}
            onClick={handleShare}
            aria-label="Поделиться"
          >
            {copied ? 'Скопировано' : 'Поделиться'}
          </button>
        </div>
        <h1 className="product-page__name">{product.name}</h1>
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
          <span>✓ В наличии</span>
          <span>Доставка: Россия / Беларусь</span>
        </div>

        {/* Size buttons */}
        <div className={`pp-sizes ${sizeShake ? 'pp-sizes--shake' : ''}`}>
          <span className="pp-sizes__label">
            {selectedSize ? `Размер: ${selectedSize}` : 'Выберите размер'}
          </span>
          <div className="pp-sizes__grid">
            {product.sizes.map((size) => (
              <button
                key={size}
                className={`pp-size-btn ${selectedSize === size ? 'pp-size-btn--active' : ''}`}
                onClick={() => setSelectedSize(size)}
              >
                {size}
              </button>
            ))}
          </div>
        </div>

        <button
          className={`btn-add-to-cart ${added ? 'btn-add-to-cart--added' : ''}`}
          onClick={handleAddToCart}
        >
          {added ? '✓ ДОБАВЛЕНО В КОРЗИНУ' : 'ДОБАВИТЬ В КОРЗИНУ'}
        </button>

        <button
          className="btn-buy-now"
          onClick={() => {
            if (!selectedSize) {
              setSizeShake(true);
              setTimeout(() => setSizeShake(false), 600);
              return;
            }
            const productUrl = `${window.location.origin}/product/${makeProductSlug(product)}`;
            const text = [
              'Здравствуйте!',
              '',
              'Хочу заказать:',
              '',
              `${product.brand} ${product.name} — ${selectedSize}`,
              '',
              `Итого: ₽${product.price.toLocaleString('ru-RU')}`,
              '',
              productUrl,
            ].join('\n');
            window.open(`https://t.me/IWAKm?text=${encodeURIComponent(text)}`, '_blank');
          }}
        >
          КУПИТЬ СЕЙЧАС
        </button>

        <div className="product-page__details">
          <p>Цвет: <strong>{product.color}</strong></p>
          <p>Пол: <strong>
            {product.gender === 'mens' ? 'Мужское' :
             product.gender === 'womens' ? 'Женское' :
             product.gender === 'kids' ? 'Детское' : 'Унисекс'}
          </strong></p>
        </div>
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
