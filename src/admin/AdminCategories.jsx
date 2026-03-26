import { useState } from 'react';
import { useProducts } from '../context/ProductsContext';
import {
  getCategories, getSubcategoryMap,
  addCategory, removeCategory, isCustomCategory,
  addSubcategory, removeSubcategory, clearSubcategories, isCustomSubcategory,
  countProductsInCategory,
} from '../utils/categoryStorage';

const GROUP_OPTIONS = [
  { id: 'clothing', label: 'Одежда' },
  { id: 'shoes', label: 'Обувь' },
  { id: 'accessories', label: 'Аксессуары' },
];

const GROUP_LABELS = { clothing: 'Одежда', shoes: 'Обувь', accessories: 'Аксессуары' };

export default function AdminCategories() {
  const { products } = useProducts();
  const [categories, setCategories] = useState(getCategories);
  const [subcatMap, setSubcatMap] = useState(getSubcategoryMap);
  const [expandedCat, setExpandedCat] = useState(null);

  // Add category
  const [showAddCat, setShowAddCat] = useState(false);
  const [newCatLabel, setNewCatLabel] = useState('');
  const [newCatGroup, setNewCatGroup] = useState('clothing');

  // Add subcategory
  const [addSubFor, setAddSubFor] = useState(null);
  const [newSubLabel, setNewSubLabel] = useState('');

  const refresh = () => {
    setCategories(getCategories());
    setSubcatMap(getSubcategoryMap());
  };

  const handleAddCategory = () => {
    const label = newCatLabel.trim();
    if (!label) return;
    addCategory(label, newCatGroup);
    refresh();
    setShowAddCat(false);
    setNewCatLabel('');
  };

  const handleRemoveCategory = (id) => {
    const count = countProductsInCategory(products, id);
    if (count > 0) {
      if (!window.confirm(`Категория используется в ${count} товар(ах). Удалить?`)) return;
    }
    removeCategory(id);
    refresh();
    if (expandedCat === id) setExpandedCat(null);
  };

  const handleAddSubcategory = (catId) => {
    const label = newSubLabel.trim();
    if (!label) return;
    addSubcategory(catId, label);
    refresh();
    setAddSubFor(null);
    setNewSubLabel('');
  };

  const handleRemoveSubcategory = (catId, subId) => {
    removeSubcategory(catId, subId);
    refresh();
  };

  const handleClearSubcategories = (catId) => {
    if (!window.confirm('Удалить все кастомные подкатегории?')) return;
    clearSubcategories(catId);
    refresh();
  };

  // Group categories by group
  const grouped = {};
  for (const g of GROUP_OPTIONS) {
    grouped[g.id] = [];
  }
  for (const cat of categories) {
    const g = cat.group || 'clothing';
    if (!grouped[g]) grouped[g] = [];
    grouped[g].push(cat);
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
          <div className="adm-chips">
            {GROUP_OPTIONS.map((g) => (
              <button
                key={g.id}
                type="button"
                className={`adm-chip adm-chip--sm${newCatGroup === g.id ? ' adm-chip--active' : ''}`}
                onClick={() => setNewCatGroup(g.id)}
              >
                {g.label}
              </button>
            ))}
          </div>
          <div className="adm-cats__add-actions">
            <button className="adm-btn adm-btn--primary adm-btn--sm" onClick={handleAddCategory}>Добавить</button>
            <button className="adm-btn adm-btn--ghost adm-btn--sm" onClick={() => { setShowAddCat(false); setNewCatLabel(''); }}>Отмена</button>
          </div>
        </div>
      )}

      {GROUP_OPTIONS.map((group) => (
        <div key={group.id} className="adm-cats__group">
          <div className="adm-cats__group-title">{group.label.toUpperCase()}</div>
          {grouped[group.id]?.length === 0 && (
            <div className="adm-cats__empty">Нет категорий</div>
          )}
          {grouped[group.id]?.map((cat) => {
            const subs = subcatMap[cat.id] || [];
            const count = countProductsInCategory(products, cat.id);
            const isExpanded = expandedCat === cat.id;
            const custom = isCustomCategory(cat.id);
            const hasCustomSubs = subs.some((s) => isCustomSubcategory(cat.id, s.id));

            return (
              <div key={cat.id} className={`adm-cats__item${isExpanded ? ' adm-cats__item--open' : ''}`}>
                <div className="adm-cats__item-head" onClick={() => setExpandedCat(isExpanded ? null : cat.id)}>
                  <span className="adm-cats__item-arrow">{isExpanded ? '▾' : '▸'}</span>
                  <span className="adm-cats__item-label">{cat.label}</span>
                  <span className="adm-cats__item-count">{count} тов.</span>
                  <span className="adm-cats__item-subs">{subs.length} подкат.</span>
                  {custom && (
                    <button
                      className="adm-cats__item-del"
                      onClick={(e) => { e.stopPropagation(); handleRemoveCategory(cat.id); }}
                    >✕</button>
                  )}
                </div>

                {isExpanded && (
                  <div className="adm-cats__subcats">
                    {subs.length === 0 && <div className="adm-cats__empty">Нет подкатегорий</div>}
                    {subs.map((sub) => (
                      <div key={sub.id} className="adm-cats__sub">
                        <span className="adm-cats__sub-label">{sub.label}</span>
                        <span className="adm-cats__sub-id">{sub.id}</span>
                        {isCustomSubcategory(cat.id, sub.id) && (
                          <button
                            className="adm-cats__sub-del"
                            onClick={() => handleRemoveSubcategory(cat.id, sub.id)}
                          >✕</button>
                        )}
                      </div>
                    ))}

                    <div className="adm-cats__sub-actions">
                      {addSubFor === cat.id ? (
                        <div className="adm-cats__sub-add-row">
                          <input
                            className="adm-input adm-input--small"
                            type="text"
                            placeholder="Подкатегория"
                            value={newSubLabel}
                            onChange={(e) => setNewSubLabel(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddSubcategory(cat.id); } }}
                            autoFocus
                          />
                          <button className="adm-btn adm-btn--primary adm-btn--sm" onClick={() => handleAddSubcategory(cat.id)}>+</button>
                          <button className="adm-btn adm-btn--ghost adm-btn--sm" onClick={() => { setAddSubFor(null); setNewSubLabel(''); }}>✕</button>
                        </div>
                      ) : (
                        <button className="adm-chip adm-chip--add adm-chip--sm" onClick={() => { setAddSubFor(cat.id); setNewSubLabel(''); }}>
                          + Подкатегория
                        </button>
                      )}
                      {hasCustomSubs && (
                        <button className="adm-chip adm-chip--clear adm-chip--sm" onClick={() => handleClearSubcategories(cat.id)}>
                          Очистить кастомные
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
