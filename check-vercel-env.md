# Vercel Environment Variables Setup

The "Application error: a client-side exception has occurred" is likely caused by missing environment variables in Vercel.

## Required Environment Variables

You need to add these in your Vercel project settings:

### Required for all environments (Production, Preview, Development):

1. **NEXT_PUBLIC_SUPABASE_URL**
   - Value: Your Supabase project URL (starts with https://...supabase.co)
   - Found in: Supabase Dashboard → Project Settings → API

2. **NEXT_PUBLIC_SUPABASE_ANON_KEY**
   - Value: Your Supabase anon/public key
   - Found in: Supabase Dashboard → Project Settings → API

3. **SUPABASE_SERVICE_ROLE_KEY**
   - Value: Your Supabase service role key (secret!)
   - Found in: Supabase Dashboard → Project Settings → API
   - ⚠️ IMPORTANT: Only enable for Production and Preview, NOT Development

## How to Add Environment Variables in Vercel

1. Go to https://vercel.com/dashboard
2. Select your GameDrive project
3. Go to Settings → Environment Variables
4. Add each variable:
   - Name: (e.g., NEXT_PUBLIC_SUPABASE_URL)
   - Value: (paste the value)
   - Environment: Check "Production", "Preview", and "Development"
5. Click "Save"
6. Redeploy your project (Settings → Deployments → click the 3 dots on latest → Redeploy)

## How to Get Your Supabase Values

Run this command to see your local values (they'll be masked):
```bash
cd /Users/joshuamartin/Projects/GameDrive
cat .env.local | grep SUPABASE
```

Then copy these same values to Vercel.
