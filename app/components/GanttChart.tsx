'use client'

import { useState, useMemo, useRef, useCallback } from 'react'
import { DndContext, DragEndEvent, DragStartEvent, DragMoveEvent, useSensor, useSensors, PointerSensor, DragOverlay } from '@dnd-kit/core'
import { format, addDays, differenceInDays, parseISO, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns'
import { Sale, Platform, Product, Game, Client, SaleWithDetails, TimelineEvent } from '@/lib/types'
import { validateSale } from '@/lib/validation'
import SaleBlock from './SaleBlock'
import styles from './GanttChart.module.css'

interface GanttChartProps {
  sales: SaleWithDetails[]
  products: (Product & { game: Game & { client: Client } })[]
  platforms: Platform[]
  events: TimelineEvent[]
  timelineStart: Date
  monthCount: number
  onSaleUpdate: (saleId: string, updates: Partial<Sale>) => Promise<void>
  onSaleDelete: (saleId: string) => Promise<void>
  allSales: SaleWithDetails[] // For cross-client validation
}

const DAY_WIDTH = 28 // pixels per day
const ROW_HEIGHT = 40 // pixels per product row
const HEADER_HEIGHT = 60 // month + day headers

export default function GanttChart({
  sales,
  products,
  platforms,
  events,
  timelineStart,
  monthCount,
  onSaleUpdate,
  onSaleDelete,
  allSales
}: GanttChartProps) {
  const [draggedSale, setDraggedSale] = useState<SaleWithDetails | null>(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [validationError, setValidationError] = useState<string | null>(null)
  const [hoveredDay, setHoveredDay] = useState<Date | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  )
  
  // Generate timeline data
  const { months, days, totalDays } = useMemo(() => {
    const monthsArr: { date: Date; days: number }[] = []
    const daysArr: Date[] = []
    
    for (let i = 0; i < monthCount; i++) {
      const monthDate = new Date(timelineStart.getFullYear(), timelineStart.getMonth() + i, 1)
      const monthDays = eachDayOfInterval({
        start: startOfMonth(monthDate),
        end: endOfMonth(monthDate)
      })
      monthsArr.push({ date: monthDate, days: monthDays.length })
      daysArr.push(...monthDays)
    }
    
    return { months: monthsArr, days: daysArr, totalDays: daysArr.length }
  }, [timelineStart, monthCount])
  
  // Group products by game for visual organization
  const groupedProducts = useMemo(() => {
    const groups: { game: Game & { client: Client }; products: (Product & { game: Game & { client: Client } })[] }[] = []
    const gameMap = new Map<string, (Product & { game: Game & { client: Client } })[]>()
    
    for (const product of products) {
      if (!product.game) continue
      const gameId = product.game.id
      if (!gameMap.has(gameId)) {
        gameMap.set(gameId, [])
      }
      gameMap.get(gameId)!.push(product)
    }
    
    for (const [gameId, prods] of gameMap) {
      if (prods.length > 0 && prods[0].game) {
        groups.push({ game: prods[0].game, products: prods })
      }
    }
    
    return groups.sort((a, b) => a.game.name.localeCompare(b.game.name))
  }, [products])
  
  // Calculate position for a date
  const getPositionForDate = useCallback((date: Date | string): number => {
    const d = typeof date === 'string' ? parseISO(date) : date
    const daysDiff = differenceInDays(d, days[0])
    return daysDiff * DAY_WIDTH
  }, [days])
  
  // Calculate width for a date range
  const getWidthForRange = useCallback((start: Date | string, end: Date | string): number => {
    const s = typeof start === 'string' ? parseISO(start) : start
    const e = typeof end === 'string' ? parseISO(end) : end
    const daysDiff = differenceInDays(e, s) + 1 // Include both days
    return daysDiff * DAY_WIDTH
  }, [])
  
  // Get date from position
  const getDateFromPosition = useCallback((xPos: number): Date => {
    const dayIndex = Math.round(xPos / DAY_WIDTH)
    return addDays(days[0], Math.max(0, Math.min(dayIndex, totalDays - 1)))
  }, [days, totalDays])
  
  // Get sales for a specific product
  const getSalesForProduct = useCallback((productId: string) => {
    return sales.filter(sale => sale.product_id === productId)
  }, [sales])
  
  // Calculate cooldown visualization for a sale
  const getCooldownForSale = useCallback((sale: SaleWithDetails) => {
    if (!sale.platform) return null
    
    // No cooldown visualization for seasonal Steam sales
    if (sale.sale_type === 'seasonal' && sale.platform.special_sales_no_cooldown) {
      return null
    }
    
    const cooldownDays = sale.platform.cooldown_days
    if (cooldownDays === 0) return null
    
    const saleEnd = parseISO(sale.end_date)
    const cooldownStart = addDays(saleEnd, 1)
    const cooldownEnd = addDays(saleEnd, cooldownDays)
    
    return {
      start: cooldownStart,
      end: cooldownEnd,
      left: getPositionForDate(cooldownStart),
      width: getWidthForRange(cooldownStart, cooldownEnd)
    }
  }, [getPositionForDate, getWidthForRange])
  
  // Handle drag start
  const handleDragStart = (event: DragStartEvent) => {
    const saleId = event.active.id as string
    const sale = sales.find(s => s.id === saleId)
    if (sale) {
      setDraggedSale(sale)
      setValidationError(null)
    }
  }
  
  // Handle drag end
  const handleDragEnd = async (event: DragEndEvent) => {
    if (!draggedSale) {
      setDraggedSale(null)
      return
    }
    
    const { delta } = event
    const daysMoved = Math.round(delta.x / DAY_WIDTH)
    
    if (daysMoved === 0) {
      setDraggedSale(null)
      return
    }
    
    const currentStart = parseISO(draggedSale.start_date)
    const currentEnd = parseISO(draggedSale.end_date)
    const newStart = addDays(currentStart, daysMoved)
    const newEnd = addDays(currentEnd, daysMoved)
    
    // Validate the new position
    const platform = platforms.find(p => p.id === draggedSale.platform_id)
    if (!platform) {
      setValidationError('Platform not found')
      setDraggedSale(null)
      return
    }
    
    const validation = validateSale(
      {
        product_id: draggedSale.product_id,
        platform_id: draggedSale.platform_id,
        start_date: format(newStart, 'yyyy-MM-dd'),
        end_date: format(newEnd, 'yyyy-MM-dd'),
        sale_type: draggedSale.sale_type
      },
      allSales,
      platform,
      draggedSale.id
    )
    
    if (!validation.valid) {
      setValidationError(validation.message || 'Invalid sale position - conflicts with cooldown')
      setTimeout(() => setValidationError(null), 3000)
      setDraggedSale(null)
      return
    }
    
    // Update the sale
    await onSaleUpdate(draggedSale.id, {
      start_date: format(newStart, 'yyyy-MM-dd'),
      end_date: format(newEnd, 'yyyy-MM-dd')
    })
    
    setDraggedSale(null)
  }
  
  const totalWidth = totalDays * DAY_WIDTH
  
  return (
    <div className={styles.container}>
      {validationError && (
        <div className={styles.validationError}>
          <span>⚠️ {validationError}</span>
        </div>
      )}
      
      <div className={styles.legend}>
        <span className={styles.legendTitle}>Platforms:</span>
        {platforms.slice(0, 8).map(platform => (
          <div key={platform.id} className={styles.legendItem}>
            <span 
              className={styles.legendColor}
              style={{ backgroundColor: platform.color_hex }}
            />
            <span>{platform.name}</span>
            <span className={styles.legendCooldown}>({platform.cooldown_days}d cooldown)</span>
          </div>
        ))}
      </div>
      
      <div className={styles.scrollContainer} ref={containerRef}>
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className={styles.timeline} style={{ width: totalWidth }}>
            {/* Month Headers */}
            <div className={styles.monthHeaders}>
              {months.map(({ date, days: daysInMonth }, idx) => (
                <div 
                  key={idx}
                  className={styles.monthHeader}
                  style={{ width: daysInMonth * DAY_WIDTH }}
                >
                  {format(date, 'MMMM yyyy')}
                </div>
              ))}
            </div>
            
            {/* Day Headers */}
            <div className={styles.dayHeaders}>
              {days.map((day, idx) => {
                const isWeekend = day.getDay() === 0 || day.getDay() === 6
                const isFirstOfMonth = day.getDate() === 1
                return (
                  <div 
                    key={idx}
                    className={`${styles.dayHeader} ${isWeekend ? styles.weekend : ''} ${isFirstOfMonth ? styles.monthStart : ''}`}
                    style={{ width: DAY_WIDTH }}
                  >
                    {day.getDate()}
                  </div>
                )
              })}
            </div>
            
            {/* Product Rows */}
            <div className={styles.productRows}>
              {groupedProducts.map(({ game, products: gameProducts }) => (
                <div key={game.id} className={styles.gameGroup}>
                  {/* Game header row */}
                  <div className={styles.gameHeader}>
                    <div className={styles.productLabel}>
                      <span className={styles.gameName}>{game.name}</span>
                      <span className={styles.clientName}>{game.client?.name}</span>
                    </div>
                  </div>
                  
                  {/* Product rows */}
                  {gameProducts.map(product => {
                    const productSales = getSalesForProduct(product.id)
                    
                    return (
                      <div key={product.id} className={styles.productRow}>
                        <div className={styles.productLabel}>
                          <span className={styles.productName}>{product.name}</span>
                          <span className={styles.productType}>{product.product_type}</span>
                        </div>
                        
                        <div className={styles.timelineRow} style={{ width: totalWidth }}>
                          {/* Day grid lines */}
                          {days.map((day, idx) => {
                            const isWeekend = day.getDay() === 0 || day.getDay() === 6
                            return (
                              <div
                                key={idx}
                                className={`${styles.dayCell} ${isWeekend ? styles.weekendCell : ''}`}
                                style={{ left: idx * DAY_WIDTH, width: DAY_WIDTH }}
                              />
                            )
                          })}
                          
                          {/* Sales and cooldowns */}
                          {productSales.map(sale => {
                            const left = getPositionForDate(sale.start_date)
                            const width = getWidthForRange(sale.start_date, sale.end_date)
                            const cooldown = getCooldownForSale(sale)
                            
                            return (
                              <div key={sale.id}>
                                {/* Cooldown block */}
                                {cooldown && (
                                  <div
                                    className={styles.cooldownBlock}
                                    style={{
                                      left: cooldown.left,
                                      width: cooldown.width
                                    }}
                                    title={`Cooldown until ${format(cooldown.end, 'MMM d, yyyy')}`}
                                  >
                                    <span>COOLDOWN</span>
                                  </div>
                                )}
                                
                                {/* Sale block */}
                                <SaleBlock
                                  sale={sale}
                                  left={left}
                                  width={width}
                                  onDelete={onSaleDelete}
                                />
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}
              
              {groupedProducts.length === 0 && (
                <div className={styles.emptyState}>
                  <p>No products found. Add products to start planning sales.</p>
                </div>
              )}
            </div>
          </div>
          
          <DragOverlay>
            {draggedSale && (
              <div 
                className={styles.dragOverlay}
                style={{ 
                  backgroundColor: draggedSale.platform?.color_hex || '#3b82f6',
                  width: getWidthForRange(draggedSale.start_date, draggedSale.end_date)
                }}
              >
                {draggedSale.sale_name || 'Sale'} -{draggedSale.discount_percentage}%
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  )
}
