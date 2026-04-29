import { memo, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { makeProductSlug } from '../utils/slug';
import { stripBrandFromName } from '../utils/productDisplay';
import sortSizes from '../utils/sortSizes';
import { useCart } from '../context/CartContext';
import { track } from '../utils/tracker';

const prefetched = new Set();
const imagesPrefetched = new Set();

function prefetchProduct(id) {
  // No-op: ProductPage is statically imported in App.jsx and always in the bundle.
  // Intersection observer is kept only for image prefetching below.
  prefetched.add(id);
}

function prefetchImages(product) {
  if (imagesPrefetched.has(product.id)) return;
  imagesPrefetched.add(product.id);
  const all = product.images?.length > 0 ? product.images : [product.image];
  all.forEach((src) => {
    if (!src) return;
    const img = new Image();
    img.src = src;
  });
}

function handleImgError(e, colorHex) {
  const img = e.target;
  img.style.display = 'none';
  const wrap = img.parentElement;
  wrap.style.background = colorHex || '#e8e6e1';
  wrap.style.display = 'flex';
  wrap.style.alignItems = 'center';
  wrap.style.justifyContent = 'center';
  const label = document.createElement('span');
  label.textContent = 'IWAK';
  label.style.cssText = 'font-size:1.1rem;font-weight:700;letter-spacing:0.2em;color:rgba(255,255,255,0.5);';
  wrap.appendChild(label);
}

export default memo(function ProductCard({ product, priority }) {
  const cardRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { addItem } = useCart();
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickAdded, setQuickAdded] = useState(false);
  const [quickSelectedSize, setQuickSelectedSize] = useState('');
  const sizes = sortSizes(product.sizes || []);
  const productUrl = `/product/${makeProductSlug(product)}`;

  const addQuickItem = (size) => {
    addItem(product, size || 'OS');
    window.dispatchEvent(new CustomEvent('iwak:cart-pulse'));
    setQuickAdded(true);
    setQuickOpen(false);
    track('catalog_quick_add_done', { productId: product.id, size: size || 'OS' });
    window.setTimeout(() => setQuickSelectedSize(''), 220);
    window.setTimeout(() => setQuickAdded(false), 900);
  };

  const handleCardClick = () => {
    navigate(productUrl, { state: { backgroundLocation: location } });
  };

  const handleQuickAdd = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (quickOpen) {
      setQuickOpen(false);
      setQuickSelectedSize('');
      return;
    }
    track('catalog_quick_add_open', { productId: product.id });
    if (sizes.length === 0) {
      addQuickItem('OS');
      return;
    }
    if (sizes.length === 1) {
      addQuickItem(sizes[0]);
      return;
    }
    window.dispatchEvent(new CustomEvent('iwak:quick-add-open', { detail: { productId: product.id } }));
    setQuickOpen(true);
  };

  const handleSizeClick = (e, size) => {
    e.preventDefault();
    e.stopPropagation();
    track('catalog_quick_add_size', { productId: product.id, size });
    setQuickSelectedSize(size);
    window.setTimeout(() => addQuickItem(size), 120);
  };

  // Mobile: prefetch when card enters viewport
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          prefetchProduct(product.id);
          prefetchImages(product);
          observer.disconnect();
        }
      },
      { rootMargin: '300px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [product]);

  useEffect(() => {
    const handleOtherQuickOpen = (event) => {
      if (event.detail?.productId === product.id) return;
      setQuickOpen(false);
      setQuickSelectedSize('');
    };
    window.addEventListener('iwak:quick-add-open', handleOtherQuickOpen);
    return () => window.removeEventListener('iwak:quick-add-open', handleOtherQuickOpen);
  }, [product.id]);

  const quickRowsClass = sizes.length > 5 ? ' product-card--quick-two-rows' : ' product-card--quick-one-row';

  return (
    <article
      className={`product-card${quickRowsClass}${quickOpen ? ' product-card--quick-open' : ''}${quickAdded ? ' product-card--quick-added' : ''}`}
      ref={cardRef}
      role="link"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter') handleCardClick();
      }}
      onMouseEnter={() => {
        prefetchProduct(product.id);
        prefetchImages(product);
      }}
    >
      <div className="product-card__image-wrap">
        <img
          src={product.image}
          alt={product.name}
          className="product-card__image"
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : undefined}
          decoding="async"
          onError={(e) => handleImgError(e, product.colorHex)}
        />
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
            <div key={pos} className={`product-badges product-badges--${pos}`}>{items}</div>
          ));
        })()}
      </div>
      <div className="product-card__info">
        <div className="product-card__details">
          <span className="product-card__brand">{product.brand}</span>
          <span className="product-card__name">{stripBrandFromName(product)}</span>
          {product.originalPrice && product.originalPrice > product.price ? (
            <span className="product-card__price-row">
              <span className="product-card__price product-card__price--sale">₽{product.price.toLocaleString('ru-RU')}</span>
              <span className="product-card__price--old">₽{product.originalPrice.toLocaleString('ru-RU')}</span>
              <span className="product-card__badge">-{Math.round(100 - (product.price / product.originalPrice) * 100)}%</span>
            </span>
          ) : (
            <span className="product-card__price">₽{product.price.toLocaleString('ru-RU')}</span>
          )}
        </div>

        <div className="product-card__quick" aria-hidden={!quickOpen}>
          <span className="product-card__quick-title">Размер</span>
          <div className="product-card__quick-sizes">
            {sizes.map((size) => (
              <button
                key={size}
                className={`product-card__quick-size${quickSelectedSize === size ? ' product-card__quick-size--selected' : ''}`}
                type="button"
                onClick={(e) => handleSizeClick(e, size)}
                tabIndex={quickOpen ? 0 : -1}
              >
                {size}
              </button>
            ))}
          </div>
        </div>

        <button
          className="product-card__quick-btn"
          type="button"
          onClick={handleQuickAdd}
          aria-label={quickOpen ? 'Закрыть выбор размера' : 'Быстро добавить в корзину'}
        >
          {quickAdded ? (
            <svg viewBox="0 0 18 18" aria-hidden="true">
              <path d="M4 9.4 7.3 12.7 14 5.8" />
            </svg>
          ) : quickOpen ? (
            <svg viewBox="0 0 18 18" aria-hidden="true">
              <path d="M5 5 13 13" />
              <path d="M13 5 5 13" />
            </svg>
          ) : (
            <svg viewBox="0 0 18 18" aria-hidden="true">
              <path d="M5.1 7.1h7.8v6.1a1.3 1.3 0 0 1-1.3 1.3H6.4a1.3 1.3 0 0 1-1.3-1.3V7.1Z" />
              <path d="M7.1 7.1V5.8a1.9 1.9 0 0 1 3.8 0v1.3" />
            </svg>
          )}
        </button>
      </div>
    </article>
  );
});
