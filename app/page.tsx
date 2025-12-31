'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import { parseISO } from 'date-fns'
import GanttChart from './components/GanttChart'
import SalesTable from './components/SalesTable'
import AddSaleModal from './components/AddSaleModal'
import EditSaleModal from './components/EditSaleModal'
import ProductManager from './components/ProductManager'
import PlatformSettings from './components/PlatformSettings'
import SaleCalendarPreviewModal from './components/SaleCalendarPreviewModal'
import { generateSaleCalendar, GeneratedSale, CalendarVariation, generatedSaleToCreateFormat } from '@/lib/sale-calendar-generator'
import styles from './page.module.css'
import { Sale, Platform, Product, Game, Client, SaleWithDetails, PlatformEvent } from '@/lib/types'

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const supabase = createClient(supabaseUrl, supabaseAnonKey)

interface SalePrefill {
  productId: string
  platformId: string
  startDate: string
  endDate: string
}

interface CalendarGenerationState {
  productId: string
  productName: string
  variations: CalendarVariation[]
}

export default function GameDriveDashboard() {
  const [sales, setSales] = useState<SaleWithDetails[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [games, setGames] = useState<(Game & { client: Client })[]>([])
  const [products, setProducts] = useState<(Product & { game: Game & { client: Client } })[]>([])
  const [platforms, setPlatforms] = useState<Platform[]>([])
  const [platformEvents, setPlatformEvents] = useState<PlatformEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showProductManager, setShowProductManager] = useState(false)
  const [showPlatformSettings, setShowPlatformSettings] = useState(false)
  const [editingSale, setEditingSale] = useState<SaleWithDetails | null>(null)
  const [viewMode, setViewMode] = useState<'gantt' | 'table'>('gantt')
  const [showEvents, setShowEvents] = useState(true)
  const [salePrefill, setSalePrefill] = useState<SalePrefill | null>(null)
  
  // Calendar generation state
  const [calendarGeneration, setCalendarGeneration] = useState<CalendarGenerationState | null>(null)
  const [isApplyingCalendar, setIsApplyingCalendar] = useState(false)
  
  // Filter state
  const [filterClientId, setFilterClientId] = useState<string>('')
  const [filterGameId, setFilterGameId] = useState<string>('')

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

      // Fetch platform events
      const { data: eventsData, error: eventsError } = await supabase
        .from('platform_events')
        .select(`
          *,
          platform:platforms(*)
        `)
        .order('start_date')
      
      if (eventsError) throw eventsError
      setPlatformEvents(eventsData || [])

      // Fetch clients
      const { data: clientsData, error: clientsError } = await supabase
        .from('clients')
        .select('*')
        .order('name')
      
      if (clientsError) throw clientsError
      setClients(clientsData || [])

      // Fetch games with clients
      const { data: gamesData, error: gamesError } = await supabase
        .from('games')
        .select(`
          *,
          client:clients(*)
        `)
        .order('name')
      
      if (gamesError) throw gamesError
      setGames(gamesData || [])

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

    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load data'
      console.error('Error fetching data:', err)
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  async function fetchPlatformEvents() {
    try {
      const { data: eventsData, error: eventsError } = await supabase
        .from('platform_events')
        .select(`
          *,
          platform:platforms(*)
        `)
        .order('start_date')
      
      if (eventsError) throw eventsError
      setPlatformEvents(eventsData || [])
    } catch (err) {
      console.error('Error fetching platform events:', err)
    }
  }

  // Optimistic update for sales - updates local state immediately
  async function handleSaleUpdate(saleId: string, updates: Partial<Sale>) {
    // Optimistically update local state first - preserve product and platform
    setSales(prev => prev.map(sale => 
      sale.id === saleId 
        ? { ...sale, ...updates } as SaleWithDetails
        : sale
    ))
    
    try {
      const { error } = await supabase
        .from('sales')
        .update(updates)
        .eq('id', saleId)
      
      if (error) throw error
      
      // Silently refresh to get any server-side changes
      const { data: updatedSale } = await supabase
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
        .eq('id', saleId)
        .single()
      
      if (updatedSale) {
        setSales(prev => prev.map(sale => 
          sale.id === saleId ? updatedSale : sale
        ))
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update sale'
      console.error('Error updating sale:', err)
      setError(errorMessage)
      // Refresh data on error to restore correct state
      await fetchData()
    }
  }

  async function handleSaleDelete(saleId: string) {
    if (!confirm('Are you sure you want to delete this sale?')) return
    
    // Optimistically remove from local state
    const previousSales = sales
    setSales(prev => prev.filter(sale => sale.id !== saleId))
    
    try {
      const { error } = await supabase
        .from('sales')
        .delete()
        .eq('id', saleId)
      
      if (error) throw error
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete sale'
      console.error('Error deleting sale:', err)
      setError(errorMessage)
      // Restore on error
      setSales(previousSales)
    }
  }

  async function handleSaleCreate(sale: Omit<Sale, 'id' | 'created_at'>) {
    try {
      const { data, error } = await supabase
        .from('sales')
        .insert([sale])
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
        .single()
      
      if (error) throw error
      
      // Add to local state
      if (data) {
        setSales(prev => [...prev, data].sort((a, b) => 
          new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
        ))
      }
      
      setShowAddModal(false)
      setSalePrefill(null)
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create sale'
      console.error('Error creating sale:', err)
      setError(errorMessage)
    }
  }

  const handleSaleEdit = useCallback((sale: SaleWithDetails) => {
    setEditingSale(sale)
  }, [])

  // Handle click-to-create from timeline - MEMOIZED to prevent recreation
  const handleTimelineCreate = useCallback((prefill: SalePrefill) => {
    setSalePrefill(prefill)
    setShowAddModal(true)
  }, [])

  // Close modal and clear prefill
  const handleCloseAddModal = useCallback(() => {
    setShowAddModal(false)
    setSalePrefill(null)
  }, [])

  // Handle generate calendar button click
  const handleGenerateCalendar = useCallback((productId: string, productName: string) => {
    const currentYear = new Date().getFullYear()
    
    const variations = generateSaleCalendar({
      productId,
      platforms,
      platformEvents,
      year: currentYear,
      defaultDiscount: 50
    })
    
    setCalendarGeneration({
      productId,
      productName,
      variations
    })
  }, [platforms, platformEvents])

  // Handle applying generated calendar
  const handleApplyCalendar = useCallback(async (generatedSales: GeneratedSale[]) => {
    setIsApplyingCalendar(true)
    setError(null)
    
    try {
      // Convert generated sales to database format
      const salesToCreate = generatedSales.map(sale => generatedSaleToCreateFormat(sale))
      
      // Insert all sales in batch
      const { data, error } = await supabase
        .from('sales')
        .insert(salesToCreate)
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
      
      if (error) throw error
      
      // Add all new sales to local state
      if (data && data.length > 0) {
        setSales(prev => [...prev, ...data].sort((a, b) => 
          new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
        ))
      }
      
      // Close the modal
      setCalendarGeneration(null)
      
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create sales'
      console.error('Error creating calendar sales:', err)
      setError(errorMessage)
    } finally {
      setIsApplyingCalendar(false)
    }
  }, [])

  async function handleClientCreate(client: Omit<Client, 'id' | 'created_at'>) {
    try {
      const { data, error } = await supabase
        .from('clients')
        .insert([client])
        .select()
        .single()
      
      if (error) throw error
      if (data) setClients(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
    } catch (err: unknown) {
      console.error('Error creating client:', err)
      throw err
    }
  }

  async function handleGameCreate(game: Omit<Game, 'id' | 'created_at'>) {
    try {
      const { data, error } = await supabase
        .from('games')
        .insert([game])
        .select(`*, client:clients(*)`)
        .single()
      
      if (error) throw error
      if (data) setGames(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
    } catch (err: unknown) {
      console.error('Error creating game:', err)
      throw err
    }
  }

  // Returns the created product so it can be used for auto-generating calendar
  async function handleProductCreate(product: Omit<Product, 'id' | 'created_at'>): Promise<Product | undefined> {
    try {
      const { data, error } = await supabase
        .from('products')
        .insert([product])
        .select(`*, game:games(*, client:clients(*))`)
        .single()
      
      if (error) throw error
      if (data) {
        setProducts(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
        return data
      }
    } catch (err: unknown) {
      console.error('Error creating product:', err)
      throw err
    }
  }

  async function handleClientDelete(clientId: string) {
    try {
      const { error } = await supabase
        .from('clients')
        .delete()
        .eq('id', clientId)
      
      if (error) throw error
      // Reset filter if deleted client was selected
      if (filterClientId === clientId) setFilterClientId('')
      setClients(prev => prev.filter(c => c.id !== clientId))
      // Remove associated games, products, and sales from state
      const deletedGameIds = games.filter(g => g.client_id === clientId).map(g => g.id)
      setGames(prev => prev.filter(g => g.client_id !== clientId))
      setProducts(prev => prev.filter(p => !deletedGameIds.includes(p.game_id)))
      setSales(prev => prev.filter(s => !deletedGameIds.includes(s.product?.game_id || '')))
    } catch (err: unknown) {
      console.error('Error deleting client:', err)
      throw err
    }
  }

  async function handleGameDelete(gameId: string) {
    try {
      const { error } = await supabase
        .from('games')
        .delete()
        .eq('id', gameId)
      
      if (error) throw error
      // Reset filter if deleted game was selected
      if (filterGameId === gameId) setFilterGameId('')
      setGames(prev => prev.filter(g => g.id !== gameId))
      // Remove associated products and sales
      const deletedProductIds = products.filter(p => p.game_id === gameId).map(p => p.id)
      setProducts(prev => prev.filter(p => p.game_id !== gameId))
      setSales(prev => prev.filter(s => !deletedProductIds.includes(s.product_id)))
    } catch (err: unknown) {
      console.error('Error deleting game:', err)
      throw err
    }
  }

  async function handleProductDelete(productId: string) {
    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', productId)
      
      if (error) throw error
      setProducts(prev => prev.filter(p => p.id !== productId))
      setSales(prev => prev.filter(s => s.product_id !== productId))
    } catch (err: unknown) {
      console.error('Error deleting product:', err)
      throw err
    }
  }

  // Filter games by selected client
  const filteredGames = useMemo(() => {
    if (!filterClientId) return games
    return games.filter(g => g.client_id === filterClientId)
  }, [games, filterClientId])

  // Filter products by selected game or client
  const filteredProducts = useMemo(() => {
    let result = products
    if (filterGameId) {
      result = result.filter(p => p.game_id === filterGameId)
    } else if (filterClientId) {
      result = result.filter(p => p.game?.client_id === filterClientId)
    }
    return result
  }, [products, filterClientId, filterGameId])

  // Filter sales by selected game or client
  const filteredSales = useMemo(() => {
    let result = sales
    if (filterGameId) {
      result = result.filter(s => s.product?.game_id === filterGameId)
    } else if (filterClientId) {
      result = result.filter(s => s.product?.game?.client_id === filterClientId)
    }
    return result
  }, [sales, filterClientId, filterGameId])

  // Calculate stats from filtered data
  const activeSales = filteredSales.filter(s => s.status === 'live' || s.status === 'confirmed').length
  const conflicts = 0 // TODO: Calculate actual conflicts
  const upcomingEvents = platformEvents.filter(e => new Date(e.start_date) > new Date()).length

  // Timeline settings
  const timelineStart = new Date()
  timelineStart.setDate(1) // Start of current month
  const monthCount = 12

  // Reset game filter when client changes
  useEffect(() => {
    if (filterClientId && filterGameId) {
      const game = games.find(g => g.id === filterGameId)
      if (game && game.client_id !== filterClientId) {
        setFilterGameId('')
      }
    }
  }, [filterClientId, filterGameId, games])

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
            <h3>TOTAL SALES</h3>
            <p className={styles.statValue}>{filteredSales.length}</p>
            <span className={styles.statChange}>Across all platforms</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{backgroundColor: '#3b82f6'}}>🎮</div>
          <div className={styles.statContent}>
            <h3>PRODUCTS</h3>
            <p className={styles.statValue}>{filteredProducts.length}</p>
            <span className={styles.statChange}>Games and DLCs</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{backgroundColor: '#8b5cf6'}}>📅</div>
          <div className={styles.statContent}>
            <h3>PLATFORM EVENTS</h3>
            <p className={styles.statValue}>{upcomingEvents}</p>
            <span className={styles.statChange}>Upcoming sales events</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{backgroundColor: conflicts > 0 ? '#ef4444' : '#22c55e'}}>
            {conflicts > 0 ? '⚠️' : '✓'}
          </div>
          <div className={styles.statContent}>
            <h3>CONFLICTS</h3>
            <p className={styles.statValue}>{conflicts}</p>
            <span className={styles.statChange}>{conflicts === 0 ? 'All platforms clear' : 'Needs attention'}</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className={styles.filters}>
        <div className={styles.filterGroup}>
          <label>Client:</label>
          <select 
            value={filterClientId} 
            onChange={(e) => setFilterClientId(e.target.value)}
          >
            <option value="">All Clients</option>
            {clients.map(client => (
              <option key={client.id} value={client.id}>{client.name}</option>
            ))}
          </select>
        </div>
        
        <div className={styles.filterGroup}>
          <label>Game:</label>
          <select 
            value={filterGameId} 
            onChange={(e) => setFilterGameId(e.target.value)}
          >
            <option value="">All Games</option>
            {filteredGames.map(game => (
              <option key={game.id} value={game.id}>{game.name}</option>
            ))}
          </select>
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.checkboxLabel}>
            <input 
              type="checkbox" 
              checked={showEvents} 
              onChange={(e) => setShowEvents(e.target.checked)}
            />
            Show Platform Events
          </label>
        </div>

        {(filterClientId || filterGameId) && (
          <button 
            className={styles.clearFilters}
            onClick={() => { setFilterClientId(''); setFilterGameId(''); }}
          >
            Clear Filters
          </button>
        )}
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
          <button className={styles.secondaryBtn} onClick={() => setShowProductManager(true)}>
            ⚙️ Manage Products
          </button>
          <button className={styles.secondaryBtn} onClick={() => setShowPlatformSettings(true)}>
            📅 Platform Settings
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
            sales={filteredSales}
            products={filteredProducts}
            platforms={platforms}
            platformEvents={platformEvents}
            timelineStart={timelineStart}
            monthCount={monthCount}
            onSaleUpdate={handleSaleUpdate}
            onSaleDelete={handleSaleDelete}
            onSaleEdit={handleSaleEdit}
            onCreateSale={handleTimelineCreate}
            onGenerateCalendar={handleGenerateCalendar}
            allSales={sales}
            showEvents={showEvents}
          />
        ) : (
          <SalesTable
            sales={filteredSales}
            platforms={platforms}
            onDelete={handleSaleDelete}
            onEdit={handleSaleEdit}
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
          onClose={handleCloseAddModal}
          initialDate={salePrefill ? parseISO(salePrefill.startDate) : undefined}
          initialEndDate={salePrefill ? parseISO(salePrefill.endDate) : undefined}
          initialProductId={salePrefill?.productId}
          initialPlatformId={salePrefill?.platformId}
        />
      )}

      {/* Edit Sale Modal */}
      {editingSale && (
        <EditSaleModal
          sale={editingSale}
          products={products}
          platforms={platforms}
          existingSales={sales}
          onSave={handleSaleUpdate}
          onDelete={handleSaleDelete}
          onClose={() => setEditingSale(null)}
        />
      )}

      {/* Product Manager Modal */}
      {showProductManager && (
        <ProductManager
          clients={clients}
          games={games}
          products={products}
          onClientCreate={handleClientCreate}
          onGameCreate={handleGameCreate}
          onProductCreate={handleProductCreate}
          onClientDelete={handleClientDelete}
          onGameDelete={handleGameDelete}
          onProductDelete={handleProductDelete}
          onGenerateCalendar={handleGenerateCalendar}
          onClose={() => setShowProductManager(false)}
        />
      )}

      {/* Platform Settings Modal */}
      <PlatformSettings
        isOpen={showPlatformSettings}
        onClose={() => setShowPlatformSettings(false)}
        onEventsChange={() => {
          fetchPlatformEvents()
          fetchData() // Also refresh platforms in case rules changed
        }}
      />

      {/* Sale Calendar Preview Modal */}
      {calendarGeneration && (
        <SaleCalendarPreviewModal
          isOpen={true}
          onClose={() => setCalendarGeneration(null)}
          productName={calendarGeneration.productName}
          variations={calendarGeneration.variations}
          onApply={handleApplyCalendar}
          isApplying={isApplyingCalendar}
        />
      )}
    </div>
  )
}
