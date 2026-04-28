import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useProducts } from '../context/ProductsContext';
import { lockScroll, unlockScroll } from '../utils/scrollLock';
import { track } from '../utils/tracker';
import { makeProductSlug } from '../utils/slug';
import { stripBrandFromName } from '../utils/productDisplay';

export default function CartDrawer({ isOpen, onClose }) {
  const { items, removeItem, updateQty } = useCart();
  const { products } = useProducts();

  // Обогащаем элементы корзины актуальными ценами из products
  const enrichedItems = useMemo(() => items.map((item) => {
    const current = products.find((p) => String(p.id) === String(item.id));
    if (!current) return item;
    return { ...item, price: current.price, originalPrice: current.originalPrice, image: current.image, name: current.name, brand: current.brand };
  }), [items, products]);

  const totalPrice = useMemo(
    () => enrichedItems.reduce((acc, i) => acc + i.price * i.qty, 0), [enrichedItems]
  );

  const totalOriginalPrice = useMemo(
    () => enrichedItems.reduce((acc, i) => acc + (i.originalPrice && i.originalPrice > i.price ? i.originalPrice : i.price) * i.qty, 0), [enrichedItems]
  );

  const hasTotalDiscount = totalOriginalPrice > totalPrice;
  const drawerRef = useRef(null);
  const [closing, setClosing] = useState(false);
  const navigate = useNavigate();

  const handleClose = () => {
    if (closing) return;
    setClosing(true);
    setTimeout(() => {
      onClose();
      setClosing(false);
    }, 300);
  };

  useEffect(() => {
    if (!isOpen) setClosing(false);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      lockScroll();
    } else {
      unlockScroll();
    }
    return () => { unlockScroll(); };
  }, [isOpen]);

  // ESC close
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, closing]);

  // Focus trap
  useEffect(() => {
    if (!isOpen || !drawerRef.current) return;
    const panel = drawerRef.current;
    const focusable = panel.querySelectorAll('button, input, [tabindex]:not([tabindex="-1"])');
    if (focusable.length) focusable[0].focus();

    const trap = (e) => {
      if (e.key !== 'Tab' || !focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', trap);
    return () => document.removeEventListener('keydown', trap);
  }, [isOpen, items]);

  const handleCheckout = () => {
    const total = enrichedItems.reduce((acc, i) => acc + i.price * i.qty, 0);
    track('checkout_click', { itemCount: enrichedItems.length, totalPrice: total, productIds: enrichedItems.map(i => i.id) });
    const param = enrichedItems.map((i) => `${i.id}:${i.size}`).join(',');
    const cartUrl = `${window.location.origin}/cart?items=${param}`;
    const text = [
      'Здравствуйте!',
      '',
      'Хочу заказать:',
      '',
      '🛒 Корзина:',
      cartUrl,
      '',
      `Товаров: ${enrichedItems.length}`,
      `Итого: ₽${total.toLocaleString('ru-RU')}`,
    ].join('\n');
    window.open(`https://t.me/IWAKm?text=${encodeURIComponent(text)}`, '_blank');
  };

  const handleCatalog = () => {
    handleClose();
  };

  const [copied, setCopied] = useState(false);

  const handleShare = useCallback(() => {
    if (enrichedItems.length === 0) return;
    const param = enrichedItems.map((i) => `${i.id}:${i.size}`).join(',');
    const url = `${window.location.origin}/cart?items=${param}`;
    const text = `Моя корзина IWAK\u00a0— ${enrichedItems.length} товар(а) на ₽${totalPrice.toLocaleString('ru-RU')}`;
    if (navigator.share) {
      navigator.share({ title: 'Моя корзина IWAK', text, url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url)
        .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })
        .catch(() => { window.prompt('Скопируйте ссылку:', url); });
    }
  }, [enrichedItems, totalPrice]);

  const handleItemClick = (item) => {
    handleClose();
    setTimeout(() => {
      navigate(`/product/${makeProductSlug(item)}`, {
        state: { backgroundLocation: { pathname: '/catalog', search: '' } },
      });
    }, 310);
  };

  return (
    <>
      <div className={`cart-drawer-overlay ${isOpen && !closing ? 'cart-drawer-overlay--open' : ''}`} onClick={handleClose} />
      <div
        ref={drawerRef}
        className={`cart-drawer ${isOpen && !closing ? 'cart-drawer--open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Корзина"
      >
        <div className="cart-drawer__header">
          <span className="cart-drawer__title">КОРЗИНА</span>
          <button className="cart-drawer__close" onClick={handleClose} aria-label="Закрыть">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <line x1="1" y1="1" x2="17" y2="17" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
              <line x1="17" y1="1" x2="1" y2="17" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <div className="cart-drawer__body">
          {enrichedItems.length === 0 ? (
            <div className="cart-drawer__empty">
              <p>Ваша корзина пуста</p>
              <button className="cart-drawer__catalog-btn" onClick={handleCatalog}>
                ПРОДОЛЖИТЬ ПОКУПКИ
              </button>
            </div>
          ) : (
            <>
              <ul className="cart-drawer__list">
                {enrichedItems.map((item) => {
                  const hasDiscount = item.originalPrice && item.originalPrice > item.price;
                  const discountPct = hasDiscount ? Math.round((1 - item.price / item.originalPrice) * 100) : 0;
                  return (
                  <li key={`${item.id}-${item.size}`} className="cart-drawer__item">
                    <button
                      className="cart-drawer__item-img cart-drawer__item-img--btn"
                      onClick={() => handleItemClick(item)}
                      aria-label={`Открыть ${item.name}`}
                    >
                      <img src={item.image} alt={item.name} decoding="async" />
                      {hasDiscount && <span className="cart-drawer__badge">-{discountPct}%</span>}
                    </button>
                    <div className="cart-drawer__item-info">
                      <button
                        className="cart-drawer__item-name-btn"
                        onClick={() => handleItemClick(item)}
                      >
                        <span className="cart-drawer__item-brand">{item.brand}</span>
	                        <span className="cart-drawer__item-name">{stripBrandFromName(item)}</span>
                      </button>
                      <span className="cart-drawer__item-size">Размер: {item.size}</span>
                      <div className="cart-drawer__item-qty">
                        <button
                          className="cart-drawer__qty-btn"
                          onClick={() => updateQty(item.id, item.size, item.qty - 1)}
                          disabled={item.qty <= 1}
                        >–</button>
                        <span>{item.qty}</span>
                        <button
                          className="cart-drawer__qty-btn"
                          onClick={() => updateQty(item.id, item.size, item.qty + 1)}
                        >+</button>
                      </div>
                    </div>
                    <div className="cart-drawer__item-right">
                      <div className="cart-drawer__prices">
                        <span className={hasDiscount ? 'cart-drawer__item-price cart-drawer__item-price--sale' : 'cart-drawer__item-price'}>
                          ₽{(item.price * item.qty).toLocaleString('ru-RU')}
                        </span>
                        {hasDiscount && (
                          <span className="cart-drawer__item-price--old">
                            ₽{(item.originalPrice * item.qty).toLocaleString('ru-RU')}
                          </span>
                        )}
                      </div>
                      <button
                        className="cart-drawer__remove"
                        onClick={() => removeItem(item.id, item.size)}
                        aria-label="Удалить"
                      >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <line x1="1" y1="1" x2="11" y2="11" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                          <line x1="11" y1="1" x2="1" y2="11" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                        </svg>
                      </button>
                    </div>
                  </li>
                  );
                })}
              </ul>

              <div className="cart-drawer__share-row">
                <button
                  className={`share-btn${copied ? ' share-btn--copied' : ''}`}
                  onClick={handleShare}
                  aria-label="Поделиться корзиной"
                >
                  {copied ? 'Скопировано' : 'Поделиться'}
                </button>
              </div>
            </>
          )}
        </div>

        {enrichedItems.length > 0 && (
          <div className="cart-drawer__footer">
            <div className="cart-drawer__total-row">
              <span>ИТОГО</span>
              <div className="cart-drawer__total-prices">
                {hasTotalDiscount && (
                  <span className="cart-drawer__total--old">
                    ₽{totalOriginalPrice.toLocaleString('ru-RU')}
                  </span>
                )}
                <span className={hasTotalDiscount ? 'cart-drawer__total cart-drawer__total--sale' : 'cart-drawer__total'}>
                  ₽{totalPrice.toLocaleString('ru-RU')}
                </span>
              </div>
            </div>
            <button className="cart-drawer__checkout" onClick={handleCheckout}>
              ОФОРМИТЬ ЗАКАЗ
            </button>
            <button className="cart-drawer__continue" onClick={handleCatalog}>
              ПРОДОЛЖИТЬ ПОКУПКИ
            </button>
          </div>
        )}
      </div>
    </>
  );
}
