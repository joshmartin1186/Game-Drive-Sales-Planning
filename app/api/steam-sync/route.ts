import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Helper to get Supabase client with service role key
function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing required environment variables: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

// Steam Partner API endpoint
const STEAM_PARTNER_API = 'https://partner.steam-api.com';

// Optimized configuration for local AND production
const SYNC_CONFIG = {
  BATCH_SIZE: 2,              // Process 2-3 dates in parallel (balanced)
  TIMEOUT_MS: 90000,          // 90 seconds per API call
  RETRY_ATTEMPTS: 3,          // Retry failed dates 3 times
  RETRY_BASE_DELAY: 2000,     // 2 seconds, doubles each retry (2s, 4s, 8s)
  INTER_BATCH_DELAY: 300,     // 300ms delay between batches
  DB_BATCH_SIZE: 500,         // Bulk insert 500 records at a time
  MAX_DATES_PER_REQUEST: 50,  // For chunked syncs (production)
};

interface SteamDetailedSalesResult {
  partnerid: string;
  date: string;
  line_item_type: string;
  packageid?: number;
  bundleid?: number;
  appid?: number;
  platform?: string;
  country_code: string;
  base_price?: string;
  sale_price?: string;
  currency?: string;
  gross_units_sold?: number;
  net_units_sold?: number;
  gross_sales_usd?: string;
  net_sales_usd?: string;
  primary_appid?: number;
  total_discount_percentage?: number;
}

interface SteamSalesResponse {
  response: {
    results?: SteamDetailedSalesResult[];
    package_info?: Array<{ packageid: number; package_name: string }>;
    app_info?: Array<{ appid: number; app_name: string }>;
    country_info?: Array<{ country_code: string; country_name: string; region: string }>;
    max_id?: string;
  };
}

interface ChangedDatesResponse {
  response: {
    dates?: string[];
    result_highwatermark?: string;
  };
}

interface SyncProgress {
  id?: string;
  client_id: string;
  sync_type: string;
  last_successful_date?: string;
  dates_completed: number;
  dates_total: number;
  dates_failed: number;
  status: 'in_progress' | 'completed' | 'failed' | 'cancelled';
  error_message?: string;
}

// Helper: Delay execution
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper: Timeout wrapper for promises
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    )
  ]);
}

// Helper: Fetch with retry and exponential backoff
async function fetchWithRetry<T>(
  fetchFn: () => Promise<T>,
  maxAttempts: number = SYNC_CONFIG.RETRY_ATTEMPTS,
  context: string = 'API call'
): Promise<T> {
  let lastError: Error | unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`[Retry] ${context} - Attempt ${attempt}/${maxAttempts}`);
      return await fetchFn();
    } catch (error) {
      lastError = error;
      console.error(`[Retry] ${context} - Attempt ${attempt} failed:`, error);

      if (attempt < maxAttempts) {
        const delayMs = SYNC_CONFIG.RETRY_BASE_DELAY * Math.pow(2, attempt - 1);
        console.log(`[Retry] Waiting ${delayMs}ms before retry...`);
        await delay(delayMs);
      }
    }
  }

  throw lastError;
}

// Progress tracking functions
async function getSyncProgress(supabase: ReturnType<typeof getSupabaseClient>, clientId: string): Promise<SyncProgress | null> {
  const { data, error} = await supabase
    .from('sync_progress')
    .select('*')
    .eq('client_id', clientId)
    .eq('sync_type', 'steam_api_sync')
    .eq('status', 'in_progress')
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching sync progress:', error);
  }

  return data;
}

