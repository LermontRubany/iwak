import { Link } from 'react-router-dom';
export default function Header() {
  return (
    <header className="site-header">
      <Link to="/catalog" className="logo">IWAK</Link>
      <nav>
        <Link to="/catalog">Каталог</Link>
        <Link to="/cart">Корзина</Link>
      </nav>
    </header>
  );
}
