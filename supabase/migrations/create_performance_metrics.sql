-- Create performance_metrics table for storing Steam sales data
CREATE TABLE IF NOT EXISTS performance_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  product_name TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'Steam',
  country_code TEXT NOT NULL,
  region TEXT,
  gross_units_sold INTEGER DEFAULT 0,
  net_units_sold INTEGER DEFAULT 0,
  gross_revenue_usd DECIMAL(12, 2) DEFAULT 0,
  net_revenue_usd DECIMAL(12, 2) DEFAULT 0,
  base_price DECIMAL(10, 2),
  sale_price DECIMAL(10, 2),
  currency TEXT,
  discount_percentage DECIMAL(5, 2),
  steam_package_id TEXT,
  steam_app_id TEXT,
  line_item_type TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  -- Unique constraint to prevent duplicate entries
  CONSTRAINT unique_performance_metric UNIQUE (client_id, date, product_name, platform, country_code)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_performance_metrics_client_id ON performance_metrics(client_id);
CREATE INDEX IF NOT EXISTS idx_performance_metrics_date ON performance_metrics(date);
CREATE INDEX IF NOT EXISTS idx_performance_metrics_product ON performance_metrics(product_name);
CREATE INDEX IF NOT EXISTS idx_performance_metrics_platform ON performance_metrics(platform);
CREATE INDEX IF NOT EXISTS idx_performance_metrics_region ON performance_metrics(region);
CREATE INDEX IF NOT EXISTS idx_performance_metrics_client_date ON performance_metrics(client_id, date);

-- Enable Row Level Security
ALTER TABLE performance_metrics ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can only see performance metrics for clients they have access to
CREATE POLICY "Users can view their client's performance metrics"
  ON performance_metrics
  FOR SELECT
  USING (
    client_id IN (
      SELECT client_id FROM user_clients WHERE user_id = auth.uid()
    )
  );

-- Users can insert performance metrics for their clients
CREATE POLICY "Users can insert their client's performance metrics"
  ON performance_metrics
  FOR INSERT
  WITH CHECK (
    client_id IN (
      SELECT client_id FROM user_clients WHERE user_id = auth.uid()
    )
  );

-- Users can update performance metrics for their clients
CREATE POLICY "Users can update their client's performance metrics"
  ON performance_metrics
  FOR UPDATE
  USING (
    client_id IN (
      SELECT client_id FROM user_clients WHERE user_id = auth.uid()
    )
  );

-- Users can delete performance metrics for their clients
CREATE POLICY "Users can delete their client's performance metrics"
  ON performance_metrics
  FOR DELETE
  USING (
    client_id IN (
      SELECT client_id FROM user_clients WHERE user_id = auth.uid()
    )
  );

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_performance_metrics_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER performance_metrics_updated_at
  BEFORE UPDATE ON performance_metrics
  FOR EACH ROW
  EXECUTE FUNCTION update_performance_metrics_updated_at();

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON performance_metrics TO authenticated;
GRANT USAGE ON SEQUENCE performance_metrics_id_seq TO authenticated;
