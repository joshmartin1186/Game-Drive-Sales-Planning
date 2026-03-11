/**
 * SullyGnome Twitch Analytics — Shared Processing Logic
 *
 * Used by both:
 * - /api/cron/sullygnome-scan (automated Apify web scraper)
 * - /api/sullygnome-import (manual CSV upload fallback)
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { inferTerritory } from './territory'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SullyGnomeRow {
  channel_name: string
  stream_hours: number
  avg_viewers: number
  hours_watched: number
  peak_viewers: number
  followers: number
  language?: string | null
  partner_status?: string | null
  mature?: boolean
}

export interface ProcessingResult {
  total_rows: number
  enriched: number
  new_items: number
  skipped: number
  skipped_reasons: {
    below_threshold: number
    blacklisted: number
    parse_error: number
    duplicate: number
  }
}

interface ProcessingOptions {
  clientId: string
  gameId: string
  gameName: string
  gameSlug: string
  timeRange: string
  minAvgViewers: number
}

// ─── Column Mapping ─────────────────────────────────────────────────────────

/**
 * SullyGnome "Most Watched" table columns (0-indexed):
 * 0: Rank
 * 1: (avatar)
 * 2: Channel name
 * 3: Hours watched
 * 4: Stream hours (time)
 * 5: Average viewers
 * 6: Peak viewers
 * 7: Followers
 * 8: Partner status
 * 9: Mature flag
 * 10: Language
 * 11: (empty)
 */
export function parseApifyRow(cells: string[]): SullyGnomeRow | null {
  if (cells.length < 8) return null

  const channel = cells[2]?.trim()
  if (!channel) return null

  return {
    channel_name: channel,
    hours_watched: parseNumber(cells[3]),
    stream_hours: parseNumber(cells[4]),
    avg_viewers: parseNumber(cells[5]),
    peak_viewers: parseNumber(cells[6]),
    followers: parseNumber(cells[7]),
    partner_status: cells[8]?.trim() || null,
    mature: cells[9]?.trim() === 'Mature',
    language: cells[10]?.trim() || null,
  }
}

/**
 * Parse a SullyGnome CSV row.
 * CSV columns: Channel, Stream time, Average viewers, Hours watched, Peak viewers, Followers
 */
export function parseCsvRow(row: string[]): SullyGnomeRow | null {
  if (row.length < 6) return null

  const channel = row[0]?.trim()
  if (!channel) return null

  return {
    channel_name: channel,
    stream_hours: parseNumber(row[1]),
    avg_viewers: parseNumber(row[2]),
    hours_watched: parseNumber(row[3]),
    peak_viewers: parseNumber(row[4]),
    followers: parseNumber(row[5]),
  }
}

// ─── Processing Pipeline ────────────────────────────────────────────────────

