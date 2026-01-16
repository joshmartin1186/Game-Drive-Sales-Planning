# Deploy to Vercel - Quick Start

## ✅ Everything is Ready

All code is committed and pushed to GitHub:
- **Branch:** `sad-hopper`
- **Repository:** joshmartin1186/Game-Drive-Sales-Planning
- **Status:** Ready to deploy

---

## 🚀 Deployment Steps

### 1. Deploy to Vercel

**Option A: Vercel Dashboard**
1. Go to https://vercel.com/dashboard
2. Click "Add New" → "Project"
3. Import from GitHub: `Game-Drive-Sales-Planning`
4. Select branch: `sad-hopper`
5. Click "Deploy"

**Option B: Vercel CLI**
```bash
cd /Users/joshuamartin/.claude-worktrees/GameDrive/sad-hopper
vercel --prod
```

### 2. Set Environment Variables

In Vercel dashboard → Project Settings → Environment Variables, add:

```
NEXT_PUBLIC_SUPABASE_URL=https://znueqcmlqfdhetnierno.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpudWVxY21scWZkaGV0bmllcm5vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0MTYyNzUsImV4cCI6MjA4MTk5MjI3NX0.i_V-aXPAkxQJQkrk9xHuUE6x8bQOWVTcoG9mtpZpdpU
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpudWVxY21scWZkaGV0bmllcm5vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjQxNjI3NSwiZXhwIjoyMDgxOTkyMjc1fQ.vBNOVuIqqdIvs3yTF699EKGEIQbZjOmuunrJToFjICk
```

**Important:** Set these for "Production" environment.

### 3. Redeploy (if you added env vars after first deploy)

Click "Redeploy" in Vercel dashboard to pick up the environment variables.

---

## 🧪 Test the Sync on Vercel

1. Open your Vercel deployment URL (e.g., `your-app.vercel.app`)
2. Navigate to `/settings`
3. Find tobspr's API key
4. Click "Sync Data"
5. Start the sync

**Expected behavior:**
- Sync should be MORE reliable than local dev
- Should complete within Vercel's timeout limits
- Better error messages in Vercel logs

---

## 📊 Monitor Progress

### Vercel Logs
1. Go to Vercel dashboard
2. Click on your project
3. Click "Functions" tab
4. Watch real-time logs as sync runs

### Database Check
```sql
-- Run in Supabase SQL Editor
SELECT COUNT(DISTINCT date) as unique_dates
FROM performance_metrics
WHERE client_id = 'ce64f88e-55b0-41c6-8fa4-b8216cdf6717';

-- Should show 366 when complete (currently shows 6)
```

---

## ⚠️ If Vercel Times Out (60s limit)

If you see timeout errors, you need chunked sync. In new Claude chat, say:

```
The Steam sync is timing out on Vercel after 60 seconds.
I need to implement chunked sync where the browser makes
multiple API calls (10-20 dates per call) to stay under
the 60-second limit.

Context: Read PROJECT_STATUS.md for current state.
```

---

## 🎯 Success Criteria

After successful deployment and sync:
- ✅ Vercel deployment is live
- ✅ Analytics dashboard loads
- ✅ Steam sync completes without errors
- ✅ Database has 366 unique dates
- ✅ "Revenue Over Time" chart shows full history

---

## 📁 Important Files

- `PROJECT_STATUS.md` - Complete project overview
- `PRODUCTION_SYNC_STRATEGY.md` - Production deployment details
- `STEAM_SYNC_DEEPDIVE.md` - Why local dev failed
- `.env.local` - Local env vars (copy to Vercel)

---

## 🆘 Troubleshooting

### Build Fails
- Check Vercel build logs
- Verify all dependencies in package.json
- Ensure no TypeScript errors

### Sync Still Hangs
- Check Vercel function logs
- May need chunked sync implementation
- Consider increasing Vercel timeout (Pro plan)

### No Data Showing
- Verify env vars are set correctly
- Check RLS policies in Supabase
- Verify sync completed successfully

---

## 🎉 You're Ready!

Everything is pushed and ready to deploy. Just:
1. Deploy to Vercel
2. Add environment variables
3. Test the sync
4. Celebrate when you see all 366 dates! 🚀

Good luck!
