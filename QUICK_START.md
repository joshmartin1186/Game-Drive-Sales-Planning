# 🚀 GameDrive Analytics Builder - Quick Start Guide

## ✅ What's Been Built

Your GameDrive analytics platform has been transformed into a **dynamic, configurable analytics builder** similar to Looker Studio. Here's what you can now do:

### **New Capabilities:**
1. 📊 **Drag-and-Drop Dashboard Builder** - Create custom dashboards visually
2. 🎨 **5 Chart Types** - Metric Cards, Bar Charts, Line Charts, Pie Charts, Tables
3. 🏢 **Client Filtering** - View data for specific clients or all clients
4. 💾 **Auto-Save** - Dashboards save automatically to database
5. 📐 **Flexible Layouts** - Drag to reposition, resize charts
6. 🎯 **Chart Templates** - 7 pre-built charts to get started quickly

---

## 🏃 Getting Started (5 Minutes)

### Step 1: Run the Database Migration

Open your Supabase dashboard and execute this SQL:

```bash
# Navigate to: SQL Editor in Supabase Dashboard
# Paste the contents of: supabase/migrations/create_dashboard_configs.sql
# Click "Run"
```

Or use the Supabase CLI:
```bash
supabase db push
```

### Step 2: Start the Development Server

```bash
cd /Users/joshuamartin/.claude-worktrees/GameDrive/sad-hopper
npm run dev
```

### Step 3: Import Test Data

**Option A: CSV Import**
1. Navigate to http://localhost:3000/analytics
2. Click "Import CSV" button
3. Upload the `steam_performance_data.csv` file (48 rows already in project)
4. Data appears immediately in charts

**Option B: Steam API Sync (Live Data)**
1. Navigate to http://localhost:3000/settings
2. Add your Steam API key and publisher key
3. Enter app IDs (comma-separated)
4. Click "Test Connection" to validate
5. Click "Sync Data" to pull live financial data

### Step 4: Build Your First Dashboard

1. Navigate to http://localhost:3000/analytics/builder
2. Click "Browse Templates" or "Add Chart"
3. Choose a chart type (e.g., "Revenue Over Time")
4. Drag to reposition, resize with corner handle
5. Dashboard auto-saves!

---

## 📍 Key URLs

| Page | URL | Purpose |
|------|-----|---------|
| **Analytics (Static)** | `/analytics` | View pre-built charts with filters |
| **Dashboard Builder** | `/analytics/builder` | Create custom drag-and-drop dashboards |
| **Client Management** | `/clients` | Manage clients |
| **Settings** | `/settings` | Steam API keys, CSV import |
| **Platforms** | `/platforms` | Platform settings |

---

## 🎯 How to Use the Dashboard Builder

### Creating a Chart

1. **From Templates:**
   - Click "Templates" button in toolbar
   - Select a pre-built template
   - Chart appears on canvas
   - Customize by clicking "Edit" icon

2. **From Scratch:**
   - Click "Add Chart" button
   - Choose chart type (Bar, Line, Pie, etc.)
   - Configure:
     - **X-Axis:** Category (e.g., Date, Region, Product)
     - **Y-Axis:** Metric (e.g., Net Sales USD, Units Sold)
     - **Aggregation:** Sum, Average, Count, Max, Min
   - Add optional filters (product, region, platform)
   - Pick a color
   - Click "Create Chart"

### Editing a Chart

1. Hover over chart
2. Click the **Edit** icon (pencil)
3. Modify settings
4. Click "Save Changes"

### Repositioning Charts

1. Click and drag the **6-dot handle** (top-right of chart)
2. Drop in new position
3. Auto-saves

### Resizing Charts

1. Drag the **resize handle** (bottom-right corner)
2. Charts auto-adjust
3. Auto-saves

---

## 🎨 Available Chart Types

### 1. **Metric Card**
- **Best For:** Single KPI (Total Revenue, Total Units)
- **Configuration:** Just select Y-axis metric
- **Example:** "Total Revenue: $1,234,567"

### 2. **Bar Chart**
- **Best For:** Comparing categories (Revenue by Region)
- **Configuration:** X-axis (category) + Y-axis (metric)
- **Orientation:** Vertical bars
- **Max Items:** 15 (for readability)

### 3. **Line Chart**
- **Best For:** Trends over time (Daily Sales)
- **Configuration:** X-axis (usually date) + Y-axis (metric)
- **Features:** SVG-based, smooth lines

### 4. **Pie Chart**
- **Best For:** Distribution/proportion (Revenue by Platform)
- **Configuration:** X-axis (category) + Y-axis (metric)
- **Max Slices:** 8 (for readability)
- **Shows:** Percentages + legend

### 5. **Table**
- **Best For:** Detailed data, comparisons
- **Configuration:** X-axis + Y-axis
- **Features:** Sortable columns, sticky header

---

## 📊 Pre-Built Templates

1. **Total Revenue** (Metric Card) - Sum of net_steam_sales_usd
2. **Total Units Sold** (Metric Card) - Sum of net_units_sold
3. **Revenue Over Time** (Bar Chart) - Daily revenue trend
4. **Revenue by Region** (Bar Chart) - Regional breakdown
5. **Daily Sales Trend** (Line Chart) - Units sold over time
6. **Revenue Distribution by Platform** (Pie Chart) - Platform comparison
7. **Period Comparison** (Table) - Detailed data table

