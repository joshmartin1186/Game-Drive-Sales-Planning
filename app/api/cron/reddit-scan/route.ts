import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'

function getSupabase() {
  return getServerSupabase()
}

const DEFAULT_SUBREDDITS = [
  'gaming', 'pcgaming', 'Steam', 'NintendoSwitch', 'PS5',
  'XboxSeriesX', 'indiegaming', 'Games',
]

async function getRedditToken(clientId: string, clientSecret: string, refreshToken: string | null): Promise<string | null> {
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const body = refreshToken
    ? `grant_type=refresh_token&refresh_token=${refreshToken}`
    : 'grant_type=client_credentials'

  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'GameDrive/1.0',
    },
    body,
  })

  if (!res.ok) return null
  const data = await res.json()
  return data.access_token || null
}

// GET /api/cron/reddit-scan — Scan Reddit for game mentions
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabase()

  try {
    // Get Reddit credentials
    const { data: keyData } = await supabase
      .from('service_api_keys')
      .select('client_id_value, client_secret, refresh_token')
      .eq('service_name', 'reddit')
      .eq('is_active', true)
      .single()

    if (!keyData?.client_id_value || !keyData?.client_secret) {
      return NextResponse.json({ message: 'Reddit credentials not configured, skipping' })
    }

    const token = await getRedditToken(keyData.client_id_value, keyData.client_secret, keyData.refresh_token)
    if (!token) {
      return NextResponse.json({ error: 'Failed to get Reddit OAuth token' }, { status: 500 })
    }

    const headers = {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'GameDrive/1.0',
    }

    // Get keywords
    const { data: keywords } = await supabase
      .from('coverage_keywords')
      .select('keyword, client_id, game_id')
      .eq('is_active', true)
      .eq('is_blacklist', false)

    if (!keywords || keywords.length === 0) {
      return NextResponse.json({ message: 'No keywords configured' })
    }

    // Group by client+game
    const searchTerms: { query: string; clientId: string; gameId: string | null }[] = []
    const seen = new Set<string>()
    for (const kw of keywords) {
      const key = `${kw.client_id}|${kw.game_id || ''}`
      if (!seen.has(key)) {
        seen.add(key)
        searchTerms.push({ query: kw.keyword, clientId: kw.client_id, gameId: kw.game_id })
      }
    }

    let totalFound = 0
    let totalNew = 0

    for (const term of searchTerms) {
      // Search across default gaming subreddits
      for (const subreddit of DEFAULT_SUBREDDITS) {
        try {
          const searchUrl = `https://oauth.reddit.com/r/${subreddit}/search?q=${encodeURIComponent(term.query)}&sort=new&restrict_sr=on&limit=10&t=week`
          const res = await fetch(searchUrl, { headers })

          if (!res.ok) continue
          const data = await res.json()
          const posts = data?.data?.children || []

          totalFound += posts.length

          for (const post of posts) {
            const p = post.data
            if (!p) continue

            const url = `https://www.reddit.com${p.permalink}`

            // Check for existing
            const { data: existing } = await supabase
              .from('coverage_items')
              .select('id')
              .eq('url', url)
              .eq('client_id', term.clientId)
              .limit(1)

            if (existing && existing.length > 0) continue

            const publishDate = p.created_utc
              ? new Date(p.created_utc * 1000).toISOString().split('T')[0]
              : null

            // Find or create outlet for subreddit
            const subredditDomain = `reddit.com/r/${subreddit}`
            let outletId: string | null = null

            const { data: existingOutlet } = await supabase
              .from('outlets')
              .select('id')
              .eq('domain', subredditDomain)
              .limit(1)

            if (existingOutlet && existingOutlet.length > 0) {
              outletId = existingOutlet[0].id
            } else {
              const { data: newOutlet } = await supabase
                .from('outlets')
                .insert({
                  name: `r/${subreddit}`,
                  domain: subredditDomain,
                  tier: 'C',
                  is_active: true,
                })
                .select('id')
                .single()
              if (newOutlet) outletId = newOutlet.id
            }

            await supabase.from('coverage_items').insert({
              client_id: term.clientId,
              game_id: term.gameId,
              outlet_id: outletId,
              title: p.title || 'Untitled Post',
              url,
              publish_date: publishDate,
              coverage_type: 'mention',
              territory: null,
              source_type: 'reddit',
              source_metadata: {
                subreddit, author: p.author, score: p.score,
                num_comments: p.num_comments, upvote_ratio: p.upvote_ratio,
              },
              approval_status: 'pending_review',
              discovered_at: new Date().toISOString(),
            })

            totalNew++
          }

          // Respect rate limit (1 request per second)
          await new Promise(resolve => setTimeout(resolve, 1100))
        } catch (err) {
          console.error(`Reddit scan error for r/${subreddit} "${term.query}":`, err)
        }
      }
    }

    return NextResponse.json({
      message: `Reddit scan complete: ${totalFound} found, ${totalNew} new`,
      found: totalFound,
      new_items: totalNew,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Reddit scan error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
