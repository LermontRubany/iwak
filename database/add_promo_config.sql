-- ============================================================
-- Promo Banner Config — singleton table
-- Запускать: psql $DATABASE_URL -f database/add_promo_config.sql
-- Идемпотентен: безопасно запускать повторно.
-- ============================================================

CREATE TABLE IF NOT EXISTS promo_config (
    id          INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    config      JSONB NOT NULL DEFAULT '{}',
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO promo_config (id) VALUES (1) ON CONFLICT DO NOTHING;
