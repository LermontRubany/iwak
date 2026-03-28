// ============================================================
// IWAK — API Server
// Express + PostgreSQL + JWT auth + server-side filtering
// ============================================================

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pg from 'pg';
import path from 'path';

// ── PostgreSQL NUMERIC → number (не string) ─
pg.types.setTypeParser(1700, (val) => parseFloat(val));
import { fileURLToPath } from 'url';
import multer from 'multer';
import sharp from 'sharp';
import fs from 'fs';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const BCRYPT_ROUNDS = 10;

// ── PostgreSQL ──────────────────────────────
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

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

app.use(helmet({
  contentSecurityPolicy: IS_PRODUCTION ? undefined : false,
  crossOriginEmbedderPolicy: false,
}));

const ALLOWED_ORIGINS = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',')
  : IS_PRODUCTION ? [] : undefined;

app.use(cors({
  origin: ALLOWED_ORIGINS,
  credentials: true,
}));

app.use(express.json({ limit: '1mb' }));

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
  max: 10,
  message: { error: 'Слишком много попыток. Попробуйте позже.' },
});

// ── File upload (multer) ────────────────────
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
const MAX_FILE_SIZE = 5 * 1024 * 1024;

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
  try {
    const result = await pool.query('SELECT * FROM admin_users WHERE login = $1', [login]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }
    const token = jwt.sign({ id: user.id, login: user.login }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, login: user.login });
  } catch (err) {
    console.error('Auth error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
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
    console.error('Setup error:', err);
    res.status(500).json({ error: 'Ошибка создания admin' });
  }
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ login: req.admin.login });
});

// ════════════════════════════════════════════
// PRODUCTS — PUBLIC
// ════════════════════════════════════════════

// GET /api/products  — список с серверными фильтрами, поиском, пагинацией
// Query: q, category, gender, brand, sizes, sale, featured, sort, limit, offset
app.get('/api/products', async (req, res) => {
  try {
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
        conditions.push(`(gender IN (${placeholders.join(',')}) OR gender = 'unisex')`);
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

    let orderBy = 'created_at DESC';
    switch (req.query.sort) {
      case 'price-asc':  orderBy = 'price ASC'; break;
      case 'price-desc': orderBy = 'price DESC'; break;
      case 'newest':     orderBy = 'created_at DESC'; break;
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 2000);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [dataResult, countResult] = await Promise.all([
      pool.query(`SELECT * FROM products ${where} ORDER BY ${orderBy} LIMIT ${limit} OFFSET ${offset}`, params),
      pool.query(`SELECT count(*) FROM products ${where}`, params),
    ]);

    res.json({
      items: dataResult.rows.map(rowToCamel),
      total: parseInt(countResult.rows[0].count),
      limit,
      offset,
    });
  } catch (err) {
    console.error('GET /api/products error:', err);
    res.status(500).json({ error: 'Ошибка получения товаров' });
  }
});

// GET /api/products/:id
app.get('/api/products/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Товар не найден' });
    res.json(rowToCamel(result.rows[0]));
  } catch (err) {
    console.error('GET /api/products/:id error:', err);
    res.status(500).json({ error: 'Ошибка получения товара' });
  }
});

// ════════════════════════════════════════════
// PRODUCTS — ADMIN
// ════════════════════════════════════════════

