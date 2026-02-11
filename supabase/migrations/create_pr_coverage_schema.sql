-- PR Coverage Module: Core Database Schema
-- Issue #62: PR Coverage Database Schema & Core Infrastructure

-- ============================================
-- 1. OUTLETS TABLE
-- Stores media outlets with traffic/tier data
-- ============================================
CREATE TABLE outlets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  domain VARCHAR(255) UNIQUE,
  country VARCHAR(100),
  monthly_unique_visitors BIGINT,
  tier VARCHAR(1) CHECK (tier IN ('A', 'B', 'C', 'D')),
  metacritic_status BOOLEAN DEFAULT false,
  custom_tags JSONB DEFAULT '[]'::jsonb,
  rss_feed_url TEXT,
  scan_frequency VARCHAR(20) DEFAULT 'daily' CHECK (scan_frequency IN ('hourly', 'every_6h', 'daily', 'weekly')),
  traffic_last_updated TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE outlets IS 'Media outlets tracked for PR coverage. Sorted by monthly_unique_visitors descending.';
COMMENT ON COLUMN outlets.tier IS 'A=10M+ visitors, B=1M-10M, C=100K-1M, D=<100K';
COMMENT ON COLUMN outlets.metacritic_status IS 'Whether this outlet is on the Metacritic aggregator list';

-- ============================================
-- 2. COVERAGE KEYWORDS TABLE
-- Per-client keyword whitelist/blacklist sets
-- ============================================
CREATE TABLE coverage_keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  keyword VARCHAR(255) NOT NULL,
  keyword_type VARCHAR(20) NOT NULL DEFAULT 'whitelist' CHECK (keyword_type IN ('whitelist', 'blacklist')),
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE coverage_keywords IS 'Keyword sets per client/game for matching coverage items';

