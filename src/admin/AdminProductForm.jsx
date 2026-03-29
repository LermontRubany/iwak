import { useState, useRef } from 'react';
import { useProducts } from '../context/ProductsContext';
import { useNotifications } from '../context/NotificationsContext';

// Gender enum mirrors DB CHECK constraint — not product data
const GENDER_ENUM = [
  { id: 'mens', label: 'Мужское' },
  { id: 'womens', label: 'Женское' },
  { id: 'kids', label: 'Детское' },
  { id: 'unisex', label: 'Унисекс' },
];

// Standard industry sizes — admin input helpers, not filters
const CLOTHING_SIZES = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
const SHOE_SIZES = ['35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46'];
const KIDS_SIZES = ['92', '98', '104', '110', '116', '122', '128', '134', '140', '146', '152', '158'];

// ── Smart size presets (category × gender) ──
const SIZE_PRESETS = {
  shoes: {
    mens:   ['41', '42', '43', '44', '45'],
    womens: ['36', '37', '38', '39', '40', '41'],
    unisex: ['36', '37', '38', '39', '40', '41', '42', '43', '44', '45'],
    kids:   ['28', '29', '30', '31', '32', '33', '34', '35'],
  },
  clothing: {
    mens:   ['S', 'M', 'L', 'XL', 'XXL'],
    womens: ['XS', 'S', 'M', 'L'],
    unisex: ['S', 'M', 'L', 'XL'],
    kids:   ['92', '98', '104', '110'],
  },
};
// ── Fuzzy category type detection (language-independent) ──
const CATEGORY_KEYWORDS = {
  shoes: [
    'shoe', 'sneak', 'boot', 'sandal', 'slipper', 'loafer', 'moccasin',
    'кроссовк', 'ботинк', 'кед', 'сандал', 'туфл', 'сапог',
    'шлёпанц', 'шлепанц', 'слипон', 'мокасин', 'обув',
  ],
  noSize: [
    'accessor', 'glasses', 'bag', 'jewel', 'wallet', 'belt', 'scarf', 'glove', 'hat',
    'очки', 'сумк', 'бижутер', 'ремн', 'ремен', 'шарф', 'перчатк',
    'кошелёк', 'кошелек', 'шляп', 'шапк', 'аксесс',
  ],
};

function getCategoryType(category) {
  if (!category || typeof category !== 'string') return 'clothing';
  const c = category.trim().toLowerCase();
  if (CATEGORY_KEYWORDS.noSize.some(k => c.includes(k))) return 'no-size';
  if (CATEGORY_KEYWORDS.shoes.some(k => c.includes(k))) return 'shoes';
  return 'clothing';
}

function getPresetSizes(category, gender) {
  const type = getCategoryType(category);
  if (type === 'no-size') return null;
  const g = gender || 'unisex';
  return SIZE_PRESETS[type][g] || SIZE_PRESETS[type].unisex;
}

const SHAPE_RADIUS = { rect: '1px', rounded: '4px', pill: '999px', circle: '50%' };
function isLightColor(hex) {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 155;
}


const EMPTY_BADGE = {
  enabled: false, text: '', borderColor: 'rgba(0,0,0,0.8)',
  textColor: '#000', shape: 'rect', type: 'outline',
  position: 'top-left', size: 'm',
};

const EMPTY_FORM = {
  name: '', brand: '', price: '', originalPrice: '',
  category: '',
  gender: '',
  color: '', colorHex: '#1A1A1A',
  featured: false,
  sizes: [],
  images: [],
  badge: { ...EMPTY_BADGE },
  badge2: { ...EMPTY_BADGE },
};

