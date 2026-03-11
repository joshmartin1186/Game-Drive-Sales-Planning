import { NextResponse } from 'next/server';
import { serverSupabase as supabase } from '@/lib/supabase';

// POST: Create a new game+product from API data and confirm the mapping
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      mapping_id,
      client_id,
      game_name,
      game_id: existingGameId,
      product_name,
      product_type = 'base',
      steam_app_id,
      steam_product_id,
      platform_ids = [],
      add_alias = true,
    } = body;

    if (!mapping_id || !client_id || !product_name) {
      return NextResponse.json(
        { error: 'mapping_id, client_id, and product_name are required' },
        { status: 400 }
      );
    }

    // Get the mapping
    const { data: mapping, error: fetchError } = await supabase
      .from('api_product_mappings')
      .select('id, external_product_name, platform, steam_package_id, steam_app_id')
      .eq('id', mapping_id)
      .single();

    if (fetchError || !mapping) {
      return NextResponse.json({ error: 'Mapping not found' }, { status: 404 });
    }

    let gameId = existingGameId;

    // Create game if needed
    if (!gameId && game_name) {
      const { data: newGame, error: gameError } = await supabase
        .from('games')
        .insert({
          client_id,
          name: game_name,
          steam_app_id: steam_app_id || mapping.steam_app_id || null,
          pr_tracking_enabled: false,
        })
        .select('id')
        .single();

      if (gameError) {
        console.error('[Product Matching] Error creating game:', gameError);
        return NextResponse.json({ error: `Failed to create game: ${gameError.message}` }, { status: 500 });
      }
      gameId = newGame.id;
    }

    if (!gameId) {
      return NextResponse.json({ error: 'Either game_id or game_name is required' }, { status: 400 });
    }

    // Build product aliases
    const productAliases: string[] = [];
    if (add_alias && mapping.external_product_name.toLowerCase() !== product_name.toLowerCase()) {
      productAliases.push(mapping.external_product_name);
    }

    // Create product
    const { data: newProduct, error: productError } = await supabase
      .from('products')
      .insert({
        game_id: gameId,
        name: product_name,
        product_type,
        steam_product_id: steam_product_id || mapping.steam_package_id || null,
        product_aliases: productAliases.length > 0 ? productAliases : null,
      })
      .select('id')
      .single();

    if (productError) {
      console.error('[Product Matching] Error creating product:', productError);
      return NextResponse.json({ error: `Failed to create product: ${productError.message}` }, { status: 500 });
    }

    // Create product_platforms entries
    if (platform_ids.length > 0) {
      const platformEntries = platform_ids.map((pid: string) => ({
        product_id: newProduct.id,
        platform_id: pid,
      }));
      await supabase.from('product_platforms').insert(platformEntries);
    }

    // Confirm the mapping
    await supabase
      .from('api_product_mappings')
      .update({
        product_id: newProduct.id,
        game_id: gameId,
        status: 'confirmed',
        match_type: 'create_new',
        confidence_score: 1.0,
        confirmed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', mapping_id);

    // Backfill performance data
    const { count: metricsUpdated } = await supabase
      .from('performance_metrics')
      .update({ product_id: newProduct.id, game_id: gameId })
      .eq('client_id', client_id)
      .eq('product_name', mapping.external_product_name)
      .is('product_id', null);

    let steamSalesUpdated = 0;
    if (mapping.platform === 'steam') {
      const { count } = await supabase
        .from('steam_sales')
        .update({ product_id: newProduct.id, game_id: gameId })
        .eq('client_id', client_id)
        .eq('app_name', mapping.external_product_name)
        .is('product_id', null);
      steamSalesUpdated = count || 0;
    }

    return NextResponse.json({
      success: true,
      game_id: gameId,
      product_id: newProduct.id,
      backfilled: {
        performance_metrics: metricsUpdated || 0,
        steam_sales: steamSalesUpdated,
      },
    });
  } catch (error) {
    console.error('[Product Matching] Error:', error);
    return NextResponse.json(
      { error: `Failed to create product: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}
