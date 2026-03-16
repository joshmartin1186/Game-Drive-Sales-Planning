// Platform-specific meaningful metrics for PR coverage reporting.
// Each platform exposes different data from Apify — this maps source_metadata
// to the metrics that actually matter for evaluating PR impact.

export interface DisplayMetric {
  label: string
  value: number
  is_primary_reach: boolean  // Used in reach/view totals
}

type Meta = Record<string, unknown>

function toNum(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return isNaN(n) ? null : n
}

// Returns the metrics that should be shown for a given piece of coverage.
// Only returns metrics that have a value > 0 (no zero-padding or vanity nulls).
export function getDisplayMetrics(sourceType: string | null, meta: Meta | null): DisplayMetric[] {
  if (!meta || !sourceType) return []

  switch (sourceType) {
    case 'youtube':
      return [
        { label: 'Views', value: toNum(meta.views) ?? 0, is_primary_reach: true },
        { label: 'Likes', value: toNum(meta.likes) ?? 0, is_primary_reach: false },
        { label: 'Comments', value: toNum(meta.comments) ?? 0, is_primary_reach: false },
      ].filter(m => m.value > 0)

    case 'tiktok':
      return [
        { label: 'Plays', value: toNum(meta.views) ?? 0, is_primary_reach: true },
        { label: 'Likes', value: toNum(meta.likes) ?? 0, is_primary_reach: false },
        { label: 'Comments', value: toNum(meta.comments) ?? 0, is_primary_reach: false },
        { label: 'Shares', value: toNum(meta.shares) ?? 0, is_primary_reach: false },
      ].filter(m => m.value > 0)

    case 'twitter':
      return [
        { label: 'Impressions', value: toNum(meta.views) ?? 0, is_primary_reach: true },
        { label: 'Likes', value: toNum(meta.likes) ?? 0, is_primary_reach: false },
        { label: 'Retweets', value: toNum(meta.retweets) ?? 0, is_primary_reach: false },
        { label: 'Replies', value: toNum(meta.replies) ?? 0, is_primary_reach: false },
      ].filter(m => m.value > 0)

    case 'twitch':
      return [
        { label: 'VOD Views', value: toNum(meta.view_count) ?? 0, is_primary_reach: true },
      ].filter(m => m.value > 0)

    case 'reddit':
      return [
        { label: 'Upvotes', value: toNum(meta.score) ?? 0, is_primary_reach: false },
        { label: 'Comments', value: toNum(meta.num_comments) ?? 0, is_primary_reach: false },
      ].filter(m => m.value > 0)

    case 'instagram':
      return [
        { label: 'Likes', value: toNum(meta.likes) ?? 0, is_primary_reach: false },
        { label: 'Comments', value: toNum(meta.comments) ?? 0, is_primary_reach: false },
      ].filter(m => m.value > 0)

    default:
      return []
  }
}

// The single reach number used for aggregation in summary stats.
// Returns null for platforms where we only have engagement (Reddit, Instagram)
// since upvotes/likes are not the same as reach.
export function getPrimaryReach(sourceType: string | null, meta: Meta | null, outletMuv: number | null): number | null {
  if (!sourceType) return outletMuv
  switch (sourceType) {
    case 'youtube':
    case 'tiktok':
    case 'twitter':
      return toNum(meta?.views) ?? null
    case 'twitch':
      return toNum(meta?.view_count) ?? null
    case 'reddit':
    case 'instagram':
      return null  // engagement metrics only, not reach
    default:
      return outletMuv  // news/rss/tavily: use Hypestat outlet traffic
  }
}
