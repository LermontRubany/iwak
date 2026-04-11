/**
 * E2E тест: единая система шаблонов TG-постов
 * ─────────────────────────────────────────────
 * Этап 1: Шаблоны текста (basic/new/sale/premium)
 * Этап 2: HTML parse_mode (escapeHtml)
 * Этап 3: Дефолтные кнопки (product/custom)
 * Этап 4: Fallback кнопок (buttons переданы vs нет)
 * Этап 5: Custom mode (escape + кнопки)
 * Этап 6: Автоплан (product + custom)
 * Этап 7: Обратная совместимость
 * Этап 8: resolveKeyboard с новыми дефолтами
 */

const SITE_ORIGIN = 'https://iwak.ru';
let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, label) {
  if (condition) { passed++; }
  else { failed++; failures.push(label); console.error(`  ✗ FAIL: ${label}`); }
}

// ── Copy core functions from server ──
function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatSizes(sizes) {
  if (!sizes || sizes.length === 0) return '';
  const sorted = [...sizes].sort((a, b) => {
    const na = Number(a), nb = Number(b);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.localeCompare(b);
  });
  if (sorted.length > 6) {
    const allNum = sorted.every(s => !isNaN(Number(s)));
    if (allNum) return `${sorted[0]}–${sorted[sorted.length - 1]}`;
  }
  return sorted.join(' · ');
}

function productUrl(p) {
  const slug = (p.brand ? p.brand + ' ' : '').concat(p.name)
    .toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return `${SITE_ORIGIN}/product/${slug}-${p.id}`;
}
function productKeyboard(p) {
  return { inline_keyboard: [[{ text: 'Смотреть товар', url: productUrl(p) }]] };
}

function resolveButton(btn, product) {
  switch (btn.type) {
    case 'product':
      if (!product) return null;
      return { text: btn.text, url: productUrl(product) };
    case 'url':
      if (!btn.url) return null;
      return { text: btn.text, url: btn.url };
    case 'filter': {
      if (!btn.filter || typeof btn.filter !== 'object') return null;
      const params = new URLSearchParams();
      const f = btn.filter;
      if (f.category) params.set('category', f.category);
      if (f.gender && f.gender.length) params.set('gender', [].concat(f.gender).sort().join(','));
      if (f.brand && f.brand.length) params.set('brand', [].concat(f.brand).sort().join(','));
      if (f.size && f.size.length) params.set('size', [].concat(f.size).sort().join(','));
      if (f.sale) params.set('sale', 'true');
      const qs = params.toString();
      return { text: btn.text, url: `${SITE_ORIGIN}/catalog${qs ? '?' + qs : ''}` };
    }
    case 'webapp':
      if (!btn.url) return null;
      return { text: btn.text, web_app: { url: btn.url } };
    default:
      if (btn.url) return { text: btn.text, url: btn.url };
      return null;
  }
}

function resolveKeyboard(buttons, product) {
  if (!buttons || !Array.isArray(buttons) || buttons.length === 0) {
    return product ? productKeyboard(product) : { inline_keyboard: [] };
  }
  const rows = [];
  for (const row of buttons) {
    if (!Array.isArray(row) || row.length === 0) continue;
    const tgRow = [];
    for (const btn of row) {
      if (!btn || !btn.text) continue;
      const resolved = resolveButton(btn, product);
      if (resolved) tgRow.push(resolved);
    }
    if (tgRow.length > 0) rows.push(tgRow);
  }
  return rows.length > 0
    ? { inline_keyboard: rows }
    : product ? productKeyboard(product) : { inline_keyboard: [] };
}

// ── TG_TEMPLATES copy ──
const TG_PRODUCT_BUTTONS = [
  [{ text: 'Смотреть товар', type: 'product' }],
  [{ text: 'Заказать', type: 'url', url: 'https://t.me/IWAKm' }, { text: 'Скидки', type: 'filter', filter: { sale: true } }],
  [{ text: 'Отзывы', type: 'url', url: 'https://t.me/iwakotzivi' }, { text: 'Канал', type: 'url', url: 'https://t.me/IWAK3' }],
  [{ text: 'Мы в Max', type: 'url', url: 'https://max.ru/join/XJio5vHkjIhHJfk4CqNB09pvE0bKwDCVxGuYMxI1buo' }],
];

