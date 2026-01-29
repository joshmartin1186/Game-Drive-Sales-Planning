'use client'

// Cache invalidation: 2026-01-16T12:00:00Z - Editable dashboard with drag-drop widgets

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import styles from './page.module.css'
import PageToggle from '../components/PageToggle'
import { useAuth } from '@/lib/auth-context'

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

interface CountryData {
  country: string
  revenue: number
  units: number
  percentage: number
  avgPrice: number
}

interface GrowthData {
  currentRevenue: number
  currentUnits: number
  previousRevenue: number
  previousUnits: number
  revenueGrowth: number
  unitsGrowth: number
  avgPriceCurrent: number
  avgPricePrevious: number
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
  type: 'stat' | 'chart' | 'table' | 'region' | 'countries' | 'growth' | 'growth-line' | 'avg-price' | 'pie' | 'world-map' | 'heatmap' | 'sale-comparison'
  title: string
  config: {
    statKey?: string
    chartType?: 'bar' | 'line' | 'pie' | 'area' | 'donut' | 'choropleth' | 'stacked-bar' | 'horizontal-bar'

    mapType?: string
    // Filter options
    filterProduct?: string
    filterClient?: string
    filterRegion?: string
    filterPlatform?: string
    // Display options
    showLegend?: boolean
    showGrid?: boolean
    colorScheme?: 'blue' | 'green' | 'purple' | 'multi'
    // Aggregation options
    aggregateBy?: 'sum' | 'avg' | 'min' | 'max'
    groupBy?: 'day' | 'week' | 'month' | 'quarter' | 'year'
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

// Default dashboard layout - comprehensive view
const DEFAULT_WIDGETS: DashboardWidget[] = [
  // Top stats row - 5 compact cards
  { id: 'stat-revenue', type: 'stat', title: 'Total Revenue', config: { statKey: 'totalRevenue' }, position: { x: 0, y: 0 }, size: { w: 1, h: 1 } },
  { id: 'stat-units', type: 'stat', title: 'Total Units', config: { statKey: 'totalUnits' }, position: { x: 1, y: 0 }, size: { w: 1, h: 1 } },
  { id: 'stat-avg-rev', type: 'stat', title: 'Avg Daily Revenue', config: { statKey: 'avgDailyRevenue' }, position: { x: 2, y: 0 }, size: { w: 1, h: 1 } },
  { id: 'stat-avg-units', type: 'stat', title: 'Avg Daily Units', config: { statKey: 'avgDailyUnits' }, position: { x: 3, y: 0 }, size: { w: 1, h: 1 } },
  { id: 'stat-refund', type: 'stat', title: 'Refund Rate', config: { statKey: 'refundRate' }, position: { x: 4, y: 0 }, size: { w: 1, h: 1 } },
  // Charts row - Revenue Per Unit as pie chart, Revenue Over Time as line chart
  { id: 'revenue-pie-chart', type: 'pie', title: 'Revenue Per Unit', config: { chartType: 'pie' }, position: { x: 0, y: 1 }, size: { w: 1, h: 1 } },
  { id: 'chart-revenue', type: 'chart', title: 'Revenue Over Time', config: { chartType: 'line' }, position: { x: 1, y: 1 }, size: { w: 1, h: 1 } },
  // World map - full width
  { id: 'world-map', type: 'world-map', title: 'Revenue by Country', config: { mapType: 'choropleth' }, position: { x: 0, y: 2 }, size: { w: 2, h: 1 } },
  // Sale Performance comparison - full width
  { id: 'sale-performance', type: 'sale-comparison', title: 'Sale Performance Analysis', config: { chartType: 'stacked-bar' }, position: { x: 0, y: 3 }, size: { w: 2, h: 1 } },
]

export default function AnalyticsPage() {
  const supabase = createClientComponentClient()
  const { hasAccess, loading: authLoading } = useAuth()
  const canView = hasAccess('analytics', 'view')
  const canEdit = hasAccess('analytics', 'edit')

  // State
  const [isLoading, setIsLoading] = useState(true)
  const [performanceData, setPerformanceData] = useState<PerformanceData[]>([])
  const [summaryStats, setSummaryStats] = useState<SummaryStats | null>(null)
  const [dateRange, setDateRange] = useState<DateRange>({ start: null, end: null })
  const [selectedDatePreset, setSelectedDatePreset] = useState<string>('60d')
  const [selectedProduct, setSelectedProduct] = useState<string>('all')
  const [selectedClient, setSelectedClient] = useState<string>('all')
  const [selectedRegion, setSelectedRegion] = useState<string>('all')
  const [selectedPlatform, setSelectedPlatform] = useState<string>('all')
  const [hoveredPieSlice, setHoveredPieSlice] = useState<number | null>(null)
  const [hoveredLinePoint, setHoveredLinePoint] = useState<{ index: number; x: number; y: number } | null>(null)
  const [editingWidget, setEditingWidget] = useState<DashboardWidget | null>(null)
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
      // Only select the columns we actually need for better performance
      const columns = 'date,product_name,platform,country_code,country,region,gross_units_sold,chargebacks_returns,net_units_sold,base_price_usd,sale_price_usd,net_steam_sales_usd,client_id'

      // Supabase has a hard 1000 row limit per query, so fetch in batches
      let allData: PerformanceData[] = []
      let hasMore = true
      let offset = 0
      const batchSize = 1000

      while (hasMore) {
        let query = supabase
          .from('steam_performance_data_view')
          .select(columns)
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

        allData = allData.concat((data || []) as PerformanceData[])
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

    // Only group by month for longer periods (90D+, YTD, All Time)
    // Keep daily granularity for 7D, 30D, 60D
    const isDailyView = selectedDatePreset === '7d' || selectedDatePreset === '30d' || selectedDatePreset === '60d'
    const shouldGroupByMonth = !isDailyView && dailyEntries.length > 45

    if (shouldGroupByMonth) {
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
  }, [performanceData, selectedDatePreset])

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

  // Compute top countries
  const countryData = useMemo((): CountryData[] => {
    if (!performanceData.length) return []

    const byCountry = new Map<string, { revenue: number; units: number }>()
    let totalRevenue = 0

    performanceData.forEach(row => {
      const country = row.country || row.country_code || 'Unknown'
      const existing = byCountry.get(country) || { revenue: 0, units: 0 }
      const rowRevenue = toNumber(row.net_steam_sales_usd)
      const rowUnits = toNumber(row.net_units_sold)
      byCountry.set(country, {
        revenue: existing.revenue + rowRevenue,
        units: existing.units + rowUnits
      })
      totalRevenue += rowRevenue
    })

    return Array.from(byCountry.entries())
      .map(([country, data]) => ({
        country,
        revenue: data.revenue,
        units: data.units,
        percentage: safeDivide(data.revenue, totalRevenue) * 100,
        avgPrice: safeDivide(data.revenue, data.units)
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10) // Top 10
  }, [performanceData])

  // Compute growth metrics (current period vs previous period)
  const growthData = useMemo((): GrowthData | null => {
    if (!dailyData.length || dailyData.length < 2) return null

    // Split the data into two halves
    const midpoint = Math.floor(dailyData.length / 2)
    const previousPeriod = dailyData.slice(0, midpoint)
    const currentPeriod = dailyData.slice(midpoint)

    const previousRevenue = previousPeriod.reduce((sum, d) => sum + d.revenue, 0)
    const previousUnits = previousPeriod.reduce((sum, d) => sum + d.units, 0)
    const currentRevenue = currentPeriod.reduce((sum, d) => sum + d.revenue, 0)
    const currentUnits = currentPeriod.reduce((sum, d) => sum + d.units, 0)

    return {
      currentRevenue,
      currentUnits,
      previousRevenue,
      previousUnits,
      revenueGrowth: safeDivide(currentRevenue - previousRevenue, previousRevenue) * 100,
      unitsGrowth: safeDivide(currentUnits - previousUnits, previousUnits) * 100,
      avgPriceCurrent: safeDivide(currentRevenue, currentUnits),
      avgPricePrevious: safeDivide(previousRevenue, previousUnits)
    }
  }, [dailyData])

  // Compute revenue per unit over time
  const avgPriceData = useMemo(() => {
    if (!dailyData.length) return []

    return dailyData.map(day => ({
      date: day.date,
      avgPrice: safeDivide(day.revenue, day.units),
      revenue: day.revenue,
      units: day.units
    }))
  }, [dailyData])

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

  // Memoize product revenue calculation for pie chart
  const productRevenueData = useMemo(() => {
    if (!performanceData.length) return []

    const productRevenue = new Map<string, number>()
    performanceData.forEach(row => {
      const product = row.product_name || 'Unknown'
      const revenue = toNumber(row.net_steam_sales_usd)
      productRevenue.set(product, (productRevenue.get(product) || 0) + revenue)
    })

    return Array.from(productRevenue.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
  }, [performanceData])

  // Memoize country revenue calculation for world map
  const countryRevenueData = useMemo(() => {
    if (!performanceData.length) return []

    const countryRevenue = new Map<string, number>()
    performanceData.forEach(row => {
      const country = row.country_code || 'Unknown'
      const revenue = toNumber(row.net_steam_sales_usd)
      countryRevenue.set(country, (countryRevenue.get(country) || 0) + revenue)
    })

    return Array.from(countryRevenue.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 15) // Top 15 countries
  }, [performanceData])

  // Memoize sale vs regular performance data
  const salePerformanceData = useMemo(() => {
    if (!performanceData.length) return { saleData: null, regularData: null }

    const saleData = { revenue: 0, units: 0, days: 0 }
    const regularData = { revenue: 0, units: 0, days: 0 }
    const seenDates = new Set<string>()

    performanceData.forEach(row => {
      const date = row.date
      const isSale = isSalePrice(row.base_price_usd, row.sale_price_usd)
      const revenue = toNumber(row.net_steam_sales_usd)
      const units = toNumber(row.net_units_sold)

      if (isSale) {
        saleData.revenue += revenue
        saleData.units += units
        if (!seenDates.has(`sale-${date}`)) {
          saleData.days++
          seenDates.add(`sale-${date}`)
        }
      } else {
        regularData.revenue += revenue
        regularData.units += units
        if (!seenDates.has(`regular-${date}`)) {
          regularData.days++
          seenDates.add(`regular-${date}`)
        }
      }
    })

    return { saleData, regularData }
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

  const formatDate = (dateStr: string, includeDay: boolean = true, forLabel: boolean = false) => {
    // Parse date as UTC to avoid timezone shifts
    const [year, month, day] = dateStr.split('-').map(Number)
    const date = new Date(Date.UTC(year, month - 1, day))

    // Determine if we're showing daily or monthly data based on the selected date range
    // 7D, 30D, and 60D show daily bars, everything else (90D, YTD, All Time) shows monthly aggregated bars
    const isDailyView = selectedDatePreset === '7d' || selectedDatePreset === '30d' || selectedDatePreset === '60d'
    const isMonthlyAggregated = !isDailyView || (day === 1 && dailyData.length > 45)

    // For monthly aggregated data (90D, YTD, All Time)
    if (isMonthlyAggregated) {
      if (forLabel) {
        // Bar labels: show just "Jan" for cleaner look
        return date.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
      }
      // Tooltips: show "Jan 2024" with year
      return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
    }

    // For daily view data (7D, 30D)
    if (includeDay) {
      // Tooltips with full date and year
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    }
    // Bar labels in daily view - show "Jan 13" format (month + day)
    if (forLabel) {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
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
      case '60d':
        start = new Date(today)
        start.setDate(start.getDate() - 60)
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

    setSelectedDatePreset(preset)
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

  const handleDrop = (targetWidgetId: string) => {
    if (!draggedWidget || draggedWidget === targetWidgetId) return

    setWidgets(prev => {
      const draggedIdx = prev.findIndex(w => w.id === draggedWidget)
      const targetIdx = prev.findIndex(w => w.id === targetWidgetId)

      if (draggedIdx === -1 || targetIdx === -1) return prev

      const newWidgets = [...prev]
      const [removed] = newWidgets.splice(draggedIdx, 1)
      newWidgets.splice(targetIdx, 0, removed)

      return newWidgets
    })
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDeleteWidget = (widgetId: string) => {
    setWidgets(prev => prev.filter(w => w.id !== widgetId))
  }

  const handleResizeWidget = (widgetId: string, newSize: { w: number; h: number }) => {
    setWidgets(prev => prev.map(w =>
      w.id === widgetId ? { ...w, size: newSize } : w
    ))
  }

  const handleAddWidget = (type: DashboardWidget['type'], title: string) => {
    const newWidget: DashboardWidget = {
      id: `widget-${Date.now()}`,
      type,
      title,
      config: type === 'stat' ? { statKey: 'totalRevenue' } : { chartType: type === 'pie' ? 'pie' : 'bar' },
      position: { x: 0, y: widgets.reduce((max, w) => Math.max(max, w.position.y + w.size.h), 0) },
      size: type === 'stat' ? { w: 1, h: 1 } : { w: 2, h: 2 }
    }
    setWidgets(prev => [...prev, newWidget])
    setShowAddWidgetModal(false)
  }

  const saveLayout = () => {
    // Save to localStorage for now (could save to Supabase later)
    localStorage.setItem('gamedrive-dashboard-layout-v2', JSON.stringify(widgets))
    setIsEditMode(false)
  }

  const resetLayout = () => {
    setWidgets(DEFAULT_WIDGETS)
  }

  const handleSaveWidget = (updatedWidget: DashboardWidget) => {
    setWidgets(prev => prev.map(w => w.id === updatedWidget.id ? updatedWidget : w))
    localStorage.setItem('gamedrive-dashboard-layout-v2', JSON.stringify(widgets))
    setEditingWidget(null)
  }

  // Load saved layout
  useEffect(() => {
    const saved = localStorage.getItem('gamedrive-dashboard-layout-v2')
    if (saved) {
      try {
        setWidgets(JSON.parse(saved))
      } catch (e) {
        console.error('Failed to load saved layout', e)
      }
    }
  }, [])

  // Set initial date range to 60D on mount
  useEffect(() => {
    setPresetDateRange('60d')
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
    const chartData = dailyData
    const isMonthlyView = chartData.length > 45
    const chartType = widget.config.chartType || 'bar'

    // Detect year range for year indicators
    const yearSet = new Set(chartData.map(d => d.date.substring(0, 4)))
    const yearsArray = Array.from(yearSet).sort()
    const hasMultipleYears = yearsArray.length > 1
    const yearRange = yearsArray.length > 0
      ? (yearsArray.length === 1 ? yearsArray[0] : `${yearsArray[0]} - ${yearsArray[yearsArray.length - 1]}`)
      : ''

    // Line chart rendering
    if (chartType === 'line') {
      const width = 800
      const height = 300
      const padding = { top: 20, right: 40, bottom: 60, left: 40 }
      const chartWidth = width - padding.left - padding.right
      const chartHeight = height - padding.top - padding.bottom

      const maxRevenue = Math.max(...chartData.map(d => d.revenue))

      // Sample data points for cleaner visualization
      const sampleSize = Math.min(chartData.length, 30)
      const sampleInterval = Math.max(1, Math.floor(chartData.length / sampleSize))
      const sampledData = chartData.filter((_, i) => i % sampleInterval === 0 || i === chartData.length - 1)

      return (
        <div className={styles.chartCard}>
          <h3 className={styles.chartTitle}>{widget.title}</h3>
          <div style={{ padding: '12px', overflowX: 'auto', position: 'relative' }}>
            <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
              {/* Y-axis grid lines only - no numbers */}
              {[0, 0.25, 0.5, 0.75, 1].map((fraction, i) => {
                const y = padding.top + chartHeight - fraction * chartHeight
                return (
                  <line
                    key={i}
                    x1={padding.left}
                    y1={y}
                    x2={width - padding.right}
                    y2={y}
                    stroke="#e2e8f0"
                    strokeWidth="1"
                  />
                )
              })}

              {/* X-axis line */}
              <line
                x1={padding.left}
                y1={padding.top + chartHeight}
                x2={width - padding.right}
                y2={padding.top + chartHeight}
                stroke="#94a3b8"
                strokeWidth="2"
              />

              {/* Y-axis line */}
              <line
                x1={padding.left}
                y1={padding.top}
                x2={padding.left}
                y2={padding.top + chartHeight}
                stroke="#94a3b8"
                strokeWidth="2"
              />

              {/* Line path */}
              <polyline
                fill="none"
                stroke="#3b82f6"
                strokeWidth="3"
                points={sampledData.map((d, i) => {
                  const x = padding.left + (i / (sampledData.length - 1)) * chartWidth
                  const y = padding.top + chartHeight - (d.revenue / maxRevenue) * chartHeight
                  return `${x},${y}`
                }).join(' ')}
              />

              {/* Data points */}
              {sampledData.map((d, i) => {
                const x = padding.left + (i / (sampledData.length - 1)) * chartWidth
                const y = padding.top + chartHeight - (d.revenue / maxRevenue) * chartHeight
                return (
                  <circle
                    key={i}
                    cx={x}
                    cy={y}
                    r="6"
                    fill="#3b82f6"
                    onMouseEnter={() => setHoveredLinePoint({ index: i, x, y })}
                    onMouseLeave={() => setHoveredLinePoint(null)}
                    style={{ cursor: 'pointer' }}
                  />
                )
              })}

              {/* X-axis labels */}
              {sampledData.map((d, i) => {
                // Show only 4 labels to prevent overlap - first, last, and 2 in between
                const maxLabels = 4
                const shouldShowLabel =
                  i === 0 ||
                  i === sampledData.length - 1 ||
                  i === Math.floor(sampledData.length / 3) ||
                  i === Math.floor((2 * sampledData.length) / 3)

                if (shouldShowLabel) {
                  const x = padding.left + (i / (sampledData.length - 1)) * chartWidth
                  const y = padding.top + chartHeight + 25
                  return (
                    <text
                      key={i}
                      x={x}
                      y={y}
                      fontSize="9"
                      fill="#64748b"
                      textAnchor="end"
                      transform={`rotate(-45, ${x}, ${y})`}
                    >
                      {formatDate(d.date, false, true)}
                    </text>
                  )
                }
                return null
              })}

              {/* Axis labels */}
              <text
                x={padding.left / 2}
                y={padding.top + chartHeight / 2}
                fontSize="12"
                fill="#1e293b"
                fontWeight="600"
                textAnchor="middle"
                transform={`rotate(-90, ${padding.left / 2}, ${padding.top + chartHeight / 2})`}
              >
                Revenue
              </text>
              <text
                x={padding.left + chartWidth / 2}
                y={height - 10}
                fontSize="12"
                fill="#1e293b"
                fontWeight="600"
                textAnchor="middle"
              >
                Date
              </text>
            </svg>

            {/* Hover tooltip */}
            {hoveredLinePoint !== null && (() => {
              // Calculate tooltip position with bounds checking
              const tooltipWidth = 120 // approximate width
              const leftPercent = (hoveredLinePoint.x / width) * 100
              const topPercent = (hoveredLinePoint.y / height) * 100

              // Keep tooltip within container bounds
              const adjustedLeft = Math.min(Math.max(leftPercent, 10), 90)
              const adjustedTop = Math.max(topPercent - 15, 5)

              return (
                <div style={{
                  position: 'absolute',
                  left: `${adjustedLeft}%`,
                  top: `${adjustedTop}%`,
                  transform: 'translate(-50%, -100%)',
                  backgroundColor: 'white',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                  border: '1px solid #e2e8f0',
                  pointerEvents: 'none',
                  zIndex: 10,
                  whiteSpace: 'nowrap'
                }}>
                  <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '2px' }}>
                    {formatDate(sampledData[hoveredLinePoint.index].date)}
                  </div>
                  <div style={{ fontSize: '16px', fontWeight: '700', color: '#1e293b' }}>
                    {formatCurrency(sampledData[hoveredLinePoint.index].revenue)}
                  </div>
                </div>
              )
            })()}
          </div>
        </div>
      )
    }

    // Area chart rendering
    if (chartType === 'area') {
      const width = 800
      const height = 300
      const padding = { top: 20, right: 40, bottom: 60, left: 40 }
      const chartWidth = width - padding.left - padding.right
      const chartHeight = height - padding.top - padding.bottom

      const maxRevenue = Math.max(...chartData.map(d => d.revenue), 1)

      const sampleSize = Math.min(chartData.length, 30)
      const sampleInterval = Math.max(1, Math.floor(chartData.length / sampleSize))
      const sampledData = chartData.filter((_, i) => i % sampleInterval === 0 || i === chartData.length - 1)

      const areaPoints = sampledData.map((d, i) => {
        const x = padding.left + (i / (sampledData.length - 1)) * chartWidth
        const y = padding.top + chartHeight - (d.revenue / maxRevenue) * chartHeight
        return { x, y, data: d }
      })

      const areaPath = `M ${padding.left} ${padding.top + chartHeight} ` +
        areaPoints.map(p => `L ${p.x} ${p.y}`).join(' ') +
        ` L ${padding.left + chartWidth} ${padding.top + chartHeight} Z`

      const linePath = areaPoints.map(p => `${p.x},${p.y}`).join(' ')

      return (
        <div className={styles.chartCard}>
          <h3 className={styles.chartTitle}>{widget.title}</h3>
          <div style={{ padding: '12px', overflowX: 'auto', position: 'relative' }}>
            <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
              {[0, 0.25, 0.5, 0.75, 1].map((fraction, i) => {
                const y = padding.top + chartHeight - fraction * chartHeight
                return <line key={i} x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="#e2e8f0" strokeWidth="1" />
              })}
              <line x1={padding.left} y1={padding.top + chartHeight} x2={width - padding.right} y2={padding.top + chartHeight} stroke="#94a3b8" strokeWidth="2" />
              <line x1={padding.left} y1={padding.top} x2={padding.left} y2={padding.top + chartHeight} stroke="#94a3b8" strokeWidth="2" />

              <defs>
                <linearGradient id={`areaGrad-${widget.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.02" />
                </linearGradient>
              </defs>
              <path d={areaPath} fill={`url(#areaGrad-${widget.id})`} />
              <polyline fill="none" stroke="#3b82f6" strokeWidth="2.5" points={linePath} />

              {areaPoints.map((p, i) => (
                <circle
                  key={i}
                  cx={p.x}
                  cy={p.y}
                  r="4"
                  fill="#3b82f6"
                  onMouseEnter={() => setHoveredLinePoint({ index: i, x: p.x, y: p.y })}
                  onMouseLeave={() => setHoveredLinePoint(null)}
                  style={{ cursor: 'pointer' }}
                />
              ))}

              {areaPoints.map((p, i) => {
                const shouldShowLabel = i === 0 || i === areaPoints.length - 1 ||
                  i === Math.floor(areaPoints.length / 3) || i === Math.floor((2 * areaPoints.length) / 3)
                if (!shouldShowLabel) return null
                const labelY = padding.top + chartHeight + 25
                return (
                  <text key={i} x={p.x} y={labelY} fontSize="9" fill="#64748b" textAnchor="end" transform={`rotate(-45, ${p.x}, ${labelY})`}>
                    {formatDate(p.data.date, false, true)}
                  </text>
                )
              })}
            </svg>

            {hoveredLinePoint !== null && (() => {
              const leftPercent = (hoveredLinePoint.x / width) * 100
              const topPercent = (hoveredLinePoint.y / height) * 100
              const adjustedLeft = Math.min(Math.max(leftPercent, 10), 90)
              const adjustedTop = Math.max(topPercent - 15, 5)
              return (
                <div style={{ position: 'absolute', left: `${adjustedLeft}%`, top: `${adjustedTop}%`, transform: 'translate(-50%, -100%)', backgroundColor: 'white', padding: '8px 12px', borderRadius: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', border: '1px solid #e2e8f0', pointerEvents: 'none', zIndex: 10, whiteSpace: 'nowrap' }}>
                  <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '2px' }}>{formatDate(sampledData[hoveredLinePoint.index].date)}</div>
                  <div style={{ fontSize: '16px', fontWeight: '700', color: '#1e293b' }}>{formatCurrency(sampledData[hoveredLinePoint.index].revenue)}</div>
                </div>
              )
            })()}
          </div>
        </div>
      )
    }

    // Pie chart rendering (within chart widget)
    if (chartType === 'pie' || chartType === 'donut') {
      const isDonut = chartType === 'donut'
      const pieColors = [
        '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b',
        '#10b981', '#06b6d4', '#6366f1', '#f43f5e',
        '#14b8a6', '#a855f7', '#f97316', '#22c55e'
      ]

      if (productRevenueData.length === 0) {
        return (
          <div className={styles.chartCard}>
            <h3 className={styles.chartTitle}>{widget.title}</h3>
            <div className={styles.noChartData}>No product revenue data available</div>
          </div>
        )
      }

      const totalValue = productRevenueData.reduce((sum, s) => sum + s.value, 0)
      const centerX = 200
      const centerY = 200
      const outerRadius = 140
      const innerRadius = isDonut ? 80 : 0

      const polarToCartesian = (cx: number, cy: number, r: number, angle: number) => {
        const rad = (angle - 90) * Math.PI / 180
        return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
      }

      let currentAngle = 0

      return (
        <div className={styles.chartCard}>
          <h3 className={styles.chartTitle}>{widget.title}</h3>
          <div className={styles.pieChart}>
            <svg viewBox="0 0 400 400" style={{ width: '100%', height: '100%' }}>
              {productRevenueData.map((segment, i) => {
                const percentage = (segment.value / totalValue) * 100
                const sliceAngle = (percentage / 100) * 360
                const endAngle = currentAngle + sliceAngle
                const color = pieColors[i % pieColors.length]
                const largeArc = sliceAngle > 180 ? '1' : '0'

                let path: string
                if (isDonut) {
                  const outerStart = polarToCartesian(centerX, centerY, outerRadius, endAngle)
                  const outerEnd = polarToCartesian(centerX, centerY, outerRadius, currentAngle)
                  const innerStart = polarToCartesian(centerX, centerY, innerRadius, currentAngle)
                  const innerEnd = polarToCartesian(centerX, centerY, innerRadius, endAngle)
                  path = `M ${outerStart.x} ${outerStart.y} A ${outerRadius} ${outerRadius} 0 ${largeArc} 0 ${outerEnd.x} ${outerEnd.y} L ${innerStart.x} ${innerStart.y} A ${innerRadius} ${innerRadius} 0 ${largeArc} 1 ${innerEnd.x} ${innerEnd.y} Z`
                } else {
                  const start = polarToCartesian(centerX, centerY, outerRadius, endAngle)
                  const end = polarToCartesian(centerX, centerY, outerRadius, currentAngle)
                  path = `M ${centerX} ${centerY} L ${start.x} ${start.y} A ${outerRadius} ${outerRadius} 0 ${largeArc} 0 ${end.x} ${end.y} Z`
                }

                const slice = (
                  <path
                    key={i}
                    d={path}
                    fill={color}
                    className={styles.pieSlice}
                    onMouseEnter={() => setHoveredPieSlice(i)}
                    onMouseLeave={() => setHoveredPieSlice(null)}
                  />
                )
                currentAngle = endAngle
                return slice
              })}
              {isDonut && (
                <text x={centerX} y={centerY} textAnchor="middle" dominantBaseline="central" fontSize="18" fontWeight="700" fill="#1e293b">
                  {formatCurrency(totalValue)}
                </text>
              )}
            </svg>

            {hoveredPieSlice !== null && (
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', backgroundColor: 'white', padding: '12px 16px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', border: '1px solid #e2e8f0', pointerEvents: 'none', zIndex: 10 }}>
                <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '4px', fontWeight: '500' }}>{productRevenueData[hoveredPieSlice].name}</div>
                <div style={{ fontSize: '20px', fontWeight: '700', color: '#1e293b' }}>{formatCurrency(productRevenueData[hoveredPieSlice].value)}</div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px', marginTop: '8px', maxHeight: '120px', overflowY: 'auto', flexShrink: 0, padding: '0 16px 8px' }}>
            {productRevenueData.map((segment, i) => {
              const percentage = (segment.value / totalValue) * 100
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '14px', height: '14px', backgroundColor: pieColors[i % pieColors.length], borderRadius: '3px', flexShrink: 0 }} />
                  <span style={{ color: '#64748b', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{segment.name}</span>
                  <span style={{ color: '#1e293b', fontWeight: '600' }}>{formatCurrency(segment.value)} ({percentage.toFixed(1)}%)</span>
                </div>
              )
            })}
          </div>
        </div>
      )
    }

    // Horizontal bar chart rendering
    if (chartType === 'horizontal-bar') {
      const maxRevenue = Math.max(...chartData.map(d => d.revenue), 1)
      const displayData = chartData.slice(0, 20)

      return (
        <div className={styles.chartCard}>
          <h3 className={styles.chartTitle}>{widget.title}</h3>
          <div className={styles.horizontalBarChart} style={{ padding: '12px 16px' }}>
            {displayData.length > 0 ? displayData.map((day, idx) => {
              const percentage = (day.revenue / maxRevenue) * 100
              const barColor = day.isSale ? '#16a34a' : '#3b82f6'
              return (
                <div key={idx} className={styles.horizontalBarRow}>
                  <span className={styles.horizontalBarLabel}>{formatDate(day.date, false, true)}</span>
                  <div className={styles.horizontalBarWrapper}>
                    <div className={styles.horizontalBar} style={{ width: `${Math.max(percentage, 1)}%`, background: barColor }} />
                    <span className={styles.horizontalBarValue}>{formatCurrency(day.revenue)}</span>
                  </div>
                </div>
              )
            }) : (
              <div className={styles.noChartData}>No time series data available</div>
            )}
          </div>
        </div>
      )
    }

    // Stacked bar chart rendering (revenue + units side by side)
    if (chartType === 'stacked-bar') {
      const maxTotal = Math.max(...chartData.map(d => d.revenue + d.units), 1)
      const maxRevenue = Math.max(...chartData.map(d => d.revenue), 1)

      return (
        <div className={styles.chartCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
            <h3 className={styles.chartTitle}>{widget.title}</h3>
            {yearRange && <span style={{ fontSize: '0.875rem', fontWeight: 500, color: '#64748b' }}>{yearRange}</span>}
          </div>
          <div className={styles.chartLegend}>
            <span className={styles.legendItem}>
              <span className={styles.legendDot} style={{ backgroundColor: '#3b82f6' }} />
              Revenue
            </span>
            <span className={styles.legendItem}>
              <span className={styles.legendDot} style={{ backgroundColor: '#8b5cf6' }} />
              Units (scaled)
            </span>
            <span className={styles.legendItem}>
              <span className={styles.legendDot} style={{ backgroundColor: '#16a34a' }} />
              Sale Period
            </span>
          </div>
          <div className={styles.barChartContainer}>
            {chartData.length > 0 ? (
              <div className={styles.barChart}>
                {chartData.map((day, idx) => {
                  const revenueHeight = (day.revenue / maxRevenue) * 100
                  const unitHeight = Math.min((day.units / Math.max(...chartData.map(d => d.units), 1)) * 100, 100)
                  const saleColor = day.isSale ? '#16a34a' : '#3b82f6'

                  return (
                    <div key={idx} className={styles.barColumn}
                      onMouseMove={(e) => {
                        const tooltip = e.currentTarget.querySelector(`.${styles.barTooltip}`) as HTMLElement
                        if (tooltip) {
                          const rect = e.currentTarget.getBoundingClientRect()
                          tooltip.style.left = `${rect.left + rect.width / 2}px`
                          tooltip.style.top = `${rect.top}px`
                        }
                      }}
                    >
                      <div className={styles.barTooltip}>
                        <div style={{ fontWeight: 700, marginBottom: '6px', fontSize: '15px' }}>{formatDate(day.date)}</div>
                        <div style={{ fontSize: '14px', marginBottom: '2px' }}><strong>Revenue:</strong> {formatCurrency(day.revenue)}</div>
                        <div style={{ fontSize: '14px' }}><strong>Units:</strong> {formatNumber(day.units)}</div>
                        {day.isSale && <div style={{ marginTop: '6px', color: '#10b981', fontWeight: 600 }}>Sale Period</div>}
                      </div>
                      <div className={styles.barWrapper} style={{ flexDirection: 'row', gap: '1px', alignItems: 'flex-end' }}>
                        <div className={styles.bar} style={{ height: `${Math.max(revenueHeight, 2)}%`, backgroundColor: saleColor, flex: 1 }} />
                        <div className={styles.bar} style={{ height: `${Math.max(unitHeight, 2)}%`, backgroundColor: '#8b5cf6', flex: 1 }} />
                      </div>
                      <span className={styles.barLabel}>{formatDate(day.date, false, true)}</span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className={styles.noChartData}>No time series data available</div>
            )}
          </div>
        </div>
      )
    }

    // Bar chart rendering (default)
    const maxChartRevenue = Math.max(...chartData.map(d => d.revenue), 1)
    return (
      <div className={styles.chartCard}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
          <h3 className={styles.chartTitle}>
            {widget.title}
            {isMonthlyView && <span style={{ fontSize: '0.875rem', fontWeight: 400, color: '#64748b', marginLeft: '8px' }}>(Monthly)</span>}
          </h3>
          {yearRange && <span style={{ fontSize: '0.875rem', fontWeight: 500, color: '#64748b' }}>{yearRange}</span>}
        </div>
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
          {chartData.length > 0 ? (
            <div className={styles.barChart}>
              {chartData.map((day, idx) => {
                // Color based on revenue intensity
                const intensity = day.revenue / maxChartRevenue
                const barColor = day.isSale ? '#16a34a' :
                  intensity > 0.8 ? '#3b82f6' :
                  intensity > 0.6 ? '#60a5fa' :
                  intensity > 0.4 ? '#93c5fd' : '#cbd5e1'

                // Show year on first occurrence and when crossing year boundary
                const currentYear = day.date.substring(0, 4)
                const previousYear = idx > 0 ? chartData[idx - 1].date.substring(0, 4) : null
                const isFirstOfYear = hasMultipleYears && (idx === 0 || currentYear !== previousYear)

                // Month label no longer needed since we show "Jan 13" format in daily views

                return (
                  <React.Fragment key={idx}>
                    {/* Year divider marker when crossing year boundary or first item */}
                    {isFirstOfYear && (
                      <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                        minWidth: '40px',
                        paddingBottom: '24px'
                      }}>
                        <div style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          color: '#3b82f6',
                          backgroundColor: '#eff6ff',
                          padding: '4px 8px',
                          borderRadius: '4px',
                          border: '1px solid #bfdbfe'
                        }}>
                          {currentYear}
                        </div>
                      </div>
                    )}
                    <div
                      className={styles.barColumn}
                      onMouseMove={(e) => {
                        const tooltip = e.currentTarget.querySelector(`.${styles.barTooltip}`) as HTMLElement
                        if (tooltip) {
                          const rect = e.currentTarget.getBoundingClientRect()
                          tooltip.style.left = `${rect.left + rect.width / 2}px`
                          tooltip.style.top = `${rect.top}px`
                        }
                      }}
                    >
                      <div className={styles.barTooltip}>
                        <div style={{ fontWeight: 700, marginBottom: '6px', fontSize: '15px' }}>{formatDate(day.date)}</div>
                        <div style={{ fontSize: '14px', marginBottom: '2px' }}><strong>Revenue:</strong> {formatCurrency(day.revenue)}</div>
                        <div style={{ fontSize: '14px' }}><strong>Units:</strong> {formatNumber(day.units)}</div>
                        {day.isSale && <div style={{ marginTop: '6px', color: '#10b981', fontWeight: 600 }}>🏷️ Sale Period</div>}
                      </div>
                      <div className={styles.barWrapper}>
                        <div
                          className={styles.bar}
                          style={{
                            height: `${Math.max((day.revenue / maxChartRevenue) * 100, 2)}%`,
                            backgroundColor: barColor
                          }}
                        />
                      </div>
                      <span className={styles.barLabel}>
                        {formatDate(day.date, false, true)}
                      </span>
                    </div>
                  </React.Fragment>
                )
              })}
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

  // Render top countries widget
  const renderCountriesWidget = (widget: DashboardWidget) => {
    const maxCountryRevenue = countryData.length > 0 ? countryData[0].revenue : 1

    return (
      <div className={styles.chartCard}>
        <h3 className={styles.chartTitle}>{widget.title}</h3>
        <div className={styles.horizontalBarChart}>
          {countryData.length > 0 ? countryData.map((country, idx) => (
            <div key={idx} className={styles.horizontalBarRow}>
              <span className={styles.horizontalBarLabel}>{country.country}</span>
              <div className={styles.horizontalBarWrapper}>
                <div
                  className={styles.horizontalBar}
                  style={{ width: `${(country.revenue / maxCountryRevenue) * 100}%` }}
                />
                <span className={styles.horizontalBarValue}>
                  {formatCurrency(country.revenue)} ({country.percentage.toFixed(1)}%)
                </span>
              </div>
            </div>
          )) : (
            <div className={styles.noChartData}>No country data available</div>
          )}
        </div>
      </div>
    )
  }

  // Render growth metrics widget
  const renderGrowthWidget = (widget: DashboardWidget) => {
    if (!growthData) {
      return (
        <div className={styles.chartCard}>
          <h3 className={styles.chartTitle}>{widget.title}</h3>
          <div className={styles.noChartData}>Insufficient data for growth comparison</div>
        </div>
      )
    }

    const revenuePositive = growthData.revenueGrowth >= 0
    const unitsPositive = growthData.unitsGrowth >= 0

    return (
      <div className={styles.chartCard}>
        <h3 className={styles.chartTitle}>{widget.title}</h3>
        <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px' }}>Revenue Growth</div>
            <div style={{ fontSize: '24px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: revenuePositive ? '#16a34a' : '#dc2626' }}>
                {revenuePositive ? '↑' : '↓'} {Math.abs(growthData.revenueGrowth).toFixed(1)}%
              </span>
            </div>
            <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
              {formatCurrency(growthData.previousRevenue)} → {formatCurrency(growthData.currentRevenue)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px' }}>Units Growth</div>
            <div style={{ fontSize: '24px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: unitsPositive ? '#16a34a' : '#dc2626' }}>
                {unitsPositive ? '↑' : '↓'} {Math.abs(growthData.unitsGrowth).toFixed(1)}%
              </span>
            </div>
            <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
              {formatNumber(growthData.previousUnits)} → {formatNumber(growthData.currentUnits)}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Render average price widget
  const renderAvgPriceWidget = (widget: DashboardWidget) => {
    if (!avgPriceData.length) {
      return (
        <div className={styles.chartCard}>
          <h3 className={styles.chartTitle}>{widget.title}</h3>
          <div className={styles.noChartData}>No data available</div>
        </div>
      )
    }

    const maxPrice = Math.max(...avgPriceData.map(d => d.avgPrice))
    const minPrice = Math.min(...avgPriceData.map(d => d.avgPrice))
    const avgPrice = avgPriceData.reduce((sum, d) => sum + d.avgPrice, 0) / avgPriceData.length

    return (
      <div className={styles.chartCard}>
        <h3 className={styles.chartTitle}>{widget.title}</h3>
        <div style={{ padding: '20px' }}>
          <div style={{ display: 'flex', gap: '30px', marginBottom: '20px' }}>
            <div>
              <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Average</div>
              <div style={{ fontSize: '20px', fontWeight: '600' }}>{formatCurrency(avgPrice)}</div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Min</div>
              <div style={{ fontSize: '20px', fontWeight: '600', color: '#16a34a' }}>{formatCurrency(minPrice)}</div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Max</div>
              <div style={{ fontSize: '20px', fontWeight: '600', color: '#dc2626' }}>{formatCurrency(maxPrice)}</div>
            </div>
          </div>
          <div className={styles.lineChart} style={{ height: '120px' }}>
            <svg width="100%" height="100%" viewBox="0 0 500 120" preserveAspectRatio="none">
              <polyline
                fill="none"
                stroke="#3b82f6"
                strokeWidth="2"
                points={avgPriceData.map((d, i) => {
                  const x = (i / (avgPriceData.length - 1)) * 500
                  const y = 120 - ((d.avgPrice - minPrice) / (maxPrice - minPrice || 1)) * 110
                  return `${x},${y}`
                }).join(' ')}
              />
            </svg>
          </div>
        </div>
      </div>
    )
  }

  // Render heatmap widget - Calendar style
  const renderHeatmapWidget = (widget: DashboardWidget) => {
    if (!performanceData.length) {
      return (
        <div className={styles.chartCard}>
          <h3 className={styles.chartTitle}>{widget.title}</h3>
          <div className={styles.noChartData}>No data available</div>
        </div>
      )
    }

    // Create date-based revenue map
    const dateMap = new Map<string, number>()
    performanceData.forEach(row => {
      const revenue = toNumber(row.net_steam_sales_usd)
      dateMap.set(row.date, (dateMap.get(row.date) || 0) + revenue)
    })

    // Get date range - last 16 weeks
    const dates = Array.from(dateMap.keys()).sort()
    const endDate = dates[dates.length - 1] ? new Date(dates[dates.length - 1] + 'T00:00:00Z') : new Date()
    const startDate = new Date(endDate)
    startDate.setDate(startDate.getDate() - (16 * 7)) // 16 weeks back

    // Generate calendar grid data
    const calendarData: { date: string; revenue: number; dayOfWeek: number }[] = []
    const maxRevenue = Math.max(...Array.from(dateMap.values()), 1)

    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0]
      const revenue = dateMap.get(dateStr) || 0
      calendarData.push({
        date: dateStr,
        revenue,
        dayOfWeek: d.getDay()
      })
    }

    // Group into weeks
    const weeks: Array<Array<{ date: string; revenue: number; dayOfWeek: number }>> = []
    let currentWeek: Array<{ date: string; revenue: number; dayOfWeek: number }> = []

    calendarData.forEach((day, idx) => {
      if (idx === 0 && day.dayOfWeek !== 0) {
        // Fill empty days at start
        for (let i = 0; i < day.dayOfWeek; i++) {
          currentWeek.push({ date: '', revenue: 0, dayOfWeek: i })
        }
      }
      currentWeek.push(day)
      if (day.dayOfWeek === 6 || idx === calendarData.length - 1) {
        // Fill empty days at end
        while (currentWeek.length < 7) {
          currentWeek.push({ date: '', revenue: 0, dayOfWeek: currentWeek.length })
        }
        weeks.push(currentWeek)
        currentWeek = []
      }
    })

    const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

    return (
      <div className={styles.chartCard}>
        <h3 className={styles.chartTitle}>{widget.title}</h3>
        <div className={styles.heatmapContainer}>
          <div style={{ display: 'flex', gap: '4px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingTop: '20px' }}>
              {days.map((day, idx) => (
                <div key={idx} className={styles.heatmapLabel}>{day}</div>
              ))}
            </div>
            <div className={styles.heatmapGrid}>
              {weeks.map((week, weekIdx) => (
                <div key={weekIdx} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {week.map((day, dayIdx) => {
                    if (!day.date) {
                      return <div key={dayIdx} className={styles.heatmapCell} style={{ backgroundColor: 'transparent' }} />
                    }
                    const intensity = day.revenue / maxRevenue
                    const color = intensity === 0 ? '#e2e8f0' :
                      intensity < 0.25 ? '#60a5fa' :
                      intensity < 0.5 ? '#3b82f6' :
                      intensity < 0.75 ? '#2563eb' : '#1e40af'

                    return (
                      <div
                        key={dayIdx}
                        className={styles.heatmapCell}
                        style={{ backgroundColor: color }}
                        title={`${day.date}\n${formatCurrency(day.revenue)}`}
                      />
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
          <div className={styles.heatmapLegend}>
            <span style={{ fontSize: '11px', color: '#64748b' }}>Less</span>
            {[0, 0.25, 0.5, 0.75, 1].map((intensity, idx) => {
              const color = intensity === 0 ? '#e2e8f0' :
                intensity < 0.25 ? '#60a5fa' :
                intensity < 0.5 ? '#3b82f6' :
                intensity < 0.75 ? '#2563eb' : '#1e40af'
              return <div key={idx} style={{ width: '12px', height: '12px', backgroundColor: color, borderRadius: '2px' }} />
            })}
            <span style={{ fontSize: '11px', color: '#64748b' }}>More</span>
          </div>
        </div>
      </div>
    )
  }

  // Render line chart for Period Growth
  const renderGrowthLineChart = (widget: DashboardWidget) => {
    if (!dailyData.length || !growthData) {
      return (
        <div className={styles.chartCard}>
          <h3 className={styles.chartTitle}>{widget.title}</h3>
          <div className={styles.noChartData}>Insufficient data for growth visualization</div>
        </div>
      )
    }

    // Group daily data into 8-10 periods for cleaner visualization
    const numPeriods = Math.min(10, Math.max(7, Math.floor(dailyData.length / 3)))
    const periodSize = Math.ceil(dailyData.length / numPeriods)
    const periods = []

    for (let i = 0; i < dailyData.length; i += periodSize) {
      const slice = dailyData.slice(i, i + periodSize)
      const totalRevenue = slice.reduce((sum, d) => sum + toNumber(d.revenue), 0)
      const totalUnits = slice.reduce((sum, d) => sum + toNumber(d.units), 0)
      periods.push({
        date: slice[Math.floor(slice.length / 2)].date,
        revenue: totalRevenue,
        units: totalUnits
      })
    }

    const maxRevenue = Math.max(...periods.map(p => p.revenue))
    const maxUnits = Math.max(...periods.map(p => p.units))
    const width = 500
    const height = 180
    const padding = { top: 20, right: 40, bottom: 30, left: 40 }
    const chartWidth = width - padding.left - padding.right
    const chartHeight = height - padding.top - padding.bottom

    const revenuePositive = growthData.revenueGrowth >= 0
    const unitsPositive = growthData.unitsGrowth >= 0

    return (
      <div className={styles.chartCard}>
        <h3 className={styles.chartTitle}>{widget.title}</h3>
        <div style={{ padding: '12px' }}>
          {/* Growth Summary */}
          <div style={{ display: 'flex', gap: '24px', marginBottom: '16px', fontSize: '13px' }}>
            <div>
              <span style={{ color: '#64748b', marginRight: '8px' }}>Revenue:</span>
              <span style={{ color: revenuePositive ? '#16a34a' : '#dc2626', fontWeight: '600' }}>
                {revenuePositive ? '↑' : '↓'} {Math.abs(growthData.revenueGrowth).toFixed(1)}%
              </span>
            </div>
            <div>
              <span style={{ color: '#64748b', marginRight: '8px' }}>Units:</span>
              <span style={{ color: unitsPositive ? '#16a34a' : '#dc2626', fontWeight: '600' }}>
                {unitsPositive ? '↑' : '↓'} {Math.abs(growthData.unitsGrowth).toFixed(1)}%
              </span>
            </div>
          </div>

          {/* Line Chart */}
          <div className={styles.lineChart}>
            <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
              {/* Grid lines */}
              {[0, 0.25, 0.5, 0.75, 1].map((fraction, i) => {
                const y = padding.top + chartHeight - fraction * chartHeight
                return (
                  <line
                    key={i}
                    x1={padding.left}
                    y1={y}
                    x2={width - padding.right}
                    y2={y}
                    stroke="#e2e8f0"
                    strokeWidth="1"
                  />
                )
              })}

              {/* Revenue line */}
              <polyline
                fill="none"
                stroke="#3b82f6"
                strokeWidth="2.5"
                points={periods.map((p, i) => {
                  const x = padding.left + (i / (periods.length - 1)) * chartWidth
                  const y = padding.top + chartHeight - (p.revenue / maxRevenue) * chartHeight
                  return `${x},${y}`
                }).join(' ')}
              />

              {/* Revenue points */}
              {periods.map((p, i) => {
                const x = padding.left + (i / (periods.length - 1)) * chartWidth
                const y = padding.top + chartHeight - (p.revenue / maxRevenue) * chartHeight
                return (
                  <circle key={`rev-${i}`} cx={x} cy={y} r="3" fill="#3b82f6">
                    <title>{`${new Date(p.date).toLocaleDateString()}: ${formatCurrency(p.revenue)}`}</title>
                  </circle>
                )
              })}

              {/* Units line */}
              <polyline
                fill="none"
                stroke="#10b981"
                strokeWidth="2.5"
                points={periods.map((p, i) => {
                  const x = padding.left + (i / (periods.length - 1)) * chartWidth
                  const y = padding.top + chartHeight - (p.units / maxUnits) * chartHeight
                  return `${x},${y}`
                }).join(' ')}
              />

              {/* Units points */}
              {periods.map((p, i) => {
                const x = padding.left + (i / (periods.length - 1)) * chartWidth
                const y = padding.top + chartHeight - (p.units / maxUnits) * chartHeight
                return (
                  <circle key={`units-${i}`} cx={x} cy={y} r="3" fill="#10b981">
                    <title>{`${new Date(p.date).toLocaleDateString()}: ${formatNumber(p.units)} units`}</title>
                  </circle>
                )
              })}

              {/* Legend */}
              <g transform={`translate(${padding.left}, ${height - 10})`}>
                <line x1="0" y1="0" x2="20" y2="0" stroke="#3b82f6" strokeWidth="2.5" />
                <text x="25" y="4" fontSize="11" fill="#64748b">Revenue</text>
                <line x1="100" y1="0" x2="120" y2="0" stroke="#10b981" strokeWidth="2.5" />
                <text x="125" y="4" fontSize="11" fill="#64748b">Units</text>
              </g>
            </svg>
          </div>
        </div>
      </div>
    )
  }

  // Render pie chart for Revenue by Product
  const renderRevenuePieChart = (widget: DashboardWidget) => {
    if (productRevenueData.length === 0) {
      return (
        <div className={styles.chartCard}>
          <h3 className={styles.chartTitle}>{widget.title}</h3>
          <div className={styles.noChartData}>No product revenue data available</div>
        </div>
      )
    }

    // Color palette for products
    const pieColors = [
      '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b',
      '#10b981', '#06b6d4', '#6366f1', '#f43f5e',
      '#14b8a6', '#a855f7', '#f97316', '#22c55e'
    ]

    const totalValue = productRevenueData.reduce((sum, s) => sum + s.value, 0)

    const polarToCartesian = (centerX: number, centerY: number, radius: number, angleInDegrees: number) => {
      const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0
      return {
        x: centerX + (radius * Math.cos(angleInRadians)),
        y: centerY + (radius * Math.sin(angleInRadians))
      }
    }

    const createArc = (x: number, y: number, radius: number, startAngle: number, endAngle: number) => {
      const start = polarToCartesian(x, y, radius, endAngle)
      const end = polarToCartesian(x, y, radius, startAngle)
      const largeArc = endAngle - startAngle <= 180 ? '0' : '1'
      return `M ${x} ${y} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 0 ${end.x} ${end.y} Z`
    }

    const centerX = 200
    const centerY = 200
    const radius = 140
    let currentAngle = 0

    return (
      <div className={styles.chartCard}>
        <h3 className={styles.chartTitle}>{widget.title}</h3>
        <div className={styles.pieChart}>
          <svg viewBox="0 0 400 400" style={{ width: '100%', height: '100%' }}>
              {productRevenueData.map((segment, i) => {
                const percentage = (segment.value / totalValue) * 100
                const sliceAngle = (percentage / 100) * 360
                const endAngle = currentAngle + sliceAngle
                const path = createArc(centerX, centerY, radius, currentAngle, endAngle)
                const color = pieColors[i % pieColors.length]

                const slice = (
                  <g key={i}>
                    <path
                      d={path}
                      fill={color}
                      className={styles.pieSlice}
                      onMouseEnter={() => setHoveredPieSlice(i)}
                      onMouseLeave={() => setHoveredPieSlice(null)}
                      style={{ cursor: 'pointer' }}
                    />
                  </g>
                )

                currentAngle = endAngle
                return slice
              })}
            </svg>

            {/* Popup tooltip */}
            {hoveredPieSlice !== null && (
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                backgroundColor: 'white',
                padding: '12px 16px',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                border: '1px solid #e2e8f0',
                pointerEvents: 'none',
                zIndex: 10
              }}>
                <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '4px', fontWeight: '500' }}>
                  {productRevenueData[hoveredPieSlice].name}
                </div>
                <div style={{ fontSize: '20px', fontWeight: '700', color: '#1e293b' }}>
                  {formatCurrency(productRevenueData[hoveredPieSlice].value)}
                </div>
              </div>
            )}
          </div>

        {/* Product legend */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px', marginTop: '8px', maxHeight: '120px', overflowY: 'auto', flexShrink: 0 }}>
          {productRevenueData.map((segment, i) => {
            const percentage = (segment.value / totalValue) * 100
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '14px', height: '14px', backgroundColor: pieColors[i % pieColors.length], borderRadius: '3px', flexShrink: 0 }} />
                <span style={{ color: '#64748b', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {segment.name}
                </span>
                <span style={{ color: '#1e293b', fontWeight: '600' }}>
                  {formatCurrency(segment.value)} ({percentage.toFixed(1)}%)
                </span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // Render Revenue by Country - Horizontal bar chart
  const renderWorldMapWidget = (widget: DashboardWidget) => {
    if (countryRevenueData.length === 0) {
      return (
        <div className={styles.chartCard}>
          <h3 className={styles.chartTitle}>{widget.title}</h3>
          <div className={styles.noChartData}>No country data available</div>
        </div>
      )
    }

    const maxRevenue = countryRevenueData[0]?.value || 1

    return (
      <div className={styles.chartCard}>
        <h3 className={styles.chartTitle}>{widget.title}</h3>
        <div style={{ padding: '16px' }}>
          {countryRevenueData.map((country, i) => {
            const percentage = (country.value / maxRevenue) * 100
            return (
              <div key={i} style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '12px' }}>
                  <span style={{ fontWeight: '600', color: '#1e293b' }}>{country.name}</span>
                  <span style={{ fontWeight: '600', color: '#64748b' }}>{formatCurrency(country.value)}</span>
                </div>
                <div style={{ width: '100%', height: '24px', backgroundColor: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${percentage}%`,
                      height: '100%',
                      backgroundColor: i === 0 ? '#3b82f6' : '#60a5fa',
                      transition: 'width 0.3s ease'
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // Render Sale Performance Analysis - Comparison card
  const renderSalePerformanceChart = (widget: DashboardWidget) => {
    const { saleData, regularData } = salePerformanceData

    if (!saleData || !regularData) {
      return (
        <div className={styles.chartCard}>
          <h3 className={styles.chartTitle}>{widget.title}</h3>
          <div className={styles.noChartData}>No performance data available</div>
        </div>
      )
    }

    const saleAvgRev = saleData.days > 0 ? saleData.revenue / saleData.days : 0
    const regularAvgRev = regularData.days > 0 ? regularData.revenue / regularData.days : 0
    const uplift = regularAvgRev > 0 ? ((saleAvgRev - regularAvgRev) / regularAvgRev) * 100 : 0
    const width = 800
    const height = 160
    const barHeight = 50
    const labelWidth = 120

    return (
      <div className={styles.chartCard}>
        <h3 className={styles.chartTitle}>{widget.title}</h3>
        <div style={{ padding: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
            {/* Sale Periods Card */}
            <div style={{ padding: '16px', backgroundColor: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
              <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px', fontWeight: '500' }}>Sale Periods</div>
              <div style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '4px' }}>
                {formatCurrency(saleData.revenue)}
              </div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>
                {formatNumber(saleData.units)} units · {saleData.days} days
              </div>
              <div style={{ fontSize: '11px', color: '#3b82f6', fontWeight: '600', marginTop: '8px' }}>
                {formatCurrency(saleAvgRev)}/day
              </div>
            </div>

            {/* Regular Periods Card */}
            <div style={{ padding: '16px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px', fontWeight: '500' }}>Regular Price</div>
              <div style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '4px' }}>
                {formatCurrency(regularData.revenue)}
              </div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>
                {formatNumber(regularData.units)} units · {regularData.days} days
              </div>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '600', marginTop: '8px' }}>
                {formatCurrency(regularAvgRev)}/day
              </div>
            </div>

            {/* Uplift Card */}
            <div style={{ padding: '16px', backgroundColor: uplift >= 0 ? '#f0fdf4' : '#fef2f2', borderRadius: '8px', border: `1px solid ${uplift >= 0 ? '#bbf7d0' : '#fecaca'}` }}>
              <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px', fontWeight: '500' }}>Sale Uplift</div>
              <div style={{ fontSize: '32px', fontWeight: '700', color: uplift >= 0 ? '#16a34a' : '#dc2626', marginBottom: '4px' }}>
                {uplift >= 0 ? '+' : ''}{uplift.toFixed(0)}%
              </div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>
                vs regular pricing
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Render widget based on type
  const renderWidget = (widget: DashboardWidget) => {
    switch (widget.type) {
      case 'stat': return renderStatWidget(widget)
      case 'chart': return renderChartWidget(widget)
      case 'region': return renderRegionWidget(widget)
      case 'countries': return renderCountriesWidget(widget)
      case 'growth': return renderGrowthWidget(widget)
      case 'growth-line': return renderGrowthLineChart(widget)
      case 'avg-price': return renderAvgPriceWidget(widget)
      case 'pie': return renderRevenuePieChart(widget)
      case 'world-map': return renderWorldMapWidget(widget)
      case 'heatmap': return renderHeatmapWidget(widget)
      case 'table': return renderTableWidget(widget)
      case 'sale-comparison': return renderSalePerformanceChart(widget)
      default: return null
    }
  }

  if (authLoading) {
    return <div className={styles.pageContainer}><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}><p>Loading...</p></div></div>
  }

  if (!canView) {
    return (
      <div className={styles.pageContainer}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', gap: '1rem' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1f2937' }}>Access Denied</h2>
          <p style={{ color: '#6b7280' }}>You don&apos;t have permission to view Analytics.</p>
        </div>
      </div>
    )
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
              <button className={`${styles.presetButton} ${selectedDatePreset === 'all' ? styles.presetActive : ''}`} onClick={() => setPresetDateRange('all')}>All Time</button>
              <button className={`${styles.presetButton} ${selectedDatePreset === '7d' ? styles.presetActive : ''}`} onClick={() => setPresetDateRange('7d')}>7D</button>
              <button className={`${styles.presetButton} ${selectedDatePreset === '30d' ? styles.presetActive : ''}`} onClick={() => setPresetDateRange('30d')}>30D</button>
              <button className={`${styles.presetButton} ${selectedDatePreset === '60d' ? styles.presetActive : ''}`} onClick={() => setPresetDateRange('60d')}>60D</button>
              <button className={`${styles.presetButton} ${selectedDatePreset === '90d' ? styles.presetActive : ''}`} onClick={() => setPresetDateRange('90d')}>90D</button>
              <button className={`${styles.presetButton} ${selectedDatePreset === 'ytd' ? styles.presetActive : ''}`} onClick={() => setPresetDateRange('ytd')}>YTD</button>
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
          <>
            {/* Stats Grid - Compact row at top */}
            <div className={styles.statsGrid}>
              {widgets.filter(w => w.type === 'stat').map(widget => (
                <div
                  key={widget.id}
                  className={`${styles.widgetWrapper} ${isEditMode ? styles.editableWidget : ''} ${draggedWidget === widget.id ? styles.dragging : ''}`}
                  draggable={isEditMode}
                  onDragStart={() => handleDragStart(widget.id)}
                  onDragEnd={handleDragEnd}
                  onDrop={() => handleDrop(widget.id)}
                  onDragOver={handleDragOver}
                >
                  {isEditMode && (
                    <div className={styles.widgetControls}>
                      <button className={styles.widgetEditBtn} onClick={() => setEditingWidget(widget)} title="Edit widget">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button className={styles.widgetDeleteBtn} onClick={() => handleDeleteWidget(widget.id)} title="Delete widget">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  )}
                  {renderWidget(widget)}
                </div>
              ))}
            </div>

            {/* Charts Grid - Visualization widgets */}
            <div ref={gridRef} className={styles.chartsGrid}>
              {widgets.filter(w => w.type !== 'stat').map(widget => (
                <div
                  key={widget.id}
                  className={`${styles.widgetWrapper} ${widget.size.w === 2 ? styles.fullWidthWidget : ''} ${widget.size.h === 2 ? styles.tallWidget : ''} ${isEditMode ? styles.editableWidget : ''} ${draggedWidget === widget.id ? styles.dragging : ''}`}
                  draggable={isEditMode}
                  onDragStart={() => handleDragStart(widget.id)}
                  onDragEnd={handleDragEnd}
                  onDrop={() => handleDrop(widget.id)}
                  onDragOver={handleDragOver}
                >
                  {isEditMode && (
                    <>
                      <div className={styles.widgetControls}>
                        <button className={styles.widgetEditBtn} onClick={() => setEditingWidget(widget)} title="Edit widget">
                          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button className={styles.widgetDeleteBtn} onClick={() => handleDeleteWidget(widget.id)} title="Delete widget">
                          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      <div className={styles.resizeControls}>
                        <button
                          className={styles.resizeBtn}
                          onClick={() => handleResizeWidget(widget.id, { w: 1, h: widget.size.h })}
                          title="Half width"
                        >
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <rect x="1" y="1" width="6" height="14" stroke="currentColor" strokeWidth="1.5" />
                            <rect x="9" y="1" width="6" height="14" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
                          </svg>
                        </button>
                        <button
                          className={styles.resizeBtn}
                          onClick={() => handleResizeWidget(widget.id, { w: 2, h: widget.size.h })}
                          title="Full width"
                        >
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <rect x="1" y="1" width="14" height="14" stroke="currentColor" strokeWidth="1.5" />
                          </svg>
                        </button>
                        <button
                          className={styles.resizeBtn}
                          onClick={() => handleResizeWidget(widget.id, { w: widget.size.w, h: 1 })}
                          title="Normal height"
                        >
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <rect x="1" y="5" width="14" height="6" stroke="currentColor" strokeWidth="1.5" />
                          </svg>
                        </button>
                        <button
                          className={styles.resizeBtn}
                          onClick={() => handleResizeWidget(widget.id, { w: widget.size.w, h: 2 })}
                          title="Tall height"
                        >
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <rect x="1" y="1" width="14" height="14" stroke="currentColor" strokeWidth="1.5" />
                          </svg>
                        </button>
                      </div>
                    </>
                  )}
                  {renderWidget(widget)}
                </div>
              ))}
            </div>

            <div className={styles.dataInfo}>
              <span className={styles.dataInfoText}>Showing {formatNumber(performanceData.length)} records across {summaryStats?.totalDays || 0} days</span>
            </div>
          </>
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

        {editingWidget && (
          <EditWidgetModal
            widget={editingWidget}
            onClose={() => setEditingWidget(null)}
            onSave={handleSaveWidget}
            products={products}
            clients={clients}
            regions={regions}
            platforms={['Steam', 'Epic', 'GOG', 'Itch.io']}
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
    { type: 'chart' as const, name: 'Chart', description: 'Revenue or units over time', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
    { type: 'pie' as const, name: 'Pie Chart', description: 'Revenue breakdown by product', icon: 'M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z' },
    { type: 'region' as const, name: 'Region Breakdown', description: 'Revenue by geographic region', icon: 'M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
    { type: 'countries' as const, name: 'Top Countries', description: 'Revenue by top countries', icon: 'M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9' },
    { type: 'world-map' as const, name: 'World Map', description: 'Geographic revenue heatmap', icon: 'M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
    { type: 'table' as const, name: 'Period Table', description: 'Compare sale vs regular periods', icon: 'M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z' },
    { type: 'sale-comparison' as const, name: 'Sale Performance', description: 'Sale vs regular analysis', icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6' },
    { type: 'heatmap' as const, name: 'Heatmap', description: 'Activity heatmap visualization', icon: 'M4 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-3zM14 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1h-4a1 1 0 01-1-1v-3z' },
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

// Edit Widget Modal
function EditWidgetModal({ widget, onClose, onSave, products, clients, regions, platforms }: {
  widget: DashboardWidget;
  onClose: () => void;
  onSave: (widget: DashboardWidget) => void;
  products: string[];
  clients: { id: string; name: string }[];
  regions: string[];
  platforms: string[];
}) {
  const [title, setTitle] = useState(widget.title)
  const [widgetType, setWidgetType] = useState(widget.type)
  const [chartType, setChartType] = useState(widget.config.chartType || (widget.type === 'pie' ? 'pie' : 'bar'))
  const [statKey, setStatKey] = useState(widget.config.statKey || 'totalRevenue')
  // Filter states
  const [filterProduct, setFilterProduct] = useState(widget.config.filterProduct || 'all')
  const [filterClient, setFilterClient] = useState(widget.config.filterClient || 'all')
  const [filterRegion, setFilterRegion] = useState(widget.config.filterRegion || 'all')
  const [filterPlatform, setFilterPlatform] = useState(widget.config.filterPlatform || 'all')

  // Display states
  const [showLegend, setShowLegend] = useState(widget.config.showLegend ?? true)
  const [showGrid, setShowGrid] = useState(widget.config.showGrid ?? true)
  const [colorScheme, setColorScheme] = useState(widget.config.colorScheme || 'blue')

  // Aggregation states
  const [aggregateBy, setAggregateBy] = useState(widget.config.aggregateBy || 'sum')
  const [groupBy, setGroupBy] = useState(widget.config.groupBy || 'day')

  const handleSave = () => {
    const updatedWidget: DashboardWidget = {
      ...widget,
      type: widgetType,
      title,
      config: {
        ...widget.config,
        ...(widgetType === 'stat' ? { statKey } : {}),
        ...(widgetType === 'chart' || widgetType === 'pie' ? { chartType } : {}),
        // Always save filter options
        filterProduct: filterProduct === 'all' ? undefined : filterProduct,
        filterClient: filterClient === 'all' ? undefined : filterClient,
        filterRegion: filterRegion === 'all' ? undefined : filterRegion,
        filterPlatform: filterPlatform === 'all' ? undefined : filterPlatform,
        // Display options
        showLegend,
        showGrid,
        colorScheme,
        // Aggregation options
        aggregateBy,
        groupBy
      }
    }
    onSave(updatedWidget)
  }

  const widgetTypeOptions = [
    { value: 'stat', label: 'Stat Card', description: 'Display a single metric' },
    { value: 'chart', label: 'Chart', description: 'Revenue or units over time' },
    { value: 'pie', label: 'Pie Chart', description: 'Revenue breakdown by product' },
    { value: 'region', label: 'Region Breakdown', description: 'Revenue by geographic region' },
    { value: 'countries', label: 'Top Countries', description: 'Revenue by country' },
    { value: 'world-map', label: 'World Map', description: 'Geographic revenue heatmap' },
    { value: 'table', label: 'Period Table', description: 'Compare sale vs regular periods' },
    { value: 'sale-comparison', label: 'Sale Performance', description: 'Sale vs regular analysis' },
    { value: 'heatmap', label: 'Heatmap', description: 'Activity heatmap visualization' }
  ]

  const statOptions = [
    { value: 'totalRevenue', label: 'Total Revenue' },
    { value: 'totalUnits', label: 'Total Units' },
    { value: 'avgDailyRevenue', label: 'Average Daily Revenue' },
    { value: 'avgDailyUnits', label: 'Average Daily Units' },
    { value: 'refundRate', label: 'Refund Rate' }
  ]

  const chartTypeOptions = [
    { value: 'bar', label: 'Bar Chart' },
    { value: 'line', label: 'Line Chart' },
    { value: 'pie', label: 'Pie Chart' },
    { value: 'area', label: 'Area Chart' },
    { value: 'donut', label: 'Donut Chart' },
    { value: 'horizontal-bar', label: 'Horizontal Bar' },
    { value: 'stacked-bar', label: 'Stacked Bar' }
  ]

  const colorSchemeOptions = [
    { value: 'blue', label: 'Blue' },
    { value: 'green', label: 'Green' },
    { value: 'purple', label: 'Purple' },
    { value: 'multi', label: 'Multi-Color' }
  ]

  const aggregateByOptions = [
    { value: 'sum', label: 'Sum' },
    { value: 'avg', label: 'Average' },
    { value: 'min', label: 'Minimum' },
    { value: 'max', label: 'Maximum' }
  ]

  const groupByOptions = [
    { value: 'day', label: 'Daily' },
    { value: 'week', label: 'Weekly' },
    { value: 'month', label: 'Monthly' },
    { value: 'quarter', label: 'Quarterly' },
    { value: 'year', label: 'Yearly' }
  ]

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Edit Widget</h2>
          <button className={styles.modalClose} onClick={onClose}>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className={styles.modalContent}>
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

          {widgetType === 'stat' && (
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Metric</label>
              <select
                className={styles.formInput}
                value={statKey}
                onChange={(e) => setStatKey(e.target.value)}
              >
                {statOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          )}

          {(widgetType === 'chart' || widgetType === 'pie') && (
            <>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Chart Type</label>
                <select
                  className={styles.formInput}
                  value={chartType}
                  onChange={(e) => setChartType(e.target.value as 'bar' | 'line' | 'pie')}
                >
                  {chartTypeOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

            </>
          )}

          {/* Filters Section */}
          <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', marginBottom: '12px' }}>
              Data Filters
            </h3>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Filter by Product</label>
              <select
                className={styles.formInput}
                value={filterProduct}
                onChange={(e) => setFilterProduct(e.target.value)}
              >
                <option value="all">All Products</option>
                {products.map(product => (
                  <option key={product} value={product}>{product}</option>
                ))}
              </select>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Filter by Client</label>
              <select
                className={styles.formInput}
                value={filterClient}
                onChange={(e) => setFilterClient(e.target.value)}
              >
                <option value="all">All Clients</option>
                {clients.map(client => (
                  <option key={client.id} value={client.id}>{client.name}</option>
                ))}
              </select>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Filter by Region</label>
              <select
                className={styles.formInput}
                value={filterRegion}
                onChange={(e) => setFilterRegion(e.target.value)}
              >
                <option value="all">All Regions</option>
                {regions.map(region => (
                  <option key={region} value={region}>{region}</option>
                ))}
              </select>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Filter by Platform</label>
              <select
                className={styles.formInput}
                value={filterPlatform}
                onChange={(e) => setFilterPlatform(e.target.value)}
              >
                <option value="all">All Platforms</option>
                {platforms.map(platform => (
                  <option key={platform} value={platform}>{platform}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Display Options Section */}
          {(widgetType === 'chart' || widgetType === 'pie') && (
            <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid #e2e8f0' }}>
              <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', marginBottom: '12px' }}>
                Display Options
              </h3>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Color Scheme</label>
                <select
                  className={styles.formInput}
                  value={colorScheme}
                  onChange={(e) => setColorScheme(e.target.value as any)}
                >
                  {colorSchemeOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div className={styles.formGroup}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={showLegend}
                    onChange={(e) => setShowLegend(e.target.checked)}
                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                  />
                  <span className={styles.formLabel} style={{ marginBottom: 0 }}>Show Legend</span>
                </label>
              </div>

              <div className={styles.formGroup}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={showGrid}
                    onChange={(e) => setShowGrid(e.target.checked)}
                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                  />
                  <span className={styles.formLabel} style={{ marginBottom: 0 }}>Show Grid Lines</span>
                </label>
              </div>
            </div>
          )}

          {/* Aggregation Options Section */}
          {(widgetType === 'chart' || widgetType === 'stat') && (
            <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid #e2e8f0' }}>
              <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', marginBottom: '12px' }}>
                Aggregation Options
              </h3>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Aggregate By</label>
                <select
                  className={styles.formInput}
                  value={aggregateBy}
                  onChange={(e) => setAggregateBy(e.target.value as any)}
                >
                  {aggregateByOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Group By</label>
                <select
                  className={styles.formInput}
                  value={groupBy}
                  onChange={(e) => setGroupBy(e.target.value as any)}
                >
                  {groupByOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className={styles.formGroup} style={{ marginTop: '24px' }}>
            <label className={styles.formLabel}>Widget Type</label>
            <select
              className={styles.formInput}
              value={widgetType}
              onChange={(e) => setWidgetType(e.target.value as any)}
            >
              {widgetTypeOptions.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label} - {opt.description}
                </option>
              ))}
            </select>
            <p style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
              Change the widget type to convert between different visualizations
            </p>
          </div>
        </div>

        <div className={styles.modalFooter}>
          <button className={styles.cancelButton} onClick={onClose}>Cancel</button>
          <button className={styles.importSubmitButton} onClick={handleSave}>
            Save Changes
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
