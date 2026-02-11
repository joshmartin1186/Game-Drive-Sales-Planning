import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'

function getSupabase() {
  return getServerSupabase()
}

// GET /api/campaign-attributions — Fetch attribution notes
export async function GET(request: NextRequest) {
  const supabase = getSupabase()
  const { searchParams } = new URL(request.url)

  const clientId = searchParams.get('client_id')
  const gameId = searchParams.get('game_id')
  const weekStart = searchParams.get('week_start')

  try {
    let query = supabase
      .from('campaign_attributions')
      .select('*')
      .order('week_start', { ascending: true })

    if (clientId) query = query.eq('client_id', clientId)
    if (gameId) query = query.eq('game_id', gameId)
    if (weekStart) query = query.eq('week_start', weekStart)

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json(data || [])
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST /api/campaign-attributions — Create an attribution note
export async function POST(request: NextRequest) {
  const supabase = getSupabase()

  try {
    const body = await request.json()
    const { week_start, note, client_id, game_id, campaign_id } = body

    if (!week_start || !note) {
      return NextResponse.json({ error: 'week_start and note are required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('campaign_attributions')
      .insert([{ week_start, note, client_id: client_id || null, game_id: game_id || null, campaign_id: campaign_id || null }])
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// DELETE /api/campaign-attributions — Delete an attribution note
export async function DELETE(request: NextRequest) {
  const supabase = getSupabase()
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  try {
    const { error } = await supabase
      .from('campaign_attributions')
      .delete()
      .eq('id', id)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
