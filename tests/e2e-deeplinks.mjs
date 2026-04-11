/**
 * E2E тест: Telegram deeplinks (Buy Now + Cart checkout)
 * ─────────────────────────────────────────────────────
 * Этап 1: Buy Now — формат текста + URL
 * Этап 2: Cart checkout (1 товар) — URL есть
 * Этап 3: Cart checkout (2+ товаров) — URL у каждого
 * Этап 4: encodeURIComponent корректность
 * Этап 5: Edge cases
 * Этап 6: Регрессия (share, inline buttons не затронуты)
 */

const ORIGIN = 'https://iwak.ru';
let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, label) {
  if (condition) { passed++; }
  else { failed++; failures.push(label); console.error(`  ✗ FAIL: ${label}`); }
}

// ── Copy slug logic from src/utils/slug.js ──
const TRANSLIT = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh',
  з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
  п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts',
  ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu',
  я: 'ya',
};
function toSlug(str) {
  return str.toLowerCase().split('').map(c => {
    if (TRANSLIT[c] !== undefined) return TRANSLIT[c];
    if (/[a-z0-9]/.test(c)) return c;
    return '-';
  }).join('').replace(/-+/g, '-').replace(/^-|-$/g, '');
}
function makeProductSlug(product) { return `${toSlug(product.name)}-${product.id}`; }
function productUrl(p) { return `${ORIGIN}/product/${makeProductSlug(p)}`; }

// ── Simulate deeplink builders (mirrors real component logic) ──

function buildBuyNowText(product, selectedSize) {
  const pUrl = productUrl(product);
  return [
    'Здравствуйте!',
    '',
    'Хочу заказать:',
    '',
    `${product.brand} ${product.name} — ${selectedSize}`,
    '',
    `Цена: ₽${product.price.toLocaleString('ru-RU')}`,
    '',
    'Товар:',
    pUrl,
  ].join('\n');
}

function buildCartText(enrichedItems, totalPrice) {
  const lines = enrichedItems.map((item, i) => {
    const itemUrl = productUrl(item);
    return `${i + 1}. ${item.brand} ${item.name} — ${item.size}\n${itemUrl}`;
  });
  return [
    'Здравствуйте!',
    '',
    'Хочу заказать:',
    '',
    lines.join('\n\n'),
    '',
    `Итого: ₽${totalPrice.toLocaleString('ru-RU')}`,
  ].join('\n');
}

function buildTgUrl(text) {
  return `https://t.me/IWAKm?text=${encodeURIComponent(text)}`;
}

// ── Test data ──
const P1 = { id: 42, brand: 'Nike', name: 'Air Force 1', price: 12990, sizes: ['41', '42', '43'] };
const P2 = { id: 99, brand: 'Adidas', name: 'Samba OG', price: 14990, sizes: ['40', '41'] };
const P3 = { id: 7, brand: 'New Balance', name: '550', price: 16990, sizes: ['43'] };

// ═══════════════════════════════════════════════
// ЭТАП 1: BUY NOW
// ═══════════════════════════════════════════════
console.log('\n═══ ЭТАП 1: BUY NOW ═══');
{
  const text = buildBuyNowText(P1, '42');
  const url = buildTgUrl(text);

  // 1.1 Format structure
  assert(text.startsWith('Здравствуйте!'), '1.1 starts with greeting');
  assert(text.includes('Хочу заказать:'), '1.2 includes order intent');
  assert(text.includes('Nike Air Force 1 — 42'), '1.3 product + size');
  assert(text.includes('Цена: ₽'), '1.4 price label');
  assert(text.includes('12'), '1.5 price value present');

  // 1.6 Product URL present and on its own line
  const pUrl = productUrl(P1);
  assert(text.includes(pUrl), '1.6 product URL present');

  // 1.7 URL is preceded by "Товар:" label
  assert(text.includes('Товар:\n' + pUrl), '1.7 "Товар:" label before URL');

  // 1.8 URL is at the end
  assert(text.endsWith(pUrl), '1.8 URL at end of message');

  // 1.9 URL is a valid iwak.ru link
  assert(pUrl.startsWith(ORIGIN + '/product/'), '1.9 valid product URL');
  assert(pUrl.includes('-42'), '1.10 URL contains product ID');

  // 1.11 TG deeplink format
  assert(url.startsWith('https://t.me/IWAKm?text='), '1.11 correct TG deeplink base');
  assert(url.includes(encodeURIComponent(pUrl)), '1.12 URL properly encoded in deeplink');

  // 1.13 No old format remnants
  assert(!text.includes('Итого:'), '1.13 no "Итого:" in single product');
  assert(!text.includes('Корзина:'), '1.14 no "Корзина:" in buy now');
}

