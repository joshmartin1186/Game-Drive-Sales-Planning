-- Create dashboard_configs table for storing custom analytics dashboards
CREATE TABLE IF NOT EXISTS dashboard_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  layout JSONB NOT NULL DEFAULT '[]'::jsonb,
  charts JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index on client_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_dashboard_configs_client_id ON dashboard_configs(client_id);

-- Create index on is_default for default dashboard lookups
CREATE INDEX IF NOT EXISTS idx_dashboard_configs_is_default ON dashboard_configs(is_default) WHERE is_default = TRUE;

-- Add RLS (Row Level Security) policies
ALTER TABLE dashboard_configs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view dashboard configs for their client
CREATE POLICY "Users can view own client dashboard configs"
  ON dashboard_configs
  FOR SELECT
  USING (
    client_id IN (
      SELECT id FROM clients
      WHERE id = auth.uid() OR id IN (
        -- Allow access if user has permission to this client
        SELECT client_id FROM user_clients WHERE user_id = auth.uid()
      )
    ) OR client_id IS NULL -- Allow viewing null (global) configs
  );

-- Policy: Users can insert dashboard configs for their client
CREATE POLICY "Users can insert own client dashboard configs"
  ON dashboard_configs
  FOR INSERT
  WITH CHECK (
    client_id IN (
      SELECT id FROM clients
      WHERE id = auth.uid() OR id IN (
        SELECT client_id FROM user_clients WHERE user_id = auth.uid()
      )
    ) OR client_id IS NULL
  );

-- Policy: Users can update dashboard configs for their client
CREATE POLICY "Users can update own client dashboard configs"
  ON dashboard_configs
  FOR UPDATE
  USING (
    client_id IN (
      SELECT id FROM clients
      WHERE id = auth.uid() OR id IN (
        SELECT client_id FROM user_clients WHERE user_id = auth.uid()
      )
    ) OR client_id IS NULL
  );

-- Policy: Users can delete dashboard configs for their client
CREATE POLICY "Users can delete own client dashboard configs"
  ON dashboard_configs
  FOR DELETE
  USING (
    client_id IN (
      SELECT id FROM clients
      WHERE id = auth.uid() OR id IN (
        SELECT client_id FROM user_clients WHERE user_id = auth.uid()
      )
    ) OR client_id IS NULL
  );

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_dashboard_configs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to call the function on UPDATE
CREATE TRIGGER trigger_update_dashboard_configs_updated_at
  BEFORE UPDATE ON dashboard_configs
  FOR EACH ROW
  EXECUTE FUNCTION update_dashboard_configs_updated_at();

-- Insert a default dashboard config template (optional)
INSERT INTO dashboard_configs (client_id, name, layout, charts, is_default)
VALUES (
  NULL, -- Global template, not tied to any client
  'Default Analytics Dashboard',
  '[]'::jsonb,
  '[]'::jsonb,
  FALSE
) ON CONFLICT DO NOTHING;

COMMENT ON TABLE dashboard_configs IS 'Stores custom dashboard configurations with chart layouts and settings';
COMMENT ON COLUMN dashboard_configs.layout IS 'React Grid Layout positions array stored as JSONB';
COMMENT ON COLUMN dashboard_configs.charts IS 'Array of ChartConfig objects stored as JSONB';
COMMENT ON COLUMN dashboard_configs.is_default IS 'Indicates if this is the default dashboard for a client';
