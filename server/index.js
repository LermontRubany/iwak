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
  tg_sent_at: 'tgSentAt',
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
    logger.warn({ url: req.originalUrl, ip: req.ip }, 'Auth: missing token');
    return res.status(401).json({ error: 'Требуется авторизация', reason: 'missing_token' });
  }
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    req.admin = payload;
    next();
  } catch (err) {
    const reason = err.name === 'TokenExpiredError' ? 'expired'
      : err.name === 'JsonWebTokenError' ? 'invalid_signature'
      : 'unknown';
    logger.warn({ url: req.originalUrl, ip: req.ip, reason, errName: err.name }, 'Auth: token rejected');
    return res.status(401).json({ error: 'Недействительный токен', reason });
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
    const token = jwt.sign({ id: user.id, login: user.login }, JWT_SECRET, { expiresIn: '7d' });
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
  const mode = req.query.mode === 'data' ? 'data' : 'analysis';

  // For "today" we use midnight Moscow time, not a sliding 24h window
  const isToday = period === 'today';
  let interval, sinceExpr, prevFromExpr, prevToExpr;

  if (isToday) {
    // "today" = from 00:00 Moscow → now
    sinceExpr = `date_trunc('day', now() AT TIME ZONE 'Europe/Moscow') AT TIME ZONE 'Europe/Moscow'`;
    // "previous" for today = yesterday (same structure)
    prevFromExpr = `(date_trunc('day', now() AT TIME ZONE 'Europe/Moscow') - interval '1 day') AT TIME ZONE 'Europe/Moscow'`;
    prevToExpr = `date_trunc('day', now() AT TIME ZONE 'Europe/Moscow') AT TIME ZONE 'Europe/Moscow'`;
  } else {
    interval = period === '30d' ? '30 days' : '7 days';
    sinceExpr = `now() - '${interval}'::interval`;
    prevFromExpr = `now() - ('${interval}'::interval * 2)`;
    prevToExpr = `now() - '${interval}'::interval`;
  }

  try {
    // sinceExpr/prevFromExpr/prevToExpr are built from fixed period values above (no user input)
    const baseQueries = [
      pool.query(
        `SELECT COUNT(DISTINCT session_id) AS count FROM events
         WHERE type = 'page_view' AND created_at >= ${sinceExpr}`
      ),
      pool.query(
        `SELECT COUNT(*) AS count FROM events
         WHERE type = 'product_view' AND created_at >= ${sinceExpr}`
      ),
      pool.query(
        `SELECT COUNT(*) AS count FROM events
         WHERE type = 'share' AND created_at >= ${sinceExpr}`
      ),
      pool.query(
        `SELECT (data->>'productId')::int AS product_id, COUNT(*) AS views
         FROM events
         WHERE type = 'product_view' AND created_at >= ${sinceExpr}
           AND (data->>'productId') ~ '^[0-9]+$'
         GROUP BY (data->>'productId')::int
         ORDER BY views DESC
         LIMIT 20`
      ),
      pool.query(
        `SELECT COALESCE(city, 'Неизвестно') AS city, COUNT(DISTINCT session_id) AS visits
         FROM events
         WHERE type = 'page_view' AND created_at >= ${sinceExpr}
         GROUP BY city
         ORDER BY visits DESC
         LIMIT 15`
      ),
      pool.query(
        `SELECT EXTRACT(HOUR FROM created_at AT TIME ZONE 'Europe/Moscow')::int AS hour, COUNT(*) AS count
         FROM events
         WHERE created_at >= ${sinceExpr}
         GROUP BY hour
         ORDER BY hour`
      ),
      pool.query(
        `SELECT DATE(created_at AT TIME ZONE 'Europe/Moscow') AS date, COUNT(*) AS count
         FROM events
         WHERE created_at >= ${sinceExpr}
         GROUP BY date
         ORDER BY date`
      ),
      pool.query(
        `SELECT (data->>'productId')::int AS product_id,
                EXTRACT(HOUR FROM created_at AT TIME ZONE 'Europe/Moscow')::int AS hour,
                COUNT(*) AS cnt
         FROM events
         WHERE type = 'product_view' AND created_at >= ${sinceExpr}
           AND (data->>'productId') ~ '^[0-9]+$'
         GROUP BY (data->>'productId')::int, hour`
      ),
      pool.query(
        `SELECT COUNT(DISTINCT session_id) AS count FROM events
         WHERE created_at >= now() - interval '2 minutes'`
      ),
    ];

    // Previous-period queries only in analysis mode
    if (mode === 'analysis') {
      baseQueries.push(
        pool.query(
          `SELECT
             COUNT(DISTINCT CASE WHEN type = 'page_view' THEN session_id END) AS prev_visits,
             COUNT(CASE WHEN type = 'product_view' THEN 1 END) AS prev_views,
             COUNT(CASE WHEN type = 'share' THEN 1 END) AS prev_shares
           FROM events
           WHERE created_at >= ${prevFromExpr}
             AND created_at < ${prevToExpr}`
        ),
        pool.query(
          `SELECT (data->>'productId')::int AS product_id, COUNT(*) AS views
           FROM events
           WHERE type = 'product_view'
             AND created_at >= ${prevFromExpr}
             AND created_at < ${prevToExpr}
             AND (data->>'productId') ~ '^[0-9]+$'
           GROUP BY (data->>'productId')::int`
        ),
      );
    }

    const results = await Promise.all(baseQueries);
    const [visits, views, shares, topProducts, topCities, byHour, byDay, productHours, online] = results;
    const prevKpi = results[9] || null;
    const prevTopProducts = results[10] || null;

    // Enrich top products with names from products table
    const productIds = topProducts.rows
      .map(r => r.product_id)
      .filter(id => typeof id === 'number' && !isNaN(id));

    let productNames = {};
    if (productIds.length > 0) {
      const pResult = await pool.query(
        'SELECT id, name, brand FROM products WHERE id = ANY($1)', [productIds]
      );
      for (const p of pResult.rows) {
        productNames[p.id] = { name: p.name, brand: p.brand };
      }
    }

    // ── Delta computation (analysis mode only) ──
    const curVisits = parseInt(visits.rows[0].count);
    const curViews = parseInt(views.rows[0].count);
    const curShares = parseInt(shares.rows[0].count);

    let prevVisits = 0, prevViews = 0, prevShares = 0;
    const prevProductMap = {};
    function calcPercent(cur, prev) {
      if (prev > 0) return Math.round(((cur - prev) / prev) * 100);
      return null;
    }

    if (mode === 'analysis' && prevKpi) {
      prevVisits = parseInt(prevKpi.rows[0].prev_visits) || 0;
      prevViews = parseInt(prevKpi.rows[0].prev_views) || 0;
      prevShares = parseInt(prevKpi.rows[0].prev_shares) || 0;
      if (prevTopProducts) {
        for (const r of prevTopProducts.rows) {
          prevProductMap[r.product_id] = parseInt(r.views);
        }
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

    const isAnalysis = mode === 'analysis';

    const response = {
      period,
      mode,
      onlineNow: parseInt(online.rows[0].count),
      visits: curVisits,
      productViews: curViews,
      shares: curShares,
      topProducts: topProducts.rows.map(r => {
        const v = parseInt(r.views);
        const pid = r.product_id;
        const pv = prevProductMap[pid] || 0;
        const item = {
          productId: pid,
          views: v,
          name: productNames[pid]?.name || null,
          brand: productNames[pid]?.brand || null,
          peakHour: peakHourMap[pid]?.hour ?? null,
        };
        if (isAnalysis) {
          item.delta = v - pv;
          item.percent = pv > 0 ? Math.round(((v - pv) / pv) * 100) : null;
          item.isNew = pv === 0;
        }
        return item;
      }),
      topCities: topCities.rows.map(r => ({
        city: r.city,
        visits: parseInt(r.visits),
      })),
      activityByHour: byHour.rows.map(r => ({
        hour: r.hour,
        count: parseInt(r.count),
      })),
      activityByDay: byDay.rows.map((r, i) => {
        const entry = { date: r.date, count: parseInt(r.count) };
        if (isAnalysis) {
          entry.delta = i > 0 ? parseInt(r.count) - parseInt(byDay.rows[i - 1].count) : null;
        }
        return entry;
      }),
    };

    if (isAnalysis) {
      response.visitsDelta = curVisits - prevVisits;
      response.visitsPercent = calcPercent(curVisits, prevVisits);
      response.visitsIsNew = prevVisits === 0;
      response.productViewsDelta = curViews - prevViews;
      response.productViewsPercent = calcPercent(curViews, prevViews);
      response.productViewsIsNew = prevViews === 0;
      response.sharesDelta = curShares - prevShares;
      response.sharesPercent = calcPercent(curShares, prevShares);
      response.sharesIsNew = prevShares === 0;
    }

    res.json(response);
  } catch (err) {
    logger.error({ err }, 'GET /api/analytics error');
    res.status(500).json({ error: 'Analytics error' });
  }
});

// ── Online count (lightweight, for polling) ──
app.get('/api/analytics/online', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT COUNT(DISTINCT session_id) AS count FROM events
       WHERE created_at >= now() - interval '2 minutes'`
    );
    res.json({ onlineNow: parseInt(result.rows[0].count) });
  } catch (err) {
    logger.error({ err }, 'GET /api/analytics/online error');
    res.status(500).json({ error: 'Online count error' });
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

// ── Aggregated Report CSV (admin-only) ──
app.get('/api/analytics/export-report', requireAuth, async (req, res) => {
  const period = req.query.period || '7d';
  let interval;
  switch (period) {
    case 'today': interval = '1 day'; break;
    case '14d':   interval = '14 days'; break;
    case '30d':   interval = '30 days'; break;
    default:      interval = '7 days';
  }

  try {
    const [summary, topViews, topShares, byDay, byHour, geo] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(DISTINCT session_id) FILTER (WHERE type = 'page_view') AS visits,
           COUNT(*) FILTER (WHERE type = 'product_view') AS product_views,
           COUNT(*) FILTER (WHERE type = 'share') AS shares
         FROM events WHERE created_at >= now() - $1::interval`, [interval]
      ),
      pool.query(
        `SELECT data->>'productId' AS pid, COUNT(*) AS views
         FROM events WHERE type = 'product_view' AND created_at >= now() - $1::interval
         GROUP BY pid ORDER BY views DESC LIMIT 20`, [interval]
      ),
      pool.query(
        `SELECT data->>'productId' AS pid, COUNT(*) AS shares
         FROM events WHERE type = 'share' AND created_at >= now() - $1::interval
         GROUP BY pid`, [interval]
      ),
      pool.query(
        `SELECT DATE(created_at AT TIME ZONE 'Europe/Moscow') AS date,
                COUNT(*) AS events,
                COUNT(DISTINCT session_id) AS visits
         FROM events WHERE created_at >= now() - $1::interval
         GROUP BY date ORDER BY date`, [interval]
      ),
      pool.query(
        `SELECT EXTRACT(HOUR FROM created_at AT TIME ZONE 'Europe/Moscow')::int AS hour,
                COUNT(*) AS events
         FROM events WHERE created_at >= now() - $1::interval
         GROUP BY hour ORDER BY hour`, [interval]
      ),
      pool.query(
        `SELECT COALESCE(city, 'Unknown') AS city, COUNT(DISTINCT session_id) AS visits
         FROM events WHERE type = 'page_view' AND created_at >= now() - $1::interval
         GROUP BY city ORDER BY visits DESC LIMIT 15`, [interval]
      ),
    ]);

    // Product peak hours
    const peakRes = await pool.query(
      `SELECT data->>'productId' AS pid,
              EXTRACT(HOUR FROM created_at AT TIME ZONE 'Europe/Moscow')::int AS hour,
              COUNT(*) AS cnt
       FROM events WHERE type = 'product_view' AND created_at >= now() - $1::interval
       GROUP BY pid, hour`, [interval]
    );
    const peakMap = {};
    for (const r of peakRes.rows) {
      const cnt = parseInt(r.cnt);
      if (!peakMap[r.pid] || cnt > peakMap[r.pid].count) {
        peakMap[r.pid] = { hour: r.hour, count: cnt };
      }
    }

    // Shares map
    const sharesMap = {};
    for (const r of topShares.rows) sharesMap[r.pid] = parseInt(r.shares);

    // Product names
    const pids = topViews.rows.map(r => parseInt(r.pid)).filter(id => !isNaN(id));
    const nameMap = {};
    if (pids.length > 0) {
      const pRes = await pool.query('SELECT id, name, brand FROM products WHERE id = ANY($1)', [pids]);
      for (const p of pRes.rows) nameMap[p.id] = `${p.brand} ${p.name}`.trim();
    }

    const s = summary.rows[0];
    const visits = parseInt(s.visits);
    const pViews = parseInt(s.product_views);
    const shares = parseInt(s.shares);
    const avg = visits > 0 ? (pViews / visits).toFixed(1) : '0';
    const conv = pViews > 0 ? ((shares / pViews) * 100).toFixed(1) : '0';

    const lines = [];
    lines.push('== SUMMARY ==');
    lines.push('visits,product_views,shares,avg_views_per_visit,conversion_rate');
    lines.push(`${visits},${pViews},${shares},${avg},${conv}%`);
    lines.push('');

    lines.push('== TOP PRODUCTS ==');
    lines.push('product,views,shares,peak_hour');
    for (const r of topViews.rows) {
      const name = (nameMap[r.pid] || `#${r.pid}`).replace(/,/g, ' ');
      const sh = sharesMap[r.pid] || 0;
      const ph = peakMap[r.pid] ? String(peakMap[r.pid].hour).padStart(2, '0') + ':00' : '';
      lines.push(`${name},${r.views},${sh},${ph}`);
    }
    lines.push('');

    lines.push('== ACTIVITY BY DAY ==');
    lines.push('date,events,visits');
    for (const r of byDay.rows) {
      const d = new Date(r.date);
      const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      lines.push(`${ds},${r.events},${r.visits}`);
    }
    lines.push('');

    lines.push('== ACTIVITY BY HOUR ==');
    lines.push('hour,events');
    for (const r of byHour.rows) {
      lines.push(`${String(r.hour).padStart(2, '0')}:00,${r.events}`);
    }
    lines.push('');

    lines.push('== GEO ==');
    lines.push('city,visits');
    for (const r of geo.rows) {
      lines.push(`${(r.city || '').replace(/,/g, ' ')},${r.visits}`);
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="report-${period}.csv"`);
    res.send('\uFEFF' + lines.join('\n'));
  } catch (err) {
    logger.error({ err }, 'GET /api/analytics/export-report error');
    res.status(500).json({ error: 'Export report error' });
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

// ════════════════════════════════════════════
// TELEGRAM AUTOMATION (admin-only)
// ════════════════════════════════════════════

function maskToken(token) {
  if (!token || token.length < 12) return '••••••';
  return token.slice(0, 7) + '•••' + token.slice(-4);
}

// ── Get TG config (token masked) ──
app.get('/api/tg/config', requireAuth, async (_req, res) => {
  try {
    const r = await pool.query('SELECT bot_token, chat_id, updated_at FROM tg_config WHERE id = 1');
    if (r.rows.length === 0) return res.json({ botToken: '', chatId: '', configured: false });
    const row = r.rows[0];
    res.json({
      botTokenMasked: maskToken(row.bot_token),
      chatId: row.chat_id,
      configured: !!(row.bot_token && row.chat_id),
      updatedAt: row.updated_at,
    });
  } catch (err) {
    logger.error({ err }, 'GET /api/tg/config error');
    res.status(500).json({ error: 'Config error' });
  }
});

// ── Save TG config (with diagnostics) ──
app.post('/api/tg/config', requireAuth, async (req, res) => {
  const { botToken, chatId } = req.body;
  if (!botToken || !chatId) return res.status(400).json({ error: 'botToken and chatId required', code: 'MISSING_FIELDS' });

  const token = botToken.trim();
  const chat = chatId.trim();

  // Step 1: validate bot token via getMe
  try {
    const meResp = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const meJson = await meResp.json();
    if (!meJson.ok) {
      logger.warn({ step: 'token_check', description: meJson.description }, 'TG config: invalid token');
      return res.status(400).json({ error: 'Неверный bot token', code: 'INVALID_TOKEN', field: 'botToken' });
    }
  } catch (err) {
    logger.error({ step: 'token_check', err }, 'TG config: network error');
    return res.status(502).json({ error: 'Нет соединения с Telegram API', code: 'NETWORK_ERROR' });
  }

  // Step 2: validate chat_id by sending a test message and deleting it
  try {
    const testResp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text: '✅ IWAK бот подключен', disable_notification: true }),
    });
    const testJson = await testResp.json();
    if (!testJson.ok) {
      const desc = (testJson.description || '').toLowerCase();
      let error = 'Ошибка доступа к каналу';
      let code = 'CHAT_ERROR';
      if (desc.includes('chat not found') || desc.includes('not found')) {
        error = 'Канал не найден — проверьте chat_id';
        code = 'CHAT_NOT_FOUND';
      } else if (desc.includes('bot is not a member')) {
        error = 'Бот не добавлен в канал';
        code = 'BOT_NOT_MEMBER';
      } else if (desc.includes('not enough rights') || desc.includes('have no rights')) {
        error = 'Боту не выданы права администратора';
        code = 'NO_RIGHTS';
      } else if (desc.includes('kicked') || desc.includes('banned')) {
        error = 'Бот заблокирован в канале';
        code = 'BOT_BANNED';
      }
      logger.warn({ step: 'chat_check', description: testJson.description, code }, 'TG config: chat access error');
      return res.status(400).json({ error, code, field: 'chatId' });
    }
    // Delete the test message
    try {
      await fetch(`https://api.telegram.org/bot${token}/deleteMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chat, message_id: testJson.result.message_id }),
      });
    } catch { /* ignore delete failure */ }
  } catch (err) {
    logger.error({ step: 'chat_check', err }, 'TG config: network error on chat test');
    return res.status(502).json({ error: 'Нет соединения с Telegram API', code: 'NETWORK_ERROR' });
  }

  // Step 3: save to DB
  try {
    await pool.query(
      `INSERT INTO tg_config (id, bot_token, chat_id, updated_at) VALUES (1, $1, $2, now())
       ON CONFLICT (id) DO UPDATE SET bot_token = $1, chat_id = $2, updated_at = now()`,
      [token, chat]
    );
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, 'POST /api/tg/config DB error');
    res.status(500).json({ error: 'Ошибка сохранения в базу', code: 'DB_ERROR' });
  }
});

