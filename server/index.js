// ============================================================
// IWAK — API Server
// Express + PostgreSQL + JWT auth + server-side filtering
// ============================================================

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pg from 'pg';
import path from 'path';
import pino from 'pino';

// ── PostgreSQL NUMERIC → number (не string) ─
pg.types.setTypeParser(1700, (val) => parseFloat(val));
import { fileURLToPath } from 'url';
import multer from 'multer';
import sharp from 'sharp';
import fs from 'fs';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '.env') });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Logger (pino) ───────────────────────────
// Logs to stdout — PM2 captures and rotates automatically.
// Set LOG_FILE=1 to also write to logs/app.log (legacy).
const logDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

const logDestination = process.env.LOG_FILE === '1'
  ? pino.destination(path.join(logDir, 'app.log'))
  : pino.destination(1); // stdout

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
}, logDestination);

const app = express();
const PORT = process.env.PORT || 3000;

// Критичная проверка: JWT_SECRET обязателен — нет fallback
if (!process.env.JWT_SECRET) {
  // eslint-disable-next-line no-console
  console.error('[FATAL] JWT_SECRET не задан в .env — запуск невозможен');
  process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET;
const BCRYPT_ROUNDS = 10;

// ── PostgreSQL ──────────────────────────────
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,  max: 10,
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected PostgreSQL pool error');});

// ── snake_case ↔ camelCase маппинг ──────────
// БД хранит snake_case (original_price, color_hex),
// фронтенд ожидает camelCase (originalPrice, colorHex).
const SNAKE_TO_CAMEL = {
  original_price: 'originalPrice',
  color_hex: 'colorHex',
  created_at: 'createdAt',
  updated_at: 'updatedAt',
  password_hash: 'passwordHash',
};

const CAMEL_TO_SNAKE = Object.fromEntries(
  Object.entries(SNAKE_TO_CAMEL).map(([k, v]) => [v, k])
);

function rowToCamel(row) {
  if (!row) return row;
  const out = {};
  for (const [key, val] of Object.entries(row)) {
    out[SNAKE_TO_CAMEL[key] || key] = val;
  }
  return out;
}

function bodyToSnake(data) {
  if (!data || typeof data !== 'object') return data;
  const out = {};
  for (const [key, val] of Object.entries(data)) {
    out[CAMEL_TO_SNAKE[key] || key] = val;
  }
  return out;
}

// ── Middleware ───────────────────────────────
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
app.use(compression());
app.use(helmet({
  contentSecurityPolicy: IS_PRODUCTION ? undefined : false,
  crossOriginEmbedderPolicy: false,
}));

// Доверяем proxy-заголовкам (nginx / Cloudflare) — req.ip будет читать CF-Connecting-IP
app.set('trust proxy', 1);

// In production without CORS_ORIGIN, same-origin requests still work
// (nginx serves both frontend and API on same domain).
// Set CORS_ORIGIN=https://example.com to allow specific origins explicitly.
const ALLOWED_ORIGINS = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',')
  : IS_PRODUCTION ? false : undefined; // false = reflect same-origin, undefined = allow all (dev)

app.use(cors({
  origin: ALLOWED_ORIGINS,
  credentials: true,
}));

app.use(express.json({ limit: '1mb' }));

// ── Проверяем наличие JWT в заголовке (rate limit skip) ──
function hasValidToken(req) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return false;
  try {
    jwt.verify(header.slice(7), JWT_SECRET);
    return true;
  } catch {
    return false;
  }
}

// ── API Rate Limit (100 req / 15 min per IP) — отключен для админов ──
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Слишком много запросов, попробуйте позже' },
  skip: (req) => hasValidToken(req) || req.path.startsWith('/api/products/bulk-'),
});
app.use('/api', apiLimiter);
// ── Upload Rate Limit (300 req / 15 min) — отключён для админов ──
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Превышен лимит загрузки файлов' },
  skip: (req) => hasValidToken(req),
});

// ── Счётчик неудачных попыток авторизации (brute-force защита) ──
const loginFailures = new Map(); // ip → { count, blockedUntil }

function checkLoginBlock(ip) {
  const entry = loginFailures.get(ip);
  if (!entry) return false;
  if (entry.blockedUntil && Date.now() < entry.blockedUntil) return true;
  if (entry.blockedUntil && Date.now() >= entry.blockedUntil) {
    loginFailures.delete(ip);
    return false;
  }
  return false;
}

function recordLoginFailure(ip) {
  const entry = loginFailures.get(ip) || { count: 0, blockedUntil: null };
  entry.count += 1;
  if (entry.count >= 5) {
    entry.blockedUntil = Date.now() + 15 * 60 * 1000; // 15 минут
    entry.count = 0;
  }
  loginFailures.set(ip, entry);
}

