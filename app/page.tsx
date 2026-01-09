'use client'

// Cache invalidation: 2026-01-09T22:25:00Z - Interactive Stats Cards

import { useState, useEffect, useMemo, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import { parseISO, format, addDays } from 'date-fns'
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
import GapAnalysis from './components/GapAnalysis'
import ImportSalesModal from './components/ImportSalesModal'
import VersionManager from './components/VersionManager'
import DuplicateSaleModal from './components/DuplicateSaleModal'
import BulkEditSalesModal from './components/BulkEditSalesModal'
import StatCard from './components/StatCard'
import { GeneratedSale, CalendarVariation, generatedSaleToCreateFormat } from '@/lib/sale-calendar-generator'
import { useUndo } from '@/lib/undo-context'
import { normalizeToLocalDate } from '@/lib/dateUtils'
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
}

interface ClearSalesState {
  productId: string
  productName: string
}

interface EditLaunchDateState {
  productId: string
  productName: string
  currentLaunchDate: string
  currentLaunchSaleDuration?: number
}

interface SaleSnapshot {
  product_id: string
  platform_id: string
  start_date: string
  end_date: string
  discount_percentage: number | null
  sale_name: string | null
  sale_type: string
  status: string
  notes: string | null
  product_name?: string
  platform_name?: string
}

// Type for valid sale status values
type SaleStatus = 'planned' | 'submitted' | 'confirmed' | 'live' | 'ended'

// Type for conflict info
interface ConflictInfo {
  productName: string
  eventName: string
  overlapDays: number
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
  const [showImportModal, setShowImportModal] = useState(false)
  const [showVersionManager, setShowVersionManager] = useState(false)
  const [editingSale, setEditingSale] = useState&lt;SaleWithDetails | null&gt;(null)
  const [duplicatingSale, setDuplicatingSale] = useState&lt;SaleWithDetails | null&gt;(null)
  const [viewMode, setViewMode] = useState&lt;'gantt' | 'table'&gt;('gantt')
  const [showEvents, setShowEvents] = useState(true)
  const [salePrefill, setSalePrefill] = useState&lt;SalePrefill | null&gt;(null)
  
  // Bulk edit state
  const [bulkEditSales, setBulkEditSales] = useState&lt;SaleWithDetails[]&gt;([])
  
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

  // Bulk edit handler - opens modal with selected sales
  const handleBulkEdit = useCallback((selectedSales: SaleWithDetails[]) =&gt; {
    setBulkEditSales(selectedSales)
  }, [])

