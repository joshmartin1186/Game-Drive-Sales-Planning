# PR Coverage Tracker — Technical Architecture

> This document is the complete technical spec for the PR Coverage Tracking system.
> GitHub Issues #62–#95. Read this before building.

## Overview

Automated system to discover, track, and report on press/media coverage for GameDrive's game clients. Replaces manual spreadsheet workflow where Alisa tracks coverage in Google Sheets with columns for Date, Territory, Media Outlet, Type, URL, Monthly Unique Visitors, Review Score, and Quotes.

**Competitor reference:** https://impress.games/coverage-bot (€500–2000/month)
**Current manual tool:** CoverageBook — https://share.coveragebook.com/b/a5dd10ef641e4e78

## Database Schema (Issue #62)

### Table: `coverage_items`
```sql
CREATE TABLE coverage_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES clients(id) NOT NULL,
  campaign_id UUID REFERENCES coverage_campaigns(id),
  outlet_id UUID REFERENCES outlets(id),
  
  -- Core fields
  url TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  published_date TIMESTAMPTZ,
  discovered_date TIMESTAMPTZ DEFAULT NOW(),
  territory TEXT,                    -- e.g., 'US', 'UK', 'DE', 'Global'
  language TEXT DEFAULT 'en',
  
  -- Classification
  coverage_type TEXT NOT NULL,       -- News, Review, Preview, Interview, Trailer, Stream, Video, Guide, Round-up, Mention, Feature, Trailer Repost
  game_name TEXT,                    -- Which game this covers
  
  -- Review-specific
  review_score NUMERIC,
  review_quote TEXT,
  
  -- Enrichment
  monthly_unique_visitors BIGINT,    -- From Hypestat
  estimated_views BIGINT,            -- For video content
  sentiment_score NUMERIC,           -- -1 to 1
  relevance_score INTEGER,           -- 0-100 from Claude API
  
  -- Source tracking
  source_type TEXT NOT NULL,         -- rss, tavily, youtube, twitch, reddit, twitter, tiktok, instagram, manual
  source_id TEXT,                    -- RSS feed URL, search query, etc.
  raw_data JSONB,                    -- Original scraped data
  
  -- Approval workflow
  approval_status TEXT DEFAULT 'pending_review',  -- auto_approved, pending_review, rejected, manually_approved
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  
  -- Metadata
  is_syndicated BOOLEAN DEFAULT false,
  syndicated_from UUID REFERENCES coverage_items(id),
  tags TEXT[],
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Table: `outlets`
```sql
CREATE TABLE outlets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  domain TEXT NOT NULL UNIQUE,
  
  -- Traffic & tier
  monthly_unique_visitors BIGINT,
  traffic_last_updated TIMESTAMPTZ,
  tier TEXT,                         -- A (10M+), B (1M-10M), C (100K-1M), D (<100K)
  
  -- Classification
  outlet_type TEXT,                  -- Traditional Media, YouTube Channel, Twitch Channel, Blog, Forum, Social Media
  territory TEXT,                    -- Primary territory
  language TEXT DEFAULT 'en',
  is_metacritic_outlet BOOLEAN DEFAULT false,
  
  -- Source config
  rss_feed_url TEXT,
  rss_active BOOLEAN DEFAULT true,
  rss_poll_frequency_minutes INTEGER DEFAULT 60,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  is_blacklisted BOOLEAN DEFAULT false,
  blacklist_reason TEXT,
  custom_tags TEXT[],
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Table: `coverage_keywords`
```sql
CREATE TABLE coverage_keywords (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES clients(id) NOT NULL,
  keyword TEXT NOT NULL,
  keyword_type TEXT DEFAULT 'game_name',  -- game_name, studio_name, product_name, custom
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Table: `coverage_campaigns`
```sql
CREATE TABLE coverage_campaigns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES clients(id) NOT NULL,
  name TEXT NOT NULL,                -- e.g., 'Sprint City Launch', 'Escape Simulator 2 Announcement'
  campaign_type TEXT,                -- Announcement, Launch, Post-Launch, Ongoing
  start_date DATE,
  end_date DATE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Scraper Architecture

**Principle: Free-first, paid fallback.**

