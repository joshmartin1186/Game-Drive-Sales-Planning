'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Sale, Platform, Product, Game, Client, SaleWithDetails, TimelineEvent } from '@/lib/types'
import GanttChart from '../components/GanttChart'
import SalesTable from '../components/SalesTable'
import AddSaleModal from '../components/AddSaleModal'
import styles from './planning.module.css'

export default function PlanningPage() {
  const [sales, setSales] = useState<SaleWithDetails[]>([])
  const [platforms, setPlatforms] = useState<Platform[]>([])
  const [products, setProducts] = useState<(Product & { game: Game & { client: Client } })[]>([])
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [selectedClient, setSelectedClient] = useState<string>('all')
  const [clients, setClients] = useState<Client[]>([])
  
  // Timeline configuration
  const [timelineStart] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [monthCount] = useState(6) // Show 6 months initially
  
  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      
      // Fetch platforms
      const { data: platformsData, error: platformsError } = await supabase
        .from('platforms')
        .select('*')
        .order('name')
      
      if (platformsError) throw platformsError
      setPlatforms(platformsData || [])
      
      // Fetch clients
      const { data: clientsData, error: clientsError } = await supabase
        .from('clients')
        .select('*')
        .order('name')
      
      if (clientsError) throw clientsError
      setClients(clientsData || [])
      
      // Fetch products with game and client info
      const { data: productsData, error: productsError } = await supabase
        .from('products')
        .select(`
          *,
          game:games (
            *,
            client:clients (*)
          )
        `)
        .order('name')
      
      if (productsError) throw productsError
      setProducts(productsData || [])
      
      // Fetch sales with product and platform info
      const { data: salesData, error: salesError } = await supabase
        .from('sales')
        .select(`
          *,
          product:products (
            *,
            game:games (
              *,
              client:clients (*)
            )
          ),
          platform:platforms (*)
        `)
        .order('start_date')
      
      if (salesError) throw salesError
      setSales(salesData || [])
      
    } catch (err) {
      console.error('Error fetching data:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch data')
    } finally {
      setLoading(false)
    }
  }, [])
  
  useEffect(() => {
    fetchData()
  }, [fetchData])
  
  const handleSaleUpdate = async (saleId: string, updates: Partial<Sale>) => {
    try {
      const { error } = await supabase
        .from('sales')
        .update(updates)
        .eq('id', saleId)
      
      if (error) throw error
      
      // Refresh data
      await fetchData()
    } catch (err) {
      console.error('Error updating sale:', err)
      setError(err instanceof Error ? err.message : 'Failed to update sale')
    }
  }
  
  const handleSaleCreate = async (sale: Omit<Sale, 'id' | 'created_at'>) => {
    try {
      const { error } = await supabase
        .from('sales')
        .insert([sale])
      
      if (error) throw error
      
      setShowAddModal(false)
      await fetchData()
    } catch (err) {
      console.error('Error creating sale:', err)
      setError(err instanceof Error ? err.message : 'Failed to create sale')
    }
  }
  
  const handleSaleDelete = async (saleId: string) => {
    if (!confirm('Are you sure you want to delete this sale?')) return
    
    try {
      const { error } = await supabase
        .from('sales')
        .delete()
        .eq('id', saleId)
      
      if (error) throw error
      
      await fetchData()
    } catch (err) {
      console.error('Error deleting sale:', err)
      setError(err instanceof Error ? err.message : 'Failed to delete sale')
    }
  }
  
  // Filter products and sales by selected client
  const filteredProducts = selectedClient === 'all' 
    ? products 
    : products.filter(p => p.game?.client?.id === selectedClient)
  
  const filteredSales = selectedClient === 'all'
    ? sales
    : sales.filter(s => s.product?.game?.client?.id === selectedClient)
  
  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <div className={styles.spinner}></div>
          <p>Loading planning data...</p>
        </div>
      </div>
    )
  }
  
  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <h1>Sales Planning</h1>
          <p className={styles.subtitle}>Drag and drop to schedule sales</p>
        </div>
        <div className={styles.headerRight}>
          <select 
            className={styles.clientFilter}
            value={selectedClient}
            onChange={(e) => setSelectedClient(e.target.value)}
          >
            <option value="all">All Clients</option>
            {clients.map(client => (
              <option key={client.id} value={client.id}>{client.name}</option>
            ))}
          </select>
          <button 
            className={styles.addButton}
            onClick={() => setShowAddModal(true)}
          >
            + Add Sale
          </button>
        </div>
      </header>
      
      {error && (
        <div className={styles.errorBanner}>
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}
      
      <div className={styles.ganttSection}>
        <GanttChart
          sales={filteredSales}
          products={filteredProducts}
          platforms={platforms}
          events={events}
          timelineStart={timelineStart}
          monthCount={monthCount}
          onSaleUpdate={handleSaleUpdate}
          onSaleDelete={handleSaleDelete}
          allSales={sales} // For validation across all clients
        />
      </div>
      
      <div className={styles.tableSection}>
        <h2>Sales Schedule</h2>
        <SalesTable
          sales={filteredSales}
          platforms={platforms}
          onDelete={handleSaleDelete}
        />
      </div>
      
      {showAddModal && (
        <AddSaleModal
          products={filteredProducts}
          platforms={platforms}
          existingSales={sales}
          onSave={handleSaleCreate}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  )
}
