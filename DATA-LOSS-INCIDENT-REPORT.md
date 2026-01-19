# DATA LOSS INCIDENT REPORT

**Date:** January 19, 2026
**Client Affected:** tobspr
**Severity:** CRITICAL - Complete historical data loss

## What Happened

1. **Initial Sync (Jan 17, 2026)**: Two sync jobs attempted to import a full year of data (Jan 18, 2025 → Jan 18, 2026, 365 days) but both FAILED with 0 rows imported.

2. **Auto-Sync Triggered (Jan 19, 2026)**: User clicked the "Auto-sync" toggle button, which triggered a NEW sync job with incorrect default date range:
   - Start: Dec 1, 2025
   - End: Jan 19, 2026
   - Only 50 days instead of full historical range
   - `force_full_sync: true` was enabled

3. **Data Replacement**: The new sync jobs (4 total) successfully imported data for ONLY the Dec 2025 - Jan 2026 period, effectively overwriting/replacing all historical data that should have existed from Jan 2025 onwards.

4. **Current State**:
   - Database only contains 1,000 rows
   - Only 17 unique dates worth of data (should be 365+)
   - Total revenue: $9,646 (expected: much higher for full year)

## Root Causes

### 1. Default Date Range Bug (CRITICAL)
**Location:** `/app/settings/page.tsx` line 99

```typescript
const [syncOptions, setSyncOptions] = useState({
  start_date: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],  // WRONG!
  end_date: new Date().toISOString().split('T')[0],
  app_id: '',
  force_full_sync: false
});
```

**Problem**: This calculates "1 year ago from TODAY" (Jan 19, 2026 - 365 days = Jan 19, 2025), but since we're in 2026, this gives Dec 1, 2025 as the start date. This is WRONG for historical syncs.

**Impact**: When user clicks "Sync Now" or "Auto-sync", these incorrect default dates are used, limiting the sync to only recent months instead of full history.

### 2. Auto-Sync Trigger Confusion
**Location:** `/app/settings/page.tsx` line 278

The "Auto-sync" toggle button (handleToggleAutoSync) triggers an IMMEDIATE sync job using the current sync dialog's date range, rather than just enabling automatic future syncs.

**Problem**: User expected "Auto-sync" to:
- Keep syncing NEW data automatically going forward
- NOT trigger an immediate historical sync
- NOT use the sync dialog's date fields

**What it actually did**:
- Immediately triggered a sync job
- Used the sync dialog's default dates (Dec 2025 - Jan 2026)
- Created a job that overwrote existing historical data

### 3. Steam API Behavior
The `GetChangedDatesForPartner` endpoint with a highwatermark only returns dates that have CHANGED, not ALL dates in the range. If there are no sales on certain dates, they won't be returned, leading to gaps.

**Current data shows**: Only 17 unique dates out of 50 possible days, confirming this behavior.

### 4. No Data Validation
The system has no safeguards to:
- Warn user when a sync would overwrite existing data
- Prevent syncs with suspicious date ranges
- Alert when the number of returned dates is unexpectedly low

## Immediate Required Fixes

### Fix 1: Correct Default Date Range
Change line 99 in `/app/settings/page.tsx`:
```typescript
const [syncOptions, setSyncOptions] = useState({
  start_date: '',  // EMPTY - force user to choose
  end_date: new Date().toISOString().split('T')[0],  // Today
  app_id: '',
  force_full_sync: false
});
```

### Fix 2: Separate Auto-Sync from Manual Sync
Auto-sync toggle should:
1. Open a configuration dialog asking for:
   - Start date (for ongoing syncs)
   - Frequency (daily/weekly)
2. NOT trigger an immediate sync using sync dialog dates
3. Only schedule FUTURE automatic syncs from start_date to "present" (no end date)

### Fix 3: Add Validation
Before creating sync job:
1. Check if existing data exists for this client
2. Warn user if new sync range doesn't include existing data dates
3. Require confirmation for `force_full_sync`
4. Show expected date range and ask for confirmation

### Fix 4: Auto-Sync Implementation
For ongoing auto-sync:
1. No end_date - always sync to "today"
2. Use highwatermark intelligently
3. Store sync_start_date in steam_api_keys table
4. Each auto-sync: sync from (last_sync_date OR sync_start_date) to TODAY

## Data Recovery

Unfortunately, the original historical data (Jan-Nov 2025) is LOST and cannot be recovered unless:
1. It exists in a backup
2. Can be re-synced from Steam API (requires triggering new sync with correct historical dates)

## Prevention Measures

1. ✅ Fix default date range bug
2. ✅ Separate auto-sync toggle from manual sync
3. ✅ Add data validation and warnings
4. ✅ Implement proper auto-sync that syncs "start_date to present" without end date
5. ✅ Add logging/audit trail for all sync jobs
6. ✅ Add confirmation dialogs before data-modifying operations

## Testing Plan

1. Test sync with proper historical date range (Jan 1, 2024 - Today)
2. Verify all dates are imported correctly
3. Test auto-sync toggle - should NOT trigger immediate sync
4. Test auto-sync functionality - should continuously sync new data
5. Verify data is additive, not replacement
