-- ============================================================
-- Таблица категорий (независимое хранение)
-- ============================================================
-- Позволяет хранить категории отдельно от товаров,
-- чтобы пустые категории не терялись.

CREATE TABLE IF NOT EXISTS categories (
    name VARCHAR(60) PRIMARY KEY
);

-- Заполнить из существующих товаров
INSERT INTO categories (name)
SELECT DISTINCT category FROM products WHERE category <> ''
ON CONFLICT DO NOTHING;
