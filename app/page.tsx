'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import { parseISO, format } from 'date-fns'
import GanttChart from './components/GanttChart'
import SalesTable from './components/SalesTable'
import AddSaleModal from './components/AddSaleModal'
import EditSaleModal from './components/EditSaleModal'
import ProductManager from './components/ProductManager'
import PlatformSettings from './components/PlatformSettings'
import SaleCalendarPreviewModal from './components/SaleCalendarPreviewModal'
import ClearSalesModal from './components/ClearSalesModal'
import { generateSaleCalendar, GeneratedSale, CalendarVariation, generatedSaleToCreateFormat } from '@/lib/sale-calendar-generator'
import { useUndo } from '@/lib/undo-context'
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
  launchDate: string
  variations: CalendarVariation[]
}

interface ClearSalesState {
  productId: string
  productName: string
}

export default function GameDriveDashboard() {
  const [sales, setSales] = useState&lt;SaleWithDetails[]>([])
  const [clients, setClients] = useState&lt;Client[]>([])
  const [games, setGames] = useState&lt;(Game &amp; { client: Client })[]>([])
  const [products, setProducts] = useState&lt;(Product &amp; { game: Game &amp; { client: Client } })[]>([])
  const [platforms, setPlatforms] = useState&lt;Platform[]>([])
  const [platformEvents, setPlatformEvents] = useState&lt;PlatformEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState&lt;string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showProductManager, setShowProductManager] = useState(false)
  const [showPlatformSettings, setShowPlatformSettings] = useState(false)
  const [editingSale, setEditingSale] = useState&lt;SaleWithDetails | null>(null)
  const [viewMode, setViewMode] = useState&lt;'gantt' | 'table'>('gantt')
  const [showEvents, setShowEvents] = useState(true)
  const [salePrefill, setSalePrefill] = useState&lt;SalePrefill | null>(null)
  
  // Calendar generation state
  const [calendarGeneration, setCalendarGeneration] = useState&lt;CalendarGenerationState | null>(null)
  const [isApplyingCalendar, setIsApplyingCalendar] = useState(false)
  
  // Clear sales state
  const [clearSalesState, setClearSalesState] = useState&lt;ClearSalesState | null>(null)
  
  // Filter state
  const [filterClientId, setFilterClientId] = useState&lt;string>('')
  const [filterGameId, setFilterGameId] = useState&lt;string>('')
  
  // Undo/Redo (functionality kept, UI removed)
  const { pushAction, setHandlers } = useUndo()

  // Set up undo/redo handlers
  useEffect(() => {
    setHandlers({
      onCreateSale: async (data) => {
        const { data: newSale, error } = await supabase
          .from('sales')
          .insert([data])
          .select()
          .single()
        
        if (error) throw error
        return newSale.id
      },
      onUpdateSale: async (id, data) => {
        const { error } = await supabase
          .from('sales')
          .update(data)
          .eq('id', id)
        
        if (error) throw error
      },
      onDeleteSale: async (id) => {
        const { error } = await supabase
          .from('sales')
          .delete()
          .eq('id', id)
        
        if (error) throw error
      },
      onRefresh: async () => {
        await fetchSales()
      }
    })
  }, [setHandlers])

  // Fetch all data on mount
  useEffect(() => {
    fetchData()
  }, [])

  async function fetchSales() {
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
  }

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

      // Fetch sales
      await fetchSales()

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
  async function handleSaleUpdate(saleId: string, updates: Partial&lt;Sale>) {
    // Get current sale data for undo
    const currentSale = sales.find(s => s.id === saleId)
    if (!currentSale) return
    
    const previousData: Record&lt;string, unknown> = {}
    const newData: Record&lt;string, unknown> = {}
    
    for (const key of Object.keys(updates)) {
      previousData[key] = currentSale[key as keyof SaleWithDetails]
      newData[key] = updates[key as keyof typeof updates]
    }
    
    // Optimistically update local state first
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
      
      // Push to undo stack
      pushAction({
        type: 'UPDATE_SALE',
        saleId,
        previousData,
        newData
      })
      
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
      await fetchData()
    }
  }

  async function handleSaleDelete(saleId: string) {
    if (!confirm('Are you sure you want to delete this sale?')) return
    
    // Get sale data for undo
    const saleToDelete = sales.find(s => s.id === saleId)
    if (!saleToDelete) return
    
    const saleData: Record&lt;string, unknown> = {
      product_id: saleToDelete.product_id,
      platform_id: saleToDelete.platform_id,
      start_date: saleToDelete.start_date,
      end_date: saleToDelete.end_date,
      discount_percentage: saleToDelete.discount_percentage,
      sale_name: saleToDelete.sale_name,
      sale_type: saleToDelete.sale_type,
      status: saleToDelete.status,
      notes: saleToDelete.notes
    }
    
    // Optimistically remove from local state
    const previousSales = sales
    setSales(prev => prev.filter(sale => sale.id !== saleId))
    
    try {
      const { error } = await supabase
        .from('sales')
        .delete()
        .eq('id', saleId)
      
      if (error) throw error
      
      // Push to undo stack
      pushAction({
        type: 'DELETE_SALE',
        saleId,
        saleData
      })
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete sale'
      console.error('Error deleting sale:', err)
      setError(errorMessage)
      setSales(previousSales)
    }
  }

  async function handleSaleCreate(sale: Omit&lt;Sale, 'id' | 'created_at'>) {
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
      
      if (data) {
        setSales(prev => [...prev, data].sort((a, b) => 
          new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
        ))
        
        // Push to undo stack
        pushAction({
          type: 'CREATE_SALE',
          saleId: data.id,
          saleData: sale as Record&lt;string, unknown>
        })
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

  const handleTimelineCreate = useCallback((prefill: SalePrefill) => {
    setSalePrefill(prefill)
    setShowAddModal(true)
  }, [])

  const handleCloseAddModal = useCallback(() => {
    setShowAddModal(false)
    setSalePrefill(null)
  }, [])

  const handleGenerateCalendar = useCallback((productId: string, productName: string, launchDate?: string) => {
    // Use provided launch date or today's date
    const effectiveLaunchDate = launchDate || format(new Date(), 'yyyy-MM-dd')
    
    const variations = generateSaleCalendar({
      productId,
      platforms,
      platformEvents,
      launchDate: effectiveLaunchDate,
      defaultDiscount: 50,
      existingSales: sales // Pass existing sales to avoid conflicts
    })
    
    setCalendarGeneration({
      productId,
      productName,
      launchDate: effectiveLaunchDate,
      variations
    })
  }, [platforms, platformEvents, sales])

  const handleApplyCalendar = useCallback(async (generatedSales: GeneratedSale[]) => {
    setIsApplyingCalendar(true)
    setError(null)
    
    try {
      const salesToCreate = generatedSales.map(sale => generatedSaleToCreateFormat(sale))
      
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
      
      if (data &amp;&amp; data.length > 0) {
        setSales(prev => [...prev, ...data].sort((a, b) => 
          new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
        ))
        
        // Push batch action to undo stack
        pushAction({
          type: 'BATCH_CREATE_SALES',
          sales: data.map(s => ({
            id: s.id,
            data: salesToCreate.find(sc => 
              sc.product_id === s.product_id &amp;&amp; 
              sc.start_date === s.start_date
            ) as Record&lt;string, unknown>
          }))
        })
      }
      
      setCalendarGeneration(null)
      
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create sales'
      console.error('Error creating calendar sales:', err)
      setError(errorMessage)
    } finally {
      setIsApplyingCalendar(false)
    }
  }, [pushAction])

  // Clear sales handler
  const handleClearSales = useCallback((productId: string, productName: string) => {
    setClearSalesState({ productId, productName })
  }, [])

  const handleConfirmClearSales = useCallback(async (productId: string, platformId: string | null) => {
    const salesToDelete = sales.filter(s => 
      s.product_id === productId &amp;&amp; 
      (platformId === null || s.platform_id === platformId)
    )
    
    if (salesToDelete.length === 0) {
      setClearSalesState(null)
      return
    }
    
    // Store sale data for undo
    const saleDataList = salesToDelete.map(s => ({
      id: s.id,
      data: {
        product_id: s.product_id,
        platform_id: s.platform_id,
        start_date: s.start_date,
        end_date: s.end_date,
        discount_percentage: s.discount_percentage,
        sale_name: s.sale_name,
        sale_type: s.sale_type,
        status: s.status,
        notes: s.notes
      } as Record&lt;string, unknown>
    }))
    
    // Optimistically remove
    setSales(prev => prev.filter(s => 
      !(s.product_id === productId &amp;&amp; (platformId === null || s.platform_id === platformId))
    ))
    
    try {
      // Delete from database
      for (const sale of salesToDelete) {
        const { error } = await supabase
          .from('sales')
          .delete()
          .eq('id', sale.id)
        
        if (error) throw error
      }
      
      // Push batch delete to undo stack
      pushAction({
        type: 'BATCH_DELETE_SALES',
        sales: saleDataList
      })
      
      setClearSalesState(null)
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete sales'
      console.error('Error clearing sales:', err)
      setError(errorMessage)
      await fetchSales()
    }
  }, [sales, pushAction])

  // Launch date change handler - shifts all sales for a product
  const handleLaunchDateChange = useCallback(async (productId: string, newLaunchDate: string) => {
    const product = products.find(p => p.id === productId)
    if (!product) return
    
    const oldLaunchDate = product.launch_date
    if (!oldLaunchDate || oldLaunchDate === newLaunchDate) return
    
    // Calculate the day difference
    const oldDate = parseISO(oldLaunchDate)
    const newDate = parseISO(newLaunchDate)
    const daysDiff = Math.round((newDate.getTime() - oldDate.getTime()) / (1000 * 60 * 60 * 24))
    
    if (daysDiff === 0) return
    
    // Get all sales for this product
    const productSales = sales.filter(s => s.product_id === productId)
    
    // Optimistically update product launch date
    setProducts(prev => prev.map(p => 
      p.id === productId ? { ...p, launch_date: newLaunchDate } : p
    ))
    
    // Optimistically update all sales dates
    const updatedSales = productSales.map(sale => {
      const newStartDate = new Date(parseISO(sale.start_date).getTime() + daysDiff * 24 * 60 * 60 * 1000)
      const newEndDate = new Date(parseISO(sale.end_date).getTime() + daysDiff * 24 * 60 * 60 * 1000)
      return {
        ...sale,
        start_date: format(newStartDate, 'yyyy-MM-dd'),
        end_date: format(newEndDate, 'yyyy-MM-dd')
      }
    })
    
    setSales(prev => prev.map(sale => {
      const updated = updatedSales.find(u => u.id === sale.id)
      return updated || sale
    }))
    
    try {
      // Update product launch date in database
      const { error: productError } = await supabase
        .from('products')
        .update({ launch_date: newLaunchDate })
        .eq('id', productId)
      
      if (productError) throw productError
      
      // Update all sales dates in database
      for (const sale of updatedSales) {
        const { error: saleError } = await supabase
          .from('sales')
          .update({
            start_date: sale.start_date,
            end_date: sale.end_date
          })
          .eq('id', sale.id)
        
        if (saleError) throw saleError
      }
      
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update launch date'
      console.error('Error updating launch date:', err)
      setError(errorMessage)
      // Rollback on error
      await fetchData()
    }
  }, [products, sales])

  async function handleClientCreate(client: Omit&lt;Client, 'id' | 'created_at'>) {
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

  async function handleGameCreate(game: Omit&lt;Game, 'id' | 'created_at'>) {
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

  async function handleProductCreate(product: Omit&lt;Product, 'id' | 'created_at'>): Promise&lt;Product | undefined> {
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
      if (filterClientId === clientId) setFilterClientId('')
      setClients(prev => prev.filter(c => c.id !== clientId))
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
      if (filterGameId === gameId) setFilterGameId('')
      setGames(prev => prev.filter(g => g.id !== gameId))
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

  const filteredGames = useMemo(() => {
    if (!filterClientId) return games
    return games.filter(g => g.client_id === filterClientId)
  }, [games, filterClientId])

  const filteredProducts = useMemo(() => {
    let result = products
    if (filterGameId) {
      result = result.filter(p => p.game_id === filterGameId)
    } else if (filterClientId) {
      result = result.filter(p => p.game?.client_id === filterClientId)
    }
    return result
  }, [products, filterClientId, filterGameId])

  const filteredSales = useMemo(() => {
    let result = sales
    if (filterGameId) {
      result = result.filter(s => s.product?.game_id === filterGameId)
    } else if (filterClientId) {
      result = result.filter(s => s.product?.game?.client_id === filterClientId)
    }
    return result
  }, [sales, filterClientId, filterGameId])

  const activeSales = filteredSales.filter(s => s.status === 'live' || s.status === 'confirmed').length
  const conflicts = 0
  const upcomingEvents = platformEvents.filter(e => new Date(e.start_date) > new Date()).length

  const timelineStart = new Date()
  timelineStart.setDate(1)
  const monthCount = 12

  useEffect(() => {
    if (filterClientId &amp;&amp; filterGameId) {
      const game = games.find(g => g.id === filterGameId)
      if (game &amp;&amp; game.client_id !== filterClientId) {
        setFilterGameId('')
      }
    }
  }, [filterClientId, filterGameId, games])

  if (loading) {
    return (
      &lt;div className={styles.container}>
        &lt;div className={styles.loading}>
          &lt;div className={styles.spinner}>&lt;/div>
          &lt;p>Loading sales data...&lt;/p>
        &lt;/div>
      &lt;/div>
    )
  }

  return (
    &lt;div className={styles.container}>
      &lt;header className={styles.header}>
        &lt;h1>GameDrive Sales Planning&lt;/h1>
        &lt;p>Interactive sales timeline with drag-and-drop scheduling&lt;/p>
      &lt;/header>

      {error &amp;&amp; (
        &lt;div className={styles.errorBanner}>
          &lt;span>⚠️ {error}&lt;/span>
          &lt;button onClick={() => setError(null)}>×&lt;/button>
        &lt;/div>
      )}

      {/* Header Stats */}
      &lt;div className={styles.statsGrid}>
        &lt;div className={styles.statCard}>
          &lt;div className={styles.statIcon} style={{backgroundColor: '#10b981'}}>📊&lt;/div>
          &lt;div className={styles.statContent}>
            &lt;h3>TOTAL SALES&lt;/h3>
            &lt;p className={styles.statValue}>{filteredSales.length}&lt;/p>
            &lt;span className={styles.statChange}>Across all platforms&lt;/span>
          &lt;/div>
        &lt;/div>

        &lt;div className={styles.statCard}>
          &lt;div className={styles.statIcon} style={{backgroundColor: '#3b82f6'}}>🎮&lt;/div>
          &lt;div className={styles.statContent}>
            &lt;h3>PRODUCTS&lt;/h3>
            &lt;p className={styles.statValue}>{filteredProducts.length}&lt;/p>
            &lt;span className={styles.statChange}>Games and DLCs&lt;/span>
          &lt;/div>
        &lt;/div>

        &lt;div className={styles.statCard}>
          &lt;div className={styles.statIcon} style={{backgroundColor: '#8b5cf6'}}>📅&lt;/div>
          &lt;div className={styles.statContent}>
            &lt;h3>PLATFORM EVENTS&lt;/h3>
            &lt;p className={styles.statValue}>{upcomingEvents}&lt;/p>
            &lt;span className={styles.statChange}>Upcoming sales events&lt;/span>
          &lt;/div>
        &lt;/div>

        &lt;div className={styles.statCard}>
          &lt;div className={styles.statIcon} style={{backgroundColor: conflicts > 0 ? '#ef4444' : '#22c55e'}}>
            {conflicts > 0 ? '⚠️' : '✓'}
          &lt;/div>
          &lt;div className={styles.statContent}>
            &lt;h3>CONFLICTS&lt;/h3>
            &lt;p className={styles.statValue}>{conflicts}&lt;/p>
            &lt;span className={styles.statChange}>{conflicts === 0 ? 'All platforms clear' : 'Needs attention'}&lt;/span>
          &lt;/div>
        &lt;/div>
      &lt;/div>

      {/* Filters */}
      &lt;div className={styles.filters}>
        &lt;div className={styles.filterGroup}>
          &lt;label>Client:&lt;/label>
          &lt;select 
            value={filterClientId} 
            onChange={(e) => setFilterClientId(e.target.value)}
          >
            &lt;option value="">All Clients&lt;/option>
            {clients.map(client => (
              &lt;option key={client.id} value={client.id}>{client.name}&lt;/option>
            ))}
          &lt;/select>
        &lt;/div>
        
        &lt;div className={styles.filterGroup}>
          &lt;label>Game:&lt;/label>
          &lt;select 
            value={filterGameId} 
            onChange={(e) => setFilterGameId(e.target.value)}
          >
            &lt;option value="">All Games&lt;/option>
            {filteredGames.map(game => (
              &lt;option key={game.id} value={game.id}>{game.name}&lt;/option>
            ))}
          &lt;/select>
        &lt;/div>

        &lt;div className={styles.filterGroup}>
          &lt;label className={styles.checkboxLabel}>
            &lt;input 
              type="checkbox" 
              checked={showEvents} 
              onChange={(e) => setShowEvents(e.target.checked)}
            />
            Show Platform Events
          &lt;/label>
        &lt;/div>

        {(filterClientId || filterGameId) &amp;&amp; (
          &lt;button 
            className={styles.clearFilters}
            onClick={() => { setFilterClientId(''); setFilterGameId(''); }}
          >
            Clear Filters
          &lt;/button>
        )}
      &lt;/div>

      {/* View Toggle and Actions */}
      &lt;div className={styles.toolbar}>
        &lt;div className={styles.viewToggle}>
          &lt;button 
            className={`${styles.toggleBtn} ${viewMode === 'gantt' ? styles.active : ''}`}
            onClick={() => setViewMode('gantt')}
          >
            📅 Timeline
          &lt;/button>
          &lt;button 
            className={`${styles.toggleBtn} ${viewMode === 'table' ? styles.active : ''}`}
            onClick={() => setViewMode('table')}
          >
            📋 Table
          &lt;/button>
        &lt;/div>
        
        &lt;div className={styles.actions}>
          &lt;button className={styles.primaryBtn} onClick={() => setShowAddModal(true)}>
            + Add Sale
          &lt;/button>
          &lt;button className={styles.secondaryBtn} onClick={() => setShowProductManager(true)}>
            ⚙️ Manage Products
          &lt;/button>
          &lt;button className={styles.secondaryBtn} onClick={() => setShowPlatformSettings(true)}>
            📅 Platform Settings
          &lt;/button>
          &lt;button className={styles.secondaryBtn} onClick={fetchData}>
            🔄 Refresh
          &lt;/button>
        &lt;/div>
      &lt;/div>

      {/* Main Content */}
      &lt;div className={styles.mainContent}>
        {viewMode === 'gantt' ? (
          &lt;GanttChart
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
            onClearSales={handleClearSales}
            onLaunchDateChange={handleLaunchDateChange}
            allSales={sales}
            showEvents={showEvents}
          />
        ) : (
          &lt;SalesTable
            sales={filteredSales}
            platforms={platforms}
            onDelete={handleSaleDelete}
            onEdit={handleSaleEdit}
          />
        )}
      &lt;/div>

      {/* Platform Legend */}
      &lt;div className={styles.platformLegend}>
        &lt;h3>Platform Cooldown Periods&lt;/h3>
        &lt;div className={styles.legendGrid}>
          {platforms.map((platform) => (
            &lt;div key={platform.id} className={styles.legendItem}>
              &lt;div 
                className={styles.legendColor}
                style={{backgroundColor: platform.color_hex}}
              >&lt;/div>
              &lt;span>
                &lt;strong>{platform.name}&lt;/strong>: {platform.cooldown_days} days cooldown
              &lt;/span>
            &lt;/div>
          ))}
        &lt;/div>
      &lt;/div>

      {/* Add Sale Modal */}
      {showAddModal &amp;&amp; (
        &lt;AddSaleModal
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
      {editingSale &amp;&amp; (
        &lt;EditSaleModal
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
      {showProductManager &amp;&amp; (
        &lt;ProductManager
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
      &lt;PlatformSettings
        isOpen={showPlatformSettings}
        onClose={() => setShowPlatformSettings(false)}
        onEventsChange={() => {
          fetchPlatformEvents()
          fetchData()
        }}
      />

      {/* Sale Calendar Preview Modal */}
      {calendarGeneration &amp;&amp; (
        &lt;SaleCalendarPreviewModal
          isOpen={true}
          onClose={() => setCalendarGeneration(null)}
          productName={calendarGeneration.productName}
          launchDate={calendarGeneration.launchDate}
          variations={calendarGeneration.variations}
          onApply={handleApplyCalendar}
          isApplying={isApplyingCalendar}
        />
      )}

      {/* Clear Sales Modal */}
      {clearSalesState &amp;&amp; (
        &lt;ClearSalesModal
          isOpen={true}
          onClose={() => setClearSalesState(null)}
          productId={clearSalesState.productId}
          productName={clearSalesState.productName}
          platforms={platforms}
          sales={sales}
          onConfirm={handleConfirmClearSales}
        />
      )}
    &lt;/div>
  )
}