// ── Product URL helper ──
function productUrl(p) {
  const slug = (p.brand ? p.brand + ' ' : '').concat(p.name)
    .toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return `${SITE_ORIGIN}/product/${slug}-${p.id}`;
}

// ── Escape Markdown special chars (legacy parse_mode: Markdown) ──
function escapeMarkdown(text) {
  return String(text).replace(/([*_`\[])/g, '\\$1');
}

// ── Build Telegram post text from product ──
const TG_FOOTER = [
  '',
  '📲 *IWAK*',
  '[Канал](https://t.me/IWAK3) • [Отзывы](https://t.me/iwakotzivi) • [Менеджер](https://t.me/IWAKm) • [Max](https://max.ru/join/XJio5vHkjIhHJfk4CqNB09pvE0bKwDCVxGuYMxI1buo)',
  '',
  '*IWAK.RU*',
].join('\n');

function formatSizes(sizes) {
  if (!sizes || sizes.length === 0) return '';
  const sorted = [...sizes].sort((a, b) => {
    const na = Number(a), nb = Number(b);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.localeCompare(b);
  });
  if (sorted.length > 6) {
    const allNum = sorted.every(s => !isNaN(Number(s)));
    if (allNum) return `📏 ${sorted[0]}–${sorted[sorted.length - 1]}`;
  }
  return `📏 ${sorted.join(' • ')}`;
}

function buildPostText(p, template = 'basic') {
  const brand = p.brand ? escapeMarkdown(p.brand) : '';
  const name = escapeMarkdown(p.name || '');
  const hasSale = p.originalPrice && p.originalPrice > p.price;
  const sizeLine = formatSizes(p.sizes);
  const delivery = '🌍 Доставка: 🇷🇺 Россия • 🇧🇾 Беларусь';

  // If sale template requested but no discount — fallback to basic
  const tpl = (template === 'sale' && !hasSale) ? 'basic' : template;

  const lines = [];

  if (tpl === 'new') {
    lines.push('🆕 *НОВИНКА*');
    lines.push('');
    if (brand) lines.push(`*${brand}*`);
    lines.push(name);
    if (sizeLine) { lines.push(''); lines.push(sizeLine); }
    lines.push('');
    lines.push(`💰 *${Math.round(p.price)} ₽*`);
    lines.push('');
    lines.push('🔥 Только поступили');
    lines.push('📦 В наличии');
    lines.push(delivery);
  } else if (tpl === 'sale') {
    const discount = Math.round(((p.originalPrice - p.price) / p.originalPrice) * 100);
    lines.push(`🔥 *СКИДКА -${discount}%*`);
    lines.push('');
    if (brand) lines.push(`*${brand}*`);
    lines.push(name);
    if (sizeLine) { lines.push(''); lines.push(sizeLine); }
    lines.push('');
    lines.push(`💸 Было: ${Math.round(p.originalPrice)} ₽`);
    lines.push(`💰 *Сейчас: ${Math.round(p.price)} ₽*`);
    lines.push('');
    lines.push('📦 В наличии');
    lines.push(delivery);
  } else if (tpl === 'premium') {
    lines.push(`✨ *${brand || name}*`);
    lines.push('');
    lines.push(name);
    if (sizeLine) { lines.push(''); lines.push(sizeLine); }
    lines.push('');
    lines.push('💎 Премиум качество');
    lines.push(`💰 *${Math.round(p.price)} ₽*`);
    lines.push('');
    lines.push('📦 В наличии');
    lines.push(delivery);
  } else {
    // basic
    if (brand) lines.push(`*${brand}*`);
    lines.push(name);
    if (sizeLine) { lines.push(''); lines.push(sizeLine); }
    lines.push('');
    lines.push(`💰 *${Math.round(p.price)} ₽*`);
    lines.push('');
    lines.push('📦 В наличии');
    lines.push(delivery);
  }

  return lines.join('\n') + '\n' + TG_FOOTER;
}

// ── Inline keyboard for product ──
function productKeyboard(p) {
  return { inline_keyboard: [[{ text: 'Смотреть товар', url: productUrl(p) }]] };
}

// ── In-memory TG send queue ──
const tgQueue = [];
let tgProcessing = false;

function tgEnqueue(job) {
  return new Promise((resolve, reject) => {
    tgQueue.push({ ...job, resolve, reject });
    tgProcessNext();
  });
}

async function tgProcessNext() {
  if (tgProcessing || tgQueue.length === 0) return;
  tgProcessing = true;
  const job = tgQueue.shift();
  try {
    const result = await tgSendOne(job);
    job.resolve(result);
  } catch (err) {
    job.reject(err);
  }
  tgProcessing = false;
  if (tgQueue.length > 0) setTimeout(tgProcessNext, 1500);
}

async function tgApiCall(url, body, retriesLeft = 2) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  let resp;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
  const json = await resp.json();
  if (json.ok === false && json.error_code === 429 && retriesLeft > 0) {
    const wait = (json.parameters?.retry_after || 2) * 1000;
    logger.warn({ wait }, 'Telegram 429 — waiting');
    await new Promise(r => setTimeout(r, wait));
    return tgApiCall(url, body, retriesLeft - 1);
  }
  return json;
}

// ── Badge overlay on image for Telegram ──
function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

async function composeBadgeImage(imagePath, badges) {
  const enabled = badges.filter(b => b?.enabled && b?.text);
  if (enabled.length === 0) return null;

  const meta = await sharp(imagePath).metadata();
  const { width, height } = meta;
  const scale = width / 375;

  const sizeMap = {
    s: { fontSize: 6.5, padY: 1.5, padX: 4, ls: 0.04 },
    m: { fontSize: 9, padY: 3, padX: 7, ls: 0.08 },
    l: { fontSize: 11, padY: 4, padX: 10, ls: 0.1 },
  };
  const margin = Math.round(10 * scale);
  const gap = Math.round(4 * scale);

  const groups = {};
  for (const b of enabled) {
    const pos = b.position || 'top-left';
    (groups[pos] ||= []).push(b);
  }

  const composites = [];

  const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";

  for (const [pos, items] of Object.entries(groups)) {
    const isRight = pos.includes('right');
    const isBottom = pos.includes('bottom');

    // Render all badges for this position group first
    const rendered = [];
    for (const b of items) {
      const sz = sizeMap[b.size || 'm'] || sizeMap.m;
      const filled = b.type === 'filled';
      const bc = b.borderColor || 'rgba(0,0,0,0.8)';
      const textColor = filled ? '#fff' : (b.textColor || '#000');
      const bgColor = filled ? bc : 'none';

      const fs = Math.round(sz.fontSize * scale);
      const padX = Math.round(sz.padX * scale);
      const padY = Math.round(sz.padY * scale);
      const ls = +(sz.ls * fs).toFixed(1);
      const bw = Math.max(Math.round(1 * scale), 1);

      const text = b.text.toUpperCase();
      const maxTextW = Math.round(width * 0.6);
      const textW = Math.min(Math.ceil(text.length * fs * (0.62 + sz.ls)), maxTextW);
      const badgeW = textW + padX * 2 + bw * 2;
      const badgeH = fs + padY * 2 + bw * 2;

      let rx;
      if (b.shape === 'pill' || b.shape === 'circle') rx = Math.round(badgeH / 2);
      else if (b.shape === 'rounded') rx = Math.round(4 * scale);
      else rx = Math.round(1 * scale);

      const svg = Buffer.from(`<svg width="${badgeW}" height="${badgeH}" xmlns="http://www.w3.org/2000/svg">
  <rect x="${bw / 2}" y="${bw / 2}" width="${badgeW - bw}" height="${badgeH - bw}" rx="${rx}" ry="${rx}" fill="${escapeXml(bgColor)}" stroke="${escapeXml(bc)}" stroke-width="${bw}"/>
  <text x="${padX + bw}" y="${badgeH / 2}" font-family="${FONT}" font-weight="700" font-size="${fs}" fill="${escapeXml(textColor)}" letter-spacing="${ls}" dominant-baseline="central">${escapeXml(text)}</text>
</svg>`);

      const badgeBuf = await sharp(svg).png().toBuffer();
      const badgeMeta = await sharp(badgeBuf).metadata();
      rendered.push({ buf: badgeBuf, w: badgeMeta.width, h: badgeMeta.height });
    }

    // Layout: top-* → stack downward from margin; bottom-* → stack downward from computed top
    const totalH = rendered.reduce((s, r) => s + r.h, 0) + gap * (rendered.length - 1);
    let offsetY = isBottom ? height - margin - totalH : margin;

    for (const r of rendered) {
      const x = isRight ? width - margin - r.w : margin;
      composites.push({ input: r.buf, left: Math.max(0, x), top: Math.max(0, offsetY) });
      offsetY += r.h + gap;
    }
  }

  if (composites.length === 0) return null;

  return sharp(imagePath)
    .composite(composites)
    .jpeg({ quality: 85 })
    .toBuffer();
}

async function tgApiCallMultipart(url, { chatId, photoBuffer, caption, parseMode, replyMarkup }, retriesLeft = 2) {
  const form = new FormData();
  form.append('chat_id', chatId);
  form.append('photo', new Blob([photoBuffer], { type: 'image/jpeg' }), 'photo.jpg');
  if (caption) form.append('caption', caption);
  if (parseMode) form.append('parse_mode', parseMode);
  if (replyMarkup) form.append('reply_markup', JSON.stringify(replyMarkup));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  let resp;
  try {
    resp = await fetch(url, { method: 'POST', body: form, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
  const json = await resp.json();
  if (json.ok === false && json.error_code === 429 && retriesLeft > 0) {
    const wait = (json.parameters?.retry_after || 2) * 1000;
    logger.warn({ wait }, 'Telegram 429 — waiting');
    await new Promise(r => setTimeout(r, wait));
    return tgApiCallMultipart(url, { chatId, photoBuffer, caption, parseMode, replyMarkup }, retriesLeft - 1);
  }
  return json;
}

async function tgSendOne({ botToken, chatId, text, photos, keyboard, productId, badges }) {
  const TG = `https://api.telegram.org/bot${botToken}`;
  let result;

  if (photos.length === 0) {
    result = await tgApiCall(`${TG}/sendMessage`, { chat_id: chatId, text, parse_mode: 'Markdown', disable_web_page_preview: true, reply_markup: keyboard });
  } else if (badges && badges.length > 0) {
    try {
      const imgPath = path.join(__dirname, '..', photos[0]);
      const buffer = await composeBadgeImage(imgPath, badges);
      if (buffer) {
        result = await tgApiCallMultipart(`${TG}/sendPhoto`, {
          chatId, photoBuffer: buffer, caption: text, parseMode: 'Markdown', replyMarkup: keyboard,
        });
      } else {
        result = await tgApiCall(`${TG}/sendPhoto`, { chat_id: chatId, photo: `${SITE_ORIGIN}${photos[0]}`, caption: text, parse_mode: 'Markdown', reply_markup: keyboard });
      }
    } catch (err) {
      logger.warn({ err, productId }, 'Badge compose failed — sending original');
      result = await tgApiCall(`${TG}/sendPhoto`, { chat_id: chatId, photo: `${SITE_ORIGIN}${photos[0]}`, caption: text, parse_mode: 'Markdown', reply_markup: keyboard });
    }
  } else {
    result = await tgApiCall(`${TG}/sendPhoto`, { chat_id: chatId, photo: `${SITE_ORIGIN}${photos[0]}`, caption: text, parse_mode: 'Markdown', reply_markup: keyboard });
  }

  const status = result.ok === false ? 'error' : 'success';
  logger.info({ tgSend: true, productId, status, description: result.description || null }, `TG send ${status}`);

  return result;
}

// ── Test bot (getMe) ──
app.post('/api/tg/test', requireAuth, async (_req, res) => {
  try {
    const cfg = await pool.query('SELECT bot_token FROM tg_config WHERE id = 1');
    if (cfg.rows.length === 0 || !cfg.rows[0].bot_token) {
      return res.status(400).json({ error: 'Bot token не задан' });
    }
    const resp = await fetch(`https://api.telegram.org/bot${cfg.rows[0].bot_token}/getMe`);
    const json = await resp.json();
    if (json.ok) {
      res.json({ ok: true, username: json.result.username, firstName: json.result.first_name });
    } else {
      res.status(400).json({ error: json.description || 'Неверный токен' });
    }
  } catch (err) {
    logger.error({ err }, 'POST /api/tg/test error');
    res.status(500).json({ error: 'Ошибка проверки' });
  }
});

// ── Delete config ──
app.delete('/api/tg/config', requireAuth, async (_req, res) => {
  try {
    await pool.query("UPDATE tg_config SET bot_token = '', chat_id = '', updated_at = now() WHERE id = 1");
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, 'DELETE /api/tg/config error');
    res.status(500).json({ error: 'Ошибка удаления' });
  }
});

// ── Preview post for product ──
app.get('/api/tg/preview/:id', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid product id' });
  const template = req.query.template || 'basic';
  try {
    const r = await pool.query('SELECT id, name, brand, price, original_price, sizes, images, category, gender, badge, badge2 FROM products WHERE id = $1', [id]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    const p = rowToCamel(r.rows[0]);

    const text = buildPostText(p, template);
    const photos = (p.images || []).slice(0, 10);
    const url = productUrl(p);
    const hasSale = p.originalPrice && p.originalPrice > p.price;
    const saleFallback = template === 'sale' && !hasSale;
    const hasBadge = [p.badge, p.badge2].some(b => b?.enabled && b?.text);

    res.json({ text, photos, url, saleFallback, hasBadge, product: { id: p.id, name: p.name, brand: p.brand, price: p.price, originalPrice: p.originalPrice } });
  } catch (err) {
    logger.error({ err }, 'GET /api/tg/preview error');
    res.status(500).json({ error: 'Preview error' });
  }
});

// ── Send post to Telegram (via queue) ──
app.post('/api/tg/send', requireAuth, async (req, res) => {
  const { productId, text: customText, template, imageIndex, withBadge } = req.body;
  if (!productId) return res.status(400).json({ error: 'productId required' });

  try {
    const cfg = await pool.query('SELECT bot_token, chat_id FROM tg_config WHERE id = 1');
    if (cfg.rows.length === 0 || !cfg.rows[0].bot_token || !cfg.rows[0].chat_id) {
      return res.status(400).json({ error: 'Telegram не настроен' });
    }
    const { bot_token, chat_id } = cfg.rows[0];

    const pr = await pool.query('SELECT id, name, brand, price, original_price, sizes, images, badge, badge2 FROM products WHERE id = $1', [parseInt(productId)]);
    if (pr.rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    const p = rowToCamel(pr.rows[0]);

    const text = customText || buildPostText(p, template || 'basic');
    const allImages = p.images || [];
    const idx = Number.isInteger(imageIndex) && imageIndex >= 0 && imageIndex < allImages.length ? imageIndex : 0;
    const photos = allImages.length > 0 ? [allImages[idx]] : [];
    const keyboard = productKeyboard(p);
    const badges = withBadge ? [p.badge, p.badge2] : null;

    const tgResult = await tgEnqueue({ botToken: bot_token, chatId: chat_id, text, photos, keyboard, productId: p.id, badges });

    if (tgResult.ok === false) {
      logger.warn({ tgResult, productId: p.id }, 'Telegram API rejected the request');
      return res.status(502).json({ error: 'Telegram отклонил запрос', details: tgResult.description });
    }

    await pool.query('UPDATE products SET tg_sent_at = now() WHERE id = $1', [p.id]);
    cacheInvalidate();
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, 'POST /api/tg/send error');
    res.status(500).json({ error: 'Ошибка отправки' });
  }
});

// ── Batch send (server-side queue, client polls for status) ──
const tgBatches = new Map();

app.post('/api/tg/send-batch', requireAuth, async (req, res) => {
  const { productIds, template, withBadge } = req.body;
  if (!Array.isArray(productIds) || productIds.length === 0) {
    return res.status(400).json({ error: 'productIds required (array)' });
  }
  if (productIds.length > 500) {
    return res.status(400).json({ error: 'Максимум 500 товаров в одном batch' });
  }
  try {
    const cfg = await pool.query('SELECT bot_token, chat_id FROM tg_config WHERE id = 1');
    if (cfg.rows.length === 0 || !cfg.rows[0].bot_token || !cfg.rows[0].chat_id) {
      return res.status(400).json({ error: 'Telegram не настроен' });
    }
    const batchId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const batch = { total: productIds.length, sent: 0, failed: 0, errors: [], done: false };
    tgBatches.set(batchId, batch);
    // Process in background
    processTgBatch(batchId, productIds, template || 'basic', cfg.rows[0], !!withBadge);
    res.json({ batchId, total: productIds.length });
  } catch (err) {
    logger.error({ err }, 'POST /api/tg/send-batch error');
    res.status(500).json({ error: 'Ошибка запуска batch' });
  }
});

async function processTgBatch(batchId, productIds, template, cfg, withBadge) {
  const batch = tgBatches.get(batchId);
  const { bot_token, chat_id } = cfg;
  let consecutiveFails = 0;

  for (const productId of productIds) {
    if (consecutiveFails >= 3) {
      const remaining = productIds.length - batch.sent - batch.failed;
      batch.failed += remaining;
      batch.errors.push('Остановлено: 3 ошибки подряд');
      break;
    }
    try {
      const pr = await pool.query('SELECT id, name, brand, price, original_price, sizes, images, badge, badge2 FROM products WHERE id = $1', [parseInt(productId)]);
      if (pr.rows.length === 0) { batch.failed++; consecutiveFails++; continue; }
      const p = rowToCamel(pr.rows[0]);
      const text = buildPostText(p, template);
      const allImages = p.images || [];
      const photos = allImages.length > 0 ? [allImages[0]] : [];
      const keyboard = productKeyboard(p);
      const badges = withBadge ? [p.badge, p.badge2] : null;
      const result = await tgEnqueue({ botToken: bot_token, chatId: chat_id, text, photos, keyboard, productId: p.id, badges });
      if (result.ok === false) {
        batch.failed++;
        consecutiveFails++;
        batch.errors.push(`#${productId}: ${result.description || 'Ошибка'}`);
      } else {
        batch.sent++;
        consecutiveFails = 0;
        await pool.query('UPDATE products SET tg_sent_at = now() WHERE id = $1', [p.id]);
      }
    } catch (err) {
      batch.failed++;
      consecutiveFails++;
      logger.error({ err, productId }, 'Batch item error');
    }
  }
  batch.done = true;
  cacheInvalidate();
  setTimeout(() => tgBatches.delete(batchId), 5 * 60 * 1000);
}

app.get('/api/tg/batch/:id', requireAuth, (req, res) => {
  const batch = tgBatches.get(req.params.id);
  if (!batch) return res.status(404).json({ error: 'Batch not found' });
  res.json(batch);
});

// ── Health/diagnostics (auth protected) ──
// ── Health check (no auth) ──────────────────
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString(), uptime: Math.floor(process.uptime()) });
});

