'use client'

// Cache invalidation: 2026-01-12T23:10:00Z - Fixed calculation logic for Steam data

import { useState, useEffect, useCallback, useMemo } from 'react'
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

// ============================================
// UTILITY FUNCTIONS FOR SAFE NUMBER CONVERSION
// ============================================
// Supabase returns numeric columns as strings, so we must convert them

/**
 * Safely convert a value to a number
 * Handles: strings, numbers, null, undefined
 */
function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0
  if (typeof value === 'number') return isNaN(value) ? 0 : value
  const parsed = parseFloat(String(value).replace(/[$,]/g, ''))
  return isNaN(parsed) ? 0 : parsed
}

/**
 * Safely divide two numbers, returning 0 if divisor is 0
 */
function safeDivide(numerator: number, denominator: number): number {
  if (denominator === 0 || isNaN(denominator)) return 0
  const result = numerator / denominator
  return isNaN(result) ? 0 : result
}

/**
 * Detect if a row represents a sale period
 * Sale = sale_price exists AND is less than base_price
 */
function isSalePrice(basePrice: number | string | null | undefined, salePrice: number | string | null | undefined): boolean {
  const base = toNumber(basePrice)
  const sale = toNumber(salePrice)
  // Must have both prices, and sale price must be lower than base
  return base > 0 && sale > 0 && sale < base
}

/**
 * Calculate discount percentage from base and sale price
 */
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

