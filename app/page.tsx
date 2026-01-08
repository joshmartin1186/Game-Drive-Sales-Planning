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
import TimelineExportModal from './components/TimelineExportModal'
import EditLaunchDateModal from './components/EditLaunchDateModal'
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

interface EditLaunchDateState {
  productId: string
  productName: string
  currentLaunchDate: string
}

export default function GameDriveDashboard() {
  const [sales, setSales] = useState&lt;SaleWithDetails[]&gt;([])
  const [clients, setClients] = useState&lt;Client[]&gt;([])
  const [games, setGames] = useState&lt;(Game &amp; { client: Client })[]&gt;([])
  const [products, setProducts] = useState&lt;(Product &amp; { game: Game &amp; { client: Client } })[]&gt;([])
  const [platforms, setPlatforms] = useState&lt;Platform[]&gt;([])
  const [platformEvents, setPlatformEvents] = useState&lt;PlatformEvent[]&gt;([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState&lt;string | null&gt;(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showProductManager, setShowProductManager] = useState(false)
  const [showPlatformSettings, setShowPlatformSettings] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [editingSale, setEditingSale] = useState&lt;SaleWithDetails | null&gt;(null)
  const [viewMode, setViewMode] = useState&lt;'gantt' | 'table'&gt;('gantt')
  const [showEvents, setShowEvents] = useState(true)
  const [salePrefill, setSalePrefill] = useState&lt;SalePrefill | null&gt;(null)
  
  // Calendar generation state
  const [calendarGeneration, setCalendarGeneration] = useState&lt;CalendarGenerationState | null&gt;(null)
  const [isApplyingCalendar, setIsApplyingCalendar] = useState(false)
  
  // Store last generated calendar variations for export
  const [lastGeneratedVariations, setLastGeneratedVariations] = useState&lt;CalendarVariation[]&gt;([])
  
  // Clear sales state
  const [clearSalesState, setClearSalesState] = useState&lt;ClearSalesState | null&gt;(null)
  
  // Edit launch date state
  const [editLaunchDateState, setEditLaunchDateState] = useState&lt;EditLaunchDateState | null&gt;(null)
  
  // Filter state
  const [filterClientId, setFilterClientId] = useState&lt;string&gt;('')
  const [filterGameId, setFilterGameId] = useState&lt;string&gt;('')
  
  // Undo/Redo (functionality kept, UI removed)
  const { pushAction, setHandlers } = useUndo()

  // Set up undo/redo handlers
  useEffect(() =&gt; {
    setHandlers({
      onCreateSale: async (data) =&gt; {
        const { data: newSale, error } = await supabase
          .from('sales')
          .insert([data])
          .select()
          .single()
        
        if (error) throw error
        return newSale.id
      },
      onUpdateSale: async (id, data) =&gt; {
        const { error } = await supabase
          .from('sales')
          .update(data)
          .eq('id', id)
        
        if (error) throw error
      },
      onDeleteSale: async (id) =&gt; {
        const { error } = await supabase
          .from('sales')
          .delete()
          .eq('id', id)
        
        if (error) throw error
      },
      onRefresh: async () =&gt; {
        await fetchSales()
      }
    })
  }, [setHandlers])

  // Fetch all data on mount
  useEffect(() =&gt; {
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
  async function handleSaleUpdate(saleId: string, updates: Partial&lt;Sale&gt;) {
    // Get current sale data for undo
    const currentSale = sales.find(s =&gt; s.id === saleId)
    if (!currentSale) return
    
    const previousData: Record&lt;string, unknown&gt; = {}
    const newData: Record&lt;string, unknown&gt; = {}
    
    for (const key of Object.keys(updates)) {
      previousData[key] = currentSale[key as keyof SaleWithDetails]
      newData[key] = updates[key as keyof typeof updates]
    }
    
    // Optimistically update local state first
    setSales(prev =&gt; prev.map(sale =&gt; 
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
        setSales(prev =&gt; prev.map(sale =&gt; 
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
    const saleToDelete = sales.find(s =&gt; s.id === saleId)
    if (!saleToDelete) return
    
    const saleData: Record&lt;string, unknown&gt; = {
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
    setSales(prev =&gt; prev.filter(sale =&gt; sale.id !== saleId))
    
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

  async function handleSaleCreate(sale: Omit&lt;Sale, 'id' | 'created_at'&gt;) {
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
        setSales(prev =&gt; [...prev, data].sort((a, b) =&gt; 
          new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
        ))
        
        // Push to undo stack
        pushAction({
          type: 'CREATE_SALE',
          saleId: data.id,
          saleData: sale as Record&lt;string, unknown&gt;
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

  const handleSaleEdit = useCallback((sale: SaleWithDetails) =&gt; {
    setEditingSale(sale)
  }, [])

  const handleTimelineCreate = useCallback((prefill: SalePrefill) =&gt; {
    setSalePrefill(prefill)
    setShowAddModal(true)
  }, [])

  const handleCloseAddModal = useCallback(() =&gt; {
    setShowAddModal(false)
    setSalePrefill(null)
  }, [])

  const handleGenerateCalendar = useCallback((productId: string, productName: string, launchDate?: string) =&gt; {
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
    
    // Store variations for export
    setLastGeneratedVariations(variations)
    
    setCalendarGeneration({
      productId,
      productName,
      launchDate: effectiveLaunchDate,
      variations
    })
  }, [platforms, platformEvents, sales])

  const handleApplyCalendar = useCallback(async (generatedSales: GeneratedSale[]) =&gt; {
    setIsApplyingCalendar(true)
    setError(null)
    
    try {
      const salesToCreate = generatedSales.map(sale =&gt; generatedSaleToCreateFormat(sale))
      
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
      
      if (data &amp;&amp; data.length &gt; 0) {
        setSales(prev =&gt; [...prev, ...data].sort((a, b) =&gt; 
          new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
        ))
        
        // Push batch action to undo stack
        pushAction({
          type: 'BATCH_CREATE_SALES',
          sales: data.map(s =&gt; ({
            id: s.id,
            data: salesToCreate.find(sc =&gt; 
              sc.product_id === s.product_id &amp;&amp; 
              sc.start_date === s.start_date
            ) as Record&lt;string, unknown&gt;
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
  const handleClearSales = useCallback((productId: string, productName: string) =&gt; {
    setClearSalesState({ productId, productName })
  }, [])

  const handleConfirmClearSales = useCallback(async (productId: string, platformId: string | null) =&gt; {
    const salesToDelete = sales.filter(s =&gt; 
      s.product_id === productId &amp;&amp; 
      (platformId === null || s.platform_id === platformId)
    )
    
    if (salesToDelete.length === 0) {
      setClearSalesState(null)
      return
    }
    
    // Store sale data for undo
    const saleDataList = salesToDelete.map(s =&gt; ({
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
      } as Record&lt;string, unknown&gt;
    }))
    
    // Optimistically remove
    setSales(prev =&gt; prev.filter(s =&gt; 
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

  // Launch date change handler - shifts all sales for a product (drag)
  const handleLaunchDateChange = useCallback(async (productId: string, newLaunchDate: string) =&gt; {
    const product = products.find(p =&gt; p.id === productId)
    if (!product) return
    
    const oldLaunchDate = product.launch_date
    if (!oldLaunchDate || oldLaunchDate === newLaunchDate) return
    
    // Calculate the day difference
    const oldDate = parseISO(oldLaunchDate)
    const newDate = parseISO(newLaunchDate)
    const daysDiff = Math.round((newDate.getTime() - oldDate.getTime()) / (1000 * 60 * 60 * 24))
    
    if (daysDiff === 0) return
    
    // Get all sales for this product
    const productSales = sales.filter(s =&gt; s.product_id === productId)
    
    // Optimistically update product launch date
    setProducts(prev =&gt; prev.map(p =&gt; 
      p.id === productId ? { ...p, launch_date: newLaunchDate } : p
    ))
    
    // Optimistically update all sales dates
    const updatedSales = productSales.map(sale =&gt; {
      const newStartDate = new Date(parseISO(sale.start_date).getTime() + daysDiff * 24 * 60 * 60 * 1000)
      const newEndDate = new Date(parseISO(sale.end_date).getTime() + daysDiff * 24 * 60 * 60 * 1000)
      return {
        ...sale,
        start_date: format(newStartDate, 'yyyy-MM-dd'),
        end_date: format(newEndDate, 'yyyy-MM-dd')
      }
    })
    
    setSales(prev =&gt; prev.map(sale =&gt; {
      const updated = updatedSales.find(u =&gt; u.id === sale.id)
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

  // Edit launch date handler - opens modal (click)
  const handleEditLaunchDate = useCallback((productId: string, productName: string, currentLaunchDate: string) =&gt; {
    setEditLaunchDateState({ productId, productName, currentLaunchDate })
  }, [])

  // Save launch date from modal (without shifting sales)
  const handleSaveLaunchDate = useCallback(async (productId: string, newLaunchDate: string, shiftSales: boolean) =&gt; {
    const product = products.find(p =&gt; p.id === productId)
    if (!product) return
    
    if (shiftSales) {
      // Use the existing handler that shifts sales
      await handleLaunchDateChange(productId, newLaunchDate)
    } else {
      // Just update the launch date without shifting sales
      setProducts(prev =&gt; prev.map(p =&gt; 
        p.id === productId ? { ...p, launch_date: newLaunchDate } : p
      ))
      
      try {
        const { error } = await supabase
          .from('products')
          .update({ launch_date: newLaunchDate })
          .eq('id', productId)
        
        if (error) throw error
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to update launch date'
        console.error('Error updating launch date:', err)
        setError(errorMessage)
        await fetchData()
      }
    }
    
    setEditLaunchDateState(null)
  }, [products, handleLaunchDateChange])

  async function handleClientCreate(client: Omit&lt;Client, 'id' | 'created_at'&gt;) {
    try {
      const { data, error } = await supabase
        .from('clients')
        .insert([client])
        .select()
        .single()
      
      if (error) throw error
      if (data) setClients(prev =&gt; [...prev, data].sort((a, b) =&gt; a.name.localeCompare(b.name)))
    } catch (err: unknown) {
      console.error('Error creating client:', err)
      throw err
    }
  }

  async function handleGameCreate(game: Omit&lt;Game, 'id' | 'created_at'&gt;) {
    try {
      const { data, error } = await supabase
        .from('games')
        .insert([game])
        .select(`*, client:clients(*)`)
        .single()
      
      if (error) throw error
      if (data) setGames(prev =&gt; [...prev, data].sort((a, b) =&gt; a.name.localeCompare(b.name)))
    } catch (err: unknown) {
      console.error('Error creating game:', err)
      throw err
    }
  }

  async function handleProductCreate(product: Omit&lt;Product, 'id' | 'created_at'&gt;): Promise&lt;Product | undefined&gt; {
    try {
      const { data, error } = await supabase
        .from('products')
        .insert([product])
        .select(`*, game:games(*, client:clients(*))`)
        .single()
      
      if (error) throw error
      if (data) {
        setProducts(prev =&gt; [...prev, data].sort((a, b) =&gt; a.name.localeCompare(b.name)))
        return data
      }
    } catch (err: unknown) {
      console.error('Error creating product:', err)
      throw err
    }
  }

  // Update handlers for clients, games, products
  async function handleClientUpdate(clientId: string, updates: Partial&lt;Client&gt;) {
    try {
      const { error } = await supabase
        .from('clients')
        .update(updates)
        .eq('id', clientId)
      
      if (error) throw error
      setClients(prev =&gt; prev.map(c =&gt; 
        c.id === clientId ? { ...c, ...updates } : c
      ).sort((a, b) =&gt; a.name.localeCompare(b.name)))
      
      // Update games that reference this client
      if (updates.name) {
        setGames(prev =&gt; prev.map(g =&gt; 
          g.client_id === clientId ? { ...g, client: { ...g.client, ...updates } } : g
        ))
        setProducts(prev =&gt; prev.map(p =&gt; 
          p.game?.client_id === clientId 
            ? { ...p, game: { ...p.game, client: { ...p.game.client, ...updates } } } 
            : p
        ))
      }
    } catch (err: unknown) {
      console.error('Error updating client:', err)
      throw err
    }
  }

  async function handleGameUpdate(gameId: string, updates: Partial&lt;Game&gt;) {
    try {
      const { data, error } = await supabase
        .from('games')
        .update(updates)
        .eq('id', gameId)
        .select(`*, client:clients(*)`)
        .single()
      
      if (error) throw error
      if (data) {
        setGames(prev =&gt; prev.map(g =&gt; 
          g.id === gameId ? data : g
        ).sort((a, b) =&gt; a.name.localeCompare(b.name)))
        
        // Update products that reference this game
        setProducts(prev =&gt; prev.map(p =&gt; 
          p.game_id === gameId ? { ...p, game: data } : p
        ))
      }
    } catch (err: unknown) {
      console.error('Error updating game:', err)
      throw err
    }
  }

  async function handleProductUpdate(productId: string, updates: Partial&lt;Product&gt;) {
    try {
      const { data, error } = await supabase
        .from('products')
        .update(updates)
        .eq('id', productId)
        .select(`*, game:games(*, client:clients(*))`)
        .single()
      
      if (error) throw error
      if (data) {
        setProducts(prev =&gt; prev.map(p =&gt; 
          p.id === productId ? data : p
        ).sort((a, b) =&gt; a.name.localeCompare(b.name)))
      }
    } catch (err: unknown) {
      console.error('Error updating product:', err)
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
      setClients(prev =&gt; prev.filter(c =&gt; c.id !== clientId))
      const deletedGameIds = games.filter(g =&gt; g.client_id === clientId).map(g =&gt; g.id)
      setGames(prev =&gt; prev.filter(g =&gt; g.client_id !== clientId))
      setProducts(prev =&gt; prev.filter(p =&gt; !deletedGameIds.includes(p.game_id)))
      setSales(prev =&gt; prev.filter(s =&gt; !deletedGameIds.includes(s.product?.game_id || '')))
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
      setGames(prev =&gt; prev.filter(g =&gt; g.id !== gameId))
      const deletedProductIds = products.filter(p =&gt; p.game_id === gameId).map(p =&gt; p.id)
      setProducts(prev =&gt; prev.filter(p =&gt; p.game_id !== gameId))
      setSales(prev =&gt; prev.filter(s =&gt; !deletedProductIds.includes(s.product_id)))
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
      setProducts(prev =&gt; prev.filter(p =&gt; p.id !== productId))
      setSales(prev =&gt; prev.filter(s =&gt; s.product_id !== productId))
    } catch (err: unknown) {
      console.error('Error deleting product:', err)
      throw err
    }
  }

  const filteredGames = useMemo(() =&gt; {
    if (!filterClientId) return games
    return games.filter(g =&gt; g.client_id === filterClientId)
  }, [games, filterClientId])

  const filteredProducts = useMemo(() =&gt; {
    let result = products
    if (filterGameId) {
      result = result.filter(p =&gt; p.game_id === filterGameId)
    } else if (filterClientId) {
      result = result.filter(p =&gt; p.game?.client_id === filterClientId)
    }
    return result
  }, [products, filterClientId, filterGameId])

  const filteredSales = useMemo(() =&gt; {
    let result = sales
    if (filterGameId) {
      result = result.filter(s =&gt; s.product?.game_id === filterGameId)
    } else if (filterClientId) {
      result = result.filter(s =&gt; s.product?.game?.client_id === filterClientId)
    }
    return result
  }, [sales, filterClientId, filterGameId])

  const conflicts = 0
  const upcomingEvents = platformEvents.filter(e =&gt; new Date(e.start_date) &gt; new Date()).length

  // Create timelineStart at midnight on the 1st of current month
  // IMPORTANT: Must use new Date(year, month, day) to ensure midnight local time
  // Using new Date() then setDate(1) preserves current time, causing date math issues
  const now = new Date()
  const timelineStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthCount = 12

  useEffect(() =&gt; {
    if (filterClientId &amp;&amp; filterGameId) {
      const game = games.find(g =&gt; g.id === filterGameId)
      if (game &amp;&amp; game.client_id !== filterClientId) {
        setFilterGameId('')
      }
    }
  }, [filterClientId, filterGameId, games])

  if (loading) {
    return (
      &lt;div className={styles.container}&gt;
        &lt;div className={styles.loading}&gt;
          &lt;div className={styles.spinner}&gt;&lt;/div&gt;
          &lt;p&gt;Loading sales data...&lt;/p&gt;
        &lt;/div&gt;
      &lt;/div&gt;
    )
  }

  return (
    &lt;div className={styles.container}&gt;
      &lt;header className={styles.header}&gt;
        &lt;h1&gt;GameDrive Sales Planning&lt;/h1&gt;
        &lt;p&gt;Interactive sales timeline with drag-and-drop scheduling&lt;/p&gt;
      &lt;/header&gt;

      {error &amp;&amp; (
        &lt;div className={styles.errorBanner}&gt;
          &lt;span&gt;⚠️ {error}&lt;/span&gt;
          &lt;button onClick={() =&gt; setError(null)}&gt;×&lt;/button&gt;
        &lt;/div&gt;
      )}

      {/* Header Stats */}
      &lt;div className={styles.statsGrid}&gt;
        &lt;div className={styles.statCard}&gt;
          &lt;div className={styles.statIcon} style={{backgroundColor: '#10b981'}}&gt;📊&lt;/div&gt;
          &lt;div className={styles.statContent}&gt;
            &lt;h3&gt;TOTAL SALES&lt;/h3&gt;
            &lt;p className={styles.statValue}&gt;{filteredSales.length}&lt;/p&gt;
            &lt;span className={styles.statChange}&gt;Across all platforms&lt;/span&gt;
          &lt;/div&gt;
        &lt;/div&gt;

        &lt;div className={styles.statCard}&gt;
          &lt;div className={styles.statIcon} style={{backgroundColor: '#3b82f6'}}&gt;🎮&lt;/div&gt;
          &lt;div className={styles.statContent}&gt;
            &lt;h3&gt;PRODUCTS&lt;/h3&gt;
            &lt;p className={styles.statValue}&gt;{filteredProducts.length}&lt;/p&gt;
            &lt;span className={styles.statChange}&gt;Games and DLCs&lt;/span&gt;
          &lt;/div&gt;
        &lt;/div&gt;

        &lt;div className={styles.statCard}&gt;
          &lt;div className={styles.statIcon} style={{backgroundColor: '#8b5cf6'}}&gt;📅&lt;/div&gt;
          &lt;div className={styles.statContent}&gt;
            &lt;h3&gt;PLATFORM EVENTS&lt;/h3&gt;
            &lt;p className={styles.statValue}&gt;{upcomingEvents}&lt;/p&gt;
            &lt;span className={styles.statChange}&gt;Upcoming sales events&lt;/span&gt;
          &lt;/div&gt;
        &lt;/div&gt;

        &lt;div className={styles.statCard}&gt;
          &lt;div className={styles.statIcon} style={{backgroundColor: conflicts &gt; 0 ? '#ef4444' : '#22c55e'}}&gt;
            {conflicts &gt; 0 ? '⚠️' : '✓'}
          &lt;/div&gt;
          &lt;div className={styles.statContent}&gt;
            &lt;h3&gt;CONFLICTS&lt;/h3&gt;
            &lt;p className={styles.statValue}&gt;{conflicts}&lt;/p&gt;
            &lt;span className={styles.statChange}&gt;{conflicts === 0 ? 'All platforms clear' : 'Needs attention'}&lt;/span&gt;
          &lt;/div&gt;
        &lt;/div&gt;
      &lt;/div&gt;

      {/* Filters */}
      &lt;div className={styles.filters}&gt;
        &lt;div className={styles.filterGroup}&gt;
          &lt;label&gt;Client:&lt;/label&gt;
          &lt;select 
            value={filterClientId} 
            onChange={(e) =&gt; setFilterClientId(e.target.value)}
          &gt;
            &lt;option value=""&gt;All Clients&lt;/option&gt;
            {clients.map(client =&gt; (
              &lt;option key={client.id} value={client.id}&gt;{client.name}&lt;/option&gt;
            ))}
          &lt;/select&gt;
        &lt;/div&gt;
        
        &lt;div className={styles.filterGroup}&gt;
          &lt;label&gt;Game:&lt;/label&gt;
          &lt;select 
            value={filterGameId} 
            onChange={(e) =&gt; setFilterGameId(e.target.value)}
          &gt;
            &lt;option value=""&gt;All Games&lt;/option&gt;
            {filteredGames.map(game =&gt; (
              &lt;option key={game.id} value={game.id}&gt;{game.name}&lt;/option&gt;
            ))}
          &lt;/select&gt;
        &lt;/div&gt;

        &lt;div className={styles.filterGroup}&gt;
          &lt;label className={styles.checkboxLabel}&gt;
            &lt;input 
              type="checkbox" 
              checked={showEvents} 
              onChange={(e) =&gt; setShowEvents(e.target.checked)}
            /&gt;
            Show Platform Events
          &lt;/label&gt;
        &lt;/div&gt;

        {(filterClientId || filterGameId) &amp;&amp; (
          &lt;button 
            className={styles.clearFilters}
            onClick={() =&gt; { setFilterClientId(''); setFilterGameId(''); }}
          &gt;
            Clear Filters
          &lt;/button&gt;
        )}
      &lt;/div&gt;

      {/* View Toggle and Actions */}
      &lt;div className={styles.toolbar}&gt;
        &lt;div className={styles.viewToggle}&gt;
          &lt;button 
            className={`${styles.toggleBtn} ${viewMode === 'gantt' ? styles.active : ''}`}
            onClick={() =&gt; setViewMode('gantt')}
          &gt;
            📅 Timeline
          &lt;/button&gt;
          &lt;button 
            className={`${styles.toggleBtn} ${viewMode === 'table' ? styles.active : ''}`}
            onClick={() =&gt; setViewMode('table')}
          &gt;
            📋 Table
          &lt;/button&gt;
        &lt;/div&gt;
        
        &lt;div className={styles.actions}&gt;
          &lt;button className={styles.primaryBtn} onClick={() =&gt; setShowAddModal(true)}&gt;
            + Add Sale
          &lt;/button&gt;
          &lt;button className={styles.secondaryBtn} onClick={() =&gt; setShowProductManager(true)}&gt;
            ⚙️ Manage Products
          &lt;/button&gt;
          &lt;button className={styles.secondaryBtn} onClick={() =&gt; setShowPlatformSettings(true)}&gt;
            📅 Platform Settings
          &lt;/button&gt;
          &lt;button 
            className={styles.secondaryBtn} 
            onClick={() =&gt; setShowExportModal(true)}
          &gt;
            📊 Export
          &lt;/button&gt;
          &lt;button className={styles.secondaryBtn} onClick={fetchData}&gt;
            🔄 Refresh
          &lt;/button&gt;
        &lt;/div&gt;
      &lt;/div&gt;

      {/* Main Content */}
      &lt;div className={styles.mainContent}&gt;
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
            onEditLaunchDate={handleEditLaunchDate}
            allSales={sales}
            showEvents={showEvents}
          /&gt;
        ) : (
          &lt;SalesTable
            sales={filteredSales}
            platforms={platforms}
            onDelete={handleSaleDelete}
            onEdit={handleSaleEdit}
          /&gt;
        )}
      &lt;/div&gt;

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
        /&gt;
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
          onClose={() =&gt; setEditingSale(null)}
        /&gt;
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
          onClientUpdate={handleClientUpdate}
          onGameUpdate={handleGameUpdate}
          onProductUpdate={handleProductUpdate}
          onGenerateCalendar={handleGenerateCalendar}
          onClose={() =&gt; setShowProductManager(false)}
        /&gt;
      )}

      {/* Platform Settings Modal */}
      &lt;PlatformSettings
        isOpen={showPlatformSettings}
        onClose={() =&gt; setShowPlatformSettings(false)}
        onEventsChange={() =&gt; {
          fetchPlatformEvents()
          fetchData()
        }}
      /&gt;

      {/* Sale Calendar Preview Modal */}
      {calendarGeneration &amp;&amp; (
        &lt;SaleCalendarPreviewModal
          isOpen={true}
          onClose={() =&gt; setCalendarGeneration(null)}
          productName={calendarGeneration.productName}
          launchDate={calendarGeneration.launchDate}
          variations={calendarGeneration.variations}
          onApply={handleApplyCalendar}
          isApplying={isApplyingCalendar}
        /&gt;
      )}

      {/* Clear Sales Modal */}
      {clearSalesState &amp;&amp; (
        &lt;ClearSalesModal
          isOpen={true}
          onClose={() =&gt; setClearSalesState(null)}
          productId={clearSalesState.productId}
          productName={clearSalesState.productName}
          platforms={platforms}
          sales={sales}
          onConfirm={handleConfirmClearSales}
        /&gt;
      )}

      {/* Edit Launch Date Modal */}
      {editLaunchDateState &amp;&amp; (
        &lt;EditLaunchDateModal
          isOpen={true}
          onClose={() =&gt; setEditLaunchDateState(null)}
          productId={editLaunchDateState.productId}
          productName={editLaunchDateState.productName}
          currentLaunchDate={editLaunchDateState.currentLaunchDate}
          onSave={handleSaveLaunchDate}
          salesCount={sales.filter(s =&gt; s.product_id === editLaunchDateState.productId).length}
        /&gt;
      )}

      {/* Timeline Export Modal */}
      &lt;TimelineExportModal
        isOpen={showExportModal}
        onClose={() =&gt; setShowExportModal(false)}
        sales={filteredSales}
        products={filteredProducts}
        platforms={platforms}
        timelineStart={timelineStart}
        monthCount={monthCount}
        calendarVariations={lastGeneratedVariations}
      /&gt;
    &lt;/div&gt;
  )
}
