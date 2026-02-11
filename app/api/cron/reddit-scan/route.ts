import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'

function getSupabase() {
  return getServerSupabase()
}

// Apify Reddit scraper actor
const APIFY_REDDIT_ACTOR = 'trudax/reddit-scraper-lite'

const DEFAULT_SUBREDDITS = [
  'gaming', 'pcgaming', 'Steam', 'NintendoSwitch', 'PS5',
  'XboxSeriesX', 'indiegaming', 'Games',
]

// GET /api/cron/reddit-scan — Scan Reddit for game mentions via Apify
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabase()

  try {
    // Get Apify API key
    const { data: keyData } = await supabase
      .from('service_api_keys')
      .select('api_key')
      .eq('service_name', 'apify')
      .eq('is_active', true)
      .single()

    if (!keyData?.api_key) {
      return NextResponse.json({ message: 'Apify API key not configured, skipping' })
    }

    const apifyKey = keyData.api_key

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
      try {
        // Build search URLs for each subreddit
        const searchUrls = DEFAULT_SUBREDDITS.map(
          sub => `https://www.reddit.com/r/${sub}/search.json?q=${encodeURIComponent(term.query)}&sort=new&restrict_sr=on&t=week&limit=10`
        )

        // Run Apify Reddit scraper actor synchronously
        const actorRes = await fetch(
          `https://api.apify.com/v2/acts/${APIFY_REDDIT_ACTOR}/run-sync-get-dataset-items?token=${apifyKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              startUrls: searchUrls.map(url => ({ url })),
              maxItems: 80,
              sort: 'new',
            }),
          }
        )

        if (!actorRes.ok) {
          console.error(`Apify Reddit actor error for "${term.query}": ${actorRes.status}`)
          continue
        }

        const posts = await actorRes.json()
        if (!Array.isArray(posts)) continue

        totalFound += posts.length

        for (const post of posts) {
          const permalink = post.permalink || post.url || null
          if (!permalink) continue

          const url = permalink.startsWith('http') ? permalink : `https://www.reddit.com${permalink}`

          // Check for existing
          const { data: existing } = await supabase
            .from('coverage_items')
            .select('id')
            .eq('url', url)
            .eq('client_id', term.clientId)
            .limit(1)

          if (existing && existing.length > 0) continue

          const publishDate = post.createdAt || post.created_utc
            ? new Date(post.createdAt || (post.created_utc ? post.created_utc * 1000 : Date.now())).toISOString().split('T')[0]
            : null

          const subreddit = post.subreddit || post.communityName || 'unknown'
          const subredditDomain = `reddit.com/r/${subreddit}`

          // Find or create outlet for subreddit
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
            title: post.title || 'Untitled Post',
            url,
            publish_date: publishDate,
            coverage_type: 'mention',
            territory: null,
            source_type: 'reddit',
            source_metadata: {
              subreddit, author: post.author || post.username,
              score: post.score || post.upVotes, num_comments: post.numberOfComments || post.numComments,
              upvote_ratio: post.upvoteRatio,
            },
            approval_status: 'pending_review',
            discovered_at: new Date().toISOString(),
          })

          totalNew++
        }
      } catch (err) {
        console.error(`Reddit Apify scan error for "${term.query}":`, err)
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