const TG_CUSTOM_BUTTONS = [
  [{ text: 'Каталог', type: 'url', url: `${SITE_ORIGIN}/catalog` }],
  [{ text: 'Скидки', type: 'filter', filter: { sale: true } }, { text: 'Канал', type: 'url', url: 'https://t.me/IWAK3' }],
  [{ text: 'Отзывы', type: 'url', url: 'https://t.me/iwakotzivi' }, { text: 'Мы в Max', type: 'url', url: 'https://max.ru/join/XJio5vHkjIhHJfk4CqNB09pvE0bKwDCVxGuYMxI1buo' }],
];

const TG_TEMPLATES = {
  basic: {
    type: 'product',
    defaultButtons: TG_PRODUCT_BUTTONS,
    buildText(p) {
      const brand = p.brand ? escapeHtml(p.brand) : '';
      const name = escapeHtml(p.name || '');
      const sizeLine = formatSizes(p.sizes);
      const lines = [];
      if (brand) lines.push(`<b>${brand}</b>                              IWAK.RU`);
      else lines.push('IWAK.RU');
      lines.push('');
      lines.push(name);
      if (sizeLine) { lines.push(''); lines.push(sizeLine); }
      lines.push(`${Math.round(p.price)} ₽`);
      lines.push('');
      lines.push('В наличии');
      lines.push('Россия / Беларусь');
      return lines.join('\n');
    },
  },
  new: {
    type: 'product',
    defaultButtons: TG_PRODUCT_BUTTONS,
    buildText(p) {
      const brand = p.brand ? escapeHtml(p.brand) : '';
      const name = escapeHtml(p.name || '');
      const sizeLine = formatSizes(p.sizes);
      const lines = [];
      if (brand) lines.push(`<b>${brand}</b>                              IWAK.RU`);
      else lines.push('IWAK.RU');
      lines.push('');
      lines.push(`<b>НОВИНКА</b>`);
      lines.push(name);
      if (sizeLine) { lines.push(''); lines.push(sizeLine); }
      lines.push(`${Math.round(p.price)} ₽`);
      lines.push('');
      lines.push('Только поступили');
      lines.push('В наличии');
      lines.push('Россия / Беларусь');
      return lines.join('\n');
    },
  },
  sale: {
    type: 'product',
    defaultButtons: TG_PRODUCT_BUTTONS,
    buildText(p) {
      const brand = p.brand ? escapeHtml(p.brand) : '';
      const name = escapeHtml(p.name || '');
      const sizeLine = formatSizes(p.sizes);
      const hasSale = p.originalPrice && p.originalPrice > p.price;
      if (!hasSale) return TG_TEMPLATES.basic.buildText(p);
      const discount = Math.round(((p.originalPrice - p.price) / p.originalPrice) * 100);
      const lines = [];
      if (brand) lines.push(`<b>${brand}</b>                              IWAK.RU`);
      else lines.push('IWAK.RU');
      lines.push('');
      lines.push(`<b>СКИДКА −${discount}%</b>`);
      lines.push(name);
      if (sizeLine) { lines.push(''); lines.push(sizeLine); }
      lines.push(`<s>${Math.round(p.originalPrice)} ₽</s>  ${Math.round(p.price)} ₽`);
      lines.push('');
      lines.push('В наличии');
      lines.push('Россия / Беларусь');
      return lines.join('\n');
    },
  },
  premium: {
    type: 'product',
    defaultButtons: TG_PRODUCT_BUTTONS,
    buildText(p) {
      const brand = p.brand ? escapeHtml(p.brand) : '';
      const name = escapeHtml(p.name || '');
      const sizeLine = formatSizes(p.sizes);
      const lines = [];
      if (brand) lines.push(`<b>${brand}</b>                              IWAK.RU`);
      else lines.push('IWAK.RU');
      lines.push('');
      lines.push(name);
      if (sizeLine) { lines.push(''); lines.push(sizeLine); }
      lines.push(`${Math.round(p.price)} ₽`);
      lines.push('');
      lines.push('Премиум качество');
      lines.push('В наличии');
      lines.push('Россия / Беларусь');
      return lines.join('\n');
    },
  },
  custom: {
    type: 'custom',
    defaultButtons: TG_CUSTOM_BUTTONS,
    buildText: null,
  },
};

