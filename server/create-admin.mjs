// ============================================================
// Создание первого admin-пользователя
// Запуск: node server/create-admin.mjs
// ============================================================

import dotenv from 'dotenv';
import pg from 'pg';
import bcrypt from 'bcrypt';
import { createInterface } from 'readline';

dotenv.config({ path: new URL('./.env', import.meta.url).pathname });

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

try {
  const existing = await pool.query('SELECT count(*) FROM admin_users');
  if (parseInt(existing.rows[0].count) > 0) {
    console.log('⚠️  Admin уже существует. Для сброса удалите запись вручную.');
    process.exit(0);
  }

  const login = (await ask('Логин (по умолчанию: admin): ')).trim() || 'admin';
  const password = (await ask('Пароль (мин. 6 символов): ')).trim();

  if (password.length < 6) {
    console.error('❌ Пароль слишком короткий');
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 10);
  await pool.query('INSERT INTO admin_users (login, password_hash) VALUES ($1, $2)', [login, hash]);
  console.log(`✅ Admin "${login}" создан.`);
} catch (err) {
  console.error('Ошибка:', err.message);
  process.exit(1);
} finally {
  rl.close();
  pool.end();
}
