import { memo, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { makeProductSlug } from '../utils/slug';
import { stripBrandFromName } from '../utils/productDisplay';

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

  return (
    <Link
      to={`/product/${makeProductSlug(product)}`}
      state={{ backgroundLocation: location }}
      className="product-card"
      ref={cardRef}
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
    </Link>
  );
});
