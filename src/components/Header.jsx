import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import Navigation from './Navigation';
import SearchOverlay from './SearchOverlay';
import CartDrawer from './CartDrawer';

export default function Header() {
  const { totalCount } = useCart();
  const [navOpen, setNavOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [onDark, setOnDark] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Закрываем все drawer при смене маршрута
  useEffect(() => {
    setNavOpen(false);
    setSearchOpen(false);
    setCartOpen(false);
  }, [location.pathname]);

  const handleLogoClick = () => {
    if (location.pathname.startsWith('/catalog')) return;
    if ((location.pathname.startsWith('/product/') || location.pathname === '/cart') && window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate({ pathname: '/catalog' }, { replace: true });
  };

  useEffect(() => {
    const darkSections = document.querySelectorAll('[data-theme="dark"]');
    if (!darkSections.length) return;

    const headerHeight = window.innerWidth <= 767 ? 70 : 64;

    const observer = new IntersectionObserver(
      (entries) => {
        setOnDark(entries.some(e => e.isIntersecting));
      },
      {
        rootMargin: `0px 0px -${window.innerHeight - headerHeight}px 0px`,
        threshold: 0,
      }
    );

    darkSections.forEach(s => observer.observe(s));
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <header className={`site-header${onDark ? ' site-header--light' : ''}`}>
        <div className="header-left">
          <button
            className="header-icon-btn menu-btn"
            onClick={() => { setSearchOpen(false); setCartOpen(false); setNavOpen(true); }}
            aria-label="Меню"
          >
            <svg width="20" height="9" viewBox="0 0 20 9" fill="none">
              <line x1="0" y1="0.5" x2="20" y2="0.5" stroke="currentColor" strokeWidth="1"/>
              <line x1="0" y1="8.5" x2="20" y2="8.5" stroke="currentColor" strokeWidth="1"/>
            </svg>
          </button>
        </div>

        <button onClick={handleLogoClick} className="site-logo">IWAK</button>

        <div className="header-right">
          <button
            className="header-icon-btn"
            aria-label="Поиск"
            onClick={() => { setNavOpen(false); setCartOpen(false); setSearchOpen(true); }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <circle cx="10" cy="10" r="6" stroke="currentColor" strokeWidth="1.2"/>
              <line x1="14.5" y1="14.5" x2="22" y2="22" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
          </button>
          <button
            className="header-icon-btn cart-btn"
            aria-label="Корзина"
            onClick={() => { setNavOpen(false); setSearchOpen(false); setCartOpen(true); }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M9 10V8a3 3 0 0 1 6 0v2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              <rect x="3" y="10" width="18" height="12" rx="0.5" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
            </svg>
            {totalCount > 0 && <span className="cart-count">{totalCount}</span>}
          </button>
        </div>
      </header>

      <Navigation isOpen={navOpen} onClose={() => setNavOpen(false)} />
      <SearchOverlay isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
      <CartDrawer isOpen={cartOpen} onClose={() => setCartOpen(false)} />
    </>
  );
}