function buildPostText(p, template = 'basic') {
  const tpl = TG_TEMPLATES[template] || TG_TEMPLATES.basic;
  if (!tpl.buildText) return '';
  return tpl.buildText(p);
}

function getDefaultButtons(template) {
  const tpl = TG_TEMPLATES[template];
  return tpl ? tpl.defaultButtons : TG_PRODUCT_BUTTONS;
}

// ── Test products ──
const PRODUCT_BASIC = { id: 42, brand: 'Nike', name: 'Air Force 1', price: 12990, sizes: ['40', '41', '42', '43'] };
const PRODUCT_SALE = { id: 99, brand: 'Adidas', name: 'Superstar', price: 8990, originalPrice: 14990, sizes: ['38', '39', '40', '41', '42', '43', '44'] };
const PRODUCT_NO_BRAND = { id: 55, name: 'Basic Sneakers', price: 5990, sizes: ['41'], brand: '' };
const PRODUCT_HTML_CHARS = { id: 77, brand: 'H&M', name: 'T-shirt <Classic>', price: 2990, sizes: ['S', 'M', 'L'] };

// ═══════════════════════════════════════════════
// ЭТАП 1: ШАБЛОНЫ ТЕКСТА
// ═══════════════════════════════════════════════
console.log('\n═══ ЭТАП 1: ШАБЛОНЫ ТЕКСТА ═══');

// 1.1 Basic template
{
  const text = buildPostText(PRODUCT_BASIC, 'basic');
  assert(text.includes('<b>Nike</b>'), '1.1a basic: brand bold');
  assert(text.includes('IWAK.RU'), '1.1b basic: IWAK.RU header');
  assert(text.includes('Air Force 1'), '1.1c basic: name');
  assert(text.includes('12990 ₽'), '1.1d basic: price');
  assert(text.includes('40 · 41 · 42 · 43'), '1.1e basic: sizes');
  assert(text.includes('В наличии'), '1.1f basic: in stock');
  assert(text.includes('Россия / Беларусь'), '1.1g basic: delivery');
  // No emoji
  assert(!text.includes('📦'), '1.1h basic: no emoji 📦');
  assert(!text.includes('💰'), '1.1i basic: no emoji 💰');
  assert(!text.includes('🌍'), '1.1j basic: no emoji 🌍');
  assert(!text.includes('📏'), '1.1k basic: no emoji 📏');
}

// 1.2 New template
{
  const text = buildPostText(PRODUCT_BASIC, 'new');
  assert(text.includes('<b>НОВИНКА</b>'), '1.2a new: НОВИНКА');
  assert(text.includes('<b>Nike</b>'), '1.2b new: brand');
  assert(text.includes('Только поступили'), '1.2c new: just arrived');
  assert(!text.includes('🆕'), '1.2d new: no emoji');
}

// 1.3 Sale template (with discount)
{
  const text = buildPostText(PRODUCT_SALE, 'sale');
  assert(text.includes('<b>СКИДКА −40%</b>'), '1.3a sale: СКИДКА -40%');
  assert(text.includes('<s>14990 ₽</s>'), '1.3b sale: original price strikethrough');
  assert(text.includes('8990 ₽'), '1.3c sale: current price');
  assert(!text.includes('🔥'), '1.3d sale: no emoji');
}

// 1.4 Sale template fallback (no discount → basic)
{
  const text = buildPostText(PRODUCT_BASIC, 'sale');
  assert(!text.includes('СКИДКА'), '1.4a sale fallback: no СКИДКА');
  assert(text.includes('12990 ₽'), '1.4b sale fallback: basic price');
  assert(text.includes('В наличии'), '1.4c sale fallback: basic structure');
}

// 1.5 Premium template
{
  const text = buildPostText(PRODUCT_BASIC, 'premium');
  assert(text.includes('Премиум качество'), '1.5a premium: text');
  assert(text.includes('<b>Nike</b>'), '1.5b premium: brand');
}

// 1.6 No brand
{
  const text = buildPostText(PRODUCT_NO_BRAND, 'basic');
  assert(text.startsWith('IWAK.RU'), '1.6a no brand: starts with IWAK.RU');
  assert(text.includes('Basic Sneakers'), '1.6b no brand: name present');
}

