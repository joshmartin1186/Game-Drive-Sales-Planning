// Product Matching Library
// Maps external API product names/IDs to internal product records
// Used during Steam/PlayStation sync to link sales data to the product catalog

import { SupabaseClient } from '@supabase/supabase-js';

export interface ExternalProduct {
  platform: 'steam' | 'playstation';
  external_product_name: string;
  steam_package_id?: string;
  steam_app_id?: string;
  playstation_sku?: string;
  client_id: string;
}

export interface MatchCandidate {
  product_id: string;
  product_name: string;
  game_id: string;
  game_name: string;
  match_reason: string;
  confidence: number;
}

export interface MatchResult {
  external_product: ExternalProduct;
  match_type: 'existing' | 'auto_id' | 'auto_name' | 'auto_alias' | 'no_match';
  confidence_score: number;
  matched_product_id?: string;
  matched_game_id?: string;
  matched_product_name?: string;
  candidates: MatchCandidate[];
  mapping_id?: string;
  is_new: boolean; // true if this is a newly discovered external product
}

// Normalize a product name for fuzzy comparison
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Load all products+games for a client (cached per call to matchProducts)
interface ClientProduct {
  product_id: string;
  product_name: string;
  product_name_normalized: string;
  product_aliases: string[];
  steam_product_id: string | null;
  game_id: string;
  game_name: string;
  game_name_normalized: string;
  steam_app_id: string | null;
}

async function loadClientProducts(
  supabase: SupabaseClient,
  clientId: string
): Promise<ClientProduct[]> {
  const { data, error } = await supabase
    .from('products')
    .select('id, name, steam_product_id, product_aliases, game_id, games!inner(id, name, steam_app_id, client_id)')
    .eq('games.client_id', clientId);

  if (error || !data) return [];

  return data.map((p: Record<string, unknown>) => {
    const game = p.games as Record<string, unknown>;
    return {
      product_id: p.id as string,
      product_name: p.name as string,
      product_name_normalized: normalizeName(p.name as string),
      product_aliases: ((p.product_aliases as string[]) || []).map((a: string) => a.toLowerCase()),
      steam_product_id: (p.steam_product_id as string) || null,
      game_id: game.id as string,
      game_name: game.name as string,
      game_name_normalized: normalizeName(game.name as string),
      steam_app_id: (game.steam_app_id as string) || null,
    };
  });
}

// Step 1: Check existing confirmed mappings
async function checkExistingMappings(
  supabase: SupabaseClient,
  items: ExternalProduct[]
): Promise<Map<string, { product_id: string | null; game_id: string | null; mapping_id: string }>> {
  const result = new Map<string, { product_id: string | null; game_id: string | null; mapping_id: string }>();
  if (items.length === 0) return result;

  // Build keys for lookup
  const clientId = items[0].client_id;
  const names = items.map(i => i.external_product_name);

  const { data, error } = await supabase
    .from('api_product_mappings')
    .select('id, external_product_name, platform, product_id, game_id')
    .eq('client_id', clientId)
    .in('status', ['confirmed', 'ignored'])
    .in('external_product_name', names);

  if (error || !data) return result;

  for (const mapping of data) {
    const key = `${mapping.platform}:${mapping.external_product_name}`;
    result.set(key, {
      product_id: mapping.product_id,
      game_id: mapping.game_id,
      mapping_id: mapping.id,
    });
  }

  return result;
}

// Step 2: Match by Steam external IDs
function matchByExternalId(
  item: ExternalProduct,
  clientProducts: ClientProduct[]
): MatchCandidate | null {
  if (item.platform !== 'steam') return null;

  // Try matching steam_package_id against products.steam_product_id
  if (item.steam_package_id) {
    const match = clientProducts.find(
      p => p.steam_product_id && p.steam_product_id === item.steam_package_id
    );
    if (match) {
      return {
        product_id: match.product_id,
        product_name: match.product_name,
        game_id: match.game_id,
        game_name: match.game_name,
        match_reason: `Steam package ID match (${item.steam_package_id})`,
        confidence: 1.0,
      };
    }
  }

  // Try matching steam_app_id against games.steam_app_id, then pick base product
  if (item.steam_app_id) {
    const gameMatch = clientProducts.find(
      p => p.steam_app_id && p.steam_app_id === item.steam_app_id
    );
    if (gameMatch) {
      return {
        product_id: gameMatch.product_id,
        product_name: gameMatch.product_name,
        game_id: gameMatch.game_id,
        game_name: gameMatch.game_name,
        match_reason: `Steam app ID match (${item.steam_app_id})`,
        confidence: 0.95,
      };
    }
  }

  return null;
}

