# Fix RLS User-Client Mapping

## Problem
Steam sync is failing with RLS error:
```
new row violates row-level security policy for table "performance_metrics"
```

## Root Cause
The `user_clients` table is empty. When the sync tries to insert data, the RLS policy checks:
```sql
client_id IN (SELECT client_id FROM user_clients WHERE user_id = auth.uid())
```

Since there are no rows in `user_clients`, the policy blocks ALL inserts.

## Solution
Add a mapping between your user and the tobspr client in the `user_clients` table.

## Steps

### Option 1: Add User-Client Mapping (Recommended)

Copy this prompt to Claude chat with Supabase MCP:

```
Using Supabase MCP for project znueqcmlqfdhetnierno:

1. First, get the tobspr client_id:
   SELECT id, name FROM clients WHERE name ILIKE '%tobspr%';

2. Get the current authenticated user ID from the steam_api_keys table:
   SELECT client_id FROM steam_api_keys WHERE publisher_key IS NOT NULL LIMIT 1;

3. Then insert the mapping (replace CLIENT_ID with the actual UUID from step 1):
   INSERT INTO user_clients (user_id, client_id)
   SELECT auth.uid(), 'CLIENT_ID'::uuid
   WHERE NOT EXISTS (
     SELECT 1 FROM user_clients WHERE user_id = auth.uid() AND client_id = 'CLIENT_ID'::uuid
   );
```

### Option 2: Temporarily Bypass RLS for Service Role

Alternatively, we can modify the sync code to use the service role key which bypasses RLS.

Update `.env.local` to use service role in the sync API, or modify the RLS policies to allow service role access.

### Option 3: Simplify RLS Policies (Quick Fix)

Copy this prompt to Claude chat:

```
Using Supabase MCP for project znueqcmlqfdhetnierno, execute this SQL:

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Users can insert their client's performance metrics" ON performance_metrics;
DROP POLICY IF EXISTS "Users can update their client's performance metrics" ON performance_metrics;
DROP POLICY IF EXISTS "Users can delete their client's performance metrics" ON performance_metrics;

-- Create more permissive policies for authenticated users
CREATE POLICY "Authenticated users can insert performance metrics"
  ON performance_metrics FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update performance metrics"
  ON performance_metrics FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete performance metrics"
  ON performance_metrics FOR DELETE
  TO authenticated
  USING (true);
```

This allows any authenticated user to insert/update/delete performance metrics. Less secure but will unblock the sync.

## Recommended Approach

Use **Option 3** (simplify RLS) for now to get the sync working, then later implement proper user-client mappings when you add multi-user support.
