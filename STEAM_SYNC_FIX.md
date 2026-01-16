# Steam Sync Fix - Infinite Spinner Issue

## Problem
When clicking "Sync Data" for a Steam API key, the spinner would run indefinitely without completing or showing an error.

## Root Cause
The Steam API fetch requests in `/app/api/steam-sync/route.ts` had **no timeout handling**. If the Steam Partner API was:
- Slow to respond
- Unresponsive
- Hanging due to network issues

The fetch would wait indefinitely (or until Next.js's very long default timeout), causing the UI spinner to never stop.

## Solution
Added `AbortController` with 30-second timeout to all Steam API fetch calls:

### Functions Updated:
1. **`getChangedDatesForPartner()`** - Gets list of dates with financial data
2. **`getDetailedSalesForDate()`** - Gets detailed sales for each date (with pagination loop)
3. **`testFinancialApiKey()`** - Tests API key validity

### Implementation Pattern:
```typescript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 seconds

try {
  const response = await fetch(url, { signal: controller.signal });
  clearTimeout(timeoutId);
  // ... process response
} catch (fetchError) {
  clearTimeout(timeoutId);
  if (fetchError instanceof Error && fetchError.name === 'AbortError') {
    return {
      success: false,
      error: 'Steam API request timed out after 30 seconds. Please try again.'
    };
  }
  throw fetchError;
}
```

## User Experience Improvements
- **Before**: Spinner runs forever, no feedback
- **After**: If Steam API doesn't respond within 30 seconds:
  - Request is aborted
  - Clear error message shown: "Steam API request timed out after 30 seconds"
  - User can try again

## Testing the Fix
1. Navigate to http://localhost:3000/settings
2. Click "Sync Data" on your tobspr API key
3. You should now see one of:
   - ✅ Success message with rows imported
   - ❌ Clear error message (403, timeout, no data, etc.)
   - NOT an infinite spinner

## Next Steps
If sync still fails, check the error message in the sync modal:
- **"Access denied (403)"** → Wrong API key type (need Financial API Key from Financial API Group)
- **"No dates returned"** → No sales data exists OR wrong key permissions
- **"Timed out"** → Steam servers slow, try again
- **Other errors** → Check browser console and terminal logs for details

## Files Changed
- `/app/api/steam-sync/route.ts` (Lines 282-352, 354-449, 520-594)
  - Added AbortController + timeout to `getChangedDatesForPartner()`
  - Added AbortController + timeout to `getDetailedSalesForDate()`
  - Added AbortController + timeout to `testFinancialApiKey()`

## Related Documentation
- `STEAM_API_TROUBLESHOOTING.md` - Comprehensive guide to Steam API setup
- `QUICK_START.md` - Overall project setup guide
