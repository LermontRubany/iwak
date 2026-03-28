-- ============================================================
-- IWAK Витрина — Полная схема БД
-- Версия: 3.0 (без каталога категорий)
-- ============================================================
-- Запускать: psql $DATABASE_URL -f database/schema.sql
-- Идемпотентен: безопасно запускать повторно.
-- Нет seed-данных. Пустая БД = пустая витрина.
-- Фильтры формируются из данных товаров.
-- ============================================================

-- ────────────────────────────────────────────
-- 1. ТОВАРЫ
-- ────────────────────────────────────────────
-- category — произвольный текст (sneakers, hoodies, bags…).
-- Никакого FK, никакой таблицы категорий.
-- Фильтры строятся по DISTINCT-значениям из товаров.

CREATE TABLE IF NOT EXISTS products (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    brand           VARCHAR(100) NOT NULL DEFAULT '',
    category        VARCHAR(60) NOT NULL DEFAULT '',
    gender          VARCHAR(10) NOT NULL DEFAULT 'unisex'
                        CHECK (gender IN ('mens', 'womens', 'kids', 'unisex')),
    price           NUMERIC(10,2) NOT NULL CHECK (price >= 0),
    original_price  NUMERIC(10,2)           CHECK (original_price IS NULL OR original_price >= 0),
    color           VARCHAR(100) NOT NULL DEFAULT '',
    color_hex       VARCHAR(20) NOT NULL DEFAULT '#1A1A1A',
    sizes           TEXT[] NOT NULL DEFAULT '{}',
    image           TEXT NOT NULL DEFAULT '',        -- главное фото (= images[0])
    images          TEXT[] NOT NULL DEFAULT '{}',    -- все фото (до 10)
    featured        BOOLEAN NOT NULL DEFAULT false,
    badge           JSONB,                           -- {enabled, text, borderColor, textColor, shape, type, position, size}
    badge2          JSONB,                           -- второй бейдж (та же структура)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Триггер auto-update updated_at
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS products_set_updated_at ON products;
CREATE TRIGGER products_set_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ────────────────────────────────────────────
-- 2. АДМИН-ПОЛЬЗОВАТЕЛИ
-- ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS admin_users (
    id              SERIAL PRIMARY KEY,
    login           VARCHAR(100) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,          -- bcrypt hash
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────────
-- 3. ИНДЕКСЫ
-- ────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_products_category   ON products (category);
CREATE INDEX IF NOT EXISTS idx_products_gender     ON products (gender);
CREATE INDEX IF NOT EXISTS idx_products_brand      ON products (brand);
CREATE INDEX IF NOT EXISTS idx_products_featured   ON products (featured) WHERE featured = true;
CREATE INDEX IF NOT EXISTS idx_products_price      ON products (price);
CREATE INDEX IF NOT EXISTS idx_products_created    ON products (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_products_sizes      ON products USING GIN (sizes);

CREATE INDEX IF NOT EXISTS idx_products_search
    ON products USING GIN (
        to_tsvector('russian', coalesce(name, '') || ' ' || coalesce(brand, ''))
    );
