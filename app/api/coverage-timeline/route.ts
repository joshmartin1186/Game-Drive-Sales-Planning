import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'

function getSupabase() {
  return getServerSupabase()
}

// GET /api/coverage-timeline — Coverage items + sales events for timeline view
export async function GET(request: NextRequest) {
  const supabase = getSupabase()
  const { searchParams } = new URL(request.url)

  const clientId = searchParams.get('client_id')
  const gameId = searchParams.get('game_id')
  const dateFrom = searchParams.get('date_from')
  const dateTo = searchParams.get('date_to')

  try {
    // Fetch coverage items
    let covQuery = supabase
      .from('coverage_items')
      .select('id, title, url, publish_date, coverage_type, sentiment, monthly_unique_visitors, review_score, campaign_section, campaign_id, is_original, duplicate_group_id, outlet:outlets(id, name, tier, monthly_unique_visitors), game:games(id, name), campaign:coverage_campaigns(id, name)')
      .in('approval_status', ['auto_approved', 'manually_approved'])
      .order('publish_date', { ascending: true })
      .limit(2000)

    if (clientId) covQuery = covQuery.eq('client_id', clientId)
    if (gameId) covQuery = covQuery.eq('game_id', gameId)
    if (dateFrom) covQuery = covQuery.gte('publish_date', dateFrom)
    if (dateTo) covQuery = covQuery.lte('publish_date', dateTo)

    // Fetch sales events for overlay
    let salesQuery = supabase
      .from('sales')
      .select('id, start_date, end_date, sale_name, sale_type, status, discount_percentage, product:products(id, name, game:games(id, name, client_id)), platform:platforms(id, name)')
      .order('start_date', { ascending: true })

    if (dateFrom) salesQuery = salesQuery.gte('end_date', dateFrom)
    if (dateTo) salesQuery = salesQuery.lte('start_date', dateTo)

    // Fetch coverage campaigns for section grouping
    let campaignsQuery = supabase
      .from('coverage_campaigns')
      .select('id, name, start_date, end_date, client_id, game_id')

    if (clientId) campaignsQuery = campaignsQuery.eq('client_id', clientId)

    const [covResult, salesResult, campaignsResult] = await Promise.all([
      covQuery,
      salesQuery,
      campaignsQuery,
    ])

    if (covResult.error) throw covResult.error

    // Filter sales by client if needed (via product.game.client_id)
    let salesData = salesResult.data || []
    if (clientId) {
      salesData = salesData.filter((s: Record<string, unknown>) => {
        const product = s.product as { game?: { client_id?: string } } | null
        return product?.game?.client_id === clientId
      })
    }

    // Filter sales by game if needed
    if (gameId) {
      salesData = salesData.filter((s: Record<string, unknown>) => {
        const product = s.product as { game?: { id?: string } } | null
        return product?.game?.id === gameId
      })
    }

    return NextResponse.json({
      coverage: covResult.data || [],
      sales: salesData,
      campaigns: campaignsResult.data || [],
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
