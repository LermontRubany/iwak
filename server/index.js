import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import fs from 'fs';

// Настройки окружения
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Подключение к PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Multer для загрузки файлов
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = Date.now() + '-' + Math.round(Math.random() * 1e9) + ext;
    cb(null, name);
  },
});
const upload = multer({ storage });

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(uploadDir));

// API: получить все товары
// Получить все товары
app.get('/api/products', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка получения товаров' });
  }
});

// Добавить товар
app.post('/api/products', async (req, res) => {
  const { name, description, price, image, category } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO products (name, description, price, image, category) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [name, description, price, image, category]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка добавления товара' });
  }
});

// Обновить товар
app.put('/api/products/:id', async (req, res) => {
  const { id } = req.params;
  const { name, description, price, image, category } = req.body;
  try {
    const result = await pool.query(
      'UPDATE products SET name=$1, description=$2, price=$3, image=$4, category=$5 WHERE id=$6 RETURNING *',
      [name, description, price, image, category, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Товар не найден' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка обновления товара' });
  }
});

// Удалить товар
app.delete('/api/products/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM products WHERE id=$1 RETURNING *', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Товар не найден' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка удаления товара' });
  }
});

// Загрузка изображения
app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Нет файла' });
  res.json({ path: `/uploads/${req.file.filename}` });
});

// Получить все категории
app.get('/api/categories', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM categories ORDER BY id');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка получения категорий' });
  }
});

// Добавить категорию
app.post('/api/categories', async (req, res) => {
  const { name } = req.body;
  try {
    const result = await pool.query('INSERT INTO categories (name) VALUES ($1) RETURNING *', [name]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка добавления категории' });
  }
});

// Раздача статики (сборка фронта)
app.use(express.static(path.join(__dirname, '../client/dist')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
