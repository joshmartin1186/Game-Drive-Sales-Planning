import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const { productId, platformId, startDate, endDate, excludeSaleId } = await request.json()

    // Validate required fields
    if (!productId || !platformId || !startDate || !endDate) {
      return NextResponse.json({ 
        error: 'Missing required fields' 
      }, { status: 400 })
    }

    // Get platform cooldown rules
    const { data: platform, error: platformError } = await supabase
      .from('platforms')
      .select('cooldown_days, name')
      .eq('id', platformId)
      .single()

    if (platformError) {
      return NextResponse.json({ 
        error: 'Platform not found' 
      }, { status: 404 })
    }

    // Calculate cooldown end date
    const saleEndDate = new Date(endDate)
    const cooldownEndDate = new Date(saleEndDate)
    cooldownEndDate.setDate(cooldownEndDate.getDate() + platform.cooldown_days)

    // Check for existing sales within cooldown period
    let conflictQuery = supabase
      .from('sales')
      .select(`
        id,
        start_date,
        end_date,
        sale_name,
        status,
        product:products(
          name,
          game:games(name)
        )
      `)
      .eq('product_id', productId)
      .eq('platform_id', platformId)
      .neq('status', 'rejected')
      .or(`start_date.lte.${cooldownEndDate.toISOString().split('T')[0]},end_date.gte.${new Date(startDate).toISOString().split('T')[0]}`)

    // Exclude current sale if updating
    if (excludeSaleId) {
      conflictQuery = conflictQuery.neq('id', excludeSaleId)
    }

    const { data: existingSales, error: salesError } = await conflictQuery

    if (salesError) {
      return NextResponse.json({ 
        error: 'Failed to check for conflicts' 
      }, { status: 500 })
    }

    // Check for direct overlaps (same dates)
    const directConflicts = existingSales?.filter(sale => {
      const saleStart = new Date(sale.start_date)
      const saleEnd = new Date(sale.end_date)
      const newStart = new Date(startDate)
      const newEnd = new Date(endDate)

      return (newStart <= saleEnd && newEnd >= saleStart)
    }) || []

    // Check for cooldown violations
    const cooldownConflicts = existingSales?.filter(sale => {
      const saleEnd = new Date(sale.end_date)
      const newStart = new Date(startDate)
      const requiredGap = platform.cooldown_days

      // If existing sale ends, check if new sale starts too soon
      const daysBetween = Math.floor((newStart.getTime() - saleEnd.getTime()) / (1000 * 60 * 60 * 24))
      
      return daysBetween >= 0 && daysBetween < requiredGap && !directConflicts.some(c => c.id === sale.id)
    }) || []

    const hasConflicts = directConflicts.length > 0 || cooldownConflicts.length > 0

    return NextResponse.json({
      valid: !hasConflicts,
      conflicts: {
        direct: directConflicts,
        cooldown: cooldownConflicts
      },
      cooldownEnd: cooldownEndDate,
      platform: platform.name,
      cooldownDays: platform.cooldown_days
    })

  } catch (error) {
    console.error('Sales validation error:', error)
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 })
  }
}