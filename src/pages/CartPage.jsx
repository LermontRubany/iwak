import { useNavigate, useSearchParams, useLocation, Link } from 'react-router-dom';
import { useState, useCallback, useMemo, useEffect } from 'react';
import { useCart } from '../context/CartContext';
import { useProducts } from '../context/ProductsContext';
import { makeProductSlug } from '../utils/slug';
import { track } from '../utils/tracker';

function useHandleClose() {
  const navigate = useNavigate();
  const [closing, setClosing] = useState(false);
  const handleClose = () => {
    if (closing) return;
    setClosing(true);
    setTimeout(() => {
      if (window.history.length > 1) navigate(-1);
      else navigate('/catalog', { replace: true });
    }, 300);
  };
  return { closing, handleClose };
}

export default function CartPage() {
  const { items, removeItem, updateQty } = useCart();
  const { products, loading: productsLoading } = useProducts();
  const { closing, handleClose } = useHandleClose();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const [copied, setCopied] = useState(false);

  // Shared cart: парсим ?items= НЕ трогая локальную корзину
  const sharedParam = searchParams.get('items');
  const isSharedCart = Boolean(sharedParam);

  // ── Parse shared item IDs for fallback fetching ──
  const sharedParsed = useMemo(() => {
    if (!sharedParam) return [];
    const result = [];
    for (const pair of sharedParam.split(',')) {
      const colonIdx = pair.indexOf(':');
      if (colonIdx === -1) continue;
      const rawId = pair.slice(0, colonIdx).trim();
      const size = pair.slice(colonIdx + 1).trim();
      if (!rawId || !size) continue;
      const id = /^\d+$/.test(rawId) ? Number(rawId) : rawId;
      result.push({ id, size });
    }
    return result;
  }, [sharedParam]);

  // ── Fallback: fetch missing products by ID for shared cart ──
  const [fallbackProducts, setFallbackProducts] = useState([]);
  const [fallbackLoading, setFallbackLoading] = useState(false);

  // Pool of all known products (context + fallback)
  const allProducts = useMemo(() => {
    if (fallbackProducts.length === 0) return products;
    const map = new Map(products.map((p) => [String(p.id), p]));
    for (const fp of fallbackProducts) map.set(String(fp.id), fp);
    return Array.from(map.values());
  }, [products, fallbackProducts]);

  useEffect(() => {
    if (!isSharedCart || productsLoading) return;
    // Find IDs not yet in products
    const missing = sharedParsed.filter(
      (sp) => !products.some((p) => String(p.id) === String(sp.id))
    );
    if (missing.length === 0) return;
    let cancelled = false;
    setFallbackLoading(true);
    Promise.all(
      missing.map((m) =>
        fetch(`/api/products/${m.id}`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null)
      )
    ).then((results) => {
      if (cancelled) return;
      const valid = results.filter((r) => r && r.id != null);
      if (valid.length > 0) setFallbackProducts(valid);
    }).finally(() => { if (!cancelled) setFallbackLoading(false); });
    return () => { cancelled = true; };
  }, [isSharedCart, productsLoading, products, sharedParsed]);

  const sharedItems = useMemo(() => {
    if (!sharedParam || allProducts.length === 0) return [];
    const result = [];
    for (const sp of sharedParsed) {
      const product = allProducts.find((p) => String(p.id) === String(sp.id));
      if (product) result.push({ ...product, size: sp.size, qty: 1 });
    }
    return result;
  }, [sharedParam, sharedParsed, allProducts]);

  // Показываемые товары: shared ИЛИ свои
  const displayItems = isSharedCart ? sharedItems : items;

  // Обогащаем элементы корзины актуальными ценами из products
  const enrichedItems = useMemo(() => displayItems.map((item) => {
    const current = allProducts.find((p) => String(p.id) === String(item.id));
    if (!current) return item;
    return { ...item, price: current.price, originalPrice: current.originalPrice, image: current.image, name: current.name, brand: current.brand };
  }), [displayItems, allProducts]);

  const totalPrice = useMemo(
    () => enrichedItems.reduce((acc, i) => acc + i.price * (i.qty || 1), 0), [enrichedItems]
  );

  const totalOriginalPrice = useMemo(
    () => enrichedItems.reduce((acc, i) => acc + (i.originalPrice && i.originalPrice > i.price ? i.originalPrice : i.price) * (i.qty || 1), 0), [enrichedItems]
  );

  const hasTotalDiscount = totalOriginalPrice > totalPrice;

  const handleShare = useCallback(() => {
    const src = isSharedCart ? sharedItems : items;
    if (src.length === 0) return;
    const param = src.map((i) => `${i.id}:${i.size}`).join(',');
    const url = `${window.location.origin}/cart?items=${param}`;
    const text = `Корзина IWAK — ${enrichedItems.length} товар(а) на ₽${totalPrice.toLocaleString('ru-RU')}`;

    if (navigator.share) {
      navigator.share({ title: 'Корзина IWAK', text, url }).catch(() => {});
    } else {
      navigator.clipboard
        .writeText(url)
        .then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        })
        .catch(() => {
          window.prompt('Скопируйте ссылку на корзину:', url);
        });
    }
  }, [isSharedCart, sharedItems, items, enrichedItems, totalPrice]);

  // Фоновая локация для overlay товара: каталог или то, что было до корзины
  const bgLocation = location.state?.backgroundLocation || { pathname: '/catalog', search: '' };

  // Загрузка (shared cart на cold start)
  if (isSharedCart && (productsLoading || fallbackLoading)) {
    return (
      <div className="overlay overlay--open">
        <div className="cart-empty">
          <h2 className="cart-title">КОРЗИНА</h2>
          <p className="cart-empty__text">Загрузка корзины...</p>
        </div>
      </div>
    );
  }

  if (enrichedItems.length === 0) {
    return (
      <div className={`overlay ${closing ? 'overlay--closing' : 'overlay--open'}`}>
        <div className="cart-empty">
          <h2 className="cart-title">КОРЗИНА</h2>
          <p className="cart-empty__text">{isSharedCart ? 'Товары не найдены' : 'Ваша корзина пуста'}</p>
          <button className="btn-primary" onClick={handleClose}>
            ПРОДОЛЖИТЬ ПОКУПКИ
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`overlay ${closing ? 'overlay--closing' : 'overlay--open'}`}>
    <div className="cart-page">
      <div className="cart-header-row">
        <div className="cart-header-left">
          <h2 className="cart-title">КОРЗИНА</h2>
          {isSharedCart && (
            <span className="cart-shared-chip">Мой выбор{enrichedItems.length > 0 ? ` · ${enrichedItems.length}` : ''}</span>
          )}
        </div>
      </div>

      <ul className="cart-list">
        {enrichedItems.map((item) => {
          const hasDiscount = item.originalPrice && item.originalPrice > item.price;
          const discountPct = hasDiscount ? Math.round((1 - item.price / item.originalPrice) * 100) : 0;
          return (
          <li key={`${item.id}-${item.size}`} className="cart-item">
            <Link
              to={`/product/${makeProductSlug(item)}`}
              state={{ backgroundLocation: bgLocation }}
              className="cart-item__image cart-item__image--link"
            >
              <img src={item.image} alt={item.name} decoding="async" />
              {hasDiscount && <span className="cart-item__badge">-{discountPct}%</span>}
            </Link>
            <div className="cart-item__details">
              <Link
                to={`/product/${makeProductSlug(item)}`}
                state={{ backgroundLocation: bgLocation }}
                className="cart-item__name-link"
              >
                <span className="cart-item__brand">{item.brand}</span>
                <span className="cart-item__name">{item.name}</span>
              </Link>
              <span className="cart-item__meta">Размер: {item.size}</span>
              {!isSharedCart && (
              <div className="cart-item__qty">
                <span>Кол-во:</span>
                <button
                  className="qty-btn"
                  onClick={() => updateQty(item.id, item.size, item.qty - 1)}
                  disabled={item.qty <= 1}
                >
                  –
                </button>
                <span className="qty-value">{item.qty}</span>
                <button
                  className="qty-btn"
                  onClick={() => updateQty(item.id, item.size, item.qty + 1)}
                >
                  +
                </button>
              </div>
              )}
            </div>
            <div className="cart-item__right">
              <div className="cart-item__prices">
                <span className={hasDiscount ? 'cart-item__price cart-item__price--sale' : 'cart-item__price'}>
                  ₽{(item.price * item.qty).toLocaleString('ru-RU')}
                </span>
                {hasDiscount && (
                  <span className="cart-item__price--old">
                    ₽{(item.originalPrice * item.qty).toLocaleString('ru-RU')}
                  </span>
                )}
              </div>
              {!isSharedCart && (
              <button
                className="cart-item__remove"
                onClick={() => removeItem(item.id, item.size)}
              >
                Удалить
              </button>
              )}
            </div>
          </li>
          );
        })}
      </ul>

      <div className="cart-share-row">
        <button
          className={`share-btn ${copied ? 'share-btn--copied' : ''}`}
          onClick={handleShare}
          aria-label="Поделиться корзиной"
        >
          {copied ? 'Скопировано' : 'Поделиться'}
        </button>
      </div>

      <div className="cart-summary">
        <div className="cart-summary__row">
          <span>ИТОГО</span>
          <div className="cart-summary__prices">
            {hasTotalDiscount && (
              <span className="cart-summary__total--old">
                ₽{totalOriginalPrice.toLocaleString('ru-RU')}
              </span>
            )}
            <span className={hasTotalDiscount ? 'cart-summary__total cart-summary__total--sale' : 'cart-summary__total'}>
              ₽{totalPrice.toLocaleString('ru-RU')}
            </span>
          </div>
        </div>
        <button
          className="btn-telegram btn-telegram--cart"
          onClick={() => {
            track('checkout_click', { itemCount: enrichedItems.length, totalPrice, productIds: enrichedItems.map(i => i.id) });
            const lines = enrichedItems.map((item, i) => {
              const itemUrl = `${window.location.origin}/product/${makeProductSlug(item)}`;
              return `${i + 1}. ${item.brand} ${item.name} — ${item.size}\n${itemUrl}`;
            });
            const text = [
              'Здравствуйте!',
              '',
              'Хочу заказать:',
              '',
              lines.join('\n\n'),
              '',
              `Итого: ₽${totalPrice.toLocaleString('ru-RU')}`,
            ].join('\n');
            window.open(`https://t.me/IWAKm?text=${encodeURIComponent(text)}`, '_blank');
          }}
        >
          ОФОРМИТЬ ЗАКАЗ
        </button>
        <button className="btn-continue" onClick={handleClose}>
          ПРОДОЛЖИТЬ ПОКУПКИ
        </button>
      </div>
    </div>
    </div>
  );
}
