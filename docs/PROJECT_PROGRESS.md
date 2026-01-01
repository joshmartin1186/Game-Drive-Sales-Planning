# GameDrive Project Progress Tracker

## Project Overview
- **Client:** Game Drive (Utrecht, Netherlands)
- **Project:** Sales Planning Tool MVP
- **Budget:** $5,000 fixed price
- **Start Date:** December 23, 2024
- **Target Completion:** January 22, 2025
- **Live URL:** https://gamedrivesalesplanning.vercel.app/

---

## Quick Reference for New Sessions

### Repository & Deployment
- **GitHub:** joshmartin1186/Game-Drive-Sales-Planning (main branch)
- **Vercel Team ID:** team_6piiLSU3y16pH8Kt0uAlDFUu
- **Production URL:** https://gamedrivesalesplanning.vercel.app
- **Supabase Project ID:** znueqcmlqfdhetnierno (eu-west-1)

### ⚠️ Critical Technical Notes
- **CSS Framework:** CSS Modules (NOT Tailwind) - Tailwind had silent compilation failures on Vercel
- **Row Heights:** MUST use fixed `height` (not `min-height`) for timeline positioning calculations
  - `.productRow`: `height: 40px`
  - `.platformRow`: `height: 36px`
- **Deployment:** GitHub commits auto-deploy to Vercel within 2-3 minutes
- **Testing:** Always request screenshot verification after UI changes - deployment success doesn't guarantee visual correctness

### Key Files
- `src/app/page.tsx` - Main application component
- `src/app/page.module.css` - All styling (CSS Modules)
- `src/components/GanttChart.tsx` - Timeline component
- `src/components/GanttChart.module.css` - Timeline styling

---

## Current Status: January 1, 2026

### Completion Summary
| Phase | Status | Completion |
|-------|--------|------------|
| Infrastructure & Setup | ✅ Complete | 100% |
| Database & Schema | ✅ Complete | 100% |
| Gantt Chart UI | ✅ Complete | 100% |
| CRUD Operations | ✅ Complete | 100% |
| Drag & Drop | ✅ Complete | 100% |
| Edit/Delete Sales | ✅ Complete | 100% |
| Filtering System | ✅ Complete | 100% |
| UI/UX Polish | ✅ Complete | 100% |
| Platform Sub-Rows | ✅ Complete | 100% |
| Platform Events System | ✅ Complete | 100% |
| Click-Drag Sale Creation | ✅ Complete | 100% |
| Steam API Integration | 🔲 Pending | 0% |
| Excel Export | 🔲 Pending | 0% |
| Auto Sale Calendar | 🔲 Pending | 0% |

---

## Recent Session Log

### January 1, 2026 - Timeline CSS Breakage Fix & Legend Cleanup

#### Problem Encountered
Timeline stopped rendering correctly after a commit. Sales blocks not visible, layout completely broken.

#### Root Cause Identified
Commit `9575622` changed CSS from fixed `height` to `min-height`:
```css
/* BROKEN (min-height) */
.productRow { min-height: 40px; }
.platformRow { min-height: 36px; }

/* WORKING (fixed height) */
.productRow { height: 40px; }
.platformRow { height: 36px; }
```

**Why This Matters:** Timeline positioning uses absolute positioning that calculates based on row heights. `min-height` doesn't guarantee a specific height for calculations, causing positioning to fail completely.

#### Commits Made
| Commit | Description |
|--------|-------------|
| `9575622` | ❌ Broke timeline (changed height to min-height) |
| `664db0a` | ✅ Fixed timeline (restored fixed heights) |
| `067d8e2` | UI improvements (wider columns 200px→220px, larger buttons 24px→26px) |
| `a3b3070` | Removed redundant platform legend from page.tsx |
| `db4fe21` | Cleaned up unused CSS classes (~60 lines removed) |

#### Legend Cleanup Details
Removed duplicate "Platform Cooldown Periods" legend section from bottom of page.tsx:
- Removed Platform Legend div section (lines 1046-1061)
- Removed ~60 lines of unused CSS from page.module.css:
  - `.platformLegend`
  - `.legendGrid`
  - `.legendItem`
  - `.legendColor`
  - Related media queries
- Information already displayed in GanttChart component's legend

---

## Technical Learnings & Patterns

