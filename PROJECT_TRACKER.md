# GameDrive Project Tracker

## 🚀 Next Priority
- [ ] **Continue troubleshooting PlayStation Partners Analytics API**
  - Getting 403 errors despite correct credentials/scopes
  - May need IP whitelisting or additional API provisioning from PlayStation Partners support
  - Test with `data` and `dashboard` scopes once provisioning confirmed

- [ ] **Optimize default dashboard for client presentation**
  - Make charts interactive/clickable for drill-down
  - Add export functionality for charts/data
  - Improve visual polish (animations, hover states)
  - Add filtering controls within charts

## ✅ Completed (Session: 2026-02-05)

### Version Manager Enhancements
- [x] **Fixed version activation** - Versions now properly display snapshot data in timeline
  - Fixed `useEffect` bug that cleared `activeVersionId` when only `filterClientId` was set
  - Versions are now PRODUCT-scoped (not client-scoped)
- [x] **Made saved versions editable** - Can now edit sales in a saved version and save changes back
  - Added `handleVersionSnapshotUpdate`, `handleVersionSnapshotDelete`, `handleVersionSnapshotCreate` handlers
  - Added wrapper handlers that route edits to snapshot or live sales based on `activeVersionId`
  - Added "Save Version" button in version banner when changes are detected
- [x] **Unsaved changes prompt** - Now prompts when switching versions with unsaved edits
  - Added `hasUnsavedChanges` and `onSaveVersion` props to VersionManager
  - Confirmation dialog offers to save or discard changes before switching

### PlayStation Partners Analytics API Integration
- [x] **Added PlayStation API integration** (existing from prior session)
  - OAuth 2.0 client credentials flow authentication
  - Dataset listing and querying endpoints
  - Sales data sync to `performance_metrics` table
- [x] **Improved error handling** for 403 errors
  - Added detailed debug logging (URL, scope, client ID length)
  - Better error messages explaining possible causes (IP whitelisting, scope authorization)
