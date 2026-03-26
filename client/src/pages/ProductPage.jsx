import { useParams, useNavigate } from 'react-router-dom';
import { useProducts } from '../context/ProductsContext';

export default function ProductPage() {
  const { slug } = useParams();
  const { products } = useProducts();
  const navigate = useNavigate();
  // ...логика поиска товара по slug...
  return (
    <div className="product-page">
      {/* ...отображение информации о товаре... */}
      <button onClick={() => navigate('/catalog')}>Назад в каталог</button>
    </div>
  );
}
