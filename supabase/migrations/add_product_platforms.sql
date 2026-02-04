-- Migration: Add product_platforms junction table
-- This enables per-product platform selection so auto-calendar generation
-- only creates sales for platforms the product is available on.

-- Create the product_platforms junction table
CREATE TABLE IF NOT EXISTS product_platforms (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  platform_id UUID NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL,

  -- Ensure unique product-platform combinations
  UNIQUE(product_id, platform_id)
);

-- Index for efficient lookups by product
CREATE INDEX IF NOT EXISTS idx_product_platforms_product_id
ON product_platforms(product_id);

-- Index for efficient lookups by platform
CREATE INDEX IF NOT EXISTS idx_product_platforms_platform_id
ON product_platforms(platform_id);

-- Enable RLS
ALTER TABLE product_platforms ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to view all product_platforms
CREATE POLICY "product_platforms_select_policy" ON product_platforms
  FOR SELECT USING (true);

-- Policy: Allow authenticated users to insert product_platforms
CREATE POLICY "product_platforms_insert_policy" ON product_platforms
  FOR INSERT WITH CHECK (true);

-- Policy: Allow authenticated users to delete product_platforms
CREATE POLICY "product_platforms_delete_policy" ON product_platforms
  FOR DELETE USING (true);

-- Comment for documentation
COMMENT ON TABLE product_platforms IS 'Junction table mapping products to their available platforms for per-product platform selection';