function clearLoginFailures(ip) {
  loginFailures.delete(ip);
}
// ── Request logging ─────────────────────────
app.use((req, _res, next) => {
  logger.info({ method: req.method, url: req.url });
  next();
});

// ── In-memory cache ─────────────────────────
const cache = new Map();
const CACHE_TTL = 90 * 1000; // 90 seconds

function cacheGet(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) { cache.delete(key); return null; }
  return entry.data;
}

function cacheSet(key, data) {
  cache.set(key, { data, ts: Date.now() });
}

function cacheInvalidate() {
  cache.clear();
}

// Раздача загруженных изображений
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
app.use('/uploads', express.static(uploadDir, {
  maxAge: '30d',
  immutable: true,
}));

// ── Rate limiting ───────────────────────────
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: 'Слишком много попыток. Попробуйте позже.' },
});

// ── File upload (multer) ────────────────────
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Недопустимый тип файла: ${file.mimetype}. Разрешены: JPEG, PNG, WebP, AVIF.`));
    }
  },
});

// ── JWT Auth middleware ─────────────────────
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    req.admin = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Недействительный токен' });
  }
}

// ════════════════════════════════════════════
// AUTH ENDPOINTS
// ════════════════════════════════════════════

app.post('/api/auth/login', authLimiter, async (req, res) => {
  const { login, password } = req.body;
  if (!login || !password) {
    return res.status(400).json({ error: 'Введите логин и пароль' });
  }
  const ip = req.ip || 'unknown';
  if (checkLoginBlock(ip)) {
    logger.warn({ ip }, 'Login blocked: too many failures');
    return res.status(429).json({ error: 'Слишком много неудачных попыток. Блок на 15 минут.' });
  }
  try {
    const result = await pool.query('SELECT * FROM admin_users WHERE login = $1', [login]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      recordLoginFailure(ip);
      logger.warn({ ip, login }, 'Failed login attempt');
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }
    clearLoginFailures(ip);
    logger.info({ ip, login: user.login }, 'Successful login');
    const token = jwt.sign({ id: user.id, login: user.login }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, login: user.login });
  } catch (err) {
    logger.error({ err }, 'Auth error');
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
});

app.post('/api/auth/setup', async (req, res) => {
  if (IS_PRODUCTION && process.env.ALLOW_SETUP !== 'true') {
    return res.status(403).json({ error: 'Setup отключён' });
  }
  const { login, password } = req.body;
  if (!login || !password || password.length < 6) {
    return res.status(400).json({ error: 'Логин и пароль (мин. 6 символов) обязательны' });
  }
  try {
    const existing = await pool.query('SELECT count(*) FROM admin_users');
    if (parseInt(existing.rows[0].count) > 0) {
      return res.status(403).json({ error: 'Админ уже существует' });
    }
    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await pool.query('INSERT INTO admin_users (login, password_hash) VALUES ($1, $2)', [login, hash]);
    res.status(201).json({ ok: true });
  } catch (err) {
    logger.error({ err }, 'Setup error');
    res.status(500).json({ success: false, error: 'Ошибка создания admin' });
  }
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ login: req.admin.login });
});

// POST /api/admin/verify-pin — проверка PIN-кода на сервере (не хранится в клиенте)
const pinLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  message: { error: 'Слишком много попыток PIN. Подождите.' },
});

app.post('/api/admin/verify-pin', requireAuth, pinLimiter, (req, res) => {
  const { pin } = req.body;
  const correctPin = process.env.ADMIN_DELETE_PIN;
  if (!correctPin) {
    logger.error('ADMIN_DELETE_PIN не задан в .env');
    return res.status(500).json({ error: 'Конфигурация сервера неполна' });
  }
  if (!pin || String(pin) !== String(correctPin)) {
    logger.warn({ ip: req.ip }, 'Wrong admin PIN attempt');
    return res.status(403).json({ error: 'Неверный PIN-код' });
  }
  res.json({ ok: true });
});

// ════════════════════════════════════════════
// PRODUCTS — PUBLIC
// ════════════════════════════════════════════

// GET /api/products  — список с серверными фильтрами, поиском, пагинацией
// Query: q, category, gender, brand, sizes, sale, featured, sort, limit, offset
app.get('/api/products', async (req, res) => {
  try {
    const cacheKey = 'products:' + JSON.stringify(req.query);
    const cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    const conditions = [];
    const params = [];
    let paramIdx = 0;
    const addParam = (val) => { paramIdx++; params.push(val); return `$${paramIdx}`; };

    if (req.query.q) {
      const q = req.query.q.trim();
      if (q) {
        conditions.push(`to_tsvector('russian', coalesce(name,'') || ' ' || coalesce(brand,'')) @@ plainto_tsquery('russian', ${addParam(q)})`);
      }
    }

    if (req.query.category) {
      conditions.push(`category = ${addParam(req.query.category)}`);
    }

    if (req.query.gender) {
      const genders = req.query.gender.split(',').filter(Boolean);
      if (genders.length > 0) {
        const placeholders = genders.map(g => addParam(g));
        const includeUnisex = !genders.includes('kids');
        conditions.push(
          includeUnisex
            ? `(gender IN (${placeholders.join(',')}) OR gender = 'unisex')`
            : `gender IN (${placeholders.join(',')})`
        );
      }
    }

    if (req.query.brand) {
      const brands = req.query.brand.split(',').filter(Boolean);
      if (brands.length > 0) {
        const placeholders = brands.map(b => addParam(b));
        conditions.push(`brand IN (${placeholders.join(',')})`);
      }
    }

    if (req.query.sizes) {
      const sizes = req.query.sizes.split(',').filter(Boolean);
      if (sizes.length > 0) {
        conditions.push(`sizes && ${addParam(sizes)}`);
      }
    }

    if (req.query.sale === 'true') {
      conditions.push('original_price IS NOT NULL AND original_price > price');
    }

    if (req.query.featured === 'true') {
      conditions.push('featured = true');
    }

    if (req.query.minPrice) {
      const min = parseFloat(req.query.minPrice);
      if (!isNaN(min)) conditions.push(`price >= ${addParam(min)}`);
    }

    if (req.query.maxPrice) {
      const max = parseFloat(req.query.maxPrice);
      if (!isNaN(max)) conditions.push(`price <= ${addParam(max)}`);
    }

    let orderBy = 'priority DESC, created_at DESC, id DESC';
    switch (req.query.sort) {
      case 'price-asc':  orderBy = 'price ASC, id DESC'; break;
      case 'price-desc': orderBy = 'price DESC, id DESC'; break;
      case 'newest':     orderBy = 'created_at DESC, id DESC'; break;
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 2000);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [dataResult, countResult] = await Promise.all([
      pool.query(`SELECT * FROM products ${where} ORDER BY ${orderBy} LIMIT ${limit} OFFSET ${offset}`, params),
      pool.query(`SELECT count(*) FROM products ${where}`, params),
    ]);

    const result = {
      items: dataResult.rows.map(rowToCamel),
      total: parseInt(countResult.rows[0].count),
      limit,
      offset,
    };
    cacheSet(cacheKey, result);
    res.json(result);
  } catch (err) {
    logger.error({ err, endpoint: 'GET /api/products' }, 'Products list error');
    res.status(500).json({ success: false, error: 'Ошибка получения товаров' });
  }
});

// GET /api/products/:id
app.get('/api/products/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0) {
    return res.status(400).json({ success: false, error: 'id должен быть положительным числом' });
  }
  try {
    const cacheKey = `product:${id}`;
    const cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    const result = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Товар не найден' });
    const product = rowToCamel(result.rows[0]);
    cacheSet(cacheKey, product);
    res.json(product);
  } catch (err) {
    logger.error({ err, endpoint: 'GET /api/products/:id' }, 'Product detail error');
    res.status(500).json({ success: false, error: 'Ошибка получения товара' });
  }
});

// ════════════════════════════════════════════
// PRODUCTS — ADMIN
// ════════════════════════════════════════════

app.post('/api/products', requireAuth, async (req, res) => {
  const body = bodyToSnake(req.body);
  const { name, brand, category, gender, price, original_price, color, color_hex,
          sizes, image, images, featured, badge, badge2, priority } = body;
  if (!name?.trim()) {
    return res.status(400).json({ error: 'name обязательно' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO products
        (name, brand, category, gender, price, original_price, color, color_hex,
         sizes, image, images, featured, badge, badge2, priority)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING *`,
      [name.trim(), brand || '', category, gender || 'unisex', price || 0,
       original_price || null, color || '', color_hex || '#1A1A1A',
       sizes || [], image || '', images || [], featured || false,
       badge ? JSON.stringify(badge) : null,
       badge2 ? JSON.stringify(badge2) : null,
       priority ?? 50]
    );
    res.status(201).json(rowToCamel(result.rows[0]));
    cacheInvalidate();
  } catch (err) {
    logger.error({ err }, 'POST /api/products error');
    res.status(500).json({ success: false, error: 'Ошибка создания товара' });
  }
});

