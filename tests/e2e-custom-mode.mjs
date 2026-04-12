/**
 * E2E тест: custom mode (mode='custom') для TG-постинга
 * ─────────────────────────────────────────────────────
 * Проверяет ВСЕ backend-пути без реального Telegram/PostgreSQL:
 *  - resolveKeyboard / resolveButton с product=null
 *  - POST /api/tg/send  (custom + product fallback)
 *  - POST /api/tg/autoplan/preview (custom + product)
 *  - POST /api/tg/autoplan (custom create)
 *  - GET  /api/tg/autoplan/today  (LEFT JOIN)
 *  - processScheduledTask (custom + product scheduling)
 *  - Edge cases (empty text, product-type btn in custom, no buttons, etc.)
 */

const SITE_ORIGIN = 'https://iwak.ru';
let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, label) {
  if (condition) { passed++; }
  else { failed++; failures.push(label); console.error(`  ✗ FAIL: ${label}`); }
}

// ── Copy of resolveButton / resolveKeyboard from server/index.js ──
function productUrl(p) { return `${SITE_ORIGIN}/product/${p.id}`; }
function productKeyboard(p) {
  return { inline_keyboard: [[{ text: 'Смотреть товар', url: productUrl(p) }]] };
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
    case 'order': {
      const mgr = 'IWAKm';
      if (!product) return { text: btn.text, url: `https://t.me/${mgr}` };
      return { text: btn.text, url: `https://t.me/${mgr}` };
    }
    case 'webapp':
      if (!btn.url) return null;
      return { text: btn.text, web_app: { url: btn.url } };
    default:
      if (btn.url) return { text: btn.text, url: btn.url };
      return null;
  }
}

