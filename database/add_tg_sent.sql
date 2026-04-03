-- ============================================================
-- Telegram: отметка отправки товара
-- Запускать: psql $DATABASE_URL -f database/add_tg_sent.sql
-- Идемпотентен: безопасно запускать повторно.
-- ============================================================

ALTER TABLE products ADD COLUMN IF NOT EXISTS tg_sent_at TIMESTAMPTZ;
