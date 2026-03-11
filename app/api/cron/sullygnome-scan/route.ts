import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import {
  parseApifyRow,
  processSullyGnomeRows,
  buildSullyGnomeUrl,
  type ProcessingResult,
} from '@/lib/sullygnome'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120 // SullyGnome scrapes take longer (JS render + residential proxy)

// Apify generic web scraper — headless Chrome, works with Cloudflare
const APIFY_ACTOR = 'apify~web-scraper'

// ─── Types ──────────────────────────────────────────────────────────────────

interface CoverageSource {
  id: string
  source_type: string
  name: string
  config: {
    game_name?: string
    sullygnome_slug?: string
    default_time_range?: string
    min_avg_viewers?: number
    [key: string]: unknown
  }
  outlet_id: string | null
  game_id: string | null
  scan_frequency: string
  is_active: boolean
  last_run_at: string | null
  consecutive_failures: number
  total_items_found: number
  game?: { id: string; name: string; client_id: string } | null
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function shouldScanNow(source: CoverageSource): boolean {
  if (!source.last_run_at) return true
  const lastRun = new Date(source.last_run_at).getTime()
  const hoursSince = (Date.now() - lastRun) / (1000 * 60 * 60)
  switch (source.scan_frequency) {
    case 'hourly': return hoursSince >= 0.9
    case 'every_6h': return hoursSince >= 5.5
    case 'daily': return hoursSince >= 23
    case 'weekly': return hoursSince >= 167
    default: return hoursSince >= 167 // Default weekly for SullyGnome
  }
}

/**
 * Build the Apify pageFunction that extracts streamer table rows from SullyGnome.
 * Runs inside headless Chrome with jQuery available.
 */
function buildPageFunction(): string {
  return `
async function pageFunction(context) {
  const { jQuery, log } = context;

  // Wait for the table to render (JS-rendered page)
  await new Promise(resolve => {
    let checks = 0;
    const interval = setInterval(() => {
      checks++;
      if (jQuery('table tbody tr').length > 0 || checks > 30) {
        clearInterval(interval);
        resolve();
      }
    }, 1000);
  });

  const rows = [];
  jQuery('table tbody tr').each(function() {
    const cells = [];
    jQuery(this).find('td').each(function() {
      cells.push(jQuery(this).text().trim());
    });
    if (cells.length >= 8) {
      rows.push(cells);
    }
  });

  log.info('Extracted ' + rows.length + ' rows from SullyGnome table');
  return rows;
}
`
}

// ─── Main Handler ───────────────────────────────────────────────────────────

// GET /api/cron/sullygnome-scan — Scan SullyGnome for Twitch streamer analytics
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Allow forcing a specific source via query param
  const { searchParams } = new URL(request.url)
  const forceSourceId = searchParams.get('source_id')

  const supabase = getServerSupabase()

