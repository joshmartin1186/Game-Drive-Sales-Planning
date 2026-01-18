# Background Sync Setup Guide

This guide explains how to set up the background Steam sync feature so you can trigger syncs and close your browser while they continue running.

## How It Works

1. **User triggers sync** → Creates a job record in Supabase `sync_jobs` table
2. **Vercel Cron** → Runs every minute to check for pending jobs
3. **Job processor** → Processes 30 dates at a time, updates progress
4. **UI polls status** → Shows real-time progress, you can close browser anytime

## Setup Steps

### 1. Create the Supabase Table

Run this SQL in your Supabase SQL Editor:

```sql
-- Copy and paste the contents of:
-- supabase/migrations/add_sync_jobs_table.sql
```

Or use the Supabase CLI:
```bash
supabase db push
```

### 2. Add Environment Variable for Cron Security

In your Vercel dashboard:

1. Go to **Settings → Environment Variables**
2. Add a new variable:
   - **Key**: `CRON_SECRET`
   - **Value**: Generate a random string (e.g., use `openssl rand -hex 32`)
   - **Environment**: Production, Preview, Development

### 3. Deploy to Vercel

The `vercel.json` file is already configured with a cron job that runs every minute:

```json
{
  "crons": [
    {
      "path": "/api/cron/process-sync-jobs",
      "schedule": "* * * * *"
    }
  ]
}
```

Simply push your code to GitHub and Vercel will automatically:
- Deploy the new API endpoints
- Set up the cron job

### 4. Verify It's Working

1. Go to **Settings** page
2. Click "Sync Steam Data" for any client with an API key
3. You should see "Sync job started! Processing in background..."
4. Close your browser/computer
5. Come back later and check the Analytics dashboard - data should be there!

## Architecture

### API Endpoints

- `POST /api/steam-sync/trigger` - Creates a new sync job
- `GET /api/steam-sync/status?job_id=xxx` - Check job progress
- `GET /api/cron/process-sync-jobs` - Cron endpoint that processes jobs

### Database Table

The `sync_jobs` table tracks:
- Job status (pending/running/completed/failed)
- Progress (dates processed, rows imported)
- Timestamps (created, started, completed)
- Error messages if something fails

### Cron Job

Runs every minute and:
1. Finds oldest pending job
2. Processes up to 30 dates
3. Updates progress in database
4. Requeues if more dates remain

## Troubleshooting

### Cron job not running

Check Vercel deployment logs:
1. Go to Vercel dashboard
2. Click on your project
3. Go to "Cron Jobs" tab
4. Check execution logs

### Job stuck in "pending" or "running"

Check the Supabase `sync_jobs` table:
```sql
SELECT * FROM sync_jobs ORDER BY created_at DESC LIMIT 10;
```

If a job is stuck, you can manually reset it:
```sql
UPDATE sync_jobs SET status = 'pending' WHERE id = 'xxx';
```

### Sync failing with errors

Check:
1. Steam API key is valid
2. `CRON_SECRET` environment variable is set in Vercel
3. Vercel function logs for detailed error messages

## Cost Considerations

This solution uses only services you already have:
- ✅ Vercel (Free plan: 2 Cron jobs, runs every minute)
- ✅ Supabase (Free plan: unlimited database operations)
- ✅ No additional services or payments required

The cron job runs every minute but exits immediately if there are no pending jobs, so it won't use many execution minutes.
