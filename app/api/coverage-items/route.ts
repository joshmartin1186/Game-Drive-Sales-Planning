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

// GET - Fetch coverage items with filters, sorting, pagination
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabase()
    const { searchParams } = new URL(request.url)

    const clientId = searchParams.get('client_id')
    const gameId = searchParams.get('game_id')
    const outletId = searchParams.get('outlet_id')
    const campaignId = searchParams.get('campaign_id')
    const coverageType = searchParams.get('coverage_type')
    const sentiment = searchParams.get('sentiment')
    const approvalStatus = searchParams.get('approval_status')
    const sourceType = searchParams.get('source_type')
    const territory = searchParams.get('territory')
    const tier = searchParams.get('tier')
    const search = searchParams.get('search')
    const dateFrom = searchParams.get('date_from')
    const dateTo = searchParams.get('date_to')
    const sortBy = searchParams.get('sort_by') || 'monthly_unique_visitors'
    const sortDir = (searchParams.get('sort_dir') || 'desc') as 'asc' | 'desc'
    const limit = parseInt(searchParams.get('limit') || '100')
    const offset = parseInt(searchParams.get('offset') || '0')

    let query = supabase
      .from('coverage_items')
      .select('*, outlet:outlets(id, name, domain, tier, monthly_unique_visitors), game:games(id, name), client:clients(id, name), campaign:coverage_campaigns(id, name)', { count: 'exact' })
      .order(sortBy, { ascending: sortDir === 'asc' })
      .range(offset, offset + limit - 1)

    if (clientId) query = query.eq('client_id', clientId)
    if (gameId) query = query.eq('game_id', gameId)
    if (outletId) query = query.eq('outlet_id', outletId)
    if (campaignId) query = query.eq('campaign_id', campaignId)
    if (coverageType) query = query.eq('coverage_type', coverageType)
    if (sentiment) query = query.eq('sentiment', sentiment)
    if (approvalStatus) query = query.eq('approval_status', approvalStatus)
    if (sourceType) query = query.eq('source_type', sourceType)
    if (territory) query = query.eq('territory', territory)
    if (search) query = query.ilike('title', `%${search}%`)
    if (dateFrom) query = query.gte('publish_date', dateFrom)
    if (dateTo) query = query.lte('publish_date', dateTo)
    if (tier) query = query.not('outlet_id', 'is', null)

    const { data, error, count } = await query

    if (error) {
      console.error('Error fetching coverage items:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Filter by tier client-side since it's a joined field
    let filtered = data || []
    if (tier) {
      filtered = filtered.filter((item: Record<string, unknown>) => {
        const outlet = item.outlet as { tier?: string } | null
        return outlet?.tier === tier
      })
    }

    return NextResponse.json({ data: filtered, count: tier ? filtered.length : count })
  } catch (err) {
    console.error('Coverage items GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST - Create coverage item(s)
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabase()
    const body = await request.json()

    if (Array.isArray(body)) {
      const items = body
        .filter(item => item.title?.trim() && item.url?.trim())
        .map(item => ({
          client_id: item.client_id || null,
          game_id: item.game_id || null,
          outlet_id: item.outlet_id || null,
          campaign_id: item.campaign_id || null,
          title: item.title.trim(),
          url: item.url.trim(),
          publish_date: item.publish_date || null,
          territory: item.territory || null,
          coverage_type: item.coverage_type || null,
          monthly_unique_visitors: item.monthly_unique_visitors || null,
          review_score: item.review_score || null,
          quotes: item.quotes || null,
          sentiment: item.sentiment || null,
          relevance_score: item.relevance_score || null,
          relevance_reasoning: item.relevance_reasoning || null,
          approval_status: item.approval_status || 'pending_review',
          source_type: item.source_type || 'manual',
          source_metadata: item.source_metadata || {},
          campaign_section: item.campaign_section || null
        }))

      if (items.length === 0) {
        return NextResponse.json({ error: 'No valid items provided' }, { status: 400 })
      }

      const { data, error } = await supabase
        .from('coverage_items')
        .insert(items)
        .select()

      if (error) {
        console.error('Error bulk creating coverage items:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ data, imported: items.length })
    }

    // Single item
    const { title, url, ...rest } = body
    if (!title?.trim() || !url?.trim()) {
      return NextResponse.json({ error: 'title and url are required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('coverage_items')
      .insert([{ title: title.trim(), url: url.trim(), ...rest }])
      .select('*, outlet:outlets(id, name, domain, tier, monthly_unique_visitors), game:games(id, name), client:clients(id, name), campaign:coverage_campaigns(id, name)')
      .single()

    if (error) {
      console.error('Error creating coverage item:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error('Coverage items POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT - Update a coverage item (approve/reject/annotate/edit)
export async function PUT(request: NextRequest) {
  try {
    const supabase = getSupabase()
    const body = await request.json()

    // Handle bulk approval/rejection
    if (body.bulk_ids && body.approval_status) {
      const updates: Record<string, unknown> = {
        approval_status: body.approval_status,
        updated_at: new Date().toISOString()
      }
      if (body.approval_status === 'manually_approved') {
        updates.approved_at = new Date().toISOString()
      }

      const { data, error } = await supabase
        .from('coverage_items')
        .update(updates)
        .in('id', body.bulk_ids)
        .select()

      if (error) {
        console.error('Error bulk updating coverage items:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ data, updated: data?.length || 0 })
    }

    // Single item update
    const { id, ...updates } = body
    if (!id) {
      return NextResponse.json({ error: 'Item ID is required' }, { status: 400 })
    }

    const cleanUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    const allowedFields = [
      'title', 'url', 'publish_date', 'territory', 'coverage_type',
      'monthly_unique_visitors', 'review_score', 'quotes', 'sentiment',
      'relevance_score', 'approval_status', 'campaign_id', 'campaign_section',
      'outlet_id', 'game_id', 'client_id', 'source_type'
    ]

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        cleanUpdates[field] = updates[field]
      }
    }

    // Set approval metadata
    if (updates.approval_status === 'manually_approved') {
      cleanUpdates.approved_at = new Date().toISOString()
    }

    const { data, error } = await supabase
      .from('coverage_items')
      .update(cleanUpdates)
      .eq('id', id)
      .select('*, outlet:outlets(id, name, domain, tier, monthly_unique_visitors), game:games(id, name), client:clients(id, name), campaign:coverage_campaigns(id, name)')
      .single()

    if (error) {
      console.error('Error updating coverage item:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error('Coverage items PUT error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE - Delete a coverage item
export async function DELETE(request: NextRequest) {
  try {
    const supabase = getSupabase()
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Item ID is required' }, { status: 400 })
    }

    const { error } = await supabase
      .from('coverage_items')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting coverage item:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Coverage items DELETE error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
