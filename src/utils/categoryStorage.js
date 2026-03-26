import { categories as DEFAULT_CATEGORIES } from '../data/products';
import { toSlug } from './slug';

const STORAGE_KEY = 'iwak_categories';

const DEFAULT_GROUPS = {
  shoes: ['shoes'],
  clothing: ['hoodies', 'sweatshirts', 't-shirts', 'pants', 'shorts'],
  accessories: [],
};

const DEFAULT_SUBCATEGORY_MAP = {
  hoodies:     [{ id: 'pullover', label: 'Пуловер' }, { id: 'zip-up', label: 'На молнии' }, { id: 'oversized', label: 'Оверсайз' }],
  sweatshirts: [{ id: 'crew-neck', label: 'Круглый ворот' }, { id: 'cropped', label: 'Укороченный' }],
  't-shirts':  [{ id: 'basic', label: 'Базовая' }, { id: 'graphic', label: 'Графика' }, { id: 'polo', label: 'Поло' }, { id: 'oversized', label: 'Оверсайз' }],
  pants:       [{ id: 'joggers', label: 'Джоггеры' }, { id: 'cargo', label: 'Карго' }, { id: 'slim-fit', label: 'Слим' }, { id: 'wide-leg', label: 'Широкие' }, { id: 'biker', label: 'Байкерские' }],
  shorts:      [{ id: 'athletic', label: 'Спортивные' }, { id: 'casual', label: 'Casual' }, { id: 'sport', label: 'Sport' }],
  shoes:       [{ id: 'sneakers', label: 'Кроссовки' }, { id: 'boots', label: 'Ботинки' }, { id: 'loafers', label: 'Лоферы' }, { id: 'slip-ons', label: 'Слипоны' }, { id: 'high-tops', label: 'Хай-топы' }],
};

// ── Read / Write localStorage ──

function readStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { categories: [], subcategories: {} };
    const data = JSON.parse(raw);
    return {
      categories: Array.isArray(data.categories) ? data.categories : [],
      subcategories: data.subcategories && typeof data.subcategories === 'object' ? data.subcategories : {},
    };
  } catch {
    return { categories: [], subcategories: {} };
  }
}

function writeStorage(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch { /* quota exceeded — silent */ }
}

// ── Public API ──

/** Merged list: DEFAULT + custom (no duplicates by id) */
export function getCategories() {
  const { categories: custom } = readStorage();
  const defaultIds = new Set(DEFAULT_CATEGORIES.map((c) => c.id));
  const unique = custom.filter((c) => !defaultIds.has(c.id));
  return [...DEFAULT_CATEGORIES, ...unique];
}

/** Merged subcategory map: DEFAULT + custom */
export function getSubcategoryMap() {
  const { subcategories: custom } = readStorage();
  const merged = { ...DEFAULT_SUBCATEGORY_MAP };
  for (const [catId, subs] of Object.entries(custom)) {
    if (!Array.isArray(subs)) continue;
    const existing = merged[catId] || [];
    const existingIds = new Set(existing.map((s) => s.id));
    merged[catId] = [...existing, ...subs.filter((s) => !existingIds.has(s.id))];
  }
  return merged;
}

/** Expanded CATEGORY_GROUPS with custom categories (returns new object).
 *  Also adds each individual category id as its own single-element group
 *  so that ?category={id} works for both groups and individual categories. */
export function getExpandedGroups() {
  const { categories: custom } = readStorage();
  const expanded = {};
  for (const [group, ids] of Object.entries(DEFAULT_GROUPS)) {
    expanded[group] = [...ids];
  }
  for (const cat of custom) {
    if (cat.group && expanded[cat.group]) {
      if (!expanded[cat.group].includes(cat.id)) {
        expanded[cat.group].push(cat.id);
      }
    }
  }
  // Add individual category entries (e.g. hoodies: ['hoodies'])
  // so ?category=hoodies works without changing CatalogPage
  const allCats = getCategories();
  for (const cat of allCats) {
    if (!expanded[cat.id]) {
      expanded[cat.id] = [cat.id];
    }
  }
  return expanded;
}

/** Generate unique slug id from label */
function generateCategoryId(label) {
  const allCategories = getCategories();
  const allIds = new Set(allCategories.map((c) => c.id));
  let base = toSlug(label);
  if (!base) base = 'cat';
  let id = base;
  let n = 2;
  while (allIds.has(id)) {
    id = `${base}-${n}`;
    n++;
  }
  return id;
}

/**
 * Add a new category.
 * @param {string} label - display name
 * @param {string} group - 'shoes' | 'clothing' | 'accessories'
 * @returns {{ id: string, label: string, group: string }} the created category
 */
export function addCategory(label, group) {
  const id = generateCategoryId(label);
  const newCat = { id, label: label.trim(), group };
  const data = readStorage();
  data.categories.push(newCat);
  writeStorage(data);
  return newCat;
}

/**
 * Remove a custom category (default categories cannot be removed).
 * @returns {boolean} true if removed
 */
export function removeCategory(id) {
  const data = readStorage();
  const idx = data.categories.findIndex((c) => c.id === id);
  if (idx === -1) return false;
  data.categories.splice(idx, 1);
  delete data.subcategories[id];
  writeStorage(data);
  return true;
}

/** Check if a category is custom (removable) */
export function isCustomCategory(id) {
  const defaultIds = new Set(DEFAULT_CATEGORIES.map((c) => c.id));
  return !defaultIds.has(id);
}

/**
 * Add a subcategory to an existing category.
 * @returns {{ id: string, label: string }}
 */
export function addSubcategory(categoryId, label) {
  const map = getSubcategoryMap();
  const existing = map[categoryId] || [];
  const existingIds = new Set(existing.map((s) => s.id));
  let base = toSlug(label);
  if (!base) base = 'sub';
  let id = base;
  let n = 2;
  while (existingIds.has(id)) {
    id = `${base}-${n}`;
    n++;
  }
  const newSub = { id, label: label.trim() };
  const data = readStorage();
  if (!data.subcategories[categoryId]) data.subcategories[categoryId] = [];
  data.subcategories[categoryId].push(newSub);
  writeStorage(data);
  return newSub;
}

/**
 * Remove a single custom subcategory.
 * @returns {boolean} true if removed
 */
export function removeSubcategory(categoryId, subId) {
  const data = readStorage();
  const subs = data.subcategories[categoryId];
  if (!Array.isArray(subs)) return false;
  const idx = subs.findIndex((s) => s.id === subId);
  if (idx === -1) return false;
  subs.splice(idx, 1);
  if (subs.length === 0) delete data.subcategories[categoryId];
  writeStorage(data);
  return true;
}

/**
 * Remove all custom subcategories for a category.
 */
export function clearSubcategories(categoryId) {
  const data = readStorage();
  delete data.subcategories[categoryId];
  writeStorage(data);
}

/** Check if a subcategory is custom (removable) */
export function isCustomSubcategory(categoryId, subId) {
  const defaults = DEFAULT_SUBCATEGORY_MAP[categoryId];
  if (!defaults) return true;
  return !defaults.some((s) => s.id === subId);
}

/**
 * Count how many products use this category.
 * @param {Array} products - array from ProductsContext
 * @param {string} categoryId
 */
export function countProductsInCategory(products, categoryId) {
  return products.filter((p) => p.category === categoryId).length;
}