- [x] **Fixed default scope** - Changed from `psn:analytics` to `data` (user's provisioned scope)
- [x] **Multi-select scope dropdown** (PR #60)
  - Replaced text input with checkbox-based multi-select UI
  - Shows `data` and `dashboard` scope options with descriptions
  - Scopes automatically joined with spaces for OAuth API

### PRs Merged
- PR #54 - Add scope indicator to VersionManager
- PR #55 - Fix version activation when filtering by client
- PR #56 - Add version snapshot editing with save functionality
- PR #57 - Add unsaved changes prompt when switching versions
- PR #58 - Improve PlayStation API 403 error messages
- PR #59 - Change PlayStation default scope to 'data'
- PR #60 - Add multi-select dropdown for PlayStation API scopes

**Files Modified:**
- `app/page.tsx` - Version editing handlers, snapshot state management
- `app/components/VersionManager.tsx` - Unsaved changes handling, version activation
- `app/api/playstation-api-keys/route.ts` - Scope fix, improved error messages
- `app/api/playstation-sync/route.ts` - Scope fix
- `app/settings/page.tsx` - Multi-select scope UI

### Known Issue (Carry Forward)
- PlayStation API still returning 403 errors - likely needs:
  1. IP whitelisting with PlayStation Partners
  2. API access provisioning confirmation
  3. Contact PlayStation Partners support for resolution

---

## ✅ Completed (Session: 2026-01-30)

### User Management & Permissions System
- [x] Built full user management page at `/permissions`
  - Table of users with Email, Display Name, Role, Client Access, Actions columns
  - Role badges colored by type (Superadmin = blue, Editor = green, Viewer = gray)
  - Edit and Delete buttons per user row
- [x] Invite User flow with magic link generation
  - Email field, role dropdown, client access checkboxes, feature permissions
  - Generates invite link via Supabase Auth admin API
  - Copy-to-clipboard for invite URLs
- [x] "All Clients (including future)" toggle
  - `all_clients` boolean column added to `user_profiles` table
  - When enabled, skips individual `user_clients` rows — user sees all clients automatically
  - Toggle in both invite and edit modals
- [x] Delete user functionality with confirmation dialog
  - Removes from `auth.users`, `user_profiles`, `user_clients`, `user_permissions`
  - Cascading cleanup via API route
- [x] Added Permissions nav item to Sidebar (between Excel Export and API Settings)

### RLS Policy Fix for `all_clients` Access
- [x] **Root cause fix:** Users with `all_clients=true` couldn't load any data
  - All 40 RLS policies across 10 tables only checked `user_clients` junction table
  - When `all_clients=true`, no `user_clients` rows exist → RLS returned zero rows
- [x] Created `has_client_access(client_id uuid)` PostgreSQL function
  - Checks `all_clients=true` on `user_profiles` OR matching `user_clients` row
  - `SECURITY DEFINER` + `STABLE` for performance
- [x] Created `has_game_client_access(game_id uuid)` for `products` table
  - Joins through `games` table to resolve `client_id`
- [x] Updated 40 RLS policies across 10 tables:
  - `clients`, `games`, `products`, `sales`, `steam_api_keys`
  - `steam_performance_data`, `steam_sales`, `calendar_versions`
  - `performance_metrics`, `performance_import_history`, `sync_jobs`
- [x] Applies to all existing and future users automatically

### Session Swap Bug Fix
- [x] Fixed bug where creating a new user via admin invite would swap the admin's session
  - `supabase.auth.admin.createUser` was being called with client-side Supabase (which auto-signs-in the new user)
  - Fixed by using server-side `getServerSupabase()` with service role key for admin operations

**Files Created:**
- `app/api/users/route.ts` — GET/POST/PUT/DELETE user management API
- `app/permissions/page.tsx` — User management UI
- `app/permissions/permissions.module.css` — Styles for permissions page
- `supabase/migrations/add_all_clients_column.sql`

**Files Modified:**
- `app/components/Sidebar.tsx` — Added Permissions nav item
- `lib/auth.ts` — Added `all_clients: boolean` to `UserProfile` interface

**Migrations Applied (via Supabase MCP):**
- `add_all_clients_column` — `ALTER TABLE user_profiles ADD COLUMN all_clients BOOLEAN DEFAULT false`
- `add_has_client_access_function_and_update_rls` — Helper functions + 40 policy updates

**Commits:**
- `e5b00851` — Add auth + RBAC with email/password login and superadmin panel
- `9c7c7012` — Add invite link flow for user creation
- `384c98d2` — Add client access and feature permissions to invite user modal
- `4f0f8555` — Add user management page with all-clients access and delete functionality
- `25483552` — Remove duplicate Permissions nav item from Sidebar
- `409a1be5` — Add 'All Clients (including future)' toggle and delete user to admin page
- `a03fb72e` — Fix session swap when creating new users via admin invite
- `e1a4a861` — Fix all_clients flag not granting data access via RLS policies

## ✅ Completed (Session: 2026-01-20)

### Revenue Over Time Chart Improvements
- [x] Fixed month labels to show "Jan" instead of "Jan 1" for monthly aggregated views
- [x] Fixed daily view labels based on date range selection:
  - 7D/30D: Shows "Jan 13" format (month + day) for every bar
  - 90D/YTD/All Time: Shows only month labels (Jan, Feb, Mar...)
- [x] Added year range display in chart header (e.g., "2024 - 2025")
- [x] Redesigned year indicators as clean badge dividers between years
  - Year badges appear between data points when crossing year boundaries (including first year)
  - Blue highlighted badges with subtle border (not stacked below months)
  - Cleaner, less cluttered appearance
- [x] Made bars thinner for better visualization (max-width: 20px, min-width: 24px)
- [x] Fixed tooltip positioning to use fixed positioning and stay within viewport
- [x] Tooltips now properly positioned above bars without being cut off
- [x] Improved overall chart readability for multi-year data
- [x] Verified database has no sale price data (all base_price/sale_price fields are null)

### Dashboard Performance & UX Improvements
- [x] Added active state highlighting to date range buttons
  - Currently selected range stays highlighted
  - Uses `presetActive` CSS class for visual feedback
- [x] Optimized data loading performance
  - Only select necessary columns instead of '*' (13 columns vs all)
  - Removed count: 'exact' parameter (not needed)
  - Should significantly reduce load time from 20-30 seconds

## ✅ Completed (Session: 2026-01-19)

### Analytics Dashboard Improvements
- [x] Fixed Revenue Over Time chart labels
  - Added year to X-axis labels (Jan 2024, Feb 2024, etc.)
  - Month labels now clearly indicate data year

- [x] Implemented revenue intensity gradient for bars
  - Bars now show color gradient based on revenue (high = dark blue, low = light blue)
  - Replaces sale/regular period coloring (no sale data in current dataset)

- [x] Fixed tooltip visibility and positioning
  - Tooltips now properly positioned above bars
  - Won't cut off or render off-screen
  - Dark background with white text for better contrast
  - Shows date, revenue, units on hover

- [x] Removed Revenue Heatmap widget
  - Calendar heatmap provided no clear value to clients
  - Removed to reduce clutter

- [x] Significantly compacted layout
  - Reduced gaps from 12-16px to 8px
  - Reduced padding from 16-20px to 12-14px
  - Reduced margins from 16-24px to 12px
  - Smaller border-radius (8px vs 12px) for modern look
  - Professional, compact appearance

- [x] Added comprehensive default widgets
  - 5 stat cards (Revenue, Units, Avg Daily Revenue/Units, Refund Rate)
  - Period Growth widget
  - Revenue Per Unit widget
  - Revenue Over Time chart
  - Revenue by Region chart
  - Top Countries widget
  - Sale Performance Analysis table

- [x] Dashboard Builder mode functional
  - All widgets support drag-and-drop
  - Can add/remove widgets
  - Layout persists in localStorage

## 🐛 Known Issues
- Sale period green bars not showing (data issue: base_price equals sale_price for all records)
- Charts are not clickable/interactive beyond tooltips
- No export functionality

## 📝 Technical Notes
- All changes deployed via Vercel
- Build passes successfully
- Uses Next.js 14.0.4
- Client-side rendering for analytics page
- Supabase for data storage

## 🔄 Recent Commits
- `b986bb3d` - Critical dashboard fixes: year labels, tooltip visibility, remove heatmap, tighter spacing
- `ff872478` - Actually fix dashboard: gradient bars, darker heatmap, tighter spacing, better tooltips
- `adf08d14` - Make heatmap colors more vivid and tooltips more obvious
- `e32f2c8d` - Fix TypeScript error in heatmap widget type definitions
- `c386e7d6` - Fix analytics dashboard: compact spacing, proper calendar heatmap, visible tooltips, year label
- `ed4132b9` - Add 'heatmap' to DashboardWidget type definition
- `ee6aa0da` - Fix analytics dashboard: proper month labels, visible tooltips, and add heatmap
- `2badb162` - Enhance analytics dashboard: Fix chart labels, add comprehensive default widgets

## 💡 Future Enhancements
- [ ] Add interactive chart drill-downs
- [ ] Export to Excel/CSV functionality
- [ ] Real-time data updates
- [ ] Custom date range picker with presets
- [ ] Comparison mode (compare periods side-by-side)
- [ ] Forecasting/trend projections
- [ ] Alert system for anomalies
- [ ] Mobile-responsive optimizations

---

## Session: Analytics Dashboard Enhancement - January 20-21, 2026

### Objectives
- Implement dynamic widget resizing (height and width controls)
- Fix chart layout issues (overlapping, cutoff, static heights)
- Verify multi-client database sync functionality

### Completed Features

#### 1. Dynamic Widget Resizing System ✅
- Added height resize controls: Normal (h=1, 350px) and Tall (h=2, ~716px)
- Added width resize controls: Half-width and Full-width options
- Implemented drag-and-drop widget reordering in edit mode
- Made widget type editable after creation
- Expanded widget options from 4 to 9 types
- Enhanced AddWidgetModal with 3-column grid layout

**Files Modified:**
- `app/analytics/page.tsx` - Added resize handlers and drag-drop logic
- `app/analytics/page.module.css` - Added resize button styles

**Commits:** `056f2106`

#### 2. Static Chart Heights & Container Filling ✅
- Set fixed grid row heights: `grid-auto-rows: 350px`
- Made all charts fill containers using `flex: 1`
- Updated chart containers (bar, line, pie, heatmap, tables) for responsive sizing
- Charts now properly scale within their assigned grid cells

**Files Modified:**
- `app/analytics/page.module.css` - Updated chart container styles

**Commits:** `056f2106`

#### 3. Fixed Overlapping Charts ✅
- Added `grid-auto-flow: dense` to prevent gaps
- Replaced inline `gridRow` styles with `.tallWidget` CSS class
- Added overflow containment to prevent visual overlaps
- Fixed grid item sizing with `min-height: 0` and `min-width: 0`

**Files Modified:**
- `app/analytics/page.tsx` - Removed inline styles
- `app/analytics/page.module.css` - Added grid flow and widget classes

**Commits:** `afc44640`, `8def48bd`, `cb39de9e`

#### 4. Fixed Pie Chart Cutoff ✅
- Made SVG responsive with viewBox instead of fixed dimensions
- Moved legend outside pie chart container for proper layout
- Adjusted vertical alignment from center to flex-start
- Added top padding (16px) to prevent bottom cutoff

**Files Modified:**
- `app/analytics/page.tsx` - Restructured pie chart layout
- `app/analytics/page.module.css` - Updated pie chart alignment

**Commits:** `39c21099`, `279aedcf`

#### 5. Database Multi-Client Sync Verification ✅
- Verified tobspr has 115,397 sales records ($9.6M revenue)
- Confirmed incremental sync working (no duplicate data)
- Verified new clients (Shapez, Total Mayhem Games) queued for sync
- Documented sync mechanism using highwatermark and date range tracking

**Tools Used:** Supabase MCP for database queries

### Technical Improvements

**CSS Grid Enhancements:**
```css
.chartsGrid {
  grid-auto-rows: 350px;
  grid-auto-flow: dense;
}
```

**Flex Container Pattern:**
```css
.chartCard {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
```

**Widget Sizing Classes:**
```css
.fullWidthWidget { grid-column: 1 / -1; }
.tallWidget { grid-row: span 2; }
```

### Bugs Fixed
1. Charts overlapping when using mixed heights (h=1 and h=2)
2. Pie chart bottom being cut off
3. Charts not filling their grid cell containers
4. Inline styles causing grid calculation issues

### Performance Improvements
- More efficient grid layout calculation
- Better rendering with CSS containment
- Responsive charts that scale properly
- Incremental database syncing avoids duplicates

### Testing Completed
- ✅ Widget height/width resizing
- ✅ Drag-and-drop reordering
- ✅ No overlapping with mixed widget sizes
- ✅ Pie chart displays fully
- ✅ Charts fill containers at 350px and ~716px heights
- ✅ Database sync verified (115K+ records for tobspr)

### Git Activity
- **6 commits** pushed to main
- **2 files** modified (page.tsx, page.module.css)
- All changes tested and deployed

### Next Session Goals
From plan file (future enhancements):
1. Period Growth → Line chart with dual trends (revenue + units)
2. Revenue by Region + Countries → World map heatmap
3. Sale Performance Analysis → Stacked bar chart comparison

### Session Stats
- Duration: ~4 hours
- Commits: 6
- Lines Changed: ~75 additions, ~30 deletions
- Database Records Verified: 115,397