  // Bulk update handler
  const handleBulkUpdate = useCallback(async (saleIds: string[], updates: Partial&lt;{
    discount_percentage: number | null
    platform_id: string
    sale_name: string | undefined
    status: string
    dateShiftDays: number
  }&gt;) =&gt; {
    // Handle date shift separately
    if (updates.dateShiftDays !== undefined) {
      const daysDiff = updates.dateShiftDays
      
      // Optimistically update local state
      setSales(prev =&gt; prev.map(sale =&gt; {
        if (!saleIds.includes(sale.id)) return sale
        const newStartDate = addDays(parseISO(sale.start_date), daysDiff)
        const newEndDate = addDays(parseISO(sale.end_date), daysDiff)
        return {
          ...sale,
          start_date: format(newStartDate, 'yyyy-MM-dd'),
          end_date: format(newEndDate, 'yyyy-MM-dd')
        }
      }))
      
      try {
        // Update each sale in database
        for (const saleId of saleIds) {
          const sale = sales.find(s =&gt; s.id === saleId)
          if (!sale) continue
          
          const newStartDate = format(addDays(parseISO(sale.start_date), daysDiff), 'yyyy-MM-dd')
          const newEndDate = format(addDays(parseISO(sale.end_date), daysDiff), 'yyyy-MM-dd')
          
          const { error } = await supabase
            .from('sales')
            .update({ start_date: newStartDate, end_date: newEndDate })
            .eq('id', saleId)
          
          if (error) throw error
        }
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to update sales'
        console.error('Error bulk updating sales:', err)
        setError(errorMessage)
        await fetchSales()
      }
      return
    }
    
    // Handle other updates - convert types for Sale compatibility
    const dbUpdates: Partial&lt;Sale&gt; = {}
    if (updates.discount_percentage !== undefined) {
      dbUpdates.discount_percentage = updates.discount_percentage === null ? undefined : updates.discount_percentage
    }
    if (updates.platform_id !== undefined) dbUpdates.platform_id = updates.platform_id
    if (updates.sale_name !== undefined) dbUpdates.sale_name = updates.sale_name || undefined
    if (updates.status !== undefined) dbUpdates.status = updates.status as SaleStatus
    
    // Optimistically update local state
    setSales(prev =&gt; prev.map(sale =&gt; {
      if (!saleIds.includes(sale.id)) return sale
      return { ...sale, ...dbUpdates } as SaleWithDetails
    }))
    
    try {
      // Update each sale in database
      for (const saleId of saleIds) {
        const { error } = await supabase
          .from('sales')
          .update(dbUpdates)
          .eq('id', saleId)
        
        if (error) throw error
      }
      
      // Refresh to get platform relations if platform changed
      if (updates.platform_id) {
        await fetchSales()
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update sales'
      console.error('Error bulk updating sales:', err)
      setError(errorMessage)
      await fetchSales()
    }
  }, [sales])

  // Bulk delete handler
  const handleBulkDelete = useCallback(async (saleIds: string[]) =&gt; {
    // Optimistically remove from local state
    setSales(prev =&gt; prev.filter(sale =&gt; !saleIds.includes(sale.id)))
    
    try {
      for (const saleId of saleIds) {
        const { error } = await supabase
          .from('sales')
          .delete()
          .eq('id', saleId)
        
        if (error) throw error
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete sales'
      console.error('Error bulk deleting sales:', err)
      setError(errorMessage)
      await fetchSales()
    }
  }, [])

  // Bulk import handler
  const handleBulkImport = useCallback(async (salesToCreate: Omit&lt;Sale, 'id' | 'created_at'&gt;[]) =&gt; {
    try {
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
              sc.start_date === s.start_date &amp;&amp;
              sc.platform_id === s.platform_id
            ) as Record&lt;string, unknown&gt;
          }))
        })
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to import sales'
      console.error('Error importing sales:', err)
      throw new Error(errorMessage)
    }
  }, [pushAction])

  // Duplicate sales handler
  const handleDuplicateSales = useCallback(async (salesToCreate: Omit&lt;Sale, 'id' | 'created_at'&gt;[]) =&gt; {
    try {
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
              sc.start_date === s.start_date &amp;&amp;
              sc.platform_id === s.platform_id
            ) as Record&lt;string, unknown&gt;
          }))
        })
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to duplicate sales'
      console.error('Error duplicating sales:', err)
      throw new Error(errorMessage)
    }
  }, [pushAction])

  // Restore version handler
  const handleRestoreVersion = useCallback(async (salesSnapshot: SaleSnapshot[]) =&gt; {
    // Delete all current sales first
    const currentSaleIds = sales.map(s =&gt; s.id)
    
    try {
      // Delete existing sales
      for (const id of currentSaleIds) {
        const { error } = await supabase
          .from('sales')
          .delete()
          .eq('id', id)
        
        if (error) throw error
      }
      
      // Create sales from snapshot
      if (salesSnapshot.length &gt; 0) {
        const salesToCreate = salesSnapshot.map(s =&gt; ({
          product_id: s.product_id,
          platform_id: s.platform_id,
          start_date: s.start_date,
          end_date: s.end_date,
          discount_percentage: s.discount_percentage,
          sale_name: s.sale_name,
          sale_type: s.sale_type,
          status: s.status,
          notes: s.notes
        }))
        
        const { error } = await supabase
          .from('sales')
          .insert(salesToCreate)
        
        if (error) throw error
      }
      
      // Refresh to get full sale data with relations
      await fetchSales()
      
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to restore version'
      console.error('Error restoring version:', err)
      setError(errorMessage)
      // Refresh to recover
      await fetchSales()
      throw new Error(errorMessage)
    }
  }, [sales])

  const handleSaleEdit = useCallback((sale: SaleWithDetails) =&gt; {
    setEditingSale(sale)
  }, [])

  const handleSaleDuplicate = useCallback((sale: SaleWithDetails) =&gt; {
    setDuplicatingSale(sale)
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
    
    // Open the modal - it will handle platform selection and generation internally
    setCalendarGeneration({
      productId,
      productName,
      launchDate: effectiveLaunchDate
    })
  }, [])

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
  const handleEditLaunchDate = useCallback((productId: string, productName: string, currentLaunchDate: string, currentLaunchSaleDuration?: number) =&gt; {
    setEditLaunchDateState({ productId, productName, currentLaunchDate, currentLaunchSaleDuration })
  }, [])

  // Launch sale duration change handler - resize on timeline
  const handleLaunchSaleDurationChange = useCallback(async (productId: string, newDuration: number) =&gt; {
    const product = products.find(p =&gt; p.id === productId)
    if (!product) return
    
    // Optimistically update local state
    setProducts(prev =&gt; prev.map(p =&gt; 
      p.id === productId ? { ...p, launch_sale_duration: newDuration } : p
    ))
    
    try {
      const { error } = await supabase
        .from('products')
        .update({ launch_sale_duration: newDuration })
        .eq('id', productId)
      
      if (error) throw error
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update launch sale duration'
      console.error('Error updating launch sale duration:', err)
      setError(errorMessage)
      // Rollback on error
      await fetchData()
    }
  }, [products])

  // Save launch date from modal (with optional sales shift and duration)
  const handleSaveLaunchDate = useCallback(async (productId: string, newLaunchDate: string, launchSaleDuration: number, shiftSales: boolean) =&gt; {
    const product = products.find(p =&gt; p.id === productId)
    if (!product) return
    
    // Build update object
    const productUpdate: { launch_date: string; launch_sale_duration?: number } = {
      launch_date: newLaunchDate
    }
    
    // Only include duration if it's different from default or current
    if (launchSaleDuration !== (product.launch_sale_duration || 7)) {
      productUpdate.launch_sale_duration = launchSaleDuration
    }
    
    if (shiftSales) {
      // Calculate shift and update sales
      const oldLaunchDate = product.launch_date
      if (oldLaunchDate &amp;&amp; oldLaunchDate !== newLaunchDate) {
        const oldDate = parseISO(oldLaunchDate)
        const newDate = parseISO(newLaunchDate)
        const daysDiff = Math.round((newDate.getTime() - oldDate.getTime()) / (1000 * 60 * 60 * 24))
        
        if (daysDiff !== 0) {
          const productSales = sales.filter(s =&gt; s.product_id === productId)
          
          // Optimistically update
          setProducts(prev =&gt; prev.map(p =&gt; 
            p.id === productId ? { ...p, ...productUpdate } : p
          ))
          
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
            // Update product
            const { error: productError } = await supabase
              .from('products')
              .update(productUpdate)
              .eq('id', productId)
            
            if (productError) throw productError
            
            // Update all sales dates
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
            await fetchData()
          }
        }
      }
    } else {
      // Just update the launch date and duration without shifting sales
      setProducts(prev =&gt; prev.map(p =&gt; 
        p.id === productId ? { ...p, ...productUpdate } : p
      ))
      
      try {
        const { error } = await supabase
          .from('products')
          .update(productUpdate)
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
  }, [products, sales])

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

  // Calculate real conflicts - launch sales that overlap with Steam seasonal events
  const { conflicts, conflictDetails } = useMemo(() =&gt; {
    const conflictList: ConflictInfo[] = []
    
    // Get Steam platform IDs
    const steamPlatformIds = platforms
      .filter(p =&gt; p.name.toLowerCase().includes('steam'))
      .map(p =&gt; p.id)
    
    if (steamPlatformIds.length === 0) {
      return { conflicts: 0, conflictDetails: [] }
    }
    
    // Get Steam seasonal events
    const steamSeasonalEvents = platformEvents.filter(e =&gt; 
      steamPlatformIds.includes(e.platform_id) &amp;&amp; 
      e.event_type === 'seasonal'
    )
    
    // Check each product with a launch date
    for (const product of filteredProducts) {
      if (!product.launch_date) continue
      
      const duration = product.launch_sale_duration || 7
      const launchStart = normalizeToLocalDate(product.launch_date)
      const launchEnd = addDays(launchStart, duration - 1)
      
      for (const event of steamSeasonalEvents) {
        const eventStart = normalizeToLocalDate(event.start_date)
        const eventEnd = normalizeToLocalDate(event.end_date)
        
        // Check for overlap
        if (launchStart &lt;= eventEnd &amp;&amp; launchEnd &gt;= eventStart) {
          const overlapStart = launchStart &gt; eventStart ? launchStart : eventStart
          const overlapEnd = launchEnd &lt; eventEnd ? launchEnd : eventEnd
          const overlapDays = Math.round((overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24)) + 1
          
          conflictList.push({
            productName: product.name,
            eventName: event.name,
            overlapDays
          })
        }
      }
    }
    
    return { conflicts: conflictList.length, conflictDetails: conflictList }
  }, [filteredProducts, platforms, platformEvents])

  // Calculate upcoming events with details
  const { upcomingEventsCount, upcomingEventDetails } = useMemo(() =&gt; {
    const now = new Date()
    const upcoming = platformEvents.filter(e =&gt; new Date(e.start_date) &gt; now)
    
    const details = upcoming
      .sort((a, b) =&gt; new Date(a.start_date).getTime() - new Date(b.start_date).getTime())
      .map(e =&gt; {
        const platform = platforms.find(p =&gt; p.id === e.platform_id)
        return {
          label: e.name,
          sublabel: format(normalizeToLocalDate(e.start_date), 'MMM d, yyyy'),
          color: platform?.color_hex || '#8b5cf6'
        }
      })
    
    return { upcomingEventsCount: upcoming.length, upcomingEventDetails: details }
  }, [platformEvents, platforms])

  // FIX: Create timelineStart at midnight to match eachDayOfInterval behavior
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
          &lt;span&gt;Warning: {error}&lt;/span&gt;
          &lt;button onClick={() =&gt; setError(null)}&gt;×&lt;/button&gt;
        &lt;/div&gt;
      )}

      {/* Header Stats - Now using StatCard component */}
      &lt;div className={styles.statsGrid}&gt;
        &lt;StatCard
          icon="📊"
          iconColor="#10b981"
          title="TOTAL SALES"
          value={filteredSales.length}
          subtitle="Across all platforms"
        /&gt;

        &lt;StatCard
          icon="🎮"
          iconColor="#3b82f6"
          title="PRODUCTS"
          value={filteredProducts.length}
          subtitle="Games and DLCs"
        /&gt;

        &lt;StatCard
          icon="📅"
          iconColor="#8b5cf6"
          title="PLATFORM EVENTS"
          value={upcomingEventsCount}
          subtitle="Upcoming sales events"
          tooltipTitle="Upcoming Platform Events"
          tooltipItems={upcomingEventDetails}
          tooltipEmptyMessage="No upcoming platform events"
        /&gt;

        &lt;StatCard
          icon={conflicts &gt; 0 ? '⚠️' : '✅'}
          iconColor={conflicts &gt; 0 ? '#ef4444' : '#22c55e'}
          title="CONFLICTS"
          value={conflicts}
          subtitle={conflicts === 0 ? 'All platforms clear' : 'Needs attention'}
          warning={conflicts &gt; 0}
          tooltipTitle="Launch Sale Conflicts"
          tooltipItems={conflictDetails.map(c =&gt; ({
            label: c.productName,
            sublabel: `${c.eventName} (${c.overlapDays}d overlap)`,
            warning: true
          }))}
          tooltipEmptyMessage="No conflicts detected"
        /&gt;
      &lt;/div&gt;

      {/* Gap Analysis Panel */}
      &lt;GapAnalysis
        sales={filteredSales}
        products={filteredProducts}
        platforms={platforms}
        timelineStart={timelineStart}
        monthCount={monthCount}
      /&gt;

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
            Timeline
          &lt;/button&gt;
          &lt;button 
            className={`${styles.toggleBtn} ${viewMode === 'table' ? styles.active : ''}`}
            onClick={() =&gt; setViewMode('table')}
          &gt;
            Table
          &lt;/button&gt;
        &lt;/div&gt;
        
        &lt;div className={styles.actions}&gt;
          &lt;button className={styles.primaryBtn} onClick={() =&gt; setShowAddModal(true)}&gt;
            + Add Sale
          &lt;/button&gt;
          &lt;button className={styles.secondaryBtn} onClick={() =&gt; setShowImportModal(true)}&gt;
            Import CSV
          &lt;/button&gt;
          &lt;button className={styles.secondaryBtn} onClick={() =&gt; setShowVersionManager(true)}&gt;
            📚 Versions
          &lt;/button&gt;
          &lt;button className={styles.secondaryBtn} onClick={() =&gt; setShowProductManager(true)}&gt;
            Manage Products
          &lt;/button&gt;
          &lt;button className={styles.secondaryBtn} onClick={() =&gt; setShowPlatformSettings(true)}&gt;
            Platform Settings
          &lt;/button&gt;
          &lt;button 
            className={styles.secondaryBtn} 
            onClick={() =&gt; setShowExportModal(true)}
          &gt;
            Export
          &lt;/button&gt;
          &lt;button className={styles.secondaryBtn} onClick={fetchData}&gt;
            Refresh
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
            onSaleDuplicate={handleSaleDuplicate}
            onCreateSale={handleTimelineCreate}
            onGenerateCalendar={handleGenerateCalendar}
            onClearSales={handleClearSales}
            onLaunchDateChange={handleLaunchDateChange}
            onEditLaunchDate={handleEditLaunchDate}
            onLaunchSaleDurationChange={handleLaunchSaleDurationChange}
            allSales={sales}
            showEvents={showEvents}
          /&gt;
        ) : (
          &lt;SalesTable
            sales={filteredSales}
            platforms={platforms}
            onDelete={handleSaleDelete}
            onEdit={handleSaleEdit}
            onDuplicate={handleSaleDuplicate}
            onBulkEdit={handleBulkEdit}
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
          onDuplicate={handleSaleDuplicate}
          onClose={() =&gt; setEditingSale(null)}
        /&gt;
      )}

      {/* Duplicate Sale Modal */}
      {duplicatingSale &amp;&amp; (
        &lt;DuplicateSaleModal
          sale={duplicatingSale}
          products={products}
          platforms={platforms}
          existingSales={sales}
          onDuplicate={handleDuplicateSales}
          onClose={() =&gt; setDuplicatingSale(null)}
        /&gt;
      )}

      {/* Bulk Edit Sales Modal */}
      &lt;BulkEditSalesModal
        isOpen={bulkEditSales.length &gt; 0}
        onClose={() =&gt; setBulkEditSales([])}
        selectedSales={bulkEditSales}
        platforms={platforms}
        onBulkUpdate={handleBulkUpdate}
        onBulkDelete={handleBulkDelete}
      /&gt;

      {/* Import Sales Modal */}
      &lt;ImportSalesModal
        isOpen={showImportModal}
        onClose={() =&gt; setShowImportModal(false)}
        products={products}
        platforms={platforms}
        existingSales={sales}
        onImport={handleBulkImport}
      /&gt;

      {/* Version Manager Modal */}
      &lt;VersionManager
        isOpen={showVersionManager}
        onClose={() =&gt; setShowVersionManager(false)}
        currentSales={sales}
        platforms={platforms}
        onRestoreVersion={handleRestoreVersion}
      /&gt;

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
          productId={calendarGeneration.productId}
          productName={calendarGeneration.productName}
          launchDate={calendarGeneration.launchDate}
          platforms={platforms}
          platformEvents={platformEvents}
          existingSales={sales}
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
          currentLaunchSaleDuration={editLaunchDateState.currentLaunchSaleDuration || 7}
          onSave={handleSaveLaunchDate}
          salesCount={sales.filter(s =&gt; s.product_id === editLaunchDateState.productId).length}
          platforms={platforms}
          platformEvents={platformEvents}
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
