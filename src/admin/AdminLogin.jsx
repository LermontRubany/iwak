import { useState } from 'react';

const ADMIN_PASSWORD = 'IWAK2026';
const AUTH_KEY = 'iwak_admin_auth';

export default function AdminLogin({ onAuth }) {
  const [pw, setPw] = useState('');
  const [error, setError] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (pw === ADMIN_PASSWORD) {
      localStorage.setItem(AUTH_KEY, '1');
      onAuth();
    } else {
      setError(true);
      setPw('');
      setTimeout(() => setError(false), 1500);
    }
  };

  return (
    <div className="adm-login">
      <div className="adm-login__card">
        <p className="adm-login__brand">IWAK</p>
        <p className="adm-login__title">ADMIN</p>
        <form onSubmit={handleSubmit} className="adm-login__form">
          <input
            className={`adm-input${error ? ' adm-input--error' : ''}`}
            type="password"
            placeholder="Пароль"
            value={pw}
            autoFocus
            onChange={(e) => setPw(e.target.value)}
          />
          <button className="adm-btn adm-btn--primary" type="submit">
            ВОЙТИ
          </button>
        </form>
      </div>
    </div>
  );
}
