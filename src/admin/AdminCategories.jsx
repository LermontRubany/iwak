import { useState, useEffect } from 'react';
import { getCategories, addCategory } from '../utils/categoryStorage';

// Можно добавить группы, если они нужны для фильтрации

export default function AdminCategories() {
  const [categories, setCategories] = useState([]);
  const [showAddCat, setShowAddCat] = useState(false);
  const [newCatLabel, setNewCatLabel] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchCategories();
  }, []);

  async function fetchCategories() {
    setLoading(true);
    const cats = await getCategories();
    setCategories(cats);
    setLoading(false);
  }

  async function handleAddCategory() {
    const label = newCatLabel.trim();
    if (!label) return;
    await addCategory(label);
    setNewCatLabel('');
    setShowAddCat(false);
    fetchCategories();
  }

  return (
    <div className="adm-cats">
      <div className="adm-cats__head">
        <span className="adm-cats__title">КАТЕГОРИИ</span>
        <button
          className="adm-btn adm-btn--primary adm-btn--sm"
          onClick={() => setShowAddCat((v) => !v)}
        >
          + КАТЕГОРИЯ
        </button>
      </div>

      {showAddCat && (
        <div className="adm-section adm-cats__add">
          <input
            className="adm-input"
            type="text"
            placeholder="Название категории"
            value={newCatLabel}
            onChange={(e) => setNewCatLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCategory(); } }}
            autoFocus
          />
          <div className="adm-cats__add-actions">
            <button className="adm-btn adm-btn--primary adm-btn--sm" onClick={handleAddCategory}>Добавить</button>
            <button className="adm-btn adm-btn--ghost adm-btn--sm" onClick={() => { setShowAddCat(false); setNewCatLabel(''); }}>Отмена</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="adm-cats__empty">Загрузка...</div>
      ) : (
        <div className="adm-cats__group">
          {categories.length === 0 && <div className="adm-cats__empty">Нет категорий</div>}
          {categories.map((cat) => (
            <div key={cat.id} className="adm-cats__item">
              <span className="adm-cats__item-label">{cat.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
