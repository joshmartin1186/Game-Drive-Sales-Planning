import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { GoogleGenerativeAI } from '@google/generative-ai'

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase environment variables')
  }

  return createClient(supabaseUrl, supabaseKey)
}

// GET - List PR insights for a game/client
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabase()
    const { searchParams } = new URL(request.url)

    const gameId = searchParams.get('game_id')
    const clientId = searchParams.get('client_id')
    const showDismissed = searchParams.get('show_dismissed') === 'true'
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    let query = supabase
      .from('pr_insights')
      .select('*', { count: 'exact' })
      .order('generated_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (gameId) query = query.eq('game_id', gameId)
    if (clientId) query = query.eq('client_id', clientId)
    if (!showDismissed) query = query.eq('is_dismissed', false)

    const { data, error, count } = await query

    if (error) {
      console.error('Error fetching pr_insights:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data, count })
  } catch (err) {
    console.error('PR insights GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT - Dismiss an insight
export async function PUT(request: NextRequest) {
  try {
    const supabase = getSupabase()
    const body = await request.json()

    const { id } = body
    if (!id) {
      return NextResponse.json({ error: 'Insight ID is required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('pr_insights')
      .update({ is_dismissed: true, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error dismissing pr_insight:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error('PR insights PUT error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST - Trigger insight generation via Gemini AI
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabase()
    const body = await request.json()

    const { game_id, client_id } = body
    if (!game_id || !client_id) {
      return NextResponse.json({ error: 'game_id and client_id are required' }, { status: 400 })
    }

    const apiKey = process.env.GOOGLE_AI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'GOOGLE_AI_API_KEY is not configured' }, { status: 500 })
    }

    // Fetch all confirmed annotations for this game/client
    const { data: annotations, error: annError } = await supabase
      .from('pr_annotations')
      .select('*')
      .eq('game_id', game_id)
      .eq('client_id', client_id)
      .order('event_date', { ascending: false })

    if (annError) {
      console.error('Error fetching annotations for insight generation:', annError)
      return NextResponse.json({ error: annError.message }, { status: 500 })
    }

    if (!annotations || annotations.length === 0) {
      return NextResponse.json({ error: 'No annotations found for this game/client. Add annotations first.' }, { status: 400 })
    }

    // Fetch game and client names for context
    const { data: game } = await supabase
      .from('games')
      .select('name')
      .eq('id', game_id)
      .single()

    const { data: client } = await supabase
      .from('clients')
      .select('name')
      .eq('id', client_id)
      .single()

    const gameName = (game as Record<string, unknown> | null)?.name || 'Unknown Game'
    const clientName = (client as Record<string, unknown> | null)?.name || 'Unknown Client'

    // Build the prompt
    const annotationSummaries = annotations.map((a: Record<string, unknown>) =>
      `- ${a.event_date}: ${a.event_type} at ${a.outlet_or_source || 'unknown source'} | Effect: ${a.observed_effect} (${a.direction}) | Confidence: ${a.confidence}`
    ).join('\n')

    const prompt = `You are a PR analytics expert for the gaming industry. Analyze the following PR coverage annotations for "${gameName}" (client: "${clientName}") and generate actionable insights.

PR Annotations (most recent first):
${annotationSummaries}

Generate 3-5 insights as a JSON array. Each insight should have:
- "insight_type": one of "pattern", "recommendation", "anomaly", "trend"
- "title": short headline (max 100 chars)
- "body": 2-3 sentence explanation with specific data references
- "priority": one of "high", "medium", "low"

Focus on:
1. Patterns in which outlets/sources drive the strongest effects
2. Timing patterns (best days/weeks for coverage impact)
3. Which event types (review, preview, interview, etc.) correlate with positive outcomes
4. Anomalies or unexpected results worth investigating
5. Actionable recommendations for future PR strategy

Respond ONLY with a valid JSON array, no markdown or explanation.`

    // Call Gemini
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })
    const result = await model.generateContent(prompt)
    const responseText = result.response.text()

    // Parse the JSON response
    let insights: Array<Record<string, unknown>>
    try {
      // Strip markdown code fences if present
      const cleaned = responseText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
      insights = JSON.parse(cleaned)
      if (!Array.isArray(insights)) {
        throw new Error('Response is not an array')
      }
    } catch (parseErr) {
      console.error('Failed to parse Gemini response:', parseErr, responseText)
      return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 })
    }

    // Write insights to the database
    const now = new Date().toISOString()
    const records = insights.map((insight) => ({
      game_id,
      client_id,
      insight_type: insight.insight_type || 'pattern',
      title: insight.title || 'Untitled Insight',
      body: insight.body || '',
      priority: insight.priority || 'medium',
      is_dismissed: false,
      generated_at: now,
    }))

    const { data: inserted, error: insertError } = await supabase
      .from('pr_insights')
      .insert(records)
      .select()

    if (insertError) {
      console.error('Error inserting pr_insights:', insertError)
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    return NextResponse.json({ data: inserted, generated: inserted?.length || 0 })
  } catch (err) {
    console.error('PR insights POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