---

## 🔍 Filtering Data

### Global Filters (Analytics Page)
- **Client:** Filter by specific client or "All Clients"
- **Date Range:** All Time, 7D, 30D, 90D, YTD
- **Product:** Filter by product name
- **Region:** Filter by region
- **Platform:** Filter by platform (Steam, PlayStation, etc.)

**Note:** Global filters apply to ALL charts on analytics page

### Chart-Level Filters (Builder)
- Each chart can have independent filters
- Configured in chart settings panel
- Examples:
  - Show only "Europe" region in one chart
  - Show only "Product A" in another chart
  - Different filters for different insights

---

## 💾 Saving & Loading Dashboards

### Auto-Save
- Dashboards save automatically when you:
  - Add a chart
  - Edit a chart
  - Reposition a chart
  - Resize a chart
- See "Dashboard saved successfully!" message

### Default Dashboard
- Each client can have one "default" dashboard
- Loads automatically when you visit `/analytics/builder`
- To change default: Edit dashboard, toggle "Set as default"

### Multiple Dashboards (Future)
- Database supports multiple dashboards per client
- UI currently shows one "default" dashboard
- **Enhancement:** Add dashboard selector to switch between saved dashboards

---

## 🛠️ Troubleshooting

### "No data available" in charts
**Cause:** No performance data in database
**Fix:** Import CSV or sync Steam API data

### Charts not rendering
**Cause:** JavaScript error (check browser console)
**Fix:** Refresh page, check data format

### Drag-and-drop not working
**Cause:** CSS not loaded
**Fix:** Verify `react-grid-layout/css/styles.css` is imported

### Save not working
**Cause:** Database migration not run
**Fix:** Execute `create_dashboard_configs.sql` in Supabase

### RLS error: "new row violates row-level security policy"
**Cause:** User doesn't have permission for client
**Fix:** Check `user_clients` table or RLS policies

---

## 🔐 Multi-Client Architecture

### How It Works
1. Each client has a unique `client_id`
2. All data is tagged with `client_id`
3. Row Level Security (RLS) filters queries automatically
4. Users can only see data for clients they have access to

### Client Selector Behavior
- **"All Clients":** Shows aggregate data across all accessible clients
- **Specific Client:** Shows only that client's data
- Filtering happens at database level (secure)

---

## 📱 Mobile Support

### Responsive Behavior
- **Desktop (>1024px):** Full grid layout with drag-and-drop
- **Tablet (768-1024px):** Adjusted grid, smaller charts
- **Mobile (<768px):** Charts stack vertically, simplified controls

### Mobile Tips
- Charts auto-resize on mobile
- Drag handles hidden on mobile (edit via config panel)
- Sidebar collapses on mobile

---

## 🚀 Next Steps & Enhancements

### Immediate (Pre-Launch)
- [ ] Execute database migration
- [ ] Import test data (CSV or Steam API)
- [ ] Create 2-3 test dashboards
- [ ] Test on mobile devices
- [ ] Share with Alisa for feedback

### Future Enhancements

#### **Dashboard Management**
- [ ] Dashboard name editing
- [ ] Duplicate dashboard
- [ ] Delete dashboard
- [ ] Dashboard selector (switch between saved dashboards)

#### **Chart Enhancements**
- [ ] More chart types (Scatter, Area, Gauge)
- [ ] Custom color palettes
- [ ] Chart annotations (labels, markers)
- [ ] Export chart as image

#### **Data Features**
- [ ] Calculated fields (formulas)
- [ ] Date range picker (custom dates)
- [ ] Data refresh button per chart
- [ ] Real-time data updates

#### **Collaboration**
- [ ] Share dashboard link
- [ ] Dashboard permissions (view/edit)
- [ ] Dashboard comments
- [ ] Dashboard version history

#### **Performance**
- [ ] Server-side aggregation (for large datasets)
- [ ] Chart caching
- [ ] Lazy loading for charts
- [ ] Progressive data loading

---

## 📞 Support

### Documentation
- `IMPLEMENTATION_SUMMARY.md` - Full technical documentation
- `QUICK_START.md` - This guide
- Inline code comments

### Resources
- **React Grid Layout:** https://github.com/react-grid-layout/react-grid-layout
- **Supabase Docs:** https://supabase.com/docs
- **Next.js 14:** https://nextjs.org/docs

### Common Issues
See "Troubleshooting" section above

---

## ✅ Pre-Deployment Checklist

Before showing to Alisa or deploying to production:

- [ ] Database migration executed in Supabase
- [ ] Test data imported (CSV or Steam API)
- [ ] Created at least one custom dashboard
- [ ] Tested drag-and-drop functionality
- [ ] Tested on Chrome, Safari, Firefox
- [ ] Tested on mobile device
- [ ] Verified client filtering works
- [ ] Verified auto-save works
- [ ] All charts render correctly
- [ ] No console errors

---

## 🎉 You're Ready!

Your GameDrive analytics platform is now a **full-featured dashboard builder**. Users can:

✅ Create unlimited custom dashboards
✅ Drag-and-drop to organize charts
✅ Choose from 5 chart types
✅ Filter data by client
✅ Auto-save configurations
✅ Use pre-built templates for quick setup

**Next:** Import your data and start building beautiful dashboards! 📊