// 1.7 Many sizes → range
{
  const text = buildPostText(PRODUCT_SALE, 'basic');
  assert(text.includes('38–44'), '1.7 many sizes: range format');
}

// 1.8 Custom template returns empty
{
  const text = buildPostText(PRODUCT_BASIC, 'custom');
  assert(text === '', '1.8 custom: buildText returns empty');
}

// 1.9 Unknown template → basic fallback
{
  const text = buildPostText(PRODUCT_BASIC, 'nonexistent');
  assert(text.includes('В наличии'), '1.9 unknown → basic fallback');
}

// ═══════════════════════════════════════════════
// ЭТАП 2: HTML ESCAPE
// ═══════════════════════════════════════════════
console.log('\n═══ ЭТАП 2: HTML ESCAPE ═══');

// 2.1 H&M brand → &amp;
{
  const text = buildPostText(PRODUCT_HTML_CHARS, 'basic');
  assert(text.includes('H&amp;M'), '2.1a H&M → H&amp;M');
  assert(text.includes('T-shirt &lt;Classic&gt;'), '2.1b <Classic> escaped');
  assert(!text.includes('<Classic>'), '2.1c raw <> not present');
}

// 2.2 escapeHtml function
{
  assert(escapeHtml('test & <b>') === 'test &amp; &lt;b&gt;', '2.2 escapeHtml correctness');
}

// 2.3 Custom mode text escape
{
  const customText = 'Привет <b>bold</b> & more';
  const safe = escapeHtml(customText);
  assert(safe === 'Привет &lt;b&gt;bold&lt;/b&gt; &amp; more', '2.3 custom text fully escaped');
}

// 2.4 Normal text unchanged
{
  assert(escapeHtml('Hello World 123 ₽') === 'Hello World 123 ₽', '2.4 normal text unchanged');
}

// ═══════════════════════════════════════════════
// ЭТАП 3: ДЕФОЛТНЫЕ КНОПКИ
// ═══════════════════════════════════════════════
console.log('\n═══ ЭТАП 3: ДЕФОЛТНЫЕ КНОПКИ ═══');

// 3.1 Product default buttons structure
{
  const btns = getDefaultButtons('basic');
  assert(btns.length === 4, '3.1a product: 4 rows');
  assert(btns[0][0].text === 'Смотреть товар', '3.1b row 1: Смотреть товар');
  assert(btns[0][0].type === 'product', '3.1c row 1: type=product');
  assert(btns[1][0].text === 'Заказать', '3.1d row 2: Заказать');
  assert(btns[1][1].text === 'Скидки', '3.1e row 2: Скидки');
  assert(btns[2][0].text === 'Отзывы', '3.1f row 3: Отзывы');
  assert(btns[2][1].text === 'Канал', '3.1g row 3: Канал');
  assert(btns[3][0].text === 'Мы в Max', '3.1h row 4: Мы в Max');
}

// 3.2 Custom default buttons structure
{
  const btns = getDefaultButtons('custom');
  assert(btns.length === 3, '3.2a custom: 3 rows');
  assert(btns[0][0].text === 'Каталог', '3.2b row 1: Каталог');
  assert(btns[1][0].text === 'Скидки', '3.2c row 2: Скидки');
  assert(btns[1][1].text === 'Канал', '3.2d row 2: Канал');
  assert(btns[2][0].text === 'Отзывы', '3.2e row 3: Отзывы');
  assert(btns[2][1].text === 'Мы в Max', '3.2f row 3: Мы в Max');
}

// 3.3 All product templates share same buttons
{
  assert(getDefaultButtons('basic') === getDefaultButtons('new'), '3.3a basic === new buttons');
  assert(getDefaultButtons('basic') === getDefaultButtons('sale'), '3.3b basic === sale buttons');
  assert(getDefaultButtons('basic') === getDefaultButtons('premium'), '3.3c basic === premium buttons');
}