async function createSyncProgress(supabase: ReturnType<typeof getSupabaseClient>, clientId: string, totalDates: number): Promise<string> {
  // Cancel any existing in-progress syncs
  await supabase
    .from('sync_progress')
    .update({ status: 'cancelled' })
    .eq('client_id', clientId)
    .eq('sync_type', 'steam_api_sync')
    .eq('status', 'in_progress');

  const { data, error } = await supabase
    .from('sync_progress')
    .insert({
      client_id: clientId,
      sync_type: 'steam_api_sync',
      dates_total: totalDates,
      dates_completed: 0,
      dates_failed: 0,
      status: 'in_progress'
    })
    .select()
    .single();

  if (error) throw error;
  return data.id;
}

async function updateSyncProgress(
  supabase: ReturnType<typeof getSupabaseClient>,
  clientId: string,
  lastDate: string,
  completedCount: number,
  failedCount: number
): Promise<void> {
  await supabase
    .from('sync_progress')
    .update({
      last_successful_date: lastDate,
      dates_completed: completedCount,
      dates_failed: failedCount,
      updated_at: new Date().toISOString()
    })
    .eq('client_id', clientId)
    .eq('sync_type', 'steam_api_sync')
    .eq('status', 'in_progress');
}

async function completeSyncProgress(supabase: ReturnType<typeof getSupabaseClient>, clientId: string): Promise<void> {
  await supabase
    .from('sync_progress')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('client_id', clientId)
    .eq('sync_type', 'steam_api_sync')
    .eq('status', 'in_progress');
}

async function failSyncProgress(supabase: ReturnType<typeof getSupabaseClient>, clientId: string, errorMessage: string): Promise<void> {
  await supabase
    .from('sync_progress')
    .update({
      status: 'failed',
      error_message: errorMessage,
      updated_at: new Date().toISOString()
    })
    .eq('client_id', clientId)
    .eq('sync_type', 'steam_api_sync')
    .eq('status', 'in_progress');
}

