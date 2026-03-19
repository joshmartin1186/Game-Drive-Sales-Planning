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

// GET - List correlation candidates with filters
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabase()
    const { searchParams } = new URL(request.url)

    const gameId = searchParams.get('game_id')
    const clientId = searchParams.get('client_id')
    const status = searchParams.get('status') || 'pending'
    const limit = parseInt(searchParams.get('limit') || '100')
    const offset = parseInt(searchParams.get('offset') || '0')

    let query = supabase
      .from('correlation_candidates')
      .select('*, game:games(id, name), client:clients(id, name), coverage_item:coverage_items(id, title, url)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (gameId) query = query.eq('game_id', gameId)
    if (clientId) query = query.eq('client_id', clientId)
    if (status) query = query.eq('status', status)

    const { data, error, count } = await query

    if (error) {
      console.error('Error fetching correlation_candidates:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data, count })
  } catch (err) {
    console.error('Correlation candidates GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT - Update candidate status (approve/reject/inconclusive)
export async function PUT(request: NextRequest) {
  try {
    const supabase = getSupabase()
    const body = await request.json()

    const { id, status, reviewed_by } = body
    if (!id) {
      return NextResponse.json({ error: 'Candidate ID is required' }, { status: 400 })
    }
    if (!status || !['approved', 'rejected', 'inconclusive'].includes(status)) {
      return NextResponse.json({ error: 'status must be one of: approved, rejected, inconclusive' }, { status: 400 })
    }

    const now = new Date().toISOString()

    // Update the candidate record
    const candidateUpdates: Record<string, unknown> = {
      status,
      reviewed_at: now,
      reviewed_by: reviewed_by || null,
      updated_at: now,
    }

    const { data: candidate, error: updateError } = await supabase
      .from('correlation_candidates')
      .update(candidateUpdates)
      .eq('id', id)
      .select('*, game:games(id, name), client:clients(id, name), coverage_item:coverage_items(id, title, url)')
      .single()

    if (updateError) {
      console.error('Error updating correlation_candidate:', updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // When approving, also create a pr_annotations record from the candidate data
    let annotation = null
    if (status === 'approved' && candidate) {
      const raw = candidate as Record<string, unknown>
      const annotationRecord: Record<string, unknown> = {
        game_id: raw.game_id,
        client_id: raw.client_id,
        event_type: raw.event_type,
        event_date: raw.event_date,
        outlet_or_source: raw.outlet_or_source || null,
        coverage_item_id: raw.coverage_item_id || null,
        observed_effect: raw.suspected_effect || null,
        direction: raw.direction || null,
        confidence: 'confirmed',
        is_auto_detected: true,
        notes: `Auto-created from approved correlation candidate ${id}`,
      }

      const { data: annData, error: annError } = await supabase
        .from('pr_annotations')
        .insert([annotationRecord])
        .select('*, game:games(id, name), client:clients(id, name)')
        .single()

      if (annError) {
        console.error('Error creating annotation from approved candidate:', annError)
        // Don't fail the whole request — the candidate was already updated
      } else {
        annotation = annData
      }
    }

    return NextResponse.json({ data: candidate, annotation })
  } catch (err) {
    console.error('Correlation candidates PUT error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