app.put('/api/products/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const body = bodyToSnake(req.body);
  const { name, brand, category, gender, price, original_price, color, color_hex,
          sizes, image, images, featured, badge, badge2, priority } = body;
  try {
    // Для original_price: если явно передано (даже null) — ставим; если не передано — сохраняем старое
    const hasOrigPrice = 'original_price' in body;
    const hasBadge = 'badge' in body;
    const hasBadge2 = 'badge2' in body;
    const hasPriority = 'priority' in body;
    const result = await pool.query(
      `UPDATE products SET
        name = COALESCE($1, name), brand = COALESCE($2, brand),
        category = COALESCE($3, category), gender = COALESCE($4, gender),
        price = COALESCE($5, price),
        original_price = CASE WHEN $6::boolean THEN $7::numeric ELSE original_price END,
        color = COALESCE($8, color), color_hex = COALESCE($9, color_hex),
        sizes = COALESCE($10, sizes), image = COALESCE($11, image),
        images = COALESCE($12, images), featured = COALESCE($13, featured),
        badge = CASE WHEN $14::boolean THEN $15::jsonb ELSE badge END,
        badge2 = CASE WHEN $16::boolean THEN $17::jsonb ELSE badge2 END,
        priority = CASE WHEN $18::boolean THEN $19::integer ELSE priority END
       WHERE id = $20 RETURNING *`,
      [name, brand, category, gender, price,
       hasOrigPrice, hasOrigPrice ? original_price : null,
       color, color_hex, sizes, image, images, featured,
       hasBadge, hasBadge ? (badge ? JSON.stringify(badge) : null) : null,
       hasBadge2, hasBadge2 ? (badge2 ? JSON.stringify(badge2) : null) : null,
       hasPriority, hasPriority ? priority : null,
       id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Товар не найден' });
    res.json(rowToCamel(result.rows[0]));
    cacheInvalidate();
  } catch (err) {
    logger.error({ err }, 'PUT /api/products/:id error');
    res.status(500).json({ success: false, error: 'Ошибка обновления товара' });
  }
});

app.delete('/api/products/:id', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM products WHERE id = $1 RETURNING image, images', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Товар не найден' });
    // Очистка загруженных файлов
    const row = result.rows[0];
    const paths = [...(row.images || []), row.image].filter(Boolean);
    for (const p of paths) {
      if (p.startsWith('/uploads/')) {
        const filePath = path.join(uploadDir, path.basename(p));
        fs.unlink(filePath, () => {});
      }
    }
    res.json({ success: true });
    cacheInvalidate();
  } catch (err) {
    logger.error({ err }, 'DELETE /api/products/:id error');
    res.status(500).json({ success: false, error: 'Ошибка удаления товара' });
  }
});