### CSS Best Practices for This Project
1. **Always use fixed `height` for timeline rows** - `min-height` breaks absolute positioning
2. **CSS Modules only** - Tailwind had silent compilation failures on Vercel
3. **Test visually after every CSS change** - Build success ≠ visual correctness

### Debugging Patterns That Work
1. **Compare deployment timestamps with commit history** to identify breaking changes
2. **Use systematic console logging** at strategic points (component render, mousedown, mouseup)
3. **Check CSS property diffs** when layout breaks - often subtle property changes
4. **Capture callbacks and data at event start** (mousedown) rather than relying on refs

### Event Handling Notes
- Third-party libraries like @dnd-kit can intercept events
- Use `window.addEventListener('mouseup', handler, { capture: true })` to intercept in capture phase
- Complex mouse interactions need careful phase management

### Deployment Workflow
1. Make changes via GitHub MCP
2. Commit with descriptive message
3. Wait 2-3 minutes for Vercel auto-deploy
4. Request screenshot verification
5. Use direct deployment URLs to bypass edge cache

---

## Completed Features

### Infrastructure (Dec 23-25)
- [x] Next.js 14 + TypeScript project setup
- [x] GitHub repository creation and CI/CD
- [x] Vercel deployment with auto-deploy from main branch
- [x] Supabase project setup (eu-west-1 region)
- [x] Environment variables configured
- [x] CSS Modules architecture (resolved Tailwind compilation issues)

### Database Schema (Dec 25-26)
- [x] Clients table with cascading deletes
- [x] Games table linked to clients
- [x] Products table with product_type enum (base, dlc, edition, soundtrack)
- [x] Platforms table with all gaming platforms + cooldown rules
- [x] Sales table with proper constraints
- [x] Platform Events table for manual platform sale dates
- [x] Row Level Security (RLS) policies
- [x] sale_type constraint: custom, seasonal, festival, special
- [x] status constraint: planned, submitted, confirmed, live, ended

### Platforms Configured
| Platform | Cooldown | Color | Max Sale Days |
|----------|----------|-------|---------------|
| Steam Custom | 30 days | #1b2838 | 14 |
| Steam Seasonal | 0 days | #1b2838 | 14 |
| PlayStation (All regions) | 28 days | #003791 | 14 |
| Xbox | 30 days | #107c10 | 14 |
| Nintendo (All regions) | 28-30 days | #e60012 | 14 |
| Epic | 30 days | #2f2f2f | 14 |
| GOG | 0 days | #6441a5 | 14 |
| Humble | 0 days | #cc3333 | 14 |
| Fanatical | 0 days | #ff6600 | 14 |

### Gantt Chart UI (Dec 26-27, Dec 30, Jan 1)
- [x] 12-month timeline with horizontal scroll
- [x] Month/day headers with visual grid
- [x] Game groupings with product rows
- [x] Angled sale blocks (per GameDrive requirements)
- [x] Platform color coding
- [x] Cooldown period visualization
- [x] Status badges (Planned, Submitted, Confirmed, Live, Ended)
- [x] Responsive design
- [x] **Platform sub-rows** - Each product shows separate rows per platform with sales
- [x] **Click-and-drag sale creation** - Opens pre-filled modal with selected date range
- [x] **Platform Events** - Display as shaded backgrounds on relevant platform rows
- [x] **Consolidated legend** - Single authoritative legend in GanttChart component

### Platform Events System ✨
- [x] Manual input of upcoming platform sales dates (Steam seasonal sales, etc.)
- [x] Events display as shaded backgrounds on relevant platform rows
- [x] Not dedicated event rows - integrated into platform row backgrounds
- [x] CRUD operations for platform events in database

### CRUD Operations (Dec 27-28)
- [x] Create sales via AddSaleModal
- [x] Real-time validation against cooldown rules
- [x] Product/Platform dropdowns with game groupings
- [x] Duration calculator with end date auto-fill
- [x] Cooldown end date display

### Drag & Drop (Dec 28)
- [x] @dnd-kit integration
- [x] Drag sales to reschedule
- [x] Optimistic UI updates (instant visual feedback)
- [x] Server validation on drop
- [x] Automatic rollback on conflict/error
- [x] Drag handle for better UX