export async function processSullyGnomeRows(
  supabase: SupabaseClient,
  rows: SullyGnomeRow[],
  opts: ProcessingOptions,
): Promise<ProcessingResult> {
  const result: ProcessingResult = {
    total_rows: rows.length,
    enriched: 0,
    new_items: 0,
    skipped: 0,
    skipped_reasons: { below_threshold: 0, blacklisted: 0, parse_error: 0, duplicate: 0 },
  }

  for (const row of rows) {
    try {
      // 1. Apply minimum threshold
      if (row.avg_viewers < opts.minAvgViewers) {
        result.skipped++
        result.skipped_reasons.below_threshold++
        continue
      }

      // 2. Construct streamer domain
      const streamerLogin = row.channel_name.toLowerCase().replace(/\s+/g, '')
      const streamerDomain = `twitch.tv/${streamerLogin}`

      // 3. Look up existing outlet
      const { data: existingOutlet } = await supabase
        .from('outlets')
        .select('id, is_blacklisted, country, monthly_unique_visitors')
        .eq('domain', streamerDomain)
        .limit(1)

      if (existingOutlet?.[0]?.is_blacklisted) {
        result.skipped++
        result.skipped_reasons.blacklisted++
        continue
      }

      let outletId: string | null = existingOutlet?.[0]?.id || null

      // 4. Build SullyGnome metadata
      const sgMetadata = {
        sullygnome_enriched: true,
        sullygnome_avg_viewers: row.avg_viewers,
        sullygnome_peak_viewers: row.peak_viewers,
        sullygnome_hours_watched: row.hours_watched,
        sullygnome_stream_hours: row.stream_hours,
        sullygnome_time_range: opts.timeRange,
        sullygnome_import_date: new Date().toISOString(),
        sullygnome_game_slug: opts.gameSlug,
      }

      // 5. Check for existing coverage items (to enrich)
      if (outletId) {
        const { data: existingItems } = await supabase
          .from('coverage_items')
          .select('id, source_metadata')
          .eq('outlet_id', outletId)
          .eq('client_id', opts.clientId)
          .eq('source_type', 'twitch')

        if (existingItems && existingItems.length > 0) {
          // ENRICH existing items
          for (const item of existingItems) {
            const mergedMeta = { ...(item.source_metadata || {}), ...sgMetadata }
            await supabase
              .from('coverage_items')
              .update({ source_metadata: mergedMeta })
              .eq('id', item.id)
          }

          // Update outlet with better data
          const currentVisitors = Number(existingOutlet?.[0]?.monthly_unique_visitors || 0)
          if (row.followers > currentVisitors) {
            await supabase
              .from('outlets')
              .update({
                monthly_unique_visitors: row.followers,
                tier: tierFromFollowers(row.followers),
              })
              .eq('id', outletId)
          }

          result.enriched++
          continue
        }
      }

      // 6. No existing items — check for duplicate URL before creating
      const channelUrl = `https://twitch.tv/${streamerLogin}`
      const { data: dupeCheck } = await supabase
        .from('coverage_items')
        .select('id')
        .eq('url', channelUrl)
        .eq('client_id', opts.clientId)
        .limit(1)

      if (dupeCheck && dupeCheck.length > 0) {
        result.skipped++
        result.skipped_reasons.duplicate++
        continue
      }

      // 7. Create outlet if needed
      if (!outletId) {
        const { data: newOutlet } = await supabase
          .from('outlets')
          .insert({
            name: row.channel_name,
            domain: streamerDomain,
            monthly_unique_visitors: row.followers,
            tier: tierFromFollowers(row.followers),
            is_active: true,
          })
          .select('id')
          .single()

        if (newOutlet) outletId = newOutlet.id
      }

      // 8. Infer territory from language
      const territory = inferTerritory(null, null, row.language) || 'International'

      // 9. Create new coverage item
      await supabase.from('coverage_items').insert({
        client_id: opts.clientId,
        game_id: opts.gameId,
        outlet_id: outletId,
        title: `${row.channel_name} streamed ${opts.gameName} (${opts.timeRange})`,
        url: channelUrl,
        publish_date: null,
        coverage_type: 'stream',
        monthly_unique_visitors: row.followers,
        territory,
        source_type: 'twitch',
        source_metadata: {
          video_id: null,
          user_name: row.channel_name,
          view_count: 0,
          duration: null,
          followers: row.followers,
          language: row.language || null,
          partner_status: row.partner_status || null,
          ...sgMetadata,
          sullygnome_only: true,
        },
        approval_status: 'pending_review',
        discovered_at: new Date().toISOString(),
      })

      result.new_items++
    } catch (err) {
      console.error(`SullyGnome processing error for "${row.channel_name}":`, err)
      result.skipped++
      result.skipped_reasons.parse_error++
    }
  }

  return result
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Parse a number from SullyGnome format (e.g., "1,207,990" → 1207990) */
function parseNumber(str: string | undefined): number {
  if (!str) return 0
  const cleaned = str.replace(/,/g, '').trim()
  const num = Number(cleaned)
  return isNaN(num) ? 0 : num
}

/** Tier calculation for Twitch channels (same thresholds as twitch-scan) */
function tierFromFollowers(followers: number): string {
  if (followers >= 100000) return 'A'
  if (followers >= 10000) return 'B'
  if (followers >= 1000) return 'C'
  return 'D'
}

/** SullyGnome time range to URL segment mapping */
export const TIME_RANGE_SLUGS: Record<string, string> = {
  '3d': '3',
  '7d': '7',
  '14d': '14',
  '30d': '30',
  '90d': '90',
  '180d': '180',
  '365d': '365',
}

/** Build SullyGnome URL for a game's "Most Watched" page */
export function buildSullyGnomeUrl(slug: string, timeRange: string = '30d'): string {
  const rangeSeg = TIME_RANGE_SLUGS[timeRange] || '30'
  return `https://sullygnome.com/game/${slug}/${rangeSeg}/watched`
}
