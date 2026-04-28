import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { notifyGlobal } from '../context/NotificationsContext';
import authFetch from './authFetch';
import ButtonConstructor from './ButtonConstructor';

const STRATEGY_LABELS = { newest: 'Сначала новые', priority: 'По приоритету', price_desc: 'Дорогие первыми' };
const TEMPLATE_LABELS = { basic: 'Базовый', new: 'Новинка', sale: 'Скидка', premium: 'Премиум' };
const STATUS_LABELS = { active: 'Активен', paused: 'Пауза', completed: 'Завершён', cancelled: 'Отменён' };
const STATUS_ICONS = { active: '●', paused: '⏸', completed: '✅', cancelled: '✕' };
const MAX_AUTOPLAN_POSTS = 100;

const FALLBACK_PRODUCT_BUTTONS = [
  [{ text: 'Смотреть товар', type: 'product', url: '', filter: { category: '', gender: [], brand: [], sale: false } }],
  [{ text: 'Заказать', type: 'order' }, { text: 'Скидки', type: 'filter', filter: { sale: true } }],
  [{ text: 'Отзывы', type: 'url', url: 'https://t.me/iwakotzivi' }, { text: 'Канал', type: 'url', url: 'https://t.me/IWAK3' }],
  [{ text: 'Мы в Max', type: 'url', url: 'https://max.ru/join/XJio5vHkjIhHJfk4CqNB09pvE0bKwDCVxGuYMxI1buo' }],
];
const FALLBACK_CUSTOM_BUTTONS = [
  [{ text: 'Каталог', type: 'url', url: 'https://iwak.ru/catalog' }],
  [{ text: 'Скидки', type: 'filter', filter: { sale: true } }, { text: 'Канал', type: 'url', url: 'https://t.me/IWAK3' }],
  [{ text: 'Отзывы', type: 'url', url: 'https://t.me/iwakotzivi' }, { text: 'Мы в Max', type: 'url', url: 'https://max.ru/join/XJio5vHkjIhHJfk4CqNB09pvE0bKwDCVxGuYMxI1buo' }],
];

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
function todayStr() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
function nextSlotTime(slot) {
  return addMinutesToSlot(slot, 30);
}
function addMinutesToSlot(slot, stepMinutes) {
  const [h = '12', m = '00'] = String(slot || '12:00').split(':');
  const hours = Number.parseInt(h, 10);
  const minutes = Number.parseInt(m, 10);
  const total = ((Number.isFinite(hours) ? hours : 12) * 60 + (Number.isFinite(minutes) ? minutes : 0) + stepMinutes) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
function buildSlotSeries(startSlot, count, stepMinutes) {
  const slots = [startSlot || '10:00'];
  while (slots.length < count) {
    slots.push(addMinutesToSlot(slots[slots.length - 1], stepMinutes));
  }
  return slots;
}
function findDuplicate(values) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return null;
}

