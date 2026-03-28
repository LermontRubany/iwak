# Fashion Store

Fullstack fashion e-commerce — React + Express + PostgreSQL.

## Стек

- **Frontend**: React 19, React Router 7, Vite 8
- **Backend**: Express, PostgreSQL (pg), JWT-авторизация
- **Изображения**: sharp (auto WebP, resize 1200px, EXIF strip)
- **Безопасность**: helmet, CORS, rate-limit, bcrypt

## Требования

- Node.js >= 18
- PostgreSQL >= 14

## Установка

```bash
# 1. Клонируйте репозиторий
git clone <repo-url> && cd fashion-store

# 2. Установите зависимости
npm install

# 3. Создайте базу данных
createdb fashion_store
psql -d fashion_store -f database/schema.sql

# 4. Настройте окружение
cp server/.env.example server/.env
# Отредактируйте server/.env — укажите DATABASE_URL и JWT_SECRET

# 5. Создайте администратора
node server/create-admin.mjs

# 6. Запустите (frontend + backend одновременно)
npm start
```

Сайт: http://localhost:5173  
API: http://localhost:3000  
Админ-панель: http://localhost:5173/adminpanel

## Переменные окружения (server/.env)

| Переменная | Обязательная | Описание |
|------------|:---:|----------|
| `PORT` | да | Порт API-сервера (по умолчанию 3000) |
| `DATABASE_URL` | да | Строка подключения PostgreSQL |
| `JWT_SECRET` | да | Секретный ключ для JWT-токенов |
| `CORS_ORIGIN` | нет | Разрешённый origin (через запятую для нескольких) |
| `ALLOW_SETUP` | нет | `true` — разрешает POST /api/auth/setup |

## Скрипты

| Команда | Описание |
|---------|----------|
| `npm start` | Запуск frontend (Vite) + backend (Express) |
| `npm run dev` | Только frontend dev server |
| `npm run server` | Только backend |
| `npm run build` | Сборка frontend для production |
| `npm run lint` | ESLint |

## Деплой (Ubuntu)

```bash
# Установка зависимостей системы
sudo apt update && sudo apt install -y nodejs npm postgresql

# Создание БД
sudo -u postgres createdb fashion_store
sudo -u postgres psql -d fashion_store -f database/schema.sql

# Настройка
cp server/.env.example server/.env
nano server/.env  # указать DATABASE_URL, JWT_SECRET, CORS_ORIGIN

# Установка и сборка
npm install
npm run build

# Запуск через PM2
npm install -g pm2
pm2 start server/index.js --name fashion-store
pm2 save && pm2 startup
```

В production Express отдаёт статику из `dist/` самостоятельно.
