import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { GoogleGenAI } from '@google/genai'

function getSupabase() {
  return getServerSupabase()
}

interface PredictionRequest {
  product_id: string
  platform_id: string
  client_id: string
  discount_percentage: number
  duration_days: number
  start_date?: string
  goal_type?: string
}

interface HistoricalSale {
  start_date: string
  end_date: string
  discount_percentage: number | null
  sale_name: string | null
  sale_type: string
}

interface PerformanceRow {
  date: string
  net_units_sold: number
  net_steam_sales_usd: number
  gross_units_sold: number
  base_price_usd: number | null
  sale_price_usd: number | null
}

// POST /api/sales/predict — AI-powered revenue prediction for a planned sale
export async function POST(request: NextRequest) {
  const supabase = getSupabase()

  try {
    const body: PredictionRequest = await request.json()
    const { product_id, platform_id, client_id, discount_percentage, duration_days, start_date, goal_type } = body

    if (!product_id || !platform_id || !client_id) {
      return NextResponse.json({ error: 'product_id, platform_id, and client_id are required' }, { status: 400 })
    }

    // 1. Get product and platform info
    const [productRes, platformRes] = await Promise.all([
      supabase.from('products').select('name, base_price_usd, product_type, game:games(name)').eq('id', product_id).single(),
      supabase.from('platforms').select('name, cooldown_days, max_sale_days, min_discount_percent, max_discount_percent').eq('id', platform_id).single(),
    ])

    const product = productRes.data
    const platform = platformRes.data
    if (!product || !platform) {
      return NextResponse.json({ error: 'Product or platform not found' }, { status: 404 })
    }

    // 2. Get historical sales for this product+platform
    const { data: historicalSales } = await supabase
      .from('sales')
      .select('start_date, end_date, discount_percentage, sale_name, sale_type')
      .eq('product_id', product_id)
      .eq('platform_id', platform_id)
      .neq('status', 'rejected')
      .order('start_date', { ascending: false })
      .limit(20)

    // 3. Get performance data (actual revenue) for this product on this platform
    const productName = product.name
    const platformName = platform.name

    const { data: performanceData } = await supabase
      .from('unified_performance_view')
      .select('date, net_units_sold, net_steam_sales_usd, gross_units_sold, base_price_usd, sale_price_usd')
      .eq('client_id', client_id)
      .ilike('product_name', `%${productName}%`)
      .ilike('platform', `%${platformName}%`)
      .order('date', { ascending: false })
      .limit(365)

    // 4. Compute statistical summary
    const sales = (historicalSales || []) as HistoricalSale[]
    const perf = (performanceData || []) as PerformanceRow[]

    const discounts = sales.filter(s => s.discount_percentage != null).map(s => s.discount_percentage!)
    const maxDiscount = discounts.length > 0 ? Math.max(...discounts) : null
    const avgDiscount = discounts.length > 0 ? Math.round(discounts.reduce((a, b) => a + b, 0) / discounts.length) : null

    // Calculate average daily revenue during sale vs non-sale periods
    const salePeriods = sales.map(s => ({ start: s.start_date, end: s.end_date, discount: s.discount_percentage }))

    let saleDayRevenue = 0
    let saleDayCount = 0
    let nonSaleDayRevenue = 0
    let nonSaleDayCount = 0

    for (const row of perf) {
      const inSale = salePeriods.some(p => row.date >= p.start && row.date <= p.end)
      const rev = Number(row.net_steam_sales_usd || 0)
      if (inSale) {
        saleDayRevenue += rev
        saleDayCount++
      } else {
        nonSaleDayRevenue += rev
        nonSaleDayCount++
      }
    }

    const avgDailyRevDuringSale = saleDayCount > 0 ? saleDayRevenue / saleDayCount : 0
    const avgDailyRevNonSale = nonSaleDayCount > 0 ? nonSaleDayRevenue / nonSaleDayCount : 0
    const saleMultiplier = avgDailyRevNonSale > 0 ? avgDailyRevDuringSale / avgDailyRevNonSale : 0

    const totalHistoricalRevenue = perf.reduce((sum, r) => sum + Number(r.net_steam_sales_usd || 0), 0)
    const totalHistoricalUnits = perf.reduce((sum, r) => sum + Number(r.net_units_sold || 0), 0)

    // 5. Simple statistical prediction (no AI needed for basic estimate)
    const basePrice = product.base_price_usd || 0
    const salePrice = basePrice * (1 - (discount_percentage || 50) / 100)
    const estimatedDailyUnits = saleDayCount > 0
      ? (perf.filter(r => salePeriods.some(p => r.date >= p.start && r.date <= p.end))
          .reduce((sum, r) => sum + Number(r.net_units_sold || 0), 0) / saleDayCount)
      : (nonSaleDayCount > 0
          ? (totalHistoricalUnits / nonSaleDayCount) * 2
          : 0)

    const statisticalPrediction = {
      estimated_daily_revenue: Math.round(estimatedDailyUnits * salePrice * 100) / 100,
      estimated_total_revenue: Math.round(estimatedDailyUnits * salePrice * duration_days * 100) / 100,
      estimated_daily_units: Math.round(estimatedDailyUnits),
      estimated_total_units: Math.round(estimatedDailyUnits * duration_days),
      sale_multiplier: Math.round(saleMultiplier * 100) / 100,
      avg_daily_revenue_during_sales: Math.round(avgDailyRevDuringSale * 100) / 100,
      avg_daily_revenue_non_sale: Math.round(avgDailyRevNonSale * 100) / 100,
    }

    // 6. Try to get AI analysis via Gemini
    let aiAnalysis: Record<string, unknown> | null = null

    const { data: geminiKey } = await supabase
      .from('service_api_keys')
      .select('api_key')
      .eq('service_name', 'gemini')
      .eq('is_active', true)
      .single()

    if (geminiKey?.api_key && (sales.length > 0 || perf.length > 0)) {
      try {
        const ai = new GoogleGenAI({ apiKey: geminiKey.api_key })

        const gameName = (product.game as unknown as Record<string, unknown>)?.name || 'Unknown'

        const prompt = `You are a video game sales analytics expert. Analyze the following historical data and provide a revenue prediction for a planned sale.

PRODUCT: "${productName}" (${product.product_type}) from game "${gameName}"
PLATFORM: ${platformName}
BASE PRICE: $${basePrice}

PLANNED SALE:
- Discount: ${discount_percentage}%
- Sale price: $${salePrice.toFixed(2)}
- Duration: ${duration_days} days
- Start date: ${start_date || 'Not set'}
${goal_type ? `- Goal: ${goal_type}` : ''}

HISTORICAL SALES (${sales.length} total):
${sales.slice(0, 10).map(s => `  - ${s.start_date} to ${s.end_date}: ${s.discount_percentage}% off (${s.sale_type}${s.sale_name ? ', ' + s.sale_name : ''})`).join('\n') || '  None recorded'}

PERFORMANCE STATS:
- Historical max discount: ${maxDiscount != null ? maxDiscount + '%' : 'N/A'}
- Average discount: ${avgDiscount != null ? avgDiscount + '%' : 'N/A'}
- Avg daily revenue during sales: $${avgDailyRevDuringSale.toFixed(2)}
- Avg daily revenue non-sale: $${avgDailyRevNonSale.toFixed(2)}
- Sale revenue multiplier: ${saleMultiplier.toFixed(2)}x
- Total historical revenue (${perf.length} days): $${totalHistoricalRevenue.toFixed(2)}
- Total historical units: ${totalHistoricalUnits}

Respond with ONLY valid JSON:
{
  "predicted_revenue": <number - estimated total revenue in USD>,
  "predicted_units": <number - estimated total units sold>,
  "confidence": "<low|medium|high>",
  "optimal_discount": <number - recommended discount percentage for maximum revenue>,
  "optimal_duration": <number - recommended sale duration in days>,
  "reasoning": "<2-3 sentence analysis>",
  "risk_factors": ["<risk 1>", "<risk 2>"],
  "opportunities": ["<opportunity 1>", "<opportunity 2>"]
}`

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash-lite',
          contents: prompt,
          config: { responseMimeType: 'application/json' },
        })

        const text = response.text || '{}'
        aiAnalysis = JSON.parse(text)
      } catch (err) {
        console.error('AI prediction error:', err)
        // AI failure is non-fatal — we still return statistical prediction
      }
    }

    return NextResponse.json({
      product: { name: productName, base_price: basePrice, type: product.product_type },
      platform: { name: platformName },
      planned: { discount_percentage, duration_days, sale_price: salePrice },
      historical: {
        total_sales: sales.length,
        max_discount: maxDiscount,
        avg_discount: avgDiscount,
        total_performance_days: perf.length,
        total_historical_revenue: Math.round(totalHistoricalRevenue * 100) / 100,
        total_historical_units: totalHistoricalUnits,
      },
      statistical_prediction: statisticalPrediction,
      ai_prediction: aiAnalysis,
      has_sufficient_data: perf.length >= 14,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
