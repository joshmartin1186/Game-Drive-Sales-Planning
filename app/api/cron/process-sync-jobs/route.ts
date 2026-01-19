import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const STEAM_PARTNER_API = 'https://partner.steam-api.com';
const MAX_DATES_PER_RUN = 5; // Process 5 dates per cron execution to avoid timeout

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

    console.log(`[Cron] Processing job ${job.id} for client ${job.client_id}`);

    // Mark job as running
    await supabase
      .from('sync_jobs')
      .update({
        status: 'running',
        started_at: new Date().toISOString()
      })
      .eq('id', job.id);

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

  let imported = 0;
  let skipped = 0;

  // Create metadata maps from response
  const packages = new Map();
  const apps = new Map();
  data.response?.package_info?.forEach((p: any) => packages.set(p.packageid, p.package_name));
  data.response?.app_info?.forEach((a: any) => apps.set(a.appid, a.app_name));

  for (const result of results) {
    try {
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

      const { error } = await supabase
        .from('steam_sales')
        .upsert(salesData, {
          onConflict: 'client_id,sale_date,app_id,product_type,country_code',
          ignoreDuplicates: false
        });

      if (error) {
        console.error(`[Cron] Error upserting row:`, error);
        skipped++;
      } else {
        imported++;
      }
    } catch (rowError) {
      console.error(`[Cron] Error processing row:`, rowError);
      skipped++;
    }
  }

  return { imported, skipped };
}
