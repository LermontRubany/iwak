import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Component } from 'react';
import { CartProvider } from './context/CartContext';
import { ProductsProvider } from './context/ProductsContext';
import { NotificationsProvider } from './context/NotificationsContext';
import AdminApp from './admin/AdminApp';
import AdminLogin from './admin/AdminLogin';
import Header from './components/Header';
import CatalogPage from './pages/CatalogPage';
import ProductPage from './pages/ProductPage';
import CartPage from './pages/CartPage';
import './index.css';
import './admin/admin.css';

function AppRoutes() {
  const location = useLocation();
  const backgroundLocation = location.state?.backgroundLocation;
  const isProduct = location.pathname.startsWith('/product/');
  const isCart = location.pathname === '/cart';
  const isOverlayRoute = isProduct || isCart;
  const baseLocation = backgroundLocation || (isOverlayRoute
    ? { ...location, pathname: '/catalog', search: '' }
    : location);

  return (
    <>
      <Header />

      <main className="main-content">
        <Routes location={baseLocation}>
          <Route path="/catalog" element={<CatalogPage />} />
          <Route path="/" element={<Navigate to="/catalog" replace />} />
        </Routes>
      </main>

      {/* ProductPage: manages its own .overlay wrapper */}
      {isProduct && (
        <Routes>
          <Route path="/product/:slug" element={<ProductPage />} />
        </Routes>
      )}

      {/* CartPage: manages its own .overlay wrapper */}
      {isCart && <CartPage />}

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

function App() {
  const isAdmin = window.location.pathname.startsWith('/adminpanel');

  if (isAdmin) {
    // Проверяем наличие JWT-токена (валидность проверится при первом API-запросе)
    const token = localStorage.getItem('iwak_admin_token');
    const authed = !!token;
    return (
      <ErrorBoundary>
      <NotificationsProvider>
      <ProductsProvider>
        {authed
          ? <AdminApp />
          : <AdminLogin onAuth={() => window.location.reload()} />
        }
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
