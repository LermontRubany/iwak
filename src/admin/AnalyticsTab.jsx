import { useState, useEffect, useCallback } from 'react';
import authFetch from './authFetch';

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

const COUNTRY_LABELS = {
  RU: 'Россия',
  BY: 'Беларусь',
  KZ: 'Казахстан',
  KG: 'Кыргызстан',
  AM: 'Армения',
  GE: 'Грузия',
  UZ: 'Узбекистан',
  TJ: 'Таджикистан',
  AZ: 'Азербайджан',
  TR: 'Турция',
  AE: 'ОАЭ',
  US: 'США',
  NL: 'Нидерланды',
};

function fmtCountry(code) {
  if (!code || code === 'Неизвестно') return 'Неизвестно';
  return COUNTRY_LABELS[code] || code;
}

function DeltaBadge({ delta, percent, isNew, showArrow = false }) {
  if (delta == null && percent == null) return null;
  if (isNew && delta > 0) {
    return <span className="anl-delta anl-delta--new">new</span>;
  }
  const cls = delta > 0 ? 'anl-delta--up' : delta < 0 ? 'anl-delta--down' : 'anl-delta--zero';
  const arrow = delta > 0 ? '↑' : delta < 0 ? '↓' : '';
  const sign = delta > 0 ? '+' : '';
  if (showArrow && percent != null) {
    return <span className={`anl-delta ${cls}`}>{arrow} {sign}{percent}%</span>;
  }
  return <span className={`anl-delta ${cls}`}>{sign}{delta}</span>;
}