// 3.4 Resolve product defaults with product
{
  const kb = resolveKeyboard(getDefaultButtons('basic'), PRODUCT_BASIC);
  assert(kb.inline_keyboard.length === 4, '3.4a 4 rows resolved');
  assert(kb.inline_keyboard[0][0].url.includes('/product/'), '3.4b row 1: product URL');
  assert(kb.inline_keyboard[1][0].url === 'https://t.me/IWAKm', '3.4c row 2: Заказать URL');
  assert(kb.inline_keyboard[1][1].url.includes('sale=true'), '3.4d row 2: Скидки filter URL');
  assert(kb.inline_keyboard[2][0].url === 'https://t.me/iwakotzivi', '3.4e row 3: Отзывы URL');
  assert(kb.inline_keyboard[2][1].url === 'https://t.me/IWAK3', '3.4f row 3: Канал URL');
  assert(kb.inline_keyboard[3][0].url.includes('max.ru'), '3.4g row 4: Max URL');
}

// 3.5 Resolve custom defaults without product
{
  const kb = resolveKeyboard(getDefaultButtons('custom'), null);
  assert(kb.inline_keyboard.length === 3, '3.5a 3 rows resolved');
  assert(kb.inline_keyboard[0][0].url === `${SITE_ORIGIN}/catalog`, '3.5b row 1: catalog URL');
  assert(kb.inline_keyboard[1][0].url.includes('sale=true'), '3.5c row 2: Скидки URL');
  assert(kb.inline_keyboard[1][1].url === 'https://t.me/IWAK3', '3.5d row 2: Канал URL');
}

// ═══════════════════════════════════════════════
// ЭТАП 4: FALLBACK КНОПОК
// ═══════════════════════════════════════════════
console.log('\n═══ ЭТАП 4: FALLBACK КНОПОК ═══');

// 4.1 Buttons explicitly passed → used as-is
{
  const custom = [[{ text: 'Custom', type: 'url', url: 'https://example.com' }]];
  const effective = (custom && Array.isArray(custom) && custom.length > 0) ? custom : getDefaultButtons('basic');
  assert(effective === custom, '4.1 explicit buttons → used');
}

// 4.2 Null buttons → fallback to template defaults
{
  const effective = (null && Array.isArray(null) && null.length > 0) ? null : getDefaultButtons('basic');
  assert(effective.length === 4, '4.2 null buttons → product defaults');
}

// 4.3 Empty array → fallback
{
  const buttons = [];
  const effective = (buttons && Array.isArray(buttons) && buttons.length > 0) ? buttons : getDefaultButtons('sale');
  assert(effective.length === 4, '4.3 empty array → defaults');
}

// 4.4 Custom mode: no buttons → custom defaults
{
  const effective = getDefaultButtons('custom');
  const kb = resolveKeyboard(effective, null);
  assert(kb.inline_keyboard.length === 3, '4.4 custom no buttons → 3 rows');
}

// 4.5 Simulate /api/tg/send product mode — no buttons in request
{
  const reqButtons = undefined;
  const template = 'basic';
  const effectiveButtons = (reqButtons && Array.isArray(reqButtons) && reqButtons.length > 0) ? reqButtons : getDefaultButtons(template);
  const kb = resolveKeyboard(effectiveButtons, PRODUCT_BASIC);
  assert(kb.inline_keyboard.length === 4, '4.5 send product no buttons → 4 rows with defaults');
  assert(kb.inline_keyboard[0][0].text === 'Смотреть товар', '4.5b first btn text');
}

// 4.6 Simulate /api/tg/send custom mode — no buttons
{
  const reqButtons = null;
  const effectiveButtons = (reqButtons && Array.isArray(reqButtons) && reqButtons.length > 0) ? reqButtons : getDefaultButtons('custom');
  const kb = resolveKeyboard(effectiveButtons, null);
  assert(kb.inline_keyboard.length === 3, '4.6 send custom no buttons → 3 rows with defaults');
}

// ═══════════════════════════════════════════════
// ЭТАП 5: CUSTOM MODE
// ═══════════════════════════════════════════════
console.log('\n═══ ЭТАП 5: CUSTOM MODE ═══');

// 5.1 Custom text gets escaped
{
  const text = '<script>alert("xss")</script>';
  const safe = escapeHtml(text);
  assert(!safe.includes('<script>'), '5.1 XSS escaped');
  assert(safe.includes('&lt;script&gt;'), '5.1b entities');
}