app.post('/api/products', requireAuth, async (req, res) => {
  const body = bodyToSnake(req.body);
  const { name, brand, category, gender, price, original_price, color, color_hex,
          sizes, image, images, featured, badge, badge2 } = body;
  if (!name?.trim()) {
    return res.status(400).json({ error: 'name обязательно' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO products
        (name, brand, category, gender, price, original_price, color, color_hex,
         sizes, image, images, featured, badge, badge2)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [name.trim(), brand || '', category, gender || 'unisex', price || 0,
       original_price || null, color || '', color_hex || '#1A1A1A',
       sizes || [], image || '', images || [], featured || false,
       badge ? JSON.stringify(badge) : null,
       badge2 ? JSON.stringify(badge2) : null]
    );
    res.status(201).json(rowToCamel(result.rows[0]));
  } catch (err) {
    console.error('POST /api/products error:', err);
    res.status(500).json({ error: 'Ошибка создания товара' });
  }
});

app.put('/api/products/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const body = bodyToSnake(req.body);
  const { name, brand, category, gender, price, original_price, color, color_hex,
          sizes, image, images, featured, badge, badge2 } = body;
  try {
    // Для original_price: если явно передано (даже null) — ставим; если не передано — сохраняем старое
    const hasOrigPrice = 'original_price' in body;
    const hasBadge = 'badge' in body;
    const hasBadge2 = 'badge2' in body;
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
        badge2 = CASE WHEN $16::boolean THEN $17::jsonb ELSE badge2 END
       WHERE id = $18 RETURNING *`,
      [name, brand, category, gender, price,
       hasOrigPrice, hasOrigPrice ? original_price : null,
       color, color_hex, sizes, image, images, featured,
       hasBadge, hasBadge ? (badge ? JSON.stringify(badge) : null) : null,
       hasBadge2, hasBadge2 ? (badge2 ? JSON.stringify(badge2) : null) : null,
       id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Товар не найден' });
    res.json(rowToCamel(result.rows[0]));
  } catch (err) {
    console.error('PUT /api/products/:id error:', err);
    res.status(500).json({ error: 'Ошибка обновления товара' });
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
  } catch (err) {
    console.error('DELETE /api/products/:id error:', err);
    res.status(500).json({ error: 'Ошибка удаления товара' });
  }
});

app.post('/api/products/bulk-delete', requireAuth, async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids обязателен (массив)' });
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
  } catch (err) {
    console.error('POST /api/products/bulk-delete error:', err);
    res.status(500).json({ error: 'Ошибка массового удаления' });
  }
});

app.post('/api/products/bulk-update', requireAuth, async (req, res) => {
  const { ids, data, priceTransform } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids обязателен (массив)' });
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
          `UPDATE products SET original_price = COALESCE(original_price, price),
            price = $2::numeric WHERE id = ANY($1)`, [ids, numVal]);
      } else if (type === 'reset') {
        await pool.query(
          `UPDATE products SET price = COALESCE(original_price, price), original_price = NULL WHERE id = ANY($1)`, [ids]);
      }
      const updated = await pool.query('SELECT * FROM products WHERE id = ANY($1)', [ids]);
      return res.json({ updated: updated.rows.map(rowToCamel) });
    }

    if (data && typeof data === 'object') {
      const snakeData = bodyToSnake(data);
      const setClauses = [];
      const params = [ids];
      let pIdx = 1;
      const allowedFields = ['featured', 'badge', 'badge2', 'category', 'gender', 'brand', 'color', 'color_hex'];
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
        }
      }
      if (setClauses.length === 0) {
        return res.status(400).json({ error: 'Нет допустимых полей для обновления' });
      }
      await pool.query(`UPDATE products SET ${setClauses.join(', ')} WHERE id = ANY($1)`, params);
      const updated = await pool.query('SELECT * FROM products WHERE id = ANY($1)', [ids]);
      return res.json({ updated: updated.rows.map(rowToCamel) });
    }

    return res.status(400).json({ error: 'Нужен data или priceTransform' });
  } catch (err) {
    console.error('POST /api/products/bulk-update error:', err);
    res.status(500).json({ error: 'Ошибка массового обновления' });
  }
});

// ════════════════════════════════════════════
// UPLOAD (admin)
// ════════════════════════════════════════════

app.post('/api/upload', requireAuth, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });
  const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}.webp`;
  const outPath = path.join(uploadDir, filename);
  try {
    await sharp(req.file.buffer)
      .rotate()
      .resize({ width: 1200, withoutEnlargement: true })
      .webp({ quality: 78 })
      .toFile(outPath);
    res.json({ path: `/uploads/${filename}` });
  } catch (err) {
    console.error('Sharp error:', err);
    res.status(422).json({ error: 'Не удалось обработать изображение' });
  }
});

app.use((err, _req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Файл слишком большой (макс. 5 МБ)' });
    return res.status(400).json({ error: err.message });
  }
  if (err.message?.includes('Недопустимый тип файла')) {
    return res.status(415).json({ error: err.message });
  }
  next(err);
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
    console.error('GET /api/filters error:', err);
    res.status(500).json({ error: 'Ошибка получения фильтров' });
  }
});

// ════════════════════════════════════════════
// STATIC (production)
// ════════════════════════════════════════════

const distPath = path.join(__dirname, '../dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// ════════════════════════════════════════════
// START
// ════════════════════════════════════════════

app.listen(PORT, () => {
  console.log(`IWAK API server running on http://localhost:${PORT}`);
});
