import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'

function getSupabase() {
  return getServerSupabase()
}

// GET /api/dashboard — Dashboard metrics for a client
export async function GET(request: NextRequest) {
  const supabase = getSupabase()
  const { searchParams } = new URL(request.url)
  const clientId = searchParams.get('client_id')

  if (!clientId) {
    return NextResponse.json({ error: 'client_id is required' }, { status: 400 })
  }

  try {
    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)
    const fmt = (d: Date) => d.toISOString().split('T')[0]

    // --- Sales metrics (last 30 days vs prior 30 days) ---
    const salesCols = 'date,product_name,platform,net_units_sold,net_steam_sales_usd'

    // Last 30 days
    let currentSales: Record<string, unknown>[] = []
    let offset = 0
    while (true) {
      const { data } = await supabase
        .from('unified_performance_view')
        .select(salesCols)
        .eq('client_id', clientId)
        .gte('date', fmt(thirtyDaysAgo))
        .lte('date', fmt(now))
        .range(offset, offset + 999)
      if (!data || data.length === 0) break
      currentSales = currentSales.concat(data)
      if (data.length < 1000) break
      offset += 1000
    }

    // Prior 30 days (for comparison)
    let priorSales: Record<string, unknown>[] = []
    offset = 0
    while (true) {
      const { data } = await supabase
        .from('unified_performance_view')
        .select(salesCols)
        .eq('client_id', clientId)
        .gte('date', fmt(sixtyDaysAgo))
        .lt('date', fmt(thirtyDaysAgo))
        .range(offset, offset + 999)
      if (!data || data.length === 0) break
      priorSales = priorSales.concat(data)
      if (data.length < 1000) break
      offset += 1000
    }

    // Compute sales summaries
    const sumSales = (rows: Record<string, unknown>[]) => {
      let revenue = 0, units = 0
      const byProduct: Record<string, number> = {}
      const byPlatform: Record<string, number> = {}
      const byDate: Record<string, number> = {}

      for (const row of rows) {
        const r = row as Record<string, unknown>
        const rev = Number(r.net_steam_sales_usd || 0)
        const u = Number(r.net_units_sold || 0)
        revenue += rev
        units += u

        const product = String(r.product_name || 'Unknown')
        byProduct[product] = (byProduct[product] || 0) + rev

        const platform = String(r.platform || 'Unknown')
        byPlatform[platform] = (byPlatform[platform] || 0) + rev

        const date = String(r.date || '')
        if (date) byDate[date] = (byDate[date] || 0) + rev
      }

      return { revenue, units, byProduct, byPlatform, byDate }
    }

    const current = sumSales(currentSales)
    const prior = sumSales(priorSales)

    // Revenue trend (daily for last 30 days)
    const revenueTrend = Object.entries(current.byDate)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, value]) => ({ date, value }))

    // Top products by revenue
    const topProducts = Object.entries(current.byProduct)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, value]) => ({ name, value }))

    // Revenue by platform
    const platformBreakdown = Object.entries(current.byPlatform)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }))

    // --- Coverage metrics ---
    const { data: covItems } = await supabase
      .from('coverage_items')
      .select('id, title, url, publish_date, coverage_type, monthly_unique_visitors, review_score, outlet:outlets(name, tier)')
      .eq('client_id', clientId)
      .in('approval_status', ['auto_approved', 'manually_approved'])
      .gte('publish_date', fmt(thirtyDaysAgo))
      .order('publish_date', { ascending: false })
      .limit(200)

    const coverage = covItems || []
    let covReach = 0
    let covReviewSum = 0
    let covReviewCount = 0
    const covByTier: Record<string, number> = {}

    for (const item of coverage) {
      const i = item as Record<string, unknown>
      covReach += Number(i.monthly_unique_visitors || 0)
      if (i.review_score) { covReviewSum += Number(i.review_score); covReviewCount++ }
      const outlet = i.outlet as Record<string, unknown> | null
      const tier = String(outlet?.tier || 'D')
      covByTier[tier] = (covByTier[tier] || 0) + 1
    }

    // --- Games count ---
    const { data: gamesData } = await supabase
      .from('games')
      .select('id, name')
      .eq('client_id', clientId)

    // --- Client info ---
    const { data: clientData } = await supabase
      .from('clients')
      .select('id, name')
      .eq('id', clientId)
      .single()

    return NextResponse.json({
      client: clientData,
      games: gamesData || [],
      sales: {
        current_revenue: current.revenue,
        prior_revenue: prior.revenue,
        revenue_change: prior.revenue > 0 ? ((current.revenue - prior.revenue) / prior.revenue * 100) : 0,
        current_units: current.units,
        prior_units: prior.units,
        units_change: prior.units > 0 ? ((current.units - prior.units) / prior.units * 100) : 0,
        top_products: topProducts,
        platform_breakdown: platformBreakdown,
        revenue_trend: revenueTrend,
      },
      coverage: {
        total_pieces: coverage.length,
        audience_reach: covReach,
        avg_review_score: covReviewCount > 0 ? Math.round((covReviewSum / covReviewCount) * 10) / 10 : null,
        tier_breakdown: Object.entries(covByTier).sort((a, b) => a[0].localeCompare(b[0])).map(([name, value]) => ({ name, value })),
        recent_items: coverage.slice(0, 5),
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
