-- ============================================================
-- Telegram Config — singleton table
-- Запускать: psql $DATABASE_URL -f database/add_tg_config.sql
-- Идемпотентен: безопасно запускать повторно.
-- ============================================================

CREATE TABLE IF NOT EXISTS tg_config (
    id          INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    bot_token   TEXT NOT NULL DEFAULT '',
    chat_id     TEXT NOT NULL DEFAULT '',
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO tg_config (id) VALUES (1) ON CONFLICT DO NOTHING;
