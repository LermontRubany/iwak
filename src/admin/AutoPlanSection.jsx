import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { notifyGlobal } from '../context/NotificationsContext';
import authFetch from './authFetch';

const STRATEGY_LABELS = { newest: 'Сначала новые', priority: 'По приоритету', price_desc: 'Дорогие первыми' };
const TEMPLATE_LABELS = { basic: 'Базовый', new: 'Новинка', sale: 'Скидка', premium: 'Премиум' };
const STATUS_LABELS = { active: 'Активен', paused: 'Пауза', completed: 'Завершён', cancelled: 'Отменён' };
const STATUS_ICONS = { active: '●', paused: '⏸', completed: '✅', cancelled: '✕' };

function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}`;
}
function fmtDateTime(d) {
  if (!d) return '';
  const dt = new Date(d);
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const hh = String(dt.getHours()).padStart(2, '0');
  const mi = String(dt.getMinutes()).padStart(2, '0');
  return `${dd}.${mm} ${hh}:${mi}`;
}
function fmtTime(d) {
  if (!d) return '';
  const dt = new Date(d);
  return `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
}
function todayStr() { return new Date().toISOString().slice(0, 10); }

export default function AutoPlanSection({ products, onPlansChanged, preselectedIds, onPreselectedClear }) {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [expandedPlan, setExpandedPlan] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(false);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState('');
  const [formStrategy, setFormStrategy] = useState('newest');
  const [formTemplate, setFormTemplate] = useState('basic');
  const [formWithBadge, setFormWithBadge] = useState(false);
  const [formStartDate, setFormStartDate] = useState(todayStr());
  const [formEndDate, setFormEndDate] = useState('');
  const [formTimeSlots, setFormTimeSlots] = useState(['10:00', '14:00', '19:00']);
  const [formCategory, setFormCategory] = useState('');
  const [formGender, setFormGender] = useState('');
  const [formBrand, setFormBrand] = useState('');
  const [formOnlyUnsent, setFormOnlyUnsent] = useState(true);

  // ── Auto-open form when preselectedIds arrive ──
  const prevPreselectedRef = useRef(null);
  useEffect(() => {
    if (preselectedIds && preselectedIds.length > 0 && prevPreselectedRef.current !== preselectedIds) {
      setShowForm(true);
      setPreview(null);
    }
    prevPreselectedRef.current = preselectedIds;
  }, [preselectedIds]);

  // Preview
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // ── Load plans ──
  const loadPlans = useCallback(async () => {
    try {
      const r = await authFetch('/api/tg/plans');
      if (r.ok) setPlans(await r.json());
    } catch { /* */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadPlans(); }, [loadPlans]);

  // ── Load tasks for a plan ──
  const loadTasks = useCallback(async (planId) => {
    if (expandedPlan === planId) { setExpandedPlan(null); return; }
    setExpandedPlan(planId);
    setTasksLoading(true);
    try {
      const r = await authFetch(`/api/tg/plans/${planId}/tasks`);
      if (r.ok) setTasks(await r.json());
    } catch { /* */ }
    setTasksLoading(false);
  }, [expandedPlan]);

  // ── Derived filter options ──
  const categoryOptions = useMemo(() => {
    const cats = [...new Set((products || []).map(p => p?.category).filter(Boolean))].sort();
    return [{ val: '', label: 'Все категории' }, ...cats.map(c => ({ val: c, label: c }))];
  }, [products]);

  const brandOptions = useMemo(() => {
    const brands = [...new Set((products || []).map(p => p?.brand).filter(Boolean))].sort();
    return [{ val: '', label: 'Все бренды' }, ...brands.map(b => ({ val: b, label: b }))];
  }, [products]);

  // ── Preview ──
  const handlePreview = useCallback(async () => {
    setPreviewLoading(true);
    setPreview(null);
    try {
      const useIds = preselectedIds && preselectedIds.length > 0;
      const body = {
        ...(useIds
          ? { productIds: [...preselectedIds] }
          : { filters: {
              ...(formCategory ? { category: formCategory } : {}),
              ...(formGender ? { gender: formGender } : {}),
              ...(formBrand ? { brand: formBrand } : {}),
              onlyUnsent: formOnlyUnsent,
            } }),
        strategy: formStrategy,
        postsPerDay: formTimeSlots.length,
        timeSlots: formTimeSlots.filter(Boolean),
        startDate: formStartDate,
        endDate: formEndDate,
        template: formTemplate,
        withBadge: formWithBadge,
      };
      const r = await authFetch('/api/tg/autoplan/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await r.json();
      if (r.ok) setPreview(json);
      else notifyGlobal('error', json.error || 'Ошибка превью');
    } catch { notifyGlobal('error', 'Ошибка соединения'); }
    setPreviewLoading(false);
  }, [preselectedIds, formCategory, formGender, formBrand, formOnlyUnsent, formStrategy, formTimeSlots, formStartDate, formEndDate, formTemplate, formWithBadge]);

  // ── Create plan ──
  const handleCreate = useCallback(async () => {
    if (!formName.trim()) { notifyGlobal('error', 'Введите название плана'); return; }
    if (!formEndDate) { notifyGlobal('error', 'Укажите дату окончания'); return; }
    if (formTimeSlots.filter(Boolean).length === 0) { notifyGlobal('error', 'Добавьте хотя бы один слот времени'); return; }
    setCreating(true);
    try {
      const useIds = preselectedIds && preselectedIds.length > 0;
      const body = {
        name: formName.trim(),
        ...(useIds
          ? { productIds: [...preselectedIds] }
          : { filters: {
              ...(formCategory ? { category: formCategory } : {}),
              ...(formGender ? { gender: formGender } : {}),
              ...(formBrand ? { brand: formBrand } : {}),
              onlyUnsent: formOnlyUnsent,
            } }),
        strategy: formStrategy,
        postsPerDay: formTimeSlots.length,
        timeSlots: formTimeSlots.filter(Boolean),
        startDate: formStartDate,
        endDate: formEndDate,
        template: formTemplate,
        withBadge: formWithBadge,
      };
      const r = await authFetch('/api/tg/autoplan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await r.json();
      if (r.ok) {
        notifyGlobal('success', `План создан: ${json.totalPosts} постов`);
        setShowForm(false);
        setPreview(null);
        setFormName('');
        if (onPreselectedClear) onPreselectedClear();
        loadPlans();
        if (onPlansChanged) onPlansChanged();
      } else {
        notifyGlobal('error', json.error || 'Ошибка');
      }
    } catch { notifyGlobal('error', 'Ошибка соединения'); }
    setCreating(false);
  }, [formName, formEndDate, formTimeSlots, preselectedIds, onPreselectedClear, formCategory, formGender, formBrand, formOnlyUnsent, formStrategy, formStartDate, formTemplate, formWithBadge, loadPlans]);

  // ── Plan actions ──
  const handlePlanAction = useCallback(async (planId, action) => {
    if (action === 'delete') {
      if (!window.confirm('Удалить план и все его задачи?')) return;
      try {
        const r = await authFetch(`/api/tg/plans/${planId}`, { method: 'DELETE' });
        if (r.ok) { notifyGlobal('success', 'План удалён'); loadPlans(); if (onPlansChanged) onPlansChanged(); if (expandedPlan === planId) setExpandedPlan(null); }
        else notifyGlobal('error', 'Ошибка удаления');
      } catch { notifyGlobal('error', 'Ошибка соединения'); }
      return;
    }
    try {
      const r = await authFetch(`/api/tg/plans/${planId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (r.ok) { notifyGlobal('success', action === 'pause' ? 'Плата приостановлен' : action === 'resume' ? 'План возобновлён' : 'План отменён'); loadPlans(); if (onPlansChanged) onPlansChanged(); }
      else { const j = await r.json(); notifyGlobal('error', j.error || 'Ошибка'); }
    } catch { notifyGlobal('error', 'Ошибка соединения'); }
  }, [loadPlans, expandedPlan]);

  // ── Delete single task ──
  const handleDeleteTask = useCallback(async (taskId) => {
    try {
      const r = await authFetch(`/api/tg/schedule/${taskId}`, { method: 'DELETE' });
      if (r.ok) {
        setTasks(prev => prev.filter(t => t.id !== taskId));
        loadPlans();
        if (onPlansChanged) onPlansChanged();
      } else notifyGlobal('error', 'Ошибка удаления');
    } catch { notifyGlobal('error', 'Ошибка соединения'); }
  }, [loadPlans]);

  // ── Time slots management ──
  const updateSlot = (i, val) => setFormTimeSlots(prev => prev.map((s, j) => j === i ? val : s));
  const removeSlot = (i) => setFormTimeSlots(prev => prev.filter((_, j) => j !== i));
  const addSlot = () => setFormTimeSlots(prev => [...prev, '12:00']);

  // ── Preview grouping by date ──
  const previewByDate = useMemo(() => {
    if (!preview?.slots) return [];
    const groups = {};
    for (const s of preview.slots) {
      (groups[s.date] ||= []).push(s);
    }
    return Object.entries(groups).map(([date, items]) => ({ date, items }));
  }, [preview]);

  return (
    <div className="tg-section">
      <h3 className="tg-section__title">📅 Автоплан контента</h3>

      {loading ? <div className="tg-empty">Загрузка...</div> : (
        <>
          {/* ── Plans list ── */}
          {plans.length === 0 && !showForm && (
            <div className="autoplan-empty">
              <div className="autoplan-empty__icon">📭</div>
              <div className="autoplan-empty__text">Планов пока нет</div>
              <div className="autoplan-empty__hint">Создайте план, чтобы товары публиковались автоматически</div>
              <button className="adm-btn adm-btn--accent adm-btn--sm" onClick={() => setShowForm(true)}>+ Создать первый план</button>
            </div>
          )}

          {plans.length > 0 && (
            <div className="autoplan-plans">
              {plans.map(plan => (
                <div key={plan.id} className={`autoplan-card autoplan-card--${plan.status}`}>
                  <div className="autoplan-card__header">
                    <span className="autoplan-card__name">{plan.name}</span>
                    <div className="autoplan-card__menu">
                      {plan.status === 'active' && <button className="autoplan-card__action" title="Приостановить" onClick={() => handlePlanAction(plan.id, 'pause')}>⏸</button>}
                      {plan.status === 'paused' && <button className="autoplan-card__action" title="Возобновить" onClick={() => handlePlanAction(plan.id, 'resume')}>▶</button>}
                      {['active', 'paused'].includes(plan.status) && <button className="autoplan-card__action" title="Отменить" onClick={() => handlePlanAction(plan.id, 'cancel')}>✕</button>}
                      <button className="autoplan-card__action autoplan-card__action--delete" title="Удалить" onClick={() => handlePlanAction(plan.id, 'delete')}>🗑</button>
                    </div>
                  </div>
                  <div className="autoplan-card__status">
                    <span className={`autoplan-status autoplan-status--${plan.status}`}>
                      {STATUS_ICONS[plan.status]} {STATUS_LABELS[plan.status]}
                    </span>
                  </div>
                  <div className="autoplan-card__progress">
                    <div className="autoplan-progress">
                      <div className="autoplan-progress__bar" style={{ width: `${plan.totalPosts > 0 ? ((plan.sentCount + plan.failedCount) / plan.totalPosts * 100) : 0}%` }} />
                    </div>
                    <span className="autoplan-card__counts">{plan.sentCount + plan.failedCount} / {plan.totalPosts}</span>
                  </div>
                  <div className="autoplan-card__meta">
                    <span>📅 {fmtDate(plan.startsAt)} – {fmtDate(plan.endsAt)}</span>
                    {plan.failedCount > 0 && <span className="autoplan-card__errors">❌ {plan.failedCount} ошиб.</span>}
                  </div>
                  {plan.nextPostAt && (
                    <div className="autoplan-card__next">
                      ⏭ Следующий: {fmtDateTime(plan.nextPostAt)}{plan.nextProductName ? ` — ${plan.nextProductName}` : ''}
                    </div>
                  )}
                  <button className="autoplan-card__toggle" onClick={() => loadTasks(plan.id)}>
                    {expandedPlan === plan.id ? '▲ Скрыть задачи' : '▼ Показать задачи'}
                  </button>

                  {expandedPlan === plan.id && (
                    <div className="autoplan-tasks">
                      {tasksLoading ? <div className="tg-empty">Загрузка...</div> : (
                        tasks.length === 0 ? <div className="tg-empty">Нет задач</div> : (
                          <div className="autoplan-tasks__list">
                            {tasks.map(t => (
                              <div key={t.id} className={`autoplan-task autoplan-task--${t.status}`}>
                                <span className="autoplan-task__time">{fmtDateTime(t.scheduledAt)}</span>
                                <span className="autoplan-task__product">
                                  {t.productBrand && <strong>{t.productBrand}</strong>} {t.productName || `#${t.productId}`}
                                </span>
                                <span className={`autoplan-task__status autoplan-task__status--${t.status}`}>
                                  {t.status === 'done' ? '✅' : t.status === 'failed' ? '❌' : t.status === 'processing' ? '⏳' : '🔄'}
                                </span>
                                {t.status === 'pending' && (
                                  <button className="autoplan-task__delete" title="Удалить" onClick={() => handleDeleteTask(t.id)}>✕</button>
                                )}
                              </div>
                            ))}
                          </div>
                        )
                      )}
                    </div>
                  )}
                </div>
              ))}
              {!showForm && (
                <button className="adm-btn adm-btn--sm autoplan-new-btn" onClick={() => setShowForm(true)}>+ Новый план</button>
              )}
            </div>
          )}

          {/* ── Create form ── */}
          {showForm && (
            <div className="autoplan-form">
              <div className="autoplan-form__header">
                <h4>Новый план</h4>
                <button className="autoplan-form__close" onClick={() => { setShowForm(false); setPreview(null); if (onPreselectedClear) onPreselectedClear(); }}>✕</button>
              </div>

              <label className="tg-label">Название</label>
              <input className="adm-input" type="text" placeholder="Весенняя коллекция" value={formName} onChange={e => setFormName(e.target.value)} />

              <div className="autoplan-form__group">
                <span className="autoplan-form__group-title">Что публикуем</span>

                {preselectedIds && preselectedIds.length > 0 ? (
                  <div className="autoplan-preselected">
                    ✅ Выбрано {preselectedIds.length} товаров
                    <button className="adm-btn adm-btn--ghost adm-btn--sm" onClick={() => { if (onPreselectedClear) onPreselectedClear(); }}>Сброс</button>
                  </div>
                ) : (
                  <>
                    <div className="autoplan-form__row">
                      <div className="autoplan-form__field">
                        <label className="tg-label">Категория</label>
                        <select className="adm-input" value={formCategory} onChange={e => setFormCategory(e.target.value)}>
                          {categoryOptions.map(o => <option key={o.val} value={o.val}>{o.label}</option>)}
                        </select>
                      </div>
                      <div className="autoplan-form__field">
                        <label className="tg-label">Пол</label>
                        <select className="adm-input" value={formGender} onChange={e => setFormGender(e.target.value)}>
                          <option value="">Все</option>
                          <option value="mens">Мужское</option>
                          <option value="womens">Женское</option>
                          <option value="kids">Детское</option>
                          <option value="unisex">Унисекс</option>
                        </select>
                      </div>
                      <div className="autoplan-form__field">
                        <label className="tg-label">Бренд</label>
                        <select className="adm-input" value={formBrand} onChange={e => setFormBrand(e.target.value)}>
                          {brandOptions.map(o => <option key={o.val} value={o.val}>{o.label}</option>)}
                        </select>
                      </div>
                    </div>

                    <label className="autoplan-checkbox">
                      <input type="checkbox" checked={formOnlyUnsent} onChange={e => setFormOnlyUnsent(e.target.checked)} />
                      Только не отправленные в TG
                    </label>
                  </>
                )}

                <label className="tg-label">Стратегия</label>
                <div className="autoplan-radio-group">
                  {Object.entries(STRATEGY_LABELS).map(([k, v]) => (
                    <label key={k} className="autoplan-radio">
                      <input type="radio" name="strategy" value={k} checked={formStrategy === k} onChange={() => setFormStrategy(k)} />
                      {v}
                    </label>
                  ))}
                </div>

                <label className="tg-label">Шаблон</label>
                <div className="autoplan-radio-group">
                  {Object.entries(TEMPLATE_LABELS).map(([k, v]) => (
                    <label key={k} className="autoplan-radio">
                      <input type="radio" name="template" value={k} checked={formTemplate === k} onChange={() => setFormTemplate(k)} />
                      {v}
                    </label>
                  ))}
                </div>

                <label className="autoplan-checkbox">
                  <input type="checkbox" checked={formWithBadge} onChange={e => setFormWithBadge(e.target.checked)} />
                  С бейджем на фото
                </label>
              </div>

              <div className="autoplan-form__group">
                <span className="autoplan-form__group-title">Когда публикуем</span>

                <div className="autoplan-form__row">
                  <div className="autoplan-form__field">
                    <label className="tg-label">Начало</label>
                    <input className="adm-input" type="date" value={formStartDate} onChange={e => setFormStartDate(e.target.value)} />
                  </div>
                  <div className="autoplan-form__field">
                    <label className="tg-label">Конец</label>
                    <input className="adm-input" type="date" value={formEndDate} onChange={e => setFormEndDate(e.target.value)} />
                  </div>
                </div>

                <label className="tg-label">Время постов</label>
                <div className="autoplan-slots">
                  {formTimeSlots.map((slot, i) => (
                    <div key={i} className="autoplan-slot">
                      <input className="adm-input autoplan-slot__input" type="time" value={slot} onChange={e => updateSlot(i, e.target.value)} />
                      {formTimeSlots.length > 1 && <button className="autoplan-slot__remove" onClick={() => removeSlot(i)}>✕</button>}
                    </div>
                  ))}
                  {formTimeSlots.length < 10 && <button className="adm-btn adm-btn--ghost adm-btn--sm" onClick={addSlot}>+ слот</button>}
                </div>
              </div>

              <div className="autoplan-form__actions">
                <button className="adm-btn adm-btn--sm" onClick={handlePreview} disabled={previewLoading || !formEndDate}>
                  {previewLoading ? 'Загрузка...' : '👁 Превью'}
                </button>
                <button className="adm-btn adm-btn--accent adm-btn--sm" onClick={handleCreate} disabled={creating || !formEndDate || !formName.trim()}>
                  {creating ? 'Создание...' : '✅ Создать план'}
                </button>
              </div>

              {/* ── Preview ── */}
              {preview && (
                <div className="autoplan-preview">
                  <div className="autoplan-preview__summary">
                    📊 {preview.uniqueProducts} товар(ов) → {preview.totalPosts} постов за {preview.days} дн.
                    {preview.repeats > 0 && <span className="autoplan-preview__warn"> ⚠️ {preview.repeats} повторов</span>}
                  </div>
                  <div className="autoplan-preview__table">
                    {previewByDate.map(({ date, items }) => (
                      <div key={date} className="autoplan-preview__day">
                        <div className="autoplan-preview__date">{new Date(date + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', weekday: 'short' })}</div>
                        {items.map((s, i) => (
                          <div key={i} className={`autoplan-preview__row${s.isRepeat ? ' autoplan-preview__row--repeat' : ''}`}>
                            <span className="autoplan-preview__time">{s.time}</span>
                            {s.productImage && <img className="autoplan-preview__img" src={s.productImage} alt="" />}
                            <span className="autoplan-preview__name">{s.productBrand ? `${s.productBrand} ` : ''}{s.productName}</span>
                            <span className="autoplan-preview__price">₽{s.productPrice?.toLocaleString('ru-RU')}</span>
                            {s.isRepeat && <span className="autoplan-preview__repeat">🔄</span>}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                  <button className="adm-btn adm-btn--ghost adm-btn--sm" onClick={() => setPreview(null)}>Свернуть</button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
