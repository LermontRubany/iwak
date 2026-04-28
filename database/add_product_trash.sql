-- Product trash / soft delete.
-- Deleted products stay in the database for 30 days and can be restored.

ALTER TABLE products
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS delete_after TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_products_deleted_at ON products (deleted_at);
CREATE INDEX IF NOT EXISTS idx_products_delete_after ON products (delete_after) WHERE deleted_at IS NOT NULL;

