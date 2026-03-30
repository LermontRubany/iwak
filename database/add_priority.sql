-- Добавляем поле priority
ALTER TABLE products
ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 50;

-- Индекс для сортировки
CREATE INDEX IF NOT EXISTS idx_products_priority_desc ON products(priority DESC);

-- Комментарий
COMMENT ON COLUMN products.priority IS 'Приоритет выдачи: 100-топ, 80-выше среднего, 50-стандарт, 10-вниз';