app.post('/api/products/bulk-delete', requireAuth, async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids обязателен (массив)' });
  }
  if (ids.length > 100) {
    return res.status(400).json({ error: 'Максимально 100 товаров в одной операции' });
  }
  try {
    const result = await pool.query('DELETE FROM products WHERE id = ANY($1) RETURNING image, images', [ids]);
    // Очистка загруженных файлов
    for (const row of result.rows) {
      const filePaths = [...(row.images || []), row.image].filter(Boolean);
      for (const p of filePaths) {
        if (p.startsWith('/uploads/')) {
          fs.unlink(path.join(uploadDir, path.basename(p)), () => {});
        }
      }
    }
    res.json({ deleted: result.rowCount });
    cacheInvalidate();
  } catch (err) {
    logger.error({ err }, 'POST /api/products/bulk-delete error');
    res.status(500).json({ success: false, error: 'Ошибка массового удаления' });
  }
});

app.post('/api/products/bulk-update', requireAuth, async (req, res) => {
  const { ids, data, priceTransform } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids обязателен (массив)' });
  }
  if (ids.length > 100) {
    return res.status(400).json({ error: 'Максимально 100 товаров в одной операции' });
  }
  try {
    if (priceTransform) {
      const { type, value } = priceTransform;
      const numVal = parseFloat(value);
      if (!type || (type !== 'reset' && (isNaN(numVal) || numVal <= 0))) {
        return res.status(400).json({ error: 'priceTransform: type и value обязательны' });
      }
      if (type === 'discount') {
        await pool.query(
          `UPDATE products SET original_price = COALESCE(original_price, price),
            price = ROUND(price * (1 - $2::numeric / 100), 2) WHERE id = ANY($1)`, [ids, numVal]);
      } else if (type === 'markup') {
        await pool.query(
          `UPDATE products SET price = ROUND(price * (1 + $2::numeric / 100), 2) WHERE id = ANY($1)`, [ids, numVal]);
      } else if (type === 'fixed') {
        await pool.query(
          `UPDATE products SET price = $2::numeric, original_price = NULL WHERE id = ANY($1)`, [ids, numVal]);
      } else if (type === 'reset') {
        await pool.query(
          `UPDATE products SET price = COALESCE(original_price, price), original_price = NULL WHERE id = ANY($1)`, [ids]);
      }
      const updated = await pool.query('SELECT * FROM products WHERE id = ANY($1)', [ids]);
      cacheInvalidate();
      return res.json({ updated: updated.rows.map(rowToCamel) });
    }

    if (data && typeof data === 'object') {
      const snakeData = bodyToSnake(data);
      const setClauses = [];
      const params = [ids];
      let pIdx = 1;
      const allowedFields = ['featured', 'badge', 'badge2', 'category', 'gender', 'brand', 'color', 'color_hex', 'priority', 'name', 'price'];
      for (const [key, val] of Object.entries(snakeData)) {
        if (allowedFields.includes(key)) {
          pIdx++;
          if (key === 'badge' || key === 'badge2') {
            setClauses.push(`${key} = $${pIdx}::jsonb`);
            params.push(val ? JSON.stringify(val) : null);
          } else {
            setClauses.push(`${key} = $${pIdx}`);
            params.push(val);
          }
          if (key === 'price') {
            setClauses.push('original_price = NULL');
          }
        }
      }
      if (setClauses.length === 0) {
        return res.status(400).json({ error: 'Нет допустимых полей для обновления' });
      }
      await pool.query(`UPDATE products SET ${setClauses.join(', ')} WHERE id = ANY($1)`, params);
      const updated = await pool.query('SELECT * FROM products WHERE id = ANY($1)', [ids]);
      cacheInvalidate();
      return res.json({ updated: updated.rows.map(rowToCamel) });
    }

    return res.status(400).json({ success: false, error: 'Нужен data или priceTransform' });
  } catch (err) {
    logger.error({ err }, 'POST /api/products/bulk-update error');
    res.status(500).json({ success: false, error: 'Ошибка массового обновления' });
  }
});

