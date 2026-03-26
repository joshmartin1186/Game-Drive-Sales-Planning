'use client'

import { useState, useEffect, useCallback } from 'react'
import styles from './CoverageHealth.module.css'

// ─── Types ──────────────────────────────────────────────────────────────────

interface GameHealth {
  game_id: string
  game_name: string
  client_name: string
  total_items: number
  approved_items: number
  pending_items: number
  rejected_items: number
  unique_outlets: number
  items_this_week: number
  items_last_week: number
  last_discovery_date: string | null
  source_diversity: Record<string, number>
  has_tavily_source: boolean
  staleness: 'active' | 'recent' | 'stale' | 'dormant'
}

interface HealthSummary {
  total_games: number
  total_items_this_week: number
  games_needing_attention: number
  avg_items_per_game: number
}

interface HealthResponse {
  games: GameHealth[]
  summary: HealthSummary
  error?: string
}

// ─── Source Colors ───────────────────────────────────────────────────────────

const SOURCE_COLORS: Record<string, string> = {
  tavily: '#6366f1',
  rss: '#f59e0b',
  google_news: '#10b981',
  youtube: '#ef4444',
  reddit: '#f97316',
  twitter: '#3b82f6',
  tiktok: '#ec4899',
  instagram: '#a855f7',
  twitch: '#8b5cf6',
  manual: '#8888a0',
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDate(d: string | null): string {
  if (!d) return 'Never'
  const date = new Date(d)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  if (diffHours < 1) return 'Just now'
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function getTrendArrow(thisWeek: number, lastWeek: number): { text: string; className: string } {
  if (lastWeek === 0 && thisWeek === 0) return { text: '-- flat', className: styles.trendFlat }
  if (lastWeek === 0 && thisWeek > 0) return { text: `+${thisWeek} new`, className: styles.trendUp }
  const diff = thisWeek - lastWeek
  const pct = lastWeek > 0 ? Math.round((diff / lastWeek) * 100) : 0
  if (diff > 0) return { text: `+${diff} (+${pct}%)`, className: styles.trendUp }
  if (diff < 0) return { text: `${diff} (${pct}%)`, className: styles.trendDown }
  return { text: '0 (flat)', className: styles.trendFlat }
}

function getStalenessClass(s: string): string {
  switch (s) {
    case 'active': return styles.stalenessActive
    case 'recent': return styles.stalenessRecent
    case 'stale': return styles.stalenessStale
    default: return styles.stalenessDormant
  }
}

function getStalenessLabelClass(s: string): string {
  switch (s) {
    case 'active': return styles.stalenessLabelActive
    case 'recent': return styles.stalenessLabelRecent
    case 'stale': return styles.stalenessLabelStale
    default: return styles.stalenessLabelDormant
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function CoverageHealth() {
  const [data, setData] = useState<HealthResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)

  const fetchHealth = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/coverage-health')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json: HealthResponse = await res.json()
      if (json.error) throw new Error(json.error)
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (expanded && !data && !loading) {
      fetchHealth()
    }
  }, [expanded, data, loading, fetchHealth])

  return (
    <div className={styles.container}>
      {/* Toggle button */}
      <div className={styles.toggleBar}>
        <button
          className={expanded ? styles.toggleButtonActive : styles.toggleButton}
          onClick={() => setExpanded(!expanded)}
        >
          <span className={styles.toggleIcon}>{expanded ? '\u25BC' : '\u25B6'}</span>
          Coverage Health
          {data && !expanded && (
            <span style={{ opacity: 0.7, fontSize: 12 }}>
              {' '}&middot; {data.summary.total_games} games
              {data.summary.games_needing_attention > 0 && (
                <span style={{ color: '#f59e0b' }}>
                  {' '}&middot; {data.summary.games_needing_attention} need attention
                </span>
              )}
            </span>
          )}
        </button>
        {expanded && (
          <button
            className={styles.toggleButton}
            onClick={fetchHealth}
            style={{ padding: '8px 12px', fontSize: 12 }}
          >
            Refresh
          </button>
        )}
      </div>

      {/* Expanded content */}
      {expanded && (
        <>
          {loading && <div className={styles.loading}>Loading coverage health...</div>}
          {error && <div className={styles.error}>Error: {error}</div>}

          {data && !loading && (
            <>
              {/* Summary bar */}
              <div className={styles.summaryBar}>
                <div className={styles.summaryCard}>
                  <div className={styles.summaryLabel}>Games Tracked</div>
                  <div className={styles.summaryValue}>{data.summary.total_games}</div>
                </div>
                <div className={styles.summaryCard}>
                  <div className={styles.summaryLabel}>Items This Week</div>
                  <div className={styles.summaryValue}>{data.summary.total_items_this_week}</div>
                </div>
                <div className={styles.summaryCard}>
                  <div className={styles.summaryLabel}>Needing Attention</div>
                  <div className={data.summary.games_needing_attention > 0
                    ? styles.summaryValueAttention
                    : styles.summaryValue
                  }>
                    {data.summary.games_needing_attention}
                  </div>
                </div>
                <div className={styles.summaryCard}>
                  <div className={styles.summaryLabel}>Avg Items / Game</div>
                  <div className={styles.summaryValue}>{data.summary.avg_items_per_game}</div>
                </div>
              </div>

              {/* Game cards grid */}
              {data.games.length === 0 ? (
                <div className={styles.emptyState}>
                  No games with PR tracking enabled. Enable PR tracking on games to see health metrics.
                </div>
              ) : (
                <div className={styles.grid}>
                  {data.games.map((game) => (
                    <GameHealthCard key={game.game_id} game={game} />
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

// ─── Game Health Card ───────────────────────────────────────────────────────

function GameHealthCard({ game }: { game: GameHealth }) {
  const trend = getTrendArrow(game.items_this_week, game.items_last_week)

  // Source diversity: only sources with items
  const activeSources = Object.entries(game.source_diversity).filter(([, count]) => count > 0)
  const totalSourceItems = activeSources.reduce((sum, [, count]) => sum + count, 0)

  return (
    <div className={styles.card}>
      {/* Header: game name + staleness dot */}
      <div className={styles.cardHeader}>
        <div className={styles.gameInfo}>
          <p className={styles.gameName}>{game.game_name}</p>
          <p className={styles.clientName}>{game.client_name}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className={getStalenessLabelClass(game.staleness)}>
            {game.staleness.charAt(0).toUpperCase() + game.staleness.slice(1)}
          </span>
          <div className={getStalenessClass(game.staleness)} title={`Status: ${game.staleness}`} />
        </div>
      </div>

      {/* Metrics */}
      <div className={styles.metricsRow}>
        <div className={styles.metric}>
          <div className={styles.metricValue}>{game.total_items}</div>
          <div className={styles.metricLabel}>Total Items</div>
        </div>
        <div className={styles.metric}>
          <div className={styles.metricValue}>{game.items_this_week}</div>
          <div className={styles.metricLabel}>This Week</div>
        </div>
        <div className={styles.metric}>
          <div className={styles.metricValue}>{game.unique_outlets}</div>
          <div className={styles.metricLabel}>Outlets</div>
        </div>
      </div>

      {/* Trend */}
      <div className={styles.trendRow}>
        <span className={trend.className}>{trend.text}</span>
        <span className={styles.trendLabel}>vs last week</span>
      </div>

      {/* Source diversity bar */}
      {totalSourceItems > 0 && (
        <div className={styles.diversitySection}>
          <div className={styles.diversityLabel}>Source Mix</div>
          <div className={styles.diversityBar}>
            {activeSources.map(([source, count]) => (
              <div
                key={source}
                className={styles.diversitySegment}
                style={{
                  width: `${(count / totalSourceItems) * 100}%`,
                  backgroundColor: SOURCE_COLORS[source] || '#8888a0',
                }}
                title={`${source}: ${count}`}
              />
            ))}
          </div>
          <div className={styles.diversityLegend}>
            {activeSources.map(([source, count]) => (
              <div key={source} className={styles.diversityItem}>
                <div
                  className={styles.diversityDot}
                  style={{ backgroundColor: SOURCE_COLORS[source] || '#8888a0' }}
                />
                {source} ({count})
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Warnings */}
      {!game.has_tavily_source && (
        <div style={{ marginBottom: 10 }}>
          <span className={styles.warningBadge}>No Tavily source configured</span>
        </div>
      )}

      {/* Footer */}
      <div className={styles.cardFooter}>
        <span className={styles.lastDiscovery}>
          Last: {formatDate(game.last_discovery_date)}
        </span>
        <div style={{ display: 'flex', gap: 8, fontSize: 11, color: '#8888a0' }}>
          <span style={{ color: '#10b981' }}>{game.approved_items} approved</span>
          <span style={{ color: '#f59e0b' }}>{game.pending_items} pending</span>
          {game.rejected_items > 0 && (
            <span style={{ color: '#ef4444' }}>{game.rejected_items} rejected</span>
          )}
        </div>
      </div>
    </div>
  )
}
