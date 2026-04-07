-- ============================================================
-- Autoplan: tg_plans + tg_scheduled
-- Запускать: psql $DATABASE_URL -f database/add_tg_plans.sql
-- Идемпотентен: безопасно запускать повторно.
-- НЕ трогает существующие таблицы (products, tg_config и т.д.)
-- ============================================================

-- ── 1. Планы автопостинга ──
CREATE TABLE IF NOT EXISTS tg_plans (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         TEXT NOT NULL,
    params       JSONB NOT NULL DEFAULT '{}',
    status       TEXT NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active', 'paused', 'completed', 'cancelled')),
    total_posts  INTEGER NOT NULL DEFAULT 0,
    sent_count   INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    starts_at    TIMESTAMPTZ NOT NULL,
    ends_at      TIMESTAMPTZ NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 2. Запланированные задачи ──
CREATE TABLE IF NOT EXISTS tg_scheduled (
    id           SERIAL PRIMARY KEY,
    plan_id      UUID NOT NULL REFERENCES tg_plans(id) ON DELETE CASCADE,
    product_id   INTEGER NOT NULL,
    template     TEXT NOT NULL DEFAULT 'basic',
    with_badge   BOOLEAN NOT NULL DEFAULT false,
    scheduled_at TIMESTAMPTZ NOT NULL,
    status       TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'processing', 'done', 'failed')),
    result       JSONB,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 3. Индексы ──

-- Scheduler: быстрый поиск следующей pending задачи
CREATE INDEX IF NOT EXISTS idx_tg_sched_pending
    ON tg_scheduled (scheduled_at)
    WHERE status = 'pending';

-- UI: задачи конкретного плана
CREATE INDEX IF NOT EXISTS idx_tg_sched_plan
    ON tg_scheduled (plan_id);

-- UI: быстрый список активных планов
CREATE INDEX IF NOT EXISTS idx_tg_plans_status
    ON tg_plans (status)
    WHERE status IN ('active', 'paused');

-- UI: показать бейдж 📅 на товарах (pending задачи для product_id)
CREATE INDEX IF NOT EXISTS idx_tg_sched_product_pending
    ON tg_scheduled (product_id)
    WHERE status = 'pending';