// ════════════════════════════════════════════
// UPLOAD (admin)
// ════════════════════════════════════════════

app.post('/api/upload', requireAuth, uploadLimiter, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });
  const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}.webp`;
  const outPath = path.join(uploadDir, filename);
  try {
    // Проверка magic bytes через sharp.metadata() — отклоняет не-изображения до обработки
    const meta = await sharp(req.file.buffer).metadata();
    const ALLOWED_FORMATS = ['jpeg', 'png', 'webp', 'avif', 'gif'];
    if (!ALLOWED_FORMATS.includes(meta.format)) {
      logger.warn({ ip: req.ip, format: meta.format }, 'Upload rejected: invalid image format');
      return res.status(415).json({ success: false, error: 'Недопустимый формат файла' });
    }
    await sharp(req.file.buffer)
      .rotate()
      .resize({ width: 1200, withoutEnlargement: true })
      .webp({ quality: 78 })
      .toFile(outPath);
    res.json({ path: `/uploads/${filename}` });
  } catch (err) {
    logger.error({ err, ip: req.ip }, 'Upload/Sharp error');
    // Если sharp не смог распознать — это не изображение
    if (err.message?.includes('Input buffer contains unsupported image format') ||
        err.message?.includes('VipsJpeg') || err.message?.includes('Input file is missing')) {
      return res.status(415).json({ success: false, error: 'Недопустимый формат файла' });
    }
    res.status(422).json({ success: false, error: 'Не удалось обработать изображение' });
  }
});

app.use((err, _req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ success: false, error: 'Файл слишком большой (макс. 10 МБ)' });
    return res.status(400).json({ success: false, error: err.message });
  }
  if (err.message?.includes('Недопустимый тип файла')) {
    return res.status(415).json({ success: false, error: err.message });
  }
  next(err);
});

// ════════════════════════════════════════════
// CLIENT ERROR LOGS (admin-only)
// ════════════════════════════════════════════

const clientLogPath = path.join(logDir, 'client-errors.log');

app.post('/api/logs', requireAuth, (req, res) => {
  const { timestamp, url: errorUrl, method, status, message } = req.body || {};
  if (!message) return res.status(400).json({ error: 'message required' });
  const entry = {
    timestamp: timestamp || new Date().toISOString(),
    url: errorUrl || null,
    method: method || null,
    status: status || null,
    message: String(message).slice(0, 500),
    adminId: req.admin?.id || null,
    ip: req.ip,
  };
  logger.warn({ clientError: entry }, 'Client error report');
  // Append to dedicated log file (one JSON per line)
  fs.appendFile(clientLogPath, JSON.stringify(entry) + '\n', () => {});
  res.json({ ok: true });
});

// ════════════════════════════════════════════
// ANALYTICS — EVENT COLLECTION (public)
// ════════════════════════════════════════════

const ALLOWED_EVENT_TYPES = new Set(['page_view', 'product_view', 'share']);

app.post('/api/events', async (req, res) => {
  const events = req.body;
  if (!Array.isArray(events) || events.length === 0 || events.length > 20) {
    return res.status(400).json({ error: 'Expected array of 1-20 events' });
  }

  // City from Cloudflare header (enable "Add visitor location headers" in CF dashboard)
  const rawCity = req.headers['cf-ipcity'];
  const city = rawCity ? decodeURIComponent(rawCity) : null;

  try {
    const values = [];
    const params = [];
    let idx = 0;

    for (const evt of events) {
      if (!evt.type || typeof evt.type !== 'string') continue;
      if (!ALLOWED_EVENT_TYPES.has(evt.type)) continue;

      const data = evt.data && typeof evt.data === 'object' && !Array.isArray(evt.data) ? evt.data : {};
      const sessionId = typeof evt.sessionId === 'string' ? evt.sessionId.slice(0, 36) : null;

      const base = idx * 4;
      values.push(`($${base + 1}, $${base + 2}::jsonb, $${base + 3}, $${base + 4})`);
      params.push(evt.type, JSON.stringify(data), sessionId, city);
      idx++;
    }

    if (values.length === 0) return res.status(400).json({ error: 'No valid events' });

    await pool.query(
      `INSERT INTO events (type, data, session_id, city) VALUES ${values.join(', ')}`,
      params
    );

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, 'POST /api/events error');
    res.status(500).json({ error: 'Server error' });
  }
});

// ════════════════════════════════════════════
// ANALYTICS — AGGREGATED DATA (admin-only)
// ════════════════════════════════════════════

app.get('/api/analytics', requireAuth, async (req, res) => {
  const period = req.query.period || '7d';
  let interval;
  switch (period) {
    case 'today': interval = '1 day'; break;
    case '30d':   interval = '30 days'; break;
    default:      interval = '7 days';
  }

  try {
    const [visits, views, shares, topProducts, topCities, byHour, byDay, productHours, online] = await Promise.all([
      pool.query(
        `SELECT COUNT(DISTINCT session_id) AS count FROM events
         WHERE type = 'page_view' AND created_at >= now() - $1::interval`, [interval]
      ),
      pool.query(
        `SELECT COUNT(*) AS count FROM events
         WHERE type = 'product_view' AND created_at >= now() - $1::interval`, [interval]
      ),
      pool.query(
        `SELECT COUNT(*) AS count FROM events
         WHERE type = 'share' AND created_at >= now() - $1::interval`, [interval]
      ),
      pool.query(
        `SELECT data->>'productId' AS product_id, COUNT(*) AS views
         FROM events
         WHERE type = 'product_view' AND created_at >= now() - $1::interval
         GROUP BY data->>'productId'
         ORDER BY views DESC
         LIMIT 20`, [interval]
      ),
      pool.query(
        `SELECT COALESCE(city, 'Неизвестно') AS city, COUNT(DISTINCT session_id) AS visits
         FROM events
         WHERE type = 'page_view' AND created_at >= now() - $1::interval
         GROUP BY city
         ORDER BY visits DESC
         LIMIT 15`, [interval]
      ),
      pool.query(
        `SELECT EXTRACT(HOUR FROM created_at AT TIME ZONE 'Europe/Moscow')::int AS hour, COUNT(*) AS count
         FROM events
         WHERE created_at >= now() - $1::interval
         GROUP BY hour
         ORDER BY hour`, [interval]
      ),
      pool.query(
        `SELECT DATE(created_at AT TIME ZONE 'Europe/Moscow') AS date, COUNT(*) AS count
         FROM events
         WHERE created_at >= now() - $1::interval
         GROUP BY date
         ORDER BY date`, [interval]
      ),
      pool.query(
        `SELECT data->>'productId' AS product_id,
                EXTRACT(HOUR FROM created_at AT TIME ZONE 'Europe/Moscow')::int AS hour,
                COUNT(*) AS cnt
         FROM events
         WHERE type = 'product_view' AND created_at >= now() - $1::interval
         GROUP BY data->>'productId', hour`, [interval]
      ),
      pool.query(
        `SELECT COUNT(DISTINCT session_id) AS count FROM events
         WHERE created_at >= now() - interval '2 minutes'`
      ),
    ]);

    // Enrich top products with names from products table
    const productIds = topProducts.rows
      .map(r => parseInt(r.product_id))
      .filter(id => !isNaN(id));

    let productNames = {};
    if (productIds.length > 0) {
      const pResult = await pool.query(
        'SELECT id, name, brand FROM products WHERE id = ANY($1)', [productIds]
      );
      for (const p of pResult.rows) {
        productNames[p.id] = { name: p.name, brand: p.brand };
      }
    }

    // Build peak hour map per product
    const peakHourMap = {};
    for (const r of productHours.rows) {
      const pid = r.product_id;
      const cnt = parseInt(r.cnt);
      if (!peakHourMap[pid] || cnt > peakHourMap[pid].count) {
        peakHourMap[pid] = { hour: r.hour, count: cnt };
      }
    }

    res.json({
      period,
      onlineNow: parseInt(online.rows[0].count),
      visits: parseInt(visits.rows[0].count),
      productViews: parseInt(views.rows[0].count),
      shares: parseInt(shares.rows[0].count),
      topProducts: topProducts.rows.map(r => ({
        productId: parseInt(r.product_id),
        views: parseInt(r.views),
        name: productNames[r.product_id]?.name || null,
        brand: productNames[r.product_id]?.brand || null,
        peakHour: peakHourMap[r.product_id]?.hour ?? null,
      })),
      topCities: topCities.rows.map(r => ({
        city: r.city,
        visits: parseInt(r.visits),
      })),
      activityByHour: byHour.rows.map(r => ({
        hour: r.hour,
        count: parseInt(r.count),
      })),
      activityByDay: byDay.rows.map(r => ({
        date: r.date,
        count: parseInt(r.count),
      })),
    });
  } catch (err) {
    logger.error({ err }, 'GET /api/analytics error');
    res.status(500).json({ error: 'Analytics error' });
  }
});

// ── CSV Export (admin-only) ──
app.get('/api/analytics/export', requireAuth, async (req, res) => {
  const period = req.query.period || '7d';
  let interval;
  switch (period) {
    case 'today': interval = '1 day'; break;
    case '14d':   interval = '14 days'; break;
    case '30d':   interval = '30 days'; break;
    default:      interval = '7 days';
  }

  try {
    const result = await pool.query(
      `SELECT created_at, type, data->>'productId' AS product_id, city
       FROM events
       WHERE created_at >= now() - $1::interval
       ORDER BY created_at DESC`, [interval]
    );

    const lines = ['date,type,product_id,city'];
    for (const r of result.rows) {
      const date = new Date(r.created_at).toISOString();
      const pid = r.product_id || '';
      const city = (r.city || '').replace(/,/g, ' ');
      lines.push(`${date},${r.type},${pid},${city}`);
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="analytics-${period}.csv"`);
    res.send(lines.join('\n'));
  } catch (err) {
    logger.error({ err }, 'GET /api/analytics/export error');
    res.status(500).json({ error: 'Export error' });
  }
});

