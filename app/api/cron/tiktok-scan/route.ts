import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'

function getSupabase() {
  return getServerSupabase()
}

// Apify TikTok scraper actor
const APIFY_TIKTOK_ACTOR = 'clockworks/tiktok-scraper'

// Minimum follower threshold for TikTok results
const MIN_FOLLOWERS = 1000

// GET /api/cron/tiktok-scan — Scan TikTok for game-related content via Apify
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
    let totalFiltered = 0

    for (const term of searchTerms) {
      try {
        // Run Apify TikTok scraper actor synchronously
        const actorRes = await fetch(
          `https://api.apify.com/v2/acts/${APIFY_TIKTOK_ACTOR}/run-sync-get-dataset-items?token=${apifyKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              searchQueries: [term.query],
              maxItems: 20,
              sortType: 0, // relevance
            }),
          }
        )

        if (!actorRes.ok) {
          console.error(`Apify TikTok actor error for "${term.query}": ${actorRes.status}`)
          continue
        }

        const videos = await actorRes.json()
        if (!Array.isArray(videos)) continue

        totalFound += videos.length

        for (const video of videos) {
          const videoUrl = video.webVideoUrl || video.url || (video.id ? `https://www.tiktok.com/@${video.authorMeta?.name || 'user'}/video/${video.id}` : null)
          if (!videoUrl) continue

          const authorName = video.authorMeta?.name || video.author?.uniqueId || video.authorName || 'Unknown'
          const authorNickname = video.authorMeta?.nickName || video.author?.nickname || authorName
          const followers = Number(video.authorMeta?.fans || video.authorMeta?.followers || video.authorStats?.followerCount || 0)

          // Filter by minimum followers
          if (followers < MIN_FOLLOWERS) {
            totalFiltered++
            continue
          }

          // Check for existing
          const { data: existing } = await supabase
            .from('coverage_items')
            .select('id')
            .eq('url', videoUrl)
            .eq('client_id', term.clientId)
            .limit(1)

          if (existing && existing.length > 0) continue

          const publishDate = video.createTime || video.createTimeISO
            ? new Date((typeof video.createTime === 'number' ? video.createTime * 1000 : video.createTimeISO || video.createTime)).toISOString().split('T')[0]
            : null

          // Find or create outlet for creator
          const creatorDomain = `tiktok.com/@${authorName}`
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
                name: authorNickname,
                domain: creatorDomain,
                monthly_unique_visitors: followers,
                tier: followers >= 1000000 ? 'A' : followers >= 100000 ? 'B' : followers >= 10000 ? 'C' : 'D',
                is_active: true,
              })
              .select('id')
              .single()
            if (newOutlet) outletId = newOutlet.id
          }

          const description = video.text || video.desc || video.description || ''

          await supabase.from('coverage_items').insert({
            client_id: term.clientId,
            game_id: term.gameId,
            outlet_id: outletId,
            title: description.length > 200 ? description.substring(0, 200) + '...' : description || 'TikTok Video',
            url: videoUrl,
            publish_date: publishDate,
            coverage_type: 'video',
            monthly_unique_visitors: followers,
            territory: video.locationCreated || null,
            source_type: 'tiktok',
            source_metadata: {
              video_id: video.id, author_name: authorName,
              followers, views: video.playCount || video.stats?.playCount || 0,
              likes: video.diggCount || video.stats?.diggCount || 0,
              comments: video.commentCount || video.stats?.commentCount || 0,
              shares: video.shareCount || video.stats?.shareCount || 0,
              duration: video.videoMeta?.duration || video.duration || 0,
            },
            approval_status: 'pending_review',
            discovered_at: new Date().toISOString(),
          })

          totalNew++
        }
      } catch (err) {
        console.error(`TikTok Apify scan error for "${term.query}":`, err)
      }
    }

    return NextResponse.json({
      message: `TikTok scan complete: ${totalFound} found, ${totalNew} new, ${totalFiltered} filtered (< ${MIN_FOLLOWERS} followers)`,
      found: totalFound,
      new_items: totalNew,
      filtered: totalFiltered,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('TikTok scan error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