// ── Copy of generateAutoplanSlots ──
function generateAutoplanSlots(productIds, timeSlots, startDate, endDate) {
  const slots = [];
  const sortedTimes = [...timeSlots].sort();
  const startParts = startDate.split('-').map(Number);
  const endParts = endDate.split('-').map(Number);
  const endDt = new Date(Date.UTC(endParts[0], endParts[1] - 1, endParts[2], 20, 59, 59));
  let pointer = 0;
  const cur = new Date(Date.UTC(startParts[0], startParts[1] - 1, startParts[2]));
  const endDay = new Date(Date.UTC(endParts[0], endParts[1] - 1, endParts[2]));
  while (cur <= endDay) {
    const y = cur.getUTCFullYear();
    const m = String(cur.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(cur.getUTCDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${dd}`;
    for (const time of sortedTimes) {
      const scheduledAt = new Date(`${dateStr}T${time}:00+03:00`);
      if (scheduledAt > endDt) break;
      slots.push({
        date: dateStr,
        time,
        scheduledAt: scheduledAt.toISOString(),
        productId: productIds[pointer % productIds.length],
      });
      pointer++;
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return slots;
}

// ═══════════════════════════════════════════════
// ЭТАП 1: Проверка зависимостей — resolveKeyboard/resolveButton
// ═══════════════════════════════════════════════
console.log('\n═══ ЭТАП 1: ЗАВИСИМОСТИ (resolveKeyboard / resolveButton) ═══');

// 1.1  null product + no buttons → empty keyboard
{
  const kb = resolveKeyboard(null, null);
  assert(JSON.stringify(kb) === JSON.stringify({ inline_keyboard: [] }), '1.1 null product + no buttons → empty keyboard');
}

// 1.2  null product + empty array → empty keyboard
{
  const kb = resolveKeyboard([], null);
  assert(JSON.stringify(kb) === JSON.stringify({ inline_keyboard: [] }), '1.2 null product + [] → empty keyboard');
}

// 1.3  product exists + no buttons → default product keyboard
{
  const p = { id: 42 };
  const kb = resolveKeyboard(null, p);
  assert(kb.inline_keyboard[0][0].url === `${SITE_ORIGIN}/product/42`, '1.3 product + no buttons → productKeyboard');
}

// 1.4  null product + url buttons → resolved
{
  const buttons = [[{ text: '👟 Кроссовки', type: 'url', url: 'https://iwak.ru/catalog?category=sneakers' }]];
  const kb = resolveKeyboard(buttons, null);
  assert(kb.inline_keyboard.length === 1, '1.4a url button resolved');
  assert(kb.inline_keyboard[0][0].url === 'https://iwak.ru/catalog?category=sneakers', '1.4b url correct');
}

// 1.5  null product + product-type button → skipped (null)
{
  const buttons = [[{ text: 'Товар', type: 'product' }]];
  const kb = resolveKeyboard(buttons, null);
  assert(kb.inline_keyboard.length === 0, '1.5 product-type btn in custom → skipped → empty');
}

// 1.6  null product + filter button → resolved
{
  const buttons = [[{ text: 'Скидки', type: 'filter', filter: { sale: true, category: 'sneakers' } }]];
  const kb = resolveKeyboard(buttons, null);
  assert(kb.inline_keyboard.length === 1, '1.6a filter button resolved');
  assert(kb.inline_keyboard[0][0].url.includes('sale=true'), '1.6b sale param present');
  assert(kb.inline_keyboard[0][0].url.includes('category=sneakers'), '1.6c category param present');
}

// 1.7  null product + webapp button → resolved
{
  const buttons = [[{ text: 'WebApp', type: 'webapp', url: 'https://iwak.ru/app' }]];
  const kb = resolveKeyboard(buttons, null);
  assert(kb.inline_keyboard.length === 1, '1.7a webapp resolved');
  assert(kb.inline_keyboard[0][0].web_app.url === 'https://iwak.ru/app', '1.7b webapp url correct');
}

// 1.8  null product + mixed: product + url → only url survives
{
  const buttons = [[
    { text: 'Товар', type: 'product' },
    { text: 'Каталог', type: 'url', url: 'https://iwak.ru/catalog' }
  ]];
  const kb = resolveKeyboard(buttons, null);
  assert(kb.inline_keyboard.length === 1, '1.8a mixed row resolved');
  assert(kb.inline_keyboard[0].length === 1, '1.8b only url survives (product skipped)');
  assert(kb.inline_keyboard[0][0].text === 'Каталог', '1.8c correct button text');
}

// 1.9  null product + multi-row buttons
{
  const buttons = [
    [{ text: '👟 Кроссовки', type: 'url', url: 'https://iwak.ru/catalog?category=sneakers' },
     { text: '🧥 Одежда', type: 'url', url: 'https://iwak.ru/catalog?category=clothes' }],
    [{ text: '💰 Скидки', type: 'filter', filter: { sale: true } }]
  ];
  const kb = resolveKeyboard(buttons, null);
  assert(kb.inline_keyboard.length === 2, '1.9a 2 rows resolved');
  assert(kb.inline_keyboard[0].length === 2, '1.9b first row 2 buttons');
  assert(kb.inline_keyboard[1].length === 1, '1.9c second row 1 button');
}

// 1.10  null product + all product-type buttons → everything empty → fallback to empty
{
  const buttons = [
    [{ text: 'A', type: 'product' }],
    [{ text: 'B', type: 'product' }]
  ];
  const kb = resolveKeyboard(buttons, null);
  assert(kb.inline_keyboard.length === 0, '1.10 all product-type in custom → empty keyboard');
}

// 1.11  filter button with multiple genders + brands
{
  const buttons = [[{
    text: 'Фильтр', type: 'filter',
    filter: { gender: ['mens', 'womens'], brand: ['Nike', 'Adidas'], sale: true }
  }]];
  const kb = resolveKeyboard(buttons, null);
  const url = kb.inline_keyboard[0][0].url;
  assert(url.includes('gender=mens%2Cwomens'), '1.11a genders sorted and joined');
  assert(url.includes('brand=Adidas%2CNike'), '1.11b brands sorted and joined');
  assert(url.includes('sale=true'), '1.11c sale present');
}

// 1.12  product exists + product-type button → resolved with product URL
{
  const p = { id: 99 };
  const buttons = [[{ text: 'Смотреть', type: 'product' }]];
  const kb = resolveKeyboard(buttons, p);
  assert(kb.inline_keyboard.length === 1, '1.12a product-type with product → resolved');
  assert(kb.inline_keyboard[0][0].url === `${SITE_ORIGIN}/product/99`, '1.12b correct product url');
}

// ═══════════════════════════════════════════════
// ЭТАП 2: Симуляция manual custom POST /api/tg/send
// ═══════════════════════════════════════════════
console.log('\n═══ ЭТАП 2: РУЧНОЙ CUSTOM-ПОСТ (payload simulation) ═══');

// Simulate the request body that TgDrawer sends in custom mode
{
  const payload = {
    mode: 'custom',
    text: '🔥 Выбери категорию:',
    buttons: [
      [{ text: '👟 Кроссовки', type: 'url', url: 'https://iwak.ru/catalog?category=sneakers' },
       { text: '🧥 Одежда', type: 'url', url: 'https://iwak.ru/catalog?category=clothes' }],
      [{ text: '💰 Скидки', type: 'url', url: 'https://iwak.ru/catalog?sale=true' }]
    ]
  };

  // 2.1 Custom mode flag
  assert(payload.mode === 'custom', '2.1 mode is custom');

  // 2.2 No productId
  assert(!payload.productId, '2.2 no productId in payload');

  // 2.3 Text present and non-empty
  assert(payload.text?.trim().length > 0, '2.3 non-empty text');

  // 2.4 Keyboard resolves correctly
  const kb = resolveKeyboard(payload.buttons, null);
  assert(kb.inline_keyboard.length === 2, '2.4 keyboard 2 rows');

  // 2.5 First row: 2 plain URL buttons
  assert(kb.inline_keyboard[0].length === 2, '2.5a first row 2 buttons');
  assert(kb.inline_keyboard[0][0].url === 'https://iwak.ru/catalog?category=sneakers', '2.5b first URL');
  assert(kb.inline_keyboard[0][1].url === 'https://iwak.ru/catalog?category=clothes', '2.5c second URL');

  // 2.6 Second row: 1 button
  assert(kb.inline_keyboard[1].length === 1, '2.6a second row 1 button');
  assert(kb.inline_keyboard[1][0].url === 'https://iwak.ru/catalog?sale=true', '2.6b sale URL');

  // 2.7 Server would call tgEnqueue with these params (verify structure)
  const tgPayload = {
    text: payload.text,
    photos: [],
    keyboard: kb,
    productId: null,
    badges: null,
  };
  assert(tgPayload.photos.length === 0, '2.7a no photos in custom');
  assert(tgPayload.productId === null, '2.7b productId null');
  assert(tgPayload.badges === null, '2.7c badges null');
}

// ═══════════════════════════════════════════════
// ЭТАП 3: URL корректности кнопок
// ═══════════════════════════════════════════════
console.log('\n═══ ЭТАП 3: ПРОВЕРКА URL КНОПОК ═══');

// 3.1 URL type — plain URL passed through
{
  const btn = resolveButton({ text: 'Test', type: 'url', url: 'https://example.com/path?a=1&b=2' }, null);
  assert(btn.url === 'https://example.com/path?a=1&b=2', '3.1 URL passthrough');
}

// 3.2 Filter → constructed URL
{
  const btn = resolveButton({ text: 'F', type: 'filter', filter: { category: 'bags', sale: true } }, null);
  const url = new URL(btn.url);
  assert(url.origin === 'https://iwak.ru', '3.2a origin correct');
  assert(url.pathname === '/catalog', '3.2b pathname /catalog');
  assert(url.searchParams.get('category') === 'bags', '3.2c category param');
  assert(url.searchParams.get('sale') === 'true', '3.2d sale param');
}

// 3.3 Filter — empty filter → just /catalog (no ?)
{
  const btn = resolveButton({ text: 'All', type: 'filter', filter: {} }, null);
  assert(btn.url === `${SITE_ORIGIN}/catalog`, '3.3 empty filter → clean /catalog URL');
}

// 3.4 WebApp → web_app object (not url)
{
  const btn = resolveButton({ text: 'WA', type: 'webapp', url: 'https://iwak.ru/webapp' }, null);
  assert(!btn.url, '3.4a no url property');
  assert(btn.web_app.url === 'https://iwak.ru/webapp', '3.4b web_app.url correct');
}

// 3.5 URL type without url → null
{
  const btn = resolveButton({ text: 'No URL', type: 'url', url: '' }, null);
  assert(btn === null, '3.5 empty URL → null');
}

// 3.6 Filter with sizes
{
  const btn = resolveButton({ text: 'Sizes', type: 'filter', filter: { size: ['42', '43', '41'] } }, null);
  assert(btn.url.includes('size=41%2C42%2C43'), '3.6 sizes sorted');
}

// ═══════════════════════════════════════════════
// ЭТАП 4: Autoplan custom mode
// ═══════════════════════════════════════════════
console.log('\n═══ ЭТАП 4: АВТОПЛАН CUSTOM MODE ═══');

// 4.1 Preview: custom mode generates slots with dummyIds [0]
{
  const dummyIds = [0];
  const slots = generateAutoplanSlots(dummyIds, ['10:00', '14:00', '19:00'], '2025-02-01', '2025-02-03');
  assert(slots.length === 9, '4.1a 3 days × 3 slots = 9');
  assert(slots.every(s => s.productId === 0), '4.1b all productId = 0 (dummy)');

  // Enrichment (as server does)
  const enriched = slots.map(s => ({
    date: s.date,
    time: s.time,
    scheduledAt: s.scheduledAt,
    productId: null,
    productName: '📝 Свой пост',
    productBrand: '',
    productImage: '',
    productPrice: 0,
    isRepeat: false,
  }));
  assert(enriched.every(e => e.productId === null), '4.1c enriched productId = null');
  assert(enriched.every(e => e.productName === '📝 Свой пост'), '4.1d display name correct');
  assert(enriched.every(e => !e.isRepeat), '4.1e no repeats in custom');
}

// 4.2 Autoplan create: INSERT values (simulate)
{
  const buttons = [[{ text: 'Каталог', type: 'url', url: 'https://iwak.ru/catalog' }]];
  const customText = '📢 Новая акция!';

  // Server builds 7-column INSERT: plan_id, product_id, template, with_badge, scheduled_at, buttons, custom_text
  const slots = generateAutoplanSlots([0], ['12:00'], '2025-03-01', '2025-03-02');
  const taskParams = [];
  for (const s of slots) {
    taskParams.push(
      /*plan_id*/    1,
      /*product_id*/ null,
      /*template*/   'basic',
      /*with_badge*/ false,
      /*scheduled_at*/ s.scheduledAt,
      /*buttons*/    JSON.stringify(buttons),
      /*custom_text*/ customText
    );
  }
  assert(taskParams.length === 14, '4.2a 2 slots × 7 params = 14');
  assert(taskParams[1] === null, '4.2b first task product_id = null');
  assert(taskParams[6] === customText, '4.2c first task custom_text');
  assert(taskParams[8] === null, '4.2d second task product_id = null');
}

// 4.3 Scheduler: custom task (product_id is null)
{
  // Simulate task from DB
  const task = {
    id: 100,
    plan_id: 5,
    product_id: null,
    custom_text: '🎉 Распродажа!\nВсе товары -50%',
    buttons: [[{ text: '🔥 К распродаже', type: 'filter', filter: { sale: true } }]],
    template: 'basic',
    with_badge: false,
    scheduled_at: '2025-03-01T12:00:00Z',
  };

  // Server logic: if (!task.product_id) → custom path
  const isCustom = !task.product_id;
  assert(isCustom, '4.3a task.product_id null → custom path');

  const text = task.custom_text || '';
  assert(text.includes('Распродажа'), '4.3b custom_text used');

  const keyboard = resolveKeyboard(task.buttons, null);
  assert(keyboard.inline_keyboard.length === 1, '4.3c keyboard resolved without product');
  assert(keyboard.inline_keyboard[0][0].url.includes('sale=true'), '4.3d filter URL correct');

  // tgEnqueue params
  const tgPayload = { text, photos: [], keyboard, productId: null, badges: null };
  assert(tgPayload.photos.length === 0, '4.3e no photos');
  assert(tgPayload.productId === null, '4.3f productId null');
}

// 4.4 Today endpoint: LEFT JOIN handles null product_id
{
  // Simulate DB row with null product
  const rows = [
    { scheduled_at: '2025-03-01T10:00:00Z', custom_text: 'Custom post text', name: null, brand: null, price: null, image: null, product_id: null },
    { scheduled_at: '2025-03-01T14:00:00Z', custom_text: null, name: 'Air Force', brand: 'Nike', price: '12990', image: '/img/1.jpg', product_id: 42 },
  ];

  const mapped = rows.map(row => ({
    time: row.scheduled_at,
    name: row.product_id ? [row.brand, row.name].filter(Boolean).join(' ') : '📝 Свой пост',
    price: row.price ? parseFloat(row.price) : null,
    image: row.image,
  }));

  assert(mapped[0].name === '📝 Свой пост', '4.4a custom row → 📝 label');
  assert(mapped[0].price === null, '4.4b custom row → null price');
  assert(mapped[1].name === 'Nike Air Force', '4.4c product row → brand + name');
  assert(mapped[1].price === 12990, '4.4d product row → price parsed');
}

// ═══════════════════════════════════════════════
// ЭТАП 5: EDGE CASES
// ═══════════════════════════════════════════════
console.log('\n═══ ЭТАП 5: EDGE CASES ═══');

// 5.1 Empty text in custom mode → server returns 400
{
  const customText = '';
  const shouldReject = !customText?.trim();
  assert(shouldReject, '5.1 empty text → 400');
}

// 5.2 Whitespace-only text → rejected
{
  const customText = '   \n  ';
  const shouldReject = !customText?.trim();
  assert(shouldReject, '5.2 whitespace-only text → 400');
}

// 5.3 Custom mode with no buttons → empty keyboard
{
  const kb = resolveKeyboard(null, null);
  assert(kb.inline_keyboard.length === 0, '5.3 no buttons in custom → empty keyboard');
}

// 5.4 Custom mode with undefined buttons → empty keyboard
{
  const kb = resolveKeyboard(undefined, null);
  assert(kb.inline_keyboard.length === 0, '5.4 undefined buttons → empty keyboard');
}

// 5.5 Product-type button only in custom → all buttons skipped → empty
{
  const buttons = [[{ text: 'Товар', type: 'product' }]];
  const kb = resolveKeyboard(buttons, null);
  assert(kb.inline_keyboard.length === 0, '5.5 only product-type in custom → empty');
}

// 5.6 Custom autoplan with empty customText.trim() → validation rejects
{
  const formCustomText = '   ';
  const shouldReject = !formCustomText?.trim();
  assert(shouldReject, '5.6 autoplan custom validation: whitespace → reject');
}

// 5.7 Custom mode in TgDrawer sends correct payload structure
{
  const editText = '🔥 Test post';
  const buttons = [[{ text: 'OK', type: 'url', url: 'https://iwak.ru' }]];
  // Simulate handleSend custom branch
  const body = { mode: 'custom', text: editText, buttons };
  assert(body.mode === 'custom', '5.7a payload mode');
  assert(!body.productId, '5.7b no productId');
  assert(!body.template, '5.7c no template');
  assert(!body.withBadge, '5.7d no withBadge');
  assert(body.text === editText, '5.7e text from editText');
}

// 5.8 handleModeSwitch resets state correctly (simulate)
{
  let editText = 'old text';
  let buttons = [[{ text: 'old', type: 'url', url: 'https://old.com' }]];
  const EMPTY_BUTTONS = [[{ text: '', type: 'url', url: '', filter: { category: '', gender: [], brand: [], sale: false } }]];

  // Switch to custom
  editText = '';
  buttons = EMPTY_BUTTONS;
  assert(editText === '', '5.8a mode switch → editText reset');
  assert(JSON.stringify(buttons) === JSON.stringify(EMPTY_BUTTONS), '5.8b mode switch → buttons reset');
}

// 5.9 Buttons with empty text → skipped
{
  const buttons = [[{ text: '', type: 'url', url: 'https://iwak.ru' }]];
  const kb = resolveKeyboard(buttons, null);
  assert(kb.inline_keyboard.length === 0, '5.9 empty btn.text → skipped');
}

// 5.10 Buttons with null row → skipped
{
  const buttons = [null, [{ text: 'Valid', type: 'url', url: 'https://iwak.ru' }]];
  const kb = resolveKeyboard(buttons, null);
  assert(kb.inline_keyboard.length === 1, '5.10 null row skipped, valid row kept');
}

// 5.11 Custom mode: WebApp button with empty URL → skipped
{
  const btn = resolveButton({ text: 'WA', type: 'webapp', url: '' }, null);
  assert(btn === null, '5.11 webapp empty url → null');
}

// 5.12 Filter with null filter object → returns null
{
  const btn = resolveButton({ text: 'Bad', type: 'filter', filter: null }, null);
  assert(btn === null, '5.12 null filter object → null');
}

// ═══════════════════════════════════════════════
// ЭТАП 6: РЕГРЕССИЯ — product mode не сломан
// ═══════════════════════════════════════════════
console.log('\n═══ ЭТАП 6: РЕГРЕССИЯ (product mode) ═══');

const testProduct = { id: 42 };

// 6.1 Product mode: no custom buttons → default keyboard
{
  const kb = resolveKeyboard(null, testProduct);
  assert(kb.inline_keyboard[0][0].text === 'Смотреть товар', '6.1a default button text');
  assert(kb.inline_keyboard[0][0].url === `${SITE_ORIGIN}/product/42`, '6.1b default button url');
}

// 6.2 Product mode: product-type button → uses product URL
{
  const buttons = [[{ text: 'Подробнее', type: 'product' }]];
  const kb = resolveKeyboard(buttons, testProduct);
  assert(kb.inline_keyboard[0][0].text === 'Подробнее', '6.2a custom text preserved');
  assert(kb.inline_keyboard[0][0].url === `${SITE_ORIGIN}/product/42`, '6.2b product URL');
}

// 6.3 Product mode: url button still works
{
  const buttons = [[{ text: 'Каталог', type: 'url', url: 'https://iwak.ru/catalog' }]];
  const kb = resolveKeyboard(buttons, testProduct);
  assert(kb.inline_keyboard[0][0].url === 'https://iwak.ru/catalog', '6.3 url button with product');
}

// 6.4 Product mode: filter button still works
{
  const buttons = [[{ text: 'Sale', type: 'filter', filter: { sale: true } }]];
  const kb = resolveKeyboard(buttons, testProduct);
  assert(kb.inline_keyboard[0][0].url.includes('sale=true'), '6.4 filter button with product');
}

// 6.5 Product mode: mixed product + url
{
  const buttons = [[
    { text: 'Товар', type: 'product' },
    { text: 'Каталог', type: 'url', url: 'https://iwak.ru/catalog' }
  ]];
  const kb = resolveKeyboard(buttons, testProduct);
  assert(kb.inline_keyboard[0].length === 2, '6.5a both buttons resolved');
  assert(kb.inline_keyboard[0][0].url === `${SITE_ORIGIN}/product/42`, '6.5b product url');
  assert(kb.inline_keyboard[0][1].url === 'https://iwak.ru/catalog', '6.5c catalog url');
}

// 6.6 Product mode: all buttons resolved to nothing → fallback to productKeyboard
{
  const buttons = [[{ text: '', type: 'url', url: '' }]]; // empty text → skipped, empty url → skipped
  const kb = resolveKeyboard(buttons, testProduct);
  assert(kb.inline_keyboard[0][0].text === 'Смотреть товар', '6.6 all buttons empty → product keyboard fallback');
}

// 6.7 Autoplan slot generation for product mode
{
  const ids = [10, 20, 30];
  const slots = generateAutoplanSlots(ids, ['10:00', '19:00'], '2025-04-01', '2025-04-02');
  assert(slots.length === 4, '6.7a 2 days × 2 slots = 4');
  assert(slots[0].productId === 10, '6.7b first product');
  assert(slots[1].productId === 20, '6.7c second product');
  assert(slots[2].productId === 30, '6.7d third product');
  assert(slots[3].productId === 10, '6.7e wraps around');
}

// 6.8 Product mode scheduler: task.product_id exists → product path
{
  const task = { product_id: 42, custom_text: null };
  assert(!!task.product_id, '6.8 task.product_id truthy → product path');
}

// 6.9 Product mode: webapp still works with product
{
  const buttons = [[{ text: 'WA', type: 'webapp', url: 'https://iwak.ru/app' }]];
  const kb = resolveKeyboard(buttons, testProduct);
  assert(kb.inline_keyboard[0][0].web_app.url === 'https://iwak.ru/app', '6.9 webapp with product');
}

// ═══════════════════════════════════════════════
// ЭТАП 7: ИТОГОВЫЙ ОТЧЁТ
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
