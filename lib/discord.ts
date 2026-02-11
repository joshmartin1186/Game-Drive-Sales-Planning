import { getServerSupabase } from '@/lib/supabase'

interface CoverageItemForDiscord {
  id: string
  title: string
  url: string
  territory: string
  coverage_type: string
  review_score: number | null
  monthly_unique_visitors: number
  outlet_name: string
  outlet_tier: string
  game_name: string
  client_id: string
  game_id: string | null
}

const TIER_ORDER: Record<string, number> = { A: 1, B: 2, C: 3, D: 4, untiered: 5 }
const TIER_COLORS: Record<string, number> = {
  A: 0x22c55e,  // green
  B: 0x3b82f6,  // blue
  C: 0xf59e0b,  // amber
  D: 0x6b7280,  // gray
}

export async function sendDiscordNotification(item: CoverageItemForDiscord): Promise<void> {
  const supabase = getServerSupabase()

  // Fetch active webhooks for this client (and optionally game)
  let query = supabase
    .from('discord_webhooks')
    .select('*')
    .eq('client_id', item.client_id)
    .eq('is_active', true)

  const { data: webhooks } = await query

  if (!webhooks || webhooks.length === 0) return

  for (const webhook of webhooks) {
    // Filter by game if webhook is game-specific
    if (webhook.game_id && webhook.game_id !== item.game_id) continue

    // Check tier threshold
    const itemTierOrder = TIER_ORDER[item.outlet_tier] || 5
    const minTierOrder = TIER_ORDER[webhook.min_tier] || 2
    if (itemTierOrder > minTierOrder) continue

    // Check coverage type filter
    if (webhook.coverage_types && webhook.coverage_types.length > 0) {
      if (!webhook.coverage_types.includes(item.coverage_type)) continue
    }

    // Build Discord embed
    const embed: Record<string, unknown> = {
      title: item.title || 'New Coverage',
      url: item.url || undefined,
      color: TIER_COLORS[item.outlet_tier] || 0x6b7280,
      fields: [
        {
          name: 'Outlet',
          value: `${item.outlet_name} (Tier ${item.outlet_tier})`,
          inline: true,
        },
        {
          name: 'Type',
          value: item.coverage_type || 'article',
          inline: true,
        },
        {
          name: 'Territory',
          value: item.territory || 'Unknown',
          inline: true,
        },
      ],
      footer: {
        text: `GameDrive Coverage Tracker`,
      },
      timestamp: new Date().toISOString(),
    }

    if (item.monthly_unique_visitors > 0) {
      (embed.fields as Record<string, unknown>[]).push({
        name: 'Monthly Visitors',
        value: new Intl.NumberFormat('en-US').format(item.monthly_unique_visitors),
        inline: true,
      })
    }

    if (item.review_score != null) {
      (embed.fields as Record<string, unknown>[]).push({
        name: 'Review Score',
        value: `${item.review_score}/10`,
        inline: true,
      })
    }

    const payload = {
      content: `New Coverage: **${item.game_name}**`,
      embeds: [embed],
    }

    try {
      await fetch(webhook.webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    } catch (err) {
      console.error(`Discord webhook error for ${webhook.id}:`, err)
    }
  }
}
