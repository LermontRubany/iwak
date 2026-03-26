import { useCart } from '../context/CartContext';

export default function CartPage() {
  const { items } = useCart();
  // ...логика отображения корзины...
  return (
    <div className="cart-page">
      <h2>Корзина</h2>
      {/* ...отображение товаров в корзине... */}
      {items.length === 0 ? <p>Корзина пуста</p> : <ul>{items.map(i => <li key={i.id}>{i.name}</li>)}</ul>}
    </div>
  );
}
