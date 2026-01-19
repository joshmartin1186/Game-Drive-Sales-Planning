# GameDrive Sales Planning Tool - Claude Code Project Guide

## Quick Start Commands
```bash
# Start development server on port 3003
npm run dev -- -p 3003

# Build for production
npm run build

# Type check
npm run type-check

# Lint
npm run lint
```

---

## Project Overview

**Client:** Game Drive (Utrecht, Netherlands)  
**Purpose:** Replace manual Excel workflow with interactive Gantt chart for game sales planning  
**Budget:** $5,000 fixed price MVP  
**Status:** Core MVP complete, preparing for client deployment  

### What This Tool Does
- Interactive 12-month Gantt timeline for scheduling game sales
- Platform cooldown validation (Steam 28 days, PlayStation 42 days, etc.)
- Multi-client data management (TMG, Funselektor, WeirdBeard, tobspr, Rangatang)
- Steam performance analytics dashboard with CSV import
- Excel export for client reporting

---

## Repository & Deployment Info

| Resource | Value |
|----------|-------|
| GitHub Repo | `joshmartin1186/Game-Drive-Sales-Planning` |
| Main Branch | `main` |
| Production URL | https://gamedrivesalesplanning.vercel.app/ |
| Vercel Team ID | `team_6piiLSU3y16pH8Kt0uAlDFUu` |
| Vercel Project ID | `prj_G1cbQAX5nL5VDKO37D73HnHNHnnR` |
| Supabase Project ID | `znueqcmlqfdhetnierno` (eu-west-1) |

### Deployment Flow
1. Make changes locally
2. Test on `localhost:3003`
3. Once approved, commit and push to GitHub
4. Vercel auto-deploys from main branch in 2-3 minutes
5. Update `docs/PROJECT_PROGRESS.md` with completed work

---

## Critical Technical Notes

### ⚠️ MUST READ Before Coding

| Rule | Why |
|------|-----|
| **CSS Modules ONLY** | Tailwind had silent compilation failures on Vercel - use `.module.css` files |
| **Fixed heights for timeline** | MUST use `height` (NOT `min-height`) for row positioning - absolute positioning calculations break otherwise |
| **Supabase returns strings** | Numeric fields come back as `"19.99"` not `19.99` - use `toNumber()` helper |
| **TypeScript: undefined ≠ null** | Use `value ?? null` for conversion when Supabase expects null |
| **GitHub API encoding** | For complex TypeScript files, use `push_files` NOT `create_or_update_file` - prevents HTML entity corruption |
| **Optimistic UI updates** | Update React state immediately, rollback on server error - prevents loading screens and visual jumps |

---

## File Structure

```
GameDrive/
├── app/
│   ├── page.tsx                    # Main Gantt timeline (home page)
│   ├── page.module.css             # Main page CSS
│   ├── analytics/page.tsx          # Steam Analytics Dashboard
│   ├── clients/page.tsx            # Client management CRUD
│   ├── platforms/page.tsx          # Platform settings (cooldowns, colors)
│   ├── settings/page.tsx           # API key management
│   ├── export/page.tsx             # Excel export functionality
│   ├── components/
│   │   ├── GanttChart.tsx          # Main timeline component
│   │   ├── SaleBlock.tsx           # Draggable sale blocks
│   │   ├── AddSaleModal.tsx        # Create new sales
│   │   ├── EditSaleModal.tsx       # Edit existing sales
│   │   ├── ProductManager.tsx      # Client/Game/Product CRUD
│   │   └── ...                     # Other components
│   ├── api/                        # API routes (if needed)
│   └── layout.tsx                  # Root layout with sidebar
├── lib/
│   ├── supabase.ts                 # Supabase client
│   ├── types.ts                    # TypeScript type definitions
│   ├── validation.ts               # Cooldown validation logic
│   ├── dateUtils.ts                # Date helper functions
│   └── sale-calendar-generator.ts  # Auto-generate sale calendars
├── docs/
│   ├── PROJECT_PROGRESS.md         # Progress tracker (UPDATE THIS!)
│   └── DEVELOPMENT_WORKFLOW.md     # Development patterns
└── package.json
```

---

## Database Schema (Supabase)

### Core Tables
```sql
-- Clients table
clients (id, name, email, steam_api_key, created_at)

-- Games table
games (id, client_id, name, steam_app_id, created_at)

-- Products table (base games, DLCs, editions)
products (id, game_id, name, product_type, steam_product_id, created_at)

-- Platforms table
platforms (id, name, cooldown_days, approval_required, color_hex, max_sale_days)

-- Sales table
sales (
  id, product_id, platform_id,
  start_date, end_date, discount_percentage,
  sale_name, sale_type, status, notes,
  created_at
)
```

### Analytics Tables
```sql
-- Steam performance data
steam_performance_data (
  id, sale_id, date, product_name, platform,
  country_code, region, gross_units, net_units,
  base_price, sale_price, gross_revenue, net_revenue,
  is_sale_period, created_at
)

-- Import history
performance_import_history (id, import_date, records_imported, source)
```

---

## Key Components Reference

### GanttChart.tsx
Main timeline component. Key features:
- 12-month scrollable timeline
- Product rows with platform sub-rows
- Drag-and-drop sale repositioning
- Click-drag to create new sales
- Real-time cooldown validation
- Platform event display (Steam sales)

