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
  relevance_score INTEGER,           -- 0-100 from Google Gemini AI
  
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

**Principle: Simplified 3-key architecture. All platform scrapers route through Apify REST API.**

### Required Services
| Service | Purpose | Cost |
|---------|---------|------|
| RSS Feeds | `rss-parser` npm — free, always-on | $0 |
| Tavily API | Web search for coverage discovery | ~$20-40/mo |
| Google Gemini AI | AI relevance scoring, classification, sentiment | $0 (free at our volumes) |
| Apify | YouTube, Twitch, Reddit, Twitter/X, TikTok, Instagram scrapers | ~$30-65/mo |

### Optional Services
| Service | Purpose | Cost |
|---------|---------|------|
| Discord Webhook | Coverage alert notifications | $0 |
| Hypestat | Outlet traffic enrichment (free HTTP scrape + Tavily fallback) | $0 |

**Total estimated: $50-105/month** vs competitor at €500-2000/month.

### Apify Actor Mapping
| Platform | Apify Actor | Cron Route |
|----------|-------------|------------|
| YouTube | `streamers/youtube-scraper` | `/api/cron/youtube-scan` |
| Twitch | `epctex/twitch-scraper` | `/api/cron/twitch-scan` |
| Reddit | `trudax/reddit-scraper-lite` | `/api/cron/reddit-scan` |
| Twitter/X | `apidojo/tweet-scraper` | `/api/cron/twitter-scan` |
| TikTok | `clockworks/tiktok-scraper` | `/api/cron/tiktok-scan` |
| Instagram | `apify/instagram-scraper` | `/api/cron/instagram-scan` |

All Apify actors use the same API key from `service_api_keys` table (`service_name = 'apify'`).

## Source Management Hub (Issue #66)

3-tab admin interface at `/coverage/sources/`:

**Tab 1: RSS Feeds** — Add/remove/bulk import feeds, toggle active/inactive, set poll frequency per feed

**Tab 2: Web Discovery (Tavily)** — Domain tracking list, keyword search queries, tries free HTTP fetch first with Tavily as fallback

**Tab 3: Apify Scrapers** — YouTube channels, Twitch game categories, Reddit subreddits, Twitter accounts/hashtags, TikTok hashtags, Instagram accounts. All platform scrapers route through Apify REST API. Shows credit balance and usage warnings.

## AI Relevance Filtering (Issue #75)

Every discovered item gets scored by Google Gemini Flash (`@google/generative-ai` SDK, model `gemini-2.5-flash-lite`):
- **80-100:** Auto-approved, appears in feed immediately
- **50-79:** Pending review, admin must approve/reject
- **0-49:** Auto-rejected (logged but hidden)

A single Gemini call handles relevance scoring, coverage type classification, and sentiment analysis (Issues #75, #77, #78 combined). Prompt sends: article title, URL, outlet name, snippet, client's game names. Returns JSON with `score` (0-100), `reasoning`, `suggested_type`, `sentiment`.

API key: `GOOGLE_AI_API_KEY` from Google AI Studio (free at PR coverage volumes).

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

Settings page at `/coverage/settings/` for user-provided API keys, stored in `service_api_keys` table:
- **Tavily** — Web search for coverage discovery (~$20-40/mo)
- **Apify** — YouTube, Twitch, Reddit, Twitter/X, TikTok, Instagram scrapers (~$30-65/mo)
- **Google AI (Gemini)** — AI relevance scoring, classification, sentiment (free)
- **Discord Webhook** — Coverage alert notifications (optional, free)

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
- **Apify scrapers:** All platform cron routes use Apify `run-sync-get-dataset-items` REST API. Single Apify API key covers all platforms.
- **Hypestat enrichment:** HTTP fetch to hypestat.com/info/domain → Tavily Extract fallback → Tavily Search fallback. Parse response for monthly visitors. Cache in `outlets` table. Future enhancement: Apify SEMRush actor for richer data (domain authority, traffic breakdown) — Apify key is always available since it's a required service.
- **AI scoring:** Google Gemini Flash via `@google/generative-ai` SDK. Single API call per article for relevance + type + sentiment.
- **Deduplication:** URL normalization (strip tracking params, www prefix, trailing slashes) + fuzzy title matching for syndicated content.
