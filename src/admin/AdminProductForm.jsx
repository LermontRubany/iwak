import { useEffect, useState, useRef } from 'react';
import { useProducts } from '../context/ProductsContext';
import { getCategories } from '../utils/categoryStorage';


const EMPTY_FORM = {
  name: '', brand: '', price: '',
  category: '',
  gender: '',
  color: '', colorHex: '#1A1A1A',
  featured: false,
  sizes: [],
  images: [],
};

export default function AdminProductForm({ initial, onSave, onCancel }) {
  const { addProduct, updateProduct, uploadImage } = useProducts();
  const [form, setForm] = useState(() => {
    if (initial) {
      const imgs = initial.images?.length
        ? initial.images.map((url) => ({ url, preview: url }))
        : initial.image ? [{ url: initial.image, preview: initial.image }] : [];
      return {
        name: initial.name || '',
        brand: initial.brand || '',
        price: String(initial.price || ''),
        category: initial.category || '',
        gender: initial.gender || '',
        color: initial.color || '',
        colorHex: initial.colorHex || '#1A1A1A',
        featured: !!initial.featured,
        sizes: initial.sizes || [],
        images: imgs,
      };
    }
    return { ...EMPTY_FORM };
  });
  // ...existing code...

  useEffect(() => {
    getCategories().then(setAllCategories);
  }, []);

  // ...existing code...
  const [showAddCat, setShowAddCat] = useState(false);
  const [newCatLabel, setNewCatLabel] = useState('');
  const [newCatGroup, setNewCatGroup] = useState('clothing');
  const [showAddSub, setShowAddSub] = useState(false);
  const [newSubLabel, setNewSubLabel] = useState('');

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const handleCategoryChange = (cat) => {
    const firstSub = subcatMap[cat]?.[0]?.id || '';
    setForm((f) => ({ ...f, category: cat, subcategory: firstSub }));
  };

  const handleAddCategory = () => {
    const label = newCatLabel.trim();
    if (!label) return;
    const created = addCategory(label, newCatGroup);
    setAllCategories(getCategories());
    setShowAddCat(false);
    setNewCatLabel('');
    handleCategoryChange(created.id);
  };

  const handleAddSubcategory = () => {
    const label = newSubLabel.trim();
    if (!label) return;
    const created = addSubcategory(form.category, label);
    setSubcatMap(getSubcategoryMap());
    setShowAddSub(false);
    setNewSubLabel('');
    set('subcategory', created.id);
  };

  const handleRemoveCategory = (id) => {
    const count = countProductsInCategory(products, id);
    if (count > 0) {
      if (!window.confirm(`Категория используется в ${count} товар(ах). Удалить?`)) return;
    }
    removeCategory(id);
    const updated = getCategories();
    setAllCategories(updated);
    setSubcatMap(getSubcategoryMap());
    if (form.category === id) {
      handleCategoryChange(updated[0]?.id || 'hoodies');
    }
  };

  const handleRemoveSubcategory = (subId) => {
    removeSubcategory(form.category, subId);
    setSubcatMap(getSubcategoryMap());
    if (form.subcategory === subId) {
      const updated = getSubcategoryMap()[form.category] || [];
      set('subcategory', updated[0]?.id || '');
    }
  };

  const handleClearSubcategories = () => {
    clearSubcategories(form.category);
    setSubcatMap(getSubcategoryMap());
  };

  const handleColorChange = (value) => {
    setForm((f) => ({ ...f, color: value }));
  };

  const handleSizes = (size) => {
    setForm((f) => ({
      ...f,
      sizes: f.sizes.includes(size) ? f.sizes.filter((s) => s !== size) : [...f.sizes, size],
    }));
  };

  // Загрузка фото на сервер
  const handleFiles = async (files) => {
    const arr = Array.from(files).slice(0, 10 - form.images.length);
    const uploaded = await Promise.all(arr.map(async (file) => {
      const path = await uploadImage(file);
      return { preview: path, url: path };
    }));
    setForm((f) => ({ ...f, images: [...f.images, ...uploaded].slice(0, 10) }));
  };

  const removeImage = (i) => {
    setForm((f) => ({ ...f, images: f.images.filter((_, idx) => idx !== i) }));
  };

  const moveImage = (i, dir) => {
    setForm((f) => {
      const imgs = [...f.images];
      const j = i + dir;
      if (j < 0 || j >= imgs.length) return f;
      [imgs[i], imgs[j]] = [imgs[j], imgs[i]];
      return { ...f, images: imgs };
    });
  };

  const setMainImage = (i) => {
    setForm((f) => {
      const imgs = [...f.images];
      const [main] = imgs.splice(i, 1);
      return { ...f, images: [main, ...imgs] };
    });
  };

  const handleUrlAdd = () => {
    const url = window.prompt('URL изображения:');
    if (url?.trim()) {
      setForm((f) => ({ ...f, images: [...f.images, { preview: url.trim(), url: url.trim() }].slice(0, 10) }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.brand.trim() || !form.price) return;
    setSaving(true);
    const image = form.images[0]?.url || '';
    const images = form.images.map((img) => img.url);
    const saveData = {
      name: form.name.trim(),
      brand: form.brand.trim(),
      price: Number(form.price),
      category: form.category,
      gender: form.gender,
      color: form.color,
      colorHex: form.colorHex,
      featured: form.featured,
      sizes: form.sizes,
      image,
      images,
    };
    if (initial && initial.id) {
      await updateProduct(initial.id, saveData);
    } else {
      await addProduct(saveData);
    }
    setSaving(false);
    if (onSave) onSave(saveData);
  };

  const [customSize, setCustomSize] = useState('');

  const sizeOptions = form.category === 'shoes' ? SHOE_SIZES
    : form.gender === 'kids' ? KIDS_SIZES
    : CLOTHING_SIZES;

  const subcats = subcatMap[form.category] || [];

  const addCustomSize = () => {
    const s = customSize.trim().toUpperCase();
    if (s && !form.sizes.includes(s)) {
      setForm((f) => ({ ...f, sizes: [...f.sizes, s] }));
    }
    setCustomSize('');
  };

  return (
    <form className="adm-form" onSubmit={handleSubmit}>

      {/* ── СЕКЦИЯ: Фото ── */}
      <div className="adm-section">
        <div className="adm-section__title">ФОТО</div>
        <div className="adm-images-grid">
          {form.images.map((img, i) => (
            <div key={i} className={`adm-img-thumb${i === 0 ? ' adm-img-thumb--main' : ''}`}>
              <img src={img.preview} alt="" />
              {i === 0 && <span className="adm-img-badge">Главное</span>}
              <div className="adm-img-actions">
                {i !== 0 && <button type="button" onClick={() => setMainImage(i)} title="Сделать главным">★</button>}
                {i > 0 && <button type="button" onClick={() => moveImage(i, -1)}>←</button>}
                {i < form.images.length - 1 && <button type="button" onClick={() => moveImage(i, 1)}>→</button>}
                <button type="button" className="adm-img-del" onClick={() => removeImage(i)}>✕</button>
              </div>
            </div>
          ))}
          {form.images.length < 10 && (
            <button
              type="button"
              className="adm-img-add"
              onClick={() => fileRef.current.click()}
            >
              + Фото
            </button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {/* ── СЕКЦИЯ: Основная информация ── */}
      <div className="adm-section">
        <div className="adm-section__title">ОСНОВНОЕ</div>

        <div className="adm-field">
          <label className="adm-label">БРЕНД</label>
          <input
            className="adm-input"
            type="text"
            placeholder="Nike"
            value={form.brand}
            onChange={(e) => set('brand', e.target.value)}
            required
          />
        </div>

        <div className="adm-field">
          <label className="adm-label">КАТЕГОРИЯ</label>
          <div className="adm-chips">
            {allCategories.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`adm-chip${form.category === c.id ? ' adm-chip--active' : ''}`}
                onClick={() => handleCategoryChange(c.id)}
              >
                {c.label}
                {isCustomCategory(c.id) && (
                  <span
                    className="adm-chip__del"
                    onClick={(e) => { e.stopPropagation(); handleRemoveCategory(c.id); }}
                  >✕</span>
                )}
              </button>
            ))}
            <button type="button" className="adm-chip adm-chip--add" onClick={() => setShowAddCat((v) => !v)}>+ Своя</button>
          </div>
          {showAddCat && (
            <div className="adm-inline-add">
              <input
                className="adm-input adm-input--small"
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
              <button type="button" className="adm-btn adm-btn--primary adm-btn--sm" onClick={handleAddCategory}>Добавить</button>
            </div>
          )}
        </div>

        {subcats.length > 0 || form.category ? (
          <div className="adm-field">
            <label className="adm-label">ПОДКАТЕГОРИЯ</label>
            <div className="adm-chips">
              {subcats.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`adm-chip${form.subcategory === s.id ? ' adm-chip--active' : ''}`}
                  onClick={() => set('subcategory', s.id)}
                >
                  {s.label}
                  {isCustomSubcategory(form.category, s.id) && (
                    <span
                      className="adm-chip__del"
                      onClick={(e) => { e.stopPropagation(); handleRemoveSubcategory(s.id); }}
                    >✕</span>
                  )}
                </button>
              ))}
              <button type="button" className="adm-chip adm-chip--add" onClick={() => setShowAddSub((v) => !v)}>+ Своя</button>
              {subcats.some((s) => isCustomSubcategory(form.category, s.id)) && (
                <button type="button" className="adm-chip adm-chip--clear" onClick={handleClearSubcategories}>Очистить</button>
              )}
            </div>
            {showAddSub && (
              <div className="adm-inline-add">
                <input
                  className="adm-input adm-input--small"
                  type="text"
                  placeholder="Название подкатегории"
                  value={newSubLabel}
                  onChange={(e) => setNewSubLabel(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddSubcategory(); } }}
                  autoFocus
                />
                <button type="button" className="adm-btn adm-btn--primary adm-btn--sm" onClick={handleAddSubcategory}>Добавить</button>
              </div>
            )}
          </div>
        ) : null}

        <div className="adm-field">
          <label className="adm-label">НАЗВАНИЕ</label>
          <input
            className="adm-input"
            type="text"
            placeholder="Худи оверсайз — чёрный"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            required
          />
        </div>

        <div className="adm-field">
          <label className="adm-label">ЦЕНА ₽</label>
          <input
            className="adm-input"
            type="number"
            placeholder="4990"
            min="0"
            value={form.price}
            onChange={(e) => set('price', e.target.value)}
            required
          />
        </div>

        <div className="adm-field">
          <label className="adm-label">СТАРАЯ ЦЕНА ₽ <span style={{fontWeight:400,color:'#bbb'}}>(для скидки)</span></label>
          <input
            className="adm-input"
            type="number"
            placeholder="—"
            min="0"
            value={form.originalPrice}
            onChange={(e) => set('originalPrice', e.target.value)}
          />
        </div>

        <div className="adm-field">
          <label className="adm-label">ПОЛ</label>
          <div className="adm-chips">
            {genders.map((g) => (
              <button
                key={g.id}
                type="button"
                className={`adm-chip${form.gender === g.id ? ' adm-chip--active' : ''}`}
                onClick={() => set('gender', g.id)}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        <div className="adm-field">
          <label className="adm-label">ЦВЕТ</label>
          <input
            className="adm-input"
            type="text"
            placeholder="чёрный, olive, cream..."
            value={form.color}
            onChange={(e) => handleColorChange(e.target.value)}
          />
        </div>
      </div>

      {/* ── СЕКЦИЯ: Размеры ── */}
      <div className="adm-section">
        <div className="adm-section__title">РАЗМЕРЫ</div>
        <div className="adm-chips">
          {sizeOptions.map((s) => (
            <button
              key={s}
              type="button"
              className={`adm-chip${form.sizes.includes(s) ? ' adm-chip--active' : ''}`}
              onClick={() => handleSizes(s)}
            >
              {s}
            </button>
          ))}
          {form.sizes.filter((s) => !sizeOptions.includes(s)).map((s) => (
            <button
              key={s}
              type="button"
              className="adm-chip adm-chip--active"
              onClick={() => handleSizes(s)}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="adm-size-add">
          <input
            className="adm-input adm-input--small"
            type="text"
            placeholder="Свой размер"
            value={customSize}
            onChange={(e) => setCustomSize(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomSize(); } }}
          />
          <button type="button" className="adm-btn adm-btn--secondary" onClick={addCustomSize}>+</button>
        </div>
      </div>

      {/* Badges */}
      {[
        { key: 'badge', label: 'БЕЙДЖ 1' },
        { key: 'badge2', label: 'БЕЙДЖ 2' },
      ].map(({ key, label }) => {
        const b = form[key];
        return (
          <div key={key} className="adm-section adm-section--compact">
            <div className="adm-field adm-field--row">
              <div className="adm-section__title" style={{ border: 'none', margin: 0, padding: 0 }}>{label}</div>
              <button type="button" className={`adm-toggle${b.enabled ? ' adm-toggle--on' : ''}`} onClick={() => set(key, { ...b, enabled: !b.enabled })}>{b.enabled ? 'ДА' : 'НЕТ'}</button>
            </div>
            {b.enabled && (
              <>
                <div className="adm-badge-compact-row">
                  <input className="adm-input adm-input--sm" type="text" placeholder="NEW IN..." maxLength={18} value={b.text} onChange={(e) => set(key, { ...b, text: e.target.value })} style={{ textTransform: 'uppercase', flex: 1 }} />
                  {b.text.trim() && (
                    <div className="adm-badge-compact-preview">
                      <span className={`product-badge product-badge--${b.size || 'm'}${b.type === 'filled' ? ' product-badge--filled' : ''}`} style={{ border: `1px solid ${b.borderColor}`, color: b.type === 'filled' ? undefined : b.textColor, borderRadius: SHAPE_RADIUS[b.shape] || '1px', ...(b.type === 'filled' ? { background: b.borderColor, color: isLightColor(b.borderColor) ? '#000' : '#fff' } : {}) }}>{b.text.trim().toUpperCase()}</span>
                    </div>
                  )}
                </div>
                <div className="adm-badge-compact-row">
                  <label className="adm-label adm-label--inline">Цвет</label>
                  <input type="color" className="adm-color-picker adm-color-picker--sm" value={b.borderColor.startsWith('#') ? b.borderColor : '#000000'} onChange={(e) => set(key, { ...b, borderColor: e.target.value })} />
                  <label className="adm-label adm-label--inline">Текст</label>
                  <input type="color" className="adm-color-picker adm-color-picker--sm" value={b.textColor.startsWith('#') ? b.textColor : '#000000'} onChange={(e) => set(key, { ...b, textColor: e.target.value })} />
                  <span className="adm-badge-compact-sep" />
                  {[{id:'outline',l:'Контур'},{id:'filled',l:'Заливка'}].map((t) => (
                    <button key={t.id} type="button" className={`adm-chip adm-chip--xs${(b.type || 'outline') === t.id ? ' adm-chip--active' : ''}`} onClick={() => set(key, { ...b, type: t.id })}>{t.l}</button>
                  ))}
                </div>
                <div className="adm-badge-compact-row">
                  {[{id:'rect',l:'▬'},{id:'rounded',l:'▢'},{id:'pill',l:'⬭'},{id:'circle',l:'●'}].map((s) => (
                    <button key={s.id} type="button" className={`adm-chip adm-chip--xs${b.shape === s.id ? ' adm-chip--active' : ''}`} onClick={() => set(key, { ...b, shape: s.id })} title={s.id}>{s.l}</button>
                  ))}
                  <span className="adm-badge-compact-sep" />
                  {[{id:'s',l:'S'},{id:'m',l:'M'},{id:'l',l:'L'}].map((s) => (
                    <button key={s.id} type="button" className={`adm-chip adm-chip--xs${(b.size || 'm') === s.id ? ' adm-chip--active' : ''}`} onClick={() => set(key, { ...b, size: s.id })}>{s.l}</button>
                  ))}
                  <span className="adm-badge-compact-sep" />
                  {[{id:'top-left',l:'↖'},{id:'top-right',l:'↗'},{id:'bottom-left',l:'↙'},{id:'bottom-right',l:'↘'}].map((p) => (
                    <button key={p.id} type="button" className={`adm-chip adm-chip--xs${(b.position || 'top-left') === p.id ? ' adm-chip--active' : ''}`} onClick={() => set(key, { ...b, position: p.id })} title={p.id}>{p.l}</button>
                  ))}
                </div>
              </>
            )}
          </div>
        );
      })}

      {/* Featured */}
      <div className="adm-section">
        <div className="adm-field adm-field--row">
          <label className="adm-label">FEATURED</label>
          <button
            type="button"
            className={`adm-toggle${form.featured ? ' adm-toggle--on' : ''}`}
            onClick={() => set('featured', !form.featured)}
          >
            {form.featured ? 'ДА' : 'НЕТ'}
          </button>
        </div>
      </div>

      {/* Sticky footer */}
      <div className="adm-form-footer">
        <button type="button" className="adm-btn adm-btn--ghost" onClick={onCancel}>
          ОТМЕНА
        </button>
        <button type="submit" className={`adm-btn adm-btn--primary${saving ? ' adm-btn--saving' : ''}`}>
          СОХРАНИТЬ
        </button>
      </div>
    </form>
  );
}
