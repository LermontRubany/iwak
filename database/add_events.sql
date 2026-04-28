-- ============================================================
-- Аналитика — Таблица событий
-- Запускать: psql $DATABASE_URL -f database/add_events.sql
-- Идемпотентен: безопасно запускать повторно.
-- ============================================================

CREATE TABLE IF NOT EXISTS events (
    id          SERIAL PRIMARY KEY,
    type        VARCHAR(30) NOT NULL,
    data        JSONB NOT NULL DEFAULT '{}',
    session_id  VARCHAR(36),
    city        VARCHAR(100),
    country     VARCHAR(80),
    region      VARCHAR(100),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE events ADD COLUMN IF NOT EXISTS country VARCHAR(80);
ALTER TABLE events ADD COLUMN IF NOT EXISTS region VARCHAR(100);
ALTER TABLE events ADD COLUMN IF NOT EXISTS device VARCHAR(40);
ALTER TABLE events ADD COLUMN IF NOT EXISTS ip INET;

CREATE INDEX IF NOT EXISTS idx_events_type       ON events (type);
CREATE INDEX IF NOT EXISTS idx_events_created    ON events (created_at);
CREATE INDEX IF NOT EXISTS idx_events_session    ON events (session_id);
CREATE INDEX IF NOT EXISTS idx_events_type_created ON events (type, created_at);
CREATE INDEX IF NOT EXISTS idx_events_country    ON events (country);
CREATE INDEX IF NOT EXISTS idx_events_device     ON events (device);