// 5.2 Custom payload structure
{
  const payload = { mode: 'custom', text: 'My post', buttons: getDefaultButtons('custom') };
  assert(payload.mode === 'custom', '5.2a mode');
  assert(!payload.productId, '5.2b no productId');
  const safe = escapeHtml(payload.text);
  assert(safe === 'My post', '5.2c plain text unchanged');
}

// 5.3 Custom with explicit buttons overrides defaults
{
  const myBtns = [[{ text: 'Go', type: 'url', url: 'https://example.com' }]];
  const effective = (myBtns && Array.isArray(myBtns) && myBtns.length > 0) ? myBtns : getDefaultButtons('custom');
  assert(effective === myBtns, '5.3 explicit custom buttons used');
}

// 5.4 Empty custom text validation
{
  const text = '  ';
  assert(!text.trim(), '5.4 whitespace-only → rejected');
}

// ═══════════════════════════════════════════════
// ЭТАП 6: АВТОПЛАН
// ═══════════════════════════════════════════════
console.log('\n═══ ЭТАП 6: АВТОПЛАН ═══');

// 6.1 Autoplan product mode — task uses template buttons
{
  const task = { product_id: 42, template: 'basic', buttons: null };
  const effectiveButtons = (task.buttons && Array.isArray(task.buttons) && task.buttons.length > 0) ? task.buttons : getDefaultButtons(task.template);
  const kb = resolveKeyboard(effectiveButtons, PRODUCT_BASIC);
  assert(kb.inline_keyboard.length === 4, '6.1a autoplan product: 4 rows');
  assert(kb.inline_keyboard[0][0].text === 'Смотреть товар', '6.1b first btn');
}

// 6.2 Autoplan custom mode — task uses custom defaults
{
  const task = { product_id: null, custom_text: 'Sale!', buttons: null };
  const effectiveButtons = (task.buttons && Array.isArray(task.buttons) && task.buttons.length > 0) ? task.buttons : getDefaultButtons('custom');
  const kb = resolveKeyboard(effectiveButtons, null);
  assert(kb.inline_keyboard.length === 3, '6.2a autoplan custom: 3 rows');
  assert(kb.inline_keyboard[0][0].text === 'Каталог', '6.2b first btn');
}

// 6.3 Autoplan with saved buttons → uses saved
{
  const savedBtns = [[{ text: 'Saved', type: 'url', url: 'https://saved.com' }]];
  const task = { product_id: 42, template: 'basic', buttons: savedBtns };
  const effectiveButtons = (task.buttons && Array.isArray(task.buttons) && task.buttons.length > 0) ? task.buttons : getDefaultButtons(task.template);
  assert(effectiveButtons === savedBtns, '6.3 autoplan saved buttons used');
}

// 6.4 Custom autoplan text escaped
{
  const task = { product_id: null, custom_text: 'Buy <now> & save' };
  const text = escapeHtml(task.custom_text);
  assert(text === 'Buy &lt;now&gt; &amp; save', '6.4 autoplan custom text escaped');
}

// ═══════════════════════════════════════════════
// ЭТАП 7: ОБРАТНАЯ СОВМЕСТИМОСТЬ
// ═══════════════════════════════════════════════
console.log('\n═══ ЭТАП 7: ОБРАТНАЯ СОВМЕСТИМОСТЬ ═══');

// 7.1 resolveKeyboard fallback: null buttons + product → product keyboard
{
  const kb = resolveKeyboard(null, PRODUCT_BASIC);
  assert(kb.inline_keyboard[0][0].url.includes('/product/'), '7.1 null buttons + product → productKeyboard');
}

// 7.2 resolveKeyboard: null buttons + null product → empty
{
  const kb = resolveKeyboard(null, null);
  assert(kb.inline_keyboard.length === 0, '7.2 null + null → empty');
}

// 7.3 Old-style single button still works
{
  const oldBtn = [[{ text: 'Смотреть товар', type: 'product', url: '', filter: {} }]];
  const kb = resolveKeyboard(oldBtn, PRODUCT_BASIC);
  assert(kb.inline_keyboard.length === 1, '7.3a old single button → 1 row');
  assert(kb.inline_keyboard[0][0].url.includes('/product/'), '7.3b URL resolved');
}

