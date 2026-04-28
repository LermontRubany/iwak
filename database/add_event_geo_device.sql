-- ============================================================
-- Analytics geo/device enrichment
-- Safe to run repeatedly.
-- ============================================================

ALTER TABLE events ADD COLUMN IF NOT EXISTS country VARCHAR(80);
ALTER TABLE events ADD COLUMN IF NOT EXISTS region VARCHAR(100);
ALTER TABLE events ADD COLUMN IF NOT EXISTS device VARCHAR(40);
ALTER TABLE events ADD COLUMN IF NOT EXISTS ip INET;

CREATE INDEX IF NOT EXISTS idx_events_country ON events (country);
CREATE INDEX IF NOT EXISTS idx_events_device  ON events (device);