// Get changed dates from Steam API
async function getChangedDatesForPartner(
  apiKey: string,
  highwatermark: string
): Promise<{ success: boolean; dates?: string[]; highwatermark?: string; error?: string }> {
  return fetchWithRetry(async () => {
    const url = `${STEAM_PARTNER_API}/IPartnerFinancialsService/GetChangedDatesForPartner/v001/?key=${apiKey}&highwatermark=${highwatermark}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SYNC_CONFIG.TIMEOUT_MS);

    try {
      const response = await withTimeout(
        fetch(url, { signal: controller.signal }),
        SYNC_CONFIG.TIMEOUT_MS,
        `Steam API request timed out after ${SYNC_CONFIG.TIMEOUT_MS}ms`
      );
      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          success: false,
          error: `Steam API returned status ${response.status}`
        };
      }

      const data: ChangedDatesResponse = await withTimeout(
        response.json(),
        10000,
        'JSON parsing timed out after 10s'
      );
      return {
        success: true,
        dates: data.response?.dates || [],
        highwatermark: data.response?.result_highwatermark
      };
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        throw new Error('Steam API request timed out');
      }
      throw fetchError;
    }
  }, SYNC_CONFIG.RETRY_ATTEMPTS, 'GetChangedDatesForPartner');
}

// Get detailed sales for a specific date
async function getDetailedSalesForDate(
  apiKey: string,
  date: string
): Promise<{
  success: boolean;
  results?: SteamDetailedSalesResult[];
  metadata?: {
    packages: Map<number, string>;
    apps: Map<number, string>;
    countries: Map<string, { name: string; region: string }>;
  };
  error?: string;
}> {
  return fetchWithRetry(async () => {
    const allResults: SteamDetailedSalesResult[] = [];
    const packages = new Map<number, string>();
    const apps = new Map<number, string>();
    const countries = new Map<string, { name: string; region: string }>();

    let highwatermarkId = '0';
    let hasMoreData = true;

    // Paginate through all results for this date
    while (hasMoreData) {
      const url = `${STEAM_PARTNER_API}/IPartnerFinancialsService/GetDetailedSales/v001/?key=${apiKey}&date=${date}&highwatermark_id=${highwatermarkId}`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), SYNC_CONFIG.TIMEOUT_MS);

      try {
        const response = await withTimeout(
          fetch(url, { signal: controller.signal }),
          SYNC_CONFIG.TIMEOUT_MS,
          `Steam API request timed out after ${SYNC_CONFIG.TIMEOUT_MS}ms`
        );
        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`Steam API returned status ${response.status}`);
        }

        const data: SteamSalesResponse = await withTimeout(
          response.json(),
          10000,
          'JSON parsing timed out after 10s'
        );

        // Add results
        if (data.response.results) {
          allResults.push(...data.response.results);
        }

        // Store metadata
        data.response.package_info?.forEach(pkg => {
          packages.set(pkg.packageid, pkg.package_name);
        });
        data.response.app_info?.forEach(app => {
          apps.set(app.appid, app.app_name);
        });
        data.response.country_info?.forEach(country => {
          countries.set(country.country_code, {
            name: country.country_name,
            region: country.region
          });
        });

        // Check if there's more data
        if (data.response.max_id) {
          highwatermarkId = data.response.max_id;
        } else {
          hasMoreData = false;
        }
      } catch (fetchError) {
        clearTimeout(timeoutId);
        throw fetchError;
      }
    }

    return {
      success: true,
      results: allResults,
      metadata: { packages, apps, countries }
    };
  }, SYNC_CONFIG.RETRY_ATTEMPTS, `GetDetailedSales for ${date}`);
}

// Bulk store sales data (much faster than individual upserts)
async function bulkStoreSalesData(
  supabase: ReturnType<typeof getSupabaseClient>,
  clientId: string,
  allResults: SteamDetailedSalesResult[],
  metadata?: {
    packages: Map<number, string>;
    apps: Map<number, string>;
    countries: Map<string, { name: string; region: string }>;
  }
): Promise<{ imported: number; skipped: number }> {
  const records = allResults.map(result => {
    const date = result.date.replace(/\//g, '-');
    const productName = result.packageid
      ? metadata?.packages.get(result.packageid)
      : result.appid
        ? metadata?.apps.get(result.appid)
        : 'Unknown';
    const countryInfo = metadata?.countries.get(result.country_code);

    return {
      client_id: clientId,
      date: date,
      product_name: productName || 'Unknown',
      platform: result.platform || 'Steam',
      country_code: result.country_code,
      region: countryInfo?.region || 'Unknown',
      gross_units_sold: result.gross_units_sold || 0,
      net_units_sold: result.net_units_sold || 0,
      gross_revenue_usd: parseFloat(result.gross_sales_usd || '0'),
      net_revenue_usd: parseFloat(result.net_sales_usd || '0'),
      base_price: result.base_price ? parseFloat(result.base_price) / 100 : null,
      sale_price: result.sale_price ? parseFloat(result.sale_price) / 100 : null,
      currency: result.currency,
      discount_percentage: result.total_discount_percentage,
      steam_package_id: result.packageid?.toString(),
      steam_app_id: result.primary_appid?.toString() || result.appid?.toString(),
      line_item_type: result.line_item_type,
      updated_at: new Date().toISOString()
    };
  });

  // Insert in batches
  let imported = 0;
  let skipped = 0;

  for (let i = 0; i < records.length; i += SYNC_CONFIG.DB_BATCH_SIZE) {
    const batch = records.slice(i, i + SYNC_CONFIG.DB_BATCH_SIZE);

    const { error } = await supabase
      .from('performance_metrics')
      .upsert(batch, {
        onConflict: 'client_id,date,product_name,platform,country_code'
      });

    if (error) {
      console.error('Error bulk storing sales data:', error);
      skipped += batch.length;
    } else {
      imported += batch.length;
    }
  }

  return { imported, skipped };
}

// Main sync handler
export async function POST(request: Request) {
  try {
    const supabase = getSupabaseClient();
    const body = await request.json();
    const { client_id, start_date, end_date, resume = false } = body;

    if (!client_id) {
      return NextResponse.json(
        { error: 'Client ID is required' },
        { status: 400 }
      );
    }

    // Get Steam API key
    const { data: keyData, error: keyError } = await supabase
      .from('steam_api_keys')
      .select('api_key, publisher_key, highwatermark')
      .eq('client_id', client_id)
      .eq('is_active', true)
      .single();

    if (keyError || !keyData) {
      return NextResponse.json(
        { error: 'No active Steam API key found' },
        { status: 404 }
      );
    }

    const financialApiKey = keyData.publisher_key || keyData.api_key;

    // Get client name
    const { data: clientData } = await supabase
      .from('clients')
      .select('name')
      .eq('id', client_id)
      .single();

    console.log(`[Steam Sync] Starting sync for ${clientData?.name || client_id}`);

    // Check for existing progress
    const existingProgress = await getSyncProgress(supabase, client_id);

    // Step 1: Get all changed dates from Steam
    const highwatermark = resume && existingProgress ? '0' : (keyData.highwatermark || '0');
    const changedDates = await getChangedDatesForPartner(financialApiKey, highwatermark);

    if (!changedDates.success || !changedDates.dates) {
      await failSyncProgress(supabase, client_id, changedDates.error || 'Failed to get dates');
      return NextResponse.json(
        { error: changedDates.error || 'Failed to get changed dates' },
        { status: 500 }
      );
    }

    // Filter dates by range if specified
    let datesToSync = changedDates.dates;
    const totalDatesFromApi = datesToSync.length;

    if (start_date) {
      datesToSync = datesToSync.filter(d => d >= start_date.replace(/-/g, '/'));
    }
    if (end_date) {
      datesToSync = datesToSync.filter(d => d <= end_date.replace(/-/g, '/'));
    }

    // Resume: Skip already processed dates
    if (resume && existingProgress?.last_successful_date) {
      const lastDate = existingProgress.last_successful_date;
      datesToSync = datesToSync.filter(d => d > lastDate);
      console.log(`[Steam Sync] Resuming from ${lastDate}, ${datesToSync.length} dates remaining`);
    }

    console.log(`[Steam Sync] Dates from API: ${totalDatesFromApi}, After filter: ${datesToSync.length}`);

    if (datesToSync.length === 0) {
      await completeSyncProgress(supabase, client_id);
      return NextResponse.json({
        success: true,
        message: 'No new dates to sync',
        rowsImported: 0,
        rowsSkipped: 0
      });
    }

    // Create or update progress tracking
    if (!resume || !existingProgress) {
      await createSyncProgress(supabase, client_id, datesToSync.length);
    }

    // Step 2: Process dates in optimized batches
    let totalImported = 0;
    let totalSkipped = 0;
    let completedCount = existingProgress?.dates_completed || 0;
    let failedCount = existingProgress?.dates_failed || 0;
    const errors: string[] = [];

    console.log(`[Steam Sync] Processing ${datesToSync.length} dates in batches of ${SYNC_CONFIG.BATCH_SIZE}...`);

    const totalBatches = Math.ceil(datesToSync.length / SYNC_CONFIG.BATCH_SIZE);

    for (let batchStart = 0; batchStart < datesToSync.length; batchStart += SYNC_CONFIG.BATCH_SIZE) {
      const batch = datesToSync.slice(batchStart, batchStart + SYNC_CONFIG.BATCH_SIZE);
      const batchNumber = Math.floor(batchStart / SYNC_CONFIG.BATCH_SIZE) + 1;

      console.log(`[Steam Sync] Batch ${batchNumber}/${totalBatches} (dates ${batchStart + 1}-${Math.min(batchStart + SYNC_CONFIG.BATCH_SIZE, datesToSync.length)}/${datesToSync.length})`);

      try {
        // Fetch dates in parallel
        const batchPromises = batch.map(date => getDetailedSalesForDate(financialApiKey, date));
        const batchResults = await Promise.all(batchPromises);

        // Process results
        for (let i = 0; i < batch.length; i++) {
          const date = batch[i];
          const salesResult = batchResults[i];

          if (salesResult.success && salesResult.results) {
            try {
              const storeResult = await bulkStoreSalesData(supabase, 
                client_id,
                salesResult.results,
                salesResult.metadata
              );
              totalImported += storeResult.imported;
              totalSkipped += storeResult.skipped;
              completedCount++;

              // Update progress after each successful date
              await updateSyncProgress(supabase, client_id, date, completedCount, failedCount);
            } catch (storeError) {
              console.error(`[Steam Sync] Error storing data for ${date}:`, storeError);
              errors.push(`${date}: Failed to store`);
              failedCount++;
            }
          } else {
            console.error(`[Steam Sync] Failed to fetch ${date}:`, salesResult.error);
            errors.push(`${date}: ${salesResult.error}`);
            failedCount++;
          }
        }

        console.log(`[Steam Sync] Batch ${batchNumber}/${totalBatches} complete. Total: ${totalImported} imported, ${totalSkipped} skipped, ${failedCount} failed`);

        // Small delay between batches to avoid overwhelming API
        if (batchStart + SYNC_CONFIG.BATCH_SIZE < datesToSync.length) {
          await delay(SYNC_CONFIG.INTER_BATCH_DELAY);
        }
      } catch (batchError) {
        console.error(`[Steam Sync] Critical error in batch ${batchNumber}:`, batchError);
        errors.push(`Batch ${batchNumber}: ${batchError instanceof Error ? batchError.message : String(batchError)}`);
        // Continue to next batch
      }
    }

    // Update highwatermark
    if (changedDates.highwatermark) {
      await supabase
        .from('steam_api_keys')
        .update({
          highwatermark: changedDates.highwatermark,
          last_sync_date: new Date().toISOString().split('T')[0]
        })
        .eq('client_id', client_id);
    }

    // Complete or fail the sync
    if (errors.length === 0) {
      await completeSyncProgress(supabase, client_id);
    } else if (errors.length === datesToSync.length) {
      await failSyncProgress(supabase, client_id, errors.join('; '));
    }

    // Log import history
    await supabase
      .from('performance_import_history')
      .insert({
        client_id,
        import_type: 'steam_api_sync',
        date_range_start: start_date || datesToSync[0]?.replace(/\//g, '-'),
        date_range_end: end_date || datesToSync[datesToSync.length - 1]?.replace(/\//g, '-'),
        rows_imported: totalImported,
        rows_skipped: totalSkipped,
        status: errors.length === 0 ? 'completed' : 'partial',
        error_message: errors.length > 0 ? errors.slice(0, 10).join('; ') : null
      });

    return NextResponse.json({
      success: true,
      message: `Synced ${datesToSync.length} date(s) from Steam Financial API.`,
      rowsImported: totalImported,
      rowsSkipped: totalSkipped,
      datesProcessed: completedCount,
      datesFailed: failedCount,
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
      clientName: clientData?.name
    });

  } catch (error) {
    console.error('Error syncing Steam data:', error);
    return NextResponse.json(
      { error: `Failed to sync Steam data: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}

// GET - Check sync progress
export async function GET(request: Request) {
  try {
    const supabase = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('client_id');

    if (!clientId) {
      return NextResponse.json(
        { error: 'Client ID is required' },
        { status: 400 }
      );
    }

    const progress = await getSyncProgress(supabase, clientId);

    return NextResponse.json({
      hasInProgressSync: !!progress,
      progress: progress || null
    });

  } catch (error) {
    console.error('Error checking sync progress:', error);
    return NextResponse.json(
      { error: 'Failed to check progress' },
      { status: 500 }
    );
  }
}