// Step 3: Match by name (exact, alias, normalized, substring)
function matchByName(
  item: ExternalProduct,
  clientProducts: ClientProduct[]
): MatchCandidate[] {
  const candidates: MatchCandidate[] = [];
  const externalNameLower = item.external_product_name.toLowerCase();
  const externalNameNormalized = normalizeName(item.external_product_name);

  for (const p of clientProducts) {
    // Exact match (case-insensitive)
    if (p.product_name.toLowerCase() === externalNameLower) {
      candidates.push({
        product_id: p.product_id,
        product_name: p.product_name,
        game_id: p.game_id,
        game_name: p.game_name,
        match_reason: 'Exact name match',
        confidence: 0.95,
      });
      continue;
    }

    // Alias match
    if (p.product_aliases.includes(externalNameLower)) {
      candidates.push({
        product_id: p.product_id,
        product_name: p.product_name,
        game_id: p.game_id,
        game_name: p.game_name,
        match_reason: `Alias match: "${item.external_product_name}"`,
        confidence: 0.90,
      });
      continue;
    }

    // Normalized match
    if (p.product_name_normalized === externalNameNormalized && externalNameNormalized.length > 3) {
      candidates.push({
        product_id: p.product_id,
        product_name: p.product_name,
        game_id: p.game_id,
        game_name: p.game_name,
        match_reason: 'Normalized name match',
        confidence: 0.85,
      });
      continue;
    }

    // Substring match: external name contains game name (at least 4 chars)
    if (p.game_name_normalized.length >= 4 && externalNameNormalized.includes(p.game_name_normalized)) {
      candidates.push({
        product_id: p.product_id,
        product_name: p.product_name,
        game_id: p.game_id,
        game_name: p.game_name,
        match_reason: `Contains game name "${p.game_name}"`,
        confidence: 0.70,
      });
      // Don't continue — there may be multiple products per game
    }
  }

  // Sort by confidence descending
  candidates.sort((a, b) => b.confidence - a.confidence);

  // Deduplicate by product_id (keep highest confidence)
  const seen = new Set<string>();
  return candidates.filter(c => {
    if (seen.has(c.product_id)) return false;
    seen.add(c.product_id);
    return true;
  });
}

// Main matching function
export async function matchProducts(
  supabase: SupabaseClient,
  externalProducts: ExternalProduct[]
): Promise<MatchResult[]> {
  if (externalProducts.length === 0) return [];

  const clientId = externalProducts[0].client_id;
  const results: MatchResult[] = [];

  // Load client's product catalog once
  const clientProducts = await loadClientProducts(supabase, clientId);

  // Check existing confirmed mappings
  const existingMappings = await checkExistingMappings(supabase, externalProducts);

  // Also check which names already have pending mappings
  const pendingNames = new Set<string>();
  const { data: pendingData } = await supabase
    .from('api_product_mappings')
    .select('external_product_name, platform')
    .eq('client_id', clientId)
    .eq('status', 'pending');
  if (pendingData) {
    for (const p of pendingData) {
      pendingNames.add(`${p.platform}:${p.external_product_name}`);
    }
  }

  for (const item of externalProducts) {
    const key = `${item.platform}:${item.external_product_name}`;

    // Step 1: Already mapped?
    const existing = existingMappings.get(key);
    if (existing) {
      results.push({
        external_product: item,
        match_type: 'existing',
        confidence_score: 1.0,
        matched_product_id: existing.product_id || undefined,
        matched_game_id: existing.game_id || undefined,
        candidates: [],
        mapping_id: existing.mapping_id,
        is_new: false,
      });
      continue;
    }

    // Already has a pending mapping? Skip re-matching
    if (pendingNames.has(key)) {
      results.push({
        external_product: item,
        match_type: 'no_match',
        confidence_score: 0,
        candidates: [],
        is_new: false,
      });
      continue;
    }

    // Step 2: Try ID-based matching (Steam)
    const idMatch = matchByExternalId(item, clientProducts);
    if (idMatch && idMatch.confidence >= 0.85) {
      // Auto-confirm high-confidence ID match
      const mapping = await createMapping(supabase, item, idMatch.product_id, idMatch.game_id, 'auto_id', idMatch.confidence, 'confirmed');
      results.push({
        external_product: item,
        match_type: 'auto_id',
        confidence_score: idMatch.confidence,
        matched_product_id: idMatch.product_id,
        matched_game_id: idMatch.game_id,
        matched_product_name: idMatch.product_name,
        candidates: [idMatch],
        mapping_id: mapping?.id,
        is_new: true,
      });
      continue;
    }

    // Step 3: Try name-based matching
    const nameCandidates = matchByName(item, clientProducts);

    if (nameCandidates.length === 1 && nameCandidates[0].confidence >= 0.85) {
      // Single high-confidence match — auto-confirm
      const best = nameCandidates[0];
      const matchType = best.confidence >= 0.95 ? 'auto_name' : 'auto_alias';
      const mapping = await createMapping(supabase, item, best.product_id, best.game_id, matchType, best.confidence, 'confirmed');
      results.push({
        external_product: item,
        match_type: matchType as MatchResult['match_type'],
        confidence_score: best.confidence,
        matched_product_id: best.product_id,
        matched_game_id: best.game_id,
        matched_product_name: best.product_name,
        candidates: nameCandidates,
        mapping_id: mapping?.id,
        is_new: true,
      });
      continue;
    }

    // Step 4: Ambiguous or no match — create pending mapping
    const mapping = await createMapping(supabase, item, null, null, 'manual', nameCandidates[0]?.confidence || 0, 'pending');
    results.push({
      external_product: item,
      match_type: 'no_match',
      confidence_score: nameCandidates[0]?.confidence || 0,
      candidates: nameCandidates,
      mapping_id: mapping?.id,
      is_new: true,
    });
  }

  return results;
}

