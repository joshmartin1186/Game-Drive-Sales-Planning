# Robust Steam Sync Implementation Plan

## Summary of Changes

### Critical Fixes
1. **Batch Size: 5 → 1** - Process one date at a time to prevent memory overload
2. **Timeout: 30s → 90s** - Give Steam API more time to respond
3. **Add Retry Logic** - 3 attempts with exponential backoff (2s, 4s, 8s delays)
4. **Bulk Database Inserts** - Insert 500 records at once instead of one-by-one
5. **Progress Tracking** - Save progress after each date to enable resume
6. **Rate Limiting** - 500ms delay between dates to avoid overwhelming Steam API

### New Database Table
```sql
CREATE TABLE IF NOT EXISTS sync_progress (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id),
  sync_type TEXT NOT NULL DEFAULT 'steam_api_sync',
  last_successful_date TEXT,
  dates_completed INTEGER DEFAULT 0,
  dates_total INTEGER,
  status TEXT NOT NULL DEFAULT 'in_progress',
  error_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(client_id, sync_type, status)
);
```

### Implementation Steps

#### Step 1: Create Migration for Progress Tracking
File: `supabase/migrations/create_sync_progress.sql`

#### Step 2: Update Steam Sync Route
Key changes in `/app/api/steam-sync/route.ts`:
- Add `checkSyncProgress()` function
- Add `updateSyncProgress()` function
- Add `fetchWithRetry()` function with exponential backoff
- Add `bulkStoreSalesData()` for batch inserts
- Modify main sync loop to process 1 date at a time
- Add delay between dates

#### Step 3: Update UI
- Add progress bar showing X/366 dates completed
- Add "Resume Sync" button if in_progress sync exists
- Show real-time date being processed
- Display retry attempts

### Code Changes Required

1. **New Config**:
```typescript
const SYNC_CONFIG = {
  BATCH_SIZE: 1,              // One date at a time
  TIMEOUT_MS: 90000,          // 90 seconds
  RETRY_ATTEMPTS: 3,
  RETRY_BASE_DELAY: 2000,     // 2 seconds, doubles each retry
  INTER_DATE_DELAY: 500,      // 500ms between dates
  DB_BATCH_SIZE: 500          // Bulk insert size
};
```

2. **Progress Tracking Functions**:
```typescript
async function getSyncProgress(clientId: string)
async function createSyncProgress(clientId: string, totalDates: number)
async function updateSyncProgress(clientId: string, lastDate: string, completedCount: number)
async function completeSyncProgress(clientId: string)
async function failSyncProgress(clientId: string, error: string)
```

3. **Retry Logic**:
```typescript
async function fetchWithRetry<T>(
  fetchFn: () => Promise<T>,
  maxAttempts: number = 3
): Promise<T>
```

4. **Bulk Storage**:
```typescript
async function bulkStoreSalesData(
  clientId: string,
  allResults: SteamDetailedSalesResult[],
  metadata: any
): Promise<{ imported: number; skipped: number }>
```

### Testing Plan

1. **Unit Tests**:
   - Test retry logic with simulated failures
   - Test progress tracking functions
   - Test bulk insert with various batch sizes

2. **Integration Tests**:
   - Test with 7 days of data first
   - Verify resume capability by killing process mid-sync
   - Test error handling with invalid API key

3. **Full Sync Test**:
   - Run complete 366-date sync
   - Monitor memory usage
   - Verify all dates are imported
   - Check for duplicate records

### Rollout Strategy

1. **Create migration** for sync_progress table
2. **Test locally** with small date range (7 days)
3. **Implement resume UI** so user can restart if needed
4. **Run full sync** with monitoring
5. **Verify data** - confirm 366 unique dates
6. **Add analytics** to show sync history

### Success Criteria

- ✅ All 366 dates imported successfully
- ✅ No server crashes during sync
- ✅ Resume capability works if interrupted
- ✅ Less than 1% error rate
- ✅ Completes within 20 minutes (worst case)
- ✅ Clear progress indication in UI
- ✅ Detailed error logging for debugging

### Monitoring

Track these metrics:
- Dates processed per minute
- Average API response time
- Retry rate
- Memory usage
- Error types and frequencies

### Fallback Options

If sync still fails:
1. Reduce to 1 month at a time
2. Add manual date range selection
3. Create standalone CLI tool
4. Contact Steam Support about timeouts
