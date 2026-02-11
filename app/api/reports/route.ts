import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'

function getSupabase() {
  return getServerSupabase()
}

// GET /api/reports — Fetch combined sales + coverage data for a client report
export async function GET(request: NextRequest) {
  const supabase = getSupabase()
  const { searchParams } = new URL(request.url)

  const clientId = searchParams.get('client_id')
  const gameId = searchParams.get('game_id')
  const dateFrom = searchParams.get('date_from')
  const dateTo = searchParams.get('date_to')
  const section = searchParams.get('section') // 'summary' | 'sales' | 'pr_coverage'

  if (!clientId) {
    return NextResponse.json({ error: 'client_id is required' }, { status: 400 })
  }

  try {
    const result: Record<string, unknown> = {}

    // --- Sales data (from unified_performance_view) ---
    if (!section || section === 'summary' || section === 'sales') {
      const columns = 'date,product_name,platform,country_code,country,region,gross_units_sold,chargebacks_returns,net_units_sold,base_price_usd,sale_price_usd,net_steam_sales_usd'

      let allSalesRows: Record<string, unknown>[] = []
      let offset = 0
      const batchSize = 1000

      while (true) {
        let query = supabase
          .from('unified_performance_view')
          .select(columns)
          .eq('client_id', clientId)
          .order('date', { ascending: true })
          .range(offset, offset + batchSize - 1)

        if (dateFrom) query = query.gte('date', dateFrom)
        if (dateTo) query = query.lte('date', dateTo)

        const { data, error } = await query
        if (error) throw error
        if (!data || data.length === 0) break

        allSalesRows = allSalesRows.concat(data)
        if (data.length < batchSize) break
        offset += batchSize
      }

      // Compute sales summary
      let totalGrossRevenue = 0
      let totalNetRevenue = 0
      let totalGrossUnits = 0
      let totalNetUnits = 0
      const platformRevenue: Record<string, number> = {}
      const platformUnits: Record<string, number> = {}
      const countryRevenue: Record<string, number> = {}
      const productRevenue: Record<string, number> = {}
      const productUnits: Record<string, number> = {}
      const dailyRevenue: Record<string, number> = {}

      for (const row of allSalesRows) {
        const r = row as Record<string, unknown>
        const grossRev = Number(r.net_steam_sales_usd || 0)
        const netRev = Number(r.net_steam_sales_usd || 0)
        const grossUnits = Number(r.gross_units_sold || 0)
        const netUnits = Number(r.net_units_sold || 0)
        const platform = String(r.platform || 'Unknown')
        const country = String(r.country_code || r.country || 'Unknown')
        const product = String(r.product_name || 'Unknown')
        const date = String(r.date || '')

        totalGrossRevenue += grossRev
        totalNetRevenue += netRev
        totalGrossUnits += grossUnits
        totalNetUnits += netUnits

        platformRevenue[platform] = (platformRevenue[platform] || 0) + netRev
        platformUnits[platform] = (platformUnits[platform] || 0) + netUnits
        countryRevenue[country] = (countryRevenue[country] || 0) + netRev
        productRevenue[product] = (productRevenue[product] || 0) + netRev
        productUnits[product] = (productUnits[product] || 0) + netUnits

        if (date) {
          dailyRevenue[date] = (dailyRevenue[date] || 0) + netRev
        }
      }

      // Sort breakdowns by value descending
      const sortObj = (obj: Record<string, number>) =>
        Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([key, value]) => ({ name: key, value }))

      result.sales = {
        total_rows: allSalesRows.length,
        total_gross_revenue: totalGrossRevenue,
        total_net_revenue: totalNetRevenue,
        total_gross_units: totalGrossUnits,
        total_net_units: totalNetUnits,
        avg_price: totalNetUnits > 0 ? totalNetRevenue / totalNetUnits : 0,
        platform_revenue: sortObj(platformRevenue),
        platform_units: sortObj(platformUnits),
        country_revenue: sortObj(countryRevenue).slice(0, 20),
        product_revenue: sortObj(productRevenue),
        product_units: sortObj(productUnits),
        daily_revenue: Object.entries(dailyRevenue)
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([date, value]) => ({ date, value })),
        raw_rows: section === 'sales' ? allSalesRows : undefined,
      }
    }

    // --- Coverage data ---
    if (!section || section === 'summary' || section === 'pr_coverage') {
      let covQuery = supabase
        .from('coverage_items')
        .select(`
          id, title, url, publish_date, territory, coverage_type,
          monthly_unique_visitors, review_score, quotes, sentiment,
          approval_status, campaign_section, discovered_at,
          outlet:outlets(id, name, domain, tier, monthly_unique_visitors),
          game:games(id, name),
          campaign:coverage_campaigns(id, name)
        `)
        .eq('client_id', clientId)
        .in('approval_status', ['auto_approved', 'manually_approved'])
        .order('publish_date', { ascending: false })

      if (gameId) covQuery = covQuery.eq('game_id', gameId)
      if (dateFrom) covQuery = covQuery.gte('publish_date', dateFrom)
      if (dateTo) covQuery = covQuery.lte('publish_date', dateTo)

      const { data: covData, error: covError } = await covQuery.limit(5000)
      if (covError) throw covError

      const items = covData || []
      let totalReach = 0
      let totalScoreSum = 0
      let scoredCount = 0
      const tierBreakdown: Record<string, number> = {}
      const typeBreakdown: Record<string, number> = {}
      const territoryBreakdown: Record<string, number> = {}
      const topOutlets: Record<string, { name: string; count: number; tier: string; visitors: number }> = {}

      for (const item of items) {
        const i = item as Record<string, unknown>
        const outlet = i.outlet as Record<string, unknown> | null
        const visitors = Number(outlet?.monthly_unique_visitors || i.monthly_unique_visitors || 0)
        totalReach += visitors

        if (i.review_score) {
          totalScoreSum += Number(i.review_score)
          scoredCount++
        }

        const tier = String(outlet?.tier || 'untiered')
        tierBreakdown[tier] = (tierBreakdown[tier] || 0) + 1

        const covType = String(i.coverage_type || 'article')
        typeBreakdown[covType] = (typeBreakdown[covType] || 0) + 1

        const territory = String(i.territory || 'Unknown')
        territoryBreakdown[territory] = (territoryBreakdown[territory] || 0) + 1

        if (outlet) {
          const outletId = String(outlet.id)
          if (!topOutlets[outletId]) {
            topOutlets[outletId] = {
              name: String(outlet.name || outlet.domain || 'Unknown'),
              count: 0,
              tier: String(outlet.tier || 'untiered'),
              visitors: Number(outlet.monthly_unique_visitors || 0),
            }
          }
          topOutlets[outletId].count++
        }
      }

      result.coverage = {
        total_pieces: items.length,
        total_audience_reach: totalReach,
        estimated_views: Math.round(totalReach * 0.02),
        avg_review_score: scoredCount > 0 ? Math.round((totalScoreSum / scoredCount) * 10) / 10 : null,
        tier_breakdown: Object.entries(tierBreakdown).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value })),
        type_breakdown: Object.entries(typeBreakdown).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value })),
        territory_breakdown: Object.entries(territoryBreakdown).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value })),
        top_outlets: Object.values(topOutlets).sort((a, b) => b.count - a.count).slice(0, 15),
        items: section === 'pr_coverage' ? items : items.slice(0, 50),
      }
    }

    // --- Annotations ---
    let annQuery = supabase
      .from('report_annotations')
      .select('*')
      .eq('client_id', clientId)

    if (gameId) annQuery = annQuery.eq('game_id', gameId)

    const { data: annotations } = await annQuery
    result.annotations = annotations || []

    // --- Client & game info ---
    const { data: clientData } = await supabase
      .from('clients')
      .select('id, name')
      .eq('id', clientId)
      .single()

    result.client = clientData

    if (gameId) {
      const { data: gameData } = await supabase
        .from('games')
        .select('id, name')
        .eq('id', gameId)
        .single()
      result.game = gameData
    }

    return NextResponse.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST /api/reports/annotations — Save/update an annotation
export async function POST(request: NextRequest) {
  const supabase = getSupabase()

  try {
    const body = await request.json()
    const { client_id, game_id, report_section, period_key, annotation_text, custom_fields } = body

    if (!client_id || !report_section || !period_key) {
      return NextResponse.json({ error: 'client_id, report_section, and period_key are required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('report_annotations')
      .upsert(
        {
          client_id,
          game_id: game_id || null,
          report_section,
          period_key,
          annotation_text: annotation_text || '',
          custom_fields: custom_fields || {},
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'client_id,report_section,period_key' }
      )
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