// ════════════════════════════════════════════
// FILTERS META
// ════════════════════════════════════════════

app.get('/api/filters', async (_req, res) => {
  try {
    const [categories, brands, genders, sizes] = await Promise.all([
      pool.query("SELECT DISTINCT category FROM products WHERE category <> '' ORDER BY category"),
      pool.query("SELECT DISTINCT brand FROM products WHERE brand <> '' ORDER BY brand"),
      pool.query('SELECT DISTINCT gender FROM products ORDER BY gender'),
      pool.query('SELECT DISTINCT unnest(sizes) AS size FROM products ORDER BY size'),
    ]);
    res.json({
      categories: categories.rows.map(r => r.category),
      brands: brands.rows.map(r => r.brand),
      genders: genders.rows.map(r => r.gender),
      sizes: sizes.rows.map(r => r.size),
    });
  } catch (err) {
    logger.error({ err }, 'GET /api/filters error');
    res.status(500).json({ success: false, error: 'Ошибка получения фильтров' });
  }
});

// ════════════════════════════════════════════
// OG IMAGE GENERATION (1200×630, fit:cover)
// ════════════════════════════════════════════

const ogCacheDir = path.join(__dirname, '../uploads/og');
if (!fs.existsSync(ogCacheDir)) fs.mkdirSync(ogCacheDir, { recursive: true });

