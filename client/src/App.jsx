import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { CartProvider } from './context/CartContext';
import { ProductsProvider } from './context/ProductsContext';
import Header from './components/Header';
import CatalogPage from './pages/CatalogPage';
import ProductPage from './pages/ProductPage';
import CartPage from './pages/CartPage';
import './index.css';

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
      {isProduct && (
        <Routes>
          <Route path="/product/:slug" element={<ProductPage />} />
        </Routes>
      )}
      {isCart && <CartPage />}
      <footer className="site-footer">
        <p>© 2026 IWAK. Все права защищены.</p>
      </footer>
    </>
  );
}

export default function App() {
  return (
    <ProductsProvider>
      <CartProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </CartProvider>
    </ProductsProvider>
  );
}
