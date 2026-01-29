-- Add client_id column (nullable for backward compatibility with existing global versions)
ALTER TABLE calendar_versions
ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;

-- Add is_committed boolean column
ALTER TABLE calendar_versions
ADD COLUMN IF NOT EXISTS is_committed BOOLEAN DEFAULT FALSE NOT NULL;

-- Add committed_at timestamp
ALTER TABLE calendar_versions
ADD COLUMN IF NOT EXISTS committed_at TIMESTAMP WITH TIME ZONE;

-- Unique partial index: only one committed version per client
CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_versions_committed_per_client
ON calendar_versions(client_id) WHERE is_committed = true;

-- Index for efficient lookups of committed version by client
CREATE INDEX IF NOT EXISTS idx_calendar_versions_client_id
ON calendar_versions(client_id);