// Create or upsert a mapping record
async function createMapping(
  supabase: SupabaseClient,
  item: ExternalProduct,
  productId: string | null,
  gameId: string | null,
  matchType: string,
  confidence: number,
  status: 'confirmed' | 'pending'
): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from('api_product_mappings')
    .upsert({
      client_id: item.client_id,
      platform: item.platform,
      external_product_name: item.external_product_name,
      steam_package_id: item.steam_package_id || null,
      steam_app_id: item.steam_app_id || null,
      playstation_sku: item.playstation_sku || null,
      product_id: productId,
      game_id: gameId,
      match_type: matchType,
      confidence_score: confidence,
      status,
      confirmed_at: status === 'confirmed' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'client_id,platform,external_product_name',
    })
    .select('id')
    .single();

  if (error) {
    console.error('[Product Matching] Error creating mapping:', error);
    return null;
  }
  return data;
}

// Backfill product_id/game_id on performance data for confirmed mappings
export async function backfillPerformanceData(
  supabase: SupabaseClient,
  clientId: string,
  platform?: string
): Promise<{ updated_metrics: number; updated_steam_sales: number }> {
  // Get all confirmed mappings for this client
  const query = supabase
    .from('api_product_mappings')
    .select('external_product_name, platform, product_id, game_id, steam_app_id')
    .eq('client_id', clientId)
    .eq('status', 'confirmed')
    .not('product_id', 'is', null);

  if (platform) {
    query.eq('platform', platform);
  }

  const { data: mappings, error } = await query;
  if (error || !mappings) return { updated_metrics: 0, updated_steam_sales: 0 };

  let updatedMetrics = 0;
  let updatedSteamSales = 0;

  for (const mapping of mappings) {
    // Update performance_metrics
    const { count: metricsCount } = await supabase
      .from('performance_metrics')
      .update({
        product_id: mapping.product_id,
        game_id: mapping.game_id,
      })
      .eq('client_id', clientId)
      .eq('product_name', mapping.external_product_name)
      .is('product_id', null);

    updatedMetrics += metricsCount || 0;

    // Update steam_sales (match by app_name)
    if (mapping.platform === 'steam') {
      const { count: salesCount } = await supabase
        .from('steam_sales')
        .update({
          product_id: mapping.product_id,
          game_id: mapping.game_id,
        })
        .eq('client_id', clientId)
        .eq('app_name', mapping.external_product_name)
        .is('product_id', null);

      updatedSteamSales += salesCount || 0;
    }
  }

  return { updated_metrics: updatedMetrics, updated_steam_sales: updatedSteamSales };
}
