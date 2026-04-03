import { useState, useEffect, useCallback } from 'react';

const PERIODS = [
  { id: 'today', label: 'Сегодня' },
  { id: '7d',    label: '7 дней' },
  { id: '30d',   label: '30 дней' },
];

const EXPORT_PERIODS = [
  { id: 'today', label: 'Сегодня' },
  { id: '7d',    label: '7 дней' },
  { id: '14d',   label: '14 дней' },
  { id: '30d',   label: '30 дней' },
];

function pad2(n) { return String(n).padStart(2, '0'); }

function fmtHour(h) { return `${pad2(h)}:00`; }

function fmtDate(dateStr) {
  const d = new Date(dateStr);
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}`;
}

function DeltaBadge({ delta, percent, showArrow = false }) {
  if (delta == null && percent == null) return null;
  const cls = delta > 0 ? 'anl-delta--up' : delta < 0 ? 'anl-delta--down' : 'anl-delta--zero';
  const arrow = delta > 0 ? '↑' : delta < 0 ? '↓' : '';
  const sign = delta > 0 ? '+' : '';
  if (showArrow && percent != null) {
    return <span className={`anl-delta ${cls}`}>{arrow} {sign}{percent}%</span>;
  }
  return <span className={`anl-delta ${cls}`}>{sign}{delta}</span>;
}

function handleExport(period) {
  const token = localStorage.getItem('iwak_admin_token');
  const url = `/api/analytics/export?period=${period}`;
  fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    .then(r => { if (!r.ok) throw new Error(r.status); return r.blob(); })
    .then(blob => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `analytics-${period}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    })
    .catch(() => {});
}

