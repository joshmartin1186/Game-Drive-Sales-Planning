import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase environment variables')
  }

  return createClient(supabaseUrl, supabaseKey)
}

// GET - Fetch sources with optional filters
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabase()
    const { searchParams } = new URL(request.url)

    const sourceType = searchParams.get('source_type')
    const isActive = searchParams.get('is_active')
    const gameId = searchParams.get('game_id')
    const outletId = searchParams.get('outlet_id')

    let query = supabase
      .from('coverage_sources')
      .select('*, outlet:outlets(id, name, domain, tier), game:games(id, name)')
      .order('source_type', { ascending: true })
      .order('name', { ascending: true })

    if (sourceType) query = query.eq('source_type', sourceType)
    if (isActive !== null && isActive !== '') query = query.eq('is_active', isActive === 'true')
    if (gameId) query = query.eq('game_id', gameId)
    if (outletId) query = query.eq('outlet_id', outletId)

    const { data, error } = await query

    if (error) {
      console.error('Error fetching coverage sources:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error('Coverage sources GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST - Create source(s)
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabase()
    const body = await request.json()

    // Handle bulk import (array)
    if (Array.isArray(body)) {
      const sources = body
        .filter(item => item.name?.trim() && item.source_type)
        .map(item => ({
          source_type: item.source_type,
          name: item.name.trim(),
          description: item.description || null,
          config: item.config || {},
          outlet_id: item.outlet_id || null,
          game_id: item.game_id || null,
          scan_frequency: item.scan_frequency || 'daily',
          is_active: item.is_active !== false
        }))

      if (sources.length === 0) {
        return NextResponse.json({ error: 'No valid sources provided' }, { status: 400 })
      }

      const { data, error } = await supabase
        .from('coverage_sources')
        .insert(sources)
        .select()

      if (error) {
        console.error('Error bulk creating sources:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ data, imported: sources.length })
    }

    // Single source creation
    const { source_type, name, description, config, outlet_id, game_id, scan_frequency, is_active } = body

    if (!source_type || !name?.trim()) {
      return NextResponse.json({ error: 'source_type and name are required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('coverage_sources')
      .insert([{
        source_type,
        name: name.trim(),
        description: description || null,
        config: config || {},
        outlet_id: outlet_id || null,
        game_id: game_id || null,
        scan_frequency: scan_frequency || 'daily',
        is_active: is_active !== false
      }])
      .select('*, outlet:outlets(id, name, domain, tier), game:games(id, name)')
      .single()

    if (error) {
      console.error('Error creating source:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error('Coverage sources POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT - Update a source
export async function PUT(request: NextRequest) {
  try {
    const supabase = getSupabase()
    const body = await request.json()
    const { id, ...updates } = body

    if (!id) {
      return NextResponse.json({ error: 'Source ID is required' }, { status: 400 })
    }

    // Clean up the updates
    const cleanUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (updates.name !== undefined) cleanUpdates.name = updates.name.trim()
    if (updates.description !== undefined) cleanUpdates.description = updates.description || null
    if (updates.config !== undefined) cleanUpdates.config = updates.config
    if (updates.outlet_id !== undefined) cleanUpdates.outlet_id = updates.outlet_id || null
    if (updates.game_id !== undefined) cleanUpdates.game_id = updates.game_id || null
    if (updates.scan_frequency !== undefined) cleanUpdates.scan_frequency = updates.scan_frequency
    if (updates.is_active !== undefined) cleanUpdates.is_active = updates.is_active

    const { data, error } = await supabase
      .from('coverage_sources')
      .update(cleanUpdates)
      .eq('id', id)
      .select('*, outlet:outlets(id, name, domain, tier), game:games(id, name)')
      .single()

    if (error) {
      console.error('Error updating source:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error('Coverage sources PUT error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE - Delete a source
export async function DELETE(request: NextRequest) {
  try {
    const supabase = getSupabase()
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Source ID is required' }, { status: 400 })
    }

    const { error } = await supabase
      .from('coverage_sources')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting source:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Coverage sources DELETE error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
