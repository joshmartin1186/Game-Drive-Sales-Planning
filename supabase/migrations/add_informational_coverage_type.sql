-- Add 'informational' to coverage_type CHECK constraint on coverage_items
-- This type is for non-press pages like Wikipedia, Steam Store, SteamDB that inflate UMV numbers
-- These should be excluded from UMV/reach totals in reports

ALTER TABLE coverage_items DROP CONSTRAINT IF EXISTS coverage_items_coverage_type_check;

ALTER TABLE coverage_items ADD CONSTRAINT coverage_items_coverage_type_check CHECK (coverage_type IN (
  'news', 'review', 'preview', 'interview', 'trailer', 'trailer_repost',
  'stream', 'video', 'guide', 'roundup', 'mention', 'feature', 'informational'
));