### SaleBlock.tsx  
Individual sale block component:
- Draggable with @dnd-kit
- Resizable by dragging edges
- Shows discount %, sale name, duration
- Platform-colored background
- Cooldown visualization

### Analytics Dashboard (app/analytics/page.tsx)
Steam performance analytics:
- Summary stat cards (revenue, units, rates)
- Revenue over time bar chart
- Revenue by region chart
- Period comparison table (sale vs regular)
- CSV import modal

---

## Common Development Tasks

### Adding a New Feature
1. Create/modify component in `app/components/`
2. Add CSS in corresponding `.module.css` file
3. Update types in `lib/types.ts` if needed
4. Test on `localhost:3003`
5. Update `docs/PROJECT_PROGRESS.md`

### Database Changes
```bash
# Use Supabase MCP to apply migrations
supabase:apply_migration({
  name: "descriptive_name",
  projectId: "znueqcmlqfdhetnierno",
  query: "YOUR SQL HERE"
})

# Or execute SQL directly
supabase:execute_sql({
  projectId: "znueqcmlqfdhetnierno",
  query: "YOUR SQL HERE"
})
```

### Pushing to GitHub
```bash
# Standard git workflow
git add .
git commit -m "descriptive message"
git push origin main

# Vercel auto-deploys in 2-3 minutes
```

---

## Open Issues / Feature Requests

### From Client Feedback (Issues #4-7)
- **Issue #4:** Duration input flexibility (e.g., "3 days" or end date picker)
- **Issue #5:** Timeline resize (adjust start/end months)
- **Issue #6:** Auto-generate platform selections from Steam events
- **Issue #7:** Platform color editing in settings

### Known Technical Debt
- Right-click paste on timeline (partially implemented)
- PowerPoint export needs live client testing
- Historical discount tracking (deferred to Phase 2)
- Analytical prediction/forecasting (deferred to Phase 2)

---

## Workflow: Local Development → Production

### 1. Start Local Server
```bash
cd /Users/joshuamartin/projects/GameDrive
npm run dev -- -p 3003
# Opens at http://localhost:3003
```

### 2. Make Changes
- Edit files in your IDE
- Hot reload shows changes instantly
- Check browser console for errors

### 3. Test Thoroughly
- Test all affected features
- Verify database operations work
- Check responsive design

### 4. Commit & Push
```bash
git add .
git commit -m "feat: description of changes"
git push origin main
```

### 5. Verify Deployment
- Wait 2-3 minutes for Vercel build
- Check https://gamedrivesalesplanning.vercel.app/
- Verify changes are live

### 6. Update Progress Tracker
Add entry to `docs/PROJECT_PROGRESS.md`:
```markdown
## [DATE] - Session Summary
### ✅ Completed
- Feature X
- Bug fix Y

### 🔧 Technical Notes
- Any important discoveries or patterns
```

---

## Helper Functions (lib/)

### supabase.ts
```typescript
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
```

### types.ts
Key types defined:
- `Client`, `Game`, `Product`
- `Platform`, `Sale`
- `SteamPerformanceData`
- Various modal/filter types

### validation.ts
Cooldown validation logic:
- `checkCooldownConflict()` - Validates sale against platform rules
- `getConflictingSales()` - Returns blocking sales

### dateUtils.ts
Date helpers:
- `formatDate()`, `parseDate()`
- `getMonthsBetween()`, `getDaysBetween()`
- `addDays()`, `subDays()`

---

## Supabase Quick Reference

### Project ID: `znueqcmlqfdhetnierno`

### Common Queries
```typescript
// Get all sales for a product
const { data } = await supabase
  .from('sales')
  .select('*, platforms(*), products(*)')
  .eq('product_id', productId)

// Insert new sale
const { data, error } = await supabase
  .from('sales')
  .insert({ 
    product_id, platform_id, 
    start_date, end_date, 
    discount_percentage 
  })
  .select()
  .single()

// Update sale
const { error } = await supabase
  .from('sales')
  .update({ start_date, end_date })
  .eq('id', saleId)
```

---

## CSS Modules Pattern

### DO ✅
```tsx
import styles from './page.module.css'

<div className={styles.container}>
  <span className={styles.title}>Hello</span>
</div>
```

### DON'T ❌
```tsx
// Tailwind classes - these fail silently on Vercel
<div className="flex items-center justify-between">
```

---

## Testing Checklist

Before pushing to production:
- [ ] Sales CRUD (create, read, update, delete)
- [ ] Drag and drop repositioning
- [ ] Cooldown validation warnings
- [ ] Platform filtering
- [ ] Client/product filtering  
- [ ] Analytics dashboard loads
- [ ] CSV import works
- [ ] Excel export downloads
- [ ] No console errors

---

## Contact & Resources

- **Production Site:** https://gamedrivesalesplanning.vercel.app/
- **GitHub:** https://github.com/joshmartin1186/Game-Drive-Sales-Planning
- **Vercel Dashboard:** https://vercel.com/team_6piiLSU3y16pH8Kt0uAlDFUu
- **Supabase Dashboard:** https://supabase.com/dashboard/project/znueqcmlqfdhetnierno

---

*This document serves as the complete reference for Claude Code to manage the GameDrive project. Keep `docs/PROJECT_PROGRESS.md` updated with all completed work.*