export default function AutoPlanSection({ products, onPlansChanged, preselectedIds, onPreselectedClear }) {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [expandedPlan, setExpandedPlan] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [todaySent, setTodaySent] = useState([]);

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
  const [formButtons, setFormButtons] = useState(FALLBACK_PRODUCT_BUTTONS);
  const [formMode, setFormMode] = useState('product');
  const [formCustomText, setFormCustomText] = useState('');
  const [tplMap, setTplMap] = useState(null);

  // Load template defaults from server
  useEffect(() => {
    authFetch('/api/tg/templates').then(r => r.ok ? r.json() : null).then(list => {
      if (!list) return;
      const map = {};
      for (const t of list) map[t.id] = t;
      setTplMap(map);
      if (map.basic?.defaultButtons) setFormButtons(map.basic.defaultButtons);
    }).catch(() => {});
  }, []);

  const getDefaultButtonsFor = useCallback((tplId) => {
    if (tplMap && tplMap[tplId]?.defaultButtons) return tplMap[tplId].defaultButtons;
    return tplId === 'custom' ? FALLBACK_CUSTOM_BUTTONS : FALLBACK_PRODUCT_BUTTONS;
  }, [tplMap]);

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

  // ── Load today's sent posts ──
  const loadTodaySent = useCallback(async () => {
    try {
      const r = await authFetch('/api/tg/autoplan/today');
      if (r.ok) setTodaySent(await r.json());
    } catch { /* */ }
  }, []);
  useEffect(() => { loadTodaySent(); }, [loadTodaySent]);

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

  const validTimeSlots = useMemo(() => formTimeSlots.filter(Boolean), [formTimeSlots]);
  const formValidationError = useMemo(() => {
    if (formStartDate && formEndDate && formEndDate < formStartDate) {
      return 'Дата окончания не может быть раньше даты начала';
    }
    if (validTimeSlots.length === 0) {
      return 'Добавьте хотя бы один слот времени';
    }
    const duplicate = findDuplicate(validTimeSlots);
    if (duplicate) {
      return `Время ${duplicate} указано несколько раз`;
    }
    return '';
  }, [formStartDate, formEndDate, validTimeSlots]);

  // ── Preview ──
  const handlePreview = useCallback(async () => {
    if (formValidationError) { notifyGlobal('error', formValidationError); return; }
    setPreviewLoading(true);
    setPreview(null);
    try {
      let body;
      if (formMode === 'custom') {
        body = {
          mode: 'custom',
          text: formCustomText,
          postsPerDay: validTimeSlots.length,
          timeSlots: validTimeSlots,
          startDate: formStartDate,
          endDate: formEndDate,
        };
      } else {
        const useIds = preselectedIds && preselectedIds.length > 0;
        body = {
          ...(useIds
            ? { productIds: [...preselectedIds] }
            : { filters: {
                ...(formCategory ? { category: formCategory } : {}),
                ...(formGender ? { gender: formGender } : {}),
                ...(formBrand ? { brand: formBrand } : {}),
                onlyUnsent: formOnlyUnsent,
              } }),
          strategy: formStrategy,
          postsPerDay: validTimeSlots.length,
          timeSlots: validTimeSlots,
          startDate: formStartDate,
          endDate: formEndDate,
          template: formTemplate,
          withBadge: formWithBadge,
        };
      }
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
  }, [preselectedIds, formCategory, formGender, formBrand, formOnlyUnsent, formStrategy, validTimeSlots, formStartDate, formEndDate, formTemplate, formWithBadge, formMode, formCustomText, formValidationError]);

  // ── Create plan ──
  const handleCreate = useCallback(async () => {
    if (!formName.trim()) { notifyGlobal('error', 'Введите название плана'); return; }
    if (!formEndDate) { notifyGlobal('error', 'Укажите дату окончания'); return; }
    if (formValidationError) { notifyGlobal('error', formValidationError); return; }
    if (formMode === 'custom' && !formCustomText.trim()) { notifyGlobal('error', 'Введите текст для custom-поста'); return; }
    setCreating(true);
    try {
      let body;
      if (formMode === 'custom') {
        body = {
          name: formName.trim(),
          mode: 'custom',
          text: formCustomText,
          buttons: formButtons,
          postsPerDay: validTimeSlots.length,
          timeSlots: validTimeSlots,
          startDate: formStartDate,
          endDate: formEndDate,
          template: formTemplate,
          withBadge: formWithBadge,
        };
      } else {
        const useIds = preselectedIds && preselectedIds.length > 0;
        body = {
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
          postsPerDay: validTimeSlots.length,
          timeSlots: validTimeSlots,
          startDate: formStartDate,
          endDate: formEndDate,
          template: formTemplate,
          withBadge: formWithBadge,
          buttons: formButtons,
        };
      }
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
  }, [formName, formEndDate, validTimeSlots, preselectedIds, onPreselectedClear, formCategory, formGender, formBrand, formOnlyUnsent, formStrategy, formStartDate, formTemplate, formWithBadge, formButtons, formMode, formCustomText, loadPlans, formValidationError]);

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
  const addSlots = (count = 1) => setFormTimeSlots(prev => {
    const next = [...prev];
    while (next.length < MAX_AUTOPLAN_POSTS && count > 0) {
      next.push(nextSlotTime(next[next.length - 1]));
      count--;
    }
    return next;
  });
  const addSlot = () => addSlots(1);
  const applySlotPreset = (stepMinutes) => setFormTimeSlots(prev => (
    buildSlotSeries(prev[0] || '10:00', prev.length, stepMinutes)
  ));

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
          {/* ── Today sent ── */}
          <div className="autoplan-today">
            {todaySent.length > 0 ? (
              <>
                <span className="autoplan-today__title">📤 Сегодня отправлено: {todaySent.length}</span>
                {todaySent.slice(0, 5).map((item, i) => (
                  <div key={i} className="autoplan-today__item">
                    <span className="autoplan-today__time">{fmtTime(item.time)}</span>
                    <span className="autoplan-today__name">{item.name}</span>
                    {item.price && <span className="autoplan-today__price">₽{item.price.toLocaleString('ru-RU')}</span>}
                  </div>
                ))}
              </>
            ) : (
              <span className="autoplan-today__empty">📤 Сегодня постов ещё не было</span>
            )}
          </div>

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
                  {plan.todaySlots && plan.todaySlots.length > 0 && (
                    <div className="autoplan-card__today">
                      <span className="autoplan-card__today-label">Сегодня:</span>
                      {plan.todaySlots.map((s, i) => (
                        <div key={i} className="autoplan-card__slot">
                          <span className="autoplan-card__slot-icon">
                            {s.status === 'done' ? '✅' : s.status === 'failed' ? '❌' : plan.todaySlots.findIndex(x => x.status === 'pending') === i ? '●' : '○'}
                          </span>
                          <span className="autoplan-card__slot-time">{fmtTime(s.time)}</span>
                          <span className="autoplan-card__slot-name">{s.productName}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {(!plan.todaySlots || plan.todaySlots.length === 0) && plan.nextPostAt && (
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
                                  {t.productId ? (
                                    <>{t.productBrand && <strong>{t.productBrand}</strong>} {t.productName || `#${t.productId}`}</>
                                  ) : (
                                    <em>📝 Свой пост</em>
                                  )}
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

              {/* Mode toggle */}
              <div className="autoplan-form__mode-toggle">
                <button className={`adm-filter-chip${formMode === 'product' ? ' adm-filter-chip--active' : ''}`} onClick={() => { setFormMode('product'); setFormButtons(getDefaultButtonsFor(formTemplate)); }}>🛍 Товары</button>
                <button className={`adm-filter-chip${formMode === 'custom' ? ' adm-filter-chip--active' : ''}`} onClick={() => { setFormMode('custom'); setFormButtons(getDefaultButtonsFor('custom')); }}>📝 Свой пост</button>
              </div>

              <div className="autoplan-form__group">
                <span className="autoplan-form__group-title">{formMode === 'custom' ? 'Содержание поста' : 'Что публикуем'}</span>

                {formMode === 'custom' ? (
                  <>
                    <label className="tg-label">Текст поста</label>
                    <textarea
                      className="adm-input tg-textarea"
                      value={formCustomText}
                      onChange={e => setFormCustomText(e.target.value)}
                      rows={5}
                      placeholder="Введите текст поста (Markdown поддерживается)"
                    />
                    <ButtonConstructor
                      value={formButtons}
                      onChange={setFormButtons}
                      filterOptions={{
                        categories: categoryOptions.filter(c => c.val).map(c => c.val),
                        genders: [
                          { id: 'mens', label: 'Мужское' },
                          { id: 'womens', label: 'Женское' },
                          { id: 'kids', label: 'Детское' },
                          { id: 'unisex', label: 'Унисекс' },
                        ],
                        brands: brandOptions.filter(b => b.val).map(b => ({ id: b.val, label: b.label })),
                      }}
                    />
                  </>
                ) : (
                  <>
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

                <ButtonConstructor
                  value={formButtons}
                  onChange={setFormButtons}
                  filterOptions={{
                    categories: categoryOptions.filter(c => c.val).map(c => c.val),
                    genders: [
                      { id: 'mens', label: 'Мужское' },
                      { id: 'womens', label: 'Женское' },
                      { id: 'kids', label: 'Детское' },
                      { id: 'unisex', label: 'Унисекс' },
                    ],
                    brands: brandOptions.filter(b => b.val).map(b => ({ id: b.val, label: b.label })),
                  }}
                />
                  </>
                )}
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
                <div className="autoplan-slots__hint">Слотов: {formTimeSlots.length} / {MAX_AUTOPLAN_POSTS}</div>
                <div className="autoplan-slot-presets">
                  <span>Автошаг от первого времени:</span>
                  <button className="adm-btn adm-btn--ghost adm-btn--sm" onClick={() => applySlotPreset(30)}>каждые 30 мин</button>
                  <button className="adm-btn adm-btn--ghost adm-btn--sm" onClick={() => applySlotPreset(60)}>каждый час</button>
                </div>
                {formValidationError && <div className="autoplan-form__warning">{formValidationError}</div>}
                <div className="autoplan-slots">
                  {formTimeSlots.map((slot, i) => (
                    <div key={i} className="autoplan-slot">
                      <input className="adm-input autoplan-slot__input" type="time" value={slot} onChange={e => updateSlot(i, e.target.value)} />
                      {formTimeSlots.length > 1 && <button className="autoplan-slot__remove" onClick={() => removeSlot(i)}>✕</button>}
                    </div>
                  ))}
                  {formTimeSlots.length < MAX_AUTOPLAN_POSTS && (
                    <>
                      <button className="adm-btn adm-btn--ghost adm-btn--sm" onClick={addSlot}>+ слот</button>
                      <button className="adm-btn adm-btn--ghost adm-btn--sm" onClick={() => addSlots(5)}>+5</button>
                      <button className="adm-btn adm-btn--ghost adm-btn--sm" onClick={() => addSlots(10)}>+10</button>
                    </>
                  )}
                </div>
              </div>

              <div className="autoplan-form__actions">
                <button className="adm-btn adm-btn--sm" onClick={handlePreview} disabled={previewLoading || !formEndDate || !!formValidationError || (formMode === 'custom' && !formCustomText.trim())}>
                  {previewLoading ? 'Загрузка...' : '👁 Превью'}
                </button>
                <button className="adm-btn adm-btn--accent adm-btn--sm" onClick={handleCreate} disabled={creating || !formEndDate || !formName.trim() || !!formValidationError || (formMode === 'custom' && !formCustomText.trim())}>
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
