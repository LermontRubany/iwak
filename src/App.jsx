import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Component, Suspense, lazy, useState, useEffect } from 'react';
import { CartProvider } from './context/CartContext';
import { ProductsProvider } from './context/ProductsContext';
import { NotificationsProvider, notifyGlobal } from './context/NotificationsContext';
import { isTokenValid, tokenMinutesLeft, resetAuthGuard } from './admin/authFetch';
import Header from './components/Header';
import PromoBanner from './components/PromoBanner';
import PwaInstallHint from './components/PwaInstallHint';
import PwaPushPrompt from './components/PwaPushPrompt';
import CatalogPage from './pages/CatalogPage';
import { preloadAdminApp, preloadAdminLogin, preloadCartPage, preloadProductPage } from './utils/preloadRoutes';
import './index.css';

const AdminApp = lazy(preloadAdminApp);
const AdminLogin = lazy(preloadAdminLogin);
const ProductPage = lazy(preloadProductPage);
const CartPage = lazy(preloadCartPage);

function AppRoutes() {
  const location = useLocation();
  const backgroundLocation = location.state?.backgroundLocation;
  const isProduct = location.pathname.startsWith('/product/');
  const isCart = location.pathname === '/cart';
  const isOverlayRoute = isProduct || isCart;
  const baseLocation = backgroundLocation || (isOverlayRoute
    ? { ...location, pathname: '/catalog', search: '' }
    : location);

  useEffect(() => {
    if (!location.pathname.startsWith('/catalog')) return undefined;
    const timer = window.setTimeout(() => {
      preloadProductPage();
      preloadCartPage();
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [location.pathname]);

  return (
    <>
      <Header />

      <main className="main-content">
        <PromoBanner position="top" />
        <Routes location={baseLocation}>
          <Route path="/catalog" element={<CatalogPage />} />
          <Route path="/" element={<Navigate to="/catalog" replace />} />
        </Routes>
      </main>

      {/* ProductPage: manages its own .overlay wrapper */}
      {isProduct && (
        <Suspense fallback={null}>
          <Routes>
            <Route path="/product/:slug" element={<ProductPage />} />
          </Routes>
        </Suspense>
      )}

      {/* CartPage: manages its own .overlay wrapper */}
      {isCart && (
        <Suspense fallback={null}>
          <CartPage />
        </Suspense>
      )}

      <PromoBanner position="bottom" />
      <PwaInstallHint />
      <PwaPushPrompt />

      <footer className="site-footer">
        <p>© 2026 IWAK. Все права защищены.</p>
      </footer>
    </>
  );
}

class ErrorBoundary extends Component {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error, info) {
    console.error('UI CRASH:', error.message, error.stack, info?.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <h2>Что-то пошло не так</h2>
          <button onClick={() => window.location.reload()}
            style={{ marginTop: 16, padding: '8px 24px', cursor: 'pointer' }}>
            Обновить страницу
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/** Soft-expiry: shows toast when JWT is about to expire */
function SessionExpiryWarning() {
  const [warned, setWarned] = useState(false);
  useEffect(() => {
    const check = () => {
      if (warned) return;
      const mins = tokenMinutesLeft();
      if (mins > 0 && mins <= 10) {
        setWarned(true);
        notifyGlobal('warning', `Сессия истекает через ${mins} мин. Сохраните работу.`);
      }
    };
    check();
    const iv = setInterval(check, 60000);
    return () => clearInterval(iv);
  }, [warned]);
  return null;
}

function App() {
  const isAdmin = window.location.pathname.startsWith('/adminpanel');

  if (isAdmin) {
    const authed = isTokenValid();
    const handleAuth = () => {
      resetAuthGuard();
      window.location.reload();
    };
    return (
      <ErrorBoundary>
      <NotificationsProvider>
      <ProductsProvider>
        <Suspense fallback={<div style={{ padding: 40, textAlign: 'center' }}>Загрузка...</div>}>
          {authed
            ? <>
                <SessionExpiryWarning />
                <AdminApp />
              </>
            : <AdminLogin onAuth={handleAuth} />
          }
        </Suspense>
      </ProductsProvider>
      </NotificationsProvider>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
    <ProductsProvider>
      <CartProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </CartProvider>
    </ProductsProvider>
    </ErrorBoundary>
  );
}

export default App;
