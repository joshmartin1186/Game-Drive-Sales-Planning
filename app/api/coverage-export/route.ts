import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) throw new Error('Missing Supabase environment variables')
  return createClient(supabaseUrl, supabaseKey)
}

// GET - Fetch all coverage data for export (no pagination limit)
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabase()
    const { searchParams } = new URL(request.url)

    const clientId = searchParams.get('client_id')
    const gameId = searchParams.get('game_id')
    const dateFrom = searchParams.get('date_from')
    const dateTo = searchParams.get('date_to')
    const approvalStatus = searchParams.get('approval_status')
    const campaignId = searchParams.get('campaign_id')

    let query = supabase
      .from('coverage_items')
      .select('*, outlet:outlets(id, name, domain, tier, monthly_unique_visitors, country), game:games(id, name), client:clients(id, name), campaign:coverage_campaigns(id, name)')
      .order('publish_date', { ascending: false })
      .limit(5000)

    // Only show approved items by default for client reports
    if (approvalStatus) {
      if (approvalStatus === 'approved') {
        query = query.in('approval_status', ['auto_approved', 'manually_approved'])
      } else {
        query = query.eq('approval_status', approvalStatus)
      }
    } else {
      query = query.in('approval_status', ['auto_approved', 'manually_approved'])
    }

    if (clientId) query = query.eq('client_id', clientId)
    if (gameId) query = query.eq('game_id', gameId)
    if (dateFrom) query = query.gte('publish_date', dateFrom)
    if (dateTo) query = query.lte('publish_date', dateTo)
    if (campaignId) query = query.eq('campaign_id', campaignId)

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Also fetch campaigns for this client/game
    let campaignQuery = supabase
      .from('coverage_campaigns')
      .select('id, name, start_date, end_date')
      .order('start_date', { ascending: false })

    if (clientId) campaignQuery = campaignQuery.eq('client_id', clientId)
    if (gameId) campaignQuery = campaignQuery.eq('game_id', gameId)

    const { data: campaigns } = await campaignQuery

    // Compute summary stats
    const items = data || []
    const totalPieces = items.length
    const totalReach = items.reduce((sum: number, item: Record<string, unknown>) => {
      const outlet = item.outlet as { monthly_unique_visitors?: number | null } | null
      return sum + (outlet?.monthly_unique_visitors || (item.monthly_unique_visitors as number) || 0)
    }, 0)
    const reviewItems = items.filter((item: Record<string, unknown>) => item.coverage_type === 'review' && item.review_score)
    const avgReviewScore = reviewItems.length > 0
      ? reviewItems.reduce((sum: number, item: Record<string, unknown>) => sum + Number(item.review_score), 0) / reviewItems.length
      : null

    // Tier breakdown
    const tierBreakdown: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, untiered: 0 }
    for (const item of items) {
      const outlet = item.outlet as { tier?: string } | null
      const tier = outlet?.tier
      if (tier && tier in tierBreakdown) {
        tierBreakdown[tier]++
      } else {
        tierBreakdown.untiered++
      }
    }

    // Type breakdown
    const typeBreakdown: Record<string, number> = {}
    for (const item of items) {
      const type = (item.coverage_type as string) || 'unknown'
      typeBreakdown[type] = (typeBreakdown[type] || 0) + 1
    }

    // Territory breakdown
    const territoryBreakdown: Record<string, number> = {}
    for (const item of items) {
      const territory = (item.territory as string) || 'Unknown'
      territoryBreakdown[territory] = (territoryBreakdown[territory] || 0) + 1
    }

    return NextResponse.json({
      items,
      campaigns: campaigns || [],
      summary: {
        total_pieces: totalPieces,
        total_audience_reach: totalReach,
        estimated_views: Math.round(totalReach * 0.02), // ~2% CTR estimate
        avg_review_score: avgReviewScore,
        review_count: reviewItems.length,
        tier_breakdown: tierBreakdown,
        type_breakdown: typeBreakdown,
        territory_breakdown: territoryBreakdown
      }
    })
  } catch (err) {
    return NextResponse.json({ error: 'Export data fetch failed', details: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
