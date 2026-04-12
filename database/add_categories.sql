-- ============================================================
-- Таблица категорий (независимое хранение)
-- ============================================================
-- categories — единственный источник правды для списка категорий.
-- products.category ссылается по значению (VARCHAR, без FK).
-- Удаление категории запрещено, пока есть связанные товары.

CREATE TABLE IF NOT EXISTS categories (
    name VARCHAR(60) PRIMARY KEY
);

-- ── Нормализация существующих данных (idempotent) ──
-- 1. Привести products.category к нижнему регистру + slug
UPDATE products
SET category = lower(trim(category))
WHERE category <> '' AND category IS DISTINCT FROM lower(trim(category));

-- 2. Заполнить categories из нормализованных товаров
INSERT INTO categories (name)
SELECT DISTINCT category FROM products WHERE category <> ''
ON CONFLICT DO NOTHING;
