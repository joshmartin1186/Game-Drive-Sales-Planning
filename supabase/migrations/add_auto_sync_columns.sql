-- Add auto-sync columns to steam_api_keys table
ALTER TABLE steam_api_keys
ADD COLUMN IF NOT EXISTS auto_sync_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS sync_start_date DATE,
ADD COLUMN IF NOT EXISTS sync_frequency_hours INTEGER DEFAULT 24,
ADD COLUMN IF NOT EXISTS last_auto_sync TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS next_sync_due TIMESTAMP WITH TIME ZONE;

-- Add auto-sync tracking to sync_jobs table
ALTER TABLE sync_jobs
ADD COLUMN IF NOT EXISTS is_auto_sync BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS sync_frequency_hours INTEGER DEFAULT 24;

-- Add index for efficient auto-sync queries
CREATE INDEX IF NOT EXISTS idx_steam_api_keys_auto_sync
ON steam_api_keys(auto_sync_enabled, next_sync_due)
WHERE auto_sync_enabled = true;

-- Add constraint to ensure frequency is reasonable (1-168 hours = 1 hour to 1 week)
ALTER TABLE steam_api_keys
ADD CONSTRAINT IF NOT EXISTS chk_sync_frequency_hours
CHECK (sync_frequency_hours >= 1 AND sync_frequency_hours <= 168);

COMMENT ON COLUMN steam_api_keys.auto_sync_enabled IS 'Whether automatic data synchronization is enabled for this API key';
COMMENT ON COLUMN steam_api_keys.sync_start_date IS 'The date from which to start syncing data (syncs from this date to present)';
COMMENT ON COLUMN steam_api_keys.sync_frequency_hours IS 'How often to run auto-sync (in hours, 1-168)';
COMMENT ON COLUMN steam_api_keys.last_auto_sync IS 'Timestamp of the last automatic sync';
COMMENT ON COLUMN steam_api_keys.next_sync_due IS 'Timestamp when the next auto-sync should run';