export default function AnalyticsPage() {
  const supabase = createClientComponentClient()
  
  // State
  const [isLoading, setIsLoading] = useState(true)
  const [performanceData, setPerformanceData] = useState<PerformanceData[]>([])
  const [summaryStats, setSummaryStats] = useState<SummaryStats | null>(null)
  const [dateRange, setDateRange] = useState<DateRange>({ start: null, end: null })
  const [selectedProduct, setSelectedProduct] = useState<string>('all')
  const [selectedRegion, setSelectedRegion] = useState<string>('all')
  const [selectedPlatform, setSelectedPlatform] = useState<string>('all')
  const [products, setProducts] = useState<string[]>([])
  const [regions, setRegions] = useState<string[]>([])
  const [platforms, setPlatforms] = useState<string[]>([])
  const [showImportModal, setShowImportModal] = useState(false)
  const [dataAvailable, setDataAvailable] = useState(false)

  // Fetch performance data
  const fetchPerformanceData = useCallback(async () => {
    setIsLoading(true)
    try {
      let query = supabase
        .from('steam_performance_data')
        .select('*')
        .order('date', { ascending: true })

      if (dateRange.start) {
        query = query.gte('date', dateRange.start.toISOString().split('T')[0])
      }
      if (dateRange.end) {
        query = query.lte('date', dateRange.end.toISOString().split('T')[0])
      }
      if (selectedProduct !== 'all') {
        query = query.eq('product_name', selectedProduct)
      }
      if (selectedRegion !== 'all') {
        query = query.eq('region', selectedRegion)
      }
      if (selectedPlatform !== 'all') {
        query = query.eq('platform', selectedPlatform)
      }

      const { data, error } = await query

      if (error) throw error

      setPerformanceData(data || [])
      setDataAvailable((data?.length || 0) > 0)

      if (data && data.length > 0) {
        // FIXED: Use toNumber() for all numeric fields from Supabase
        const totalRevenue = data.reduce((sum, row) => sum + toNumber(row.net_steam_sales_usd), 0)
        const totalUnits = data.reduce((sum, row) => sum + toNumber(row.net_units_sold), 0)
        const totalGrossUnits = data.reduce((sum, row) => sum + toNumber(row.gross_units_sold), 0)
        const totalChargebacks = data.reduce((sum, row) => sum + toNumber(row.chargebacks_returns), 0)
        
        const uniqueDates = new Set(data.map(row => row.date))
        const totalDays = uniqueDates.size || 1

        setSummaryStats({
          totalRevenue,
          totalUnits,
          // FIXED: Use safeDivide to prevent NaN
          avgDailyRevenue: safeDivide(totalRevenue, totalDays),
          avgDailyUnits: safeDivide(totalUnits, totalDays),
          // FIXED: Refund rate calculation with safe division
          refundRate: safeDivide(totalChargebacks, totalGrossUnits) * 100,
          totalDays
        })

        const uniqueProducts = Array.from(new Set(data.map(row => row.product_name).filter(Boolean)))
        const uniqueRegions = Array.from(new Set(data.map(row => row.region).filter(Boolean))) as string[]
        const uniquePlatforms = Array.from(new Set(data.map(row => row.platform).filter(Boolean)))
        
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
  }, [supabase, dateRange, selectedProduct, selectedRegion, selectedPlatform])

  useEffect(() => {
    fetchPerformanceData()
  }, [fetchPerformanceData])

  // Compute daily time series data
  const dailyData = useMemo((): DailyData[] => {
    if (!performanceData.length) return []
    
    const byDate = new Map<string, { revenue: number; units: number; hasSale: boolean }>()
    
    performanceData.forEach(row => {
      const existing = byDate.get(row.date) || { revenue: 0, units: 0, hasSale: false }
      // FIXED: Use isSalePrice helper with proper number conversion
      const rowIsSale = isSalePrice(row.base_price_usd, row.sale_price_usd)
      byDate.set(row.date, {
        revenue: existing.revenue + toNumber(row.net_steam_sales_usd),
        units: existing.units + toNumber(row.net_units_sold),
        hasSale: existing.hasSale || rowIsSale
      })
    })
    
    return Array.from(byDate.entries())
      .map(([date, data]) => ({
        date,
        revenue: data.revenue,
        units: data.units,
        isSale: data.hasSale
      }))
      .sort((a, b) => a.date.localeCompare(b.date))
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
        // FIXED: Use safeDivide
        percentage: safeDivide(data.revenue, totalRevenue) * 100
      }))
      .sort((a, b) => b.revenue - a.revenue)
  }, [performanceData])

  // Helper function to push a period to the periods array
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
        // FIXED: Use safeDivide
        avgDailyRevenue: safeDivide(period.revenue, days),
        avgDailyUnits: safeDivide(period.units, days),
        isSale: period.isSale,
        discountPct: period.discountPct
      })
    }
  }

  // Compute period comparison (sale periods vs regular)
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
      // FIXED: Use helper functions for sale detection and discount calculation
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
          </div>
        </div>

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
            <div className={styles.statsGrid}>
              <div className={styles.statCard}>
                <div className={styles.statHeader}>
                  <span className={styles.statTitle}>Total Revenue</span>
                  <div className={styles.statIcon} style={{ backgroundColor: '#dcfce7' }}>
                    <svg fill="none" stroke="#16a34a" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
                <div className={styles.statValue}>{formatCurrency(summaryStats?.totalRevenue || 0)}</div>
                <div className={styles.statSubtext}>Net Steam sales</div>
              </div>

              <div className={styles.statCard}>
                <div className={styles.statHeader}>
                  <span className={styles.statTitle}>Total Units</span>
                  <div className={styles.statIcon} style={{ backgroundColor: '#dbeafe' }}>
                    <svg fill="none" stroke="#2563eb" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                  </div>
                </div>
                <div className={styles.statValue}>{formatNumber(summaryStats?.totalUnits || 0)}</div>
                <div className={styles.statSubtext}>Net units sold</div>
              </div>

              <div className={styles.statCard}>
                <div className={styles.statHeader}>
                  <span className={styles.statTitle}>Avg Daily Revenue</span>
                  <div className={styles.statIcon} style={{ backgroundColor: '#fef3c7' }}>
                    <svg fill="none" stroke="#d97706" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                  </div>
                </div>
                <div className={styles.statValue}>{formatCurrency(summaryStats?.avgDailyRevenue || 0)}</div>
                <div className={styles.statSubtext}>Per day average</div>
              </div>

              <div className={styles.statCard}>
                <div className={styles.statHeader}>
                  <span className={styles.statTitle}>Avg Daily Units</span>
                  <div className={styles.statIcon} style={{ backgroundColor: '#f3e8ff' }}>
                    <svg fill="none" stroke="#9333ea" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                </div>
                <div className={styles.statValue}>{formatNumber(summaryStats?.avgDailyUnits || 0)}</div>
                <div className={styles.statSubtext}>Per day average</div>
              </div>

              <div className={styles.statCard}>
                <div className={styles.statHeader}>
                  <span className={styles.statTitle}>Refund Rate</span>
                  <div className={styles.statIcon} style={{ backgroundColor: '#fee2e2' }}>
                    <svg fill="none" stroke="#dc2626" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 15v-1a4 4 0 00-4-4H8m0 0l3 3m-3-3l3-3m9 14V5a2 2 0 00-2-2H6a2 2 0 00-2 2v16l4-2 4 2 4-2 4 2z" />
                    </svg>
                  </div>
                </div>
                <div className={styles.statValue}>{(summaryStats?.refundRate || 0).toFixed(1)}%</div>
                <div className={styles.statSubtext}>Chargebacks/returns</div>
              </div>
            </div>

            <div className={styles.chartsSection}>
              <div className={styles.chartCard}>
                <h3 className={styles.chartTitle}>Revenue Over Time</h3>
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
                <div className={styles.barChart}>
                  {dailyData.map((day, idx) => (
                    <div key={idx} className={styles.barColumn}>
                      <div className={styles.barWrapper}>
                        <div 
                          className={styles.bar}
                          style={{ 
                            height: `${(day.revenue / maxDailyRevenue) * 100}%`,
                            backgroundColor: day.isSale ? '#16a34a' : '#94a3b8'
                          }}
                        />
                      </div>
                      <span className={styles.barLabel}>{formatDate(day.date)}</span>
                    </div>
                  ))}
                </div>
                {dailyData.length === 0 && (
                  <div className={styles.noChartData}>No time series data available</div>
                )}
              </div>

              <div className={styles.chartCard}>
                <h3 className={styles.chartTitle}>Revenue by Region</h3>
                <div className={styles.horizontalBarChart}>
                  {regionData.map((region, idx) => (
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
                  ))}
                </div>
                {regionData.length === 0 && (
                  <div className={styles.noChartData}>No regional data available</div>
                )}
              </div>
            </div>

            <div className={styles.periodSection}>
              <div className={styles.sectionHeader}>
                <h3 className={styles.sectionTitle}>Period Comparison</h3>
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
