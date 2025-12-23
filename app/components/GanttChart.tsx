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

// Enhanced Draggable Sale Block Component with angled design
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
    opacity: isDragging ? 0.8 : 1,
    zIndex: isDragging ? 50 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onEdit(sale)}
      className="absolute cursor-grab active:cursor-grabbing group"
      title={`${sale.saleName} - ${sale.discountPercentage}% off for ${duration} days on ${platform?.name}`}
    >
      {/* Enhanced Angled sale block - key GameDrive visual requirement */}
      <div className="relative">
        <svg 
          width="120" 
          height="28" 
          viewBox="0 0 120 28"
          className="drop-shadow-md group-hover:drop-shadow-lg transition-all duration-200"
        >
          {/* Angled/diamond shape with gradient */}
          <defs>
            <linearGradient id={`gradient-${sale.id}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" style={{stopColor: platform?.color, stopOpacity: 0.9}} />
              <stop offset="100%" style={{stopColor: platform?.color, stopOpacity: 1}} />
            </linearGradient>
            <filter id={`shadow-${sale.id}`}>
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.2"/>
            </filter>
          </defs>
          
          {/* Main angled block */}
          <polygon 
            points="10,3 110,3 116,14 110,25 10,25 4,14"
            fill={`url(#gradient-${sale.id})`}
            stroke="rgba(255,255,255,0.3)"
            strokeWidth="1"
            filter={`url(#shadow-${sale.id})`}
            className="group-hover:stroke-white group-hover:stroke-2 transition-all duration-200"
          />
          
          {/* Sale info text */}
          <text 
            x="60" 
            y="12" 
            textAnchor="middle" 
            fontSize="11" 
            fill="white"
            fontWeight="600"
            className="pointer-events-none"
          >
            {sale.discountPercentage}%
          </text>
          <text 
            x="60" 
            y="21" 
            textAnchor="middle" 
            fontSize="8" 
            fill="rgba(255,255,255,0.9)"
            fontWeight="400"
            className="pointer-events-none"
          >
            {duration}d • {platform?.name}
          </text>
        </svg>
        
        {/* Status indicator */}
        <div className="absolute -top-1 -right-1 w-4 h-4">
          <div className={`w-full h-full rounded-full border-2 border-white shadow-sm ${
            sale.status === 'confirmed' ? 'bg-green-500' :
            sale.status === 'submitted' ? 'bg-yellow-500' :
            sale.status === 'live' ? 'bg-blue-500' :
            sale.status === 'ended' ? 'bg-gray-500' :
            'bg-orange-500'
          }`}>
            {sale.status === 'confirmed' && (
              <div className="flex items-center justify-center h-full">
                <svg className="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
            )}
          </div>
        </div>

        {/* Hover tooltip */}
        <div className="absolute -top-12 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
          <div className="font-semibold">{sale.saleName}</div>
          <div className="text-gray-300">
            {format(sale.startDate, 'MMM d')} - {format(sale.endDate, 'MMM d, yyyy')}
          </div>
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
        </div>
      </div>
    </div>
  )
}

