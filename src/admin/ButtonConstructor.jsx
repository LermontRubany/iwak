import { useState, useCallback } from 'react';

const BUTTON_TYPES = [
  { id: 'product', label: '🛍 Товар', desc: 'Ссылка на страницу товара' },
  { id: 'url',     label: '🔗 Ссылка', desc: 'Произвольная URL-ссылка' },
  { id: 'filter',  label: '📂 Каталог', desc: 'Каталог с фильтрами' },
  { id: 'webapp',  label: '📱 Web App', desc: 'Telegram Web App' },
];

const MAX_ROWS = 8;
const MAX_BUTTONS_PER_ROW = 3;

const emptyButton = (type = 'product') => ({
  text: type === 'product' ? 'Смотреть товар' : '',
  type,
  url: '',
  filter: { category: '', gender: [], brand: [], sale: false },
});

function isValidUrl(str) {
  if (!str) return false;
  try { const u = new URL(str); return u.protocol === 'https:' || u.protocol === 'http:'; }
  catch { return false; }
}

function isFilterEmpty(f) {
  if (!f) return true;
  return !f.category && !(f.gender?.length) && !(f.brand?.length) && !(f.size?.length) && !f.sale;
}

export default function ButtonConstructor({ value, onChange, filterOptions }) {
  const [editingBtn, setEditingBtn] = useState(null); // { row, col }

  const rows = value && value.length > 0 ? value : [[emptyButton('product')]];

  const update = useCallback((newRows) => {
    onChange(newRows);
  }, [onChange]);

  const addRow = useCallback(() => {
    if (rows.length >= MAX_ROWS) return;
    update([...rows, [emptyButton('url')]]);
  }, [rows, update]);

  const removeRow = useCallback((ri) => {
    const next = rows.filter((_, i) => i !== ri);
    update(next.length > 0 ? next : [[emptyButton('product')]]);
    setEditingBtn(null);
  }, [rows, update]);

  const addButtonToRow = useCallback((ri) => {
    if (rows[ri].length >= MAX_BUTTONS_PER_ROW) return;
    const next = rows.map((row, i) => i === ri ? [...row, emptyButton('url')] : row);
    update(next);
  }, [rows, update]);

  const removeButton = useCallback((ri, ci) => {
    const newRow = rows[ri].filter((_, i) => i !== ci);
    if (newRow.length === 0) {
      removeRow(ri);
    } else {
      update(rows.map((row, i) => i === ri ? newRow : row));
    }
    setEditingBtn(null);
  }, [rows, removeRow, update]);

  const updateButton = useCallback((ri, ci, patch) => {
    update(rows.map((row, i) =>
      i === ri ? row.map((btn, j) => j === ci ? { ...btn, ...patch } : btn) : row
    ));
  }, [rows, update]);

  const moveRow = useCallback((ri, dir) => {
    const ni = ri + dir;
    if (ni < 0 || ni >= rows.length) return;
    const next = [...rows];
    [next[ri], next[ni]] = [next[ni], next[ri]];
    update(next);
    if (editingBtn && editingBtn.row === ri) setEditingBtn({ ...editingBtn, row: ni });
    else if (editingBtn && editingBtn.row === ni) setEditingBtn({ ...editingBtn, row: ri });
  }, [rows, update, editingBtn]);

  const editing = editingBtn ? rows[editingBtn.row]?.[editingBtn.col] : null;

  const categories = filterOptions?.categories || [];
  const genders = filterOptions?.genders || [];
  const brands = filterOptions?.brands || [];

  return (
    <div className="btn-ctor">
      <label className="tg-label">Кнопки</label>

      {/* Telegram-style preview */}
      <div className="btn-ctor__preview">
        {rows.map((row, ri) => (
          <div key={ri} className="btn-ctor__preview-row">
            {row.map((btn, ci) => (
              <button
                key={ci}
                type="button"
                className={`btn-ctor__preview-btn${editingBtn?.row === ri && editingBtn?.col === ci ? ' btn-ctor__preview-btn--active' : ''}`}
                onClick={() => setEditingBtn(editingBtn?.row === ri && editingBtn?.col === ci ? null : { row: ri, col: ci })}
                title={BUTTON_TYPES.find(t => t.id === btn.type)?.desc || ''}
              >
                {btn.text || '(без текста)'}
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* Row controls */}
      <div className="btn-ctor__rows">
        {rows.map((row, ri) => (
          <div key={ri} className="btn-ctor__row-ctrl">
            <span className="btn-ctor__row-label">Ряд {ri + 1} · {row.length} кн.</span>
            <div className="btn-ctor__row-actions">
              {rows.length > 1 && ri > 0 && (
                <button type="button" className="btn-ctor__icon-btn" onClick={() => moveRow(ri, -1)} title="Вверх">↑</button>
              )}
              {rows.length > 1 && ri < rows.length - 1 && (
                <button type="button" className="btn-ctor__icon-btn" onClick={() => moveRow(ri, 1)} title="Вниз">↓</button>
              )}
              {row.length < MAX_BUTTONS_PER_ROW && (
                <button type="button" className="btn-ctor__icon-btn" onClick={() => addButtonToRow(ri)} title="Добавить кнопку в ряд">+</button>
              )}
              <button type="button" className="btn-ctor__icon-btn btn-ctor__icon-btn--danger" onClick={() => removeRow(ri)} title="Удалить ряд">✕</button>
            </div>
          </div>
        ))}
      </div>

      {rows.length < MAX_ROWS && (
        <button type="button" className="adm-btn adm-btn--sm btn-ctor__add-row" onClick={addRow}>
          + Добавить ряд кнопок
        </button>
      )}

      {/* Button editor */}
      {editing && editingBtn && (
        <div className="btn-ctor__editor">
          <div className="btn-ctor__editor-header">
            <span>Кнопка: ряд {editingBtn.row + 1}, позиция {editingBtn.col + 1}</span>
            <button type="button" className="btn-ctor__icon-btn btn-ctor__icon-btn--danger" onClick={() => removeButton(editingBtn.row, editingBtn.col)}>
              🗑 Удалить
            </button>
          </div>

          {/* Type selector */}
          <div className="btn-ctor__field">
            <label className="btn-ctor__field-label">Тип</label>
            <div className="btn-ctor__type-chips">
              {BUTTON_TYPES.map(t => (
                <button
                  key={t.id}
                  type="button"
                  className={`adm-filter-chip${editing.type === t.id ? ' adm-filter-chip--active' : ''}`}
                  onClick={() => {
                    const patch = { type: t.id };
                    if (t.id === 'product' && !editing.text) patch.text = 'Смотреть товар';
                    updateButton(editingBtn.row, editingBtn.col, patch);
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Text */}
          <div className="btn-ctor__field">
            <label className="btn-ctor__field-label">Текст кнопки</label>
            <input
              type="text"
              className="adm-input"
              value={editing.text}
              onChange={e => updateButton(editingBtn.row, editingBtn.col, { text: e.target.value })}
              placeholder="Текст кнопки"
              maxLength={64}
            />
          </div>

          {/* URL field for url / webapp */}
          {(editing.type === 'url' || editing.type === 'webapp') && (
            <div className="btn-ctor__field">
              <label className="btn-ctor__field-label">
                {editing.type === 'webapp' ? 'Web App URL' : 'URL'}
              </label>
              <input
                type="url"
                className="adm-input"
                value={editing.url || ''}
                onChange={e => updateButton(editingBtn.row, editingBtn.col, { url: e.target.value })}
                placeholder={editing.type === 'webapp' ? 'https://app.example.com' : 'https://...'}
              />
              {editing.url && !isValidUrl(editing.url) && (
                <div className="btn-ctor__warn">⚠️ Введите корректный URL (начиная с https://)</div>
              )}
            </div>
          )}

          {/* Filter fields */}
          {editing.type === 'filter' && (
            <>
              {isFilterEmpty(editing.filter) && (
                <div className="btn-ctor__warn">⚠️ Фильтр пуст — кнопка откроет весь каталог</div>
              )}
            <FilterEditor
              filter={editing.filter || {}}
              onChange={f => updateButton(editingBtn.row, editingBtn.col, { filter: f })}
              categories={categories}
              genders={genders}
              brands={brands}
            />
            </>
          )}

          {/* Product type hint */}
          {editing.type === 'product' && (
            <div className="btn-ctor__hint">
              Ссылка на товар будет сформирована автоматически при отправке
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FilterEditor({ filter, onChange, categories, genders, brands }) {
  const f = filter || {};

  const update = (patch) => onChange({ ...f, ...patch });

  const toggleArr = (key, val) => {
    const arr = f[key] || [];
    const next = arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val];
    update({ [key]: next });
  };

  return (
    <div className="btn-ctor__filter-editor">
      {categories.length > 0 && (
        <div className="btn-ctor__field">
          <label className="btn-ctor__field-label">Категория</label>
          <select
            className="adm-input"
            value={f.category || ''}
            onChange={e => update({ category: e.target.value })}
          >
            <option value="">Все категории</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      )}

      {genders.length > 0 && (
        <div className="btn-ctor__field">
          <label className="btn-ctor__field-label">Пол</label>
          <div className="btn-ctor__chips">
            {genders.map(g => (
              <button
                key={g.id}
                type="button"
                className={`adm-filter-chip${(f.gender || []).includes(g.id) ? ' adm-filter-chip--active' : ''}`}
                onClick={() => toggleArr('gender', g.id)}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {brands.length > 0 && (
        <div className="btn-ctor__field">
          <label className="btn-ctor__field-label">Бренд</label>
          <div className="btn-ctor__chips btn-ctor__chips--wrap">
            {brands.slice(0, 20).map(b => (
              <button
                key={b.id}
                type="button"
                className={`adm-filter-chip${(f.brand || []).includes(b.id) ? ' adm-filter-chip--active' : ''}`}
                onClick={() => toggleArr('brand', b.id)}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <label className="btn-ctor__checkbox">
        <input
          type="checkbox"
          checked={!!f.sale}
          onChange={e => update({ sale: e.target.checked })}
        />
        <span>Только со скидкой</span>
      </label>
    </div>
  );
}