-- ============================================
-- 3. COVERAGE CAMPAIGNS TABLE
-- Groups coverage by campaign/event section
-- ============================================
CREATE TABLE coverage_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  game_id UUID REFERENCES games(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE coverage_campaigns IS 'Campaign sections for grouping coverage (e.g., Announcement Coverage, Early Access Launch)';

-- ============================================
-- 4. COVERAGE ITEMS TABLE
-- Main table for all discovered coverage
-- ============================================
CREATE TABLE coverage_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  game_id UUID REFERENCES games(id) ON DELETE SET NULL,
  outlet_id UUID REFERENCES outlets(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES coverage_campaigns(id) ON DELETE SET NULL,

  -- Article data
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  publish_date DATE,
  territory VARCHAR(100),
  coverage_type VARCHAR(50) CHECK (coverage_type IN (
    'news', 'review', 'preview', 'interview', 'trailer', 'trailer_repost',
    'stream', 'video', 'guide', 'roundup', 'mention', 'feature'
  )),

  -- Metrics
  monthly_unique_visitors BIGINT,
  review_score NUMERIC(4,1),
  quotes TEXT,
  sentiment VARCHAR(20) CHECK (sentiment IN ('positive', 'neutral', 'negative', 'mixed')),

  -- AI scoring
  relevance_score INTEGER CHECK (relevance_score >= 0 AND relevance_score <= 100),
  relevance_reasoning TEXT,

  -- Approval workflow
  approval_status VARCHAR(30) NOT NULL DEFAULT 'pending_review' CHECK (approval_status IN (
    'auto_approved', 'pending_review', 'rejected', 'manually_approved'
  )),
  approved_at TIMESTAMPTZ,
  approved_by UUID,

  -- Source tracking
  source_type VARCHAR(20) NOT NULL DEFAULT 'rss' CHECK (source_type IN (
    'rss', 'tavily', 'youtube', 'twitch', 'reddit', 'twitter', 'tiktok', 'instagram', 'manual'
  )),
  source_metadata JSONB DEFAULT '{}'::jsonb,

  -- Campaign section (text-based for flexibility)
  campaign_section VARCHAR(255),

  -- Timestamps
  discovered_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE coverage_items IS 'All discovered PR coverage items from all sources';
COMMENT ON COLUMN coverage_items.approval_status IS 'auto_approved (score 80+), pending_review (50-79), rejected (<50), manually_approved';
COMMENT ON COLUMN coverage_items.source_metadata IS 'Source-specific data (e.g., YouTube channel subscribers, Twitch viewer count)';

-- ============================================
-- 5. INDEXES
-- ============================================

-- Outlets
CREATE INDEX idx_outlets_domain ON outlets(domain);
CREATE INDEX idx_outlets_tier ON outlets(tier);
CREATE INDEX idx_outlets_monthly_visitors ON outlets(monthly_unique_visitors DESC NULLS LAST);

-- Coverage Keywords
CREATE INDEX idx_coverage_keywords_client_game ON coverage_keywords(client_id, game_id);
CREATE INDEX idx_coverage_keywords_type ON coverage_keywords(keyword_type);

-- Coverage Campaigns
CREATE INDEX idx_coverage_campaigns_client ON coverage_campaigns(client_id);
CREATE INDEX idx_coverage_campaigns_game ON coverage_campaigns(game_id);

-- Coverage Items
CREATE UNIQUE INDEX idx_coverage_items_url ON coverage_items(url);
CREATE INDEX idx_coverage_items_client ON coverage_items(client_id);
CREATE INDEX idx_coverage_items_game ON coverage_items(game_id);
CREATE INDEX idx_coverage_items_outlet ON coverage_items(outlet_id);
CREATE INDEX idx_coverage_items_publish_date ON coverage_items(publish_date DESC NULLS LAST);
CREATE INDEX idx_coverage_items_approval ON coverage_items(approval_status);
CREATE INDEX idx_coverage_items_source ON coverage_items(source_type);
CREATE INDEX idx_coverage_items_client_approval ON coverage_items(client_id, approval_status);
CREATE INDEX idx_coverage_items_relevance ON coverage_items(relevance_score DESC NULLS LAST);

-- ============================================
-- 6. ROW LEVEL SECURITY
-- ============================================

ALTER TABLE outlets ENABLE ROW LEVEL SECURITY;
ALTER TABLE coverage_keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE coverage_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE coverage_items ENABLE ROW LEVEL SECURITY;

-- Outlets: Shared resource, all authenticated users can read
CREATE POLICY "outlets_select" ON outlets FOR SELECT TO authenticated USING (true);
CREATE POLICY "outlets_insert" ON outlets FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "outlets_update" ON outlets FOR UPDATE TO authenticated USING (true);
CREATE POLICY "outlets_delete" ON outlets FOR DELETE TO authenticated USING (true);

-- Coverage Keywords: Scoped to client access
CREATE POLICY "coverage_keywords_select" ON coverage_keywords FOR SELECT TO authenticated
  USING (has_client_access(client_id));
CREATE POLICY "coverage_keywords_insert" ON coverage_keywords FOR INSERT TO authenticated
  WITH CHECK (has_client_access(client_id));
CREATE POLICY "coverage_keywords_update" ON coverage_keywords FOR UPDATE TO authenticated
  USING (has_client_access(client_id));
CREATE POLICY "coverage_keywords_delete" ON coverage_keywords FOR DELETE TO authenticated
  USING (has_client_access(client_id));

-- Coverage Campaigns: Scoped to client access
CREATE POLICY "coverage_campaigns_select" ON coverage_campaigns FOR SELECT TO authenticated
  USING (has_client_access(client_id));
CREATE POLICY "coverage_campaigns_insert" ON coverage_campaigns FOR INSERT TO authenticated
  WITH CHECK (has_client_access(client_id));
CREATE POLICY "coverage_campaigns_update" ON coverage_campaigns FOR UPDATE TO authenticated
  USING (has_client_access(client_id));
CREATE POLICY "coverage_campaigns_delete" ON coverage_campaigns FOR DELETE TO authenticated
  USING (has_client_access(client_id));

-- Coverage Items: Scoped to client access
CREATE POLICY "coverage_items_select" ON coverage_items FOR SELECT TO authenticated
  USING (has_client_access(client_id));
CREATE POLICY "coverage_items_insert" ON coverage_items FOR INSERT TO authenticated
  WITH CHECK (has_client_access(client_id));
CREATE POLICY "coverage_items_update" ON coverage_items FOR UPDATE TO authenticated
  USING (has_client_access(client_id));
CREATE POLICY "coverage_items_delete" ON coverage_items FOR DELETE TO authenticated
  USING (has_client_access(client_id));

-- Service role bypass for all PR tables (for API routes / cron jobs)
CREATE POLICY "outlets_service" ON outlets FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "coverage_keywords_service" ON coverage_keywords FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "coverage_campaigns_service" ON coverage_campaigns FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "coverage_items_service" ON coverage_items FOR ALL TO service_role USING (true) WITH CHECK (true);
