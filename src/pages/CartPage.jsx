import { useNavigate, useSearchParams, useLocation, Link } from 'react-router-dom';
import { useState, useCallback, useMemo } from 'react';
import { useCart } from '../context/CartContext';
import { useProducts } from '../context/ProductsContext';
import { makeProductSlug } from '../utils/slug';

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
  const { products } = useProducts();
  const { closing, handleClose } = useHandleClose();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const [copied, setCopied] = useState(false);

  // Shared cart: парсим ?items= НЕ трогая локальную корзину
  const sharedParam = searchParams.get('items');
  const isSharedCart = Boolean(sharedParam);

  const sharedItems = useMemo(() => {
    if (!sharedParam || products.length === 0) return [];
    const result = [];
    for (const pair of sharedParam.split(',')) {
      const colonIdx = pair.indexOf(':');
      if (colonIdx === -1) continue;
      const rawId = pair.slice(0, colonIdx).trim();
      const size = pair.slice(colonIdx + 1).trim();
      if (!rawId || !size) continue;
      const id = /^\d+$/.test(rawId) ? Number(rawId) : rawId;
      const product = products.find((p) => String(p.id) === String(id));
      if (product) result.push({ ...product, size, qty: 1 });
    }
    return result;
  }, [sharedParam, products]);

  // Показываемые товары: shared ИЛИ свои
  const displayItems = isSharedCart ? sharedItems : items;

  // Обогащаем элементы корзины актуальными ценами из products
  const enrichedItems = useMemo(() => displayItems.map((item) => {
    const current = products.find((p) => String(p.id) === String(item.id));
    if (!current) return item;
    return { ...item, price: current.price, originalPrice: current.originalPrice, image: current.image, name: current.name, brand: current.brand };
  }), [displayItems, products]);

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
        <h2 className="cart-title">КОРЗИНА</h2>
        {isSharedCart && (
          <span className="cart-shared-chip">Мой выбор{enrichedItems.length > 0 ? ` · ${enrichedItems.length}` : ''}</span>
        )}
        <button
          className={`share-btn ${copied ? 'share-btn--copied' : ''}`}
          onClick={handleShare}
          aria-label="Поделиться корзиной"
        >
          {copied ? (
            <span>Скопировано</span>
          ) : (
            <>
              <svg className="share-btn__icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
              </svg>
              <span>Поделиться</span>
            </>
          )}
        </button>
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
            const param = enrichedItems.map((i) => `${i.id}:${i.size}`).join(',');
            const cartUrl = `${window.location.origin}/cart?items=${param}`;
            const lines = enrichedItems.map((item, i) => `${i + 1}. ${item.brand} ${item.name} — ${item.size}`);
            const text = [
              'Здравствуйте!',
              '',
              'Хочу заказать:',
              '',
              ...lines,
              '',
              `Итого: ₽${totalPrice.toLocaleString('ru-RU')}`,
              '',
              'Корзина:',
              cartUrl,
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