  try {
    // 1. Get Apify API key
    const { data: keyData } = await supabase
      .from('service_api_keys')
      .select('api_key')
      .eq('service_name', 'apify')
      .eq('is_active', true)
      .single()

    if (!keyData?.api_key) {
      return NextResponse.json({ message: 'Apify API key not configured, skipping' })
    }

    const apifyKey = keyData.api_key

    // 2. Get active SullyGnome sources
    let sourceQuery = supabase
      .from('coverage_sources')
      .select('*, game:games(id, name, client_id)')
      .eq('source_type', 'sullygnome')
      .eq('is_active', true)

    if (forceSourceId) {
      sourceQuery = sourceQuery.eq('id', forceSourceId)
    }

    const { data: sources, error: srcError } = await sourceQuery

    if (srcError) {
      console.error('Error fetching SullyGnome sources:', srcError)
      return NextResponse.json({ error: srcError.message }, { status: 500 })
    }

    if (!sources || sources.length === 0) {
      return NextResponse.json({ message: 'No active SullyGnome sources configured' })
    }

    // 3. Process each source
    const results: Array<{
      source_id: string
      name: string
      status: string
      result?: ProcessingResult
      error?: string
    }> = []

    for (const source of sources as CoverageSource[]) {
      // Skip if not due (unless forced)
      if (!forceSourceId && !shouldScanNow(source)) {
        results.push({ source_id: source.id, name: source.name, status: 'skipped_not_due' })
        continue
      }

      // Validate config
      const slug = source.config?.sullygnome_slug
      const gameName = source.config?.game_name || source.game?.name || source.name
      const timeRange = source.config?.default_time_range || '30d'
      const minAvgViewers = source.config?.min_avg_viewers || 10

      if (!slug) {
        // Mark as error — missing slug
        await supabase
          .from('coverage_sources')
          .update({
            last_run_at: new Date().toISOString(),
            last_run_status: 'error',
            last_run_error: 'Missing sullygnome_slug in config',
            consecutive_failures: (source.consecutive_failures || 0) + 1,
          })
          .eq('id', source.id)

        results.push({ source_id: source.id, name: source.name, status: 'error', error: 'Missing slug' })
        continue
      }

      if (!source.game?.client_id) {
        await supabase
          .from('coverage_sources')
          .update({
            last_run_at: new Date().toISOString(),
            last_run_status: 'error',
            last_run_error: 'Source must be linked to a game (with client)',
            consecutive_failures: (source.consecutive_failures || 0) + 1,
          })
          .eq('id', source.id)

        results.push({ source_id: source.id, name: source.name, status: 'error', error: 'No linked game' })
        continue
      }

      try {
        // 4. Build SullyGnome URL and run Apify web scraper
        const targetUrl = buildSullyGnomeUrl(slug, timeRange)

        const actorRes = await fetch(
          `https://api.apify.com/v2/acts/${APIFY_ACTOR}/run-sync-get-dataset-items?token=${apifyKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              startUrls: [{ url: targetUrl }],
              pageFunction: buildPageFunction(),
              maxPagesPerCrawl: 1,
              proxyConfiguration: {
                useApifyProxy: true,
                apifyProxyGroups: ['RESIDENTIAL'],
              },
              // Increase timeouts for JS rendering
              pageFunctionTimeoutSecs: 60,
              maxConcurrency: 1,
            }),
          }
        )

        if (!actorRes.ok) {
          const errText = await actorRes.text().catch(() => 'Unknown error')
          throw new Error(`Apify actor returned ${actorRes.status}: ${errText.slice(0, 200)}`)
        }

        const rawResults = await actorRes.json()

        // The web scraper returns pageFunction results — each item is the return value
        // Our pageFunction returns an array of cell arrays per page
        // Flatten: results may be [[row1, row2, ...]] or [row1, row2, ...]
        let allRows: string[][] = []
        if (Array.isArray(rawResults)) {
          for (const item of rawResults) {
            if (Array.isArray(item)) {
              // Could be [[cells], [cells], ...] or [cells]
              if (item.length > 0 && Array.isArray(item[0])) {
                allRows = allRows.concat(item)
              } else if (item.length > 0 && typeof item[0] === 'string') {
                allRows.push(item)
              }
            }
          }
        }

        // Parse rows into SullyGnomeRow objects
        const parsedRows = allRows
          .map(cells => parseApifyRow(cells))
          .filter((r): r is NonNullable<typeof r> => r !== null)

        // 5. Process through shared pipeline
        const result = await processSullyGnomeRows(supabase, parsedRows, {
          clientId: source.game.client_id,
          gameId: source.game.id,
          gameName,
          gameSlug: slug,
          timeRange,
          minAvgViewers,
        })

        // 6. Update source tracking
        await supabase
          .from('coverage_sources')
          .update({
            last_run_at: new Date().toISOString(),
            last_run_status: 'success',
            last_run_error: null,
            items_found_last_run: result.new_items + result.enriched,
            total_items_found: (source.total_items_found || 0) + result.new_items,
            consecutive_failures: 0,
          })
          .eq('id', source.id)

        results.push({ source_id: source.id, name: source.name, status: 'success', result })
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Unknown error'
        console.error(`SullyGnome scan error for "${source.name}":`, errMsg)

        const newFailures = (source.consecutive_failures || 0) + 1
        await supabase
          .from('coverage_sources')
          .update({
            last_run_at: new Date().toISOString(),
            last_run_status: newFailures >= 5 ? 'error' : 'failed',
            last_run_error: errMsg.slice(0, 500),
            consecutive_failures: newFailures,
          })
          .eq('id', source.id)

        results.push({ source_id: source.id, name: source.name, status: 'error', error: errMsg })
      }
    }

    // 7. Summarize
    const successCount = results.filter(r => r.status === 'success').length
    const totalNew = results.reduce((sum, r) => sum + (r.result?.new_items || 0), 0)
    const totalEnriched = results.reduce((sum, r) => sum + (r.result?.enriched || 0), 0)

    return NextResponse.json({
      message: `SullyGnome scan complete: ${successCount}/${results.length} sources processed, ${totalNew} new items, ${totalEnriched} enriched`,
      sources_processed: successCount,
      sources_total: results.length,
      new_items: totalNew,
      enriched: totalEnriched,
      details: results,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('SullyGnome scan error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
