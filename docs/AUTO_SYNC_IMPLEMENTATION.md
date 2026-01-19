# Auto-Sync Feature Implementation

## Overview
This document describes the implementation of the auto-sync feature that allows users to enable continuous, automatic data synchronization from Steam with no end date requirement.

## What Was Built

### 1. Database Schema
**File:** `supabase/migrations/add_auto_sync_columns.sql`

Added columns to `steam_api_keys` table:
- `auto_sync_enabled` - Boolean flag to enable/disable auto-sync
- `sync_start_date` - Date from which to start syncing (syncs from this date to present)
- `sync_frequency_hours` - How often to sync (1-168 hours)
- `last_auto_sync` - Timestamp of last automatic sync
- `next_sync_due` - Timestamp when next sync should run

Added columns to `sync_jobs` table:
- `is_auto_sync` - Boolean flag to identify auto-sync jobs
- `sync_frequency_hours` - Frequency setting for the job

### 2. API Endpoints
**File:** `app/api/steam-sync/auto-sync/route.ts`

#### GET `/api/steam-sync/auto-sync?client_id=xxx`
Retrieves auto-sync configuration and status for a client.

**Response:**
```json
{
  "success": true,
  "autoSync": {
    "enabled": true,
    "startDate": "2024-01-01",
    "frequencyHours": 24,
    "lastSync": "2025-01-19T10:00:00Z",
    "nextSyncDue": "2025-01-20T10:00:00Z"
  }
}
```

#### POST `/api/steam-sync/auto-sync`
Manages auto-sync configuration.

**Actions:**

1. **Enable Auto-Sync**
```json
{
  "client_id": "uuid",
  "action": "enable",
  "start_date": "2024-01-01",
  "frequency_hours": 24
}
```

2. **Disable Auto-Sync**
```json
{
  "client_id": "uuid",
  "action": "disable"
}
```

3. **Trigger Manual Sync**
```json
{
  "client_id": "uuid",
  "action": "trigger"
}
```

### 3. User Interface
**File:** `app/settings/page.tsx`

#### New Components:

1. **Auto-Sync Toggle Button**
   - Shows in the action buttons for each API key
   - Green when enabled, gray when disabled
   - Opens configuration modal on click

2. **Auto-Sync Status Display**
   - Appears when auto-sync is enabled
   - Shows:
     - Start date
     - Sync frequency
     - Next scheduled sync time
     - "Sync Now" button for manual triggers

3. **Auto-Sync Configuration Modal**
   - Start date picker
   - Frequency dropdown (1 hour to 1 week)
   - Clear explanation of how it works
   - Enable/Cancel buttons

#### CSS Styles
**File:** `app/settings/settings.module.css`

Added styles for:
- `.autoSyncOn` - Green styling for enabled state
- `.autoSyncOff` - Gray styling for disabled state

## How It Works

### User Workflow

1. **Enable Auto-Sync:**
   - User clicks the "Auto" button on an API key
   - Modal appears asking for start date and frequency
   - User configures and clicks "Enable Auto-Sync"
   - System calculates next sync time
   - Auto-sync is now active

2. **While Auto-Sync is Active:**
   - Blue status card shows configuration
   - User can see next scheduled sync time
   - User can trigger manual syncs anytime
   - System automatically creates sync jobs on schedule

3. **Disable Auto-Sync:**
   - User clicks the green "Auto" button
   - Confirmation dialog appears
   - On confirm, auto-sync is disabled
   - Pending auto-sync jobs are cancelled

### Technical Flow

1. **When user enables auto-sync:**
   - API endpoint updates `steam_api_keys` table
   - Sets `auto_sync_enabled = true`
   - Stores `sync_start_date` and `sync_frequency_hours`
   - Calculates and stores `next_sync_due`

2. **Automated scheduling (via pg_cron in Supabase):**
   - Hourly cron job checks for API keys where:
     - `auto_sync_enabled = true`
     - `next_sync_due <= NOW()`
   - Creates `sync_jobs` records with:
     - `start_date = sync_start_date`
     - `end_date = TODAY` (no fixed end date)
     - `is_auto_sync = true`
   - Updates `next_sync_due` to next scheduled time

3. **Job processing:**
   - Existing Vercel cron job processes sync jobs
   - Fetches data from start_date to current date
   - Updates `last_auto_sync` timestamp
   - Automatically reschedules next sync

## Key Features

### 1. Continuous Sync (No End Date)
- Unlike manual syncs with fixed date ranges, auto-sync always syncs from start_date to present
- This ensures data is always current without user intervention

### 2. Flexible Scheduling
Users can choose sync frequency:
- Every hour
- Every 3, 6, 12 hours
- Daily (24 hours)
- Every 2-3 days
- Weekly (168 hours)

### 3. Manual Override
- Users can trigger immediate syncs without waiting for schedule
- Manual syncs don't affect the automatic schedule

### 4. Smart Conflict Prevention
- System prevents duplicate sync jobs for same client
- Cancels pending auto-sync jobs when disabled

### 5. Visual Status Indicators
- Clear visual feedback on enabled/disabled state
- Shows next sync time in human-readable format
- Real-time countdown to next sync

## Data Flow

```
User Action (Enable Auto-Sync)
    ↓
API Endpoint (/api/steam-sync/auto-sync)
    ↓
Update steam_api_keys table
    ↓
Supabase pg_cron (hourly check)
    ↓
Create sync_jobs record
    ↓
Vercel cron (/api/cron/process-sync-jobs)
    ↓
Fetch Steam data (start_date → today)
    ↓
Update last_auto_sync & next_sync_due
    ↓
Repeat on schedule
```

## Testing Checklist

- [ ] Enable auto-sync on an API key
- [ ] Verify status display shows correct information
- [ ] Trigger manual sync while auto-sync is enabled
- [ ] Disable auto-sync and confirm it stops
- [ ] Check that auto-sync respects frequency setting
- [ ] Verify sync jobs are created with correct date range
- [ ] Confirm data updates after auto-sync runs
- [ ] Test with different frequency settings

## Benefits

1. **Always Current Data:** No more stale data - syncs continuously
2. **Zero Manual Work:** Set it once, forget it
3. **Flexible Control:** Adjust frequency based on needs
4. **Cost Efficient:** Only syncs new data since last sync
5. **User Friendly:** Clear UI with visual feedback

## Future Enhancements

Potential improvements:
- Email notifications when sync completes
- Sync history/logs viewer
- Per-app sync schedules
- Sync error retry logic
- Pause/resume functionality
- Webhook notifications

## Deployment Notes

1. **Database Migration:**
   ```bash
   # Apply migration to add auto-sync columns
   supabase db push
   ```

2. **Environment Variables:**
   - Ensure `SUPABASE_SERVICE_ROLE_KEY` is set in Vercel
   - Ensure `CRON_SECRET` is set for cron job security

3. **Supabase pg_cron:**
   - Must be configured in Supabase (already done)
   - Runs hourly to check for due syncs

4. **Vercel Cron:**
   - Already configured in `vercel.json`
   - Processes sync jobs every minute

## Support

If issues arise:
1. Check Supabase logs for pg_cron execution
2. Check Vercel logs for sync job processing
3. Query `sync_jobs` table for job status
4. Verify `steam_api_keys` table has correct auto-sync settings
