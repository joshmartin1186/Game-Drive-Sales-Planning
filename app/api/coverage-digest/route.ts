import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'

function getSupabase() {
  return getServerSupabase()
}

// GET /api/coverage-digest — List digest configs
export async function GET(request: NextRequest) {
  const supabase = getSupabase()
  const clientId = request.nextUrl.searchParams.get('client_id')

  let query = supabase
    .from('coverage_digest_config')
    .select('*, clients(name)')
    .order('created_at', { ascending: false })

  if (clientId) {
    query = query.eq('client_id', clientId)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data || [])
}

// POST /api/coverage-digest — Create or update digest config
export async function POST(request: NextRequest) {
  const supabase = getSupabase()

  try {
    const body = await request.json()
    const { client_id, frequency, recipients, min_items_threshold } = body

    if (!client_id) {
      return NextResponse.json({ error: 'client_id required' }, { status: 400 })
    }

    if (frequency && !['daily', 'weekly', 'disabled'].includes(frequency)) {
      return NextResponse.json({ error: 'frequency must be daily, weekly, or disabled' }, { status: 400 })
    }

    // Upsert config
    const { data, error } = await supabase
      .from('coverage_digest_config')
      .upsert({
        client_id,
        frequency: frequency || 'weekly',
        recipients: recipients || [],
        min_items_threshold: min_items_threshold || 1,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'client_id' })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}

// DELETE /api/coverage-digest?id=xxx — Delete digest config
export async function DELETE(request: NextRequest) {
  const supabase = getSupabase()
  const id = request.nextUrl.searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('coverage_digest_config')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
