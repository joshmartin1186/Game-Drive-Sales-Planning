# Auto-Sync Feature - Deployment Checklist

## Files Created/Modified

### New Files
1. ✅ `app/api/steam-sync/auto-sync/route.ts` - Auto-sync API endpoints
2. ✅ `supabase/migrations/add_auto_sync_columns.sql` - Database migration
3. ✅ `docs/AUTO_SYNC_IMPLEMENTATION.md` - Implementation documentation

### Modified Files
1. ✅ `app/settings/page.tsx` - Added auto-sync UI and logic
2. ✅ `app/settings/settings.module.css` - Added auto-sync button styles

## Deployment Steps

### 1. Apply Database Migration
```bash
# Connect to your Supabase project and run:
supabase db push

# Or manually execute the SQL in:
# supabase/migrations/add_auto_sync_columns.sql
```

### 2. Verify Environment Variables
Ensure these are set in Vercel:
- ✅ `NEXT_PUBLIC_SUPABASE_URL`
- ✅ `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- ✅ `SUPABASE_SERVICE_ROLE_KEY` (required for auto-sync API)
- ✅ `CRON_SECRET` (required for cron job security)

### 3. Deploy to Vercel
```bash
git add .
git commit -m "Add auto-sync feature for continuous data synchronization"
git push
```

Vercel will automatically deploy the changes.

### 4. Verify Deployment
After deployment:
1. Go to Settings page
2. Click "Auto" button on an API key
3. Configure start date and frequency
4. Enable auto-sync
5. Verify status display appears
6. Test "Sync Now" button

### 5. Monitor Logs
Check for any errors in:
- Vercel deployment logs
- Vercel cron job logs (`/api/cron/process-sync-jobs`)
- Supabase logs (for pg_cron execution)

## How to Test

### Basic Functionality
- [ ] Enable auto-sync on an API key
- [ ] Verify blue status card appears with correct info
- [ ] Check that "Auto" button turns green
- [ ] Trigger a manual sync using "Sync Now"
- [ ] Disable auto-sync and confirm it stops

### Database Verification
```sql
-- Check auto-sync configuration
SELECT
  c.name,
  k.auto_sync_enabled,
  k.sync_start_date,
  k.sync_frequency_hours,
  k.next_sync_due
FROM steam_api_keys k
JOIN clients c ON c.id = k.client_id;

-- Check auto-sync jobs
SELECT
  c.name,
  sj.status,
  sj.is_auto_sync,
  sj.created_at,
  sj.start_date,
  sj.end_date
FROM sync_jobs sj
JOIN clients c ON c.id = sj.client_id
WHERE sj.is_auto_sync = true
ORDER BY sj.created_at DESC;
```

## Troubleshooting

### Auto-sync not triggering
1. Check if `next_sync_due` is in the past
2. Verify pg_cron is running in Supabase
3. Check Supabase logs for cron execution

### Jobs not processing
1. Verify Vercel cron job is running
2. Check `/api/cron/process-sync-jobs` logs
3. Verify `CRON_SECRET` environment variable

### UI not updating
1. Hard refresh browser (Cmd+Shift+R / Ctrl+Shift+F5)
2. Check browser console for errors
3. Verify API responses in Network tab

## Rollback Plan

If issues occur:
1. Disable auto-sync for all clients via SQL:
```sql
UPDATE steam_api_keys SET auto_sync_enabled = false;
```

2. Cancel pending auto-sync jobs:
```sql
UPDATE sync_jobs
SET status = 'cancelled'
WHERE is_auto_sync = true
AND status IN ('pending', 'running');
```

3. Revert code changes:
```bash
git revert HEAD
git push
```

## Success Criteria

✅ Users can enable/disable auto-sync
✅ Auto-sync jobs are created automatically
✅ Data syncs from start date to present
✅ UI shows correct status and next sync time
✅ Manual syncs work while auto-sync is enabled
✅ No errors in production logs