### Tier 1: Free (always-on)
| Source | Library/API | Cost | Rate Limit |
|--------|-------------|------|------------|
| RSS Feeds | `rss-parser` npm | $0 | Unlimited |
| YouTube | YouTube Data API v3 | $0 | 10K quota/day |
| Twitch | Twitch Helix API | $0 | OAuth, generous |
| Reddit | Reddit API | $0 | 100 req/min |

### Tier 2: Low-cost search ($20-40/mo)
| Source | Service | Cost |
|--------|---------|------|
| Web search | Tavily API | ~$20-40/mo |
| Traffic data | Hypestat (HTTP scrape) | $0 |

### Tier 3: Optional paid ($30-65/mo)
| Source | Service | Cost |
|--------|---------|------|
| Twitter/X | Apify | $30-40/mo |
| TikTok | Apify | $3-10/mo |
| Instagram | Apify | $5-15/mo |

**Total estimated: $20-130/month** vs competitor at €500-2000/month.

## Source Management Hub (Issue #66)

4-tab admin interface at `/coverage/sources/`:

**Tab 1: RSS Feeds** — Add/remove/bulk import feeds, toggle active/inactive, set poll frequency per feed

**Tab 2: Web Monitoring (Tavily)** — Domain tracking list, keyword search queries, tries free HTTP fetch first with Tavily as fallback

**Tab 3: Free APIs** — YouTube channels/search queries, Twitch game categories, Reddit subreddits to monitor

**Tab 4: Apify Integrations** — Twitter accounts/hashtags, TikTok hashtags, Instagram accounts. Shows credit balance and usage warnings.

## AI Relevance Filtering (Issue #75)

Every discovered item gets scored by Claude API (0-100):
- **80-100:** Auto-approved, appears in feed immediately
- **50-79:** Pending review, admin must approve/reject
- **0-49:** Auto-rejected (logged but hidden)

Prompt sends: article title, URL, outlet name, snippet, client's game names. Returns: relevance score, coverage type classification, brief reason.

## Approval Workflow

```
Discovered → AI Scored → Auto-Approved (80+)
                       → Pending Review (50-79) → Admin Approves/Rejects
                       → Auto-Rejected (<50)
```

Only approved items show in client-facing reports and public feeds.

## Client-Facing Reports

**Shareable URL:** `coverage.game-drive.nl/clientname` (custom domain on Vercel, Issue #95)

No login required. Optional password protection. Shows:
- Total coverage pieces, audience reach, estimated views
- Filterable by date range, coverage type, game
- Organized by campaign sections (Announcement, Launch, Post-Launch)
- Matches CoverageBook format that client already knows

## Coverage Types

News, Review, Preview, Interview, Trailer, Trailer Repost, Stream, Video, Guide, Round-up, Mention, Feature

## Outlet Tiers

| Tier | Monthly Visitors | Examples |
|------|-----------------|----------|
| A | 10M+ | IGN (101M), GameSpot, Kotaku |
| B | 1M-10M | Eurogamer (8.5M), PC Gamer, Polygon |
| C | 100K-1M | TheSixthAxis, Rock Paper Shotgun |
| D | <100K | Niche blogs, small YouTubers |

## API Key Management (Issue #65)

Settings page section for user-provided API keys, encrypted at rest in Supabase:
- Tavily API key
- Apify API key
- YouTube Data API key
- Twitch Client ID + Secret
- Reddit Client ID + Secret + Refresh Token
- Anthropic API key (for relevance scoring)

Each key shows: connection status indicator, test connection button, usage/quota display.

## Discord Alerts (Issue #83)

Webhook integration (~4-8hr build). Sends alerts for:
- New Tier A coverage discovered
- Reviews with scores
- Batch daily digest option

## Priority Labels on Issues

- `priority-high` = Must Have (Weeks 1-4)
- No priority label = Should Have (Weeks 5-8)
- `lower-priority` = Nice to Have (build if time allows)

## Implementation Notes

- **RSS polling:** Vercel cron job (already have cron infra from Steam sync). Poll every 30-60 min.
- **Tavily searches:** Triggered by cron, 2-3x daily per client. Uses domain list + keyword combos.
- **Hypestat enrichment:** HTTP fetch to hypestat.com/info/domain. Parse response for monthly visitors. Cache in `outlets` table.
- **Deduplication:** URL normalization (strip tracking params, www prefix, trailing slashes) + fuzzy title matching for syndicated content.
- **Rate limiting:** Queue system for API calls. Respect YouTube 10K/day quota, Reddit 100/min.
