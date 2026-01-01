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
  onSaleUpdate: (saleId: string, updates: Partial<Sale>) => Promise<void>
  onSaleDelete: (saleId: string) => Promise<void>
  onSaleEdit: (sale: SaleWithDetails) => void
  onCreateSale?: (prefill: { productId: string; platformId: string; startDate: string; endDate: string }) => void
  onGenerateCalendar?: (productId: string, productName: string, launchDate?: string) => void
  onClearSales?: (productId: string, productName: string) => void
  onLaunchDateChange?: (productId: string, newLaunchDate: string) => Promise<void>
  onEditLaunchDate?: (productId: string, productName: string, currentLaunchDate: string) => void
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
    onEditLaunchDate,
    allSales,
    showEvents = true
  } = props
  
  const [draggedSale, setDraggedSale] = useState<SaleWithDetails | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [optimisticUpdates, setOptimisticUpdates] = useState<Record<string, { startDate: string; endDate: string }>>({})
  const [selection, setSelection] = useState<SelectionState | null>(null)
  const [launchDateDrag, setLaunchDateDrag] = useState<LaunchDateDragState | null>(null)
  const [isGrabbing, setIsGrabbing] = useState(false)
  const [scrollProgress, setScrollProgress] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const scrollTrackRef = useRef<HTMLDivElement>(null)
  
  // Refs for selection - store everything needed at mousedown time
  const selectionRef = useRef<{
    data: SelectionState
    callback: typeof onCreateSale
    days: Date[]
  } | null>(null)
  
  // Ref for launch date drag
  const launchDragRef = useRef<{
    productId: string
    originalDate: string
    startX: number
    hasMoved: boolean
  } | null>(null)
  
  // Ref for scroll grab - now tracks if grabbing thumb or track
  const scrollGrabRef = useRef<{
    startX: number
    startScrollLeft: number
    isThumbDrag: boolean
  } | null>(null)
  
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
  
  // Calculate cascade shifts for sales that would conflict with a moved sale
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
      if (saleStart <= newEnd) continue
      
      // If this sale starts during the cooldown of the previous sale
      if (saleStart < currentCooldownEnd) {
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
    const salesBeforeMoved = otherSales.filter(s => parseISO(s.end_date) < newStart)
    
    for (const sale of salesBeforeMoved) {
      // Skip if this sale is already being shifted
      if (shifts.some(s => s.saleId === sale.id)) continue
      
      const saleStart = parseISO(sale.start_date)
      const saleEnd = parseISO(sale.end_date)
      const saleDuration = differenceInDays(saleEnd, saleStart)
      const saleCooldownEnd = addDays(saleEnd, cooldownDays)
      
      // If the sale's cooldown overlaps with the moved sale's start
      if (saleCooldownEnd > newStart) {
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
      startX: e.clientX,
      hasMoved: false
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
    
    // Track if we've moved significantly (more than 5px)
    if (Math.abs(deltaX) > 5) {
      launchDragRef.current.hasMoved = true
    }
    
    const daysDelta = Math.round(deltaX / DAY_WIDTH)
    const originalDayIndex = getDayIndexForDate(launchDragRef.current.originalDate)
    const newDayIndex = Math.max(0, Math.min(originalDayIndex + daysDelta, days.length - 1))
    
    setLaunchDateDrag(prev => prev ? { ...prev, currentDayIndex: newDayIndex } : null)
  }, [launchDateDrag, getDayIndexForDate, days.length])
  
  const handleLaunchDragEnd = useCallback(async () => {
    if (!launchDragRef.current || !launchDateDrag) {
      launchDragRef.current = null
      setLaunchDateDrag(null)
      return
    }
    
    const { productId, originalDate, hasMoved } = launchDragRef.current
    const newDate = format(days[launchDateDrag.currentDayIndex], 'yyyy-MM-dd')
    
    launchDragRef.current = null
    setLaunchDateDrag(null)
    
    // If didn't move significantly, treat as click -> open edit modal
    if (!hasMoved && onEditLaunchDate) {
      const product = products.find(p => p.id === productId)
      if (product) {
        onEditLaunchDate(productId, product.name, originalDate)
      }
      return
    }
    
    // Otherwise, save the drag result
    if (newDate !== originalDate && onLaunchDateChange) {
      await onLaunchDateChange(productId, newDate)
    }
  }, [launchDateDrag, onLaunchDateChange, onEditLaunchDate, days, products])
  
  // Scroll grab handlers - now with real-time updates
  const updateScrollFromPosition = useCallback((clientX: number, isThumbDrag: boolean) => {
    if (!scrollContainerRef.current || !scrollTrackRef.current) return
    
    const trackRect = scrollTrackRef.current.getBoundingClientRect()
    const { scrollWidth, clientWidth } = scrollContainerRef.current
    const maxScroll = scrollWidth - clientWidth
    
    if (isThumbDrag && scrollGrabRef.current) {
      // Thumb drag - move relative to start position
      const deltaX = clientX - scrollGrabRef.current.startX
      const trackWidth = trackRect.width
      const scrollDelta = (deltaX / trackWidth) * maxScroll
      const newScrollLeft = Math.max(0, Math.min(scrollGrabRef.current.startScrollLeft + scrollDelta, maxScroll))
      scrollContainerRef.current.scrollLeft = newScrollLeft
    } else {
      // Track click - jump to position
      const clickX = clientX - trackRect.left
      const trackWidth = trackRect.width
      const progress = clickX / trackWidth
      const newScrollLeft = Math.max(0, Math.min(progress * maxScroll, maxScroll))
      scrollContainerRef.current.scrollLeft = newScrollLeft
    }
  }, [])
  
  const handleScrollThumbStart = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    if (!scrollContainerRef.current) return
    
    e.preventDefault()
    e.stopPropagation()
    
    scrollGrabRef.current = {
      startX: e.clientX,
      startScrollLeft: scrollContainerRef.current.scrollLeft,
      isThumbDrag: true
    }
    setIsGrabbing(true)
  }, [])
  
  const handleScrollTrackClick = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    // Don't handle if clicking on the thumb itself
    if ((e.target as HTMLElement).classList.contains(styles.scrollGrabThumb)) return
    
    e.preventDefault()
    
    // Jump to clicked position
    updateScrollFromPosition(e.clientX, false)
    
    // Start drag from this position
    if (scrollContainerRef.current) {
      scrollGrabRef.current = {
        startX: e.clientX,
        startScrollLeft: scrollContainerRef.current.scrollLeft,
        isThumbDrag: false
      }
      setIsGrabbing(true)
    }
  }, [updateScrollFromPosition])
  
  const handleScrollGrabMove = useCallback((e: MouseEvent) => {
    if (!scrollGrabRef.current) return
    updateScrollFromPosition(e.clientX, scrollGrabRef.current.isThumbDrag)
  }, [updateScrollFromPosition])
  
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
    if (dayIndex < 0 || dayIndex >= days.length) return null
    
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
    const newOptimistic: Record<string, { startDate: string; endDate: string }> = {
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
    <div 
      className={`${styles.container} ${draggedSale ? styles.dragging : ''}`}
      onMouseLeave={handleMouseLeave}
      ref={containerRef}
    >
      {validationError && (
        <div className={`${styles.validationError} ${validationError.includes('Auto-shifted') ? styles.infoMessage : ''}`}>
          <span>{validationError.includes('Auto-shifted') ? 'ℹ️' : '⚠️'} {validationError}</span>
        </div>
      )}
      
      <div className={styles.legend}>
        <span className={styles.legendTitle}>PLATFORMS:</span>
        {platforms.map(platform => (
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
      
      {/* Scroll Grab Bar */}
      <div 
        className={`${styles.scrollGrabBar} ${isGrabbing ? styles.grabbing : ''}`}
      >
        <div 
          className={styles.scrollGrabTrack}
          ref={scrollTrackRef}
          onMouseDown={handleScrollTrackClick}
        >
          <div 
            className={styles.scrollGrabThumb} 
            style={scrollThumbStyle}
            onMouseDown={handleScrollThumbStart}
          >
            <span className={styles.scrollGrabIcon}>⟷</span>
          </div>
        </div>
        <span className={styles.scrollGrabHint}>
          {isGrabbing ? 'Dragging...' : 'Click or drag to scroll timeline'}
        </span>
      </div>
      
      <div className={styles.scrollContainer} ref={scrollContainerRef}>
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
                    const saleCount = getSaleCount(product.id)
                    const launchPosition = getLaunchDatePosition(product)
                    
                    return (
                      <div key={product.id} className={styles.productGroup}>
                        {/* Product header row */}
                        <div className={styles.productRow}>
                          <div className={styles.productLabel}>
                            <div className={styles.productLabelContent}>
                              <span className={styles.productName}>{product.name}</span>
                              <span className={styles.productType}>{product.product_type}</span>
                              {product.launch_date && (
                                <span 
                                  className={`${styles.launchDateBadge} ${onEditLaunchDate ? styles.clickable : ''}`}
                                  onClick={() => onEditLaunchDate && product.launch_date && onEditLaunchDate(product.id, product.name, product.launch_date)}
                                  title="Click to edit launch date"
                                >
                                  🚀 {format(parseISO(product.launch_date), 'MMM d')}
                                </span>
                              )}
                            </div>
                            <div className={styles.productActions}>
                              {onGenerateCalendar && (
                                <button
                                  className={styles.generateButton}
                                  onClick={() => onGenerateCalendar(product.id, product.name, product.launch_date || undefined)}
                                  title="Auto-generate sale calendar for this product"
                                >
                                  🗓️
                                </button>
                              )}
                              {onClearSales && saleCount > 0 && (
                                <button
                                  className={styles.clearButton}
                                  onClick={() => onClearSales(product.id, product.name)}
                                  title={`Clear sales for this product (${saleCount})`}
                                >
                                  🗑️
                                </button>
                              )}
                            </div>
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
                            
                            {/* Launch Date Marker - inside timeline row for proper clipping */}
                            {launchPosition && (onLaunchDateChange || onEditLaunchDate) && (
                              <div
                                data-launch-marker
                                className={`${styles.launchMarker} ${launchPosition.isDragging ? styles.launchMarkerDragging : ''}`}
                                style={{ left: launchPosition.left }}
                                onMouseDown={(e) => onLaunchDateChange && handleLaunchDragStart(product.id, product.launch_date!, e)}
                                title={`Launch Date: ${format(launchPosition.date, 'MMM d, yyyy')}\n${onLaunchDateChange ? 'Drag to shift all sales, or click to edit' : 'Click to edit'}`}
                              >
                                <div className={styles.launchMarkerLine} />
                                <div className={styles.launchMarkerFlag}>
                                  🚀
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {/* Platform sub-rows for products with sales OR events */}
                        {productPlatforms.map(platform => {
                          const platformSales = getSalesForProductPlatform(product.id, platform.id)
                          const platformEventsForRow = getEventsForPlatform(platform.id)
                          const selectionStyle = getSelectionStyle(product.id, platform.id)
                          
                          return (
                            <div key={`${product.id}-${platform.id}`} className={styles.platformRow}>
                              <div className={styles.platformLabel}>
                                <span 
                                  className={styles.platformIndicator}
                                  style={{ backgroundColor: platform.color_hex }}
                                />
                                <span className={styles.platformName}>{platform.name}</span>
                              </div>
                              
                              <div 
                                className={`${styles.timelineRow} ${styles.clickableTimeline}`}
                                style={{ width: totalWidth }}
                              >
                                {days.map((day, idx) => {
                                  const isWeekend = day.getDay() === 0 || day.getDay() === 6
                                  return (
                                    <div
                                      key={idx}
                                      className={`${styles.dayCell} ${isWeekend ? styles.weekendCell : ''}`}
                                      style={{ left: idx * DAY_WIDTH, width: DAY_WIDTH }}
                                      onMouseDown={(e) => handleSelectionStart(product.id, platform.id, idx, e)}
                                      onMouseEnter={() => handleSelectionMove(idx)}
                                    />
                                  )
                                })}
                                
                                {/* Launch date line extension into platform rows */}
                                {launchPosition && (
                                  <div
                                    className={styles.launchMarkerLineExtension}
                                    style={{ left: launchPosition.left + DAY_WIDTH / 2 - 1 }}
                                  />
                                )}
                                
                                {/* Selection preview */}
                                {selectionStyle && (
                                  <div
                                    className={styles.selectionPreview}
                                    style={{
                                      left: selectionStyle.left,
                                      width: selectionStyle.width,
                                      backgroundColor: selectionStyle.backgroundColor,
                                      borderColor: selectionStyle.borderColor,
                                      pointerEvents: 'none',
                                    }}
                                  >
                                    <span className={styles.selectionLabel}>
                                      {format(days[Math.min(selection!.startDayIndex, selection!.endDayIndex)], 'MMM d')} - {format(days[Math.max(selection!.startDayIndex, selection!.endDayIndex)], 'MMM d')}
                                    </span>
                                  </div>
                                )}
                                
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
                                    <div key={sale.id} data-sale-block>
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
