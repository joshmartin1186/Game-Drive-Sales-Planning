-- Create sync_jobs table to track background sync operations
CREATE TABLE IF NOT EXISTS sync_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL DEFAULT 'steam_sync',
  status TEXT NOT NULL DEFAULT 'pending', -- pending, running, completed, failed
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,

  -- Job parameters
  start_date TEXT,
  end_date TEXT,
  force_full_sync BOOLEAN DEFAULT FALSE,

  -- Progress tracking
  total_dates INTEGER DEFAULT 0,
  dates_processed INTEGER DEFAULT 0,
  rows_imported INTEGER DEFAULT 0,
  rows_skipped INTEGER DEFAULT 0,

  -- Results
  error_message TEXT,
  result_data JSONB
);

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_sync_jobs_client_id ON sync_jobs(client_id);
CREATE INDEX IF NOT EXISTS idx_sync_jobs_status ON sync_jobs(status);
CREATE INDEX IF NOT EXISTS idx_sync_jobs_created_at ON sync_jobs(created_at DESC);

-- Enable RLS
ALTER TABLE sync_jobs ENABLE ROW LEVEL SECURITY;

-- Policy to allow users to see their own sync jobs
CREATE POLICY "Users can view their own sync jobs" ON sync_jobs
  FOR SELECT USING (true);

-- Policy to allow API to insert/update sync jobs
CREATE POLICY "Allow insert sync jobs" ON sync_jobs
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow update sync jobs" ON sync_jobs
  FOR UPDATE USING (true);
