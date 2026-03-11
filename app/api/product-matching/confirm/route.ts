import { NextResponse } from 'next/server';
import { serverSupabase as supabase } from '@/lib/supabase';

// POST: Confirm a mapping — user picks a product for an external product name
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { mapping_id, product_id, game_id } = body;

    if (!mapping_id || !product_id) {
      return NextResponse.json(
        { error: 'mapping_id and product_id are required' },
        { status: 400 }
      );
    }

    // Get the mapping to know the external name and client
    const { data: mapping, error: fetchError } = await supabase
      .from('api_product_mappings')
      .select('id, client_id, external_product_name, platform')
      .eq('id', mapping_id)
      .single();

    if (fetchError || !mapping) {
      return NextResponse.json({ error: 'Mapping not found' }, { status: 404 });
    }

    // Determine game_id if not provided — look it up from the product
    let resolvedGameId = game_id;
    if (!resolvedGameId) {
      const { data: product } = await supabase
        .from('products')
        .select('game_id')
        .eq('id', product_id)
        .single();
      resolvedGameId = product?.game_id || null;
    }

    // Update the mapping to confirmed
    const { error: updateError } = await supabase
      .from('api_product_mappings')
      .update({
        product_id,
        game_id: resolvedGameId,
        status: 'confirmed',
        match_type: 'manual',
        confidence_score: 1.0,
        confirmed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', mapping_id);

    if (updateError) {
      console.error('[Product Matching] Error confirming mapping:', updateError);
      return NextResponse.json({ error: 'Failed to confirm mapping' }, { status: 500 });
    }

    // Backfill product_id on performance_metrics rows
    const { count: metricsUpdated } = await supabase
      .from('performance_metrics')
      .update({ product_id, game_id: resolvedGameId })
      .eq('client_id', mapping.client_id)
      .eq('product_name', mapping.external_product_name)
      .is('product_id', null);

    // Backfill product_id on steam_sales rows
    let steamSalesUpdated = 0;
    if (mapping.platform === 'steam') {
      const { count } = await supabase
        .from('steam_sales')
        .update({ product_id, game_id: resolvedGameId })
        .eq('client_id', mapping.client_id)
        .eq('app_name', mapping.external_product_name)
        .is('product_id', null);
      steamSalesUpdated = count || 0;
    }

    // Also add the external name as a product alias for future import matching
    const { data: productData } = await supabase
      .from('products')
      .select('product_aliases')
      .eq('id', product_id)
      .single();

    if (productData) {
      const existingAliases: string[] = productData.product_aliases || [];
      const aliasLower = mapping.external_product_name.toLowerCase();
      if (!existingAliases.map((a: string) => a.toLowerCase()).includes(aliasLower)) {
        await supabase
          .from('products')
          .update({ product_aliases: [...existingAliases, mapping.external_product_name] })
          .eq('id', product_id);
      }
    }

    return NextResponse.json({
      success: true,
      backfilled: {
        performance_metrics: metricsUpdated || 0,
        steam_sales: steamSalesUpdated,
      },
    });
  } catch (error) {
    console.error('[Product Matching] Error:', error);
    return NextResponse.json(
      { error: `Failed to confirm mapping: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}