app.get('/api/diag', requireAuth, async (_req, res) => {
  const checks = {};
  try {
    // 1. DB connection
    try {
      await pool.query('SELECT 1 AS ok');
      checks.db = { ok: true };
    } catch (err) {
      checks.db = { ok: false, error: err.message };
    }

    // 2. events table
    try {
      const r = await pool.query('SELECT COUNT(*) AS c FROM events');
      checks.events = { ok: true, count: parseInt(r.rows[0].c) };
    } catch (err) {
      checks.events = { ok: false, error: err.message };
    }

    // 3. tg_config table
    try {
      const r = await pool.query('SELECT id, chat_id, LENGTH(bot_token) AS token_len, updated_at FROM tg_config WHERE id = 1');
      if (r.rows.length === 0) {
        checks.tgConfig = { ok: true, configured: false };
      } else {
        checks.tgConfig = { ok: true, configured: true, chatId: r.rows[0].chat_id, tokenLen: r.rows[0].token_len, updatedAt: r.rows[0].updated_at };
      }
    } catch (err) {
      checks.tgConfig = { ok: false, error: err.message };
    }

    // 4. tg_sent_at column
    try {
      await pool.query('SELECT tg_sent_at FROM products LIMIT 1');
      checks.tgSentAt = { ok: true };
    } catch (err) {
      checks.tgSentAt = { ok: false, error: err.message };
    }

    // 5. Telegram API reachability (10s timeout)
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10000);
      const r = await fetch('https://api.telegram.org/bot000/getMe', { signal: ctrl.signal });
      clearTimeout(t);
      await r.json();
      checks.tgApi = { ok: true, reachable: true };
    } catch (err) {
      checks.tgApi = { ok: false, error: err.message };
    }

    // 6. Saved bot token test (if configured)
    if (checks.tgConfig?.configured) {
      try {
        const cfg = await pool.query('SELECT bot_token FROM tg_config WHERE id = 1');
        const token = cfg.rows[0].bot_token;
        checks.tgToken = { tokenPreview: token.slice(0, 5) + '...' + token.slice(-5), length: token.length };
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 10000);
        const r = await fetch(`https://api.telegram.org/bot${token}/getMe`, { signal: ctrl.signal });
        clearTimeout(t);
        const j = await r.json();
        if (j.ok) {
          checks.tgToken.valid = true;
          checks.tgToken.botUsername = j.result.username;
        } else {
          checks.tgToken.valid = false;
          checks.tgToken.tgError = j.description;
        }
      } catch (err) {
        checks.tgToken = { valid: false, error: err.message };
      }
    }

    // 7. Env summary
    checks.env = {
      nodeVersion: process.version,
      hasDbUrl: !!process.env.DATABASE_URL,
      hasJwtSecret: !!process.env.JWT_SECRET,
      port: PORT,
      siteOrigin: process.env.SITE_ORIGIN || '(not set)',
    };

    const allOk = checks.db?.ok && checks.events?.ok && checks.tgConfig?.ok;
    return res.json({ ok: allOk, checks });
  } catch (err) {
    logger.error({ err }, 'GET /api/diag fatal error');
    return res.status(500).json({ ok: false, error: err.message, checks });
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