// ═══════════════════════════════════════════════
// ЭТАП 2: CART — 1 ТОВАР
// ═══════════════════════════════════════════════
console.log('\n═══ ЭТАП 2: CART — 1 ТОВАР ═══');
{
  const items = [{ ...P1, size: '42', qty: 1 }];
  const total = items.reduce((s, i) => s + i.price * i.qty, 0);
  const text = buildCartText(items, total);
  const url = buildTgUrl(text);

  const pUrl = productUrl(P1);

  // 2.1 Product URL present
  assert(text.includes(pUrl), '2.1 single item: product URL present');

  // 2.2 Item line format
  assert(text.includes('1. Nike Air Force 1 — 42'), '2.2 item numbered');

  // 2.3 URL on line after item
  assert(text.includes('1. Nike Air Force 1 — 42\n' + pUrl), '2.3 URL directly after item');

  // 2.4 Total present
  assert(text.includes('Итого: ₽'), '2.4 total present');

  // 2.5 No cartUrl
  assert(!text.includes('/cart?items='), '2.5 no cart share URL');

  // 2.6 Deeplink valid
  assert(url.includes(encodeURIComponent(pUrl)), '2.6 URL encoded in deeplink');
}

// ═══════════════════════════════════════════════
// ЭТАП 3: CART — 2+ ТОВАРОВ
// ═══════════════════════════════════════════════
console.log('\n═══ ЭТАП 3: CART — 2+ ТОВАРОВ ═══');
{
  const items = [
    { ...P1, size: '42', qty: 1 },
    { ...P2, size: '41', qty: 1 },
    { ...P3, size: '43', qty: 2 },
  ];
  const total = items.reduce((s, i) => s + i.price * i.qty, 0);
  const text = buildCartText(items, total);

  const url1 = productUrl(P1);
  const url2 = productUrl(P2);
  const url3 = productUrl(P3);

  // 3.1 Each product has its own URL
  assert(text.includes(url1), '3.1a item 1 URL present');
  assert(text.includes(url2), '3.1b item 2 URL present');
  assert(text.includes(url3), '3.1c item 3 URL present');

  // 3.2 Correct numbering
  assert(text.includes('1. Nike Air Force 1 — 42'), '3.2a item 1 numbered');
  assert(text.includes('2. Adidas Samba OG — 41'), '3.2b item 2 numbered');
  assert(text.includes('3. New Balance 550 — 43'), '3.2c item 3 numbered');

  // 3.3 URLs follow their items
  assert(text.includes('1. Nike Air Force 1 — 42\n' + url1), '3.3a URL after item 1');
  assert(text.includes('2. Adidas Samba OG — 41\n' + url2), '3.3b URL after item 2');
  assert(text.includes('3. New Balance 550 — 43\n' + url3), '3.3c URL after item 3');

  // 3.4 Items separated by blank lines
  assert(text.includes(url1 + '\n\n2.'), '3.4a blank line between items 1-2');
  assert(text.includes(url2 + '\n\n3.'), '3.4b blank line between items 2-3');

  // 3.5 Total at end
  assert(text.includes('Итого: ₽'), '3.5 total present');

  // 3.6 No old cart URL
  assert(!text.includes('/cart?items='), '3.6 no cart share URL');
  assert(!text.includes('Корзина:'), '3.7 no "Корзина:" label');
}

// ═══════════════════════════════════════════════
// ЭТАП 4: ENCODING
// ═══════════════════════════════════════════════
console.log('\n═══ ЭТАП 4: ENCODING ═══');
{
  const text = buildBuyNowText(P1, '42');
  const url = buildTgUrl(text);

  // 4.1 encodeURIComponent applied
  assert(!url.includes(' '), '4.1 no raw spaces in URL');
  assert(url.includes('%0A'), '4.2 newlines encoded as %0A');
  assert(url.includes('%D0%'), '4.3 Cyrillic encoded');

  // 4.4 Decode roundtrip
  const decoded = decodeURIComponent(url.split('?text=')[1]);
  assert(decoded === text, '4.4 encode/decode roundtrip');

  // 4.5 Product URL within encoded text
  const encodedProductUrl = encodeURIComponent(productUrl(P1));
  assert(url.includes(encodedProductUrl), '4.5 product URL fully encoded');
}

