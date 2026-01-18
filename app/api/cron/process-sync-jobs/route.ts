import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const STEAM_PARTNER_API = 'https://partner.steam-api.com';
const MAX_DATES_PER_RUN = 30; // Process 30 dates per cron execution

// This endpoint will be called by Vercel Cron
// It processes one pending job at a time
export async function GET(request: Request) {
  try {
    // Verify this is a cron request (Vercel adds this header)
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[Cron] Starting sync job processor');

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
        const result = await processSingleDate(financialApiKey, dateStr, job.client_id);
        totalImported += result.imported;
        totalSkipped += result.skipped;
      } catch (error) {
        const errorMsg = `Error processing ${dateStr}: ${error instanceof Error ? error.message : String(error)}`;
        console.error(errorMsg);
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
  const url = `${STEAM_PARTNER_API}/IPartnerFinancialsService/GetDailyFinancialDataForPartner/v001/?key=${apiKey}&date=${dateStr}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Steam API returned status ${response.status}`);
  }

  const data = await response.json();
  const rows = data.response?.rows || [];

  let imported = 0;
  let skipped = 0;

  for (const row of rows) {
    const salesData = {
      client_id: clientId,
      sale_date: dateStr.replace(/\//g, '-'),
      app_id: row.app_id?.toString() || null,
      app_name: row.app_name || null,
      product_type: row.product_type || null,
      country_code: row.country_code || null,
      units_sold: typeof row.units_sold === 'string' ? parseInt(row.units_sold) : (row.units_sold || 0),
      gross_revenue: typeof row.gross_revenue === 'string' ? parseFloat(row.gross_revenue) : (row.gross_revenue || 0),
      net_revenue: typeof row.net_revenue === 'string' ? parseFloat(row.net_revenue) : (row.net_revenue || 0)
    };

    const { error } = await supabase
      .from('steam_sales')
      .upsert(salesData, {
        onConflict: 'client_id,sale_date,app_id,product_type,country_code',
        ignoreDuplicates: false
      });

    if (error) {
      console.error(`Error upserting row:`, error);
      skipped++;
    } else {
      imported++;
    }
  }

  return { imported, skipped };
}
