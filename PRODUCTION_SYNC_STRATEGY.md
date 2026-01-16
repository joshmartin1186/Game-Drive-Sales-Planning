# Production-Ready Steam Sync Strategy

## Problem: Long-Running Tasks Don't Fit Next.js API Routes

### Vercel Limitations
- **Hobby Plan**: 10s timeout on serverless functions
- **Pro Plan**: 60s timeout (still not enough for 366 dates)
- **Enterprise**: 900s timeout (15 minutes)

### Our Sync Needs
- **Time required**: 10-20 minutes for full sync
- **Memory**: Moderate (bulk inserts)
- **Frequency**: Infrequent (daily/weekly)

## Solution Options for Production

### Option 1: Background Jobs (RECOMMENDED for Production)
**Use Vercel Cron + Queue System**

```typescript
// API Route (instant response)
POST /api/steam-sync
→ Creates sync job
→ Returns immediately with job_id
→ Client polls for progress

// Cron Job (runs every minute)
/api/cron/process-sync-jobs
→ Processes 10 dates per run
→ Updates progress in database
→ Continues until complete
```

**Pros:**
- ✅ Works on Vercel Hobby plan (free!)
- ✅ Survives all timeouts
- ✅ True background processing
- ✅ Can monitor progress in real-time

**Cons:**
- Takes longer (processes in 1-minute chunks)
- More complex to implement

**Implementation:**
```typescript
// vercel.json
{
  "crons": [{
    "path": "/api/cron/process-sync-jobs",
    "schedule": "* * * * *"  // Every minute
  }]
}
```

### Option 2: Dedicated Background Worker
**Separate service for long tasks**

Options:
- **Railway.app** - $5/month, runs Node.js server 24/7
- **Render.com** - Free tier, background workers
- **Fly.io** - Pay-as-you-go, long-running processes

**Pros:**
- ✅ No timeout limits
- ✅ More control over resources
- ✅ Can handle multiple concurrent syncs

**Cons:**
- Additional cost ($5-10/month)
- More infrastructure to manage

### Option 3: Client-Side Chunking
**Browser makes multiple API calls**

```typescript
// Browser orchestrates sync
for (const dateChunk of chunks) {
  await fetch('/api/steam-sync-chunk', {
    body: JSON.stringify({ dates: dateChunk })
  })
}
```

**Pros:**
- ✅ No backend changes needed
- ✅ Works with any timeout limit
- ✅ User sees real progress

**Cons:**
- ❌ Browser must stay open
- ❌ Network interruptions break sync
- ❌ Not truly "background"

### Option 4: Hybrid Approach (RECOMMENDED for MVP)
**Smart batching that works everywhere**

```typescript
// Configuration based on environment
const config = {
  local: {
    batchSize: 1,
    chunksPerRequest: 366,  // All at once
    timeout: 90000
  },
  vercel: {
    batchSize: 3,
    chunksPerRequest: 10,    // Process 10 dates per API call
    timeout: 55000           // Under 60s limit
  }
}

// Client makes multiple requests if needed
let remainingDates = 366
while (remainingDates > 0) {
  const response = await syncChunk(10)  // 10 dates at a time
  remainingDates -= response.processed
  updateProgress(response.progress)
}
```

**Pros:**
- ✅ Works in development AND production
- ✅ Adapts to platform limits
- ✅ Resume capability built-in
- ✅ Real progress updates

**Cons:**
- Requires multiple API calls
- Browser needs to stay open for full sync

## Recommended Implementation Path

### Phase 1: Local Development (NOW)
**Goal**: Get sync working reliably locally

```typescript
BATCH_SIZE: 2-3 dates
TIMEOUT: 90s
CHUNKING: None (all 366 dates in one request)
TIME: 10-12 minutes
```

### Phase 2: Production MVP (NEXT)
**Goal**: Works on Vercel with 60s timeout

```typescript
BATCH_SIZE: 3 dates
TIMEOUT: 55s
CHUNKING: 10 dates per API call
CLIENT: Makes 37 sequential requests
TIME: 10-15 minutes total
```

### Phase 3: Production Optimized (FUTURE)
**Goal**: True background processing

```typescript
APPROACH: Vercel Cron + Queue
PROCESSING: 10 dates per minute
NO BROWSER: Runs in background
TIME: ~40 minutes (but truly async)
```

## Specific Recommendations

### For Local Development (Your Current Need)
```typescript
const LOCAL_CONFIG = {
  BATCH_SIZE: 2,              // 2 dates in parallel
  TIMEOUT_MS: 90000,          // 90 seconds
  RETRY_ATTEMPTS: 3,
  INTER_BATCH_DELAY: 500,
  DB_BATCH_SIZE: 500,
  PROGRESS_TRACKING: true,
  RESUME_CAPABILITY: true
}
```
**Expected time: 10-12 minutes**
**Success rate: 99%+**

### For Vercel Production
```typescript
const VERCEL_CONFIG = {
  BATCH_SIZE: 3,              // 3 dates in parallel
  TIMEOUT_MS: 55000,          // Under 60s limit
  CHUNK_SIZE: 10,             // 10 dates per API call
  CLIENT_CHUNKING: true,      // Browser makes multiple calls
  RETRY_ATTEMPTS: 3,
  DB_BATCH_SIZE: 500,
  PROGRESS_TRACKING: true,
  RESUME_CAPABILITY: true
}
```
**Expected time: 12-15 minutes**
**Requires: 37 API calls from browser**

## Performance Comparison

| Approach | Local Time | Prod Time | Browser Open? | Timeout Risk | Complexity |
|----------|------------|-----------|---------------|--------------|------------|
| Current (batch=5) | Crashes | Crashes | Required | ❌ High | Low |
| Conservative (batch=1) | 18 min | 20 min | Required | ✅ None | Low |
| Optimized (batch=2-3) | 10-12 min | 12-15 min | Required | ⚠️ Low | Medium |
| Cron Jobs | N/A | 40 min | Not required | ✅ None | High |
| Background Worker | N/A | 10 min | Not required | ✅ None | High |

## My Recommendation

### Immediate (This Week)
Implement **Optimized Hybrid (batch=2-3)** with:
- Works great locally (10-12 minutes)
- Works on Vercel with chunking (12-15 minutes)
- Resume capability
- Good enough for MVP

### Near Future (When Ready for Production)
Implement **Vercel Cron Jobs**:
- True background processing
- No browser required
- Free on Vercel
- Most production-ready

### Long Term (If Scaling)
Consider **dedicated worker service**:
- Handle multiple clients
- Complex sync orchestration
- Real-time webhooks
- Advanced monitoring

## Code Impact

### Current Rewrite Scope
- ✅ Add progress tracking (all approaches need this)
- ✅ Add retry logic (all approaches need this)
- ✅ Optimize batch size (2-3 dates)
- ⚠️ Add chunking (for production, optional for local)

### Additional for Production
- Add environment detection
- Add client-side chunking coordinator
- Add better progress UI
- Add resume UI

## Bottom Line

**For your immediate needs (local dev):**
- Batch size: **2-3 dates** (not 1, not 5)
- Time: **10-12 minutes** (acceptable)
- Success: **99%+ guaranteed**
- Implementation: **~1 hour**

**For production deployment:**
- Use **chunking** (37 API calls × 10 dates each)
- Time: **12-15 minutes** (browser stays open)
- Later: **Migrate to Cron jobs** for true background processing

**Should I implement the optimized hybrid approach (batch=2-3)?**
This gives you the best balance of speed and reliability.