export default function AdminProductForm({ initial, onSave, onCancel }) {
  const { products, addProduct, updateProduct, uploadImage } = useProducts();
  const { notify } = useNotifications();
  const [form, setForm] = useState(() => {
    if (initial) {
      const imgs = initial.images?.length
        ? initial.images.map((url) => ({ url, preview: url }))
        : initial.image ? [{ url: initial.image, preview: initial.image }] : [];
      return {
        name: initial.name || '',
        brand: initial.brand || '',
        price: String(initial.price || ''),
        originalPrice: initial.originalPrice ? String(initial.originalPrice) : '',
        category: initial.category || '',
        gender: initial.gender || '',
        color: initial.color || '',
        colorHex: initial.colorHex || '#1A1A1A',
        featured: !!initial.featured,
        sizes: initial.sizes || [],
        images: imgs,
        badge: initial.badge ? { ...EMPTY_BADGE, ...initial.badge } : { ...EMPTY_BADGE },
        badge2: initial.badge2 ? { ...EMPTY_BADGE, ...initial.badge2 } : { ...EMPTY_BADGE },
      };
    }
    return { ...EMPTY_FORM };
  });

  // Derive category options from existing products
  const existingCategories = [...new Set(products.map((p) => p.category).filter(Boolean))].sort();
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

  const [showAddCat, setShowAddCat] = useState(false);
  const [newCatValue, setNewCatValue] = useState('');
  // Track if user manually edited sizes — prevents auto-overwrite
  const [sizesTouched, setSizesTouched] = useState(!!initial);

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  // Auto-fill sizes when category/gender change (only if not manually edited)
  const autoFillSizes = (category, gender, touched) => {
    if (touched) return;
    const preset = getPresetSizes(category, gender);
    if (preset === null) {
      setForm((f) => ({ ...f, sizes: [] }));
    } else {
      setForm((f) => ({ ...f, sizes: [...preset] }));
    }
  };

  const handleCategoryChange = (cat) => {
    setForm((f) => ({ ...f, category: cat }));
    autoFillSizes(cat, form.gender, sizesTouched);
  };

  const handleGenderChange = (g) => {
    setForm((f) => ({ ...f, gender: g }));
    autoFillSizes(form.category, g, sizesTouched);
  };

  const handleAddCategory = () => {
    const val = newCatValue.trim().toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '-').replace(/^-|-$/g, '');
    if (!val) return;
    handleCategoryChange(val);
    setShowAddCat(false);
    setNewCatValue('');
  };

  const handleColorChange = (value) => {
    setForm((f) => ({ ...f, color: value }));
  };

  const handleSizes = (size) => {
    setSizesTouched(true);
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
      originalPrice: form.originalPrice ? Number(form.originalPrice) : null,
      category: form.category,
      gender: form.gender,
      color: form.color,
      colorHex: form.colorHex,
      featured: form.featured,
      sizes: form.sizes,
      image,
      images,
      badge: form.badge.enabled ? form.badge : null,
      badge2: form.badge2.enabled ? form.badge2 : null,
    };
    try {
      if (initial && initial.id) {
        await updateProduct(initial.id, saveData);
      } else {
        await addProduct(saveData);
      }
      notify('success', initial ? 'Товар обновлён' : 'Товар добавлен');
      if (onSave) onSave(saveData);
    } catch {} finally {
      setSaving(false);
    }
  };

  const [customSize, setCustomSize] = useState('');

  const catType = getCategoryType(form.category);
  const isNoSize = catType === 'no-size';
  const sizeOptions = catType === 'shoes'
    ? SHOE_SIZES
    : form.gender === 'kids' ? KIDS_SIZES
    : CLOTHING_SIZES;

  const addCustomSize = () => {
    const s = customSize.trim().toUpperCase();
    if (s && !form.sizes.includes(s)) {
      setSizesTouched(true);
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
            {existingCategories.map((c) => (
              <button
                key={c}
                type="button"
                className={`adm-chip${form.category === c ? ' adm-chip--active' : ''}`}
                onClick={() => handleCategoryChange(c)}
              >
                {c}
              </button>
            ))}
            <button type="button" className="adm-chip adm-chip--add" onClick={() => setShowAddCat((v) => !v)}>+ Своя</button>
          </div>
          {showAddCat && (
            <div className="adm-inline-add">
              <input
                className="adm-input adm-input--small"
                type="text"
                placeholder="Новая категория (slug)"
                value={newCatValue}
                onChange={(e) => setNewCatValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCategory(); } }}
                autoFocus
              />
              <button type="button" className="adm-btn adm-btn--primary adm-btn--sm" onClick={handleAddCategory}>Добавить</button>
            </div>
          )}
        </div>

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
            {GENDER_ENUM.map((g) => (
              <button
                key={g.id}
                type="button"
                className={`adm-chip${form.gender === g.id ? ' adm-chip--active' : ''}`}
                onClick={() => handleGenderChange(g.id)}
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
      {!isNoSize && (
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
      )}

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
                  <input className="adm-input adm-input--sm" type="text" placeholder="NEW IN..." maxLength={80} value={b.text} onChange={(e) => set(key, { ...b, text: e.target.value })} style={{ textTransform: 'uppercase', flex: 1 }} />
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
