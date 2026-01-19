import { NextResponse } from 'next/server';
import { serverSupabase as supabase } from '@/lib/supabase';

// GET - Check status of a sync job
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('job_id');
    const clientId = searchParams.get('client_id');

    if (!jobId && !clientId) {
      return NextResponse.json(
        { error: 'Either job_id or client_id is required' },
        { status: 400 }
      );
    }

    let result;

    if (jobId) {
      result = await supabase
        .from('sync_jobs')
        .select('*')
        .eq('id', jobId)
        .single();
    } else {
      // Get the most recent job for this client
      result = await supabase
        .from('sync_jobs')
        .select('*')
        .eq('client_id', clientId!)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
    }

    const { data: job, error } = result;

    if (error || !job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    // Calculate progress percentage
    const progressPercent = job.total_dates > 0
      ? Math.round((job.dates_processed / job.total_dates) * 100)
      : 0;

    return NextResponse.json({
      jobId: job.id,
      status: job.status,
      createdAt: job.created_at,
      startedAt: job.started_at,
      completedAt: job.completed_at,
      progress: {
        totalDates: job.total_dates,
        datesProcessed: job.dates_processed,
        percentComplete: progressPercent,
        rowsImported: job.rows_imported,
        rowsSkipped: job.rows_skipped
      },
      error: job.error_message,
      result: job.result_data
    });

  } catch (error) {
    console.error('Error checking sync job status:', error);
    return NextResponse.json(
      { error: 'Failed to check job status' },
      { status: 500 }
    );
  }
}
