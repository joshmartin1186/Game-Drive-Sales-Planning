# Steam Financial API Troubleshooting Guide

## Common Issues & Solutions

### Issue 1: "No data returned" or "0 dates from API"

**Possible Causes:**
1. **No sales data exists** - The publisher account has no revenue to report
2. **Wrong API key type** - Using Steam Web API Key instead of Financial Web API Key
3. **Insufficient permissions** - The key doesn't have Financial API Group access

**How to Fix:**
1. Go to **Steamworks** → **Users & Permissions** → **Manage Groups**
2. Find or create **"Financial API Group"**
3. Add your user to this group
4. Generate a **Financial Web API Key** (NOT a regular Web API Key)
5. Copy the key and paste it into GameDrive Settings

**Key Differences:**
- **Steam Web API Key**: For public data (player counts, achievements, etc.) - NOT for sales
- **Financial Web API Key**: For partner financial/sales data - THIS is what you need

---

### Issue 2: "Access Denied (403)"

**Cause:** The API key doesn't have permission to access financial data

**Fix:**
1. Verify you're using a **Financial Web API Key** from a **Financial API Group**
2. Make sure your Steamworks account has **financial data access**
3. Check if you're the **owner** or have **financial permissions** on the partner account
4. Wait 5-10 minutes after creating the key for permissions to propagate

---

### Issue 3: "Invalid API Key"

**Cause:** Incorrect key format or typo

**Fix:**
1. Financial API keys look like: `XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX` (32 hex characters)
2. Check for leading/trailing spaces when copying
3. Regenerate the key in Steamworks if needed

---

### Issue 4: "No sales for selected date range"

**Cause:** The date range filter excludes all available data

**Fix:**
1. Try **"Force Full Sync"** checkbox to ignore date filters
2. Expand your date range (default is last 365 days)
3. Check if the game actually has sales in that period

---

## How to Get Your Financial Web API Key

### Step-by-Step:

1. **Log into Steamworks**
   - Go to: https://partner.steamgames.com/

2. **Navigate to Users & Permissions**
   - Click your partner/company name (top right)
   - Select **"Users & Permissions"**

3. **Manage Groups**
   - Click **"Manage Groups"** tab
   - Look for **"Financial API Group"**
   - If it doesn't exist, create it:
     - Click **"Create New Group"**
     - Name: `Financial API Group`
     - Permissions: Check **"Financial API Access"**

4. **Add Yourself to the Group**
   - Click on **"Financial API Group"**
   - Click **"Add User"**
   - Select your Steam account
   - Save

5. **Generate API Key**
   - In the Financial API Group page
   - Look for **"Web API Key"** section
   - Click **"Generate New Key"** (or copy existing one)
   - **Copy this key** - this is your **Financial Web API Key**

6. **Add to GameDrive**
   - Go to GameDrive Settings: http://localhost:3000/settings
   - Click **"Add Steam API Key"**
   - Paste the key in **"Financial Web API Key (Publisher Key)"** field
   - Leave "Steam Web API Key" blank (not needed)
   - Add App IDs if you want to filter specific games
   - Click **"Save"**

---

## Testing Your Setup

### In GameDrive Settings:

1. **Test Connection**
   - Click **"Test Connection"** button next to your API key
   - Should see: ✅ "API key is valid" with date count
   - If it fails, see error messages above

2. **Sync Data**
   - Click **"Sync Data"** button
   - Check **"Force Full Sync"** for first sync
   - Click **"Start Sync"**
   - Wait for success message

3. **View Data**
   - Navigate to **Analytics** page: http://localhost:3000/analytics
   - You should see your sales data in charts

---

## Still Not Working?

### Check Browser Console:
1. Open browser Developer Tools (F12)
2. Go to **Console** tab
3. Click **"Sync Data"**
4. Look for error messages in red
5. Share the error with support

### Check Server Logs:
1. Look at the terminal where `npm run dev` is running
2. Search for lines starting with `[Steam Sync]` or `[Steam API]`
3. Look for HTTP status codes (403, 404, 500)
4. Share the error messages

### Common Error Messages:

**"No active Steam API key found"**
→ Add an API key in Settings first

**"Access denied (403)"**
→ Using wrong key type or insufficient permissions

**"Invalid API key format"**
→ Key has typo or spaces

**"No dates returned"**
→ No sales data exists OR wrong key type

---

## Contact Support

If you've tried everything above and still can't sync data:

1. **Verify in Steamworks:**
   - Do you see financial data in Steamworks dashboard?
   - Are you the owner/admin of the partner account?
   - Do you have games with actual sales?

2. **Screenshot for Support:**
   - Screenshot of Steamworks "Financial API Group" page
   - Screenshot of GameDrive error message
   - Copy/paste server logs from terminal

3. **Provide Details:**
   - Partner account name
   - App IDs you're trying to sync
   - Date range you selected
   - Error message text

---

## Quick Checklist

- [ ] Using **Financial Web API Key** (not Steam Web API Key)
- [ ] Key is from **Financial API Group** in Steamworks
- [ ] Your account has **financial data access** in Steamworks
- [ ] Partner account has **games with sales**
- [ ] API key copied correctly (no spaces)
- [ ] Waited 5-10 minutes after generating key
- [ ] Tried "Force Full Sync" option
- [ ] Checked browser console for errors
- [ ] Checked server logs for `[Steam Sync]` messages
