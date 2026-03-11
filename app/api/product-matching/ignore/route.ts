import { NextResponse } from 'next/server';
import { serverSupabase as supabase } from '@/lib/supabase';

// POST: Mark a mapping as ignored
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { mapping_id } = body;

    if (!mapping_id) {
      return NextResponse.json({ error: 'mapping_id is required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('api_product_mappings')
      .update({
        status: 'ignored',
        updated_at: new Date().toISOString(),
      })
      .eq('id', mapping_id);

    if (error) {
      return NextResponse.json({ error: 'Failed to ignore mapping' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to ignore mapping: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}
