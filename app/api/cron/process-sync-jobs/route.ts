import { NextResponse } from 'next/server';
import { serverSupabase as supabase } from '@/lib/supabase';

const STEAM_PARTNER_API = 'https://partner.steam-api.com';
const DOMO_AUTH_URL = 'https://api.domo.com/oauth/token';
const DOMO_DATASETS_URL = 'https://api.domo.com/v1/datasets';
const DOMO_EXPORT_URL = 'https://api.domo.com/v1/datasets/{datasetId}/data';
const MAX_DATES_PER_RUN = 1; // Process 1 date per cron execution to avoid timeout

// Force dynamic rendering - required for accessing request headers
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

// This endpoint will be called by Vercel Cron
// It processes one pending job at a time
export async function GET(request: Request) {
  try {
    // Verify this is a cron request (Vercel adds this header)
    const authHeader = request.headers.get('authorization');
    const expectedAuth = `Bearer ${process.env.CRON_SECRET}`;

    // Log for debugging
    console.log('[Cron] Auth check:', {
      hasAuthHeader: !!authHeader,
      hasCronSecret: !!process.env.CRON_SECRET,
      authMatches: authHeader === expectedAuth
    });

    // Temporarily allow manual testing - REMOVE THIS LATER
    const isManualTest = request.headers.get('user-agent')?.includes('Mozilla');

    if (!isManualTest && authHeader !== expectedAuth) {
      return NextResponse.json({
        error: 'Unauthorized',
        debug: {
          hasAuthHeader: !!authHeader,
          hasCronSecret: !!process.env.CRON_SECRET
        }
      }, { status: 401 });
    }

    console.log('[Cron] Starting sync job processor');

    // Reset stuck jobs (running for > 10 minutes)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: stuckJobs } = await supabase
      .from('sync_jobs')
      .select('id')
      .eq('status', 'running')
      .lt('started_at', tenMinutesAgo);

    if (stuckJobs && stuckJobs.length > 0) {
      console.log(`[Cron] Resetting ${stuckJobs.length} stuck jobs`);
      await supabase
        .from('sync_jobs')
        .update({ status: 'pending', started_at: null })
        .in('id', stuckJobs.map(j => j.id));
    }

    // Get one pending job (oldest first)
    const { data: job, error: jobError } = await supabase
      .from('sync_jobs')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1)
      .single();

    if (jobError || !job) {
      console.log('[Cron] No pending jobs found');
      return NextResponse.json({ message: 'No pending jobs' });
    }

    console.log(`[Cron] Processing job ${job.id} (type: ${job.job_type}) for client ${job.client_id}`);

    // Mark job as running
    await supabase
      .from('sync_jobs')
      .update({
        status: 'running',
        started_at: new Date().toISOString()
      })
      .eq('id', job.id);

    // Route to the correct handler based on job type
    if (job.job_type === 'playstation_sync') {
      return await processPlayStationJob(job);
    }

    // Default: Steam sync
    // Get the client's API keys
    const { data: keyData, error: keyError } = await supabase
      .from('steam_api_keys')
      .select('*')
      .eq('client_id', job.client_id)
      .eq('is_active', true)
      .single();

    if (keyError || !keyData) {
      await supabase
        .from('sync_jobs')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_message: 'No active Steam API key found'
        })
        .eq('id', job.id);

      return NextResponse.json({ error: 'No API key found' }, { status: 404 });
    }

    const financialApiKey = keyData.publisher_key || keyData.api_key;
    const useHighwatermark = job.force_full_sync ? '0' : (keyData.highwatermark || '0');

    // Get changed dates from Steam
    const changedDates = await getChangedDatesForPartner(financialApiKey, useHighwatermark);

    if (!changedDates.success) {
      await supabase
        .from('sync_jobs')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_message: changedDates.error || 'Failed to get dates from Steam'
        })
        .eq('id', job.id);

      return NextResponse.json({ error: changedDates.error }, { status: 500 });
    }

    // Filter dates to requested range
    let datesToSync = changedDates.dates || [];
    if (job.start_date || job.end_date) {
      datesToSync = datesToSync.filter((date: string) => {
        const d = date.replace(/\//g, '-');
        if (job.start_date && d < job.start_date) return false;
        if (job.end_date && d > job.end_date) return false;
        return true;
      });
    }

    // Update total dates if this is the first run
    if (job.total_dates === 0) {
      await supabase
        .from('sync_jobs')
        .update({ total_dates: datesToSync.length })
        .eq('id', job.id);
    }

    // Get dates we haven't processed yet
    const alreadyProcessed = job.dates_processed || 0;
    const remainingDates = datesToSync.slice(alreadyProcessed);
    const datesToProcess = remainingDates.slice(0, MAX_DATES_PER_RUN);

    console.log(`[Cron] Processing ${datesToProcess.length} dates (${alreadyProcessed} already done, ${remainingDates.length} remaining)`);

    if (datesToProcess.length === 0) {
      // Job complete!
      await supabase
        .from('sync_jobs')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', job.id);

      return NextResponse.json({ message: 'Job completed' });
    }

    // Process the dates
    let totalImported = job.rows_imported || 0;
    let totalSkipped = job.rows_skipped || 0;
    const errors: string[] = [];

    for (const dateStr of datesToProcess) {
      try {
        console.log(`[Cron] Starting to process date: ${dateStr}`);
        const result = await processSingleDate(financialApiKey, dateStr, job.client_id);
        console.log(`[Cron] Completed ${dateStr}: imported=${result.imported}, skipped=${result.skipped}`);
        totalImported += result.imported;
        totalSkipped += result.skipped;
      } catch (error) {
        const errorMsg = `Error processing ${dateStr}: ${error instanceof Error ? error.message : String(error)}`;
        console.error(`[Cron] ${errorMsg}`);
        console.error('[Cron] Full error:', error);
        errors.push(errorMsg);
      }
    }

    const newDatesProcessed = alreadyProcessed + datesToProcess.length;
    const isComplete = newDatesProcessed >= datesToSync.length;

    // Update job progress
    await supabase
      .from('sync_jobs')
      .update({
        status: isComplete ? 'completed' : 'running',
        dates_processed: newDatesProcessed,
        rows_imported: totalImported,
        rows_skipped: totalSkipped,
        completed_at: isComplete ? new Date().toISOString() : null,
        error_message: errors.length > 0 ? errors.join('; ') : null
      })
      .eq('id', job.id);

    // Update highwatermark
    if (changedDates.highwatermark) {
      await supabase
        .from('steam_api_keys')
        .update({ highwatermark: changedDates.highwatermark })
        .eq('client_id', job.client_id);
    }

    // If not complete, requeue the job by setting status back to pending
    if (!isComplete) {
      await supabase
        .from('sync_jobs')
        .update({ status: 'pending' })
        .eq('id', job.id);
    }

    return NextResponse.json({
      message: isComplete ? 'Job completed' : 'Batch processed, more pending',
      jobId: job.id,
      datesProcessed: newDatesProcessed,
      totalDates: datesToSync.length,
      rowsImported: totalImported,
      rowsSkipped: totalSkipped,
      isComplete
    });

  } catch (error) {
    console.error('[Cron] Error processing jobs:', error);
    return NextResponse.json(
      { error: 'Failed to process jobs' },
      { status: 500 }
    );
  }
}

