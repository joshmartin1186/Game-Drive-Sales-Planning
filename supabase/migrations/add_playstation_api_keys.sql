-- Create PlayStation API keys table for storing partner credentials
CREATE TABLE IF NOT EXISTS playstation_api_keys (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  ps_client_id TEXT NOT NULL, -- PlayStation Partners Client ID
  client_secret TEXT NOT NULL, -- PlayStation Partners Client Secret (encrypted at rest by Supabase)
  scope TEXT DEFAULT 'data', -- OAuth scope (data, dashboard, or both space-separated)
  is_active BOOLEAN DEFAULT TRUE,
  last_sync_date DATE,
  auto_sync_enabled BOOLEAN DEFAULT FALSE,
  sync_start_date DATE,
  sync_frequency_hours INTEGER DEFAULT 24,
  last_auto_sync TIMESTAMP WITH TIME ZONE,
  next_sync_due TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Each client can have only one active PlayStation API configuration
  CONSTRAINT unique_client_playstation_key UNIQUE (client_id)
);

-- Add constraint to ensure frequency is reasonable (1-168 hours = 1 hour to 1 week)
ALTER TABLE playstation_api_keys
ADD CONSTRAINT chk_ps_sync_frequency_hours
CHECK (sync_frequency_hours >= 1 AND sync_frequency_hours <= 168);

-- Add index for efficient auto-sync queries
CREATE INDEX IF NOT EXISTS idx_playstation_api_keys_auto_sync
ON playstation_api_keys(auto_sync_enabled, next_sync_due)
WHERE auto_sync_enabled = true;

-- Add RLS policies
ALTER TABLE playstation_api_keys ENABLE ROW LEVEL SECURITY;

-- Allow all operations for authenticated users (adjust as needed for your auth setup)
CREATE POLICY "Allow all operations on playstation_api_keys"
ON playstation_api_keys
FOR ALL
USING (true)
WITH CHECK (true);

-- Comments
COMMENT ON TABLE playstation_api_keys IS 'Stores PlayStation Partners API credentials for each client';
COMMENT ON COLUMN playstation_api_keys.ps_client_id IS 'PlayStation Partners Client ID (from Partner Portal)';
COMMENT ON COLUMN playstation_api_keys.client_secret IS 'PlayStation Partners Client Secret';
COMMENT ON COLUMN playstation_api_keys.scope IS 'OAuth scope, typically psn:analytics';
COMMENT ON COLUMN playstation_api_keys.auto_sync_enabled IS 'Whether automatic data synchronization is enabled';
COMMENT ON COLUMN playstation_api_keys.sync_start_date IS 'The date from which to start syncing data';
COMMENT ON COLUMN playstation_api_keys.sync_frequency_hours IS 'How often to run auto-sync (in hours, 1-168)';