// Enhanced Timeline Header Component
function TimelineHeader() {
  const now = new Date()
  const months = Array.from({ length: 12 }, (_, i) => addMonths(startOfMonth(now), i))

  return (
    <div className="flex border-b-2 border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100">
      <div className="w-64 flex-shrink-0 p-4 border-r-2 border-gray-200 bg-white">
        <div className="font-semibold text-gray-900">Products & Games</div>
        <div className="text-sm text-gray-500 mt-1">Click timeline to add sales</div>
      </div>
      <div className="flex-1 flex">
        {months.map((month, index) => (
          <div 
            key={month.toISOString()}
            className={`flex-1 p-4 border-r border-gray-200 text-center ${
              index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
            }`}
          >
            <div className="font-semibold text-sm text-gray-900 mb-1">
              {format(month, 'MMM yyyy')}
            </div>
            {/* Week indicators with better styling */}
            <div className="flex justify-between text-xs text-gray-400">
              <span className="w-2 h-2 bg-gray-300 rounded-full"></span>
              <span className="w-2 h-2 bg-gray-300 rounded-full"></span>
              <span className="w-2 h-2 bg-gray-300 rounded-full"></span>
              <span className="w-2 h-2 bg-gray-300 rounded-full"></span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Enhanced Product Row Component
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
  const [isHovering, setIsHovering] = useState(false)

  return (
    <div 
      className="flex border-b border-gray-200 hover:bg-blue-50/30 transition-colors duration-200 group"
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      {/* Enhanced Product info */}
      <div className="w-64 flex-shrink-0 p-4 border-r border-gray-200 bg-white group-hover:bg-blue-50/50 transition-colors">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
            {product.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="font-semibold text-gray-900 text-sm leading-tight">{product.name}</div>
            <div className="text-xs text-gray-500 mt-0.5">{product.gameName}</div>
          </div>
        </div>
      </div>

      {/* Enhanced Timeline area */}
      <div className="flex-1 relative h-20 bg-white group-hover:bg-blue-50/20 transition-colors">
        {/* Month grid lines with alternating colors */}
        <div className="absolute inset-0 flex">
          {Array.from({ length: 12 }, (_, i) => (
            <div 
              key={i} 
              className={`flex-1 border-r border-gray-100 ${
                i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
              }`} 
            />
          ))}
        </div>

        {/* Today indicator */}
        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-red-500 z-20">
          <div className="absolute -top-1 -left-1 w-2 h-2 bg-red-500 rounded-full"></div>
          <div className="absolute top-2 left-2 text-xs text-red-600 font-medium whitespace-nowrap">
            Today
          </div>
        </div>

        {/* Sales blocks */}
        {productSales.map((sale, index) => (
          <SaleBlock 
            key={sale.id}
            sale={sale}
            platforms={platforms}
            onEdit={onSaleEdit}
          />
        ))}

        {/* Enhanced Click to add sale area */}
        <div 
          className="absolute inset-0 cursor-pointer opacity-0 hover:opacity-100 transition-opacity duration-300"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            const clickX = e.clientX - rect.left
            const monthIndex = Math.floor((clickX / rect.width) * 12)
            const clickDate = addMonths(startOfMonth(new Date()), monthIndex)
            onSaleCreate(product.id, clickDate)
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-blue-100/50 to-purple-100/50 flex items-center justify-center">
            <div className="bg-white/90 backdrop-blur-sm border border-blue-200 rounded-lg px-4 py-2 shadow-lg">
              <div className="flex items-center space-x-2 text-blue-700">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span className="text-sm font-medium">Click to add sale</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Enhanced Sale Edit Modal
function SaleEditModal({ 
  sale, 
  platforms, 
  onSave, 
  onCancel 
}: {
  sale: Sale
  platforms: Platform[]
  onSave: (sale: Sale) => void
  onCancel: () => void
}) {
  const [editedSale, setEditedSale] = useState(sale)

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-blue-500 to-purple-600 text-white p-6 rounded-t-xl">
          <h3 className="text-xl font-bold">
            {editedSale.id.startsWith('sale_') ? 'Create New Sale' : 'Edit Sale'}
          </h3>
          <p className="text-blue-100 text-sm mt-1">
            Configure your platform sale with automatic validation
          </p>
        </div>
        
        {/* Modal Body */}
        <div className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Sale Name</label>
            <input 
              type="text" 
              value={editedSale.saleName}
              onChange={(e) => setEditedSale({...editedSale, saleName: e.target.value})}
              className="w-full border-2 border-gray-200 rounded-lg px-4 py-3 focus:border-blue-500 focus:outline-none transition-colors"
              placeholder="e.g., Spring Sale 2024"
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Discount %</label>
              <input 
                type="number" 
                value={editedSale.discountPercentage}
                onChange={(e) => setEditedSale({...editedSale, discountPercentage: parseInt(e.target.value)})}
                className="w-full border-2 border-gray-200 rounded-lg px-4 py-3 focus:border-blue-500 focus:outline-none transition-colors"
                min="0"
                max="100"
                placeholder="50"
              />
            </div>
            
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Status</label>
              <select 
                value={editedSale.status}
                onChange={(e) => setEditedSale({...editedSale, status: e.target.value as any})}
                className="w-full border-2 border-gray-200 rounded-lg px-4 py-3 focus:border-blue-500 focus:outline-none transition-colors"
              >
                <option value="planned">📅 Planned</option>
                <option value="submitted">📤 Submitted</option>
                <option value="confirmed">✅ Confirmed</option>
                <option value="live">🔴 Live</option>
                <option value="ended">⏹️ Ended</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Platform</label>
            <div className="grid grid-cols-1 gap-2">
              {platforms.map(platform => (
                <label
                  key={platform.id}
                  className={`flex items-center p-3 border-2 rounded-lg cursor-pointer transition-all ${
                    editedSale.platformId === platform.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="platform"
                    value={platform.id}
                    checked={editedSale.platformId === platform.id}
                    onChange={(e) => setEditedSale({...editedSale, platformId: e.target.value})}
                    className="sr-only"
                  />
                  <div
                    className="w-4 h-4 rounded-full mr-3 border-2 border-white shadow-sm"
                    style={{ backgroundColor: platform.color }}
                  />
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">{platform.name}</div>
                    <div className="text-xs text-gray-500">{platform.cooldownDays} day cooldown</div>
                  </div>
                  {editedSale.platformId === platform.id && (
                    <svg className="w-5 h-5 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  )}
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex justify-end space-x-3 p-6 bg-gray-50 rounded-b-xl">
          <button 
            onClick={onCancel}
            className="px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={() => onSave(editedSale)}
            className="px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg hover:from-blue-600 hover:to-purple-700 font-medium transition-all shadow-lg"
          >
            Save Sale
          </button>
        </div>
      </div>
    </div>
  )
}

// Main Enhanced Gantt Chart Component
export default function GanttChart() {
  const [sales, setSales] = useState<Sale[]>([])
  const [draggedSale, setDraggedSale] = useState<Sale | null>(null)
  const [editingSale, setEditingSale] = useState<Sale | null>(null)
  const [conflicts, setConflicts] = useState<string[]>([])

  // Sample sales data with better examples
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
        saleName: 'Spring Sale 2024',
        status: 'confirmed'
      },
      {
        id: 'sale2',
        productId: '3',
        platformId: 'playstation',
        startDate: addMonths(now, 2),
        endDate: addMonths(now, 2),
        discountPercentage: 30,
        saleName: 'Summer Kick-off',
        status: 'planned'
      },
      {
        id: 'sale3',
        productId: '4',
        platformId: 'xbox',
        startDate: addMonths(now, 0.5),
        endDate: addMonths(now, 0.5),
        discountPercentage: 25,
        saleName: 'Holiday Special',
        status: 'live'
      }
    ]
    setSales(sampleSales)
  }, [])

  // Enhanced conflict detection
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
        conflicts.push(`⚠️ Conflict with "${existingSale.saleName}": ${daysBetween} days between sales (${platform.cooldownDays} required for ${platform.name})`)
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

    // For now, just detect conflicts (full drag implementation in Phase 2)
    const newConflicts = detectConflicts(draggedSale)
    setConflicts(newConflicts)

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

  const handleSaleSave = (updatedSale: Sale) => {
    if (updatedSale.id.startsWith('sale_')) {
      setSales(prev => [...prev, updatedSale])
    } else {
      setSales(prev => prev.map(sale => 
        sale.id === updatedSale.id ? updatedSale : sale
      ))
    }
    setEditingSale(null)
  }

  return (
    <div className="bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden">
      {/* Enhanced conflict warnings */}
      {conflicts.length > 0 && (
        <div className="bg-gradient-to-r from-red-50 to-orange-50 border-l-4 border-red-400 p-4 mx-4 mt-4 rounded-lg">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.314 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <div className="ml-3 flex-1">
              <h3 className="text-sm font-bold text-red-800">Platform Cooldown Conflicts</h3>
              <div className="mt-2 text-sm text-red-700 space-y-1">
                {conflicts.map((conflict, index) => (
                  <div key={index} className="flex items-center">
                    <span className="mr-2">•</span>
                    <span>{conflict}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Enhanced Gantt Chart */}
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

      {/* Enhanced Platform Legend */}
      <div className="p-6 bg-gradient-to-r from-gray-50 to-gray-100 border-t border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-semibold text-gray-900 mb-2">Platform Cooldown Rules</h4>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 text-sm">
              {platforms.map((platform) => (
                <div key={platform.id} className="flex items-center space-x-2 bg-white rounded-lg p-2 shadow-sm">
                  <div 
                    className="w-4 h-4 rounded-full shadow-sm"
                    style={{ backgroundColor: platform.color }}
                  />
                  <div>
                    <div className="font-medium text-gray-900">{platform.name}</div>
                    <div className="text-gray-500">{platform.cooldownDays}d cooldown</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          <div className="text-right">
            <div className="text-sm text-gray-600 mb-1">Status Legend</div>
            <div className="flex space-x-3 text-xs">
              <div className="flex items-center space-x-1">
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                <span>Confirmed</span>
              </div>
              <div className="flex items-center space-x-1">
                <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                <span>Submitted</span>
              </div>
              <div className="flex items-center space-x-1">
                <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
                <span>Planned</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Enhanced Sale Edit Modal */}
      {editingSale && (
        <SaleEditModal
          sale={editingSale}
          platforms={platforms}
          onSave={handleSaleSave}
          onCancel={() => setEditingSale(null)}
        />
      )}
    </div>
  )
}