function handleExport(period) {
  const url = `/api/analytics/export?period=${period}`;
  authFetch(url)
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
  const url = `/api/analytics/export-report?period=${period}`;
  authFetch(url)
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
  const [onlineStale, setOnlineStale] = useState(false);

  const fetchAnalytics = useCallback(async (p, m) => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`/api/analytics?period=${p}&mode=${m}`);
      if (!res.ok) throw new Error(`${res.status}`);
      const json = await res.json();
      setData(json);
      setOnlineNow(json.onlineNow ?? 0);
      setOnlineStale(false);
    } catch {
      setError('Не удалось загрузить аналитику');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAnalytics(period, mode); }, [period, mode, fetchAnalytics]);

  // Lightweight polling for onlineNow every 15s (dedicated endpoint)
  useEffect(() => {
    let failCount = 0;
    const iv = setInterval(async () => {
      try {
        const res = await authFetch('/api/analytics/online');
        if (res.ok) {
          const json = await res.json();
          setOnlineNow(json.onlineNow ?? 0);
          setOnlineStale(false);
          failCount = 0;
        } else {
          failCount++;
        }
      } catch {
        failCount++;
      }
      if (failCount >= 3) setOnlineStale(true);
    }, 15000);
    return () => clearInterval(iv);
  }, []);

  // Derive compact activity data
  const peakHour = data?.activityByHour?.length
    ? data.activityByHour.reduce((a, b) => b.count > a.count ? b : a)
    : null;
  const topHours = data?.activityByHour
    ?.filter(e => e.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3) || [];
  const attentionProducts = data?.funnel?.topCartProducts
    ?.filter((p) => p.adds >= 2 || p.buyNows > 0)
    .filter((p) => p.checkouts === 0 || p.abandonRate >= 80)
    .map((p) => {
      let reason = 'Высокий интерес, слабое оформление';
      if (p.checkouts === 0 && p.buyNows > 0) reason = 'Нажимали купить, но не оформили';
      else if (p.checkouts === 0) reason = 'Кладут в корзину, но не оформляют';
      else if (p.abandonRate >= 80) reason = 'Большая часть корзин не дошла до оформления';
      return { ...p, reason };
    })
    .sort((a, b) => (b.adds + b.buyNows * 2) - (a.adds + a.buyNows * 2))
    .slice(0, 6) || [];

  return (
    <div className="anl">
      <div className="anl-topbar">
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

        <div className="anl-modes">
          <button
            className={`anl-mode-btn${mode === 'data' ? ' anl-mode-btn--active' : ''}`}
            onClick={() => setMode('data')}
          >
            Данные
          </button>
          <button
            className={`anl-mode-btn${mode === 'analysis' ? ' anl-mode-btn--active' : ''}`}
            onClick={() => setMode('analysis')}
          >
            Сравнение
          </button>
        </div>
      </div>

      {loading && <div className="anl-loading">Загрузка...</div>}
      {error && <div className="anl-error">{error}</div>}

      {/* Online indicator — always visible when data loaded */}
      {onlineNow != null && !loading && (
        <div className={`anl-online${onlineStale ? ' anl-online--stale' : ''}`}>
          <span className={`anl-online__dot${onlineNow > 0 && !onlineStale ? ' anl-online__dot--active' : ''}`} />
          <span className="anl-online__text">
            {onlineStale ? 'Нет связи' : <>Сейчас на сайте: <strong>{onlineNow}</strong></>}
          </span>
        </div>
      )}

      {data && !loading && (
        <>
          {/* Summary cards */}
          <div className={`anl-cards${data.funnel ? ' anl-cards--overview' : ''}`}>
            <div className="anl-card">
              <span className="anl-card__value">{data.visits}</span>
              {mode === 'analysis' && <DeltaBadge delta={data.visitsDelta} percent={data.visitsPercent} isNew={data.visitsIsNew} showArrow />}
              <span className="anl-card__label">Визиты</span>
            </div>
            <div className="anl-card">
              <span className="anl-card__value">{data.productViews}</span>
              {mode === 'analysis' && <DeltaBadge delta={data.productViewsDelta} percent={data.productViewsPercent} isNew={data.productViewsIsNew} showArrow />}
              <span className="anl-card__label">Просмотры</span>
            </div>
            {data.funnel ? (
              <>
                <div className="anl-card">
                  <span className="anl-card__value">{data.funnel.cartAdds}</span>
                  <span className="anl-card__label">В корзину</span>
                </div>
                <div className="anl-card">
                  <span className="anl-card__value">{data.funnel.checkoutClicks}</span>
                  <span className="anl-card__label">Оформить</span>
                </div>
              </>
            ) : (
              <div className="anl-card">
                <span className="anl-card__value">{data.shares}</span>
                {mode === 'analysis' && <DeltaBadge delta={data.sharesDelta} percent={data.sharesPercent} isNew={data.sharesIsNew} showArrow />}
                <span className="anl-card__label">Шаринг</span>
              </div>
            )}
          </div>

          {data.pwa && (
            <div className="anl-section">
              <div className="anl-section__head">
                <h3 className="anl-section__title">PWA приложение</h3>
                <span className="anl-section__hint">iPhone считает установку по открытию с экрана Домой</span>
              </div>
              <div className="anl-cards anl-cards--pwa">
                <div className="anl-card">
                  <span className="anl-card__value">{data.pwa.installUsers}</span>
                  <span className="anl-card__label">Поставили</span>
                </div>
                <div className="anl-card">
                  <span className="anl-card__value">{data.pwa.opened}</span>
                  <span className="anl-card__label">Открытий как приложение</span>
                </div>
                <div className="anl-card">
                  <span className="anl-card__value">{data.pwa.hintShown}</span>
                  <span className="anl-card__label">Показов подсказки</span>
                </div>
                <div className="anl-card">
                  <span className="anl-card__value">{data.pwa.hintClosed}</span>
                  <span className="anl-card__label">Закрыли подсказку</span>
                </div>
              </div>
            </div>
          )}

          {/* Activity — compact */}
          {data.funnel && (
            <>
              <div className="anl-section">
                <h3 className="anl-section__title">Воронка продаж</h3>

                <div className="anl-funnel">
                  <div className="anl-funnel__row">
                    <span className="anl-funnel__label">Просмотры</span>
                    <div className="anl-funnel__bar" style={{ width: '100%' }} />
                    <span className="anl-funnel__val">{data.productViews}</span>
                  </div>
                  <div className="anl-funnel__row">
                    <span className="anl-funnel__label">В корзину</span>
                    <div className="anl-funnel__bar anl-funnel__bar--cart" style={{ width: `${Math.min(data.funnel.viewToCart * 3, 100)}%` }} />
                    <span className="anl-funnel__val">{data.funnel.cartAdds} ({data.funnel.viewToCart}%)</span>
                  </div>
                  <div className="anl-funnel__row">
                    <span className="anl-funnel__label">Купить</span>
                    <div className="anl-funnel__bar anl-funnel__bar--buy" style={{ width: `${Math.min(data.funnel.viewToBuyNow * 3, 100)}%` }} />
                    <span className="anl-funnel__val">{data.funnel.buyNows} ({data.funnel.viewToBuyNow}%)</span>
                  </div>
                  <div className="anl-funnel__row">
                    <span className="anl-funnel__label">Оформить</span>
                    <div className="anl-funnel__bar anl-funnel__bar--checkout" style={{ width: `${Math.min(data.funnel.cartToCheckout * 3, 100)}%` }} />
                    <span className="anl-funnel__val">{data.funnel.checkoutClicks} ({data.funnel.cartToCheckout}%)</span>
                  </div>
                </div>
              </div>

              {data.funnel.cartValue > 0 && (
                <div className="anl-section">
                  <h3 className="anl-section__title">Потенциал корзин</h3>
                  <div className="anl-cards anl-cards--money">
                    <div className="anl-card">
                      <span className="anl-card__value">₽{Math.round(data.funnel.cartValue).toLocaleString('ru-RU')}</span>
                      <span className="anl-card__label">Положили в корзину</span>
                    </div>
                    <div className="anl-card">
                      <span className="anl-card__value">₽{Math.round(data.funnel.checkoutValue).toLocaleString('ru-RU')}</span>
                      <span className="anl-card__label">Оформили</span>
                    </div>
                    <div className="anl-card" style={{ background: data.funnel.lostValue > 0 ? '#fff5f5' : undefined }}>
                      <span className="anl-card__value" style={{ color: data.funnel.lostValue > 0 ? '#e53935' : undefined }}>₽{Math.round(data.funnel.lostValue).toLocaleString('ru-RU')}</span>
                      <span className="anl-card__label">Упущено</span>
                    </div>
                  </div>
                </div>
              )}

              {attentionProducts.length > 0 && (
                <div className="anl-section">
                  <h3 className="anl-section__title">Товары требуют внимания</h3>
                  <div className="anl-attention-list">
                    {attentionProducts.map((p) => (
                      <div key={p.productId} className="anl-attention-card">
                        <div className="anl-attention-card__main">
                          <span className="anl-table__brand">{p.brand}</span>{' '}
                          <span>{p.name || `#${p.productId}`}</span>
                          {p.price && <span className="anl-attention-card__price"> ₽{p.price.toLocaleString('ru-RU')}</span>}
                        </div>
                        <div className="anl-attention-card__reason">{p.reason}</div>
                        <div className="anl-attention-card__stats">
                          <span>В корзину: <strong>{p.adds}</strong></span>
                          <span>Купить: <strong>{p.buyNows}</strong></span>
                          <span>Оформить: <strong>{p.checkouts}</strong></span>
                          <span>Потеря: <strong>{p.abandonRate}%</strong></span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {data.funnel.topCartProducts.length > 0 && (
                <div className="anl-section">
                  <h3 className="anl-section__title">Топ спроса</h3>
                  <div className="anl-table-wrap">
                    <table className="anl-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Товар</th>
                          <th>🛒</th>
                          <th>⚡</th>
                          <th>💳</th>
                          <th>Потеря</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.funnel.topCartProducts.map((p, i) => (
                          <tr key={p.productId}>
                            <td className="anl-table__rank">{i + 1}</td>
                            <td>
                              <span className="anl-table__brand">{p.brand}</span>{' '}
                              <span>{p.name || `#${p.productId}`}</span>
                              {p.price && <span style={{ color: '#888', fontSize: '0.85em' }}> ₽{p.price.toLocaleString('ru-RU')}</span>}
                            </td>
                            <td className="anl-table__num">{p.adds}</td>
                            <td className="anl-table__num">{p.buyNows}</td>
                            <td className="anl-table__num">{p.checkouts}</td>
                            <td className="anl-table__num" style={{ color: p.abandonRate > 80 ? '#e53935' : p.abandonRate > 50 ? '#ff9800' : '#4caf50' }}>
                              {p.abandonRate}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {data.funnel.topSizes.length > 0 && (
                <div className="anl-section">
                  <h3 className="anl-section__title">Популярные размеры</h3>
                  <div className="anl-peak-list" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {data.funnel.topSizes.map(s => (
                      <span key={s.size} className="anl-peak-item">
                        <strong>{s.size}</strong> — {s.count}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          <div className="anl-section">
            <h3 className="anl-section__title">Пик активности</h3>
            {!peakHour ? (
              <div className="anl-empty">Нет данных</div>
            ) : (
              <div className="anl-activity">
                <div className="anl-peak">
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

          <div className="anl-section">
            <h3 className="anl-section__title">География</h3>
            {data.topCities.length === 0 && (!data.topCountries || data.topCountries.length === 0) && (!data.topDevices || data.topDevices.length === 0) ? (
              <div className="anl-empty">Нет данных</div>
            ) : (
              <div className="anl-geo-grid">
                <GeoTable title="Страны" rows={(data.topCountries || []).map((c) => ({ label: fmtCountry(c.country), visits: c.visits }))} />
                <GeoTable title="Города" rows={(data.topCities || []).map((c) => ({ label: c.city, visits: c.visits }))} />
                <GeoTable title="Устройства" rows={(data.topDevices || []).map((d) => ({ label: d.device, visits: d.visits }))} />
              </div>
            )}
          </div>

          <div className="anl-section anl-section--export">
            <h3 className="anl-section__title">Экспорт</h3>
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
            <h3 className="anl-section__title" style={{ marginTop: 14 }}>Отчёт</h3>
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

function GeoTable({ title, rows }) {
  return (
    <div className="anl-geo-card">
      <h4>{title}</h4>
      {rows.length === 0 ? (
        <div className="anl-geo-empty">Нет данных</div>
      ) : (
        <table className="anl-table anl-table--compact">
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <td>{row.label || 'Неизвестно'}</td>
                <td className="anl-table__num">{row.visits}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
