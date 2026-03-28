-- ============================================================
-- Миграция v3: удаление каталога категорий
-- ============================================================
-- Запускать ОДИН раз для БД, созданных по schema.sql v2.
-- После миграции — актуальна schema.sql v3.0.
-- ============================================================

-- 1. Убрать FK с products.category → categories
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_category_fkey;

-- 2. Удалить таблицу categories
DROP TABLE IF EXISTS categories CASCADE;

-- 3. Разрешить пустую категорию (ранее NOT NULL + FK)
ALTER TABLE products ALTER COLUMN category SET DEFAULT '';