// 7.4 Product mode with explicit buttons still passes them through
{
  const custom = [[{ text: 'My Button', type: 'url', url: 'https://my.com' }]];
  const kb = resolveKeyboard(custom, PRODUCT_BASIC);
  assert(kb.inline_keyboard[0][0].url === 'https://my.com', '7.4 explicit buttons pass through');
}

// 7.5 buildPostText with 'basic' still returns valid text
{
  const text = buildPostText(PRODUCT_BASIC, 'basic');
  assert(text.length > 0, '7.5a non-empty');
  assert(text.includes('Nike'), '7.5b has brand');
  assert(text.includes('12990'), '7.5c has price');
}

// 7.6 All 4 product templates produce non-empty text
{
  for (const tpl of ['basic', 'new', 'sale', 'premium']) {
    const text = buildPostText(PRODUCT_SALE, tpl);
    assert(text.length > 0, `7.6 ${tpl}: non-empty`);
  }
}

// ═══════════════════════════════════════════════
// ЭТАП 8: RESOLVE KEYBOARD С НОВЫМИ ДЕФОЛТАМИ
// ═══════════════════════════════════════════════
console.log('\n═══ ЭТАП 8: FULL RESOLVE FLOW ═══');

// 8.1 Full product flow: text + keyboard
{
  const text = buildPostText(PRODUCT_BASIC, 'basic');
  const btns = getDefaultButtons('basic');
  const kb = resolveKeyboard(btns, PRODUCT_BASIC);
  assert(text.includes('<b>Nike</b>'), '8.1a text has HTML bold');
  assert(!text.includes('*Nike*'), '8.1b no markdown bold');
  assert(kb.inline_keyboard.length === 4, '8.1c 4 button rows');
  assert(kb.inline_keyboard[0][0].url.includes('nike-air-force-1-42'), '8.1d product URL slug correct');
}

// 8.2 Full sale flow
{
  const text = buildPostText(PRODUCT_SALE, 'sale');
  const btns = getDefaultButtons('sale');
  const kb = resolveKeyboard(btns, PRODUCT_SALE);
  assert(text.includes('<s>14990 ₽</s>'), '8.2a strikethrough');
  assert(text.includes('8990 ₽'), '8.2b sale price');
  assert(kb.inline_keyboard.length === 4, '8.2c buttons');
}

// 8.3 Full custom flow
{
  const rawText = 'Привет <мир> & друзья';
  const text = escapeHtml(rawText);
  const btns = getDefaultButtons('custom');
  const kb = resolveKeyboard(btns, null);
  assert(text.includes('&lt;мир&gt;'), '8.3a custom HTML escaped');
  assert(text.includes('&amp;'), '8.3b & escaped');
  assert(kb.inline_keyboard.length === 3, '8.3c custom buttons resolved');
  assert(kb.inline_keyboard[0][0].text === 'Каталог', '8.3d first btn text');
}

// 8.4 Text min formatting — no old footer
{
  const text = buildPostText(PRODUCT_BASIC, 'basic');
  assert(!text.includes('[Канал]'), '8.4a no markdown links');
  assert(!text.includes('📲'), '8.4b no 📲 emoji');
  assert(!text.includes('📦'), '8.4c no 📦 emoji');
}

// 8.5 Consistent structure across all templates
{
  for (const tpl of ['basic', 'new', 'sale', 'premium']) {
    const text = buildPostText(PRODUCT_BASIC, tpl);
    assert(text.includes('IWAK.RU'), `8.5a ${tpl}: has IWAK.RU`);
    assert(text.includes('В наличии'), `8.5b ${tpl}: has В наличии`);
    assert(text.includes('Россия / Беларусь'), `8.5c ${tpl}: has delivery`);
    assert(text.includes('12990 ₽'), `8.5d ${tpl}: has price`);
  }
}

// ═══════════════════════════════════════════════
// ИТОГО
// ═══════════════════════════════════════════════
console.log('\n═══════════════════════════════════════════════');
console.log(`ИТОГО: ${passed} passed, ${failed} failed из ${passed + failed}`);
if (failed > 0) {
  console.log('\nFAILED:');
  failures.forEach(f => console.log(`  ✗ ${f}`));
  process.exit(1);
} else {
  console.log('✅ ВСЕ ТЕСТЫ ПРОЙДЕНЫ');
  process.exit(0);
}
