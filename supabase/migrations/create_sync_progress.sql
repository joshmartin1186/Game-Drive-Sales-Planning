-- Create sync_progress table for tracking long-running sync operations
CREATE TABLE IF NOT EXISTS sync_progress (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  sync_type TEXT NOT NULL DEFAULT 'steam_api_sync',
  last_successful_date TEXT,
  dates_completed INTEGER DEFAULT 0,
  dates_total INTEGER,
  dates_failed INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'failed', 'cancelled')),
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(client_id, sync_type, status)
);

-- Add index for faster lookups
CREATE INDEX idx_sync_progress_client_status ON sync_progress(client_id, status);

-- Add RLS policies
ALTER TABLE sync_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to sync_progress"
  ON sync_progress
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Service role can manage sync_progress"
  ON sync_progress
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Add comments
COMMENT ON TABLE sync_progress IS 'Tracks progress of long-running sync operations to enable resume capability';
COMMENT ON COLUMN sync_progress.last_successful_date IS 'Last date that was successfully synced (format: YYYY/MM/DD)';
COMMENT ON COLUMN sync_progress.dates_completed IS 'Number of dates successfully processed';
COMMENT ON COLUMN sync_progress.dates_total IS 'Total number of dates to process';
COMMENT ON COLUMN sync_progress.dates_failed IS 'Number of dates that failed after all retries';
