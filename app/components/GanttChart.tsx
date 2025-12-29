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
  products: (Product &amp; { game: Game &amp; { client: Client } })[]
  platforms: Platform[]
  events: TimelineEvent[]
  timelineStart: Date
  monthCount: number
  onSaleUpdate: (saleId: string, updates: Partial&lt;Sale&gt;) =&gt; Promise&lt;void&gt;
  onSaleDelete: (saleId: string) =&gt; Promise&lt;void&gt;
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
  const [draggedSale, setDraggedSale] = useState&lt;SaleWithDetails | null&gt;(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [validationError, setValidationError] = useState&lt;string | null&gt;(null)
  const [hoveredDay, setHoveredDay] = useState&lt;Date | null&gt;(null)
  const containerRef = useRef&lt;HTMLDivElement&gt;(null)
  
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  )
  
  // Generate timeline data
  const { months, days, totalDays } = useMemo(() =&gt; {
    const monthsArr: { date: Date; days: number }[] = []
    const daysArr: Date[] = []
    
    for (let i = 0; i &lt; monthCount; i++) {
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
  const groupedProducts = useMemo(() =&gt; {
    const groups: { game: Game &amp; { client: Client }; products: (Product &amp; { game: Game &amp; { client: Client } })[] }[] = []
    const gameMap = new Map&lt;string, (Product &amp; { game: Game &amp; { client: Client } })[]&gt;()
    
    for (const product of products) {
      if (!product.game) continue
      const gameId = product.game.id
      if (!gameMap.has(gameId)) {
        gameMap.set(gameId, [])
      }
      gameMap.get(gameId)!.push(product)
    }
    
    // Use Array.from() to convert Map entries for iteration
    Array.from(gameMap.entries()).forEach(([gameId, prods]) =&gt; {
      if (prods.length &gt; 0 &amp;&amp; prods[0].game) {
        groups.push({ game: prods[0].game, products: prods })
      }
    })
    
    return groups.sort((a, b) =&gt; a.game.name.localeCompare(b.game.name))
  }, [products])
  
  // Calculate position for a date
  const getPositionForDate = useCallback((date: Date | string): number =&gt; {
    const d = typeof date === 'string' ? parseISO(date) : date
    const daysDiff = differenceInDays(d, days[0])
    return daysDiff * DAY_WIDTH
  }, [days])
  
  // Calculate width for a date range
  const getWidthForRange = useCallback((start: Date | string, end: Date | string): number =&gt; {
    const s = typeof start === 'string' ? parseISO(start) : start
    const e = typeof end === 'string' ? parseISO(end) : end
    const daysDiff = differenceInDays(e, s) + 1 // Include both days
    return daysDiff * DAY_WIDTH
  }, [])
  
  // Get date from position
  const getDateFromPosition = useCallback((xPos: number): Date =&gt; {
    const dayIndex = Math.round(xPos / DAY_WIDTH)
    return addDays(days[0], Math.max(0, Math.min(dayIndex, totalDays - 1)))
  }, [days, totalDays])
  
  // Get sales for a specific product
  const getSalesForProduct = useCallback((productId: string) =&gt; {
    return sales.filter(sale =&gt; sale.product_id === productId)
  }, [sales])
  
  // Calculate cooldown visualization for a sale
  const getCooldownForSale = useCallback((sale: SaleWithDetails) =&gt; {
    if (!sale.platform) return null
    
    // No cooldown visualization for seasonal Steam sales
    if (sale.sale_type === 'seasonal' &amp;&amp; sale.platform.special_sales_no_cooldown) {
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
  const handleDragStart = (event: DragStartEvent) =&gt; {
    const saleId = event.active.id as string
    const sale = sales.find(s =&gt; s.id === saleId)
    if (sale) {
      setDraggedSale(sale)
      setValidationError(null)
    }
  }
  
  // Handle drag end
  const handleDragEnd = async (event: DragEndEvent) =&gt; {
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
    const platform = platforms.find(p =&gt; p.id === draggedSale.platform_id)
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
      setTimeout(() =&gt; setValidationError(null), 3000)
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
    &lt;div className={styles.container}&gt;
      {validationError &amp;&amp; (
        &lt;div className={styles.validationError}&gt;
          &lt;span&gt;⚠️ {validationError}&lt;/span&gt;
        &lt;/div&gt;
      )}
      
      &lt;div className={styles.legend}&gt;
        &lt;span className={styles.legendTitle}&gt;Platforms:&lt;/span&gt;
        {platforms.slice(0, 8).map(platform =&gt; (
          &lt;div key={platform.id} className={styles.legendItem}&gt;
            &lt;span 
              className={styles.legendColor}
              style={{ backgroundColor: platform.color_hex }}
            /&gt;
            &lt;span&gt;{platform.name}&lt;/span&gt;
            &lt;span className={styles.legendCooldown}&gt;({platform.cooldown_days}d cooldown)&lt;/span&gt;
          &lt;/div&gt;
        ))}
      &lt;/div&gt;
      
      &lt;div className={styles.scrollContainer} ref={containerRef}&gt;
        &lt;DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        &gt;
          &lt;div className={styles.timeline} style={{ width: totalWidth }}&gt;
            {/* Month Headers */}
            &lt;div className={styles.monthHeaders}&gt;
              {months.map(({ date, days: daysInMonth }, idx) =&gt; (
                &lt;div 
                  key={idx}
                  className={styles.monthHeader}
                  style={{ width: daysInMonth * DAY_WIDTH }}
                &gt;
                  {format(date, 'MMMM yyyy')}
                &lt;/div&gt;
              ))}
            &lt;/div&gt;
            
            {/* Day Headers */}
            &lt;div className={styles.dayHeaders}&gt;
              {days.map((day, idx) =&gt; {
                const isWeekend = day.getDay() === 0 || day.getDay() === 6
                const isFirstOfMonth = day.getDate() === 1
                return (
                  &lt;div 
                    key={idx}
                    className={`${styles.dayHeader} ${isWeekend ? styles.weekend : ''} ${isFirstOfMonth ? styles.monthStart : ''}`}
                    style={{ width: DAY_WIDTH }}
                  &gt;
                    {day.getDate()}
                  &lt;/div&gt;
                )
              })}
            &lt;/div&gt;
            
            {/* Product Rows */}
            &lt;div className={styles.productRows}&gt;
              {groupedProducts.map(({ game, products: gameProducts }) =&gt; (
                &lt;div key={game.id} className={styles.gameGroup}&gt;
                  {/* Game header row */}
                  &lt;div className={styles.gameHeader}&gt;
                    &lt;div className={styles.productLabel}&gt;
                      &lt;span className={styles.gameName}&gt;{game.name}&lt;/span&gt;
                      &lt;span className={styles.clientName}&gt;{game.client?.name}&lt;/span&gt;
                    &lt;/div&gt;
                  &lt;/div&gt;
                  
                  {/* Product rows */}
                  {gameProducts.map(product =&gt; {
                    const productSales = getSalesForProduct(product.id)
                    
                    return (
                      &lt;div key={product.id} className={styles.productRow}&gt;
                        &lt;div className={styles.productLabel}&gt;
                          &lt;span className={styles.productName}&gt;{product.name}&lt;/span&gt;
                          &lt;span className={styles.productType}&gt;{product.product_type}&lt;/span&gt;
                        &lt;/div&gt;
                        
                        &lt;div className={styles.timelineRow} style={{ width: totalWidth }}&gt;
                          {/* Day grid lines */}
                          {days.map((day, idx) =&gt; {
                            const isWeekend = day.getDay() === 0 || day.getDay() === 6
                            return (
                              &lt;div
                                key={idx}
                                className={`${styles.dayCell} ${isWeekend ? styles.weekendCell : ''}`}
                                style={{ left: idx * DAY_WIDTH, width: DAY_WIDTH }}
                              /&gt;
                            )
                          })}
                          
                          {/* Sales and cooldowns */}
                          {productSales.map(sale =&gt; {
                            const left = getPositionForDate(sale.start_date)
                            const width = getWidthForRange(sale.start_date, sale.end_date)
                            const cooldown = getCooldownForSale(sale)
                            
                            return (
                              &lt;div key={sale.id}&gt;
                                {/* Cooldown block */}
                                {cooldown &amp;&amp; (
                                  &lt;div
                                    className={styles.cooldownBlock}
                                    style={{
                                      left: cooldown.left,
                                      width: cooldown.width
                                    }}
                                    title={`Cooldown until ${format(cooldown.end, 'MMM d, yyyy')}`}
                                  &gt;
                                    &lt;span&gt;COOLDOWN&lt;/span&gt;
                                  &lt;/div&gt;
                                )}
                                
                                {/* Sale block */}
                                &lt;SaleBlock
                                  sale={sale}
                                  left={left}
                                  width={width}
                                  onDelete={onSaleDelete}
                                /&gt;
                              &lt;/div&gt;
                            )
                          })}
                        &lt;/div&gt;
                      &lt;/div&gt;
                    )
                  })}
                &lt;/div&gt;
              ))}
              
              {groupedProducts.length === 0 &amp;&amp; (
                &lt;div className={styles.emptyState}&gt;
                  &lt;p&gt;No products found. Add products to start planning sales.&lt;/p&gt;
                &lt;/div&gt;
              )}
            &lt;/div&gt;
          &lt;/div&gt;
          
          &lt;DragOverlay&gt;
            {draggedSale &amp;&amp; (
              &lt;div 
                className={styles.dragOverlay}
                style={{ 
                  backgroundColor: draggedSale.platform?.color_hex || '#3b82f6',
                  width: getWidthForRange(draggedSale.start_date, draggedSale.end_date)
                }}
              &gt;
                {draggedSale.sale_name || 'Sale'} -{draggedSale.discount_percentage}%
              &lt;/div&gt;
            )}
          &lt;/DragOverlay&gt;
        &lt;/DndContext&gt;
      &lt;/div&gt;
    &lt;/div&gt;
  )
}