app.get('/og-image/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id || id <= 0) return res.status(400).end();

  const cachePath = path.join(ogCacheDir, `${id}.jpg`);
  if (fs.existsSync(cachePath)) {
    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    return res.sendFile(cachePath);
  }

  try {
    const result = await pool.query('SELECT image FROM products WHERE id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).end();

    const imgRelPath = result.rows[0].image;
    const imgPath = imgRelPath ? path.join(__dirname, '..', imgRelPath) : null;

    const OG_W = 1200;
    const OG_H = 630;

    if (imgPath && fs.existsSync(imgPath)) {
      const buf = await sharp(imgPath)
        .resize(OG_W, OG_H, { fit: 'cover', position: 'center' })
        .jpeg({ quality: 90 })
        .toBuffer();
      fs.writeFileSync(cachePath, buf);
      res.set('Content-Type', 'image/jpeg');
      res.set('Cache-Control', 'public, max-age=86400');
      return res.send(buf);
    }

    // Нет исходного изображения — серый фон с текстом IWAK
    const svgText = `<svg width="${OG_W}" height="${OG_H}">
      <rect width="100%" height="100%" fill="#f3f4f6"/>
      <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central"
        font-family="Helvetica, Arial, sans-serif" font-size="56" font-weight="700"
        letter-spacing="12" fill="#bbb">IWAK</text>
    </svg>`;
    const buf = await sharp(Buffer.from(svgText))
      .jpeg({ quality: 88 })
      .toBuffer();
    fs.writeFileSync(cachePath, buf);
    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(buf);
  } catch (err) {
    console.error('[og-image] Generation error:', err);
    logger.error({ err }, 'OG image generation error');
    // Fallback: отдать оригинальное изображение если sharp упал
    try {
      const r = await pool.query('SELECT image FROM products WHERE id = $1', [id]);
      if (r.rows.length > 0 && r.rows[0].image) {
        const origPath = path.join(__dirname, '..', r.rows[0].image);
        if (fs.existsSync(origPath)) return res.sendFile(origPath);
      }
    } catch (_e) { /* ignore */ }
    res.status(500).end();
  }
});

