import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'

function getSupabase() {
  return getServerSupabase()
}

// Apify Twitter/X scraper actor
const APIFY_TWITTER_ACTOR = 'apidojo/tweet-scraper'

// GET /api/cron/twitter-scan — Scan Twitter/X for game mentions via Apify
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
        // Run Apify Twitter scraper actor synchronously
        const actorRes = await fetch(
          `https://api.apify.com/v2/acts/${APIFY_TWITTER_ACTOR}/run-sync-get-dataset-items?token=${apifyKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              searchTerms: [term.query],
              maxTweets: 20,
              sort: 'Latest',
            }),
          }
        )

        if (!actorRes.ok) {
          console.error(`Apify Twitter actor error for "${term.query}": ${actorRes.status}`)
          continue
        }

        const tweets = await actorRes.json()
        if (!Array.isArray(tweets)) continue

        totalFound += tweets.length

        for (const tweet of tweets) {
          const tweetId = tweet.id || tweet.id_str || tweet.tweetId || null
          const url = tweet.url || tweet.tweetUrl || (tweetId ? `https://x.com/i/status/${tweetId}` : null)
          if (!url) continue

          // Check for existing
          const { data: existing } = await supabase
            .from('coverage_items')
            .select('id')
            .eq('url', url)
            .eq('client_id', term.clientId)
            .limit(1)

          if (existing && existing.length > 0) continue

          const authorName = tweet.author?.name || tweet.user?.name || tweet.userName || 'Unknown'
          const authorHandle = tweet.author?.userName || tweet.user?.screen_name || tweet.userScreenName || ''
          const followers = Number(tweet.author?.followers || tweet.user?.followers_count || tweet.followersCount || 0)
          const publishDate = tweet.createdAt || tweet.created_at
            ? new Date(tweet.createdAt || tweet.created_at).toISOString().split('T')[0]
            : null

          // Find or create outlet for author
          const authorDomain = `x.com/${authorHandle || authorName.toLowerCase().replace(/\s+/g, '')}`
          let outletId: string | null = null

          const { data: existingOutlet } = await supabase
            .from('outlets')
            .select('id')
            .eq('domain', authorDomain)
            .limit(1)

          if (existingOutlet && existingOutlet.length > 0) {
            outletId = existingOutlet[0].id
          } else {
            const { data: newOutlet } = await supabase
              .from('outlets')
              .insert({
                name: authorName,
                domain: authorDomain,
                monthly_unique_visitors: followers,
                tier: followers >= 1000000 ? 'A' : followers >= 100000 ? 'B' : followers >= 10000 ? 'C' : 'D',
                is_active: true,
              })
              .select('id')
              .single()
            if (newOutlet) outletId = newOutlet.id
          }

          const tweetText = tweet.text || tweet.full_text || tweet.content || ''

          await supabase.from('coverage_items').insert({
            client_id: term.clientId,
            game_id: term.gameId,
            outlet_id: outletId,
            title: tweetText.length > 200 ? tweetText.substring(0, 200) + '...' : tweetText || 'Tweet',
            url,
            publish_date: publishDate,
            coverage_type: 'mention',
            monthly_unique_visitors: followers,
            territory: tweet.lang || tweet.language || null,
            source_type: 'twitter',
            source_metadata: {
              tweet_id: tweetId, author_name: authorName, author_handle: authorHandle,
              followers, retweets: tweet.retweetCount || tweet.retweet_count || 0,
              likes: tweet.likeCount || tweet.favorite_count || 0,
              replies: tweet.replyCount || tweet.reply_count || 0,
              impressions: tweet.viewCount || tweet.impressions || 0,
            },
            approval_status: 'pending_review',
            discovered_at: new Date().toISOString(),
          })

          totalNew++
        }
      } catch (err) {
        console.error(`Twitter Apify scan error for "${term.query}":`, err)
      }
    }

    return NextResponse.json({
      message: `Twitter scan complete: ${totalFound} found, ${totalNew} new`,
      found: totalFound,
      new_items: totalNew,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Twitter scan error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