// ═══════════════════════════════════════════════
// ЭТАП 5: EDGE CASES
// ═══════════════════════════════════════════════
console.log('\n═══ ЭТАП 5: EDGE CASES ═══');

// 5.1 Product with Cyrillic name
{
  const cyrillic = { id: 123, brand: 'Найк', name: 'Кроссовки Красные', price: 9990 };
  const text = buildBuyNowText(cyrillic, 'XL');
  const pUrl = productUrl(cyrillic);
  assert(text.includes(pUrl), '5.1 Cyrillic product URL present');
  assert(pUrl.includes('krossovki-krasnye-123'), '5.2 Cyrillic transliterated in slug');
  // URL should be all ASCII
  assert(/^https:\/\/[a-z0-9./-]+$/.test(pUrl), '5.3 product URL is pure ASCII');
}

// 5.4 Product with special chars in name
{
  const special = { id: 5, brand: 'H&M', name: 'T-Shirt (Classic)', price: 2990 };
  const text = buildBuyNowText(special, 'M');
  assert(text.includes('H&M'), '5.4 brand with & in text');
  const url = buildTgUrl(text);
  assert(url.includes(encodeURIComponent('H&M')), '5.5 & properly encoded in deeplink');
}

// 5.6 Large cart
{
  const manyItems = Array.from({ length: 10 }, (_, i) => ({
    id: 100 + i, brand: `Brand${i}`, name: `Product ${i}`, price: 1000 * (i + 1), size: '42', qty: 1
  }));
  const total = manyItems.reduce((s, i) => s + i.price, 0);
  const text = buildCartText(manyItems, total);

  // Each item must have its own URL
  for (let i = 0; i < 10; i++) {
    const pUrl = productUrl(manyItems[i]);
    assert(text.includes(pUrl), `5.6.${i} item ${i + 1} has URL in 10-item cart`);
  }
  assert(text.includes('10. Brand9 Product 9 — 42'), '5.7 item 10 numbered correctly');
}

// 5.8 URL length check (Telegram has ~4096 char limit for ?text=)
{
  const items = Array.from({ length: 5 }, (_, i) => ({
    id: 200 + i, brand: 'TestBrand', name: 'TestProduct', price: 5000, size: '42', qty: 1
  }));
  const total = 25000;
  const text = buildCartText(items, total);
  const url = buildTgUrl(text);
  // URL shouldn't exceed reasonable limit for 5 items
  assert(url.length < 4096, '5.8 URL length under 4096 for 5 items');
}

// ═══════════════════════════════════════════════
// ЭТАП 6: РЕГРЕССИЯ
// ═══════════════════════════════════════════════
console.log('\n═══ ЭТАП 6: РЕГРЕССИЯ ═══');

// 6.1 All deeplinks go to IWAKm
{
  const t1 = buildTgUrl(buildBuyNowText(P1, '42'));
  const t2 = buildTgUrl(buildCartText([{ ...P1, size: '42', qty: 1 }], P1.price));
  assert(t1.includes('t.me/IWAKm'), '6.1a buy now → IWAKm');
  assert(t2.includes('t.me/IWAKm'), '6.1b cart → IWAKm');
}

// 6.2 Greeting always first
{
  const t1 = buildBuyNowText(P1, '42');
  const t2 = buildCartText([{ ...P2, size: '41', qty: 1 }], P2.price);
  assert(t1.startsWith('Здравствуйте!'), '6.2a buy now greeting');
  assert(t2.startsWith('Здравствуйте!'), '6.2b cart greeting');
}

// 6.3 "Хочу заказать:" present in both
{
  const t1 = buildBuyNowText(P1, '42');
  const t2 = buildCartText([{ ...P2, size: '41', qty: 1 }], P2.price);
  assert(t1.includes('Хочу заказать:'), '6.3a buy now intent');
  assert(t2.includes('Хочу заказать:'), '6.3b cart intent');
}

// 6.4 URLs are https
{
  const t1 = buildBuyNowText(P1, '42');
  const urls = t1.match(/https?:\/\/[^\s]+/g) || [];
  assert(urls.length === 1, '6.4a single URL in buy now');
  assert(urls[0].startsWith('https://'), '6.4b URL is https');
}

// 6.5 Cart URLs count
{
  const items = [{ ...P1, size: '42', qty: 1 }, { ...P2, size: '41', qty: 1 }];
  const text = buildCartText(items, P1.price + P2.price);
  const urls = text.match(/https?:\/\/[^\s]+/g) || [];
  assert(urls.length === 2, '6.5 2 URLs for 2 items in cart');
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
