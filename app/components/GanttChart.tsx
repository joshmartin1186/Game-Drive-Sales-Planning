'use client'

import { useState, useMemo, useRef, useCallback } from 'react'
import { DndContext, DragEndEvent, DragStartEvent, useSensor, useSensors, PointerSensor, DragOverlay } from '@dnd-kit/core'
import { format, addDays, differenceInDays, parseISO, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns'
import { Sale, Platform, Product, Game, Client, SaleWithDetails, PlatformEvent } from '@/lib/types'
import { validateSale } from '@/lib/validation'
import SaleBlock from './SaleBlock'
import styles from './GanttChart.module.css'

interface GanttChartProps {
  sales: SaleWithDetails[]
  products: (Product & { game: Game & { client: Client } })[]
  platforms: Platform[]
  platformEvents: PlatformEvent[]
  timelineStart: Date
  monthCount: number
  onSaleUpdate: (saleId: string, updates: Partial<Sale>) => Promise<void>
  onSaleDelete: (saleId: string) => Promise<void>
  onSaleEdit: (sale: SaleWithDetails) => void
  allSales: SaleWithDetails[]
  showEvents?: boolean
}

const DAY_WIDTH = 28
const ROW_HEIGHT = 40
const HEADER_HEIGHT = 60

export default function GanttChart({
  sales,
  products,
  platforms,
  platformEvents,
  timelineStart,
  monthCount,
  onSaleUpdate,
  onSaleDelete,
  onSaleEdit,
  allSales,
  showEvents = true
}: GanttChartProps) {
  const [draggedSale, setDraggedSale] = useState<SaleWithDetails | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [optimisticUpdates, setOptimisticUpdates] = useState<Record<string, { startDate: string; endDate: string }>>({})
  const containerRef = useRef<HTMLDivElement>(null)
  
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  )
  
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
    
    Array.from(gameMap.entries()).forEach(([gameId, prods]) => {
      if (prods.length > 0 && prods[0].game) {
        groups.push({ game: prods[0].game, products: prods })
      }
    })
    
    return groups.sort((a, b) => a.game.name.localeCompare(b.game.name))
  }, [products])
  
  // Group platform events by platform ID for quick lookup
  const eventsByPlatform = useMemo(() => {
    const map = new Map<string, PlatformEvent[]>()
    if (!showEvents) return map
    
    const timelineEnd = days[days.length - 1]
    
    for (const event of platformEvents) {
      const eventStart = parseISO(event.start_date)
      const eventEnd = parseISO(event.end_date)
      
      // Only include events that overlap with timeline
      if (eventEnd >= days[0] && eventStart <= timelineEnd) {
        const platformId = event.platform_id
        if (!map.has(platformId)) {
          map.set(platformId, [])
        }
        map.get(platformId)!.push(event)
      }
    }
    
    return map
  }, [platformEvents, days, showEvents])
  
  // Get platform IDs that have visible events - use Array.from for TypeScript compatibility
  const platformsWithEventsArray = useMemo(() => {
    return Array.from(eventsByPlatform.keys())
  }, [eventsByPlatform])
  
  const getPositionForDate = useCallback((date: Date | string): number => {
    const d = typeof date === 'string' ? parseISO(date) : date
    const daysDiff = differenceInDays(d, days[0])
    return daysDiff * DAY_WIDTH
  }, [days])
  
  const getWidthForRange = useCallback((start: Date | string, end: Date | string): number => {
    const s = typeof start === 'string' ? parseISO(start) : start
    const e = typeof end === 'string' ? parseISO(end) : end
    const daysDiff = differenceInDays(e, s) + 1
    return daysDiff * DAY_WIDTH
  }, [])
  
  // Get events for a specific platform, clamped to timeline bounds
  const getEventsForPlatform = useCallback((platformId: string) => {
    const events = eventsByPlatform.get(platformId) || []
    return events.map(event => {
      const eventStart = parseISO(event.start_date)
      const eventEnd = parseISO(event.end_date)
      // Clamp to timeline bounds
      const displayStart = eventStart < days[0] ? days[0] : eventStart
      const displayEnd = eventEnd > days[days.length - 1] ? days[days.length - 1] : eventEnd
      const left = getPositionForDate(displayStart)
      const width = getWidthForRange(displayStart, displayEnd)
      
      return {
        ...event,
        displayStart,
        displayEnd,
        left,
        width
      }
    })
  }, [eventsByPlatform, days, getPositionForDate, getWidthForRange])
  
  // Get sales for a product, applying optimistic updates
  const getSalesForProduct = useCallback((productId: string) => {
    return sales
      .filter(sale => sale.product_id === productId)
      .map(sale => {
        const optimistic = optimisticUpdates[sale.id]
        if (optimistic) {
          return {
            ...sale,
            start_date: optimistic.startDate,
            end_date: optimistic.endDate
          }
        }
        return sale
      })
  }, [sales, optimisticUpdates])
  
  // Get platforms to show for a product (those with sales OR those with visible events)
  const getPlatformsForProduct = useCallback((productId: string) => {
    const productSales = getSalesForProduct(productId)
    const platformIdsWithSales = productSales.map(s => s.platform_id)
    
    // Combine platforms with sales and platforms with visible events
    const allPlatformIdsSet = new Set([
      ...platformIdsWithSales,
      ...(showEvents ? platformsWithEventsArray : [])
    ])
    
    return Array.from(allPlatformIdsSet)
      .map(id => platforms.find(p => p.id === id))
      .filter((p): p is Platform => p !== undefined)
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [getSalesForProduct, platforms, platformsWithEventsArray, showEvents])
  
  // Get sales for a specific product and platform
  const getSalesForProductPlatform = useCallback((productId: string, platformId: string) => {
    return getSalesForProduct(productId).filter(sale => sale.platform_id === platformId)
  }, [getSalesForProduct])
  
  const getCooldownForSale = useCallback((sale: SaleWithDetails) => {
    if (!sale.platform) return null
    
    if ((sale.sale_type === 'seasonal' || sale.sale_type === 'special') && sale.platform.special_sales_no_cooldown) {
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
  
  const handleDragStart = (event: DragStartEvent) => {
    const saleId = event.active.id as string
    const sale = sales.find(s => s.id === saleId)
    if (sale) {
      setDraggedSale(sale)
      setValidationError(null)
    }
  }
  
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
    const newStartStr = format(newStart, 'yyyy-MM-dd')
    const newEndStr = format(newEnd, 'yyyy-MM-dd')
    
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
        start_date: newStartStr,
        end_date: newEndStr,
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
    
    // Optimistic update - immediately show new position
    setOptimisticUpdates(prev => ({
      ...prev,
      [draggedSale.id]: { startDate: newStartStr, endDate: newEndStr }
    }))
    
    setDraggedSale(null)
    
    try {
      // Update in background
      await onSaleUpdate(draggedSale.id, {
        start_date: newStartStr,
        end_date: newEndStr
      })
    } catch (err) {
      // Revert optimistic update on error
      setOptimisticUpdates(prev => {
        const updated = { ...prev }
        delete updated[draggedSale.id]
        return updated
      })
      setValidationError('Failed to save - position reverted')
      setTimeout(() => setValidationError(null), 3000)
    }
    
    // Clear optimistic update after data refresh
    setTimeout(() => {
      setOptimisticUpdates(prev => {
        const updated = { ...prev }
        delete updated[draggedSale.id]
        return updated
      })
    }, 500)
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
        <span className={styles.legendTitle}>PLATFORMS:</span>
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
            
            <div className={styles.productRows}>
              {groupedProducts.map(({ game, products: gameProducts }) => (
                <div key={game.id} className={styles.gameGroup}>
                  <div className={styles.gameHeader}>
                    <div className={styles.productLabel}>
                      <span className={styles.gameName}>{game.name}</span>
                      <span className={styles.clientName}>{game.client?.name}</span>
                    </div>
                  </div>
                  
                  {gameProducts.map(product => {
                    const productPlatforms = getPlatformsForProduct(product.id)
                    
                    return (
                      <div key={product.id} className={styles.productGroup}>
                        {/* Product header row */}
                        <div className={styles.productRow}>
                          <div className={styles.productLabel}>
                            <span className={styles.productName}>{product.name}</span>
                            <span className={styles.productType}>{product.product_type}</span>
                          </div>
                          
                          <div className={styles.timelineRow} style={{ width: totalWidth }}>
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
                          </div>
                        </div>
                        
                        {/* Platform sub-rows for products with sales OR events */}
                        {productPlatforms.map(platform => {
                          const platformSales = getSalesForProductPlatform(product.id, platform.id)
                          const platformEventsForRow = getEventsForPlatform(platform.id)
                          
                          return (
                            <div key={`${product.id}-${platform.id}`} className={styles.platformRow}>
                              <div className={styles.platformLabel}>
                                <span 
                                  className={styles.platformIndicator}
                                  style={{ backgroundColor: platform.color_hex }}
                                />
                                <span className={styles.platformName}>{platform.name}</span>
                              </div>
                              
                              <div className={styles.timelineRow} style={{ width: totalWidth }}>
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
                                
                                {/* Platform Events as shaded backgrounds */}
                                {showEvents && platformEventsForRow.map(event => (
                                  <div
                                    key={`event-${event.id}`}
                                    className={styles.platformEventShade}
                                    style={{
                                      left: event.left,
                                      width: event.width,
                                      backgroundColor: `${platform.color_hex}25`,
                                      borderColor: platform.color_hex,
                                    }}
                                    title={`${event.name}\n${format(event.displayStart, 'MMM d')} - ${format(event.displayEnd, 'MMM d, yyyy')}${!event.requires_cooldown ? '\n★ No cooldown required' : ''}`}
                                  >
                                    <span className={styles.platformEventLabel}>
                                      {event.name}
                                      {!event.requires_cooldown && <span className={styles.noCooldownStar}>★</span>}
                                    </span>
                                  </div>
                                ))}
                                
                                {/* Cooldowns and Sales */}
                                {platformSales.map(sale => {
                                  const left = getPositionForDate(sale.start_date)
                                  const width = getWidthForRange(sale.start_date, sale.end_date)
                                  const cooldown = getCooldownForSale(sale)
                                  
                                  return (
                                    <div key={sale.id}>
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
                                      
                                      <SaleBlock
                                        sale={sale}
                                        left={left}
                                        width={width}
                                        onEdit={onSaleEdit}
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
