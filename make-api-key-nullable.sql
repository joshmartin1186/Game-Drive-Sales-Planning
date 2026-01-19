-- Migration: Make api_key column nullable in steam_api_keys table
-- Reason: Financial Web API Key is the primary requirement for syncing sales data
-- The basic Steam Web API key is optional and not needed for financial data

ALTER TABLE steam_api_keys
ALTER COLUMN api_key DROP NOT NULL;

-- Verify the change
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'steam_api_keys'
AND column_name = 'api_key';