### Edit & Delete (Dec 28-29)
- [x] Click-to-edit on sale blocks
- [x] EditSaleModal with full form
- [x] Inline delete with confirmation
- [x] Optimistic delete with rollback
- [x] Status change capability
- [x] Goal type selection

### Filtering System (Dec 28)
- [x] Filter by Client
- [x] Filter by Game
- [x] Clear filters button
- [x] Stats update based on filters

### UI/UX Polish (Dec 29, Jan 1)
- [x] Clean typography with Inter font
- [x] Bold, readable text (font-weight 600-700)
- [x] Vibrant color palette
- [x] Consistent button styles
- [x] Professional modal design
- [x] Proper delete button styling
- [x] Loading states and spinners
- [x] Error handling with user feedback
- [x] Wider columns (220px) for better readability
- [x] Larger buttons (26px) for easier interaction

---

## Key Architecture Decisions

1. **CSS Modules over Tailwind** - Tailwind had silent compilation failures on Vercel that were extremely difficult to debug
2. **Fixed row heights** - Required for absolute positioning calculations in timeline
3. **Products with platform sub-rows** - Allows same product on different platforms without visual overlap
4. **Platform events as background shading** - Per client preference, not dedicated event rows
5. **Optimistic UI updates** - Immediate state changes prevent loading screens during drag operations
6. **Angled sale blocks** - Client requirement (sales don't start at midnight)
7. **Single consolidated legend** - Removed duplicate legend sections for cleaner UI

---

## Next Development Priorities

1. **Automatically create sale calendar feature** - Per project requirements
2. **Excel export** - Must match existing column structure for Alisa's formulas:
   ```
   Start date | End date | Days | Platform | Cooldown | Sale Name | Product | 
   Campaign? | Goal | Discount % | Submitted? | Confirmed? | Comment | 
   Cooldown Until | Prev. Sale Stops Date
   ```
3. **Steam API integration** - Performance data correlation
4. **Multi-client architecture** - Data isolation with conflict detection
5. **Authentication** - User login, client-specific access

---

## Known Issues & Technical Debt

### To Address
- [ ] Conflicts card shows 0 - needs actual calculation
- [ ] No authentication yet - all data visible to all users
- [ ] No Excel export yet

### Resolved Issues
- [x] Tailwind compilation failures → Switched to CSS Modules
- [x] TypeScript errors on planning page → Added missing props
- [x] Delete button styling inconsistent → Unified CSS classes
- [x] Drag preview not showing → Fixed DnD overlay
- [x] Status badges not visible → Added proper styling
- [x] TypeScript Set iteration error → Used Array.from() instead of spread
- [x] Multi-platform sales overlap → Added platform sub-rows
- [x] Timeline breakage from CSS change → Restored fixed heights (min-height → height)
- [x] Duplicate legend sections → Removed redundant platformLegend

---

## File Structure
```
src/
├── app/
│   ├── page.tsx                   # Main dashboard
│   ├── page.module.css            # Main styles
│   ├── globals.css
│   └── layout.tsx
├── components/
│   ├── AddSaleModal.tsx           # Create new sales
│   ├── AddSaleModal.module.css
│   ├── EditSaleModal.tsx          # Edit existing sales
│   ├── GanttChart.tsx             # Main timeline view with platform sub-rows
│   ├── GanttChart.module.css
│   ├── SaleBlock.tsx              # Draggable sale blocks
│   ├── SaleBlock.module.css
│   ├── ProductManager.tsx         # Client/Game/Product CRUD
│   └── ProductManager.module.css
└── lib/
    ├── supabase.ts                # Supabase client
    ├── types.ts                   # TypeScript interfaces
    └── validation.ts              # Sale validation logic
docs/
├── PROJECT_PROGRESS.md            # This file
└── DEVELOPMENT_WORKFLOW.md        # Dev patterns & feedback loops
```

---

## Repository Info
- **GitHub:** https://github.com/joshmartin1186/Game-Drive-Sales-Planning
- **Live Site:** https://gamedrivesalesplanning.vercel.app/
- **Supabase Project:** znueqcmlqfdhetnierno
- **Region:** eu-west-1
- **Vercel Team ID:** team_6piiLSU3y16pH8Kt0uAlDFUu

---

*Last Updated: January 1, 2026*
