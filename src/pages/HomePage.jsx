import { useNavigate } from 'react-router-dom';
import { products } from '../data/products';
import ProductCard from '../components/ProductCard';

export default function HomePage() {
  const navigate = useNavigate();
  const featured = products.filter((p) => p.featured).slice(0, 6);
  const goToCatalog = (search = '') => {
    navigate({ pathname: '/catalog', search }, { replace: true });
  };

  return (
    <div className="home-page">
      <section className="hero">
        <div className="hero__content">
          <p className="hero__sub">НОВАЯ КОЛЛЕКЦИЯ</p>
          <h1 className="hero__title">IWAK</h1>
          <p className="hero__desc">Минималистичная одежда для тех, кто ценит качество и стиль</p>
          <button className="hero__btn" onClick={() => goToCatalog()}>
            СМОТРЕТЬ КОЛЛЕКЦИЮ
          </button>
        </div>
      </section>

      <section className="home-section">
        <div className="section-header">
          <h2 className="section-title">ИЗБРАННОЕ</h2>
          <button className="section-link" onClick={() => goToCatalog()}>
            Все товары →
          </button>
        </div>
        <div className="product-grid">
          {featured.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>

      <section className="categories-section">
        <div className="categories-grid">
          <div className="cat-card cat-card--mens" onClick={() => goToCatalog('?gender=mens')}>
            <div className="cat-card__overlay">
              <span className="cat-card__label">МУЖСКОЕ</span>
            </div>
          </div>
          <div className="cat-card cat-card--womens" onClick={() => goToCatalog('?gender=womens')}>
            <div className="cat-card__overlay">
              <span className="cat-card__label">ЖЕНСКОЕ</span>
            </div>
          </div>
          <div className="cat-card cat-card--kids" onClick={() => goToCatalog('?gender=kids')}>
            <div className="cat-card__overlay">
              <span className="cat-card__label">ДЕТСКОЕ</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
