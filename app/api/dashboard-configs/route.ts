import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

// GET: Fetch dashboard configurations
export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const { searchParams } = new URL(request.url)
    const clientId = searchParams.get('client_id')
    const isDefault = searchParams.get('is_default')

    let query = supabase
      .from('dashboard_configs')
      .select('*')
      .order('created_at', { ascending: false })

    // Filter by client_id if provided
    if (clientId && clientId !== 'all') {
      query = query.eq('client_id', clientId)
    }

    // Filter by is_default if provided
    if (isDefault === 'true') {
      query = query.eq('is_default', true)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching dashboard configs:', error)
      return NextResponse.json(
        { error: 'Failed to fetch dashboard configurations' },
        { status: 500 }
      )
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}

// POST: Create a new dashboard configuration
export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const body = await request.json()

    const { client_id, name, layout, charts, is_default } = body

    // Validate required fields
    if (!name || !layout || !charts) {
      return NextResponse.json(
        { error: 'Missing required fields: name, layout, charts' },
        { status: 400 }
      )
    }

    // If setting as default, unset other defaults for this client
    if (is_default && client_id) {
      await supabase
        .from('dashboard_configs')
        .update({ is_default: false })
        .eq('client_id', client_id)
        .eq('is_default', true)
    }

    const { data, error } = await supabase
      .from('dashboard_configs')
      .insert({
        client_id,
        name,
        layout,
        charts,
        is_default: is_default || false,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating dashboard config:', error)
      return NextResponse.json(
        { error: 'Failed to create dashboard configuration' },
        { status: 500 }
      )
    }

    return NextResponse.json({ data }, { status: 201 })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}

// PUT: Update an existing dashboard configuration
export async function PUT(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const body = await request.json()

    const { id, client_id, name, layout, charts, is_default } = body

    if (!id) {
      return NextResponse.json(
        { error: 'Missing required field: id' },
        { status: 400 }
      )
    }

    // If setting as default, unset other defaults for this client
    if (is_default && client_id) {
      await supabase
        .from('dashboard_configs')
        .update({ is_default: false })
        .eq('client_id', client_id)
        .eq('is_default', true)
        .neq('id', id)
    }

    const updateData: any = {}
    if (name !== undefined) updateData.name = name
    if (layout !== undefined) updateData.layout = layout
    if (charts !== undefined) updateData.charts = charts
    if (is_default !== undefined) updateData.is_default = is_default

    const { data, error } = await supabase
      .from('dashboard_configs')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating dashboard config:', error)
      return NextResponse.json(
        { error: 'Failed to update dashboard configuration' },
        { status: 500 }
      )
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}

// DELETE: Delete a dashboard configuration
export async function DELETE(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: 'Missing required parameter: id' },
        { status: 400 }
      )
    }

    const { error } = await supabase
      .from('dashboard_configs')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting dashboard config:', error)
      return NextResponse.json(
        { error: 'Failed to delete dashboard configuration' },
        { status: 500 }
      )
    }

    return NextResponse.json({ message: 'Dashboard configuration deleted successfully' })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
