import { NextResponse } from 'next/server';
import { serverSupabase as supabase } from '@/lib/supabase';
import { backfillPerformanceData } from '@/lib/product-matching';

// POST: Bulk backfill product_id/game_id on performance data for all confirmed mappings
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { client_id, platform } = body;

    if (!client_id) {
      return NextResponse.json({ error: 'client_id is required' }, { status: 400 });
    }

    const result = await backfillPerformanceData(supabase, client_id, platform);

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to backfill: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}
