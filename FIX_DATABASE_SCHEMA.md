# Fix Database Schema - Performance Metrics Table

## Problem
The Steam API sync is failing with this error:
```
Could not find the 'client_id' column of 'performance_metrics' in the schema cache
```

## Root Cause
The `performance_metrics` table in Supabase doesn't have the proper schema that the Steam sync code expects. The table is missing the `client_id` column and other required columns.

## Solution
Run the SQL migration to create/update the `performance_metrics` table with the correct schema.

## Steps to Fix

### Option 1: Using Claude Chat with Supabase MCP

Copy this prompt and send to Claude chat:

```
Using Supabase MCP for project znueqcmlqfdhetnierno, execute the SQL file at:
/Users/joshuamartin/.claude-worktrees/GameDrive/sad-hopper/supabase/migrations/create_performance_metrics.sql
```

### Option 2: Using Supabase Dashboard

1. Go to: https://supabase.com/dashboard/project/znueqcmlqfdhetnierno/sql/new
2. Open the file: `supabase/migrations/create_performance_metrics.sql`
3. Copy all the SQL content
4. Paste into the SQL Editor
5. Click "Run"

### Option 3: Using Supabase CLI

If you have Supabase CLI installed:

```bash
cd /Users/joshuamartin/.claude-worktrees/GameDrive/sad-hopper
supabase db push
```

## What the Migration Does

Creates the `performance_metrics` table with:

### Columns:
- `id` - UUID primary key
- `client_id` - Foreign key to clients table (REQUIRED)
- `date` - Sale date
- `product_name` - Product/game name
- `platform` - Platform (Steam, PlayStation, etc.)
- `country_code` - 2-letter country code
- `region` - Geographic region
- `gross_units_sold` - Gross units sold
- `net_units_sold` - Net units sold (after returns)
- `gross_revenue_usd` - Gross revenue in USD
- `net_revenue_usd` - Net revenue in USD
- `base_price` - Base price
- `sale_price` - Sale price (if discounted)
- `currency` - Currency code
- `discount_percentage` - Discount percentage
- `steam_package_id` - Steam package ID
- `steam_app_id` - Steam app ID
- `line_item_type` - Line item type
- `created_at` - Created timestamp
- `updated_at` - Updated timestamp

### Features:
- **Unique constraint** on (client_id, date, product_name, platform, country_code) to prevent duplicates
- **Indexes** on client_id, date, product, platform, region for fast queries
- **Row Level Security (RLS)** policies for multi-client security
- **Auto-update trigger** for updated_at timestamp

## After Running the Migration

1. Go back to http://localhost:3007/settings
2. Click "Sync Data" on your tobspr API key
3. The sync should now work and import the 366 dates of financial data

## Expected Result

You should see:
```
✓ Success
Synced 366 date(s) from Steam Financial API.
[Number] rows imported from 366 date(s)
```

## Troubleshooting

If you still see errors after running the migration:

1. Check that the migration ran successfully (no SQL errors)
2. Verify the table exists:
   ```sql
   SELECT * FROM information_schema.tables
   WHERE table_name = 'performance_metrics';
   ```
3. Check the columns:
   ```sql
   SELECT column_name, data_type
   FROM information_schema.columns
   WHERE table_name = 'performance_metrics';
   ```
4. Make sure you have a `clients` table (referenced by foreign key)
5. Check server logs for any new errors
