# GameDrive Sales Planning Tool - Live Demo Active 🚀

## Overview

Professional sales planning platform for game publishers managing Steam, PlayStation, Nintendo, Xbox, and Epic sales campaigns. Built specifically for Game Drive (Utrecht, Netherlands) with multi-client architecture and platform cooldown management.

**🔥 LIVE DEMO: https://gamedrivesalesplanning-two.vercel.app/**

## Features

### ✅ Phase 1 (MVP - 30 Days)
- **Interactive Gantt Chart**: 12-month visual timeline with drag-and-drop scheduling
- **Platform Rules Engine**: Automatic cooldown validation (Steam 28d, PlayStation 42d, Nintendo 56d, Xbox 28d, Epic 14d)
- **Multi-Client Architecture**: TMG, Funselektor, WeirdBeard, tobspr, Rangatang data isolation
- **Conflict Detection**: Real-time validation preventing platform policy violations
- **Excel Export**: Maintain compatibility with existing workflow

### 🚧 Phase 2 (Planned)
- **Steam API Integration**: Automated performance data import
- **Analytics Dashboard**: Revenue trends, performance comparison
- **Email Automation**: SendGrid integration for CSV processing
- **Advanced Scheduling**: AI-powered optimization recommendations

### 📋 Phase 3 (Future)
- **PR Coverage Dashboard**: Web scraping for game mentions
- **Social Media Tools**: Multi-platform posting and analytics
- **Email Marketing**: 10K+ influencer campaign management

## Tech Stack

- **Frontend**: Next.js 14 + TypeScript + Tailwind CSS
- **Backend**: Supabase (PostgreSQL + Auth + Real-time)
- **Hosting**: Vercel (automatic deployments)
- **Integrations**: Steam Partner API, SendGrid
- **UI Components**: Shadcn/ui + @dnd-kit (drag-and-drop)

## Database Schema

### Core Tables
```sql
clients         # Multi-tenant client management (TMG, Funselektor, etc.)
platforms       # Steam, PlayStation, Nintendo, Xbox, Epic rules
games           # Client game catalog with Steam integration
products        # Base games, editions, DLCs, soundtracks, bundles
sales           # Planning workflow: draft → submitted → confirmed → live
performance_metrics  # Historical analysis with units sold, revenue, DAU
```

### Platform Rules
- **Steam**: 28-day cooldown, 1-14 day sales, special sales exempt
- **PlayStation**: 42-day cooldown, approval process required
- **Nintendo**: 56-day cooldown, strict approval process  
- **Xbox**: 28-day cooldown, Game Pass considerations
- **Epic**: 14-day cooldown, exclusivity windows

## Setup Instructions

### 1. Environment Configuration

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Update with your credentials:
```env
# Supabase (znueqcmlqfdhetnierno project)
NEXT_PUBLIC_SUPABASE_URL=https://znueqcmlqfdhetnierno.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Steam API
STEAM_WEB_API_KEY=your-steam-web-api-key
```

### 2. Local Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Open browser
open http://localhost:3000
```

### 3. Database Setup

Database is pre-configured with:
- ✅ Sample clients: TMG, Funselektor, WeirdBeard, tobspr, Rangatang
- ✅ Platform rules: Steam/PS/Nintendo/Xbox/Epic cooldowns
- ✅ Sample games: shapez, shapez 2, Tricky Towers
- ✅ Row Level Security for multi-client data isolation

### 4. Deployment (Vercel)

```bash
# Deploy to production
vercel --prod

