import { NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

// ─── Helpers ────────────────────────────────────────────────────────────────

function suggestTier(monthlyVisitors: number | null): string | null {
  if (!monthlyVisitors) return null
  if (monthlyVisitors >= 10_000_000) return 'A'
  if (monthlyVisitors >= 1_000_000) return 'B'
  if (monthlyVisitors >= 100_000) return 'C'
  return 'D'
}

function parseTrafficFromHtml(html: string): number | null {
  // Hypestat shows monthly visits in various formats on the page
  // Look for patterns like "Monthly Visits: 1,234,567" or similar
  const patterns = [
    /Monthly\s+Visits?\s*[:\-]\s*([\d,]+)/i,
    /monthly\s+unique\s+visitors?\s*[:\-]\s*([\d,]+)/i,
    /Estimated\s+Monthly\s+Visits?\s*[:\-]\s*([\d,]+)/i,
    /<td[^>]*>Monthly\s+Visits?<\/td>\s*<td[^>]*>([\d,]+)/i,
    /data-monthly-visits="([\d,]+)"/i,
    /visitors?\s+per\s+month\s*[:\-]\s*([\d,]+)/i,
    /monthly_visits['":\s]+([\d,]+)/i,
    /([\d,]{4,})\s+monthly\s+visits?/i,
    /([\d,]{4,})\s+unique\s+visitors?\s+per\s+month/i,
  ]

  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match) {
      const num = parseInt(match[1].replace(/,/g, ''))
      if (!isNaN(num) && num > 0) return num
    }
  }

  // Try to find large numbers near "visit" keywords
  const visitSection = html.match(/visit[^<]{0,200}/gi)
  if (visitSection) {
    for (const section of visitSection) {
      const numMatch = section.match(/([\d,]{4,})/)
      if (numMatch) {
        const num = parseInt(numMatch[1].replace(/,/g, ''))
        if (!isNaN(num) && num > 100) return num
      }
    }
  }

  return null
}

async function fetchHypestatTraffic(domain: string): Promise<{ visitors: number | null; method: string; error?: string }> {
  // Method 1: Direct HTML fetch from hypestat.com
  try {
    const url = `https://hypestat.com/info/${domain}`
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GameDrive/1.0)',
        'Accept': 'text/html,application/xhtml+xml'
      },
      signal: AbortSignal.timeout(10000)
    })

    if (response.ok) {
      const html = await response.text()
      const visitors = parseTrafficFromHtml(html)
      if (visitors) {
        return { visitors, method: 'hypestat_html' }
      }
    }
  } catch (err) {
    console.log(`[Hypestat] Direct fetch failed for ${domain}:`, err instanceof Error ? err.message : String(err))
  }

  // Method 2: Tavily Extract as fallback
  try {
    const supabase = getServerSupabase()
    const { data: keyData } = await supabase
      .from('service_api_keys')
      .select('api_key')
      .eq('service_name', 'tavily')
      .single()

    if (keyData?.api_key) {
      const { tavily } = await import('@tavily/core')
      const tvly = tavily({ apiKey: keyData.api_key })

      const result = await tvly.extract([`https://hypestat.com/info/${domain}`])

      if (result.results && result.results.length > 0) {
        const content = result.results[0].rawContent || ''
        const visitors = parseTrafficFromHtml(content)
        if (visitors) {
          return { visitors, method: 'tavily_extract' }
        }
      }
    }
  } catch (err) {
    console.log(`[Hypestat] Tavily extract failed for ${domain}:`, err instanceof Error ? err.message : String(err))
  }

  // Method 3: Tavily Search as last resort
  try {
    const supabase = getServerSupabase()
    const { data: keyData } = await supabase
      .from('service_api_keys')
      .select('api_key')
      .eq('service_name', 'tavily')
      .single()

    if (keyData?.api_key) {
      const { tavily } = await import('@tavily/core')
      const tvly = tavily({ apiKey: keyData.api_key })

      const searchResult = await tvly.search(`${domain} monthly visitors traffic hypestat`, {
        maxResults: 3,
        searchDepth: 'basic' as const,
        includeDomains: ['hypestat.com']
      })

      for (const result of (searchResult.results || [])) {
        const content = `${result.title || ''} ${result.content || ''}`
        const visitors = parseTrafficFromHtml(content)
        if (visitors) {
          return { visitors, method: 'tavily_search' }
        }
      }
    }
  } catch (err) {
    console.log(`[Hypestat] Tavily search failed for ${domain}:`, err instanceof Error ? err.message : String(err))
  }

  return { visitors: null, method: 'none', error: 'Could not extract traffic data from any source' }
}

// ─── POST: Fetch traffic data for a specific outlet ─────────────────────────

export async function POST(request: Request) {
  const supabase = getServerSupabase()

  try {
    const body = await request.json()
    const outletId = body.outlet_id as string | undefined
    const domain = body.domain as string | undefined

    if (!outletId && !domain) {
      return NextResponse.json({ error: 'Provide outlet_id or domain' }, { status: 400 })
    }

    // If outlet_id provided, get the domain
    let targetDomain = domain
    let targetOutletId = outletId

    if (outletId && !domain) {
      const { data: outlet } = await supabase
        .from('outlets')
        .select('id, domain, name')
        .eq('id', outletId)
        .single()

      if (!outlet?.domain) {
        return NextResponse.json({ error: 'Outlet not found or has no domain' }, { status: 404 })
      }
      targetDomain = outlet.domain
    }

    if (!targetDomain) {
      return NextResponse.json({ error: 'No domain to look up' }, { status: 400 })
    }

    // Clean the domain
    targetDomain = targetDomain.replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/.*$/, '').trim()

    // Fetch traffic data
    const result = await fetchHypestatTraffic(targetDomain)

    // Update outlet if we have an ID and got results
    if (targetOutletId && result.visitors) {
      const newTier = suggestTier(result.visitors)
      await supabase
        .from('outlets')
        .update({
          monthly_unique_visitors: result.visitors,
          tier: newTier,
          traffic_last_updated: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', targetOutletId)
    }

    return NextResponse.json({
      domain: targetDomain,
      monthly_unique_visitors: result.visitors,
      suggested_tier: suggestTier(result.visitors),
      method: result.method,
      error: result.error || null,
      updated_outlet: !!targetOutletId && !!result.visitors
    })

  } catch (err) {
    return NextResponse.json(
      { error: 'Hypestat lookup failed', details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
