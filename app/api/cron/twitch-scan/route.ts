import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'

function getSupabase() {
  return getServerSupabase()
}

async function getTwitchToken(clientId: string, clientSecret: string): Promise<string | null> {
  const res = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`,
    { method: 'POST' }
  )
  if (!res.ok) return null
  const data = await res.json()
  return data.access_token || null
}

// GET /api/cron/twitch-scan — Scan Twitch for game streams and VODs
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabase()

  try {
    // Get Twitch credentials
    const { data: keyData } = await supabase
      .from('service_api_keys')
      .select('client_id_value, client_secret')
      .eq('service_name', 'twitch')
      .eq('is_active', true)
      .single()

    if (!keyData?.client_id_value || !keyData?.client_secret) {
      return NextResponse.json({ message: 'Twitch credentials not configured, skipping' })
    }

    const token = await getTwitchToken(keyData.client_id_value, keyData.client_secret)
    if (!token) {
      return NextResponse.json({ error: 'Failed to get Twitch OAuth token' }, { status: 500 })
    }

    const headers = {
      'Client-ID': keyData.client_id_value,
      Authorization: `Bearer ${token}`,
    }

    // Get games to search for
    const { data: games } = await supabase
      .from('games')
      .select('id, name, client_id')

    if (!games || games.length === 0) {
      return NextResponse.json({ message: 'No games configured' })
    }

    let totalFound = 0
    let totalNew = 0

    for (const game of games) {
      try {
        // Look up Twitch game ID
        const gameSearchRes = await fetch(
          `https://api.twitch.tv/helix/games?name=${encodeURIComponent(game.name)}`,
          { headers }
        )
        if (!gameSearchRes.ok) continue
        const gameSearchData = await gameSearchRes.json()
        const twitchGame = (gameSearchData.data || [])[0]
        if (!twitchGame) continue

        const twitchGameId = twitchGame.id

        // Get recent VODs for this game
        const vodsRes = await fetch(
          `https://api.twitch.tv/helix/videos?game_id=${twitchGameId}&sort=time&first=20&type=archive`,
          { headers }
        )
        if (!vodsRes.ok) continue
        const vodsData = await vodsRes.json()
        const vods = vodsData.data || []

        totalFound += vods.length

        for (const vod of vods) {
          const url = vod.url
          if (!url) continue

          // Check for existing
          const { data: existing } = await supabase
            .from('coverage_items')
            .select('id')
            .eq('url', url)
            .eq('client_id', game.client_id)
            .limit(1)

          if (existing && existing.length > 0) continue

          // Get channel follower count
          let followers = 0
          try {
            const userRes = await fetch(
              `https://api.twitch.tv/helix/users?id=${vod.user_id}`,
              { headers }
            )
            if (userRes.ok) {
              const userData = await userRes.json()
              const user = (userData.data || [])[0]
              // Follower count requires separate endpoint
              const followRes = await fetch(
                `https://api.twitch.tv/helix/channels/followers?broadcaster_id=${vod.user_id}&first=1`,
                { headers }
              )
              if (followRes.ok) {
                const followData = await followRes.json()
                followers = followData.total || 0
              }
            }
          } catch { /* ignore follower fetch errors */ }

          // Find or create outlet for streamer
          const streamerName = vod.user_name || vod.user_login || 'Unknown'
          const streamerDomain = `twitch.tv/${vod.user_login || vod.user_id}`
          let outletId: string | null = null

          const { data: existingOutlet } = await supabase
            .from('outlets')
            .select('id')
            .eq('domain', streamerDomain)
            .limit(1)

          if (existingOutlet && existingOutlet.length > 0) {
            outletId = existingOutlet[0].id
          } else {
            const { data: newOutlet } = await supabase
              .from('outlets')
              .insert({
                name: streamerName,
                domain: streamerDomain,
                monthly_unique_visitors: followers,
                tier: followers >= 100000 ? 'A' : followers >= 10000 ? 'B' : followers >= 1000 ? 'C' : 'D',
                is_active: true,
              })
              .select('id')
              .single()
            if (newOutlet) outletId = newOutlet.id
          }

          const publishDate = vod.created_at?.split('T')[0] || null

          await supabase.from('coverage_items').insert({
            client_id: game.client_id,
            game_id: game.id,
            outlet_id: outletId,
            title: vod.title || 'Untitled Stream',
            url,
            publish_date: publishDate,
            coverage_type: 'stream',
            monthly_unique_visitors: followers,
            territory: vod.language || null,
            source_type: 'twitch',
            source_metadata: {
              video_id: vod.id, user_id: vod.user_id, user_name: streamerName,
              view_count: vod.view_count, duration: vod.duration, followers,
            },
            approval_status: 'pending_review',
            discovered_at: new Date().toISOString(),
          })

          totalNew++
        }
      } catch (err) {
        console.error(`Twitch scan error for "${game.name}":`, err)
      }
    }

    return NextResponse.json({
      message: `Twitch scan complete: ${totalFound} found, ${totalNew} new`,
      found: totalFound,
      new_items: totalNew,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Twitch scan error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