# Set environment variables in Vercel dashboard
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY
```

## Current Workflow Integration

### Excel Compatibility
Maintains Game Drive's existing column structure:
```
Start date | End date | Days | Platform | Cooldown | Sale Name | Product | 
Campaign? | Goal | Discount % | Submitted? | Confirmed? | Comment | 
Cooldown Until | Prev. Sale Stops Date
```

### Client Data Structure
- **TMG**: Standard 15-column structure, acquisition-focused
- **WeirdBeard**: Enhanced 16-column with dual submission tracking
- **tobspr**: Multi-product coordination (shapez ecosystem)
- **Funselektor**: Event-based campaigns
- **Rangatang**: Revenue optimization focus

### Visual Timeline Features
- **Angled Sale Blocks**: Diamond shape (not rectangles) - sales don't start at midnight
- **Platform Colors**: Steam #1b2838, PlayStation #0070d1, Nintendo #e60012, Xbox #107c10, Epic #000000
- **Conflict Visualization**: Red warnings for cooldown violations
- **Multi-Product View**: Multiple games visible simultaneously

## API Endpoints

### Sales Management
```typescript
POST /api/sales/validate
// Validates sale against platform cooldown rules
// Returns conflicts and warnings

GET /api/sales/timeline  
// Returns 12-month sales calendar
// Supports filtering by client, product, platform

POST /api/sales/create
// Creates new sale with conflict checking
// Automatically calculates cooldown periods
```

### Steam Integration (Phase 2)
```typescript
GET /api/analytics/performance
// Steam API integration for sales metrics
// Configurable date ranges and filters

POST /api/export/excel
// Generates client-ready Excel export
// Includes visual timeline and metrics
```

## Development Workflow

### MCP Integration Build
This project is built entirely using Claude with MCP integrations:
- **GitHub MCP**: Repository management, code commits
- **Supabase MCP**: Database operations, schema migrations
- **Vercel MCP**: Deployment, environment variables
- **Desktop Commander**: Terminal operations, testing

### Daily Progress Tracking
See `GameDrive_Daily_Progress_Tracker.md` for detailed development milestones and client communication logs.

## Client Information

**Game Drive (Utrecht, Netherlands)**
- **Primary Contact**: Alisa Jefimova (alisa@game-drive.nl)
- **Secondary Contact**: Stephanie (stephanie@game-drive.nl)
- **Budget**: $5,000 fixed price for 30-day MVP
- **Timeline**: December 23, 2024 → January 22, 2025

### Current Clients Managed
1. **TMG**: 3 games, acquisition campaigns
2. **Funselektor**: 2 games, event-based sales  
3. **WeirdBeard**: 1 game (Tricky Towers), dual tracking
4. **tobspr**: 4 games (shapez ecosystem), performance-focused
5. **Rangatang**: 1 game, revenue optimization

## Success Metrics

### Time Savings Targets
- 75% reduction in timeline update time (from manual Excel)
- 90% elimination of cooldown calculation errors
- 50% faster sales planning cycle
- Zero platform conflicts due to automated validation

### Quality Improvements
- Real-time status visibility across all clients
- Performance-driven planning recommendations  
- Seamless multi-product campaign coordination
- Professional client exports vs. manual formatting

## Roadmap

### 30-Day MVP Phases
- **Week 1**: Core infrastructure + platform rules engine ✅
- **Week 2**: Interactive Gantt chart with drag-and-drop
- **Week 3**: UI polish + Excel export functionality
- **Week 4**: Email automation + client training + handoff

### Future Expansion ($17,500 additional revenue potential)
- **Phase 2**: Enhanced analytics + multi-platform data ($2,000 + $500/month)
- **Phase 3**: PR coverage dashboard ($3,000 + $400/month)  
- **Phase 4**: AI optimization + revenue prediction ($2,000 + $300/month)
- **Phase 5**: Email marketing + key management ($2,500 + $350/month)
- **Phase 6**: Social media integration ($2,000 + $300/month)

## Security & Privacy

- **Row Level Security**: Client data isolation in Supabase
- **API Key Management**: Encrypted per-client Steam credentials
- **GDPR Compliance**: Data retention and privacy policies
- **Audit Trails**: Complete action history and user permissions

## Support & Maintenance

- **30-Day Support**: Bug fixes and feature guidance included
- **Documentation**: Complete user guides and API reference
- **Training**: 2-hour walkthrough with Game Drive team
- **Optional Retainer**: $500/month for ongoing updates

---

Built with ❤️ for Game Drive by [AI West](https://aiwest.co) using Claude + MCP integrations.