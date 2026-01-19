'use client'

// Cache invalidation: 2026-01-16T12:00:00Z - Editable dashboard with drag-drop widgets

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import styles from './page.module.css'
import PageToggle from '../components/PageToggle'

// Types
interface PerformanceData {
  id: string
  client_id: string
  date: string
  bundle_name: string | null
  product_name: string
  product_type: string | null
  game: string | null
  platform: string
  country_code: string | null
  country: string | null
  region: string | null
  gross_units_sold: number | string
  chargebacks_returns: number | string
  net_units_sold: number | string
  base_price_usd: number | string | null
  sale_price_usd: number | string | null
  gross_steam_sales_usd: number | string
  chargeback_returns_usd: number | string
  vat_tax_usd: number | string
  net_steam_sales_usd: number | string
}

interface SummaryStats {
  totalRevenue: number
  totalUnits: number
  avgDailyRevenue: number
  avgDailyUnits: number
  refundRate: number
  totalDays: number
}

interface DateRange {
  start: Date | null
  end: Date | null
}

interface DailyData {
  date: string
  revenue: number
  units: number
  isSale: boolean
}

interface RegionData {
  region: string
  revenue: number
  units: number
  percentage: number
}

interface PeriodData {
  name: string
  startDate: string
  endDate: string
  days: number
  totalRevenue: number
  totalUnits: number
  avgDailyRevenue: number
  avgDailyUnits: number
  isSale: boolean
  discountPct: number | null
}

interface CurrentPeriodState {
  dates: string[]
  revenue: number
  units: number
  isSale: boolean
  discountPct: number | null
}

// Widget Types for editable dashboard
interface DashboardWidget {
  id: string
  type: 'stat' | 'chart' | 'table' | 'region'
  title: string
  config: {
    statKey?: string
    chartType?: 'bar' | 'line' | 'pie'
    dataSource?: string
  }
  position: { x: number; y: number }
  size: { w: number; h: number }
}

// ============================================
// UTILITY FUNCTIONS FOR SAFE NUMBER CONVERSION
// ============================================

function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0
  if (typeof value === 'number') return isNaN(value) ? 0 : value
  const parsed = parseFloat(String(value).replace(/[$,]/g, ''))
  return isNaN(parsed) ? 0 : parsed
}

function safeDivide(numerator: number, denominator: number): number {
  if (denominator === 0 || isNaN(denominator)) return 0
  const result = numerator / denominator
  return isNaN(result) ? 0 : result
}

function isSalePrice(basePrice: number | string | null | undefined, salePrice: number | string | null | undefined): boolean {
  const base = toNumber(basePrice)
  const sale = toNumber(salePrice)
  return base > 0 && sale > 0 && sale < base
}

function calculateDiscountPct(basePrice: number | string | null | undefined, salePrice: number | string | null | undefined): number | null {
  const base = toNumber(basePrice)
  const sale = toNumber(salePrice)
  if (base <= 0 || sale <= 0 || sale >= base) return null
  return Math.round((1 - sale / base) * 100)
}

