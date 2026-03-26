import { useNavigate } from 'react-router-dom';

export default function HomePage() {
  const navigate = useNavigate();
  return (
    <div className="home-page">
      <h1>Добро пожаловать в IWAK</h1>
      <button onClick={() => navigate('/catalog')}>Перейти в каталог</button>
    </div>
  );
}
