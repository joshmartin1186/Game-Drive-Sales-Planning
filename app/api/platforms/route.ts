import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Create supabase client lazily inside handlers to avoid build-time errors
function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase environment variables')
  }
  
  return createClient(supabaseUrl, supabaseKey)
}

// GET - Fetch all platforms with full configuration
export async function GET() {
  try {
    const supabase = getSupabase()
    
    const { data, error } = await supabase
      .from('platforms')
      .select('*')
      .order('name', { ascending: true })
    
    if (error) {
      console.error('Error fetching platforms:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    return NextResponse.json(data)
  } catch (err) {
    console.error('Platforms GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT - Update platform configuration
export async function PUT(request: NextRequest) {
  try {
    const supabase = getSupabase()
    const body = await request.json()
    const { id, ...updates } = body
    
    if (!id) {
      return NextResponse.json({ error: 'Platform ID is required' }, { status: 400 })
    }
    
    // Only allow updating certain fields
    const allowedFields = [
      'cooldown_days',
      'max_sale_days',
      'approval_required',
      'color_hex',
      'special_sales_no_cooldown',
      'typical_start_day',
      'submission_lead_days',
      'min_discount_percent',
      'max_discount_percent',
      'notes',
      'is_active'
    ]
    
    const filteredUpdates: Record<string, unknown> = {}
    for (const field of allowedFields) {
      if (field in updates) {
        filteredUpdates[field] = updates[field]
      }
    }
    
    const { data, error } = await supabase
      .from('platforms')
      .update(filteredUpdates)
      .eq('id', id)
      .select()
      .single()
    
    if (error) {
      console.error('Error updating platform:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    return NextResponse.json(data)
  } catch (err) {
    console.error('Platforms PUT error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
