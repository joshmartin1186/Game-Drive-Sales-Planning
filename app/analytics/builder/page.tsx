'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import ChartBuilder from '../components/ChartBuilder'
import { ChartConfig, DashboardConfig } from '@/lib/chart-types'
import styles from './page.module.css'

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

interface Client {
  id: string
  name: string
}

// Sidebar component (matching analytics page)
function AnalyticsSidebar() {
  const pathname = usePathname()

  const navItems = [
    { name: 'Sales Timeline', href: '/', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
    { name: 'Analytics', href: '/analytics', icon: 'M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z' },
    { name: 'Dashboard Builder', href: '/analytics/builder', icon: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z' },
    { name: 'Client Management', href: '/clients', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z' },
    { name: 'Platform Settings', href: '/platforms', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' },
    { name: 'API Settings', href: '/settings', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' },
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
    </aside>
  )
}

export default function AnalyticsBuilderPage() {
  const supabase = createClientComponentClient()

  // State
  const [isLoading, setIsLoading] = useState(true)
  const [performanceData, setPerformanceData] = useState<PerformanceData[]>([])
  const [selectedClient, setSelectedClient] = useState<string>('all')
  const [clients, setClients] = useState<Client[]>([])
  const [dashboardConfig, setDashboardConfig] = useState<DashboardConfig | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  // Fetch clients
  const fetchClients = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('id, name')
        .order('name', { ascending: true })

      if (error) throw error
      setClients(data || [])
    } catch (error) {
      console.error('Error fetching clients:', error)
    }
  }, [supabase])

  // Fetch performance data
  const fetchPerformanceData = useCallback(async () => {
    setIsLoading(true)
    try {
      let query = supabase
        .from('steam_performance_data')
        .select('*')
        .order('date', { ascending: true })

      if (selectedClient !== 'all') {
        query = query.eq('client_id', selectedClient)
      }

      const { data, error } = await query

      if (error) throw error
      setPerformanceData(data || [])
    } catch (error) {
      console.error('Error fetching performance data:', error)
    } finally {
      setIsLoading(false)
    }
  }, [supabase, selectedClient])

  // Load dashboard configuration
  const loadDashboardConfig = useCallback(async () => {
    try {
      const clientParam = selectedClient !== 'all' ? `&client_id=${selectedClient}` : ''
      const response = await fetch(`/api/dashboard-configs?is_default=true${clientParam}`)
      const { data } = await response.json()

      if (data && data.length > 0) {
        setDashboardConfig(data[0])
      } else {
        setDashboardConfig(null)
      }
    } catch (error) {
      console.error('Error loading dashboard config:', error)
    }
  }, [selectedClient])

  // Save dashboard configuration
  const saveDashboardConfig = useCallback(async (charts: ChartConfig[]) => {
    setIsSaving(true)
    setSaveMessage(null)

    try {
      const configData = {
        client_id: selectedClient !== 'all' ? selectedClient : null,
        name: dashboardConfig?.name || 'My Dashboard',
        layout: charts.map(c => c.position),
        charts: charts,
        is_default: true,
      }

      const url = dashboardConfig ? '/api/dashboard-configs' : '/api/dashboard-configs'
      const method = dashboardConfig ? 'PUT' : 'POST'

      const body = dashboardConfig
        ? { ...configData, id: dashboardConfig.id }
        : configData

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (response.ok) {
        const { data } = await response.json()
        setDashboardConfig(data)
        setSaveMessage('Dashboard saved successfully!')
        setTimeout(() => setSaveMessage(null), 3000)
      } else {
        throw new Error('Failed to save dashboard')
      }
    } catch (error) {
      console.error('Error saving dashboard:', error)
      setSaveMessage('Failed to save dashboard')
      setTimeout(() => setSaveMessage(null), 3000)
    } finally {
      setIsSaving(false)
    }
  }, [selectedClient, dashboardConfig])

  useEffect(() => {
    fetchClients()
  }, [fetchClients])

  useEffect(() => {
    fetchPerformanceData()
    loadDashboardConfig()
  }, [fetchPerformanceData, loadDashboardConfig])

  return (
    <div className={styles.pageContainer}>
      <AnalyticsSidebar />

      <main className={styles.mainContent}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <h1 className={styles.pageTitle}>Analytics Dashboard Builder</h1>
            <p className={styles.pageSubtitle}>
              Create custom dashboards with drag-and-drop charts
            </p>
          </div>
          <div className={styles.headerRight}>
            <select
              className={styles.clientSelect}
              value={selectedClient}
              onChange={(e) => setSelectedClient(e.target.value)}
            >
              <option value="all">All Clients</option>
              {clients.map(client => (
                <option key={client.id} value={client.id}>{client.name}</option>
              ))}
            </select>
            <Link href="/analytics" className={styles.backButton}>
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Analytics
            </Link>
          </div>
        </div>

        {/* Save Message */}
        {saveMessage && (
          <div className={`${styles.saveMessage} ${saveMessage.includes('success') ? styles.saveSuccess : styles.saveError}`}>
            {saveMessage}
          </div>
        )}

        {/* Chart Builder */}
        {isLoading ? (
          <div className={styles.loadingContainer}>
            <div className={styles.spinner} />
            <p>Loading data...</p>
          </div>
        ) : (
          <ChartBuilder
            performanceData={performanceData}
            initialCharts={dashboardConfig?.charts || []}
            onChartsChange={saveDashboardConfig}
          />
        )}
      </main>
    </div>
  )
}
