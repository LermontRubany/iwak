-- ============================================================
-- Custom mode: посты без привязки к товару
-- Запускать: psql $DATABASE_URL -f database/add_tg_custom.sql
-- Идемпотентен: безопасно запускать повторно.
-- ============================================================

-- 1. Разрешить NULL в product_id (custom посты без товара)
ALTER TABLE tg_scheduled ALTER COLUMN product_id DROP NOT NULL;

-- 2. Текст поста для custom-режима (product-режим продолжает использовать шаблоны)
ALTER TABLE tg_scheduled ADD COLUMN IF NOT EXISTS custom_text TEXT;
