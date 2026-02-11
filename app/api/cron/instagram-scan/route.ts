import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'

function getSupabase() {
  return getServerSupabase()
}

// Apify Instagram scraper actor
const APIFY_INSTAGRAM_ACTOR = 'apify/instagram-scraper'

// Minimum follower threshold for Instagram results
const MIN_FOLLOWERS = 1000

// GET /api/cron/instagram-scan — Scan Instagram for game-related content via Apify
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

    // Get keywords (used as hashtag searches)
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
    let totalFiltered = 0

    for (const term of searchTerms) {
      try {
        // Convert keyword to hashtag format (remove spaces, lowercase)
        const hashtag = term.query.replace(/\s+/g, '').toLowerCase()

        // Run Apify Instagram scraper actor synchronously
        const actorRes = await fetch(
          `https://api.apify.com/v2/acts/${APIFY_INSTAGRAM_ACTOR}/run-sync-get-dataset-items?token=${apifyKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              hashtags: [hashtag],
              resultsLimit: 20,
              searchType: 'hashtag',
            }),
          }
        )

        if (!actorRes.ok) {
          console.error(`Apify Instagram actor error for "${term.query}": ${actorRes.status}`)
          continue
        }

        const posts = await actorRes.json()
        if (!Array.isArray(posts)) continue

        totalFound += posts.length

        for (const post of posts) {
          const postUrl = post.url || post.displayUrl || (post.shortCode ? `https://www.instagram.com/p/${post.shortCode}/` : null)
          if (!postUrl) continue

          const authorName = post.ownerUsername || post.owner?.username || post.username || 'Unknown'
          const authorFullName = post.ownerFullName || post.owner?.fullName || authorName
          const followers = Number(post.ownerFollowerCount || post.owner?.followedBy?.count || 0)

          // Filter by minimum followers
          if (followers > 0 && followers < MIN_FOLLOWERS) {
            totalFiltered++
            continue
          }

          // Check for existing
          const { data: existing } = await supabase
            .from('coverage_items')
            .select('id')
            .eq('url', postUrl)
            .eq('client_id', term.clientId)
            .limit(1)

          if (existing && existing.length > 0) continue

          const publishDate = post.timestamp || post.takenAtTimestamp
            ? new Date((typeof post.timestamp === 'number' || typeof post.takenAtTimestamp === 'number')
              ? (post.timestamp || post.takenAtTimestamp) * 1000
              : (post.timestamp || post.takenAtTimestamp)).toISOString().split('T')[0]
            : null

          const isVideo = post.type === 'Video' || post.isVideo || post.videoUrl
          const caption = post.caption || post.text || ''

          // Find or create outlet for creator
          const creatorDomain = `instagram.com/${authorName}`
          let outletId: string | null = null

          const { data: existingOutlet } = await supabase
            .from('outlets')
            .select('id')
            .eq('domain', creatorDomain)
            .limit(1)

          if (existingOutlet && existingOutlet.length > 0) {
            outletId = existingOutlet[0].id
          } else {
            const { data: newOutlet } = await supabase
              .from('outlets')
              .insert({
                name: authorFullName,
                domain: creatorDomain,
                monthly_unique_visitors: followers,
                tier: followers >= 1000000 ? 'A' : followers >= 100000 ? 'B' : followers >= 10000 ? 'C' : 'D',
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
            title: caption.length > 200 ? caption.substring(0, 200) + '...' : caption || (isVideo ? 'Instagram Reel' : 'Instagram Post'),
            url: postUrl,
            publish_date: publishDate,
            coverage_type: isVideo ? 'video' : 'mention',
            monthly_unique_visitors: followers,
            territory: null,
            source_type: 'instagram',
            source_metadata: {
              post_id: post.id || post.shortCode, author_name: authorName,
              followers, likes: post.likesCount || post.likes?.count || 0,
              comments: post.commentsCount || post.comments?.count || 0,
              views: post.videoViewCount || post.videoPlayCount || 0,
              is_video: isVideo, hashtags: post.hashtags || [],
            },
            approval_status: 'pending_review',
            discovered_at: new Date().toISOString(),
          })

          totalNew++
        }
      } catch (err) {
        console.error(`Instagram Apify scan error for "${term.query}":`, err)
      }
    }

    return NextResponse.json({
      message: `Instagram scan complete: ${totalFound} found, ${totalNew} new, ${totalFiltered} filtered (< ${MIN_FOLLOWERS} followers)`,
      found: totalFound,
      new_items: totalNew,
      filtered: totalFiltered,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Instagram scan error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
