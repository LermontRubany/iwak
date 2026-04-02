import { useState, useEffect, useCallback } from 'react';

const PERIODS = [
  { id: 'today', label: 'Сегодня' },
  { id: '7d',    label: '7 дней' },
  { id: '30d',   label: '30 дней' },
];

export default function AnalyticsTab() {
  const [period, setPeriod] = useState('7d');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAnalytics = useCallback(async (p) => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('iwak_admin_token');
      const res = await fetch(`/api/analytics?period=${p}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setData(await res.json());
    } catch {
      setError('Не удалось загрузить аналитику');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAnalytics(period); }, [period, fetchAnalytics]);

  const handlePeriod = (p) => { setPeriod(p); };

  return (
    <div className="anl">
      {/* Period selector */}
      <div className="anl-periods">
        {PERIODS.map((p) => (
          <button
            key={p.id}
            className={`adm-filter-chip${period === p.id ? ' adm-filter-chip--active' : ''}`}
            onClick={() => handlePeriod(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {loading && <div className="anl-loading">Загрузка...</div>}
      {error && <div className="anl-error">{error}</div>}

      {data && !loading && (
        <>
          {/* Summary cards */}
          <div className="anl-cards">
            <div className="anl-card">
              <span className="anl-card__value">{data.visits}</span>
              <span className="anl-card__label">Визиты</span>
            </div>
            <div className="anl-card">
              <span className="anl-card__value">{data.productViews}</span>
              <span className="anl-card__label">Просмотры товаров</span>
            </div>
            <div className="anl-card">
              <span className="anl-card__value">{data.shares}</span>
              <span className="anl-card__label">Шаринг</span>
            </div>
          </div>

          {/* Top products */}
          <div className="anl-section">
            <h3 className="anl-section__title">Топ товаров</h3>
            {data.topProducts.length === 0 ? (
              <div className="anl-empty">Нет данных</div>
            ) : (
              <div className="anl-table-wrap">
                <table className="anl-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Товар</th>
                      <th>Просмотры</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topProducts.map((p, i) => (
                      <tr key={p.productId}>
                        <td className="anl-table__rank">{i + 1}</td>
                        <td>
                          <span className="anl-table__brand">{p.brand}</span>
                          {' '}
                          <span>{p.name || `#${p.productId}`}</span>
                        </td>
                        <td className="anl-table__num">{p.views}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Top cities */}
          <div className="anl-section">
            <h3 className="anl-section__title">География</h3>
            {data.topCities.length === 0 ? (
              <div className="anl-empty">Нет данных</div>
            ) : (
              <div className="anl-table-wrap">
                <table className="anl-table">
                  <thead>
                    <tr>
                      <th>Город</th>
                      <th>Визиты</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topCities.map((c) => (
                      <tr key={c.city}>
                        <td>{c.city}</td>
                        <td className="anl-table__num">{c.visits}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
