import { NextResponse } from 'next/server'
import { serverSupabase as supabase } from '@/lib/supabase'

// GET - Fetch all games with client info
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const clientId = searchParams.get('client_id')

    let query = supabase
      .from('games')
      .select('*, client:clients(id, name)')
      .order('name', { ascending: true })

    if (clientId) {
      query = query.eq('client_id', clientId)
    }

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json(data || [])
  } catch (error) {
    console.error('Error fetching games:', error)
    return NextResponse.json({ error: 'Failed to fetch games' }, { status: 500 })
  }
}

// POST - Create a new game
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { name, client_id, steam_app_id, pr_tracking_enabled } = body

    if (!name || !client_id) {
      return NextResponse.json(
        { error: 'Game name and client_id are required' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('games')
      .insert({
        name,
        client_id,
        steam_app_id: steam_app_id || null,
        pr_tracking_enabled: pr_tracking_enabled ?? false
      })
      .select('*, client:clients(id, name)')
      .single()

    if (error) throw error

    // Auto-create SullyGnome coverage source for Twitch tracking
    if (data?.id && data?.name) {
      const sgSlug = data.name.replace(/\s+/g, '_')
      await supabase
        .from('coverage_sources')
        .insert({
          source_type: 'sullygnome',
          name: `SullyGnome – ${data.name}`,
          game_id: data.id,
          scan_frequency: 'weekly',
          is_active: true,
          config: {
            game_name: data.name,
            sullygnome_slug: sgSlug,
            default_time_range: '30d',
            min_avg_viewers: 10,
          },
        })
        .then(({ error: sgErr }) => {
          if (sgErr) console.error('Auto-create SullyGnome source failed:', sgErr.message)
        })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error creating game:', error)
    return NextResponse.json({ error: 'Failed to create game' }, { status: 500 })
  }
}

// PUT - Update a game
export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const { id, ...updates } = body

    if (!id) {
      return NextResponse.json({ error: 'Game id is required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('games')
      .update(updates)
      .eq('id', id)
      .select('*, client:clients(id, name)')
      .single()

    if (error) throw error

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error updating game:', error)
    return NextResponse.json({ error: 'Failed to update game' }, { status: 500 })
  }
}

// DELETE - Delete a game (cascades to products, sales, coverage)
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Game id is required' }, { status: 400 })
    }

    const { error } = await supabase
      .from('games')
      .delete()
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting game:', error)
    return NextResponse.json({ error: 'Failed to delete game' }, { status: 500 })
  }
}
