import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { GoogleGenAI } from '@google/genai'
import { sendDiscordNotification } from '@/lib/discord'

function getSupabase() {
  return getServerSupabase()
}

const COVERAGE_TYPES = [
  'news', 'review', 'preview', 'interview', 'trailer', 'stream',
  'video', 'guide', 'round-up', 'mention', 'feature', 'article'
]

const SENTIMENT_VALUES = ['positive', 'negative', 'neutral', 'mixed']

// GET /api/cron/coverage-enrich — Process unscored coverage items
export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabase()

  try {
    // Get Gemini API key
    const { data: geminiKey } = await supabase
      .from('service_api_keys')
      .select('api_key')
      .eq('service_name', 'gemini')
      .eq('is_active', true)
      .single()

    if (!geminiKey?.api_key) {
      return NextResponse.json({ message: 'Gemini API key not configured, skipping enrichment' })
    }

    const ai = new GoogleGenAI({ apiKey: geminiKey.api_key })

    // Fetch unscored items (max 30 per cron run to stay within limits)
    const { data: items, error } = await supabase
      .from('coverage_items')
      .select(`
        id, title, url, territory, coverage_type, quotes, sentiment,
        relevance_score, review_score, monthly_unique_visitors,
        client_id, game_id, approval_status,
        outlet:outlets(id, name, domain, tier, monthly_unique_visitors)
      `)
      .is('relevance_score', null)
      .order('discovered_at', { ascending: false })
      .limit(30)

    if (error) throw error
    if (!items || items.length === 0) {
      return NextResponse.json({ message: 'No items to enrich', enriched: 0 })
    }

    // Collect keyword context per client/game
    const clientGamePairs = new Set<string>()
    for (const item of items) {
      clientGamePairs.add(`${item.client_id}|${item.game_id || ''}`)
    }

    const keywordMap: Record<string, string[]> = {}
    const gameNameMap: Record<string, string> = {}

    for (const pair of Array.from(clientGamePairs)) {
      const [clientId, gameId] = pair.split('|')

      let kwQuery = supabase
        .from('coverage_keywords')
        .select('keyword')
        .eq('client_id', clientId)
        .eq('is_active', true)

      if (gameId) kwQuery = kwQuery.eq('game_id', gameId)

      const { data: kwData } = await kwQuery
      keywordMap[pair] = (kwData || []).map(k => (k as Record<string, string>).keyword)

      if (gameId) {
        const { data: gameData } = await supabase
          .from('games')
          .select('name')
          .eq('id', gameId)
          .single()
        gameNameMap[pair] = (gameData as Record<string, string>)?.name || ''
      }
    }

    // Process items
    let enriched = 0
    let errors = 0

    for (const item of items) {
      try {
        const pair = `${item.client_id}|${item.game_id || ''}`
        const keywords = keywordMap[pair] || []
        const gameName = gameNameMap[pair] || ''
        const outlet = item.outlet as unknown as Record<string, unknown> | null
        const outletName = String(outlet?.name || outlet?.domain || 'Unknown')

        const prompt = `You are a PR coverage analyst for a video game publishing company. Analyze this coverage item.

GAME CONTEXT:
- Keywords: ${keywords.join(', ')}
- Game: ${gameName || 'Not specified'}

COVERAGE ITEM:
- Title: "${item.title || ''}"
- URL: ${item.url || ''}
- Outlet: ${outletName}
- Territory: ${item.territory || 'Unknown'}
- Quotes/Notes: ${item.quotes || 'None'}

Provide:
1. RELEVANCE SCORE (0-100): 80+ = clearly about the game, 50-79 = likely related, <50 = not relevant
2. REASONING: Brief 1-sentence explanation
3. COVERAGE TYPE: One of: ${COVERAGE_TYPES.join(', ')}
4. SENTIMENT: One of: ${SENTIMENT_VALUES.join(', ')}

Respond with ONLY valid JSON:
{"relevance_score": <number>, "relevance_reasoning": "<string>", "suggested_type": "<string>", "sentiment": "<string>"}`

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash-lite',
          contents: prompt,
          config: { responseMimeType: 'application/json' },
        })

        const parsed = JSON.parse(response.text || '{}')
        const score = Math.max(0, Math.min(100, Number(parsed.relevance_score) || 0))
        const suggestedType = COVERAGE_TYPES.includes(parsed.suggested_type) ? parsed.suggested_type : 'article'
        const sentiment = SENTIMENT_VALUES.includes(parsed.sentiment) ? parsed.sentiment : 'neutral'

        // Determine approval
        let approvalStatus: string | undefined
        if (!['auto_approved', 'manually_approved', 'rejected'].includes(String(item.approval_status))) {
          if (score >= 80) approvalStatus = 'auto_approved'
          else if (score < 50) approvalStatus = 'rejected'
          else approvalStatus = 'pending_review'
        }

        const updates: Record<string, unknown> = {
          relevance_score: score,
          relevance_reasoning: String(parsed.relevance_reasoning || ''),
          sentiment,
          updated_at: new Date().toISOString(),
        }

        if (!item.coverage_type || item.coverage_type === 'article') {
          updates.coverage_type = suggestedType
        }

        if (approvalStatus) {
          updates.approval_status = approvalStatus
          if (approvalStatus === 'auto_approved') {
            updates.approved_at = new Date().toISOString()
          }
        }

        await supabase.from('coverage_items').update(updates).eq('id', item.id)

        // Send Discord notification for newly auto-approved items
        if (approvalStatus === 'auto_approved') {
          try {
            await sendDiscordNotification({
              id: item.id,
              title: item.title || '',
              url: item.url || '',
              territory: item.territory || '',
              coverage_type: (updates.coverage_type as string) || item.coverage_type || 'article',
              review_score: item.review_score as number | null,
              monthly_unique_visitors: Number(outlet?.monthly_unique_visitors || 0),
              outlet_name: outletName,
              outlet_tier: String(outlet?.tier || 'untiered'),
              game_name: gameName,
              client_id: item.client_id,
              game_id: item.game_id,
            })
          } catch (discordErr) {
            console.error(`Discord notification error for item ${item.id}:`, discordErr)
          }
        }

        enriched++
      } catch (err) {
        console.error(`Enrichment error for item ${item.id}:`, err)
        errors++
      }
    }

    return NextResponse.json({
      message: `Enrichment complete: ${enriched} scored, ${errors} errors`,
      enriched,
      errors,
      total: items.length,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Coverage enrich cron error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
