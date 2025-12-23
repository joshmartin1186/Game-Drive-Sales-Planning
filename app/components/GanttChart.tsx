'use client'

import { useState, useEffect } from 'react'
import { DndContext, DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { format, addMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, differenceInDays } from 'date-fns'

// Types
interface Platform {
  id: string
  name: string
  color: string
  cooldownDays: number
}

interface Product {
  id: string
  name: string
  gameId: string
  gameName: string
}

interface Sale {
  id: string
  productId: string
  platformId: string
  startDate: Date
  endDate: Date
  discountPercentage: number
  saleName: string
  status: 'planned' | 'submitted' | 'confirmed' | 'live' | 'ended'
}

// Platform configurations matching GameDrive requirements
const platforms: Platform[] = [
  { id: 'steam', name: 'Steam', color: '#1b2838', cooldownDays: 30 },
  { id: 'playstation', name: 'PlayStation', color: '#0070d1', cooldownDays: 42 },
  { id: 'xbox', name: 'Xbox', color: '#107c10', cooldownDays: 28 },
  { id: 'nintendo', name: 'Nintendo', color: '#e60012', cooldownDays: 56 },
  { id: 'epic', name: 'Epic', color: '#000000', cooldownDays: 14 }
]

// Sample products (will be loaded from Supabase in production)
const sampleProducts: Product[] = [
  { id: '1', name: 'shapez', gameId: 'game1', gameName: 'shapez' },
  { id: '2', name: 'shapez - Puzzle DLC', gameId: 'game1', gameName: 'shapez' },
  { id: '3', name: 'shapez 2', gameId: 'game2', gameName: 'shapez 2' },
  { id: '4', name: 'Tricky Towers', gameId: 'game3', gameName: 'Tricky Towers' },
  { id: '5', name: 'WeirdBeard Game', gameId: 'game4', gameName: 'WeirdBeard Game' }
]

// Draggable Sale Block Component
function SaleBlock({ sale, platforms, onEdit }: { 
  sale: Sale
  platforms: Platform[]
  onEdit: (sale: Sale) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: sale.id })

  const platform = platforms.find(p => p.id === sale.platformId)
  const duration = differenceInDays(sale.endDate, sale.startDate) + 1

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    backgroundColor: platform?.color || '#gray',
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onEdit(sale)}
      className="absolute cursor-grab active:cursor-grabbing"
      title={`${sale.saleName} - ${sale.discountPercentage}% off for ${duration} days`}
    >
      {/* Angled sale block - key visual requirement */}
      <div className="relative">
        <svg 
          width="100" 
          height="20" 
          viewBox="0 0 100 20"
          className="drop-shadow-sm"
        >
          {/* Angled/diamond shape instead of rectangle */}
          <polygon 
            points="8,2 92,2 96,10 92,18 8,18 4,10"
            fill={platform?.color}
            stroke="rgba(255,255,255,0.2)"
            strokeWidth="1"
          />
          <text 
            x="50" 
            y="12" 
            textAnchor="middle" 
            fontSize="10" 
            fill="white"
            fontWeight="500"
          >
            {sale.discountPercentage}%
          </text>
        </svg>
        
        {/* Status indicator */}
        <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-white">
          <div className={`w-full h-full rounded-full ${
            sale.status === 'confirmed' ? 'bg-green-500' :
            sale.status === 'submitted' ? 'bg-yellow-500' :
            'bg-gray-400'
          }`} />
        </div>
      </div>
    </div>
  )
}

