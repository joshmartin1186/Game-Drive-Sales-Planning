import { NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { tavily } from '@tavily/core'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

// ─── Helpers ────────────────────────────────────────────────────────────────

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url)
    u.searchParams.delete('utm_source')
    u.searchParams.delete('utm_medium')
    u.searchParams.delete('utm_campaign')
    u.searchParams.delete('utm_term')
    u.searchParams.delete('utm_content')
    let normalized = u.origin + u.pathname
    if (normalized.endsWith('/') && normalized.length > 1) {
      normalized = normalized.slice(0, -1)
    }
    const remaining = u.searchParams.toString()
    if (remaining) normalized += '?' + remaining
    return normalized
  } catch {
    return url.trim()
  }
}

function determineApprovalStatus(score: number): string {
  if (score >= 80) return 'auto_approved'
  if (score >= 50) return 'pending_review'
  return 'rejected'
}

// ─── POST: Manual Tavily scan ───────────────────────────────────────────────

export async function POST(request: Request) {
  const startTime = Date.now()
  const supabase = getServerSupabase()

  try {
    const body = await request.json()
    const sourceId = body.source_id as string | undefined
    const scanAll = body.scan_all as boolean | undefined

    if (!sourceId && !scanAll) {
      return NextResponse.json({ error: 'Provide source_id or scan_all: true' }, { status: 400 })
    }

    // Get Tavily API key
    const { data: keyData } = await supabase
      .from('service_api_keys')
      .select('api_key')
      .eq('service_name', 'tavily')
      .single()

    if (!keyData?.api_key) {
      return NextResponse.json({ error: 'Tavily API key not configured' }, { status: 400 })
    }

    const tvly = tavily({ apiKey: keyData.api_key })

    // Fetch source(s)
    let query = supabase
      .from('coverage_sources')
      .select('*, outlet:outlets(id, tier, monthly_unique_visitors)')
      .eq('source_type', 'tavily')
      .eq('is_active', true)

    if (sourceId) query = query.eq('id', sourceId)

    const { data: sources } = await query

    if (!sources || sources.length === 0) {
      return NextResponse.json({ error: 'No matching Tavily sources found' }, { status: 404 })
    }

    // Fetch keywords, games, existing URLs
    const { data: keywords } = await supabase
      .from('coverage_keywords')
      .select('keyword, keyword_type, client_id, game_id')

    const blacklistGlobal = (keywords || [])
      .filter((k: { keyword_type: string }) => k.keyword_type === 'blacklist')
      .map((k: { keyword: string }) => k.keyword.toLowerCase())

    const { data: games } = await supabase.from('games').select('id, name, client_id')

    const { data: existingItems } = await supabase
      .from('coverage_items')
      .select('url')
      .order('created_at', { ascending: false })
      .limit(10000)

    const existingUrls = new Set<string>()
    if (existingItems) {
      for (const item of existingItems) existingUrls.add(normalizeUrl(item.url))
    }

    const results: Array<{
      source: string
      status: string
      queries: number
      found: number
      inserted: number
      cost_estimate: number
      error?: string
    }> = []

    for (const source of sources) {
      if (Date.now() - startTime > 50000) break

      try {
        const searchQueries: string[] = []
        const domain = source.config?.domain as string | undefined
        const sourceKeywords = Array.isArray(source.config?.keywords)
          ? (source.config.keywords as string[])
          : []

        let matchedClientId: string | null = null
        let matchedGameId: string | null = source.game_id

        if (source.game_id && games) {
          const game = games.find((g: { id: string }) => g.id === source.game_id)
          if (game) {
            matchedClientId = game.client_id
            if (sourceKeywords.length > 0) {
              for (const kw of sourceKeywords) searchQueries.push(`${game.name} ${kw}`)
            } else {
              searchQueries.push(game.name)
            }
          }
        } else if (sourceKeywords.length > 0) {
          for (const kw of sourceKeywords) searchQueries.push(kw)
        } else if (domain) {
          searchQueries.push(`site:${domain} gaming news`)
        }

        if (searchQueries.length === 0) {
          results.push({ source: source.name, status: 'skipped', queries: 0, found: 0, inserted: 0, cost_estimate: 0, error: 'No queries generated' })
          continue
        }

        const newItems: Array<Record<string, unknown>> = []
        let queriesMade = 0

        for (const searchQuery of searchQueries.slice(0, 3)) {
          if (Date.now() - startTime > 50000) break

          const searchOptions: Record<string, unknown> = {
            maxResults: 10,
            searchDepth: 'basic' as const,
            includeAnswer: false
          }
          if (domain) searchOptions.includeDomains = [domain]

          const response = await tvly.search(searchQuery, searchOptions)
          queriesMade++

          for (const result of (response.results || [])) {
            if (!result.url || !result.title) continue

            const normalizedUrl = normalizeUrl(result.url)
            if (existingUrls.has(normalizedUrl)) continue

            const text = `${result.title} ${result.content || ''}`.toLowerCase()
            if (blacklistGlobal.some((bk: string) => text.includes(bk))) continue

            let score = 60
            if (source.game_id && games) {
              const game = games.find((g: { id: string; name: string }) => g.id === source.game_id)
              if (game && result.title.toLowerCase().includes(game.name.toLowerCase())) score += 25
            }
            if (result.score && result.score > 0.7) score += 10
            score = Math.min(score, 100)

            existingUrls.add(normalizedUrl)

            let outletId = source.outlet_id
            if (!outletId) {
              try {
                const resultDomain = new URL(result.url).hostname.replace('www.', '')
                const { data: outlet } = await supabase
                  .from('outlets')
                  .select('id')
                  .eq('domain', resultDomain)
                  .single()
                if (outlet) outletId = outlet.id
              } catch { /* ignore */ }
            }

            newItems.push({
              client_id: matchedClientId,
              game_id: matchedGameId,
              outlet_id: outletId,
              title: result.title.trim(),
              url: normalizedUrl,
              publish_date: result.publishedDate ? result.publishedDate.split('T')[0] : null,
              coverage_type: 'news',
              relevance_score: score,
              relevance_reasoning: `Tavily search: "${searchQuery}"`,
              approval_status: determineApprovalStatus(score),
              source_type: 'tavily',
              source_metadata: {
                search_query: searchQuery,
                source_id: source.id,
                tavily_score: result.score || null,
                content_snippet: result.content?.substring(0, 300) || null
              },
              discovered_at: new Date().toISOString()
            })
          }
        }

        let insertedCount = 0
        if (newItems.length > 0) {
          const { data: inserted, error: insertErr } = await supabase
            .from('coverage_items')
            .upsert(newItems, { onConflict: 'url', ignoreDuplicates: true })
            .select('id')

          if (!insertErr) insertedCount = inserted?.length || 0
        }

        await supabase.from('coverage_sources').update({
          last_run_at: new Date().toISOString(),
          last_run_status: 'success',
          last_run_message: `${queriesMade} queries, ${newItems.length} new items`,
          items_found_last_run: newItems.length,
          total_items_found: (source.total_items_found || 0) + newItems.length,
          consecutive_failures: 0
        }).eq('id', source.id)

        results.push({
          source: source.name,
          status: 'success',
          queries: queriesMade,
          found: newItems.length,
          inserted: insertedCount,
          cost_estimate: queriesMade * 0.01
        })

      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        await supabase.from('coverage_sources').update({
          last_run_at: new Date().toISOString(),
          last_run_status: 'failed',
          last_run_message: errMsg.substring(0, 500),
          consecutive_failures: (source.consecutive_failures || 0) + 1
        }).eq('id', source.id)

        results.push({
          source: source.name,
          status: 'failed',
          queries: 0,
          found: 0,
          inserted: 0,
          cost_estimate: 0,
          error: errMsg
        })
      }
    }

    return NextResponse.json({
      message: 'Manual Tavily scan complete',
      duration_ms: Date.now() - startTime,
      results
    })

  } catch (err) {
    return NextResponse.json(
      { error: 'Tavily scan failed', details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
