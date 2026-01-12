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
- **Vercel Project ID:** prj_G1cbQAX5nL5VDKO37D73HnHNHnnR
- **Production URL:** https://gamedrivesalesplanning.vercel.app
- **Supabase Project ID:** znueqcmlqfdhetnierno (eu-west-1)

### Critical Technical Notes
- **CSS Framework:** CSS Modules (NOT Tailwind) - Tailwind had silent compilation failures on Vercel
- **Row Heights:** MUST use fixed `height` (not `min-height`) for timeline positioning calculations
- **Deployment:** GitHub commits auto-deploy to Vercel within 2-3 minutes
- **Testing:** Always request screenshot verification after UI changes - deployment success doesn't guarantee visual correctness
- **GitHub API Encoding:** Use `push_files` NOT `create_or_update_file` for complex TypeScript files - prevents HTML entity corruption
- **TypeScript Types:** `undefined` is NOT assignable to `null` - use `value ?? null` for conversion

### Key Files
- `app/page.tsx` - Main application component
- `app/page.module.css` - Main page styling (full-width container for Gantt)
- `app/components/GanttChart.tsx` - Timeline component (responsive width)
- `app/components/GanttChart.module.css` - Timeline styling

---

## Current Status: January 12, 2025

### Latest Session Summary
**Focus:** Steam Analytics Dashboard specification based on Alisa's Excel workflow  
**Result:** Created 10 GitHub issues (#18-27) for systematic implementation

### Completion Summary
| Phase | Status | Completion |
|-------|--------|------------|
| Infrastructure & Setup | Complete | 100% |
| Database & Schema | Complete | 100% |
| Gantt Chart UI | Complete | 100% |
| CRUD Operations | Complete | 100% |
| Drag & Drop | Complete | 100% |
| Edit/Delete Sales | Complete | 100% |
| Filtering System | Complete | 100% |
| UI/UX Polish | Complete | 100% |
| Platform Sub-Rows | Complete | 100% |
| Platform Events System | Complete | 100% |
| Click-Drag Sale Creation | Complete | 100% |
| Auto Sale Calendar | Complete | 100% |
| Client Feedback Issues #1-11 | Complete | 100% |
| Responsive Timeline | Complete | 100% |
| Jan 6 Feedback Items | Complete | 100% |
| Copy/Paste Sales | Complete | 100% |
| **Steam Analytics Dashboard** | **Spec Complete** | **0% built** |
| Excel Export | Pending | 0% |

---

## Steam Analytics Dashboard Specification

### Overview
Dashboard design based on analysis of Alisa's actual Excel workflow (shapez_2_new__analysis.xlsx - 93,872 rows).

### Data Source Analysis
- **Date Range:** 2024-05-22 to 2025-12-11
- **Products:** 17 (shapez 2 base + Supporter Edition + regional variants)
- **Regions:** 11 (Western Europe 36%, Asia 16%, North America 12%, etc.)
- **Platforms:** 4 (Windows 78%, Mac 12%, Linux 8%, Unknown 2%)
- **Total:** 696,607 gross units, $8,797,548 net revenue

### Alisa's Primary Analysis Pattern
She creates **period comparison tables** tracking:
- Date ranges (start/end)
- Period type (Regular Price, Custom Sale, Autumn Sale, etc.)
- Units sold / Units per day
- Revenue / Revenue per day
- **% change vs previous period**

She does this **separately by product** (base game vs Supporter Edition).

### GitHub Issues Created

| Issue | Title | Priority |
|-------|-------|----------|
| [#18](https://github.com/joshmartin1186/Game-Drive-Sales-Planning/issues/18) | Data Infrastructure & API Client | High |
| [#19](https://github.com/joshmartin1186/Game-Drive-Sales-Planning/issues/19) | Overview Summary Cards | Medium |
| [#20](https://github.com/joshmartin1186/Game-Drive-Sales-Planning/issues/20) | Period Comparison Table (Core Feature) | **High** |
| [#21](https://github.com/joshmartin1186/Game-Drive-Sales-Planning/issues/21) | Revenue by Region Chart | Medium |
| [#22](https://github.com/joshmartin1186/Game-Drive-Sales-Planning/issues/22) | Revenue by Platform Chart | Medium |
| [#23](https://github.com/joshmartin1186/Game-Drive-Sales-Planning/issues/23) | Revenue by Product Chart | Medium |
| [#24](https://github.com/joshmartin1186/Game-Drive-Sales-Planning/issues/24) | Time Series Chart with Sale Highlights | Medium |
| [#25](https://github.com/joshmartin1186/Game-Drive-Sales-Planning/issues/25) | Dashboard Filter Controls | High |
| [#26](https://github.com/joshmartin1186/Game-Drive-Sales-Planning/issues/26) | CSV Import for Performance Data | High |
| [#27](https://github.com/joshmartin1186/Game-Drive-Sales-Planning/issues/27) | Dashboard Page Layout & Navigation | High |

### Dashboard Layout

```
┌─────────────────────────────────────────────────────────────┐
│  [Filters: Client | Date Range | Product | Region | Platform] │
├─────────────────────────────────────────────────────────────┤
│  ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐         │
│  │Revenue│ │ Units │ │Rev/Day│ │Unit/Day│ │Refund%│         │
│  └───────┘ └───────┘ └───────┘ └───────┘ └───────┘         │
├─────────────────────────────────────────────────────────────┤
│  [Time Series Chart with Sale Period Highlights]            │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────┐  ┌─────────────────────┐          │
│  │ Period Comparison   │  │ Revenue by Region   │          │
│  │ Table (PRIMARY)     │  │ Pie/Bar Chart       │          │
│  └─────────────────────┘  └─────────────────────┘          │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────┐  ┌─────────────────────┐          │
│  │ Revenue by Platform │  │ Revenue by Product  │          │
│  └─────────────────────┘  └─────────────────────┘          │
└─────────────────────────────────────────────────────────────┘
```

### Steam API Context
- **Authentication:** Each client needs own Financial API Key from Steamworks
- **API workflow:** GetChangedDatesForPartner → GetDetailedSales with incremental sync
- **Available data:** 22 fields per row (units, revenue, country, platform, pricing)
- **Fallback:** CSV import for clients without API keys

### Scope Decisions
- ✅ API Key Management: Manual collection per client (no automation)
- ✅ Data Refresh: Fresh on load, on-demand refresh, daily automatic sync
- ✅ CSV Import: Supported as fallback
- ❌ Intelligence Features: OUT OF SCOPE (planning tool integration deferred)

---

## January 6, 2025 Feedback - ALL COMPLETE ✅

### Sale Creation
| Item | Description | Status |
|------|-------------|--------|
| Duration Input Flexibility | Removed hard limit, allows flexible start/end dates | ✅ Complete |
| Days Missing Per Quarter | Gap badges showing "45d gap Q1" next to platform names | ✅ Complete |
| Launch Date + Launch Sale | Full implementation with Steam Seasonal conflict detection | ✅ Complete |
| Bulk Editing | Edit multiple products/sales at once | ⏸ Deferred |

### Sale Tool
| Item | Description | Status |
|------|-------------|--------|
| Cooldown Calculation | Fixed to "end date + cooldown days" | ✅ Complete |
| Today Date Visibility | Scroll-to-today works on initial load | ✅ Complete |
| Statistics/Events Hover | Platform events show details on hover | ✅ Complete |
| Copy Sales | ⌘C to copy selected sale | ✅ Complete |
| Paste Sales | Right-click paste creates sale directly | ✅ Complete |
| Collapsible Platform Legend | Toggle button to hide/show | ✅ Complete |
| Timeline/Edit Modal Sync | Fixed date display inconsistencies | ✅ Complete |
| Import Historical Sales | CSV/Excel import of past sales | ⏸ Deferred |

### Drag And Drop
| Item | Description | Status |
|------|-------------|--------|
| Resize in Calendar | Drag edges to change duration | ✅ Complete |
| Zoom Out Calendar | 5 zoom levels (Year to 2-Week) | ✅ Complete |

### Auto-Generate
| Item | Description | Status |
|------|-------------|--------|
| Platform Selection | Choose which platforms to include | ✅ Complete |

### Export
| Item | Description | Status |
|------|-------------|--------|
| PowerPoint Export | Implementation complete | 🧪 Test in Meeting |

### Deferred to Future Sprint
1. Historical Discount Tracking
2. Analytical Prediction
3. Bulk Editing
4. Import Historical Sales

---

## Key Learnings

### Technical Discoveries

| Issue | Root Cause | Solution |
|-------|------------|----------|
| Build failures with weird syntax | GitHub MCP corrupts HTML entities | Use `push_files` not `create_or_update_file` |
| Type error `undefined` vs `null` | TypeScript strictness | Use `value ?? null` nullish coalescing |
| Scroll-to-today not working | Container not measured on initial render | Track `hasReceivedMeasurement` state + RAF timing |
| CSS not compiling | Tailwind silent failures on Vercel | Use CSS Modules architecture |
| File updates failing | GitHub API requires exact SHA | Fetch fresh file contents before edits |
| Paste opening modal | `directCreate` flag not passed | Pass full prefill data with `directCreate: true` |

### Deployment Patterns
- Vercel auto-deploys from GitHub in ~2-3 minutes
- Build logs available via `Vercel:get_deployment_build_logs`
- Always verify deployment success doesn't guarantee visual correctness
- Screenshot verification essential after UI changes

---

## Components Overview

| Component | Purpose |
|-----------|--------|
| AddSaleModal | Create new sales |
| EditSaleModal | Edit existing sales |
| DuplicateSaleModal | Duplicate sales to new dates/platforms |
| GanttChart | Main timeline with drag-drop (responsive) |
| SaleBlock | Draggable/resizable sale blocks |
| SalesTable | List view of sales |
| GapAnalysis | Sales coverage gap analysis |
| ImportSalesModal | Bulk CSV/Excel import |
| VersionManager | Calendar version snapshots |
| ProductManager | Client/Game/Product CRUD |
| PlatformSettings | Platform rules & events |
| SaleCalendarPreviewModal | Auto-generate calendar wizard |
| TimelineExportModal | Export functionality |

---

## Next Session Priorities

### Immediate (MVP Completion)
1. **Excel export** - Must match existing column structure
2. **Steam Analytics Dashboard** - Start with issues #27, #18, #25, #20

### Build Order for Analytics
1. #27 - Dashboard Layout & Navigation (page structure)
2. #18 - Data Infrastructure (database + API client)
3. #26 - CSV Import (get data in without API)
4. #25 - Filter Controls (global filters)
5. #19 - Summary Cards (quick wins)
6. #20 - Period Comparison Table (Alisa's primary workflow)
7. #24 - Time Series Chart
8. #21-23 - Breakdown Charts

---

## Remaining MVP Features

1. **Excel export** - Must match existing column structure for Alisa's formulas
2. **Steam Analytics Dashboard** - 10 issues tracked (#18-27)

---

## Future Enhancements (Post-MVP)

- Authentication - User login/data isolation
- Historical discount tracking
- Analytical prediction based on historical data
- Bulk editing capabilities
- Multi-client support with data isolation
- Planning tool ↔ Analytics integration

---

## Repository Info
- **GitHub:** https://github.com/joshmartin1186/Game-Drive-Sales-Planning
- **Live Site:** https://gamedrivesalesplanning.vercel.app/
- **Supabase Project:** znueqcmlqfdhetnierno (eu-west-1)
- **Vercel Team ID:** team_6piiLSU3y16pH8Kt0uAlDFUu
- **Vercel Project ID:** prj_G1cbQAX5nL5VDKO37D73HnHNHnnR

---

*Last Updated: January 12, 2025 - Steam Analytics Dashboard spec complete with 10 GitHub issues (#18-27)*
