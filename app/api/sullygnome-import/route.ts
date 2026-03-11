import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { parseCsvRow, processSullyGnomeRows } from '@/lib/sullygnome'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * POST /api/sullygnome-import — Manual CSV upload fallback
 *
 * Accepts a SullyGnome CSV file (downloaded from the game's "Most Watched" page)
 * and processes it through the same pipeline as the automated scanner.
 *
 * Body: multipart/form-data
 *   - file: CSV file
 *   - game_id: string (required)
 *   - client_id: string (required)
 *   - game_slug: string (required — SullyGnome URL slug)
 *   - time_range: string (optional, default "30d")
 *   - min_avg_viewers: number (optional, default 10)
 *   - source_id: string (optional — updates source tracking if provided)
 */
export async function POST(request: NextRequest) {
  const supabase = getServerSupabase()

  try {
    const formData = await request.formData()

    // Extract fields
    const file = formData.get('file') as File | null
    const gameId = formData.get('game_id') as string | null
    const clientId = formData.get('client_id') as string | null
    const gameSlug = formData.get('game_slug') as string | null
    const timeRange = (formData.get('time_range') as string) || '30d'
    const minAvgViewers = parseInt((formData.get('min_avg_viewers') as string) || '10') || 10
    const sourceId = formData.get('source_id') as string | null

    // Validate required fields
    if (!file) {
      return NextResponse.json({ error: 'CSV file is required' }, { status: 400 })
    }
    if (!gameId || !clientId) {
      return NextResponse.json({ error: 'game_id and client_id are required' }, { status: 400 })
    }
    if (!gameSlug) {
      return NextResponse.json({ error: 'game_slug is required (SullyGnome URL slug)' }, { status: 400 })
    }

    // Get game name for coverage item titles
    const { data: game } = await supabase
      .from('games')
      .select('name')
      .eq('id', gameId)
      .single()

    const gameName = game?.name || 'Unknown Game'

    // Parse CSV
    const text = await file.text()
    const lines = text.split('\n').map(line => line.trim()).filter(Boolean)

    if (lines.length < 2) {
      return NextResponse.json({ error: 'CSV file is empty or has no data rows' }, { status: 400 })
    }

    // Skip header row, parse remaining
    // SullyGnome CSV columns: Channel, Stream time, Average viewers, Hours watched, Peak viewers, Followers
    const rows = []
    for (let i = 1; i < lines.length; i++) {
      // Handle quoted CSV values (some channel names may contain commas)
      const cells = parseCSVLine(lines[i])
      const parsed = parseCsvRow(cells)
      if (parsed) rows.push(parsed)
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: 'No valid data rows found in CSV' }, { status: 400 })
    }

    // Process through shared pipeline
    const result = await processSullyGnomeRows(supabase, rows, {
      clientId,
      gameId,
      gameName,
      gameSlug,
      timeRange,
      minAvgViewers,
    })

    // Update source tracking if source_id provided
    if (sourceId) {
      await supabase
        .from('coverage_sources')
        .update({
          last_run_at: new Date().toISOString(),
          last_run_status: 'success',
          last_run_error: null,
          items_found_last_run: result.new_items + result.enriched,
          consecutive_failures: 0,
        })
        .eq('id', sourceId)
    }

    return NextResponse.json({
      message: `CSV import complete: ${result.total_rows} rows processed`,
      ...result,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('SullyGnome CSV import error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * Parse a CSV line handling quoted fields.
 * SullyGnome CSVs may have quoted channel names containing commas.
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++ // skip escaped quote
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }

  result.push(current.trim())
  return result
}