// Helper function to get changed dates from Steam API
async function getChangedDatesForPartner(
  apiKey: string,
  highwatermark: string
): Promise<{ success: boolean; dates?: string[]; highwatermark?: string; error?: string }> {
  try {
    const url = `${STEAM_PARTNER_API}/IPartnerFinancialsService/GetChangedDatesForPartner/v001/?key=${apiKey}&highwatermark=${highwatermark}`;
    const response = await fetch(url);

    if (!response.ok) {
      return {
        success: false,
        error: `Steam API returned status ${response.status}`
      };
    }

    const data = await response.json();
    return {
      success: true,
      dates: data.response?.dates || [],
      highwatermark: data.response?.highwatermark
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to connect to Steam API: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

// Helper function to process a single date
async function processSingleDate(
  apiKey: string,
  dateStr: string,
  clientId: string
): Promise<{ imported: number; skipped: number }> {
  // Use GetDetailedSales endpoint (same as the working sync route)
  const url = `${STEAM_PARTNER_API}/IPartnerFinancialsService/GetDetailedSales/v001/?key=${apiKey}&date=${dateStr}&highwatermark_id=0`;
  console.log(`[Cron] Fetching data for date: ${dateStr}`);
  console.log(`[Cron] API URL: ${url.replace(apiKey, 'REDACTED')}`);
  const response = await fetch(url);

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Cron] Steam API error for ${dateStr}: ${response.status}`);
    console.error(`[Cron] Error body: ${errorText}`);
    throw new Error(`Steam API returned status ${response.status} for date ${dateStr}`);
  }

  const data = await response.json();
  const results = data.response?.results || [];
  console.log(`[Cron] Date ${dateStr}: Found ${results.length} sales records`);

  // Create metadata maps from response
  const packages = new Map();
  const apps = new Map();
  data.response?.package_info?.forEach((p: any) => packages.set(p.packageid, p.package_name));
  data.response?.app_info?.forEach((a: any) => apps.set(a.appid, a.app_name));

  // Batch process all records at once instead of individual upserts
  const salesDataMap = new Map<string, any>();

  results.forEach((result: any) => {
    const productName = result.packageid
      ? packages.get(result.packageid)
      : result.appid
        ? apps.get(result.appid)
        : 'Unknown';

    const salesData = {
      client_id: clientId,
      sale_date: result.date.replace(/\//g, '-'),
      app_id: (result.primary_appid || result.appid)?.toString() || null,
      app_name: productName || null,
      product_type: result.packageid ? 'package' : 'app',
      country_code: result.country_code || null,
      units_sold: result.net_units_sold || 0,
      gross_revenue: parseFloat(result.gross_sales_usd || '0'),
      net_revenue: parseFloat(result.net_sales_usd || '0')
    };

    // Create unique key from constraint fields to deduplicate
    const key = `${salesData.client_id}|${salesData.sale_date}|${salesData.app_id}|${salesData.product_type}|${salesData.country_code}`;

    // If duplicate, sum the values
    if (salesDataMap.has(key)) {
      const existing = salesDataMap.get(key);
      existing.units_sold += salesData.units_sold;
      existing.gross_revenue += salesData.gross_revenue;
      existing.net_revenue += salesData.net_revenue;
    } else {
      salesDataMap.set(key, salesData);
    }
  });

  const salesDataBatch = Array.from(salesDataMap.values());
  console.log(`[Cron] Deduplicated ${results.length} records to ${salesDataBatch.length} unique rows`);

  // Single batch upsert for all records
  const { error, count } = await supabase
    .from('steam_sales')
    .upsert(salesDataBatch, {
      onConflict: 'client_id,sale_date,app_id,product_type,country_code',
      ignoreDuplicates: false,
      count: 'exact'
    });

  if (error) {
    console.error(`[Cron] Error batch upserting:`, error);
    return { imported: 0, skipped: results.length };
  }

  return { imported: count || salesDataBatch.length, skipped: 0 };
}

// ============================================================
// PlayStation (Domo) Sync Processing
// ============================================================

interface SyncJob {
  id: string;
  client_id: string;
  job_type: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  force_full_sync: boolean;
  is_auto_sync: boolean;
  total_dates: number;
  dates_processed: number;
  rows_imported: number;
  rows_skipped: number;
  [key: string]: unknown;
}

async function processPlayStationJob(job: SyncJob) {
  try {
    console.log(`[Cron/PS] Processing PlayStation sync job ${job.id}`);

    // Get the client's PlayStation API credentials
    const { data: keyData, error: keyError } = await supabase
      .from('playstation_api_keys')
      .select('ps_client_id, client_secret, scope')
      .eq('client_id', job.client_id)
      .eq('is_active', true)
      .single();

    if (keyError || !keyData) {
      await supabase
        .from('sync_jobs')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_message: 'No active PlayStation API credentials found'
        })
        .eq('id', job.id);

      return NextResponse.json({ error: 'No PlayStation API key found' }, { status: 404 });
    }

    // Step 1: Authenticate with Domo API
    const authResult = await getDomoAccessToken(keyData.ps_client_id, keyData.client_secret, keyData.scope);

    if (!authResult.success || !authResult.token) {
      await supabase
        .from('sync_jobs')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_message: authResult.error || 'Failed to authenticate with Domo API'
        })
        .eq('id', job.id);

      return NextResponse.json({ error: authResult.error }, { status: 500 });
    }

    console.log('[Cron/PS] Authenticated with Domo API');

    // Step 2: List available datasets
    const datasetsResult = await listDomoDatasets(authResult.token);

    if (!datasetsResult.success || !datasetsResult.datasets?.length) {
      await supabase
        .from('sync_jobs')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_message: 'No datasets available from Domo API'
        })
        .eq('id', job.id);

      return NextResponse.json({ error: 'No datasets found' }, { status: 404 });
    }

    console.log(`[Cron/PS] Found ${datasetsResult.datasets.length} total datasets`);

    // Filter to only sales-relevant datasets (skip engagement, trophies, news, etc.)
    const SALES_KEYWORDS = ['sales', 'voucher', 'monetisation', 'dlc'];
    const salesDatasets = datasetsResult.datasets.filter(d => {
      const name = d.name.toLowerCase();
      return SALES_KEYWORDS.some(kw => name.includes(kw)) && d.rows > 0;
    });

    // If no sales datasets found, fall back to all non-empty datasets
    // Sort by row count (smallest first) so smaller datasets get processed before timeout
    // Skip datasets > 100K rows for now (too large for 60s cron window)
    const MAX_ROWS_PER_DATASET = 100000;
    const allTargets = salesDatasets.length > 0 ? salesDatasets : datasetsResult.datasets.filter(d => d.rows > 0);
    const targetDatasets = allTargets
      .filter(d => d.rows <= MAX_ROWS_PER_DATASET)
      .sort((a, b) => a.rows - b.rows);
    console.log(`[Cron/PS] ${salesDatasets.length} sales datasets, ${targetDatasets.length} target datasets (after size filter), skipped ${allTargets.length - targetDatasets.length} large datasets`);

    // Step 3: Export data from each dataset
    let totalImported = job.rows_imported || 0;
    let totalSkipped = job.rows_skipped || 0;
    const errors: string[] = [];

    // Process one dataset per cron run to stay within timeout
    const alreadyProcessed = job.dates_processed || 0;
    const datasetsToProcess = targetDatasets.slice(alreadyProcessed, alreadyProcessed + 1);

    if (datasetsToProcess.length === 0) {
      await supabase
        .from('sync_jobs')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', job.id);

      // Update last_auto_sync timestamp
      await supabase
        .from('playstation_api_keys')
        .update({
          last_auto_sync: new Date().toISOString(),
          last_sync_date: new Date().toISOString().split('T')[0]
        })
        .eq('client_id', job.client_id);

      return NextResponse.json({ message: 'PlayStation sync completed' });
    }

    // Update total if first run
    if (job.total_dates === 0) {
      await supabase
        .from('sync_jobs')
        .update({ total_dates: targetDatasets.length })
        .eq('id', job.id);
    }

    for (const dataset of datasetsToProcess) {
      try {
        console.log(`[Cron/PS] Exporting dataset: ${dataset.name} (${dataset.id})`);
        const result = await exportDomoDataset(authResult.token, dataset.id, job.client_id, job.start_date, job.end_date);
        totalImported += result.imported;
        totalSkipped += result.skipped;
        console.log(`[Cron/PS] Dataset ${dataset.name}: imported=${result.imported}, skipped=${result.skipped}`);
      } catch (error) {
        const errorMsg = `Error processing dataset ${dataset.name}: ${error instanceof Error ? error.message : String(error)}`;
        console.error(`[Cron/PS] ${errorMsg}`);
        errors.push(errorMsg);
      }
    }

    const newProcessed = alreadyProcessed + datasetsToProcess.length;
    const isComplete = newProcessed >= targetDatasets.length;

    // Update job progress
    await supabase
      .from('sync_jobs')
      .update({
        status: isComplete ? 'completed' : 'running',
        dates_processed: newProcessed,
        rows_imported: totalImported,
        rows_skipped: totalSkipped,
        completed_at: isComplete ? new Date().toISOString() : null,
        error_message: errors.length > 0 ? errors.join('; ') : null
      })
      .eq('id', job.id);

    if (isComplete) {
      // Update last sync timestamps
      await supabase
        .from('playstation_api_keys')
        .update({
          last_auto_sync: new Date().toISOString(),
          last_sync_date: new Date().toISOString().split('T')[0]
        })
        .eq('client_id', job.client_id);

      // Schedule next sync if auto-sync is enabled
      const { data: psKey } = await supabase
        .from('playstation_api_keys')
        .select('auto_sync_enabled, sync_frequency_hours')
        .eq('client_id', job.client_id)
        .single();

      if (psKey?.auto_sync_enabled && job.is_auto_sync) {
        const nextDue = new Date();
        nextDue.setHours(nextDue.getHours() + (psKey.sync_frequency_hours || 24));
        await supabase
          .from('playstation_api_keys')
          .update({ next_sync_due: nextDue.toISOString() })
          .eq('client_id', job.client_id);
      }
    } else {
      // Requeue for next cron run
      await supabase
        .from('sync_jobs')
        .update({ status: 'pending' })
        .eq('id', job.id);
    }

    return NextResponse.json({
      message: isComplete ? 'PlayStation sync completed' : 'PlayStation batch processed, more pending',
      jobId: job.id,
      datasetsProcessed: newProcessed,
      totalDatasets: targetDatasets.length,
      rowsImported: totalImported,
      rowsSkipped: totalSkipped,
      isComplete
    });

  } catch (error) {
    console.error('[Cron/PS] Error:', error);
    await supabase
      .from('sync_jobs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: `PlayStation sync error: ${error instanceof Error ? error.message : String(error)}`
      })
      .eq('id', job.id);

    return NextResponse.json({ error: 'PlayStation sync failed' }, { status: 500 });
  }
}

// Get Domo OAuth access token
async function getDomoAccessToken(
  clientId: string,
  clientSecret: string,
  scope?: string
): Promise<{ success: boolean; token?: string; error?: string }> {
  try {
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const effectiveScope = scope || 'data';
    const authUrl = `${DOMO_AUTH_URL}?grant_type=client_credentials&scope=${encodeURIComponent(effectiveScope)}`;

    const response = await fetch(authUrl, {
      method: 'GET',
      headers: { 'Authorization': `Basic ${basicAuth}` }
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `Domo auth failed: ${response.status} ${errorText}` };
    }

    const data = await response.json();
    if (!data.access_token) {
      return { success: false, error: 'No access token received from Domo' };
    }

    return { success: true, token: data.access_token };
  } catch (error) {
    return { success: false, error: `Domo connection error: ${error instanceof Error ? error.message : String(error)}` };
  }
}

// List Domo datasets
async function listDomoDatasets(
  accessToken: string
): Promise<{ success: boolean; datasets?: Array<{ id: string; name: string; rows: number }>; error?: string }> {
  try {
    const response = await fetch(`${DOMO_DATASETS_URL}?limit=50&offset=0`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      return { success: false, error: `Failed to list datasets: ${response.status}` };
    }

    const data = await response.json();
    const datasets = Array.isArray(data)
      ? data.map((d: { id?: string; name?: string; datasetId?: string; displayName?: string; rows?: number }) => ({
        id: d.id || d.datasetId || '',
        name: d.name || d.displayName || d.id || 'Unknown',
        rows: d.rows || 0
      })).filter(d => d.id)
      : [];

    return { success: true, datasets };
  } catch (error) {
    return { success: false, error: `Failed to fetch datasets: ${error instanceof Error ? error.message : String(error)}` };
  }
}

// Export a Domo dataset and store records
async function exportDomoDataset(
  accessToken: string,
  datasetId: string,
  clientId: string,
  startDate: string | null,
  endDate: string | null
): Promise<{ imported: number; skipped: number }> {
  const url = DOMO_EXPORT_URL.replace('{datasetId}', datasetId) + '?includeHeader=true';

  // 45s timeout to leave room for DB operations within the 60s cron window
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'text/csv'
    },
    signal: controller.signal
  });

  clearTimeout(timeout);

  if (!response.ok) {
    throw new Error(`Domo export failed: ${response.status}`);
  }

  const csvText = await response.text();
  const records = parseCSVToRecords(csvText);

  // Log the first record's keys to help debug column mapping
  if (records.length > 0) {
    console.log(`[Cron/PS] CSV columns found: ${Object.keys(records[0]).join(', ')}`);
  }

  console.log(`[Cron/PS] Parsed ${records.length} records from dataset ${datasetId}`);

  // Filter by date range if specified
  const filteredRecords = records.filter(record => {
    // Try multiple date column names from the Domo CSV
    const date = (record.date || record.month_start_date || record.week_start_date || '') as string;
    if (!date) return false;
    const dateStr = date.split('T')[0]; // normalize
    if (startDate && dateStr < startDate) return false;
    if (endDate && dateStr > endDate) return false;
    return true;
  });

  console.log(`[Cron/PS] ${filteredRecords.length} records after date filter`);

  if (filteredRecords.length === 0) {
    return { imported: 0, skipped: 0 };
  }

  // Store in performance_metrics table
  let imported = 0;
  let skipped = 0;

  // Batch upsert in chunks of 100
  const chunkSize = 100;
  for (let i = 0; i < filteredRecords.length; i += chunkSize) {
    const chunk = filteredRecords.slice(i, i + chunkSize).map(record => {
      // Map actual Domo/PlayStation CSV columns to our schema
      // Domo columns: Date, Title Name, Product Name, Platform, Country Code,
      // Country/Region, SIE Region, Sales Quantity, Sales Incl Tax $, Sales Exc Tax $,
      // Local Currency, Transaction Type
      const date = (record.date || record.month_start_date || record.week_start_date || '') as string;
      const productName = (record.product_name || record.title_name || record.concept || record.title || record.sku || 'Unknown') as string;
      // Normalize platform to "PlayStation" to match the connected-platforms filter
      // Raw data has PS4/PS5 but the analytics filter groups by connected platform name
      const platform = 'PlayStation';
      const countryCode = (record.country_code || record['country/region'] || record.country || 'Unknown') as string;
      const region = (record.sie_region || record['country/region'] || record.region || 'Unknown') as string;
      // Sales data columns from PlayStation Domo CSV
      const unitsSold = Number(record.sales_quantity || record.units_sold || record.quantity || 0);
      const grossRevenue = Number(record['sales_incl_tax_$'] || record.sales_incl_tax_usd || record.gross_revenue || record.revenue || 0);
      const netRevenue = Number(record['sales_exc_tax_$'] || record.sales_exc_tax_usd || record.net_revenue || record.revenue || 0);
      const currency = (record.local_currency || record.currency || 'USD') as string;

      return {
        client_id: clientId,
        date: date.toString().split('T')[0],
        product_name: productName,
        platform,
        country_code: countryCode,
        region,
        gross_units_sold: unitsSold,
        net_units_sold: unitsSold,
        gross_revenue_usd: grossRevenue,
        net_revenue_usd: netRevenue,
        currency,
        updated_at: new Date().toISOString()
      };
    });

    const { error, count } = await supabase
      .from('performance_metrics')
      .upsert(chunk, {
        onConflict: 'client_id,date,product_name,platform,country_code',
        ignoreDuplicates: false,
        count: 'exact'
      });

    if (error) {
      console.error(`[Cron/PS] Batch upsert error:`, error);
      skipped += chunk.length;
    } else {
      imported += count || chunk.length;
    }
  }

  return { imported, skipped };
}

// Parse CSV text to records (shared utility)
interface PSNRecord {
  date: string;
  product_name?: string;
  title_name?: string;
  title?: string;
  sku?: string;
  region?: string;
  country?: string;
  units_sold?: number;
  quantity?: number;
  gross_revenue?: number;
  net_revenue?: number;
  revenue?: number;
  currency?: string;
  [key: string]: unknown;
}

function parseCSVToRecords(csvText: string): PSNRecord[] {
  const lines = csvText.split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]);
  const records: PSNRecord[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const record: PSNRecord = { date: '' };

    headers.forEach((header, idx) => {
      const normalizedKey = header.toLowerCase().replace(/\s+/g, '_');
      record[normalizedKey] = values[idx] || '';
    });

    if (!record.date) {
      record.date = (record.transaction_date || record.sale_date || '') as string;
    }

    records.push(record);
  }

  return records;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}
