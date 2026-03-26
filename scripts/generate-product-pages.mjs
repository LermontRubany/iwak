/**
 * Postbuild: генерирует dist/product/{slug}/index.html
 * для каждого товара с вшитыми OG meta тегами.
 *
 * Telegram Bot и другие краулеры не выполняют JS,
 * поэтому статически бакаем нужные теги в HTML.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { products } from '../src/data/products.js';

// --- Утилита slug (дублируем, чтобы не тянуть JSX-рантайм) ---
const TRANSLIT = {
  а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'yo',ж:'zh',з:'z',и:'i',
  й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',
  у:'u',ф:'f',х:'kh',ц:'ts',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',
  э:'e',ю:'yu',я:'ya',
};

function toSlug(str) {
  return str.toLowerCase().split('')
    .map((c) => TRANSLIT[c] !== undefined ? TRANSLIT[c] : /[a-z0-9]/.test(c) ? c : '-')
    .join('').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function makeProductSlug(p) {
  return `${toSlug(p.name)}-${p.id}`;
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
// --- Конец утилиты ---

const distDir = join(process.cwd(), 'dist');
let indexHtml = readFileSync(join(distDir, 'index.html'), 'utf-8');

let count = 0;

for (const product of products) {
  const slug = makeProductSlug(product);
  const title = `${product.name} — IWAK`;
  const description = `₽${product.price.toLocaleString('ru-RU')} · Размеры: ${product.sizes.join(', ')}`;
  const image = product.image.replace('w=600', 'w=1200');

  // Инжектируем product-специфичные OG теги ПЕРВЫМИ в <head>
  // Это гарантирует что Telegram увидит именно их
  const ogBlock = [
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta property="og:image" content="${esc(image)}" />`,
    `<meta property="og:type" content="product" />`,
    `<meta property="og:site_name" content="IWAK" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(description)}" />`,
    `<meta name="twitter:image" content="${esc(image)}" />`,
    `<title>${esc(title)}</title>`,
  ].join('\n    ');

  // Заменяем <head> — вставляем сразу после открывающего тега,
  // перед существующими дефолтными OG тегами (они станут вторыми)
  let html = indexHtml.replace('<head>', `<head>\n    ${ogBlock}`);

  const outDir = join(distDir, 'product', slug);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'index.html'), html, 'utf-8');
  count++;
}

console.log(`✓ Сгенерировано ${count} OG-страниц для Telegram`);
