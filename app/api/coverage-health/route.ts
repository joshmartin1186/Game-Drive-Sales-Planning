import { NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

interface GameHealthEntry {
  game_id: string
  game_name: string
  client_name: string
  total_items: number
  approved_items: number
  pending_items: number
  rejected_items: number
  unique_outlets: number
  items_this_week: number
  items_last_week: number
  last_discovery_date: string | null
  source_diversity: Record<string, number>
  has_tavily_source: boolean
  staleness: 'active' | 'recent' | 'stale' | 'dormant'
}

export async function GET() {
  try {
    const supabase = getServerSupabase()

    // Query 1: Get all games with client info
    const { data: games, error: gamesError } = await supabase
      .from('games')
      .select('id, name, client_id, clients(name)')
      .eq('pr_tracking_enabled', true)
      .order('name')

    if (gamesError) {
      return NextResponse.json({ error: gamesError.message }, { status: 500 })
    }

    if (!games || games.length === 0) {
      return NextResponse.json({
        games: [],
        summary: {
          total_games: 0,
          total_items_this_week: 0,
          games_needing_attention: 0,
          avg_items_per_game: 0,
        },
      })
    }

    const gameIds = games.map((g) => g.id)

    // Date boundaries
    const now = new Date()
    const sevenDaysAgo = new Date(now)
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const fourteenDaysAgo = new Date(now)
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)
    const threeDaysAgo = new Date(now)
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
    const thirtyDaysAgo = new Date(now)
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const sevenDaysAgoStr = sevenDaysAgo.toISOString()
    const fourteenDaysAgoStr = fourteenDaysAgo.toISOString()

    // Query 2: All coverage items for these games (only approved + pending for main counts)
    const { data: allItems, error: itemsError } = await supabase
      .from('coverage_items')
      .select('id, game_id, outlet_id, approval_status, source_type, publish_date, discovered_at')
      .in('game_id', gameIds)

    if (itemsError) {
      return NextResponse.json({ error: itemsError.message }, { status: 500 })
    }

    // Query 3: Check which games have active Tavily sources
    const { data: tavilySources } = await supabase
      .from('coverage_sources')
      .select('game_id')
      .eq('source_type', 'tavily')
      .eq('is_active', true)

    const tavilyGameIds = new Set((tavilySources || []).map((s) => s.game_id))

    // Build per-game metrics
    const itemsByGame = new Map<string, typeof allItems>()
    for (const item of allItems || []) {
      if (!item.game_id) continue
      if (!itemsByGame.has(item.game_id)) {
        itemsByGame.set(item.game_id, [])
      }
      itemsByGame.get(item.game_id)!.push(item)
    }

    const gameHealth: GameHealthEntry[] = games.map((game) => {
      const items = itemsByGame.get(game.id) || []
      const clientData = game.clients as unknown as { name: string } | null

      // Counts by approval status
      const approved = items.filter(
        (i) => i.approval_status === 'auto_approved' || i.approval_status === 'manually_approved'
      ).length
      const pending = items.filter((i) => i.approval_status === 'pending_review').length
      const rejected = items.filter((i) => i.approval_status === 'rejected').length
      const total = approved + pending // total = approved + pending (excluding rejected)

      // Unique outlets
      const outletIds = new Set(items.filter((i) => i.outlet_id).map((i) => i.outlet_id))

      // Items this week / last week (by publish_date)
      const thisWeek = items.filter((i) => {
        const d = i.publish_date || i.discovered_at
        return d && d >= sevenDaysAgoStr
      }).length

      const lastWeek = items.filter((i) => {
        const d = i.publish_date || i.discovered_at
        return d && d >= fourteenDaysAgoStr && d < sevenDaysAgoStr
      }).length

      // Last discovery date
      const discoveryDates = items
        .map((i) => i.discovered_at)
        .filter(Boolean)
        .sort()
        .reverse()
      const lastDiscovery = discoveryDates[0] || null

      // Source diversity
      const sourceCounts: Record<string, number> = {}
      const sourceTypes = [
        'tavily', 'rss', 'google_news', 'youtube', 'reddit',
        'twitter', 'tiktok', 'instagram', 'twitch', 'manual',
      ]
      for (const st of sourceTypes) {
        sourceCounts[st] = 0
      }
      for (const item of items) {
        if (item.source_type && sourceCounts[item.source_type] !== undefined) {
          sourceCounts[item.source_type]++
        } else if (item.source_type) {
          // Handle unknown source types gracefully
          sourceCounts[item.source_type] = (sourceCounts[item.source_type] || 0) + 1
        }
      }

      // Staleness
      let staleness: 'active' | 'recent' | 'stale' | 'dormant' = 'dormant'
      if (lastDiscovery) {
        const lastDate = new Date(lastDiscovery)
        if (lastDate >= threeDaysAgo) staleness = 'active'
        else if (lastDate >= sevenDaysAgo) staleness = 'recent'
        else if (lastDate >= thirtyDaysAgo) staleness = 'stale'
      }

      return {
        game_id: game.id,
        game_name: game.name,
        client_name: clientData?.name || 'Unknown',
        total_items: total,
        approved_items: approved,
        pending_items: pending,
        rejected_items: rejected,
        unique_outlets: outletIds.size,
        items_this_week: thisWeek,
        items_last_week: lastWeek,
        last_discovery_date: lastDiscovery,
        source_diversity: sourceCounts,
        has_tavily_source: tavilyGameIds.has(game.id),
        staleness,
      }
    })

    // Sort: games needing attention first (dormant/stale), then by name
    gameHealth.sort((a, b) => {
      const stalenessOrder = { dormant: 0, stale: 1, recent: 2, active: 3 }
      const diff = stalenessOrder[a.staleness] - stalenessOrder[b.staleness]
      if (diff !== 0) return diff
      return a.game_name.localeCompare(b.game_name)
    })

    // Summary
    const totalItemsThisWeek = gameHealth.reduce((sum, g) => sum + g.items_this_week, 0)
    const gamesNeedingAttention = gameHealth.filter(
      (g) => g.staleness === 'dormant' || g.staleness === 'stale' || !g.has_tavily_source
    ).length
    const totalAllItems = gameHealth.reduce((sum, g) => sum + g.total_items, 0)
    const avgItems = games.length > 0 ? Math.round(totalAllItems / games.length) : 0

    return NextResponse.json({
      games: gameHealth,
      summary: {
        total_games: games.length,
        total_items_this_week: totalItemsThisWeek,
        games_needing_attention: gamesNeedingAttention,
        avg_items_per_game: avgItems,
      },
    })
  } catch (err) {
    console.error('Coverage health error:', err)
    return NextResponse.json(
      { error: 'Failed to compute coverage health' },
      { status: 500 }
    )
  }
}
