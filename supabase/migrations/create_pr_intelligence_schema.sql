-- PR Intelligence Layer: Schema Migration
-- Tables: pr_annotations, correlation_candidates, pr_insights

CREATE TABLE pr_annotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  event_type VARCHAR(30) NOT NULL CHECK (event_type IN (
    'pr_mention', 'influencer_play', 'steam_sale', 'steam_event',
    'bundle', 'epic_free', 'press_interview', 'other'
  )),
  event_date DATE NOT NULL,
  outlet_or_source TEXT,
  observed_effect VARCHAR(20) NOT NULL CHECK (observed_effect IN (
    'sales_spike', 'wishlist_spike', 'pr_pickup', 'none', 'unknown'
  )),
  direction VARCHAR(20) NOT NULL CHECK (direction IN ('pr_to_sales', 'sales_to_pr')),
  confidence VARCHAR(20) NOT NULL CHECK (confidence IN ('confirmed', 'suspected', 'ruled_out')),
  notes TEXT,
  created_by UUID,
  is_auto_detected BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_pr_annotations_game ON pr_annotations(game_id);
CREATE INDEX idx_pr_annotations_client ON pr_annotations(client_id);
CREATE INDEX idx_pr_annotations_date ON pr_annotations(event_date DESC);
CREATE INDEX idx_pr_annotations_type ON pr_annotations(event_type);
CREATE INDEX idx_pr_annotations_game_date ON pr_annotations(game_id, event_date);

CREATE TABLE correlation_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  coverage_item_id UUID REFERENCES coverage_items(id) ON DELETE SET NULL,
  event_type VARCHAR(30) NOT NULL CHECK (event_type IN (
    'pr_mention', 'influencer_play', 'steam_sale', 'steam_event',
    'bundle', 'epic_free', 'press_interview', 'other'
  )),
  event_date DATE NOT NULL,
  outlet_or_source TEXT,
  suspected_effect VARCHAR(20) NOT NULL CHECK (suspected_effect IN (
    'sales_spike', 'wishlist_spike', 'pr_pickup', 'none', 'unknown'
  )),
  direction VARCHAR(20) NOT NULL CHECK (direction IN ('pr_to_sales', 'sales_to_pr')),
  detection_confidence FLOAT CHECK (detection_confidence >= 0 AND detection_confidence <= 1),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'approved', 'rejected', 'inconclusive'
  )),
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_correlation_candidates_game ON correlation_candidates(game_id);
CREATE INDEX idx_correlation_candidates_status ON correlation_candidates(status);
CREATE INDEX idx_correlation_candidates_game_date ON correlation_candidates(game_id, event_date);

CREATE TABLE pr_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  insight_type VARCHAR(30) NOT NULL CHECK (insight_type IN (
    'outlet_pattern', 'timing_pattern', 'genre_pattern', 'campaign_suggestion'
  )),
  insight_text TEXT NOT NULL,
  supporting_annotation_ids UUID[] DEFAULT '{}',
  generated_at TIMESTAMPTZ DEFAULT now(),
  is_dismissed BOOLEAN DEFAULT false
);

CREATE INDEX idx_pr_insights_game ON pr_insights(game_id);
CREATE INDEX idx_pr_insights_client ON pr_insights(client_id);
CREATE INDEX idx_pr_insights_dismissed ON pr_insights(is_dismissed);

-- RLS
ALTER TABLE pr_annotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE correlation_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE pr_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pr_annotations_select" ON pr_annotations FOR SELECT TO authenticated USING (has_client_access(client_id));
CREATE POLICY "pr_annotations_insert" ON pr_annotations FOR INSERT TO authenticated WITH CHECK (has_client_access(client_id));
CREATE POLICY "pr_annotations_update" ON pr_annotations FOR UPDATE TO authenticated USING (has_client_access(client_id));
CREATE POLICY "pr_annotations_delete" ON pr_annotations FOR DELETE TO authenticated USING (has_client_access(client_id));
CREATE POLICY "correlation_candidates_select" ON correlation_candidates FOR SELECT TO authenticated USING (has_client_access(client_id));
CREATE POLICY "correlation_candidates_insert" ON correlation_candidates FOR INSERT TO authenticated WITH CHECK (has_client_access(client_id));
CREATE POLICY "correlation_candidates_update" ON correlation_candidates FOR UPDATE TO authenticated USING (has_client_access(client_id));
CREATE POLICY "correlation_candidates_delete" ON correlation_candidates FOR DELETE TO authenticated USING (has_client_access(client_id));
CREATE POLICY "pr_insights_select" ON pr_insights FOR SELECT TO authenticated USING (client_id IS NULL OR has_client_access(client_id));
CREATE POLICY "pr_insights_insert" ON pr_insights FOR INSERT TO authenticated WITH CHECK (client_id IS NULL OR has_client_access(client_id));
CREATE POLICY "pr_insights_update" ON pr_insights FOR UPDATE TO authenticated USING (client_id IS NULL OR has_client_access(client_id));
CREATE POLICY "pr_insights_delete" ON pr_insights FOR DELETE TO authenticated USING (client_id IS NULL OR has_client_access(client_id));
CREATE POLICY "pr_annotations_service" ON pr_annotations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "correlation_candidates_service" ON correlation_candidates FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "pr_insights_service" ON pr_insights FOR ALL TO service_role USING (true) WITH CHECK (true);
