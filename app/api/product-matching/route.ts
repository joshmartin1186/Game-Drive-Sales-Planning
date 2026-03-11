import { NextResponse } from 'next/server';
import { serverSupabase as supabase } from '@/lib/supabase';

// GET: List product mappings for a client with optional filters
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('client_id');
    const status = searchParams.get('status'); // 'pending' | 'confirmed' | 'ignored' | 'all'
    const platform = searchParams.get('platform'); // 'steam' | 'playstation'

    if (!clientId) {
      return NextResponse.json({ error: 'client_id is required' }, { status: 400 });
    }

    // Build query
    let query = supabase
      .from('api_product_mappings')
      .select('*, products(id, name, product_type, steam_product_id, game_id), games(id, name, steam_app_id)')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }
    if (platform) {
      query = query.eq('platform', platform);
    }

    const { data: mappings, error } = await query;

    if (error) {
      console.error('[Product Matching] Error fetching mappings:', error);
      return NextResponse.json({ error: 'Failed to fetch mappings' }, { status: 500 });
    }

    // Get occurrence counts from performance_metrics for each pending item
    const pendingNames = (mappings || [])
      .filter((m: Record<string, unknown>) => m.status === 'pending')
      .map((m: Record<string, unknown>) => m.external_product_name as string);

    let occurrenceCounts: Record<string, number> = {};
    if (pendingNames.length > 0) {
      // Count rows in performance_metrics for each name
      const { data: countData } = await supabase
        .from('performance_metrics')
        .select('product_name')
        .eq('client_id', clientId)
        .in('product_name', pendingNames);

      if (countData) {
        for (const row of countData) {
          const name = row.product_name as string;
          occurrenceCounts[name] = (occurrenceCounts[name] || 0) + 1;
        }
      }

      // Also count steam_sales
      const { data: steamCountData } = await supabase
        .from('steam_sales')
        .select('app_name')
        .eq('client_id', clientId)
        .in('app_name', pendingNames);

      if (steamCountData) {
        for (const row of steamCountData) {
          const name = row.app_name as string;
          occurrenceCounts[name] = (occurrenceCounts[name] || 0) + 1;
        }
      }
    }

    // For pending items, also get match candidates from the product catalog
    let candidates: Record<string, Array<{ product_id: string; product_name: string; game_id: string; game_name: string; steam_product_id: string | null }>> = {};
    if (pendingNames.length > 0) {
      // Load all products for this client
      const { data: clientProducts } = await supabase
        .from('products')
        .select('id, name, steam_product_id, product_aliases, game_id, games!inner(id, name, steam_app_id, client_id)')
        .eq('games.client_id', clientId);

      if (clientProducts) {
        candidates = {};
        for (const name of pendingNames) {
          candidates[name] = clientProducts.map((p: Record<string, unknown>) => {
            const game = p.games as Record<string, unknown>;
            return {
              product_id: p.id as string,
              product_name: p.name as string,
              game_id: game.id as string,
              game_name: game.name as string,
              steam_product_id: (p.steam_product_id as string) || null,
            };
          });
        }
      }
    }

    // Get summary counts
    const { data: summaryData } = await supabase
      .from('api_product_mappings')
      .select('status')
      .eq('client_id', clientId);

    const summary = {
      total_confirmed: 0,
      total_pending: 0,
      total_ignored: 0,
    };
    if (summaryData) {
      for (const row of summaryData) {
        if (row.status === 'confirmed') summary.total_confirmed++;
        else if (row.status === 'pending') summary.total_pending++;
        else if (row.status === 'ignored') summary.total_ignored++;
      }
    }

    return NextResponse.json({
      mappings: (mappings || []).map((m: Record<string, unknown>) => ({
        ...m,
        occurrence_count: occurrenceCounts[m.external_product_name as string] || 0,
        match_candidates: candidates[m.external_product_name as string] || [],
      })),
      summary,
    });
  } catch (error) {
    console.error('[Product Matching] Error:', error);
    return NextResponse.json(
      { error: `Failed to fetch product mappings: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}
