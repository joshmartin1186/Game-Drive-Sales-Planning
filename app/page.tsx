'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import GanttChart from './components/GanttChart'
import SalesTable from './components/SalesTable'
import AddSaleModal from './components/AddSaleModal'
import styles from './page.module.css'
import { Sale, Platform, Product, Game, Client, SaleWithDetails, TimelineEvent } from '@/lib/types'

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const supabase = createClient(supabaseUrl, supabaseAnonKey)

export default function GameDriveDashboard() {
  const [sales, setSales] = useState<SaleWithDetails[]>([])
  const [products, setProducts] = useState<(Product & { game: Game & { client: Client } })[]>([])
  const [platforms, setPlatforms] = useState<Platform[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [viewMode, setViewMode] = useState<'gantt' | 'table'>('gantt')

  // Fetch all data on mount
  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setLoading(true)
    setError(null)
    
    try {
      // Fetch platforms
      const { data: platformsData, error: platformsError } = await supabase
        .from('platforms')
        .select('*')
        .order('name')
      
      if (platformsError) throw platformsError
      setPlatforms(platformsData || [])

      // Fetch products with games and clients
      const { data: productsData, error: productsError } = await supabase
        .from('products')
        .select(`
          *,
          game:games(
            *,
            client:clients(*)
          )
        `)
        .order('name')
      
      if (productsError) throw productsError
      setProducts(productsData || [])

      // Fetch sales with product, game, client, and platform details
      const { data: salesData, error: salesError } = await supabase
        .from('sales')
        .select(`
          *,
          product:products(
            *,
            game:games(
              *,
              client:clients(*)
            )
          ),
          platform:platforms(*)
        `)
        .order('start_date')
      
      if (salesError) throw salesError
      setSales(salesData || [])

    } catch (err: any) {
      console.error('Error fetching data:', err)
      setError(err.message || 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  async function handleSaleUpdate(saleId: string, updates: Partial<Sale>) {
    try {
      const { error } = await supabase
        .from('sales')
        .update(updates)
        .eq('id', saleId)
      
      if (error) throw error
      
      // Refresh data
      await fetchData()
    } catch (err: any) {
      console.error('Error updating sale:', err)
      setError(err.message)
    }
  }

  async function handleSaleDelete(saleId: string) {
    if (!confirm('Are you sure you want to delete this sale?')) return
    
    try {
      const { error } = await supabase
        .from('sales')
        .delete()
        .eq('id', saleId)
      
      if (error) throw error
      
      // Refresh data
      await fetchData()
    } catch (err: any) {
      console.error('Error deleting sale:', err)
      setError(err.message)
    }
  }

  async function handleSaleCreate(sale: Omit<Sale, 'id' | 'created_at'>) {
    try {
      const { error } = await supabase
        .from('sales')
        .insert([sale])
      
      if (error) throw error
      
      // Refresh data and close modal
      await fetchData()
      setShowAddModal(false)
    } catch (err: any) {
      console.error('Error creating sale:', err)
      setError(err.message)
    }
  }

  // Calculate stats
  const activeSales = sales.filter(s => s.status === 'live' || s.status === 'confirmed').length
  const conflicts = 0 // TODO: Calculate actual conflicts

  // Timeline settings
  const timelineStart = new Date()
  timelineStart.setDate(1) // Start of current month
  const monthCount = 12

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <div className={styles.spinner}></div>
          <p>Loading sales data...</p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>GameDrive Sales Planning</h1>
        <p>Interactive sales timeline with drag-and-drop scheduling</p>
      </header>

      {error && (
        <div className={styles.errorBanner}>
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {/* Header Stats */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{backgroundColor: '#10b981'}}>📊</div>
          <div className={styles.statContent}>
            <h3>Total Sales</h3>
            <p className={styles.statValue}>{sales.length}</p>
            <span className={styles.statChange}>Across all platforms</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{backgroundColor: '#3b82f6'}}>🎮</div>
          <div className={styles.statContent}>
            <h3>Products</h3>
            <p className={styles.statValue}>{products.length}</p>
            <span className={styles.statChange}>Games and DLCs</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{backgroundColor: '#8b5cf6'}}>⭐</div>
          <div className={styles.statContent}>
            <h3>Active Sales</h3>
            <p className={styles.statValue}>{activeSales}</p>
            <span className={styles.statChange}>Live or confirmed</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{backgroundColor: conflicts > 0 ? '#ef4444' : '#22c55e'}}>
            {conflicts > 0 ? '⚠️' : '✓'}
          </div>
          <div className={styles.statContent}>
            <h3>Conflicts</h3>
            <p className={styles.statValue}>{conflicts}</p>
            <span className={styles.statChange}>{conflicts === 0 ? 'All platforms clear' : 'Needs attention'}</span>
          </div>
        </div>
      </div>

      {/* View Toggle and Actions */}
      <div className={styles.toolbar}>
        <div className={styles.viewToggle}>
          <button 
            className={`${styles.toggleBtn} ${viewMode === 'gantt' ? styles.active : ''}`}
            onClick={() => setViewMode('gantt')}
          >
            📅 Timeline
          </button>
          <button 
            className={`${styles.toggleBtn} ${viewMode === 'table' ? styles.active : ''}`}
            onClick={() => setViewMode('table')}
          >
            📋 Table
          </button>
        </div>
        
        <div className={styles.actions}>
          <button className={styles.primaryBtn} onClick={() => setShowAddModal(true)}>
            + Add Sale
          </button>
          <button className={styles.secondaryBtn} onClick={fetchData}>
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className={styles.mainContent}>
        {viewMode === 'gantt' ? (
          <GanttChart
            sales={sales}
            products={products}
            platforms={platforms}
            events={[]}
            timelineStart={timelineStart}
            monthCount={monthCount}
            onSaleUpdate={handleSaleUpdate}
            onSaleDelete={handleSaleDelete}
            allSales={sales}
          />
        ) : (
          <SalesTable
            sales={sales}
            platforms={platforms}
            onDelete={handleSaleDelete}
          />
        )}
      </div>

      {/* Platform Legend */}
      <div className={styles.platformLegend}>
        <h3>Platform Cooldown Periods</h3>
        <div className={styles.legendGrid}>
          {platforms.map((platform) => (
            <div key={platform.id} className={styles.legendItem}>
              <div 
                className={styles.legendColor}
                style={{backgroundColor: platform.color_hex}}
              ></div>
              <span>
                <strong>{platform.name}</strong>: {platform.cooldown_days} days cooldown
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Add Sale Modal */}
      {showAddModal && (
        <AddSaleModal
          products={products}
          platforms={platforms}
          existingSales={sales}
          onSave={handleSaleCreate}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  )
}
