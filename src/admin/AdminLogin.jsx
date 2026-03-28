import { useState } from 'react';

export default function AdminLogin({ onAuth }) {
  const [login, setLogin] = useState('');
  const [pw, setPw] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(false);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: login || 'admin', password: pw }),
      });
      const data = await res.json();
      if (res.ok && data.token) {
        localStorage.setItem('iwak_admin_token', data.token);
        onAuth();
      } else {
        setError(true);
        setPw('');
        setTimeout(() => setError(false), 1500);
      }
    } catch {
      setError(true);
      setPw('');
      setTimeout(() => setError(false), 1500);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="adm-login">
      <div className="adm-login__card">
        <p className="adm-login__brand">IWAK</p>
        <p className="adm-login__title">ADMIN</p>
        <form onSubmit={handleSubmit} className="adm-login__form">
          <input
            className="adm-input"
            type="text"
            placeholder="Логин"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
          />
          <input
            className={`adm-input${error ? ' adm-input--error' : ''}`}
            type="password"
            placeholder="Пароль"
            value={pw}
            autoFocus
            onChange={(e) => setPw(e.target.value)}
          />
          <button className="adm-btn adm-btn--primary" type="submit" disabled={loading}>
            {loading ? 'ВХОД...' : 'ВОЙТИ'}
          </button>
        </form>
      </div>
    </div>
  );
}