function handleExportReport(period) {
  const token = localStorage.getItem('iwak_admin_token');
  const url = `/api/analytics/export-report?period=${period}`;
  fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    .then(r => { if (!r.ok) throw new Error(r.status); return r.blob(); })
    .then(blob => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `report-${period}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    })
    .catch(() => {});
}

export default function AnalyticsTab() {
  const [period, setPeriod] = useState('7d');
  const [mode, setMode] = useState('data');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [onlineNow, setOnlineNow] = useState(null);

  const fetchAnalytics = useCallback(async (p, m) => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('iwak_admin_token');
      const res = await fetch(`/api/analytics?period=${p}&mode=${m}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const json = await res.json();
      setData(json);
      setOnlineNow(json.onlineNow ?? 0);
    } catch {
      setError('Не удалось загрузить аналитику');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAnalytics(period, mode); }, [period, mode, fetchAnalytics]);

  // Lightweight polling for onlineNow every 15s
  useEffect(() => {
    const iv = setInterval(async () => {
      try {
        const token = localStorage.getItem('iwak_admin_token');
        const res = await fetch(`/api/analytics?period=${period}&mode=${mode}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const json = await res.json();
          setOnlineNow(json.onlineNow ?? 0);
        }
      } catch { /* ignore */ }
    }, 15000);
    return () => clearInterval(iv);
  }, [period, mode]);

  // Derive compact activity data
  const peakHour = data?.activityByHour?.length
    ? data.activityByHour.reduce((a, b) => b.count > a.count ? b : a)
    : null;
  const topHours = data?.activityByHour
    ?.filter(e => e.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3) || [];

  return (
    <div className="anl">
      {/* Period selector */}
      <div className="anl-periods">
        {PERIODS.map((p) => (
          <button
            key={p.id}
            className={`adm-filter-chip${period === p.id ? ' adm-filter-chip--active' : ''}`}
            onClick={() => setPeriod(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Mode toggle */}
      <div className="anl-modes">
        <button
          className={`anl-mode-btn${mode === 'data' ? ' anl-mode-btn--active' : ''}`}
          onClick={() => setMode('data')}
        >
          Сегодня
        </button>
        <button
          className={`anl-mode-btn${mode === 'analysis' ? ' anl-mode-btn--active' : ''}`}
          onClick={() => setMode('analysis')}
        >
          Анализ
        </button>
      </div>

      {loading && <div className="anl-loading">Загрузка...</div>}
      {error && <div className="anl-error">{error}</div>}

      {/* Online indicator — always visible when data loaded */}
      {onlineNow != null && !loading && (
        <div className="anl-online">
          <span className={`anl-online__dot${onlineNow > 0 ? ' anl-online__dot--active' : ''}`} />
          <span className="anl-online__text">Сейчас на сайте: <strong>{onlineNow}</strong></span>
        </div>
      )}

      {data && !loading && (
        <>
          {/* Summary cards */}
          <div className="anl-cards">
            <div className="anl-card">
              <span className="anl-card__value">{data.visits}</span>
              {mode === 'analysis' && <DeltaBadge delta={data.visitsDelta} percent={data.visitsPercent} showArrow />}
              <span className="anl-card__label">Визиты</span>
            </div>
            <div className="anl-card">
              <span className="anl-card__value">{data.productViews}</span>
              {mode === 'analysis' && <DeltaBadge delta={data.productViewsDelta} percent={data.productViewsPercent} showArrow />}
              <span className="anl-card__label">Просмотры</span>
            </div>
            <div className="anl-card">
              <span className="anl-card__value">{data.shares}</span>
              {mode === 'analysis' && <DeltaBadge delta={data.sharesDelta} percent={data.sharesPercent} showArrow />}
              <span className="anl-card__label">Шаринг</span>
            </div>
          </div>

          {/* Activity — compact */}
          <div className="anl-section">
            <h3 className="anl-section__title">Активность</h3>
            {!peakHour ? (
              <div className="anl-empty">Нет данных</div>
            ) : (
              <div className="anl-activity">
                <div className="anl-peak">
                  <span className="anl-peak__icon">🔥</span>
                  <span className="anl-peak__text">Пик: <strong>{fmtHour(peakHour.hour)}</strong> — {peakHour.count}</span>
                </div>
                {topHours.length > 1 && (
                  <div className="anl-peak-list">
                    {topHours.map(h => (
                      <span key={h.hour} className="anl-peak-item">
                        {fmtHour(h.hour)} — {h.count}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Top products with peak hour */}
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
                      <th>👀</th>
                      <th>⏰</th>
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
                        <td className="anl-table__num">{p.views}
                          {mode === 'analysis' && p.delta != null && <DeltaBadge delta={p.delta} />}
                        </td>
                        <td className="anl-table__num anl-table__peak">
                          {p.peakHour != null ? fmtHour(p.peakHour) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Activity by day */}
          <div className="anl-section">
            <h3 className="anl-section__title">По дням</h3>
            {(!data.activityByDay || data.activityByDay.length === 0) ? (
              <div className="anl-empty">Нет данных</div>
            ) : (
              <div className="anl-table-wrap">
                <table className="anl-table">
                  <thead>
                    <tr>
                      <th>Дата</th>
                      <th>События</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.activityByDay.map((d) => (
                      <tr key={d.date}>
                        <td>{fmtDate(d.date)}</td>
                        <td className="anl-table__num">{d.count}
                          {mode === 'analysis' && d.delta != null && <DeltaBadge delta={d.delta} />}
                        </td>
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

          {/* Export */}
          <div className="anl-section">
            <h3 className="anl-section__title">📥 Экспорт</h3>
            <div className="anl-export">
              {EXPORT_PERIODS.map((p) => (
                <button
                  key={p.id}
                  className="adm-btn adm-btn--accent adm-btn--sm"
                  onClick={() => handleExport(p.id)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <h3 className="anl-section__title" style={{ marginTop: 14 }}>📊 Отчёт</h3>
            <div className="anl-export">
              {EXPORT_PERIODS.map((p) => (
                <button
                  key={p.id}
                  className="adm-btn adm-btn--accent adm-btn--sm"
                  onClick={() => handleExportReport(p.id)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