// Timeline Header Component
function TimelineHeader() {
  const now = new Date()
  const months = Array.from({ length: 12 }, (_, i) => addMonths(startOfMonth(now), i))

  return (
    <div className="flex border-b bg-gray-50">
      <div className="w-48 flex-shrink-0 p-3 border-r bg-white">
        <span className="font-semibold text-sm">Products</span>
      </div>
      <div className="flex-1 flex">
        {months.map((month, index) => (
          <div 
            key={month.toISOString()}
            className="flex-1 p-3 border-r border-gray-200 text-center"
          >
            <div className="font-medium text-sm">
              {format(month, 'MMM yyyy')}
            </div>
            {/* Week indicators */}
            <div className="mt-1 flex justify-between text-xs text-gray-500">
              <span>1</span>
              <span>2</span>
              <span>3</span>
              <span>4</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Product Row Component
function ProductRow({ 
  product, 
  sales, 
  platforms,
  onSaleEdit,
  onSaleCreate 
}: {
  product: Product
  sales: Sale[]
  platforms: Platform[]
  onSaleEdit: (sale: Sale) => void
  onSaleCreate: (productId: string, date: Date) => void
}) {
  const productSales = sales.filter(sale => sale.productId === product.id)

  return (
    <div className="flex border-b hover:bg-gray-50">
      {/* Product info */}
      <div className="w-48 flex-shrink-0 p-3 border-r">
        <div className="font-medium text-sm">{product.name}</div>
        <div className="text-xs text-gray-500">{product.gameName}</div>
      </div>

      {/* Timeline area */}
      <div className="flex-1 relative h-16 bg-white">
        {/* Month grid lines */}
        <div className="absolute inset-0 flex">
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className="flex-1 border-r border-gray-100" />
          ))}
        </div>

        {/* Sales blocks */}
        {productSales.map((sale) => (
          <SaleBlock 
            key={sale.id}
            sale={sale}
            platforms={platforms}
            onEdit={onSaleEdit}
          />
        ))}

        {/* Click to add sale */}
        <div 
          className="absolute inset-0 cursor-pointer opacity-0 hover:opacity-100 hover:bg-blue-50 transition-opacity"
          onClick={(e) => {
            // Calculate approximate date based on click position
            const rect = e.currentTarget.getBoundingClientRect()
            const clickX = e.clientX - rect.left
            const monthIndex = Math.floor((clickX / rect.width) * 12)
            const clickDate = addMonths(startOfMonth(new Date()), monthIndex)
            onSaleCreate(product.id, clickDate)
          }}
        >
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs text-gray-500 bg-white px-2 py-1 rounded shadow">
              Click to add sale
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// Main Gantt Chart Component
export default function GanttChart() {
  const [sales, setSales] = useState<Sale[]>([])
  const [draggedSale, setDraggedSale] = useState<Sale | null>(null)
  const [editingSale, setEditingSale] = useState<Sale | null>(null)
  const [conflicts, setConflicts] = useState<string[]>([])

  // Sample sales data
  useEffect(() => {
    const now = new Date()
    const sampleSales: Sale[] = [
      {
        id: 'sale1',
        productId: '1',
        platformId: 'steam',
        startDate: addMonths(now, 1),
        endDate: addMonths(now, 1),
        discountPercentage: 50,
        saleName: 'Spring Sale',
        status: 'planned'
      },
      {
        id: 'sale2',
        productId: '3',
        platformId: 'playstation',
        startDate: addMonths(now, 2),
        endDate: addMonths(now, 2),
        discountPercentage: 30,
        saleName: 'Summer Kick-off',
        status: 'submitted'
      }
    ]
    setSales(sampleSales)
  }, [])

  // Conflict detection
  const detectConflicts = (newSale: Sale) => {
    const platform = platforms.find(p => p.id === newSale.platformId)
    if (!platform) return []

    const conflictingSales = sales.filter(existingSale => 
      existingSale.id !== newSale.id &&
      existingSale.productId === newSale.productId &&
      existingSale.platformId === newSale.platformId
    )

    const conflicts: string[] = []
    
    conflictingSales.forEach(existingSale => {
      const daysBetween = Math.abs(differenceInDays(newSale.startDate, existingSale.endDate))
      if (daysBetween < platform.cooldownDays) {
        conflicts.push(`Conflict with ${existingSale.saleName}: ${daysBetween} days between sales (${platform.cooldownDays} required)`)
      }
    })

    return conflicts
  }

  const handleDragStart = (event: DragStartEvent) => {
    const sale = sales.find(s => s.id === event.active.id)
    setDraggedSale(sale || null)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || !draggedSale) return

    // Calculate new position based on drop location
    // This would include date calculations based on grid position
    
    // For now, just detect conflicts
    const newConflicts = detectConflicts(draggedSale)
    setConflicts(newConflicts)

    if (newConflicts.length === 0) {
      // Update sale position
      setSales(prev => prev.map(sale => 
        sale.id === draggedSale.id ? { ...sale, /* updated dates */ } : sale
      ))
    }

    setDraggedSale(null)
  }

  const handleSaleCreate = (productId: string, date: Date) => {
    const newSale: Sale = {
      id: `sale_${Date.now()}`,
      productId,
      platformId: 'steam', // Default to Steam
      startDate: date,
      endDate: date, // Single day by default
      discountPercentage: 50,
      saleName: 'New Sale',
      status: 'planned'
    }
    
    setEditingSale(newSale)
  }

  return (
    <div className="border rounded-lg bg-white overflow-hidden">
      {/* Conflict warnings */}
      {conflicts.length > 0 && (
        <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Sale Conflicts Detected</h3>
              <ul className="mt-2 text-sm text-red-700 list-disc list-inside">
                {conflicts.map((conflict, index) => (
                  <li key={index}>{conflict}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Gantt Chart */}
      <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="overflow-x-auto">
          <TimelineHeader />
          
          <div className="min-w-full">
            {sampleProducts.map((product) => (
              <ProductRow
                key={product.id}
                product={product}
                sales={sales}
                platforms={platforms}
                onSaleEdit={setEditingSale}
                onSaleCreate={handleSaleCreate}
              />
            ))}
          </div>
        </div>
      </DndContext>

      {/* Platform Legend */}
      <div className="p-4 bg-gray-50 border-t">
        <div className="flex flex-wrap gap-4 text-sm">
          {platforms.map((platform) => (
            <div key={platform.id} className="flex items-center space-x-2">
              <div 
                className="w-4 h-4 rounded"
                style={{ backgroundColor: platform.color }}
              />
              <span>{platform.name}</span>
              <span className="text-gray-500">({platform.cooldownDays}d cooldown)</span>
            </div>
          ))}
        </div>
      </div>

      {/* Sale Edit Modal would go here */}
      {editingSale && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">
              {editingSale.id.startsWith('sale_') ? 'Create New Sale' : 'Edit Sale'}
            </h3>
            
            {/* Sale form would go here */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Sale Name</label>
                <input 
                  type="text" 
                  value={editingSale.saleName}
                  onChange={(e) => setEditingSale({...editingSale, saleName: e.target.value})}
                  className="w-full border rounded px-3 py-2"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Discount %</label>
                <input 
                  type="number" 
                  value={editingSale.discountPercentage}
                  onChange={(e) => setEditingSale({...editingSale, discountPercentage: parseInt(e.target.value)})}
                  className="w-full border rounded px-3 py-2"
                  min="0"
                  max="100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Platform</label>
                <select 
                  value={editingSale.platformId}
                  onChange={(e) => setEditingSale({...editingSale, platformId: e.target.value})}
                  className="w-full border rounded px-3 py-2"
                >
                  {platforms.map(platform => (
                    <option key={platform.id} value={platform.id}>
                      {platform.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end space-x-2 mt-6">
              <button 
                onClick={() => setEditingSale(null)}
                className="px-4 py-2 border rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  if (editingSale.id.startsWith('sale_')) {
                    setSales(prev => [...prev, editingSale])
                  } else {
                    setSales(prev => prev.map(sale => 
                      sale.id === editingSale.id ? editingSale : sale
                    ))
                  }
                  setEditingSale(null)
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
