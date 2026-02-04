-- Add product_id column for product-scoped versions (new preferred approach)
ALTER TABLE calendar_versions
ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id) ON DELETE SET NULL;

-- Index for efficient lookups by product
CREATE INDEX IF NOT EXISTS idx_calendar_versions_product_id
ON calendar_versions(product_id);

-- Add is_active column if not exists (for version toggling)
ALTER TABLE calendar_versions
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT FALSE NOT NULL;

-- Unique partial index: only one active version per product
-- (Drop the old client-based constraint if it exists)
DROP INDEX IF EXISTS idx_one_active_version_per_client;

-- Create new product-based constraint
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_version_per_product
ON calendar_versions(product_id) WHERE is_active = true AND product_id IS NOT NULL;
