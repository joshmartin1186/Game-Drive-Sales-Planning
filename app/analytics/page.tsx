'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import styles from './page.module.css'
import { Sidebar } from '../components/Sidebar'
import { Navbar } from '../components/Navbar'

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
  gross_units_sold: number
  chargebacks_returns: number
  net_units_sold: number
  base_price_usd: number | null
  sale_price_usd: number | null
  gross_steam_sales_usd: number
  chargeback_returns_usd: number
  vat_tax_usd: number
  net_steam_sales_usd: number
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

export default function AnalyticsPage() {
  const supabase = createClientComponentClient()
  
  // State
  const [isLoading, setIsLoading] = useState(true)
  const [performanceData, setPerformanceData] = useState&lt;PerformanceData[]&gt;([])
  const [summaryStats, setSummaryStats] = useState&lt;SummaryStats | null&gt;(null)
  const [dateRange, setDateRange] = useState&lt;DateRange&gt;({ start: null, end: null })
  const [selectedProduct, setSelectedProduct] = useState&lt;string&gt;('all')
  const [selectedRegion, setSelectedRegion] = useState&lt;string&gt;('all')
  const [selectedPlatform, setSelectedPlatform] = useState&lt;string&gt;('all')
  const [products, setProducts] = useState&lt;string[]&gt;([])
  const [regions, setRegions] = useState&lt;string[]&gt;([])
  const [platforms, setPlatforms] = useState&lt;string[]&gt;([])
  const [showImportModal, setShowImportModal] = useState(false)
  const [dataAvailable, setDataAvailable] = useState(false)

  // Fetch performance data
  const fetchPerformanceData = useCallback(async () => {
    setIsLoading(true)
    try {
      let query = supabase
        .from('steam_performance_data')
        .select('*')
        .order('date', { ascending: false })

      // Apply filters
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

      // Calculate summary stats
      if (data &amp;&amp; data.length > 0) {
        const totalRevenue = data.reduce((sum, row) => sum + (row.net_steam_sales_usd || 0), 0)
        const totalUnits = data.reduce((sum, row) => sum + (row.net_units_sold || 0), 0)
        const totalGrossUnits = data.reduce((sum, row) => sum + (row.gross_units_sold || 0), 0)
        const totalChargebacks = data.reduce((sum, row) => sum + (row.chargebacks_returns || 0), 0)
        
        // Get unique dates for day count
        const uniqueDates = new Set(data.map(row => row.date))
        const totalDays = uniqueDates.size || 1

        setSummaryStats({
          totalRevenue,
          totalUnits,
          avgDailyRevenue: totalRevenue / totalDays,
          avgDailyUnits: totalUnits / totalDays,
          refundRate: totalGrossUnits > 0 ? (totalChargebacks / totalGrossUnits) * 100 : 0,
          totalDays
        })

        // Extract unique values for filters - use Array.from() for TypeScript compatibility
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

  // Format currency
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value)
  }

  // Format number with commas
  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('en-US').format(Math.round(value))
  }

  // Quick date range presets
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

  return (
    &lt;div className={styles.pageContainer}&gt;
      &lt;Navbar /&gt;
      &lt;div className={styles.mainContent}&gt;
        &lt;Sidebar /&gt;
        &lt;main className={styles.content}&gt;
          &lt;div className={styles.header}&gt;
            &lt;div className={styles.headerLeft}&gt;
              &lt;h1 className={styles.title}&gt;Steam Analytics&lt;/h1&gt;
              &lt;p className={styles.subtitle}&gt;Performance metrics and sales analysis&lt;/p&gt;
            &lt;/div&gt;
            &lt;div className={styles.headerRight}&gt;
              &lt;button
                className={styles.importButton}
                onClick={() =&gt; setShowImportModal(true)}
              &gt;
                &lt;svg className={styles.buttonIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24"&gt;
                  &lt;path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /&gt;
                &lt;/svg&gt;
                Import CSV
              &lt;/button&gt;
              &lt;button
                className={styles.refreshButton}
                onClick={fetchPerformanceData}
                disabled={isLoading}
              &gt;
                &lt;svg className={`${styles.buttonIcon} ${isLoading ? styles.spinning : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"&gt;
                  &lt;path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /&gt;
                &lt;/svg&gt;
                Refresh
              &lt;/button&gt;
            &lt;/div&gt;
          &lt;/div&gt;

          {/* Filters */}
          &lt;div className={styles.filtersBar}&gt;
            &lt;div className={styles.filterGroup}&gt;
              &lt;label className={styles.filterLabel}&gt;Date Range&lt;/label&gt;
              &lt;div className={styles.datePresets}&gt;
                &lt;button
                  className={`${styles.presetButton} ${!dateRange.start &amp;&amp; !dateRange.end ? styles.presetActive : ''}`}
                  onClick={() =&gt; setPresetDateRange('all')}
                &gt;
                  All Time
                &lt;/button&gt;
                &lt;button
                  className={styles.presetButton}
                  onClick={() =&gt; setPresetDateRange('7d')}
                &gt;
                  7D
                &lt;/button&gt;
                &lt;button
                  className={styles.presetButton}
                  onClick={() =&gt; setPresetDateRange('30d')}
                &gt;
                  30D
                &lt;/button&gt;
                &lt;button
                  className={styles.presetButton}
                  onClick={() =&gt; setPresetDateRange('90d')}
                &gt;
                  90D
                &lt;/button&gt;
                &lt;button
                  className={styles.presetButton}
                  onClick={() =&gt; setPresetDateRange('ytd')}
                &gt;
                  YTD
                &lt;/button&gt;
              &lt;/div&gt;
            &lt;/div&gt;

            &lt;div className={styles.filterGroup}&gt;
              &lt;label className={styles.filterLabel}&gt;Product&lt;/label&gt;
              &lt;select
                className={styles.filterSelect}
                value={selectedProduct}
                onChange={(e) =&gt; setSelectedProduct(e.target.value)}
              &gt;
                &lt;option value="all"&gt;All Products&lt;/option&gt;
                {products.map(product =&gt; (
                  &lt;option key={product} value={product}&gt;{product}&lt;/option&gt;
                ))}
              &lt;/select&gt;
            &lt;/div&gt;

            &lt;div className={styles.filterGroup}&gt;
              &lt;label className={styles.filterLabel}&gt;Region&lt;/label&gt;
              &lt;select
                className={styles.filterSelect}
                value={selectedRegion}
                onChange={(e) =&gt; setSelectedRegion(e.target.value)}
              &gt;
                &lt;option value="all"&gt;All Regions&lt;/option&gt;
                {regions.map(region =&gt; (
                  &lt;option key={region} value={region}&gt;{region}&lt;/option&gt;
                ))}
              &lt;/select&gt;
            &lt;/div&gt;

            &lt;div className={styles.filterGroup}&gt;
              &lt;label className={styles.filterLabel}&gt;Platform&lt;/label&gt;
              &lt;select
                className={styles.filterSelect}
                value={selectedPlatform}
                onChange={(e) =&gt; setSelectedPlatform(e.target.value)}
              &gt;
                &lt;option value="all"&gt;All Platforms&lt;/option&gt;
                {platforms.map(platform =&gt; (
                  &lt;option key={platform} value={platform}&gt;{platform}&lt;/option&gt;
                ))}
              &lt;/select&gt;
            &lt;/div&gt;
          &lt;/div&gt;

          {/* Summary Stats Cards */}
          {isLoading ? (
            &lt;div className={styles.statsGrid}&gt;
              {[1, 2, 3, 4, 5].map(i =&gt; (
                &lt;div key={i} className={styles.statCardSkeleton}&gt;
                  &lt;div className={styles.skeletonTitle} /&gt;
                  &lt;div className={styles.skeletonValue} /&gt;
                &lt;/div&gt;
              ))}
            &lt;/div&gt;
          ) : !dataAvailable ? (
            &lt;div className={styles.emptyState}&gt;
              &lt;div className={styles.emptyIcon}&gt;
                &lt;svg fill="none" stroke="currentColor" viewBox="0 0 24 24"&gt;
                  &lt;path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /&gt;
                &lt;/svg&gt;
              &lt;/div&gt;
              &lt;h3 className={styles.emptyTitle}&gt;No Performance Data Yet&lt;/h3&gt;
              &lt;p className={styles.emptyDescription}&gt;
                Import your Steam sales data to see analytics and performance metrics.
              &lt;/p&gt;
              &lt;button
                className={styles.emptyButton}
                onClick={() =&gt; setShowImportModal(true)}
              &gt;
                &lt;svg className={styles.buttonIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24"&gt;
                  &lt;path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /&gt;
                &lt;/svg&gt;
                Import CSV Data
              &lt;/button&gt;
            &lt;/div&gt;
          ) : (
            &lt;&gt;
              &lt;div className={styles.statsGrid}&gt;
                &lt;div className={styles.statCard}&gt;
                  &lt;div className={styles.statHeader}&gt;
                    &lt;span className={styles.statTitle}&gt;Total Revenue&lt;/span&gt;
                    &lt;div className={styles.statIcon} style={{ backgroundColor: '#dcfce7' }}&gt;
                      &lt;svg fill="none" stroke="#16a34a" viewBox="0 0 24 24"&gt;
                        &lt;path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /&gt;
                      &lt;/svg&gt;
                    &lt;/div&gt;
                  &lt;/div&gt;
                  &lt;div className={styles.statValue}&gt;{formatCurrency(summaryStats?.totalRevenue || 0)}&lt;/div&gt;
                  &lt;div className={styles.statSubtext}&gt;Net Steam sales&lt;/div&gt;
                &lt;/div&gt;

                &lt;div className={styles.statCard}&gt;
                  &lt;div className={styles.statHeader}&gt;
                    &lt;span className={styles.statTitle}&gt;Total Units&lt;/span&gt;
                    &lt;div className={styles.statIcon} style={{ backgroundColor: '#dbeafe' }}&gt;
                      &lt;svg fill="none" stroke="#2563eb" viewBox="0 0 24 24"&gt;
                        &lt;path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /&gt;
                      &lt;/svg&gt;
                    &lt;/div&gt;
                  &lt;/div&gt;
                  &lt;div className={styles.statValue}&gt;{formatNumber(summaryStats?.totalUnits || 0)}&lt;/div&gt;
                  &lt;div className={styles.statSubtext}&gt;Net units sold&lt;/div&gt;
                &lt;/div&gt;

                &lt;div className={styles.statCard}&gt;
                  &lt;div className={styles.statHeader}&gt;
                    &lt;span className={styles.statTitle}&gt;Avg Daily Revenue&lt;/span&gt;
                    &lt;div className={styles.statIcon} style={{ backgroundColor: '#fef3c7' }}&gt;
                      &lt;svg fill="none" stroke="#d97706" viewBox="0 0 24 24"&gt;
                        &lt;path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /&gt;
                      &lt;/svg&gt;
                    &lt;/div&gt;
                  &lt;/div&gt;
                  &lt;div className={styles.statValue}&gt;{formatCurrency(summaryStats?.avgDailyRevenue || 0)}&lt;/div&gt;
                  &lt;div className={styles.statSubtext}&gt;Per day average&lt;/div&gt;
                &lt;/div&gt;

                &lt;div className={styles.statCard}&gt;
                  &lt;div className={styles.statHeader}&gt;
                    &lt;span className={styles.statTitle}&gt;Avg Daily Units&lt;/span&gt;
                    &lt;div className={styles.statIcon} style={{ backgroundColor: '#f3e8ff' }}&gt;
                      &lt;svg fill="none" stroke="#9333ea" viewBox="0 0 24 24"&gt;
                        &lt;path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /&gt;
                      &lt;/svg&gt;
                    &lt;/div&gt;
                  &lt;/div&gt;
                  &lt;div className={styles.statValue}&gt;{formatNumber(summaryStats?.avgDailyUnits || 0)}&lt;/div&gt;
                  &lt;div className={styles.statSubtext}&gt;Per day average&lt;/div&gt;
                &lt;/div&gt;

                &lt;div className={styles.statCard}&gt;
                  &lt;div className={styles.statHeader}&gt;
                    &lt;span className={styles.statTitle}&gt;Refund Rate&lt;/span&gt;
                    &lt;div className={styles.statIcon} style={{ backgroundColor: '#fee2e2' }}&gt;
                      &lt;svg fill="none" stroke="#dc2626" viewBox="0 0 24 24"&gt;
                        &lt;path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 15v-1a4 4 0 00-4-4H8m0 0l3 3m-3-3l3-3m9 14V5a2 2 0 00-2-2H6a2 2 0 00-2 2v16l4-2 4 2 4-2 4 2z" /&gt;
                      &lt;/svg&gt;
                    &lt;/div&gt;
                  &lt;/div&gt;
                  &lt;div className={styles.statValue}&gt;{(summaryStats?.refundRate || 0).toFixed(1)}%&lt;/div&gt;
                  &lt;div className={styles.statSubtext}&gt;Chargebacks/returns&lt;/div&gt;
                &lt;/div&gt;
              &lt;/div&gt;

              {/* Charts Section - Placeholder */}
              &lt;div className={styles.chartsSection}&gt;
                &lt;div className={styles.chartCard}&gt;
                  &lt;h3 className={styles.chartTitle}&gt;Revenue Over Time&lt;/h3&gt;
                  &lt;div className={styles.chartPlaceholder}&gt;
                    &lt;svg fill="none" stroke="currentColor" viewBox="0 0 24 24"&gt;
                      &lt;path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" /&gt;
                    &lt;/svg&gt;
                    &lt;p&gt;Time series chart coming soon&lt;/p&gt;
                  &lt;/div&gt;
                &lt;/div&gt;

                &lt;div className={styles.chartCard}&gt;
                  &lt;h3 className={styles.chartTitle}&gt;Revenue by Region&lt;/h3&gt;
                  &lt;div className={styles.chartPlaceholder}&gt;
                    &lt;svg fill="none" stroke="currentColor" viewBox="0 0 24 24"&gt;
                      &lt;path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" /&gt;
                      &lt;path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" /&gt;
                    &lt;/svg&gt;
                    &lt;p&gt;Region breakdown coming soon&lt;/p&gt;
                  &lt;/div&gt;
                &lt;/div&gt;
              &lt;/div&gt;

              {/* Period Comparison Section - Placeholder */}
              &lt;div className={styles.periodSection}&gt;
                &lt;div className={styles.sectionHeader}&gt;
                  &lt;h3 className={styles.sectionTitle}&gt;Period Comparison&lt;/h3&gt;
                  &lt;p className={styles.sectionSubtitle}&gt;Compare sale periods vs regular price performance&lt;/p&gt;
                &lt;/div&gt;
                &lt;div className={styles.periodPlaceholder}&gt;
                  &lt;svg fill="none" stroke="currentColor" viewBox="0 0 24 24"&gt;
                    &lt;path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /&gt;
                  &lt;/svg&gt;
                  &lt;p&gt;Period comparison table will auto-detect sale periods from your planning data&lt;/p&gt;
                &lt;/div&gt;
              &lt;/div&gt;

              {/* Data Info */}
              &lt;div className={styles.dataInfo}&gt;
                &lt;span className={styles.dataInfoText}&gt;
                  Showing {formatNumber(performanceData.length)} records across {summaryStats?.totalDays || 0} days
                &lt;/span&gt;
              &lt;/div&gt;
            &lt;/&gt;
          )}

          {/* Import Modal */}
          {showImportModal &amp;&amp; (
            &lt;ImportPerformanceModal
              onClose={() =&gt; setShowImportModal(false)}
              onSuccess={() =&gt; {
                setShowImportModal(false)
                fetchPerformanceData()
              }}
            /&gt;
          )}
        &lt;/main&gt;
      &lt;/div&gt;
    &lt;/div&gt;
  )
}

// Import Modal Component
function ImportPerformanceModal({ onClose, onSuccess }: { onClose: () =&gt; void; onSuccess: () =&gt; void }) {
  const supabase = createClientComponentClient()
  const [file, setFile] = useState&lt;File | null&gt;(null)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState&lt;string | null&gt;(null)
  const [preview, setPreview] = useState&lt;string[][]&gt;([])
  const [progress, setProgress] = useState({ current: 0, total: 0 })

  const handleFileSelect = async (e: React.ChangeEvent&lt;HTMLInputElement&gt;) =&gt; {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    setFile(selectedFile)
    setError(null)

    // Preview first few rows
    try {
      const text = await selectedFile.text()
      const lines = text.split('\n').slice(0, 6) // Header + 5 rows
      const rows = lines.map(line =&gt; line.split(',').map(cell =&gt; cell.trim().replace(/^"|"$/g, '')))
      setPreview(rows)
    } catch (err) {
      setError('Could not read file')
    }
  }

  const handleImport = async () =&gt; {
    if (!file) return

    setIsUploading(true)
    setError(null)

    try {
      const text = await file.text()
      const lines = text.split('\n').filter(line =&gt; line.trim())
      const headers = lines[0].split(',').map(h =&gt; h.trim().replace(/^"|"$/g, '').toLowerCase())
      
      // Map CSV columns to database columns
      const columnMap: Record&lt;string, string&gt; = {
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

      // Get first client ID (or create default)
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

      // Process rows in batches
      const dataRows = lines.slice(1)
      const batchSize = 500
      let imported = 0
      let skipped = 0

      setProgress({ current: 0, total: dataRows.length })

      for (let i = 0; i &lt; dataRows.length; i += batchSize) {
        const batch = dataRows.slice(i, i + batchSize)
        const records = batch.map(line =&gt; {
          const values = line.split(',').map(v =&gt; v.trim().replace(/^"|"$/g, ''))
          const record: Record&lt;string, unknown&gt; = { client_id: clientId }

          headers.forEach((header, idx) =&gt; {
            const dbColumn = columnMap[header]
            if (dbColumn &amp;&amp; values[idx]) {
              const value = values[idx]
              // Handle numeric columns
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
        }).filter(r =&gt; r.date &amp;&amp; r.product_name) // Filter out invalid rows

        if (records.length &gt; 0) {
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

      // Log import
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
    &lt;div className={styles.modalOverlay} onClick={onClose}&gt;
      &lt;div className={styles.modal} onClick={e =&gt; e.stopPropagation()}&gt;
        &lt;div className={styles.modalHeader}&gt;
          &lt;h2 className={styles.modalTitle}&gt;Import Steam Performance Data&lt;/h2&gt;
          &lt;button className={styles.modalClose} onClick={onClose}&gt;
            &lt;svg fill="none" stroke="currentColor" viewBox="0 0 24 24"&gt;
              &lt;path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /&gt;
            &lt;/svg&gt;
          &lt;/button&gt;
        &lt;/div&gt;

        &lt;div className={styles.modalContent}&gt;
          &lt;div className={styles.uploadZone}&gt;
            &lt;input
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              className={styles.fileInput}
              id="csvInput"
            /&gt;
            &lt;label htmlFor="csvInput" className={styles.uploadLabel}&gt;
              {file ? (
                &lt;&gt;
                  &lt;svg className={styles.uploadIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24"&gt;
                    &lt;path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /&gt;
                  &lt;/svg&gt;
                  &lt;span className={styles.fileName}&gt;{file.name}&lt;/span&gt;
                  &lt;span className={styles.fileSize}&gt;({(file.size / 1024 / 1024).toFixed(2)} MB)&lt;/span&gt;
                &lt;/&gt;
              ) : (
                &lt;&gt;
                  &lt;svg className={styles.uploadIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24"&gt;
                    &lt;path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /&gt;
                  &lt;/svg&gt;
                  &lt;span&gt;Click to select CSV file&lt;/span&gt;
                  &lt;span className={styles.uploadHint}&gt;or drag and drop&lt;/span&gt;
                &lt;/&gt;
              )}
            &lt;/label&gt;
          &lt;/div&gt;

          {preview.length &gt; 0 &amp;&amp; (
            &lt;div className={styles.previewSection}&gt;
              &lt;h4 className={styles.previewTitle}&gt;Preview&lt;/h4&gt;
              &lt;div className={styles.previewTable}&gt;
                &lt;table&gt;
                  &lt;thead&gt;
                    &lt;tr&gt;
                      {preview[0]?.map((header: string, i: number) =&gt; (
                        &lt;th key={i}&gt;{header}&lt;/th&gt;
                      ))}
                    &lt;/tr&gt;
                  &lt;/thead&gt;
                  &lt;tbody&gt;
                    {preview.slice(1).map((row, i) =&gt; (
                      &lt;tr key={i}&gt;
                        {row.map((cell: string, j: number) =&gt; (
                          &lt;td key={j}&gt;{cell}&lt;/td&gt;
                        ))}
                      &lt;/tr&gt;
                    ))}
                  &lt;/tbody&gt;
                &lt;/table&gt;
              &lt;/div&gt;
            &lt;/div&gt;
          )}

          {error &amp;&amp; (
            &lt;div className={styles.errorMessage}&gt;
              &lt;svg fill="none" stroke="currentColor" viewBox="0 0 24 24"&gt;
                &lt;path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /&gt;
              &lt;/svg&gt;
              {error}
            &lt;/div&gt;
          )}

          {isUploading &amp;&amp; progress.total &gt; 0 &amp;&amp; (
            &lt;div className={styles.progressSection}&gt;
              &lt;div className={styles.progressBar}&gt;
                &lt;div
                  className={styles.progressFill}
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                /&gt;
              &lt;/div&gt;
              &lt;span className={styles.progressText}&gt;
                Processing {progress.current.toLocaleString()} of {progress.total.toLocaleString()} rows...
              &lt;/span&gt;
            &lt;/div&gt;
          )}
        &lt;/div&gt;

        &lt;div className={styles.modalFooter}&gt;
          &lt;button className={styles.cancelButton} onClick={onClose} disabled={isUploading}&gt;
            Cancel
          &lt;/button&gt;
          &lt;button
            className={styles.importSubmitButton}
            onClick={handleImport}
            disabled={!file || isUploading}
          &gt;
            {isUploading ? 'Importing...' : 'Import Data'}
          &lt;/button&gt;
        &lt;/div&gt;
      &lt;/div&gt;
    &lt;/div&gt;
  )
}
