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
- `app/page.tsx` - Main application component
- `app/page.module.css` - Main page styling
- `app/components/GanttChart.tsx` - Timeline component
- `app/components/GanttChart.module.css` - Timeline styling

---

## Current Status: January 9, 2025

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
| Auto Sale Calendar | ✅ Complete | 100% |

---

## Client Feedback Issues (Jan 6, 2025)

GitHub Issues created from Alisa's feedback email and weekly call:

### ✅ Completed
| Issue | Title | Status | Completed |
|-------|-------|--------|-----------|
| #1 | PowerPoint Export Bug | ✅ Fixed | Jan 9 |
| #2 | Timeline vs Sale Modal Date Mismatch | ✅ Fixed | Jan 8 |
| #3 | "Today" Date Visibility | ✅ Fixed | Jan 9 |

### 🟠 High Priority
| Issue | Title | Description |
|-------|-------|-------------|
| #4 | Duration Input Flexibility | Remove 14-day limit, allow hard Start/End dates |
| #5 | Resize Sales on Timeline | Drag edges to change duration directly |
| #6 | Auto-Generate Platform Selection | Choose platforms, exclude 0-day cooldown |
| #7 | Platform Color Editing | Add color picker, some colors too similar |

### 🟡 Medium Priority
| Issue | Title | Description |
|-------|-------|-------------|
| #8 | Sales Gap Indicator | Show "X days without sale in Q1" per platform |
| #9 | Historical Sales Import | Bulk import from Excel master sheet |
| #10 | Version/Draft System | Save multiple calendar versions, compare |

---

## Recent Session Log

### January 9, 2025 - Issues #1 and #3 Completed

#### Issue #3: "Today" Date Visibility ✅
**Problem:** Users couldn't easily navigate to current date on the timeline

**Solution Implemented:**
- Added "Today" button in scroll grab bar
- Red vertical indicator line showing current date position
- Today's date column highlighted in header (pink background)
- Scroll-to-today functionality centers current date in view
- Grey background consistency fix for scroll container area

**Commits:**
| Commit | Description |
|--------|-------------|
| `e70b02e` | Add Today button with scroll-to-today and red indicator line |
| `d767b64` | Fix scrollGrabBar flex layout and HTML entity encoding |
| `da9393e` | Add margin resets for scroll elements |
| `0cc582a` | Change white backgrounds to grey (#f8fafc) to match UI theme |

#### Issue #1: PowerPoint Export Bug ✅
**Status:** Marked complete by client

---

### January 8, 2025 - Issue #2 Resolution

#### Issue #2: Timeline vs Sale Modal Date Mismatch
**Problem:** Sales created via modal showed on wrong dates on timeline (off by one day)

**Root Causes Found & Fixed:**
1. **Midnight normalization** - Date parsing was shifting dates due to timezone
2. **Header alignment** - 220px header padding wasn't applied to day headers, causing misalignment
3. **Emoji rendering** - Unicode escapes (`\u{1F680}`) not rendering as actual emojis

**Commits:**
| Commit | Description |
|--------|-------------|
| `2de34bc8` | Fix header alignment (220px padding) + emoji rendering |

**Cooldown Calculation Verified:** ✅
- Alisa's rule: "end date + 30 days = first valid start date"
- Code correctly implements: `addDays(existingEnd, cooldownDays)` with `isBefore()` check
- Day 30 is allowed, days 1-29 are blocked - matches exact formula

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

### Gantt Chart UI (Dec 26-27, Dec 30, Jan 1, Jan 9)
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
- [x] **Today button** - Scroll to current date with one click
- [x] **Today indicator** - Red vertical line showing current date position
- [x] **Today header highlight** - Current date column highlighted in pink

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

### UI/UX Polish (Dec 29, Jan 1, Jan 8, Jan 9)
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
- [x] Fixed header alignment for month/day columns
- [x] Proper emoji rendering (🚀 🗓️ 🗑️)
- [x] Grey background consistency across timeline components

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

### Immediate (High Priority from Client Feedback)
1. **Issue #4: Duration Input Flexibility** - Remove 14-day limit, allow hard Start/End dates
2. **Issue #5: Resize Sales on Timeline** - Drag edges to change duration directly
3. **Issue #6: Auto-Generate Platform Selection** - Choose platforms, exclude 0-day cooldown
4. **Issue #7: Platform Color Editing** - Add color picker, some colors too similar

### Medium Priority
5. **Issue #8: Sales Gap Indicator** - Show gaps per platform per quarter
6. **Issue #9: Historical Sales Import** - Bulk Excel import
7. **Issue #10: Version/Draft System** - Save multiple calendar versions

### Later
8. **Excel export** - Must match existing column structure for Alisa's formulas
9. **Steam API integration** - Performance data correlation

---

## Known Issues & Technical Debt

### Active Issues (GitHub)
- [ ] #4 Duration Input Flexibility - remove 14-day limit
- [ ] #5 Resize Sales on Timeline - drag edges
- [ ] #6 Auto-Generate Platform Selection - choose platforms
- [ ] #7 Platform Color Editing - add color picker
- [ ] #8 Sales Gap Indicator - show gaps per platform
- [ ] #9 Historical Sales Import - bulk Excel import
- [ ] #10 Version/Draft System - save multiple versions

### To Address
- [ ] Conflicts card shows 0 - needs actual calculation
- [ ] No authentication yet - all data visible to all users

### Resolved Issues
- [x] #1 PowerPoint Export Bug → Fixed Jan 9
- [x] #2 Timeline vs Sale Modal Date Mismatch → Fixed header alignment + emoji rendering Jan 8
- [x] #3 "Today" Date Visibility → Added Today button, indicator line, header highlight Jan 9
- [x] Tailwind compilation failures → Switched to CSS Modules
- [x] TypeScript errors on planning page → Added missing props
- [x] Delete button styling inconsistent → Unified CSS classes
- [x] Drag preview not showing → Fixed DnD overlay
- [x] Status badges not visible → Added proper styling
- [x] TypeScript Set iteration error → Used Array.from() instead of spread
- [x] Multi-platform sales overlap → Added platform sub-rows
- [x] Timeline breakage from CSS change → Restored fixed heights (min-height → height)
- [x] Duplicate legend sections → Removed redundant platformLegend
- [x] Scroll container white background → Changed to grey (#f8fafc)

---

## File Structure
```
app/
├── page.tsx                       # Main dashboard
├── page.module.css                # Main styles
├── globals.css
├── layout.tsx
└── components/
    ├── AddSaleModal.tsx           # Create new sales
    ├── AddSaleModal.module.css
    ├── EditSaleModal.tsx          # Edit existing sales
    ├── GanttChart.tsx             # Main timeline view with platform sub-rows
    ├── GanttChart.module.css
    ├── SaleBlock.tsx              # Draggable sale blocks
    ├── SaleBlock.module.css
    ├── ProductManager.tsx         # Client/Game/Product CRUD
    ├── ProductManager.module.css
    ├── PlatformSettings.tsx       # Platform event management
    ├── TimelineExportModal.tsx    # Export functionality
    └── ...
lib/
├── supabase.ts                    # Supabase client
├── types.ts                       # TypeScript interfaces
├── dateUtils.ts                   # Date normalization helpers
└── validation.ts                  # Sale validation logic
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

*Last Updated: January 9, 2025*
