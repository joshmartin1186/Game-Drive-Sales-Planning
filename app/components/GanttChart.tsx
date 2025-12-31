'use client'

import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
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
  onSaleUpdate: (saleId: string, updates: Partial<Sale>) => Promise&lt;void&gt;
  onSaleDelete: (saleId: string) => Promise&lt;void&gt;
  onSaleEdit: (sale: SaleWithDetails) => void
  onCreateSale?: (prefill: { productId: string; platformId: string; startDate: string; endDate: string }) => void
  onGenerateCalendar?: (productId: string, productName: string, launchDate?: string) => void
  onClearSales?: (productId: string, productName: string) => void
  onLaunchDateChange?: (productId: string, newLaunchDate: string) => Promise&lt;void&gt;
  allSales: SaleWithDetails[]
  showEvents?: boolean
}

interface SelectionState {
  productId: string
  platformId: string
  startDayIndex: number
  endDayIndex: number
}

interface LaunchDateDragState {
  productId: string
  originalDate: string
  currentDayIndex: number
}

interface CascadeShift {
  saleId: string
  newStart: string
  newEnd: string
}

const DAY_WIDTH = 28
const ROW_HEIGHT = 40
const HEADER_HEIGHT = 60

export default function GanttChart(props: GanttChartProps) {
  const {
    sales,
    products,
    platforms,
    platformEvents,
    timelineStart,
    monthCount,
    onSaleUpdate,
    onSaleDelete,
    onSaleEdit,
    onCreateSale,
    onGenerateCalendar,
    onClearSales,
    onLaunchDateChange,
    allSales,
    showEvents = true
  } = props
  
  const [draggedSale, setDraggedSale] = useState&lt;SaleWithDetails | null&gt;(null)
  const [validationError, setValidationError] = useState&lt;string | null&gt;(null)
  const [optimisticUpdates, setOptimisticUpdates] = useState&lt;Record&lt;string, { startDate: string; endDate: string }&gt;&gt;({})
  const [selection, setSelection] = useState&lt;SelectionState | null&gt;(null)
  const [launchDateDrag, setLaunchDateDrag] = useState&lt;LaunchDateDragState | null&gt;(null)
  const [isGrabbing, setIsGrabbing] = useState(false)
  const [scrollProgress, setScrollProgress] = useState(0)
  const containerRef = useRef&lt;HTMLDivElement&gt;(null)
  const scrollContainerRef = useRef&lt;HTMLDivElement&gt;(null)
  
  // Refs for selection - store everything needed at mousedown time
  const selectionRef = useRef&lt;{
    data: SelectionState
    callback: typeof onCreateSale
    days: Date[]
  } | null&gt;(null)
  
  // Ref for launch date drag
  const launchDragRef = useRef&lt;{
    productId: string
    originalDate: string
    startX: number
  } | null&gt;(null)
  
  // Ref for scroll grab
  const scrollGrabRef = useRef&lt;{
    startX: number
    startScrollLeft: number
  } | null&gt;(null)
  
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
  
  const groupedProducts = useMemo(() => {
    const groups: { game: Game & { client: Client }; products: (Product & { game: Game & { client: Client } })[] }[] = []
    const gameMap = new Map&lt;string, (Product & { game: Game & { client: Client } })[]&gt;()
    
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
    const map = new Map&lt;string, PlatformEvent[]&gt;()
    if (!showEvents) return map
    
    const timelineEnd = days[days.length - 1]
    
    for (const event of platformEvents) {
      const eventStart = parseISO(event.start_date)
      const eventEnd = parseISO(event.end_date)
      
      // Only include events that overlap with timeline
      if (eventEnd >= days[0] && eventStart &lt;= timelineEnd) {
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
  
  const getDayIndexForDate = useCallback((date: Date | string): number => {
    const d = typeof date === 'string' ? parseISO(date) : date
    return differenceInDays(d, days[0])
  }, [days])
  
  // Get events for a specific platform, clamped to timeline bounds
  const getEventsForPlatform = useCallback((platformId: string) => {
    const events = eventsByPlatform.get(platformId) || []
    return events.map(event => {
      const eventStart = parseISO(event.start_date)
      const eventEnd = parseISO(event.end_date)
      // Clamp to timeline bounds
      const displayStart = eventStart &lt; days[0] ? days[0] : eventStart
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
  
  // Calculate cascade shifts for sales that would conflict with a moved sale
  // This handles BOTH directions - pushing forward AND pulling backward
  const calculateCascadeShifts = useCallback((
    movedSaleId: string,
    newStart: Date,
    newEnd: Date,
    productId: string,
    platformId: string,
    cooldownDays: number
  ): CascadeShift[] => {
    const shifts: CascadeShift[] = []
    
    // Get all sales on this product+platform, sorted by start date
    const otherSales = allSales
      .filter(s => s.product_id === productId && s.platform_id === platformId && s.id !== movedSaleId)
      .sort((a, b) => parseISO(a.start_date).getTime() - parseISO(b.start_date).getTime())
    
    if (otherSales.length === 0) return shifts
    
    // Forward cascade: Sales AFTER the moved sale that now conflict
    let currentCooldownEnd = addDays(newEnd, cooldownDays)
    
    for (const sale of otherSales) {
      const saleStart = parseISO(sale.start_date)
      const saleEnd = parseISO(sale.end_date)
      const saleDuration = differenceInDays(saleEnd, saleStart)
      
      // Only check sales that are after the moved sale ends
      if (saleStart &lt;= newEnd) continue
      
      // If this sale starts during the cooldown of the previous sale
      if (saleStart &lt; currentCooldownEnd) {
        // Calculate how many days to shift forward
        const shiftAmount = differenceInDays(currentCooldownEnd, saleStart) + 1
        const newSaleStart = addDays(saleStart, shiftAmount)
        const newSaleEnd = addDays(newSaleStart, saleDuration)
        
        shifts.push({
          saleId: sale.id,
          newStart: format(newSaleStart, 'yyyy-MM-dd'),
          newEnd: format(newSaleEnd, 'yyyy-MM-dd')
        })
        
        // Update cooldown end for next iteration
        currentCooldownEnd = addDays(newSaleEnd, cooldownDays)
      } else {
        // No conflict, but update cooldown end in case there are more sales after
        currentCooldownEnd = addDays(saleEnd, cooldownDays)
      }
    }
    
    // Backward cascade: Sales BEFORE the moved sale that now have cooldowns overlapping
    // We need to check if any sale's cooldown would overlap with the new start
    const salesBeforeMoved = otherSales.filter(s => parseISO(s.end_date) &lt; newStart)
    
    for (const sale of salesBeforeMoved) {
      // Skip if this sale is already being shifted
      if (shifts.some(s => s.saleId === sale.id)) continue
      
      const saleStart = parseISO(sale.start_date)
      const saleEnd = parseISO(sale.end_date)
      const saleDuration = differenceInDays(saleEnd, saleStart)
      const saleCooldownEnd = addDays(saleEnd, cooldownDays)
      
      // If the sale's cooldown overlaps with the moved sale's start
      if (saleCooldownEnd > newStart) {
        // We need to shift the moved sale back - but since we can't modify the moved sale
        // in cascade, we shift THIS sale earlier so its cooldown doesn't overlap
        const overlapDays = differenceInDays(saleCooldownEnd, newStart) + 1
        const newSaleStart = addDays(saleStart, -overlapDays)
        const newSaleEnd = addDays(newSaleStart, saleDuration)
        
        // Only add shift if it doesn't put the sale in negative territory
        if (newSaleStart >= days[0]) {
          shifts.push({
            saleId: sale.id,
            newStart: format(newSaleStart, 'yyyy-MM-dd'),
            newEnd: format(newSaleEnd, 'yyyy-MM-dd')
          })
        }
      }
    }
    
    return shifts
  }, [allSales, days])
  
  // Complete selection and open modal
  const completeSelection = useCallback((endDayIndex: number) => {
    if (!selectionRef.current) return
    
    const { data, callback, days: capturedDays } = selectionRef.current
    
    // Clear selection
    selectionRef.current = null
    setSelection(null)
    
    if (!callback || capturedDays.length === 0) {
      return
    }
    
    const startIdx = Math.min(data.startDayIndex, endDayIndex)
    const endIdx = Math.max(data.startDayIndex, endDayIndex)
    
    // Ensure indices are within bounds
    const safeStartIdx = Math.max(0, Math.min(startIdx, capturedDays.length - 1))
    const safeEndIdx = Math.max(0, Math.min(endIdx, capturedDays.length - 1))
    
    const startDate = format(capturedDays[safeStartIdx], 'yyyy-MM-dd')
    const endDate = format(capturedDays[safeEndIdx], 'yyyy-MM-dd')
    
    callback({
      productId: data.productId,
      platformId: data.platformId,
      startDate,
      endDate
    })
  }, [])
  
  // Selection handlers for click-to-create
  const handleSelectionStart = useCallback((productId: string, platformId: string, dayIndex: number, e: React.MouseEvent) => {
    // Don't start selection if clicking on a sale block or launch marker
    if ((e.target as HTMLElement).closest('[data-sale-block]') || (e.target as HTMLElement).closest('[data-launch-marker]')) {
      return
    }
    
    // Only respond to left mouse button
    if (e.button !== 0) return
    
    e.preventDefault()
    e.stopPropagation()
    
    const newSelection = {
      productId,
      platformId,
      startDayIndex: dayIndex,
      endDayIndex: dayIndex
    }
    
    // Capture EVERYTHING needed at mousedown time - callback and days
    selectionRef.current = {
      data: newSelection,
      callback: props.onCreateSale,
      days: days
    }
    
    setSelection(newSelection)
  }, [props.onCreateSale, days])
  
  const handleSelectionMove = useCallback((dayIndex: number) => {
    if (!selectionRef.current) return
    
    const newSelection = {
      ...selectionRef.current.data,
      endDayIndex: dayIndex
    }
    
    selectionRef.current.data = newSelection
    setSelection(newSelection)
  }, [])
  
  // Launch date drag handlers
  const handleLaunchDragStart = useCallback((productId: string, launchDate: string, e: React.MouseEvent) => {
    if (e.button !== 0) return
    if (!onLaunchDateChange) return
    
    e.preventDefault()
    e.stopPropagation()
    
    launchDragRef.current = {
      productId,
      originalDate: launchDate,
      startX: e.clientX
    }
    
    setLaunchDateDrag({
      productId,
      originalDate: launchDate,
      currentDayIndex: getDayIndexForDate(launchDate)
    })
  }, [onLaunchDateChange, getDayIndexForDate])
  
  const handleLaunchDragMove = useCallback((e: MouseEvent) => {
    if (!launchDragRef.current || !launchDateDrag) return
    
    const deltaX = e.clientX - launchDragRef.current.startX
    const daysDelta = Math.round(deltaX / DAY_WIDTH)
    const originalDayIndex = getDayIndexForDate(launchDragRef.current.originalDate)
    const newDayIndex = Math.max(0, Math.min(originalDayIndex + daysDelta, days.length - 1))
    
    setLaunchDateDrag(prev => prev ? { ...prev, currentDayIndex: newDayIndex } : null)
  }, [launchDateDrag, getDayIndexForDate, days.length])
  
  const handleLaunchDragEnd = useCallback(async () => {
    if (!launchDragRef.current || !launchDateDrag || !onLaunchDateChange) {
      launchDragRef.current = null
      setLaunchDateDrag(null)
      return
    }
    
    const { productId, originalDate } = launchDragRef.current
    const newDate = format(days[launchDateDrag.currentDayIndex], 'yyyy-MM-dd')
    
    launchDragRef.current = null
    setLaunchDateDrag(null)
    
    if (newDate !== originalDate) {
      await onLaunchDateChange(productId, newDate)
    }
  }, [launchDateDrag, onLaunchDateChange, days])
  
  // Scroll grab handlers
  const handleScrollGrabStart = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    if (!scrollContainerRef.current) return
    
    e.preventDefault()
    
    scrollGrabRef.current = {
      startX: e.clientX,
      startScrollLeft: scrollContainerRef.current.scrollLeft
    }
    setIsGrabbing(true)
  }, [])
  
  const handleScrollGrabMove = useCallback((e: MouseEvent) => {
    if (!scrollGrabRef.current || !scrollContainerRef.current) return
    
    const deltaX = e.clientX - scrollGrabRef.current.startX
    scrollContainerRef.current.scrollLeft = scrollGrabRef.current.startScrollLeft - deltaX
  }, [])
  
  const handleScrollGrabEnd = useCallback(() => {
    scrollGrabRef.current = null
    setIsGrabbing(false)
  }, [])
  
  // Update scroll progress when scrolling
  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current) return
    const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current
    const maxScroll = scrollWidth - clientWidth
    const progress = maxScroll > 0 ? scrollLeft / maxScroll : 0
    setScrollProgress(progress)
  }, [])
  
  // Add scroll listener
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current
    if (!scrollContainer) return
    
    scrollContainer.addEventListener('scroll', handleScroll)
    // Initial calculation
    handleScroll()
    
    return () => {
      scrollContainer.removeEventListener('scroll', handleScroll)
    }
  }, [handleScroll])
  
  // Window-level mouse handlers
  useEffect(() => {
    const handleWindowMouseMove = (e: MouseEvent) => {
      if (scrollGrabRef.current) {
        handleScrollGrabMove(e)
        return
      }
      if (launchDragRef.current) {
        handleLaunchDragMove(e)
      }
    }
    
    const handleWindowMouseUp = () => {
      if (scrollGrabRef.current) {
        handleScrollGrabEnd()
        return
      }
      
      if (launchDragRef.current) {
        handleLaunchDragEnd()
        return
      }
      
      if (!selectionRef.current) return
      
      // Get the final day index from the selection data
      const endDayIndex = selectionRef.current.data.endDayIndex
      completeSelection(endDayIndex)
    }
    
    // Use capture phase to get event before DndContext
    window.addEventListener('mousemove', handleWindowMouseMove)
    window.addEventListener('mouseup', handleWindowMouseUp, { capture: true })
    
    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove)
      window.removeEventListener('mouseup', handleWindowMouseUp, { capture: true })
    }
  }, [completeSelection, handleLaunchDragMove, handleLaunchDragEnd, handleScrollGrabMove, handleScrollGrabEnd])
  
  // Get selection visual properties
  const getSelectionStyle = useCallback((productId: string, platformId: string) => {
    if (!selection || selection.productId !== productId || selection.platformId !== platformId) {
      return null
    }
    
    const startIdx = Math.min(selection.startDayIndex, selection.endDayIndex)
    const endIdx = Math.max(selection.startDayIndex, selection.endDayIndex)
    const left = startIdx * DAY_WIDTH
    const width = (endIdx - startIdx + 1) * DAY_WIDTH
    
    const platform = platforms.find(p => p.id === platformId)
    
    return {
      left,
      width,
      backgroundColor: platform ? `${platform.color_hex}40` : 'rgba(59, 130, 246, 0.25)',
      borderColor: platform?.color_hex || '#3b82f6'
    }
  }, [selection, platforms])
  
  // Get launch date position for a product (considering drag state)
  const getLaunchDatePosition = useCallback((product: Product) => {
    if (!product.launch_date) return null
    
    // If this product is being dragged, use the drag state
    if (launchDateDrag && launchDateDrag.productId === product.id) {
      const left = launchDateDrag.currentDayIndex * DAY_WIDTH
      const date = days[launchDateDrag.currentDayIndex]
      return { left, date, isDragging: true }
    }
    
    // Otherwise use the actual launch date
    const dayIndex = getDayIndexForDate(product.launch_date)
    if (dayIndex &lt; 0 || dayIndex >= days.length) return null
    
    const left = dayIndex * DAY_WIDTH
    return { left, date: parseISO(product.launch_date), isDragging: false }
  }, [launchDateDrag, getDayIndexForDate, days])
  
  // Calculate scroll thumb style with position
  const scrollThumbStyle = useMemo(() => {
    const totalWidth = totalDays * DAY_WIDTH
    const containerWidth = scrollContainerRef.current?.clientWidth || 800
    const thumbWidthPercent = Math.max(10, Math.min(100, (containerWidth / totalWidth) * 100))
    const maxLeftPercent = 100 - thumbWidthPercent
    const leftPercent = scrollProgress * maxLeftPercent
    
    return { 
      width: `${thumbWidthPercent}%`,
      left: `${leftPercent}%`
    }
  }, [totalDays, scrollProgress])
  
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
    
    // Calculate cascade shifts for conflicting sales
    const cascadeShifts = calculateCascadeShifts(
      draggedSale.id,
      newStart,
      newEnd,
      draggedSale.product_id,
      draggedSale.platform_id,
      platform.cooldown_days
    )
    
    // Exclude cascade-shifted sales from validation
    const cascadeIds = new Set(cascadeShifts.map(s => s.saleId))
    const salesForValidation = allSales.filter(s => !cascadeIds.has(s.id))
    
    const validation = validateSale(
      {
        product_id: draggedSale.product_id,
        platform_id: draggedSale.platform_id,
        start_date: newStartStr,
        end_date: newEndStr,
        sale_type: draggedSale.sale_type
      },
      salesForValidation,
      platform,
      draggedSale.id
    )
    
    if (!validation.valid) {
      setValidationError(validation.message || 'Invalid sale position - conflicts with cooldown')
      setTimeout(() => setValidationError(null), 3000)
      setDraggedSale(null)
      return
    }
    
    // Show info message if we're cascading
    if (cascadeShifts.length > 0) {
      setValidationError(`Auto-shifted ${cascadeShifts.length} sale(s) to maintain cooldowns`)
      setTimeout(() => setValidationError(null), 3000)
    }
    
    // Optimistic update - immediately show new positions for all affected sales
    const newOptimistic: Record&lt;string, { startDate: string; endDate: string }&gt; = {
      [draggedSale.id]: { startDate: newStartStr, endDate: newEndStr }
    }
    for (const shift of cascadeShifts) {
      newOptimistic[shift.saleId] = { startDate: shift.newStart, endDate: shift.newEnd }
    }
    setOptimisticUpdates(prev => ({ ...prev, ...newOptimistic }))
    
    setDraggedSale(null)
    
    try {
      // Update the dragged sale first
      await onSaleUpdate(draggedSale.id, {
        start_date: newStartStr,
        end_date: newEndStr
      })
      
      // Update all cascade-shifted sales
      for (const shift of cascadeShifts) {
        await onSaleUpdate(shift.saleId, {
          start_date: shift.newStart,
          end_date: shift.newEnd
        })
      }
    } catch (err) {
      // Revert all optimistic updates on error
      setOptimisticUpdates(prev => {
        const updated = { ...prev }
        delete updated[draggedSale.id]
        for (const shift of cascadeShifts) {
          delete updated[shift.saleId]
        }
        return updated
      })
      setValidationError('Failed to save - position reverted')
      setTimeout(() => setValidationError(null), 3000)
    }
    
    // Clear optimistic updates after data refresh
    setTimeout(() => {
      setOptimisticUpdates(prev => {
        const updated = { ...prev }
        delete updated[draggedSale.id]
        for (const shift of cascadeShifts) {
          delete updated[shift.saleId]
        }
        return updated
      })
    }, 500)
  }
  
  // Clear selection if mouse leaves the container
  const handleMouseLeave = useCallback(() => {
    if (selectionRef.current) {
      selectionRef.current = null
      setSelection(null)
    }
  }, [])
  
  // Get sale count for a product
  const getSaleCount = useCallback((productId: string) => {
    return sales.filter(s => s.product_id === productId).length
  }, [sales])
  
  const totalWidth = totalDays * DAY_WIDTH
  
  return (
    &lt;div 
      className={`${styles.container} ${draggedSale ? styles.dragging : ''}`}
      onMouseLeave={handleMouseLeave}
      ref={containerRef}
    &gt;
      {validationError && (
        &lt;div className={`${styles.validationError} ${validationError.includes('Auto-shifted') ? styles.infoMessage : ''}`}&gt;
          &lt;span&gt;{validationError.includes('Auto-shifted') ? 'ℹ️' : '⚠️'} {validationError}&lt;/span&gt;
        &lt;/div&gt;
      )}
      
      &lt;div className={styles.legend}&gt;
        &lt;span className={styles.legendTitle}&gt;PLATFORMS:&lt;/span&gt;
        {platforms.slice(0, 8).map(platform => (
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
      
      {/* Scroll Grab Bar */}
      &lt;div 
        className={`${styles.scrollGrabBar} ${isGrabbing ? styles.grabbing : ''}`}
        onMouseDown={handleScrollGrabStart}
      &gt;
        &lt;div className={styles.scrollGrabTrack}&gt;
          &lt;div className={styles.scrollGrabThumb} style={scrollThumbStyle}&gt;
            &lt;span className={styles.scrollGrabIcon}&gt;⟷&lt;/span&gt;
          &lt;/div&gt;
        &lt;/div&gt;
        &lt;span className={styles.scrollGrabHint}&gt;Drag to scroll timeline&lt;/span&gt;
      &lt;/div&gt;
      
      &lt;div className={styles.scrollContainer} ref={scrollContainerRef}&gt;
        &lt;DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        &gt;
          &lt;div className={styles.timeline} style={{ width: totalWidth }}&gt;
            &lt;div className={styles.monthHeaders}&gt;
              {months.map(({ date, days: daysInMonth }, idx) => (
                &lt;div 
                  key={idx}
                  className={styles.monthHeader}
                  style={{ width: daysInMonth * DAY_WIDTH }}
                &gt;
                  {format(date, 'MMMM yyyy')}
                &lt;/div&gt;
              ))}
            &lt;/div&gt;
            
            &lt;div className={styles.dayHeaders}&gt;
              {days.map((day, idx) => {
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
            
            &lt;div className={styles.productRows}&gt;
              {groupedProducts.map(({ game, products: gameProducts }) => (
                &lt;div key={game.id} className={styles.gameGroup}&gt;
                  &lt;div className={styles.gameHeader}&gt;
                    &lt;div className={styles.productLabel}&gt;
                      &lt;span className={styles.gameName}&gt;{game.name}&lt;/span&gt;
                      &lt;span className={styles.clientName}&gt;{game.client?.name}&lt;/span&gt;
                    &lt;/div&gt;
                  &lt;/div&gt;
                  
                  {gameProducts.map(product => {
                    const productPlatforms = getPlatformsForProduct(product.id)
                    const saleCount = getSaleCount(product.id)
                    const launchPosition = getLaunchDatePosition(product)
                    
                    return (
                      &lt;div key={product.id} className={styles.productGroup}&gt;
                        {/* Product header row */}
                        &lt;div className={styles.productRow}&gt;
                          &lt;div className={styles.productLabel}&gt;
                            &lt;div className={styles.productLabelContent}&gt;
                              &lt;span className={styles.productName}&gt;{product.name}&lt;/span&gt;
                              &lt;span className={styles.productType}&gt;{product.product_type}&lt;/span&gt;
                              {product.launch_date && (
                                &lt;span className={styles.launchDateBadge}&gt;
                                  🚀 {format(parseISO(product.launch_date), 'MMM d')}
                                &lt;/span&gt;
                              )}
                            &lt;/div&gt;
                            &lt;div className={styles.productActions}&gt;
                              {onGenerateCalendar && (
                                &lt;button
                                  className={styles.generateButton}
                                  onClick={() => onGenerateCalendar(product.id, product.name, product.launch_date || undefined)}
                                  title="Auto-generate sale calendar for this product"
                                &gt;
                                  🗓️
                                &lt;/button&gt;
                              )}
                              {onClearSales && saleCount > 0 && (
                                &lt;button
                                  className={styles.clearButton}
                                  onClick={() => onClearSales(product.id, product.name)}
                                  title={`Clear sales for this product (${saleCount})`}
                                &gt;
                                  🗑️
                                &lt;/button&gt;
                              )}
                            &lt;/div&gt;
                          &lt;/div&gt;
                          
                          &lt;div className={styles.timelineRow} style={{ width: totalWidth }}&gt;
                            {days.map((day, idx) => {
                              const isWeekend = day.getDay() === 0 || day.getDay() === 6
                              return (
                                &lt;div
                                  key={idx}
                                  className={`${styles.dayCell} ${isWeekend ? styles.weekendCell : ''}`}
                                  style={{ left: idx * DAY_WIDTH, width: DAY_WIDTH }}
                                /&gt;
                              )
                            })}
                            
                            {/* Launch Date Marker - inside timeline row for proper clipping */}
                            {launchPosition && onLaunchDateChange && (
                              &lt;div
                                data-launch-marker
                                className={`${styles.launchMarker} ${launchPosition.isDragging ? styles.launchMarkerDragging : ''}`}
                                style={{ left: launchPosition.left }}
                                onMouseDown={(e) => handleLaunchDragStart(product.id, product.launch_date!, e)}
                                title={`Launch Date: ${format(launchPosition.date, 'MMM d, yyyy')}\nDrag to shift all sales`}
                              &gt;
                                &lt;div className={styles.launchMarkerLine} /&gt;
                                &lt;div className={styles.launchMarkerFlag}&gt;
                                  🚀
                                &lt;/div&gt;
                              &lt;/div&gt;
                            )}
                          &lt;/div&gt;
                        &lt;/div&gt;
                        
                        {/* Platform sub-rows for products with sales OR events */}
                        {productPlatforms.map(platform => {
                          const platformSales = getSalesForProductPlatform(product.id, platform.id)
                          const platformEventsForRow = getEventsForPlatform(platform.id)
                          const selectionStyle = getSelectionStyle(product.id, platform.id)
                          
                          return (
                            &lt;div key={`${product.id}-${platform.id}`} className={styles.platformRow}&gt;
                              &lt;div className={styles.platformLabel}&gt;
                                &lt;span 
                                  className={styles.platformIndicator}
                                  style={{ backgroundColor: platform.color_hex }}
                                /&gt;
                                &lt;span className={styles.platformName}&gt;{platform.name}&lt;/span&gt;
                              &lt;/div&gt;
                              
                              &lt;div 
                                className={`${styles.timelineRow} ${styles.clickableTimeline}`}
                                style={{ width: totalWidth }}
                              &gt;
                                {days.map((day, idx) => {
                                  const isWeekend = day.getDay() === 0 || day.getDay() === 6
                                  return (
                                    &lt;div
                                      key={idx}
                                      className={`${styles.dayCell} ${isWeekend ? styles.weekendCell : ''}`}
                                      style={{ left: idx * DAY_WIDTH, width: DAY_WIDTH }}
                                      onMouseDown={(e) => handleSelectionStart(product.id, platform.id, idx, e)}
                                      onMouseEnter={() => handleSelectionMove(idx)}
                                    /&gt;
                                  )
                                })}
                                
                                {/* Launch date line extension into platform rows */}
                                {launchPosition && (
                                  &lt;div
                                    className={styles.launchMarkerLineExtension}
                                    style={{ left: launchPosition.left + DAY_WIDTH / 2 - 1 }}
                                  /&gt;
                                )}
                                
                                {/* Selection preview */}
                                {selectionStyle && (
                                  &lt;div
                                    className={styles.selectionPreview}
                                    style={{
                                      left: selectionStyle.left,
                                      width: selectionStyle.width,
                                      backgroundColor: selectionStyle.backgroundColor,
                                      borderColor: selectionStyle.borderColor,
                                      pointerEvents: 'none',
                                    }}
                                  &gt;
                                    &lt;span className={styles.selectionLabel}&gt;
                                      {format(days[Math.min(selection!.startDayIndex, selection!.endDayIndex)], 'MMM d')} - {format(days[Math.max(selection!.startDayIndex, selection!.endDayIndex)], 'MMM d')}
                                    &lt;/span&gt;
                                  &lt;/div&gt;
                                )}
                                
                                {/* Platform Events as shaded backgrounds */}
                                {showEvents && platformEventsForRow.map(event => (
                                  &lt;div
                                    key={`event-${event.id}`}
                                    className={styles.platformEventShade}
                                    style={{
                                      left: event.left,
                                      width: event.width,
                                      backgroundColor: `${platform.color_hex}25`,
                                      borderColor: platform.color_hex,
                                    }}
                                    title={`${event.name}\n${format(event.displayStart, 'MMM d')} - ${format(event.displayEnd, 'MMM d, yyyy')}${!event.requires_cooldown ? '\n★ No cooldown required' : ''}`}
                                  &gt;
                                    &lt;span className={styles.platformEventLabel}&gt;
                                      {event.name}
                                      {!event.requires_cooldown && &lt;span className={styles.noCooldownStar}&gt;★&lt;/span&gt;}
                                    &lt;/span&gt;
                                  &lt;/div&gt;
                                ))}
                                
                                {/* Cooldowns and Sales */}
                                {platformSales.map(sale => {
                                  const left = getPositionForDate(sale.start_date)
                                  const width = getWidthForRange(sale.start_date, sale.end_date)
                                  const cooldown = getCooldownForSale(sale)
                                  
                                  return (
                                    &lt;div key={sale.id} data-sale-block&gt;
                                      {cooldown && (
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
                                      
                                      &lt;SaleBlock
                                        sale={sale}
                                        left={left}
                                        width={width}
                                        onEdit={onSaleEdit}
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
                    )
                  })}
                &lt;/div&gt;
              ))}
              
              {groupedProducts.length === 0 && (
                &lt;div className={styles.emptyState}&gt;
                  &lt;p&gt;No products found. Add products to start planning sales.&lt;/p&gt;
                &lt;/div&gt;
              )}
            &lt;/div&gt;
          &lt;/div&gt;
          
          &lt;DragOverlay&gt;
            {draggedSale && (
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
