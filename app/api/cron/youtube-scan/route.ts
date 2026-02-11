import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'

function getSupabase() {
  return getServerSupabase()
}

// GET /api/cron/youtube-scan — Scan YouTube for game coverage videos
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabase()

  try {
    // Get YouTube API key
    const { data: keyData } = await supabase
      .from('service_api_keys')
      .select('api_key, quota_used, quota_limit')
      .eq('service_name', 'youtube')
      .eq('is_active', true)
      .single()

    if (!keyData?.api_key) {
      return NextResponse.json({ message: 'YouTube API key not configured, skipping' })
    }

    const apiKey = keyData.api_key
    let quotaUsed = Number(keyData.quota_used || 0)

    // Get active keyword sets for all clients/games
    const { data: keywords } = await supabase
      .from('coverage_keywords')
      .select('keyword, client_id, game_id')
      .eq('is_active', true)
      .eq('is_blacklist', false)

    if (!keywords || keywords.length === 0) {
      return NextResponse.json({ message: 'No keywords configured' })
    }

    // Group keywords by client+game for dedup
    const searchTerms: Map<string, { query: string; clientId: string; gameId: string | null }> = new Map()
    for (const kw of keywords) {
      const key = `${kw.client_id}|${kw.game_id || ''}`
      if (!searchTerms.has(key)) {
        searchTerms.set(key, { query: kw.keyword, clientId: kw.client_id, gameId: kw.game_id })
      }
    }

    let totalFound = 0
    let totalNew = 0

    for (const [, term] of Array.from(searchTerms.entries())) {
      // Check quota (search = 100 units)
      if (quotaUsed + 100 > 9500) {
        break // Leave buffer from 10,000 daily quota
      }

      try {
        // Search YouTube
        const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search')
        searchUrl.searchParams.set('part', 'snippet')
        searchUrl.searchParams.set('q', term.query)
        searchUrl.searchParams.set('type', 'video')
        searchUrl.searchParams.set('order', 'date')
        searchUrl.searchParams.set('maxResults', '10')
        searchUrl.searchParams.set('publishedAfter', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        searchUrl.searchParams.set('key', apiKey)

        const searchRes = await fetch(searchUrl.toString())
        quotaUsed += 100

        if (!searchRes.ok) continue
        const searchData = await searchRes.json()
        const videos = searchData.items || []

        totalFound += videos.length

        // Get channel details for subscriber counts (1 unit per video)
        const channelIds = new Set<string>()
        for (const video of videos) {
          if (video.snippet?.channelId) channelIds.add(video.snippet.channelId)
        }

        const channelMap: Record<string, { subscribers: number; name: string }> = {}
        if (channelIds.size > 0) {
          const channelsUrl = new URL('https://www.googleapis.com/youtube/v3/channels')
          channelsUrl.searchParams.set('part', 'statistics,snippet')
          channelsUrl.searchParams.set('id', Array.from(channelIds).join(','))
          channelsUrl.searchParams.set('key', apiKey)

          const channelsRes = await fetch(channelsUrl.toString())
          quotaUsed += 1

          if (channelsRes.ok) {
            const channelsData = await channelsRes.json()
            for (const ch of (channelsData.items || [])) {
              channelMap[ch.id] = {
                subscribers: Number(ch.statistics?.subscriberCount || 0),
                name: ch.snippet?.title || '',
              }
            }
          }
        }

        // Insert coverage items
        for (const video of videos) {
          const videoId = video.id?.videoId
          if (!videoId) continue

          const url = `https://www.youtube.com/watch?v=${videoId}`
          const channelId = video.snippet?.channelId
          const channel = channelMap[channelId] || {}
          const publishDate = video.snippet?.publishedAt?.split('T')[0] || null

          // Check for existing item by URL
          const { data: existing } = await supabase
            .from('coverage_items')
            .select('id')
            .eq('url', url)
            .eq('client_id', term.clientId)
            .limit(1)

          if (existing && existing.length > 0) continue

          // Find or create outlet for the channel
          const channelName = channel.name || video.snippet?.channelTitle || 'Unknown Channel'
          let outletId: string | null = null

          const { data: existingOutlet } = await supabase
            .from('outlets')
            .select('id')
            .eq('domain', `youtube.com/channel/${channelId}`)
            .limit(1)

          if (existingOutlet && existingOutlet.length > 0) {
            outletId = existingOutlet[0].id
          } else {
            const { data: newOutlet } = await supabase
              .from('outlets')
              .insert({
                name: channelName,
                domain: `youtube.com/channel/${channelId}`,
                monthly_unique_visitors: channel.subscribers || 0,
                tier: channel.subscribers >= 1000000 ? 'A' : channel.subscribers >= 100000 ? 'B' : channel.subscribers >= 10000 ? 'C' : 'D',
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
            title: video.snippet?.title || 'Untitled Video',
            url,
            publish_date: publishDate,
            coverage_type: 'video',
            monthly_unique_visitors: channel.subscribers || 0,
            territory: video.snippet?.defaultAudioLanguage || null,
            source_type: 'youtube',
            source_metadata: { video_id: videoId, channel_id: channelId, channel_name: channelName, subscribers: channel.subscribers },
            approval_status: 'pending_review',
            discovered_at: new Date().toISOString(),
          })

          totalNew++
        }
      } catch (err) {
        console.error(`YouTube search error for "${term.query}":`, err)
      }
    }

    // Update quota tracking
    await supabase
      .from('service_api_keys')
      .update({ quota_used: quotaUsed, updated_at: new Date().toISOString() })
      .eq('service_name', 'youtube')

    return NextResponse.json({
      message: `YouTube scan complete: ${totalFound} found, ${totalNew} new`,
      found: totalFound,
      new_items: totalNew,
      quota_used: quotaUsed,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('YouTube scan error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
