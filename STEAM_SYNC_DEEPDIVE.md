# Steam Sync Deep Dive Analysis & Robust Strategy

## Executive Summary
The Steam sync imported 144,650 records but only for **6 unique dates** instead of the expected **366 dates**. The sync crashed after processing approximately 18 out of 74 batches due to multiple timeout failures.

## Root Cause Analysis

### 1. **Primary Failure: Steam API Timeouts**
**Evidence:**
- Error messages show: "Steam API request timed out after 30 seconds"
- Multiple consecutive dates failed (Sept 7-16, 2025)
- Status: "partial" with 144,650 rows imported, 1 skipped

**Why it happened:**
- Each date requires paginated API calls to fetch all sales data
- Some dates (especially future dates with no data) cause Steam's API to hang
- 30-second timeout is too aggressive for dates with large datasets
- Parallel batch processing (5 dates at once) multiplies the memory/connection load

### 2. **Secondary Failure: Server Crashes**
**Evidence:**
- Dev server crashed multiple times during our testing
- Process died completely (lsof showed no process on port 3007)

**Why it happened:**
- Next.js API routes run in the same process as the dev server
- Large memory consumption from 5 parallel fetches + data storage
- Each date can have thousands of individual sales records
- Storing data sequentially (inside the batch loop) blocks the event loop

### 3. **Data Inconsistency**
**Evidence:**
- Only 6 dates have data: 2025-01-15/16/17 and 2026-01-01/02/03
- These are likely the most recent dates processed before crashes
- 144,650 records spread across just 6 dates = ~24,000 records per date

**Why specific dates:**
- The sync processes dates in chronological order
- Recent dates (Jan 2025/2026) were processed first
- Sync crashed when it hit Sept 2025 dates that timeout
- No data for 360 other dates due to incomplete sync

## Current Implementation Analysis

### What's Working:
✅ Service role key bypasses RLS correctly
✅ Error handling catches individual date failures
✅ Batch processing continues after individual errors
✅ Timeout handling with AbortController
✅ Proper data transformation and upsert logic

### What's Failing:
❌ 30-second timeout too short for Steam API
❌ Batch size of 5 still too high for memory constraints
❌ Sequential data storage blocks event loop
❌ No retry mechanism for failed dates
❌ No resume capability - restarts from beginning
❌ Server crashes on large datasets
❌ No progress persistence between crashes

## Robust Strategy for Guaranteed Success

### Strategy 1: Incremental Sync with Resume (RECOMMENDED)
**Approach:** Break into smaller chunks with progress tracking

```typescript
// Key changes:
1. Reduce batch size to 1-2 dates at a time
2. Increase timeout to 60-90 seconds per date
3. Store progress after each successful date
4. Add resume capability from last successful date
5. Add exponential backoff retry for timeouts
6. Process data storage in batches (don't await each upsert)
```

**Pros:**
- Guaranteed to complete eventually
- Survives server crashes
- Can resume where it left off
- Lower memory footprint
- Real-time progress tracking

**Cons:**
- Slower total completion time (~10-15 minutes for 366 dates)
- More complex implementation

### Strategy 2: Background Job Processing
**Approach:** Move sync to a separate background process

```typescript
// Key changes:
1. Create a queue-based system
2. Process dates in a worker process separate from Next.js
3. Use Redis/database for queue management
4. Retry failed dates automatically
5. Health monitoring and auto-recovery
```

**Pros:**
- Won't crash the web server
- Built-in retry logic
- Can scale to multiple workers
- Production-ready architecture

**Cons:**
- Requires additional infrastructure (Redis/queue system)
- More complex setup
- Overkill for current needs

### Strategy 3: Optimized Current Approach (QUICK FIX)
**Approach:** Minimal changes to make current code more reliable

```typescript
// Key changes:
1. Batch size = 1 (no parallelization)
2. Timeout = 90 seconds
3. Retry failed dates 3 times with exponential backoff
4. Add delays between batches (rate limiting)
5. Bulk upsert data (batch database inserts)
```

**Pros:**
- Minimal code changes
- Can implement in 10 minutes
- Will likely succeed for most dates

**Cons:**
- Still vulnerable to crashes
- No resume capability
- Slower than parallel processing

## Recommended Implementation: Strategy 1

### Phase 1: Add Progress Tracking
```typescript
// Store sync progress in database
interface SyncProgress {
  client_id: string
  last_successful_date: string
  dates_completed: number
  dates_total: number
  status: 'in_progress' | 'completed' | 'failed'
  updated_at: string
}
```

### Phase 2: Implement Resume Logic
```typescript
// On sync start:
1. Check for existing in_progress sync
2. Resume from last_successful_date
3. Filter out already completed dates
4. Continue processing remaining dates
```

### Phase 3: Add Retry with Backoff
```typescript
async function fetchWithRetry(date, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await getDetailedSalesForDate(apiKey, date)
      if (result.success) return result

      // Exponential backoff: 2s, 4s, 8s
      if (attempt < maxRetries) {
        await delay(2000 * Math.pow(2, attempt - 1))
      }
    } catch (error) {
      if (attempt === maxRetries) throw error
    }
  }
}
```

### Phase 4: Optimize Data Storage
```typescript
// Instead of individual upserts:
const records = results.map(r => transformToDbRecord(r))
await supabase.from('performance_metrics')
  .upsert(records, { onConflict: 'client_id,date,product_name,platform,country_code' })

// Batch size: 500-1000 records per upsert
```

### Phase 5: Conservative Settings
```typescript
const CONFIG = {
  BATCH_SIZE: 1,              // Process 1 date at a time
  TIMEOUT_MS: 90000,          // 90 second timeout
  RETRY_ATTEMPTS: 3,          // Retry failed dates 3 times
  DELAY_BETWEEN_DATES: 500,   // 500ms delay between dates
  DB_BATCH_SIZE: 500          // Insert 500 records at once
}
```

## Success Metrics
- [ ] 366 unique dates imported
- [ ] Less than 1% error rate on API calls
- [ ] No server crashes during sync
- [ ] Ability to resume after interruption
- [ ] Complete within 15 minutes
- [ ] Clear progress reporting

## Fallback Plan
If the robust strategy still fails:
1. Implement date filtering to process in smaller ranges (e.g., 30 days at a time)
2. Add manual resume UI for user-controlled sync
3. Create a CLI tool that runs outside Next.js
4. Contact Steam Support about API timeout issues

## Next Steps
1. Implement Strategy 1 (Incremental Sync with Resume)
2. Add progress UI to show real-time sync status
3. Test with a small date range first (7 days)
4. Run full sync with monitoring
5. Verify all 366 dates are imported successfully
