import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { preloadCartPage } from '../utils/preloadRoutes';
import Navigation from './Navigation';
import SearchOverlay from './SearchOverlay';

export default function Header() {
  const { totalCount } = useCart();
  const [navOpen, setNavOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [onDark, setOnDark] = useState(false);
  const [cartPulse, setCartPulse] = useState(false);
  const [menuPulse, setMenuPulse] = useState(false);
  const [searchPulse, setSearchPulse] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const menuParam = searchParams.get('menu') === '1';
  const isSearchMode = searchOpen || (location.pathname.startsWith('/catalog') && !!searchParams.get('q'));

  // Закрываем все drawer при смене маршрута
  useEffect(() => {
    setNavOpen(menuParam && location.pathname.startsWith('/catalog'));
    setSearchOpen(false);
  }, [location.pathname, location.search, menuParam]);

  const openMenu = () => {
    setSearchOpen(false);
    if (!location.pathname.startsWith('/catalog')) {
      navigate({ pathname: '/catalog', search: '?menu=1' });
      return;
    }
    const next = new URLSearchParams(location.search);
    next.set('menu', '1');
    navigate({ pathname: location.pathname, search: `?${next.toString()}` }, { replace: true });
    setNavOpen(true);
  };

  const closeMenu = () => {
    setNavOpen(false);
    if (!menuParam) return;
    const next = new URLSearchParams(location.search);
    next.delete('menu');
    const search = next.toString();
    navigate({ pathname: location.pathname, search: search ? `?${search}` : '' }, { replace: true });
  };

  const toggleMenu = () => {
    setMenuPulse(false);
    window.requestAnimationFrame(() => setMenuPulse(true));
    window.setTimeout(() => setMenuPulse(false), 360);
    if (navOpen) closeMenu();
    else openMenu();
  };

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

  useEffect(() => {
    const handlePulse = () => {
      setCartPulse(false);
      window.requestAnimationFrame(() => setCartPulse(true));
      window.setTimeout(() => setCartPulse(false), 520);
    };
    window.addEventListener('iwak:cart-pulse', handlePulse);
    return () => window.removeEventListener('iwak:cart-pulse', handlePulse);
  }, []);

  return (
    <>
      <header className={`site-header${onDark ? ' site-header--light' : ''}`}>
        <div className="header-left">
          {!isSearchMode && (
            <button
              className={`header-icon-btn menu-btn${menuPulse ? ' header-icon-btn--tap-pulse' : ''}`}
              onClick={toggleMenu}
              aria-label={navOpen ? 'Закрыть меню' : 'Меню'}
            >
              <svg width="20" height="9" viewBox="0 0 20 9" fill="none">
                <line x1="0" y1="0.5" x2="20" y2="0.5" stroke="currentColor" strokeWidth="1"/>
                <line x1="0" y1="8.5" x2="20" y2="8.5" stroke="currentColor" strokeWidth="1"/>
              </svg>
            </button>
          )}
        </div>

        <button onClick={handleLogoClick} className="site-logo">IWAK</button>

        <div className="header-right">
          <button
            className={`header-icon-btn${searchPulse ? ' header-icon-btn--tap-pulse' : ''}`}
            aria-label="Поиск"
            onClick={() => {
              setSearchPulse(false);
              window.requestAnimationFrame(() => setSearchPulse(true));
              window.setTimeout(() => setSearchPulse(false), 360);
              closeMenu();
              setSearchOpen(true);
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <circle cx="10" cy="10" r="6" stroke="currentColor" strokeWidth="1.2"/>
              <line x1="14.5" y1="14.5" x2="22" y2="22" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
          </button>
          <button
            className={`header-icon-btn cart-btn${cartPulse ? ' cart-btn--pulse' : ''}`}
            aria-label="Корзина"
            onMouseEnter={preloadCartPage}
            onTouchStart={preloadCartPage}
            onClick={() => {
              preloadCartPage();
              closeMenu();
              setSearchOpen(false);
              navigate('/cart', {
                state: { backgroundLocation: { pathname: location.pathname, search: location.search } },
              });
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M9 10V8a3 3 0 0 1 6 0v2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              <rect x="3" y="10" width="18" height="12" rx="0.5" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
            </svg>
            {totalCount > 0 && <span className="cart-count">{totalCount}</span>}
          </button>
        </div>
      </header>

      <Navigation isOpen={navOpen} onClose={closeMenu} />
      <SearchOverlay isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
