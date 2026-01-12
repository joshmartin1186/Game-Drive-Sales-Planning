'use client'

// Cache invalidation: 2026-01-12T19:15:00Z - Added PageToggle navigation

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
import PageToggle from './components/PageToggle'
import { GeneratedSale, CalendarVariation, generatedSaleToCreateFormat } from '@/lib/sale-calendar-generator'
import { useUndo } from '@/lib/undo-context'
import { normalizeToLocalDate } from '@/lib/dateUtils'
import styles from './page.module.css'
import { Sale, Platform, Product, Game, Client, SaleWithDetails, PlatformEvent } from '@/lib/types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const supabase = createClient(supabaseUrl, supabaseAnonKey)

interface SalePrefill { productId: string; platformId: string; startDate: string; endDate: string; directCreate?: boolean; saleName?: string; discountPercentage?: number; saleType?: string }
interface CalendarGenerationState { productId: string; productName: string; launchDate: string }
interface ClearSalesState { productId: string; productName: string }
interface EditLaunchDateState { productId: string; productName: string; currentLaunchDate: string; currentLaunchSaleDuration?: number }
interface SaleSnapshot { product_id: string; platform_id: string; start_date: string; end_date: string; discount_percentage: number | null; sale_name: string | null; sale_type: string; status: string; notes: string | null; product_name?: string; platform_name?: string }
type SaleStatus = 'planned' | 'submitted' | 'confirmed' | 'live' | 'ended'
interface ConflictInfo { productName: string; eventName: string; overlapDays: number }

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
  const [showExportModal, setShowExportModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [showVersionManager, setShowVersionManager] = useState(false)
  const [editingSale, setEditingSale] = useState<SaleWithDetails | null>(null)
  const [duplicatingSale, setDuplicatingSale] = useState<SaleWithDetails | null>(null)
  const [viewMode, setViewMode] = useState<'gantt' | 'table'>('gantt')
  const [showEvents, setShowEvents] = useState(true)
  const [salePrefill, setSalePrefill] = useState<SalePrefill | null>(null)
  const [bulkEditSales, setBulkEditSales] = useState<SaleWithDetails[]>([])
  const [calendarGeneration, setCalendarGeneration] = useState<CalendarGenerationState | null>(null)
  const [isApplyingCalendar, setIsApplyingCalendar] = useState(false)
  const [lastGeneratedVariations, setLastGeneratedVariations] = useState<CalendarVariation[]>([])
  const [clearSalesState, setClearSalesState] = useState<ClearSalesState | null>(null)
  const [editLaunchDateState, setEditLaunchDateState] = useState<EditLaunchDateState | null>(null)
  const [filterClientId, setFilterClientId] = useState<string>('')
  const [filterGameId, setFilterGameId] = useState<string>('')
  const { pushAction, setHandlers } = useUndo()

  useEffect(() => {
    setHandlers({
      onCreateSale: async (data) => { const { data: newSale, error } = await supabase.from('sales').insert([data]).select().single(); if (error) throw error; return newSale.id },
      onUpdateSale: async (id, data) => { const { error } = await supabase.from('sales').update(data).eq('id', id); if (error) throw error },
      onDeleteSale: async (id) => { const { error } = await supabase.from('sales').delete().eq('id', id); if (error) throw error },
      onRefresh: async () => { await fetchSales() }
    })
  }, [setHandlers])

  useEffect(() => { fetchData() }, [])

  async function fetchSales() {
    const { data: salesData, error: salesError } = await supabase.from('sales').select(`*, product:products(*, game:games(*, client:clients(*))), platform:platforms(*)`).order('start_date')
    if (salesError) throw salesError
    setSales(salesData || [])
  }

  async function fetchData() {
    setLoading(true); setError(null)
    try {
      const { data: platformsData, error: platformsError } = await supabase.from('platforms').select('*').order('name')
      if (platformsError) throw platformsError; setPlatforms(platformsData || [])
      const { data: eventsData, error: eventsError } = await supabase.from('platform_events').select(`*, platform:platforms(*)`).order('start_date')
      if (eventsError) throw eventsError; setPlatformEvents(eventsData || [])
      const { data: clientsData, error: clientsError } = await supabase.from('clients').select('*').order('name')
      if (clientsError) throw clientsError; setClients(clientsData || [])
      const { data: gamesData, error: gamesError } = await supabase.from('games').select(`*, client:clients(*)`).order('name')
      if (gamesError) throw gamesError; setGames(gamesData || [])
      const { data: productsData, error: productsError } = await supabase.from('products').select(`*, game:games(*, client:clients(*))`).order('name')
      if (productsError) throw productsError; setProducts(productsData || [])
      await fetchSales()
    } catch (err: unknown) { const errorMessage = err instanceof Error ? err.message : 'Failed to load data'; console.error('Error fetching data:', err); setError(errorMessage) }
    finally { setLoading(false) }
  }

  async function fetchPlatformEvents() {
    try {
      const { data: eventsData, error: eventsError } = await supabase.from('platform_events').select(`*, platform:platforms(*)`).order('start_date')
      if (eventsError) throw eventsError; setPlatformEvents(eventsData || [])
    } catch (err) { console.error('Error fetching platform events:', err) }
  }

  async function handleSaleUpdate(saleId: string, updates: Partial<Sale>) {
    const currentSale = sales.find(s => s.id === saleId); if (!currentSale) return
    const previousData: Record<string, unknown> = {}; const newData: Record<string, unknown> = {}
    for (const key of Object.keys(updates)) { previousData[key] = currentSale[key as keyof SaleWithDetails]; newData[key] = updates[key as keyof typeof updates] }
    setSales(prev => prev.map(sale => sale.id === saleId ? { ...sale, ...updates } as SaleWithDetails : sale))
    try {
      const { error } = await supabase.from('sales').update(updates).eq('id', saleId); if (error) throw error
      pushAction({ type: 'UPDATE_SALE', saleId, previousData, newData })
      const { data: updatedSale } = await supabase.from('sales').select(`*, product:products(*, game:games(*, client:clients(*))), platform:platforms(*)`).eq('id', saleId).single()
      if (updatedSale) { setSales(prev => prev.map(sale => sale.id === saleId ? updatedSale : sale)) }
    } catch (err: unknown) { const errorMessage = err instanceof Error ? err.message : 'Failed to update sale'; console.error('Error updating sale:', err); setError(errorMessage); await fetchData() }
  }

  async function handleSaleDelete(saleId: string) {
    if (!confirm('Are you sure you want to delete this sale?')) return
    const saleToDelete = sales.find(s => s.id === saleId); if (!saleToDelete) return
    const saleData: Record<string, unknown> = { product_id: saleToDelete.product_id, platform_id: saleToDelete.platform_id, start_date: saleToDelete.start_date, end_date: saleToDelete.end_date, discount_percentage: saleToDelete.discount_percentage, sale_name: saleToDelete.sale_name, sale_type: saleToDelete.sale_type, status: saleToDelete.status, notes: saleToDelete.notes }
    const previousSales = sales; setSales(prev => prev.filter(sale => sale.id !== saleId))
    try { const { error } = await supabase.from('sales').delete().eq('id', saleId); if (error) throw error; pushAction({ type: 'DELETE_SALE', saleId, saleData }) }
    catch (err: unknown) { const errorMessage = err instanceof Error ? err.message : 'Failed to delete sale'; console.error('Error deleting sale:', err); setError(errorMessage); setSales(previousSales) }
  }

  async function handleSaleCreate(sale: Omit<Sale, 'id' | 'created_at'>) {
    try {
      const { data, error } = await supabase.from('sales').insert([sale]).select(`*, product:products(*, game:games(*, client:clients(*))), platform:platforms(*)`).single()
      if (error) throw error
      if (data) { setSales(prev => [...prev, data].sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())); pushAction({ type: 'CREATE_SALE', saleId: data.id, saleData: sale as Record<string, unknown> }) }
      setShowAddModal(false); setSalePrefill(null); return data
    } catch (err: unknown) { const errorMessage = err instanceof Error ? err.message : 'Failed to create sale'; console.error('Error creating sale:', err); setError(errorMessage); return null }
  }

  const handleBulkEdit = useCallback((selectedSales: SaleWithDetails[]) => { setBulkEditSales(selectedSales) }, [])

  const handleBulkUpdate = useCallback(async (saleIds: string[], updates: Partial<{ discount_percentage: number | null; platform_id: string; sale_name: string | undefined; status: string; dateShiftDays: number }>) => {
    if (updates.dateShiftDays !== undefined) {
      const daysDiff = updates.dateShiftDays
      setSales(prev => prev.map(sale => { if (!saleIds.includes(sale.id)) return sale; const newStartDate = addDays(parseISO(sale.start_date), daysDiff); const newEndDate = addDays(parseISO(sale.end_date), daysDiff); return { ...sale, start_date: format(newStartDate, 'yyyy-MM-dd'), end_date: format(newEndDate, 'yyyy-MM-dd') } }))
      try { for (const saleId of saleIds) { const sale = sales.find(s => s.id === saleId); if (!sale) continue; const newStartDate = format(addDays(parseISO(sale.start_date), daysDiff), 'yyyy-MM-dd'); const newEndDate = format(addDays(parseISO(sale.end_date), daysDiff), 'yyyy-MM-dd'); const { error } = await supabase.from('sales').update({ start_date: newStartDate, end_date: newEndDate }).eq('id', saleId); if (error) throw error } }
      catch (err: unknown) { const errorMessage = err instanceof Error ? err.message : 'Failed to update sales'; console.error('Error bulk updating sales:', err); setError(errorMessage); await fetchSales() }
      return
    }
    const dbUpdates: Partial<Sale> = {}
    if (updates.discount_percentage !== undefined) { dbUpdates.discount_percentage = updates.discount_percentage === null ? undefined : updates.discount_percentage }
    if (updates.platform_id !== undefined) dbUpdates.platform_id = updates.platform_id
    if (updates.sale_name !== undefined) dbUpdates.sale_name = updates.sale_name || undefined
    if (updates.status !== undefined) dbUpdates.status = updates.status as SaleStatus
    setSales(prev => prev.map(sale => { if (!saleIds.includes(sale.id)) return sale; return { ...sale, ...dbUpdates } as SaleWithDetails }))
    try { for (const saleId of saleIds) { const { error } = await supabase.from('sales').update(dbUpdates).eq('id', saleId); if (error) throw error }; if (updates.platform_id) { await fetchSales() } }
    catch (err: unknown) { const errorMessage = err instanceof Error ? err.message : 'Failed to update sales'; console.error('Error bulk updating sales:', err); setError(errorMessage); await fetchSales() }
  }, [sales])

  const handleBulkDelete = useCallback(async (saleIds: string[]) => {
    setSales(prev => prev.filter(sale => !saleIds.includes(sale.id)))
    try { for (const saleId of saleIds) { const { error } = await supabase.from('sales').delete().eq('id', saleId); if (error) throw error } }
    catch (err: unknown) { const errorMessage = err instanceof Error ? err.message : 'Failed to delete sales'; console.error('Error bulk deleting sales:', err); setError(errorMessage); await fetchSales() }
  }, [])

  const handleBulkImport = useCallback(async (salesToCreate: Omit<Sale, 'id' | 'created_at'>[]) => {
    try {
      const { data, error } = await supabase.from('sales').insert(salesToCreate).select(`*, product:products(*, game:games(*, client:clients(*))), platform:platforms(*)`)
      if (error) throw error
      if (data && data.length > 0) { setSales(prev => [...prev, ...data].sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())); pushAction({ type: 'BATCH_CREATE_SALES', sales: data.map(s => ({ id: s.id, data: salesToCreate.find(sc => sc.product_id === s.product_id && sc.start_date === s.start_date && sc.platform_id === s.platform_id) as Record<string, unknown> })) }) }
    } catch (err: unknown) { const errorMessage = err instanceof Error ? err.message : 'Failed to import sales'; console.error('Error importing sales:', err); throw new Error(errorMessage) }
  }, [pushAction])

  const handleDuplicateSales = useCallback(async (salesToCreate: Omit<Sale, 'id' | 'created_at'>[]) => {
    try {
      const { data, error } = await supabase.from('sales').insert(salesToCreate).select(`*, product:products(*, game:games(*, client:clients(*))), platform:platforms(*)`)
      if (error) throw error
      if (data && data.length > 0) { setSales(prev => [...prev, ...data].sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())); pushAction({ type: 'BATCH_CREATE_SALES', sales: data.map(s => ({ id: s.id, data: salesToCreate.find(sc => sc.product_id === s.product_id && sc.start_date === s.start_date && sc.platform_id === s.platform_id) as Record<string, unknown> })) }) }
    } catch (err: unknown) { const errorMessage = err instanceof Error ? err.message : 'Failed to duplicate sales'; console.error('Error duplicating sales:', err); throw new Error(errorMessage) }
  }, [pushAction])

  const handleRestoreVersion = useCallback(async (salesSnapshot: SaleSnapshot[]) => {
    const currentSaleIds = sales.map(s => s.id)
    try {
      for (const id of currentSaleIds) { const { error } = await supabase.from('sales').delete().eq('id', id); if (error) throw error }
      if (salesSnapshot.length > 0) { const salesToCreate = salesSnapshot.map(s => ({ product_id: s.product_id, platform_id: s.platform_id, start_date: s.start_date, end_date: s.end_date, discount_percentage: s.discount_percentage, sale_name: s.sale_name, sale_type: s.sale_type, status: s.status, notes: s.notes })); const { error } = await supabase.from('sales').insert(salesToCreate); if (error) throw error }
      await fetchSales()
    } catch (err: unknown) { const errorMessage = err instanceof Error ? err.message : 'Failed to restore version'; console.error('Error restoring version:', err); setError(errorMessage); await fetchSales(); throw new Error(errorMessage) }
  }, [sales])

  const handleSaleEdit = useCallback((sale: SaleWithDetails) => { setEditingSale(sale) }, [])
  const handleSaleDuplicate = useCallback((sale: SaleWithDetails) => { setDuplicatingSale(sale) }, [])

  const handleTimelineCreate = useCallback(async (prefill: SalePrefill) => {
    if (prefill.directCreate) { const newSale: Omit<Sale, 'id' | 'created_at'> = { product_id: prefill.productId, platform_id: prefill.platformId, start_date: prefill.startDate, end_date: prefill.endDate, sale_name: prefill.saleName, discount_percentage: prefill.discountPercentage, sale_type: (prefill.saleType || 'regular') as Sale['sale_type'], status: 'planned' }; await handleSaleCreate(newSale); return }
    setSalePrefill(prefill); setShowAddModal(true)
  }, [])

  const handleCloseAddModal = useCallback(() => { setShowAddModal(false); setSalePrefill(null) }, [])
  const handleGenerateCalendar = useCallback((productId: string, productName: string, launchDate?: string) => { const effectiveLaunchDate = launchDate || format(new Date(), 'yyyy-MM-dd'); setCalendarGeneration({ productId, productName, launchDate: effectiveLaunchDate }) }, [])

  const handleApplyCalendar = useCallback(async (generatedSales: GeneratedSale[]) => {
    setIsApplyingCalendar(true); setError(null)
    try {
      const salesToCreate = generatedSales.map(sale => generatedSaleToCreateFormat(sale))
      const { data, error } = await supabase.from('sales').insert(salesToCreate).select(`*, product:products(*, game:games(*, client:clients(*))), platform:platforms(*)`)
      if (error) throw error
      if (data && data.length > 0) { setSales(prev => [...prev, ...data].sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())); pushAction({ type: 'BATCH_CREATE_SALES', sales: data.map(s => ({ id: s.id, data: salesToCreate.find(sc => sc.product_id === s.product_id && sc.start_date === s.start_date) as Record<string, unknown> })) }) }
      setCalendarGeneration(null)
    } catch (err: unknown) { const errorMessage = err instanceof Error ? err.message : 'Failed to create sales'; console.error('Error creating calendar sales:', err); setError(errorMessage) }
    finally { setIsApplyingCalendar(false) }
  }, [pushAction])

  const handleClearSales = useCallback((productId: string, productName: string) => { setClearSalesState({ productId, productName }) }, [])

  const handleConfirmClearSales = useCallback(async (productId: string, platformId: string | null) => {
    const salesToDelete = sales.filter(s => s.product_id === productId && (platformId === null || s.platform_id === platformId))
    if (salesToDelete.length === 0) { setClearSalesState(null); return }
    const saleDataList = salesToDelete.map(s => ({ id: s.id, data: { product_id: s.product_id, platform_id: s.platform_id, start_date: s.start_date, end_date: s.end_date, discount_percentage: s.discount_percentage, sale_name: s.sale_name, sale_type: s.sale_type, status: s.status, notes: s.notes } as Record<string, unknown> }))
    setSales(prev => prev.filter(s => !(s.product_id === productId && (platformId === null || s.platform_id === platformId))))
    try { for (const sale of salesToDelete) { const { error } = await supabase.from('sales').delete().eq('id', sale.id); if (error) throw error }; pushAction({ type: 'BATCH_DELETE_SALES', sales: saleDataList }); setClearSalesState(null) }
    catch (err: unknown) { const errorMessage = err instanceof Error ? err.message : 'Failed to delete sales'; console.error('Error clearing sales:', err); setError(errorMessage); await fetchSales() }
  }, [sales, pushAction])

  const handleLaunchDateChange = useCallback(async (productId: string, newLaunchDate: string) => {
    const product = products.find(p => p.id === productId); if (!product) return
    const oldLaunchDate = product.launch_date; if (!oldLaunchDate || oldLaunchDate === newLaunchDate) return
    const oldDate = parseISO(oldLaunchDate); const newDate = parseISO(newLaunchDate); const daysDiff = Math.round((newDate.getTime() - oldDate.getTime()) / (1000 * 60 * 60 * 24)); if (daysDiff === 0) return
    const productSales = sales.filter(s => s.product_id === productId)
    setProducts(prev => prev.map(p => p.id === productId ? { ...p, launch_date: newLaunchDate } : p))
    const updatedSales = productSales.map(sale => { const newStartDate = new Date(parseISO(sale.start_date).getTime() + daysDiff * 24 * 60 * 60 * 1000); const newEndDate = new Date(parseISO(sale.end_date).getTime() + daysDiff * 24 * 60 * 60 * 1000); return { ...sale, start_date: format(newStartDate, 'yyyy-MM-dd'), end_date: format(newEndDate, 'yyyy-MM-dd') } })
    setSales(prev => prev.map(sale => { const updated = updatedSales.find(u => u.id === sale.id); return updated || sale }))
    try { const { error: productError } = await supabase.from('products').update({ launch_date: newLaunchDate }).eq('id', productId); if (productError) throw productError; for (const sale of updatedSales) { const { error: saleError } = await supabase.from('sales').update({ start_date: sale.start_date, end_date: sale.end_date }).eq('id', sale.id); if (saleError) throw saleError } }
    catch (err: unknown) { const errorMessage = err instanceof Error ? err.message : 'Failed to update launch date'; console.error('Error updating launch date:', err); setError(errorMessage); await fetchData() }
  }, [products, sales])

  const handleEditLaunchDate = useCallback((productId: string, productName: string, currentLaunchDate: string, currentLaunchSaleDuration?: number) => { setEditLaunchDateState({ productId, productName, currentLaunchDate, currentLaunchSaleDuration }) }, [])

  const handleLaunchSaleDurationChange = useCallback(async (productId: string, newDuration: number) => {
    const product = products.find(p => p.id === productId); if (!product) return
    setProducts(prev => prev.map(p => p.id === productId ? { ...p, launch_sale_duration: newDuration } : p))
    try { const { error } = await supabase.from('products').update({ launch_sale_duration: newDuration }).eq('id', productId); if (error) throw error }
    catch (err: unknown) { const errorMessage = err instanceof Error ? err.message : 'Failed to update launch sale duration'; console.error('Error updating launch sale duration:', err); setError(errorMessage); await fetchData() }
  }, [products])

  const handleSaveLaunchDate = useCallback(async (productId: string, newLaunchDate: string, launchSaleDuration: number, shiftSales: boolean) => {
    const product = products.find(p => p.id === productId); if (!product) return
    const productUpdate: { launch_date: string; launch_sale_duration?: number } = { launch_date: newLaunchDate }
    if (launchSaleDuration !== (product.launch_sale_duration || 7)) { productUpdate.launch_sale_duration = launchSaleDuration }
    if (shiftSales) {
      const oldLaunchDate = product.launch_date
      if (oldLaunchDate && oldLaunchDate !== newLaunchDate) {
        const oldDate = parseISO(oldLaunchDate); const newDate = parseISO(newLaunchDate); const daysDiff = Math.round((newDate.getTime() - oldDate.getTime()) / (1000 * 60 * 60 * 24))
        if (daysDiff !== 0) {
          const productSales = sales.filter(s => s.product_id === productId)
          setProducts(prev => prev.map(p => p.id === productId ? { ...p, ...productUpdate } : p))
          const updatedSales = productSales.map(sale => { const newStartDate = new Date(parseISO(sale.start_date).getTime() + daysDiff * 24 * 60 * 60 * 1000); const newEndDate = new Date(parseISO(sale.end_date).getTime() + daysDiff * 24 * 60 * 60 * 1000); return { ...sale, start_date: format(newStartDate, 'yyyy-MM-dd'), end_date: format(newEndDate, 'yyyy-MM-dd') } })
          setSales(prev => prev.map(sale => { const updated = updatedSales.find(u => u.id === sale.id); return updated || sale }))
          try { const { error: productError } = await supabase.from('products').update(productUpdate).eq('id', productId); if (productError) throw productError; for (const sale of updatedSales) { const { error: saleError } = await supabase.from('sales').update({ start_date: sale.start_date, end_date: sale.end_date }).eq('id', sale.id); if (saleError) throw saleError } }
          catch (err: unknown) { const errorMessage = err instanceof Error ? err.message : 'Failed to update launch date'; console.error('Error updating launch date:', err); setError(errorMessage); await fetchData() }
        }
      }
    } else {
      setProducts(prev => prev.map(p => p.id === productId ? { ...p, ...productUpdate } : p))
      try { const { error } = await supabase.from('products').update(productUpdate).eq('id', productId); if (error) throw error }
      catch (err: unknown) { const errorMessage = err instanceof Error ? err.message : 'Failed to update launch date'; console.error('Error updating launch date:', err); setError(errorMessage); await fetchData() }
    }
    setEditLaunchDateState(null)
  }, [products, sales])

  async function handleClientCreate(client: Omit<Client, 'id' | 'created_at'>) { try { const { data, error } = await supabase.from('clients').insert([client]).select().single(); if (error) throw error; if (data) setClients(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name))) } catch (err: unknown) { console.error('Error creating client:', err); throw err } }
  async function handleGameCreate(game: Omit<Game, 'id' | 'created_at'>) { try { const { data, error } = await supabase.from('games').insert([game]).select(`*, client:clients(*)`).single(); if (error) throw error; if (data) setGames(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name))) } catch (err: unknown) { console.error('Error creating game:', err); throw err } }
  async function handleProductCreate(product: Omit<Product, 'id' | 'created_at'>): Promise<Product | undefined> { try { const { data, error } = await supabase.from('products').insert([product]).select(`*, game:games(*, client:clients(*))`).single(); if (error) throw error; if (data) { setProducts(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name))); return data } } catch (err: unknown) { console.error('Error creating product:', err); throw err } }

  async function handleClientUpdate(clientId: string, updates: Partial<Client>) { try { const { error } = await supabase.from('clients').update(updates).eq('id', clientId); if (error) throw error; setClients(prev => prev.map(c => c.id === clientId ? { ...c, ...updates } : c).sort((a, b) => a.name.localeCompare(b.name))); if (updates.name) { setGames(prev => prev.map(g => g.client_id === clientId ? { ...g, client: { ...g.client, ...updates } } : g)); setProducts(prev => prev.map(p => p.game?.client_id === clientId ? { ...p, game: { ...p.game, client: { ...p.game.client, ...updates } } } : p)) } } catch (err: unknown) { console.error('Error updating client:', err); throw err } }
  async function handleGameUpdate(gameId: string, updates: Partial<Game>) { try { const { data, error } = await supabase.from('games').update(updates).eq('id', gameId).select(`*, client:clients(*)`).single(); if (error) throw error; if (data) { setGames(prev => prev.map(g => g.id === gameId ? data : g).sort((a, b) => a.name.localeCompare(b.name))); setProducts(prev => prev.map(p => p.game_id === gameId ? { ...p, game: data } : p)) } } catch (err: unknown) { console.error('Error updating game:', err); throw err } }
  async function handleProductUpdate(productId: string, updates: Partial<Product>) { try { const { data, error } = await supabase.from('products').update(updates).eq('id', productId).select(`*, game:games(*, client:clients(*))`).single(); if (error) throw error; if (data) { setProducts(prev => prev.map(p => p.id === productId ? data : p).sort((a, b) => a.name.localeCompare(b.name))) } } catch (err: unknown) { console.error('Error updating product:', err); throw err } }

  async function handleClientDelete(clientId: string) { try { const { error } = await supabase.from('clients').delete().eq('id', clientId); if (error) throw error; if (filterClientId === clientId) setFilterClientId(''); setClients(prev => prev.filter(c => c.id !== clientId)); const deletedGameIds = games.filter(g => g.client_id === clientId).map(g => g.id); setGames(prev => prev.filter(g => g.client_id !== clientId)); setProducts(prev => prev.filter(p => !deletedGameIds.includes(p.game_id))); setSales(prev => prev.filter(s => !deletedGameIds.includes(s.product?.game_id || ''))) } catch (err: unknown) { console.error('Error deleting client:', err); throw err } }
  async function handleGameDelete(gameId: string) { try { const { error } = await supabase.from('games').delete().eq('id', gameId); if (error) throw error; if (filterGameId === gameId) setFilterGameId(''); setGames(prev => prev.filter(g => g.id !== gameId)); const deletedProductIds = products.filter(p => p.game_id === gameId).map(p => p.id); setProducts(prev => prev.filter(p => p.game_id !== gameId)); setSales(prev => prev.filter(s => !deletedProductIds.includes(s.product_id))) } catch (err: unknown) { console.error('Error deleting game:', err); throw err } }
  async function handleProductDelete(productId: string) { try { const { error } = await supabase.from('products').delete().eq('id', productId); if (error) throw error; setProducts(prev => prev.filter(p => p.id !== productId)); setSales(prev => prev.filter(s => s.product_id !== productId)) } catch (err: unknown) { console.error('Error deleting product:', err); throw err } }

  const filteredGames = useMemo(() => { if (!filterClientId) return games; return games.filter(g => g.client_id === filterClientId) }, [games, filterClientId])
  const filteredProducts = useMemo(() => { let result = products; if (filterGameId) { result = result.filter(p => p.game_id === filterGameId) } else if (filterClientId) { result = result.filter(p => p.game?.client_id === filterClientId) }; return result }, [products, filterClientId, filterGameId])
  const filteredSales = useMemo(() => { let result = sales; if (filterGameId) { result = result.filter(s => s.product?.game_id === filterGameId) } else if (filterClientId) { result = result.filter(s => s.product?.game?.client_id === filterClientId) }; return result }, [sales, filterClientId, filterGameId])

  const { conflicts, conflictDetails } = useMemo(() => {
    const conflictList: ConflictInfo[] = []
    const steamPlatformIds = platforms.filter(p => p.name.toLowerCase().includes('steam')).map(p => p.id)
    if (steamPlatformIds.length === 0) { return { conflicts: 0, conflictDetails: [] } }
    const steamSeasonalEvents = platformEvents.filter(e => steamPlatformIds.includes(e.platform_id) && e.event_type === 'seasonal')
    for (const product of filteredProducts) {
      if (!product.launch_date) continue
      const duration = product.launch_sale_duration || 7; const launchStart = normalizeToLocalDate(product.launch_date); const launchEnd = addDays(launchStart, duration - 1)
      for (const event of steamSeasonalEvents) {
        const eventStart = normalizeToLocalDate(event.start_date); const eventEnd = normalizeToLocalDate(event.end_date)
        if (launchStart <= eventEnd && launchEnd >= eventStart) { const overlapStart = launchStart > eventStart ? launchStart : eventStart; const overlapEnd = launchEnd < eventEnd ? launchEnd : eventEnd; const overlapDays = Math.round((overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24)) + 1; conflictList.push({ productName: product.name, eventName: event.name, overlapDays }) }
      }
    }
    return { conflicts: conflictList.length, conflictDetails: conflictList }
  }, [filteredProducts, platforms, platformEvents])

  const { upcomingEventsCount, upcomingEventDetails } = useMemo(() => {
    const now = new Date(); const upcoming = platformEvents.filter(e => new Date(e.start_date) > now)
    const details = upcoming.sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime()).map(e => { const platform = platforms.find(p => p.id === e.platform_id); return { label: e.name, sublabel: format(normalizeToLocalDate(e.start_date), 'MMM d, yyyy'), color: platform?.color_hex || '#8b5cf6' } })
    return { upcomingEventsCount: upcoming.length, upcomingEventDetails: details }
  }, [platformEvents, platforms])

  const now = new Date(); const timelineStart = new Date(now.getFullYear(), now.getMonth(), 1); const monthCount = 12

  useEffect(() => { if (filterClientId && filterGameId) { const game = games.find(g => g.id === filterGameId); if (game && game.client_id !== filterClientId) { setFilterGameId('') } } }, [filterClientId, filterGameId, games])

  if (loading) { return (<div className={styles.container}><div className={styles.loading}><div className={styles.spinner}></div><p>Loading sales data...</p></div></div>) }

  return (
    <div className={styles.container}>
      <header className={styles.header}><h1>GameDrive Sales Planning</h1><p>Interactive sales timeline with drag-and-drop scheduling</p></header>

      <PageToggle />

      {error && (<div className={styles.errorBanner}><span>Warning: {error}</span><button onClick={() => setError(null)}>×</button></div>)}

      <div className={styles.statsGrid}>
        <StatCard icon="📊" iconColor="#10b981" title="TOTAL SALES" value={filteredSales.length} subtitle="Across all platforms" />
        <StatCard icon="🎮" iconColor="#3b82f6" title="PRODUCTS" value={filteredProducts.length} subtitle="Games and DLCs" />
        <StatCard icon="📅" iconColor="#8b5cf6" title="PLATFORM EVENTS" value={upcomingEventsCount} subtitle="Upcoming sales events" tooltipTitle="Upcoming Platform Events" tooltipItems={upcomingEventDetails} tooltipEmptyMessage="No upcoming platform events" />
        <StatCard icon={conflicts > 0 ? '⚠️' : '✅'} iconColor={conflicts > 0 ? '#ef4444' : '#22c55e'} title="CONFLICTS" value={conflicts} subtitle={conflicts === 0 ? 'All platforms clear' : 'Needs attention'} warning={conflicts > 0} tooltipTitle="Launch Sale Conflicts" tooltipItems={conflictDetails.map(c => ({ label: c.productName, sublabel: `${c.eventName} (${c.overlapDays}d overlap)`, warning: true }))} tooltipEmptyMessage="No conflicts detected" />
      </div>

      <GapAnalysis sales={filteredSales} products={filteredProducts} platforms={platforms} timelineStart={timelineStart} monthCount={monthCount} />

      <div className={styles.filters}>
        <div className={styles.filterGroup}><label>Client:</label><select value={filterClientId} onChange={(e) => setFilterClientId(e.target.value)}><option value="">All Clients</option>{clients.map(client => (<option key={client.id} value={client.id}>{client.name}</option>))}</select></div>
        <div className={styles.filterGroup}><label>Game:</label><select value={filterGameId} onChange={(e) => setFilterGameId(e.target.value)}><option value="">All Games</option>{filteredGames.map(game => (<option key={game.id} value={game.id}>{game.name}</option>))}</select></div>
        <div className={styles.filterGroup}><label className={styles.checkboxLabel}><input type="checkbox" checked={showEvents} onChange={(e) => setShowEvents(e.target.checked)} />Show Platform Events</label></div>
        {(filterClientId || filterGameId) && (<button className={styles.clearFilters} onClick={() => { setFilterClientId(''); setFilterGameId(''); }}>Clear Filters</button>)}
      </div>

      <div className={styles.toolbar}>
        <div className={styles.viewToggle}><button className={`${styles.toggleBtn} ${viewMode === 'gantt' ? styles.active : ''}`} onClick={() => setViewMode('gantt')}>Timeline</button><button className={`${styles.toggleBtn} ${viewMode === 'table' ? styles.active : ''}`} onClick={() => setViewMode('table')}>Table</button></div>
        <div className={styles.actions}><button className={styles.primaryBtn} onClick={() => setShowAddModal(true)}>+ Add Sale</button><button className={styles.secondaryBtn} onClick={() => setShowImportModal(true)}>Import CSV</button><button className={styles.secondaryBtn} onClick={() => setShowVersionManager(true)}>📚 Versions</button><button className={styles.secondaryBtn} onClick={() => setShowProductManager(true)}>Manage Products</button><button className={styles.secondaryBtn} onClick={() => setShowPlatformSettings(true)}>Platform Settings</button><button className={styles.secondaryBtn} onClick={() => setShowExportModal(true)}>Export</button><button className={styles.secondaryBtn} onClick={fetchData}>Refresh</button></div>
      </div>

      <div className={styles.mainContent}>
        {viewMode === 'gantt' ? (<GanttChart sales={filteredSales} products={filteredProducts} platforms={platforms} platformEvents={platformEvents} timelineStart={timelineStart} monthCount={monthCount} onSaleUpdate={handleSaleUpdate} onSaleDelete={handleSaleDelete} onSaleEdit={handleSaleEdit} onSaleDuplicate={handleSaleDuplicate} onCreateSale={handleTimelineCreate} onGenerateCalendar={handleGenerateCalendar} onClearSales={handleClearSales} onLaunchDateChange={handleLaunchDateChange} onEditLaunchDate={handleEditLaunchDate} onLaunchSaleDurationChange={handleLaunchSaleDurationChange} allSales={sales} showEvents={showEvents} />) : (<SalesTable sales={filteredSales} platforms={platforms} onDelete={handleSaleDelete} onEdit={handleSaleEdit} onDuplicate={handleSaleDuplicate} onBulkEdit={handleBulkEdit} />)}
      </div>

      {showAddModal && (<AddSaleModal products={products} platforms={platforms} existingSales={sales} onSave={handleSaleCreate} onClose={handleCloseAddModal} initialDate={salePrefill ? parseISO(salePrefill.startDate) : undefined} initialEndDate={salePrefill ? parseISO(salePrefill.endDate) : undefined} initialProductId={salePrefill?.productId} initialPlatformId={salePrefill?.platformId} />)}
      {editingSale && (<EditSaleModal sale={editingSale} products={products} platforms={platforms} existingSales={sales} onSave={handleSaleUpdate} onDelete={handleSaleDelete} onDuplicate={handleSaleDuplicate} onClose={() => setEditingSale(null)} />)}
      {duplicatingSale && (<DuplicateSaleModal sale={duplicatingSale} products={products} platforms={platforms} existingSales={sales} onDuplicate={handleDuplicateSales} onClose={() => setDuplicatingSale(null)} />)}
      <BulkEditSalesModal isOpen={bulkEditSales.length > 0} onClose={() => setBulkEditSales([])} selectedSales={bulkEditSales} platforms={platforms} onBulkUpdate={handleBulkUpdate} onBulkDelete={handleBulkDelete} />
      <ImportSalesModal isOpen={showImportModal} onClose={() => setShowImportModal(false)} products={products} platforms={platforms} existingSales={sales} onImport={handleBulkImport} />
      <VersionManager isOpen={showVersionManager} onClose={() => setShowVersionManager(false)} currentSales={sales} platforms={platforms} onRestoreVersion={handleRestoreVersion} />
      {showProductManager && (<ProductManager clients={clients} games={games} products={products} onClientCreate={handleClientCreate} onGameCreate={handleGameCreate} onProductCreate={handleProductCreate} onClientDelete={handleClientDelete} onGameDelete={handleGameDelete} onProductDelete={handleProductDelete} onClientUpdate={handleClientUpdate} onGameUpdate={handleGameUpdate} onProductUpdate={handleProductUpdate} onGenerateCalendar={handleGenerateCalendar} onClose={() => setShowProductManager(false)} />)}
      <PlatformSettings isOpen={showPlatformSettings} onClose={() => setShowPlatformSettings(false)} onEventsChange={() => { fetchPlatformEvents(); fetchData() }} />
      {calendarGeneration && (<SaleCalendarPreviewModal isOpen={true} onClose={() => setCalendarGeneration(null)} productId={calendarGeneration.productId} productName={calendarGeneration.productName} launchDate={calendarGeneration.launchDate} platforms={platforms} platformEvents={platformEvents} existingSales={sales} onApply={handleApplyCalendar} isApplying={isApplyingCalendar} />)}
      {clearSalesState && (<ClearSalesModal isOpen={true} onClose={() => setClearSalesState(null)} productId={clearSalesState.productId} productName={clearSalesState.productName} platforms={platforms} sales={sales} onConfirm={handleConfirmClearSales} />)}
      {editLaunchDateState && (<EditLaunchDateModal isOpen={true} onClose={() => setEditLaunchDateState(null)} productId={editLaunchDateState.productId} productName={editLaunchDateState.productName} currentLaunchDate={editLaunchDateState.currentLaunchDate} currentLaunchSaleDuration={editLaunchDateState.currentLaunchSaleDuration || 7} onSave={handleSaveLaunchDate} salesCount={sales.filter(s => s.product_id === editLaunchDateState.productId).length} platforms={platforms} platformEvents={platformEvents} />)}
      <TimelineExportModal isOpen={showExportModal} onClose={() => setShowExportModal(false)} sales={filteredSales} products={filteredProducts} platforms={platforms} timelineStart={timelineStart} monthCount={monthCount} calendarVariations={lastGeneratedVariations} />
    </div>
  )
}