// ════════════════════════════════════════════
// STATIC (production) + OG prerender for bots
// ════════════════════════════════════════════

const distPath = path.join(__dirname, '../dist');

// Bot user-agent detection for OG/SEO prerender
const BOT_UA = /facebookexternalhit|twitterbot|telegrambot|whatsapp|slackbot|linkedinbot|discordbot|pinterestbot|vkshare|snapchat|googlebot|bingbot|yandex/i;

const SITE_ORIGIN = process.env.SITE_ORIGIN || 'https://iwak.ru';

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildOgHtml({ title, description, image, url }) {
  const t = escapeHtml(title);
  const d = escapeHtml(description);
  const img = escapeHtml(image);
  const u = escapeHtml(url);
  return `<!DOCTYPE html>
<html lang="ru"><head>
<meta charset="UTF-8">
<title>${t}</title>
<meta property="og:site_name" content="IWAK">
<meta property="og:type" content="product">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:image" content="${img}">
<meta property="og:url" content="${u}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${t}">
<meta name="twitter:description" content="${d}">
<meta name="twitter:image" content="${img}">
</head><body></body></html>`;
}

// Product page OG prerender — must be before static catch-all
app.get('/product/:slug', async (req, res, next) => {
  const ua = req.headers['user-agent'] || '';
  if (!BOT_UA.test(ua)) return next();

  // Extract product ID from slug: "some-name-123" → 123
  const slug = req.params.slug;
  const match = slug.match(/-(\d+)$/);
  if (!match) return next();

  try {
    const result = await pool.query('SELECT name, brand, price, image FROM products WHERE id = $1', [match[1]]);
    if (result.rows.length === 0) return next();

    const p = result.rows[0];
    const imgUrl = p.image ? `${SITE_ORIGIN}${p.image}` : `${SITE_ORIGIN}/og-main.jpg`;

    res.send(buildOgHtml({
      title: `${p.brand ? p.brand + ' ' : ''}${p.name} — IWAK`,
      description: `${p.name} — купить в IWAK за ${p.price} ₽`,
      image: imgUrl,
      url: `${SITE_ORIGIN}/product/${slug}`,
    }));
  } catch (err) {
    logger.error({ err }, 'OG prerender error');
    next();
  }
});

if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// ════════════════════════════════════════════
// GLOBAL ERROR HANDLER
// ════════════════════════════════════════════

app.use((err, _req, res, _next) => {
  logger.error({ err }, 'Unhandled error');
  res.status(500).json({ success: false, error: 'Внутренняя ошибка сервера' });
});

// ════════════════════════════════════════════
// START
// ════════════════════════════════════════════

app.listen(PORT, '0.0.0.0', () => {
  logger.info(`IWAK API server running on http://0.0.0.0:${PORT}`);
  if (JWT_SECRET === 'change-me-in-production') {
    logger.warn('⚠️  JWT_SECRET is set to the default value — change it in server/.env before going live!');
    console.warn('[SECURITY] JWT_SECRET is default — update server/.env immediately!');
  }
});