// Sidebar component
function AnalyticsSidebar() {
  const pathname = usePathname()
  
  const navItems = [
    { name: 'Sales Timeline', href: '/', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
    { name: 'Analytics', href: '/analytics', icon: 'M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z' },
    { name: 'Client Management', href: '/clients', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z' },
    { name: 'Platform Settings', href: '/platforms', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' },
    { name: 'Excel Export', href: '/export', icon: 'M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
    { name: 'API Settings', href: '/settings', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' },
  ]
  
  const platforms = [
    { name: 'Steam', color: '#1b2838', cooldown: '30d' },
    { name: 'PlayStation', color: '#0070d1', cooldown: '42d' },
    { name: 'Xbox', color: '#107c10', cooldown: '28d' },
    { name: 'Nintendo', color: '#e60012', cooldown: '56d' },
    { name: 'Epic', color: '#000000', cooldown: '14d' },
  ]

  return (
    <aside className={styles.sidebar}>
      <div className={styles.sidebarHeader}>
        <div className={styles.sidebarLogo}>
          <div className={styles.logoIcon}>GD</div>
          <div className={styles.logoText}>Game<span>Drive</span></div>
        </div>
      </div>
      
      <nav className={styles.sidebarNav}>
        <div className={styles.navSection}>
          <div className={styles.navSectionTitle}>Navigation</div>
          {navItems.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className={`${styles.navLink} ${pathname === item.href ? styles.navLinkActive : ''}`}
            >
              <svg className={styles.navIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
              </svg>
              {item.name}
            </Link>
          ))}
        </div>
      </nav>
      
      <div className={styles.sidebarFooter}>
        <div className={styles.navSectionTitle}>Active Platforms</div>
        <div className={styles.platformList}>
          {platforms.map((platform) => (
            <div key={platform.name} className={styles.platformItem}>
              <div className={styles.platformName}>
                <div className={styles.platformDot} style={{ backgroundColor: platform.color }} />
                {platform.name}
              </div>
              <span className={styles.platformCooldown}>{platform.cooldown}</span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  )
}

// Default dashboard layout
const DEFAULT_WIDGETS: DashboardWidget[] = [
  { id: 'stat-revenue', type: 'stat', title: 'Total Revenue', config: { statKey: 'totalRevenue' }, position: { x: 0, y: 0 }, size: { w: 1, h: 1 } },
  { id: 'stat-units', type: 'stat', title: 'Total Units', config: { statKey: 'totalUnits' }, position: { x: 1, y: 0 }, size: { w: 1, h: 1 } },
  { id: 'stat-avg-rev', type: 'stat', title: 'Avg Daily Revenue', config: { statKey: 'avgDailyRevenue' }, position: { x: 2, y: 0 }, size: { w: 1, h: 1 } },
  { id: 'stat-avg-units', type: 'stat', title: 'Avg Daily Units', config: { statKey: 'avgDailyUnits' }, position: { x: 3, y: 0 }, size: { w: 1, h: 1 } },
  { id: 'stat-refund', type: 'stat', title: 'Refund Rate', config: { statKey: 'refundRate' }, position: { x: 4, y: 0 }, size: { w: 1, h: 1 } },
  { id: 'chart-revenue', type: 'chart', title: 'Revenue Over Time', config: { chartType: 'bar', dataSource: 'daily' }, position: { x: 0, y: 1 }, size: { w: 3, h: 2 } },
  { id: 'chart-region', type: 'region', title: 'Revenue by Region', config: { dataSource: 'region' }, position: { x: 3, y: 1 }, size: { w: 2, h: 2 } },
  { id: 'table-periods', type: 'table', title: 'Period Comparison', config: { dataSource: 'periods' }, position: { x: 0, y: 3 }, size: { w: 5, h: 2 } },
]

export default function AnalyticsPage() {
  const supabase = createClientComponentClient()
  
  // State
  const [isLoading, setIsLoading] = useState(true)
  const [performanceData, setPerformanceData] = useState<PerformanceData[]>([])
  const [summaryStats, setSummaryStats] = useState<SummaryStats | null>(null)
  const [dateRange, setDateRange] = useState<DateRange>({ start: null, end: null })
  const [selectedProduct, setSelectedProduct] = useState<string>('all')
  const [selectedClient, setSelectedClient] = useState<string>('all')
  const [selectedRegion, setSelectedRegion] = useState<string>('all')
  const [selectedPlatform, setSelectedPlatform] = useState<string>('all')
  const [products, setProducts] = useState<string[]>([])
  const [clients, setClients] = useState<{id: string, name: string}[]>([])
  const [regions, setRegions] = useState<string[]>([])
  const [platforms, setPlatforms] = useState<string[]>([])
  const [showImportModal, setShowImportModal] = useState(false)
  const [dataAvailable, setDataAvailable] = useState(false)
  
  // Editable dashboard state
  const [isEditMode, setIsEditMode] = useState(false)
  const [widgets, setWidgets] = useState<DashboardWidget[]>(DEFAULT_WIDGETS)
  const [draggedWidget, setDraggedWidget] = useState<string | null>(null)
  const [showAddWidgetModal, setShowAddWidgetModal] = useState(false)
  const gridRef = useRef<HTMLDivElement>(null)

  // Fetch clients
  useEffect(() => {
    const fetchClients = async () => {
      const { data } = await supabase.from('clients').select('id, name')
      if (data) setClients(data)
    }
    fetchClients()
  }, [supabase])

  // Fetch performance data
  const fetchPerformanceData = useCallback(async () => {
    setIsLoading(true)
    try {
      // Supabase has a hard 1000 row limit per query, so fetch in batches
      let allData: PerformanceData[] = []
      let hasMore = true
      let offset = 0
      const batchSize = 1000

      while (hasMore) {
        let query = supabase
          .from('steam_performance_data_view')
          .select('*', { count: 'exact' })
          .order('date', { ascending: true })
          .range(offset, offset + batchSize - 1)

        if (dateRange.start) {
          query = query.gte('date', dateRange.start.toISOString().split('T')[0])
        }
        if (dateRange.end) {
          query = query.lte('date', dateRange.end.toISOString().split('T')[0])
        }
        if (selectedProduct !== 'all') {
          query = query.eq('product_name', selectedProduct)
        }
        if (selectedClient !== 'all') {
          query = query.eq('client_id', selectedClient)
        }
        if (selectedRegion !== 'all') {
          query = query.eq('region', selectedRegion)
        }
        if (selectedPlatform !== 'all') {
          query = query.eq('platform', selectedPlatform)
        }

        const { data, error } = await query

        if (error) throw error

        allData = allData.concat(data || [])
        hasMore = (data?.length || 0) === batchSize
        offset += batchSize
      }

      setPerformanceData(allData)
      setDataAvailable(allData.length > 0)

      if (allData.length > 0) {
        const totalRevenue = allData.reduce((sum, row) => sum + toNumber(row.net_steam_sales_usd), 0)
        const totalUnits = allData.reduce((sum, row) => sum + toNumber(row.net_units_sold), 0)
        const totalGrossUnits = allData.reduce((sum, row) => sum + toNumber(row.gross_units_sold), 0)
        const totalChargebacks = allData.reduce((sum, row) => sum + toNumber(row.chargebacks_returns), 0)

        const uniqueDates = new Set(allData.map(row => row.date))
        const totalDays = uniqueDates.size || 1

        setSummaryStats({
          totalRevenue,
          totalUnits,
          avgDailyRevenue: safeDivide(totalRevenue, totalDays),
          avgDailyUnits: safeDivide(totalUnits, totalDays),
          refundRate: safeDivide(totalChargebacks, totalGrossUnits) * 100,
          totalDays
        })

        const uniqueProducts = Array.from(new Set(allData.map(row => row.product_name).filter(Boolean)))
        const uniqueRegions = Array.from(new Set(allData.map(row => row.region).filter(Boolean))) as string[]
        const uniquePlatforms = Array.from(new Set(allData.map(row => row.platform).filter(Boolean)))
        
        setProducts(uniqueProducts)
        setRegions(uniqueRegions)
        setPlatforms(uniquePlatforms)
      } else {
        setSummaryStats(null)
      }
    } catch (error) {
      console.error('Error fetching performance data:', error)
    } finally {
      setIsLoading(false)
    }
  }, [supabase, dateRange, selectedProduct, selectedClient, selectedRegion, selectedPlatform])

  useEffect(() => {
    fetchPerformanceData()
  }, [fetchPerformanceData])

  // Compute daily time series data with smart grouping
  const dailyData = useMemo((): DailyData[] => {
    if (!performanceData.length) return []

    // First aggregate by day
    const byDate = new Map<string, { revenue: number; units: number; hasSale: boolean }>()

    performanceData.forEach(row => {
      const existing = byDate.get(row.date) || { revenue: 0, units: 0, hasSale: false }
      const rowIsSale = isSalePrice(row.base_price_usd, row.sale_price_usd)
      byDate.set(row.date, {
        revenue: existing.revenue + toNumber(row.net_steam_sales_usd),
        units: existing.units + toNumber(row.net_units_sold),
        hasSale: existing.hasSale || rowIsSale
      })
    })

    const dailyEntries = Array.from(byDate.entries())
      .map(([date, data]) => ({
        date,
        revenue: data.revenue,
        units: data.units,
        isSale: data.hasSale
      }))
      .sort((a, b) => a.date.localeCompare(b.date))

    // If more than 45 days, group by month for better visualization
    if (dailyEntries.length > 45) {
      const byMonth = new Map<string, { revenue: number; units: number; hasSale: boolean }>()

      dailyEntries.forEach(entry => {
        // Get YYYY-MM format
        const monthKey = entry.date.substring(0, 7) + '-01'
        const existing = byMonth.get(monthKey) || { revenue: 0, units: 0, hasSale: false }
        byMonth.set(monthKey, {
          revenue: existing.revenue + entry.revenue,
          units: existing.units + entry.units,
          hasSale: existing.hasSale || entry.isSale
        })
      })

      return Array.from(byMonth.entries())
        .map(([date, data]) => ({
          date,
          revenue: data.revenue,
          units: data.units,
          isSale: data.hasSale
        }))
        .sort((a, b) => a.date.localeCompare(b.date))
    }

    return dailyEntries
  }, [performanceData])

  // Compute regional breakdown
  const regionData = useMemo((): RegionData[] => {
    if (!performanceData.length) return []
    
    const byRegion = new Map<string, { revenue: number; units: number }>()
    let totalRevenue = 0
    
    performanceData.forEach(row => {
      const region = row.region || 'Unknown'
      const existing = byRegion.get(region) || { revenue: 0, units: 0 }
      const rowRevenue = toNumber(row.net_steam_sales_usd)
      byRegion.set(region, {
        revenue: existing.revenue + rowRevenue,
        units: existing.units + toNumber(row.net_units_sold)
      })
      totalRevenue += rowRevenue
    })
    
    return Array.from(byRegion.entries())
      .map(([region, data]) => ({
        region,
        revenue: data.revenue,
        units: data.units,
        percentage: safeDivide(data.revenue, totalRevenue) * 100
      }))
      .sort((a, b) => b.revenue - a.revenue)
  }, [performanceData])

  const pushPeriod = (periods: PeriodData[], period: CurrentPeriodState): void => {
    if (period.dates.length > 0) {
      const days = period.dates.length
      periods.push({
        name: period.isSale 
          ? `Sale Period (${period.discountPct || '??'}% off)`
          : 'Regular Price',
        startDate: period.dates[0],
        endDate: period.dates[period.dates.length - 1],
        days,
        totalRevenue: period.revenue,
        totalUnits: period.units,
        avgDailyRevenue: safeDivide(period.revenue, days),
        avgDailyUnits: safeDivide(period.units, days),
        isSale: period.isSale,
        discountPct: period.discountPct
      })
    }
  }

  const periodData = useMemo((): PeriodData[] => {
    if (!performanceData.length) return []
    
    const periods: PeriodData[] = []
    let currentPeriod: CurrentPeriodState | null = null
    
    const dailyAgg = new Map<string, {
      revenue: number
      units: number
      isSale: boolean
      discountPct: number | null
    }>()
    
    performanceData.forEach(row => {
      const existing = dailyAgg.get(row.date)
      const rowIsSale = isSalePrice(row.base_price_usd, row.sale_price_usd)
      const discountPct = calculateDiscountPct(row.base_price_usd, row.sale_price_usd)
      
      if (existing) {
        dailyAgg.set(row.date, {
          revenue: existing.revenue + toNumber(row.net_steam_sales_usd),
          units: existing.units + toNumber(row.net_units_sold),
          isSale: existing.isSale || rowIsSale,
          discountPct: discountPct ?? existing.discountPct
        })
      } else {
        dailyAgg.set(row.date, {
          revenue: toNumber(row.net_steam_sales_usd),
          units: toNumber(row.net_units_sold),
          isSale: rowIsSale,
          discountPct
        })
      }
    })
    
    const sortedDates = Array.from(dailyAgg.keys()).sort()
    
    for (const date of sortedDates) {
      const dayData = dailyAgg.get(date)!
      
      if (!currentPeriod || currentPeriod.isSale !== dayData.isSale) {
        if (currentPeriod) {
          pushPeriod(periods, currentPeriod)
        }
        currentPeriod = {
          dates: [date],
          revenue: dayData.revenue,
          units: dayData.units,
          isSale: dayData.isSale,
          discountPct: dayData.discountPct
        }
      } else {
        currentPeriod.dates.push(date)
        currentPeriod.revenue += dayData.revenue
        currentPeriod.units += dayData.units
      }
    }
    
    if (currentPeriod) {
      pushPeriod(periods, currentPeriod)
    }
    
    return periods
  }, [performanceData])

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value)
  }

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('en-US').format(Math.round(value))
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    // If we have more than 45 data points, we're showing monthly data
    if (dailyData.length > 45) {
      return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const setPresetDateRange = (preset: string) => {
    const today = new Date()
    let start: Date | null = null
    let end: Date | null = today

    switch (preset) {
      case '7d':
        start = new Date(today)
        start.setDate(start.getDate() - 7)
        break
      case '30d':
        start = new Date(today)
        start.setDate(start.getDate() - 30)
        break
      case '90d':
        start = new Date(today)
        start.setDate(start.getDate() - 90)
        break
      case 'ytd':
        start = new Date(today.getFullYear(), 0, 1)
        break
      case 'all':
        start = null
        end = null
        break
    }

    setDateRange({ start, end })
  }

  const maxDailyRevenue = useMemo(() => 
    Math.max(...dailyData.map(d => d.revenue), 1), [dailyData])
  const maxRegionRevenue = useMemo(() => 
    Math.max(...regionData.map(d => d.revenue), 1), [regionData])

  // Widget drag and drop handlers
  const handleDragStart = (widgetId: string) => {
    if (!isEditMode) return
    setDraggedWidget(widgetId)
  }

  const handleDragEnd = () => {
    setDraggedWidget(null)
  }

  const handleDeleteWidget = (widgetId: string) => {
    setWidgets(prev => prev.filter(w => w.id !== widgetId))
  }

  const handleAddWidget = (type: DashboardWidget['type'], title: string) => {
    const newWidget: DashboardWidget = {
      id: `widget-${Date.now()}`,
      type,
      title,
      config: type === 'stat' ? { statKey: 'totalRevenue' } : { chartType: 'bar', dataSource: 'daily' },
      position: { x: 0, y: widgets.reduce((max, w) => Math.max(max, w.position.y + w.size.h), 0) },
      size: type === 'stat' ? { w: 1, h: 1 } : { w: 2, h: 2 }
    }
    setWidgets(prev => [...prev, newWidget])
    setShowAddWidgetModal(false)
  }

  const saveLayout = () => {
    // Save to localStorage for now (could save to Supabase later)
    localStorage.setItem('gamedrive-dashboard-layout', JSON.stringify(widgets))
    setIsEditMode(false)
  }

  const resetLayout = () => {
    setWidgets(DEFAULT_WIDGETS)
  }

  // Load saved layout
  useEffect(() => {
    const saved = localStorage.getItem('gamedrive-dashboard-layout')
    if (saved) {
      try {
        setWidgets(JSON.parse(saved))
      } catch (e) {
        console.error('Failed to load saved layout', e)
      }
    }
  }, [])

  // Render stat widget
  const renderStatWidget = (widget: DashboardWidget) => {
    const statConfig: Record<string, { label: string; format: (v: number) => string; color: string; icon: string }> = {
      totalRevenue: { label: 'Net Steam sales', format: formatCurrency, color: '#dcfce7', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
      totalUnits: { label: 'Net units sold', format: formatNumber, color: '#dbeafe', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
      avgDailyRevenue: { label: 'Per day average', format: formatCurrency, color: '#fef3c7', icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6' },
      avgDailyUnits: { label: 'Per day average', format: formatNumber, color: '#f3e8ff', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
      refundRate: { label: 'Chargebacks/returns', format: (v) => `${v.toFixed(1)}%`, color: '#fee2e2', icon: 'M16 15v-1a4 4 0 00-4-4H8m0 0l3 3m-3-3l3-3m9 14V5a2 2 0 00-2-2H6a2 2 0 00-2 2v16l4-2 4 2 4-2 4 2z' }
    }
    
    const config = statConfig[widget.config.statKey || 'totalRevenue']
    const value = summaryStats?.[widget.config.statKey as keyof SummaryStats] || 0

    return (
      <div className={styles.statCard}>
        <div className={styles.statHeader}>
          <span className={styles.statTitle}>{widget.title}</span>
          <div className={styles.statIcon} style={{ backgroundColor: config.color }}>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={config.icon} />
            </svg>
          </div>
        </div>
        <div className={styles.statValue}>{config.format(value as number)}</div>
        <div className={styles.statSubtext}>{config.label}</div>
      </div>
    )
  }

  // Render chart widget
  const renderChartWidget = (widget: DashboardWidget) => {
    return (
      <div className={styles.chartCard}>
        <h3 className={styles.chartTitle}>{widget.title}</h3>
        <div className={styles.chartLegend}>
          <span className={styles.legendItem}>
            <span className={styles.legendDot} style={{ backgroundColor: '#16a34a' }} />
            Sale Period
          </span>
          <span className={styles.legendItem}>
            <span className={styles.legendDot} style={{ backgroundColor: '#94a3b8' }} />
            Regular Price
          </span>
        </div>
        <div className={styles.barChartContainer}>
          {dailyData.length > 0 ? (
            <div className={styles.barChart}>
              {dailyData.map((day, idx) => (
                <div key={idx} className={styles.barColumn} title={`${formatDate(day.date)}: ${formatCurrency(day.revenue)}`}>
                  <div className={styles.barWrapper}>
                    <div 
                      className={styles.bar}
                      style={{ 
                        height: `${Math.max((day.revenue / maxDailyRevenue) * 100, 2)}%`,
                        backgroundColor: day.isSale ? '#16a34a' : '#94a3b8'
                      }}
                    />
                  </div>
                  <span className={styles.barLabel}>{formatDate(day.date)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.noChartData}>No time series data available</div>
          )}
        </div>
      </div>
    )
  }

  // Render region widget
  const renderRegionWidget = (widget: DashboardWidget) => {
    return (
      <div className={styles.chartCard}>
        <h3 className={styles.chartTitle}>{widget.title}</h3>
        <div className={styles.horizontalBarChart}>
          {regionData.length > 0 ? regionData.map((region, idx) => (
            <div key={idx} className={styles.horizontalBarRow}>
              <span className={styles.horizontalBarLabel}>{region.region}</span>
              <div className={styles.horizontalBarWrapper}>
                <div 
                  className={styles.horizontalBar}
                  style={{ width: `${(region.revenue / maxRegionRevenue) * 100}%` }}
                />
                <span className={styles.horizontalBarValue}>
                  {formatCurrency(region.revenue)} ({region.percentage.toFixed(1)}%)
                </span>
              </div>
            </div>
          )) : (
            <div className={styles.noChartData}>No regional data available</div>
          )}
        </div>
      </div>
    )
  }

  // Render table widget
  const renderTableWidget = (widget: DashboardWidget) => {
    return (
      <div className={styles.periodSection}>
        <div className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>{widget.title}</h3>
          <p className={styles.sectionSubtitle}>Compare sale periods vs regular price performance</p>
        </div>
        {periodData.length > 0 ? (
          <div className={styles.periodTable}>
            <table>
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Dates</th>
                  <th>Days</th>
                  <th>Total Revenue</th>
                  <th>Total Units</th>
                  <th>Avg Daily Revenue</th>
                  <th>Avg Daily Units</th>
                </tr>
              </thead>
              <tbody>
                {periodData.map((period, idx) => (
                  <tr key={idx} className={period.isSale ? styles.salePeriodRow : ''}>
                    <td>
                      <span className={`${styles.periodBadge} ${period.isSale ? styles.saleBadge : styles.regularBadge}`}>
                        {period.isSale ? '🏷️ ' : ''}{period.name}
                      </span>
                    </td>
                    <td>{formatDate(period.startDate)} - {formatDate(period.endDate)}</td>
                    <td>{period.days}</td>
                    <td className={styles.revenueCell}>{formatCurrency(period.totalRevenue)}</td>
                    <td>{formatNumber(period.totalUnits)}</td>
                    <td className={styles.revenueCell}>{formatCurrency(period.avgDailyRevenue)}</td>
                    <td>{formatNumber(period.avgDailyUnits)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={styles.periodPlaceholder}>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <p>Period comparison requires data with sale price information</p>
          </div>
        )}
      </div>
    )
  }

  // Render widget based on type
  const renderWidget = (widget: DashboardWidget) => {
    switch (widget.type) {
      case 'stat': return renderStatWidget(widget)
      case 'chart': return renderChartWidget(widget)
      case 'region': return renderRegionWidget(widget)
      case 'table': return renderTableWidget(widget)
      default: return null
    }
  }

  return (
    <div className={styles.pageContainer}>
      <AnalyticsSidebar />
      
      <div className={styles.pageContent}>
        <PageToggle />
        
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <h1 className={styles.title}>Steam Analytics</h1>
            <p className={styles.subtitle}>Performance metrics and sales analysis</p>
          </div>
          <div className={styles.headerRight}>
            {isEditMode ? (
              <>
                <button className={styles.addWidgetButton} onClick={() => setShowAddWidgetModal(true)}>
                  <svg className={styles.buttonIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Widget
                </button>
                <button className={styles.resetButton} onClick={resetLayout}>
                  <svg className={styles.buttonIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Reset
                </button>
                <button className={styles.saveButton} onClick={saveLayout}>
                  <svg className={styles.buttonIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Save Layout
                </button>
              </>
            ) : (
              <>
                <button className={styles.editButton} onClick={() => setIsEditMode(true)}>
                  <svg className={styles.buttonIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Dashboard Builder
                </button>
                <button className={styles.importButton} onClick={() => setShowImportModal(true)}>
                  <svg className={styles.buttonIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  Import CSV
                </button>
                <button className={styles.refreshButton} onClick={fetchPerformanceData} disabled={isLoading}>
                  <svg className={`${styles.buttonIcon} ${isLoading ? styles.spinning : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Refresh
                </button>
              </>
            )}
          </div>
        </div>

        {isEditMode && (
          <div className={styles.editModeBar}>
            <div className={styles.editModeInfo}>
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Edit Mode: Click X to remove widgets, or add new ones with the Add Widget button</span>
            </div>
          </div>
        )}

        <div className={styles.filtersBar}>
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Date Range</label>
            <div className={styles.datePresets}>
              <button className={`${styles.presetButton} ${!dateRange.start && !dateRange.end ? styles.presetActive : ''}`} onClick={() => setPresetDateRange('all')}>All Time</button>
              <button className={styles.presetButton} onClick={() => setPresetDateRange('7d')}>7D</button>
              <button className={styles.presetButton} onClick={() => setPresetDateRange('30d')}>30D</button>
              <button className={styles.presetButton} onClick={() => setPresetDateRange('90d')}>90D</button>
              <button className={styles.presetButton} onClick={() => setPresetDateRange('ytd')}>YTD</button>
            </div>
          </div>

          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Client</label>
            <select className={styles.filterSelect} value={selectedClient} onChange={(e) => setSelectedClient(e.target.value)}>
              <option value="all">All Clients</option>
              {clients.map(client => (<option key={client.id} value={client.id}>{client.name}</option>))}
            </select>
          </div>

          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Product</label>
            <select className={styles.filterSelect} value={selectedProduct} onChange={(e) => setSelectedProduct(e.target.value)}>
              <option value="all">All Products</option>
              {products.map(product => (<option key={product} value={product}>{product}</option>))}
            </select>
          </div>

          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Region</label>
            <select className={styles.filterSelect} value={selectedRegion} onChange={(e) => setSelectedRegion(e.target.value)}>
              <option value="all">All Regions</option>
              {regions.map(region => (<option key={region} value={region}>{region}</option>))}
            </select>
          </div>

          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Platform</label>
            <select className={styles.filterSelect} value={selectedPlatform} onChange={(e) => setSelectedPlatform(e.target.value)}>
              <option value="all">All Platforms</option>
              {platforms.map(platform => (<option key={platform} value={platform}>{platform}</option>))}
            </select>
          </div>
        </div>

        {isLoading ? (
          <div className={styles.statsGrid}>
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className={styles.statCardSkeleton}>
                <div className={styles.skeletonTitle} />
                <div className={styles.skeletonValue} />
              </div>
            ))}
          </div>
        ) : !dataAvailable ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h3 className={styles.emptyTitle}>No Performance Data Yet</h3>
            <p className={styles.emptyDescription}>Import your Steam sales data to see analytics and performance metrics.</p>
            <button className={styles.emptyButton} onClick={() => setShowImportModal(true)}>
              <svg className={styles.buttonIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Import CSV Data
            </button>
          </div>
        ) : (
          <div ref={gridRef} className={`${styles.dashboardGrid} ${isEditMode ? styles.editableGrid : ''}`}>
            {/* Stats Row */}
            <div className={styles.statsGrid}>
              {widgets.filter(w => w.type === 'stat').map(widget => (
                <div 
                  key={widget.id} 
                  className={`${styles.widgetWrapper} ${isEditMode ? styles.editableWidget : ''} ${draggedWidget === widget.id ? styles.dragging : ''}`}
                  draggable={isEditMode}
                  onDragStart={() => handleDragStart(widget.id)}
                  onDragEnd={handleDragEnd}
                >
                  {isEditMode && (
                    <div className={styles.widgetControls}>
                      <button className={styles.widgetDeleteBtn} onClick={() => handleDeleteWidget(widget.id)} title="Delete widget">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  )}
                  {renderWidget(widget)}
                </div>
              ))}
            </div>

            {/* Charts Row */}
            <div className={styles.chartsSection}>
              {widgets.filter(w => w.type === 'chart').map(widget => (
                <div 
                  key={widget.id} 
                  className={`${styles.widgetWrapper} ${isEditMode ? styles.editableWidget : ''}`}
                  draggable={isEditMode}
                  onDragStart={() => handleDragStart(widget.id)}
                  onDragEnd={handleDragEnd}
                >
                  {isEditMode && (
                    <div className={styles.widgetControls}>
                      <button className={styles.widgetDeleteBtn} onClick={() => handleDeleteWidget(widget.id)} title="Delete widget">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  )}
                  {renderWidget(widget)}
                </div>
              ))}
              {widgets.filter(w => w.type === 'region').map(widget => (
                <div 
                  key={widget.id} 
                  className={`${styles.widgetWrapper} ${isEditMode ? styles.editableWidget : ''}`}
                  draggable={isEditMode}
                  onDragStart={() => handleDragStart(widget.id)}
                  onDragEnd={handleDragEnd}
                >
                  {isEditMode && (
                    <div className={styles.widgetControls}>
                      <button className={styles.widgetDeleteBtn} onClick={() => handleDeleteWidget(widget.id)} title="Delete widget">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  )}
                  {renderWidget(widget)}
                </div>
              ))}
            </div>

            {/* Table Section */}
            {widgets.filter(w => w.type === 'table').map(widget => (
              <div 
                key={widget.id} 
                className={`${styles.widgetWrapper} ${isEditMode ? styles.editableWidget : ''}`}
                draggable={isEditMode}
                onDragStart={() => handleDragStart(widget.id)}
                onDragEnd={handleDragEnd}
              >
                {isEditMode && (
                  <div className={styles.widgetControls}>
                    <button className={styles.widgetDeleteBtn} onClick={() => handleDeleteWidget(widget.id)} title="Delete widget">
                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                )}
                {renderWidget(widget)}
              </div>
            ))}

            <div className={styles.dataInfo}>
              <span className={styles.dataInfoText}>Showing {formatNumber(performanceData.length)} records across {summaryStats?.totalDays || 0} days</span>
            </div>
          </div>
        )}

        {showImportModal && (
          <ImportPerformanceModal
            onClose={() => setShowImportModal(false)}
            onSuccess={() => {
              setShowImportModal(false)
              fetchPerformanceData()
            }}
          />
        )}

        {showAddWidgetModal && (
          <AddWidgetModal
            onClose={() => setShowAddWidgetModal(false)}
            onAdd={handleAddWidget}
          />
        )}
      </div>
    </div>
  )
}

// Add Widget Modal
function AddWidgetModal({ onClose, onAdd }: { onClose: () => void; onAdd: (type: DashboardWidget['type'], title: string) => void }) {
  const [selectedType, setSelectedType] = useState<DashboardWidget['type']>('stat')
  const [title, setTitle] = useState('')

  const widgetTypes = [
    { type: 'stat' as const, name: 'Stat Card', description: 'Display a single metric', icon: 'M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z' },
    { type: 'chart' as const, name: 'Bar Chart', description: 'Revenue or units over time', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
    { type: 'region' as const, name: 'Region Breakdown', description: 'Revenue by geographic region', icon: 'M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
    { type: 'table' as const, name: 'Period Table', description: 'Compare sale vs regular periods', icon: 'M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z' },
  ]

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Add Widget</h2>
          <button className={styles.modalClose} onClick={onClose}>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className={styles.modalContent}>
          <div className={styles.widgetTypeGrid}>
            {widgetTypes.map(wt => (
              <button
                key={wt.type}
                className={`${styles.widgetTypeCard} ${selectedType === wt.type ? styles.widgetTypeSelected : ''}`}
                onClick={() => setSelectedType(wt.type)}
              >
                <svg className={styles.widgetTypeIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={wt.icon} />
                </svg>
                <span className={styles.widgetTypeName}>{wt.name}</span>
                <span className={styles.widgetTypeDesc}>{wt.description}</span>
              </button>
            ))}
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Widget Title</label>
            <input
              type="text"
              className={styles.formInput}
              placeholder="Enter widget title..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
        </div>

        <div className={styles.modalFooter}>
          <button className={styles.cancelButton} onClick={onClose}>Cancel</button>
          <button 
            className={styles.importSubmitButton} 
            onClick={() => onAdd(selectedType, title || widgetTypes.find(w => w.type === selectedType)?.name || 'Widget')}
          >
            Add Widget
          </button>
        </div>
      </div>
    </div>
  )
}

function ImportPerformanceModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const supabase = createClientComponentClient()
  const [file, setFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<string[][]>([])
  const [progress, setProgress] = useState({ current: 0, total: 0 })

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    setFile(selectedFile)
    setError(null)

    try {
      const text = await selectedFile.text()
      const lines = text.split('\n').slice(0, 6)
      const rows = lines.map(line => line.split(',').map(cell => cell.trim().replace(/^"|"$/g, '')))
      setPreview(rows)
    } catch (err) {
      console.error(err)
      setError('Could not read file')
    }
  }

  const handleImport = async () => {
    if (!file) return

    setIsUploading(true)
    setError(null)

    try {
      const text = await file.text()
      const lines = text.split('\n').filter(line => line.trim())
      const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase())
      
      const columnMap: Record<string, string> = {
        'date': 'date',
        'bundle name': 'bundle_name',
        'product name': 'product_name',
        'type': 'product_type',
        'game': 'game',
        'platform': 'platform',
        'country code': 'country_code',
        'country': 'country',
        'region': 'region',
        'gross units sold': 'gross_units_sold',
        'chargebacks / returns': 'chargebacks_returns',
        'net units sold': 'net_units_sold',
        'base price (usd)': 'base_price_usd',
        'sale price (usd)': 'sale_price_usd',
        'currency': 'currency',
        'gross steam sales (usd)': 'gross_steam_sales_usd',
        'chargeback / returns (usd)': 'chargeback_returns_usd',
        'vat / tax (usd)': 'vat_tax_usd',
        'net steam sales (usd)': 'net_steam_sales_usd'
      }

      const { data: clients } = await supabase.from('clients').select('id').limit(1)
      let clientId = clients?.[0]?.id

      if (!clientId) {
        const { data: newClient } = await supabase
          .from('clients')
          .insert({ name: 'Default Client', email: 'default@example.com' })
          .select()
          .single()
        clientId = newClient?.id
      }

      const dataRows = lines.slice(1)
      const batchSize = 500
      let imported = 0
      let skipped = 0

      setProgress({ current: 0, total: dataRows.length })

      for (let i = 0; i < dataRows.length; i += batchSize) {
        const batch = dataRows.slice(i, i + batchSize)
        const records = batch.map(line => {
          const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''))
          const record: Record<string, unknown> = { client_id: clientId }

          headers.forEach((header, idx) => {
            const dbColumn = columnMap[header]
            if (dbColumn && values[idx]) {
              const value = values[idx]
              if (['gross_units_sold', 'chargebacks_returns', 'net_units_sold'].includes(dbColumn)) {
                record[dbColumn] = parseInt(value) || 0
              } else if (dbColumn.includes('usd') || dbColumn.includes('price')) {
                record[dbColumn] = parseFloat(value.replace('$', '').replace(',', '')) || 0
              } else {
                record[dbColumn] = value
              }
            }
          })

          return record
        }).filter(r => r.date && r.product_name)

        if (records.length > 0) {
          const { error: insertError } = await supabase
            .from('steam_performance_data')
            .upsert(records, {
              onConflict: 'client_id,date,product_name,platform,country_code'
            })

          if (insertError) {
            console.error('Insert error:', insertError)
            skipped += batch.length
          } else {
            imported += records.length
          }
        }

        setProgress({ current: Math.min(i + batchSize, dataRows.length), total: dataRows.length })
      }

      await supabase.from('performance_import_history').insert({
        client_id: clientId,
        import_type: 'csv',
        filename: file.name,
        rows_imported: imported,
        rows_skipped: skipped,
        status: 'completed'
      })

      onSuccess()
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Import failed'
      setError(errorMessage)
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Import Steam Performance Data</h2>
          <button className={styles.modalClose} onClick={onClose}>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className={styles.modalContent}>
          <div className={styles.uploadZone}>
            <input type="file" accept=".csv" onChange={handleFileSelect} className={styles.fileInput} id="csvInput" />
            <label htmlFor="csvInput" className={styles.uploadLabel}>
              {file ? (
                <>
                  <svg className={styles.uploadIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className={styles.fileName}>{file.name}</span>
                  <span className={styles.fileSize}>({(file.size / 1024 / 1024).toFixed(2)} MB)</span>
                </>
              ) : (
                <>
                  <svg className={styles.uploadIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <span>Click to select CSV file</span>
                  <span className={styles.uploadHint}>or drag and drop</span>
                </>
              )}
            </label>
          </div>

          {preview.length > 0 && (
            <div className={styles.previewSection}>
              <h4 className={styles.previewTitle}>Preview</h4>
              <div className={styles.previewTable}>
                <table>
                  <thead>
                    <tr>
                      {preview[0]?.map((header: string, i: number) => (<th key={i}>{header}</th>))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.slice(1).map((row, i) => (
                      <tr key={i}>
                        {row.map((cell: string, j: number) => (<td key={j}>{cell}</td>))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {error && (
            <div className={styles.errorMessage}>
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
          )}

          {isUploading && progress.total > 0 && (
            <div className={styles.progressSection}>
              <div className={styles.progressBar}>
                <div className={styles.progressFill} style={{ width: `${(progress.current / progress.total) * 100}%` }} />
              </div>
              <span className={styles.progressText}>Processing {progress.current.toLocaleString()} of {progress.total.toLocaleString()} rows...</span>
            </div>
          )}
        </div>

        <div className={styles.modalFooter}>
          <button className={styles.cancelButton} onClick={onClose} disabled={isUploading}>Cancel</button>
          <button className={styles.importSubmitButton} onClick={handleImport} disabled={!file || isUploading}>
            {isUploading ? 'Importing...' : 'Import Data'}
          </button>
        </div>
      </div>
    </div>
  )
}
