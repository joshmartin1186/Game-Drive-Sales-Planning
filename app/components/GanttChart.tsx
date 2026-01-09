'use client'

import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { DndContext, DragEndEvent, DragStartEvent, useSensor, useSensors, PointerSensor, DragOverlay } from '@dnd-kit/core'
import { format, addDays, differenceInDays, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, isToday, startOfQuarter, endOfQuarter, eachQuarterOfInterval, addMonths, subMonths } from 'date-fns'
import { Sale, Platform, Product, Game, Client, SaleWithDetails, PlatformEvent, LaunchConflict } from '@/lib/types'
import { validateSale } from '@/lib/validation'
import { normalizeToLocalDate } from '@/lib/dateUtils'
import SaleBlock from './SaleBlock'
import styles from './GanttChart.module.css'

interface GanttChartProps {
  sales: SaleWithDetails[]
  products: (Product &amp; { game: Game &amp; { client: Client } })[]
  platforms: Platform[]
  platformEvents: PlatformEvent[]
  timelineStart: Date
  monthCount: number
  onSaleUpdate: (saleId: string, updates: Partial&lt;Sale&gt;) =&gt; Promise&lt;void&gt;
  onSaleDelete: (saleId: string) =&gt; Promise&lt;void&gt;
  onSaleEdit: (sale: SaleWithDetails) =&gt; void
  onSaleDuplicate?: (sale: SaleWithDetails) =&gt; void
  onCreateSale?: (prefill: { productId: string; platformId: string; startDate: string; endDate: string }) =&gt; void
  onGenerateCalendar?: (productId: string, productName: string, launchDate?: string) =&gt; void
  onClearSales?: (productId: string, productName: string) =&gt; void
  onLaunchDateChange?: (productId: string, newLaunchDate: string) =&gt; Promise&lt;void&gt;
  onEditLaunchDate?: (productId: string, productName: string, currentLaunchDate: string, currentDuration: number) =&gt; void
  onLaunchSaleDurationChange?: (productId: string, newDuration: number) =&gt; Promise&lt;void&gt;
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

interface LaunchSaleResizeState {
  productId: string
  originalDuration: number
  currentDuration: number
  edge: 'right'
}

interface CascadeShift {
  saleId: string
  newStart: string
  newEnd: string
}

interface PlatformGapInfo {
  quarter: string
  availableDays: number
  longestGap: number
}

// Zoom presets - now based on months visible in viewport
const ZOOM_LEVELS = [
  { name: 'Year', monthsVisible: 12, label: 'Y' },
  { name: 'Half Year', monthsVisible: 6, label: 'H' },
  { name: 'Quarter', monthsVisible: 3, label: 'Q' },
  { name: 'Month', monthsVisible: 1.5, label: 'M' },
  { name: '2 Weeks', monthsVisible: 0.5, label: '2W' },
]

const DEFAULT_ZOOM_INDEX = 1 // Half Year view
const SIDEBAR_WIDTH = 220 // Width of the product label sidebar

const ROW_HEIGHT = 40
const HEADER_HEIGHT = 60
const SCROLL_THRESHOLD = 300 // pixels from edge to trigger load
const MONTHS_TO_LOAD = 3 // months to add when expanding

const DAY_STATUS = {
  AVAILABLE: 0,
  IN_SALE: 1,
  IN_COOLDOWN: 2
} as const

const MIN_LAUNCH_SALE_DAYS = 1
const MAX_LAUNCH_SALE_DAYS = 30

export default function GanttChart(props: GanttChartProps) {
  const {
    sales,
    products,
    platforms,
    platformEvents,
    timelineStart: initialTimelineStart,
    monthCount: initialMonthCount,
    onSaleUpdate,
    onSaleDelete,
    onSaleEdit,
    onSaleDuplicate,
    onCreateSale,
    onGenerateCalendar,
    onClearSales,
    onLaunchDateChange,
    onEditLaunchDate,
    onLaunchSaleDurationChange,
    allSales,
    showEvents = true
  } = props
  
  // Timeline state - now controlled internally for infinite scroll
  const [timelineStart, setTimelineStart] = useState(() =&gt; {
    // Start 3 months before initial to allow past navigation
    return subMonths(initialTimelineStart, 3)
  })
  const [monthCount, setMonthCount] = useState(initialMonthCount + 6) // Extra months for buffer
  
  // Zoom state and container width for responsive sizing
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX)
  const [containerWidth, setContainerWidth] = useState(1200) // Default, will be updated
  
  // Calculate dayWidth dynamically based on container width and zoom level
  const dayWidth = useMemo(() =&gt; {
    const monthsVisible = ZOOM_LEVELS[zoomIndex].monthsVisible
    const daysVisible = monthsVisible * 30.44 // Average days per month
    const availableWidth = containerWidth - SIDEBAR_WIDTH
    const calculated = availableWidth / daysVisible
    // Ensure minimum dayWidth for usability
    return Math.max(4, calculated)
  }, [zoomIndex, containerWidth])
  
  const [draggedSale, setDraggedSale] = useState&lt;SaleWithDetails | null&gt;(null)
  const [validationError, setValidationError] = useState&lt;string | null&gt;(null)
  const [optimisticUpdates, setOptimisticUpdates] = useState&lt;Record&lt;string, { startDate: string; endDate: string }&gt;&gt;({})
  const [selection, setSelection] = useState&lt;SelectionState | null&gt;(null)
  const [launchDateDrag, setLaunchDateDrag] = useState&lt;LaunchDateDragState | null&gt;(null)
  const [launchSaleResize, setLaunchSaleResize] = useState&lt;LaunchSaleResizeState | null&gt;(null)
  const [isGrabbing, setIsGrabbing] = useState(false)
  const [scrollProgress, setScrollProgress] = useState(0)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const containerRef = useRef&lt;HTMLDivElement&gt;(null)
  const scrollContainerRef = useRef&lt;HTMLDivElement&gt;(null)
  const scrollTrackRef = useRef&lt;HTMLDivElement&gt;(null)
  const hasInitiallyScrolled = useRef(false) // Track if we've done initial scroll
  
  const selectionRef = useRef&lt;{
    data: SelectionState
    callback: typeof onCreateSale
    days: Date[]
  } | null&gt;(null)
  
  const launchDragRef = useRef&lt;{
    productId: string
    originalDate: string
    startX: number
    hasMoved: boolean
  } | null&gt;(null)
  
  const launchSaleResizeRef = useRef&lt;{
    productId: string
    originalDuration: number
    startX: number
    launchDate: string
  } | null&gt;(null)
  
  const scrollGrabRef = useRef&lt;{
    startX: number
    startScrollLeft: number
    isThumbDrag: boolean
  } | null&gt;(null)
  
  // Track container width with ResizeObserver
  useEffect(() =&gt; {
    const container = containerRef.current
    if (!container) return
    
    const resizeObserver = new ResizeObserver((entries) =&gt; {
      for (const entry of entries) {
        const width = entry.contentRect.width
        if (width &gt; 0) {
          setContainerWidth(width)
        }
      }
    })
    
    resizeObserver.observe(container)
    // Initial measurement
    setContainerWidth(container.clientWidth || 1200)
    
    return () =&gt; resizeObserver.disconnect()
  }, [])
  
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  )
  
  const { months, days, totalDays, todayIndex } = useMemo(() =&gt; {
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
    
    const todayIdx = daysArr.findIndex(day =&gt; isToday(day))
    
    return { months: monthsArr, days: daysArr, totalDays: daysArr.length, todayIndex: todayIdx }
  }, [timelineStart, monthCount])

  const timelineEnd = useMemo(() =&gt; {
    const end = new Date(timelineStart)
    end.setMonth(end.getMonth() + monthCount)
    return end
  }, [timelineStart, monthCount])

  const quarters = useMemo(() =&gt; {
    return eachQuarterOfInterval({
      start: timelineStart,
      end: timelineEnd
    })
  }, [timelineStart, timelineEnd])

  // Calculate visible date range for display
  const visibleDateRange = useMemo(() =&gt; {
    if (!scrollContainerRef.current) return null
    const scrollLeft = scrollContainerRef.current.scrollLeft
    const visibleWidth = containerWidth - SIDEBAR_WIDTH
    const startDayIndex = Math.floor(scrollLeft / dayWidth)
    const endDayIndex = Math.min(Math.floor((scrollLeft + visibleWidth) / dayWidth), days.length - 1)
    
    if (startDayIndex &gt;= 0 &amp;&amp; startDayIndex &lt; days.length &amp;&amp; endDayIndex &gt;= 0) {
      return {
        start: days[startDayIndex],
        end: days[endDayIndex]
      }
    }
    return null
  }, [days, dayWidth, scrollProgress, containerWidth]) // scrollProgress triggers recalc

  // Find all Steam platform IDs for conflict detection
  const steamPlatformIds = useMemo(() =&gt; {
    return platforms
      .filter(p =&gt; p.name.toLowerCase().includes('steam'))
      .map(p =&gt; p.id)
  }, [platforms])

  // Get Steam seasonal events for conflict detection (from ANY Steam platform)
  const steamSeasonalEvents = useMemo(() =&gt; {
    if (steamPlatformIds.length === 0) return []
    return platformEvents.filter(e =&gt; 
      steamPlatformIds.includes(e.platform_id) &amp;&amp; 
      e.event_type === 'seasonal'
    )
  }, [platformEvents, steamPlatformIds])

  // Check if launch sale conflicts with Steam seasonal sales
  const getLaunchSaleConflicts = useCallback((launchDate: string, duration: number): LaunchConflict[] =&gt; {
    if (steamPlatformIds.length === 0 || steamSeasonalEvents.length === 0) return []

    const launchStart = normalizeToLocalDate(launchDate)
    const launchEnd = addDays(launchStart, duration - 1)

    const conflicts: LaunchConflict[] = []

    for (const event of steamSeasonalEvents) {
      const eventStart = normalizeToLocalDate(event.start_date)
      const eventEnd = normalizeToLocalDate(event.end_date)

      // Check for overlap
      if (launchStart &lt;= eventEnd &amp;&amp; launchEnd &gt;= eventStart) {
        const overlapStart = launchStart &gt; eventStart ? launchStart : eventStart
        const overlapEnd = launchEnd &lt; eventEnd ? launchEnd : eventEnd
        const overlapDays = differenceInDays(overlapEnd, overlapStart) + 1

        conflicts.push({
          eventName: event.name,
          eventStart,
          eventEnd,
          overlapStart,
          overlapEnd,
          overlapDays
        })
      }
    }

    return conflicts
  }, [steamPlatformIds, steamSeasonalEvents])

  const platformGaps = useMemo(() =&gt; {
    const gapMap = new Map&lt;string, PlatformGapInfo[]&gt;()

    for (const product of products) {
      for (const platform of platforms) {
        const key = `${product.id}-${platform.id}`
        const cooldownDays = platform.cooldown_days || 28

        const productSales = sales
          .filter(s =&gt; s.product_id === product.id &amp;&amp; s.platform_id === platform.id)
          .map(s =&gt; ({
            start: normalizeToLocalDate(s.start_date),
            end: normalizeToLocalDate(s.end_date),
            saleType: s.sale_type
          }))
          .sort((a, b) =&gt; a.start.getTime() - b.start.getTime())

        const quarterGaps: PlatformGapInfo[] = []

        for (const quarterStart of quarters) {
          const quarterEnd = endOfQuarter(quarterStart)
          const quarterLabel = `Q${Math.floor(quarterStart.getMonth() / 3) + 1}`
          
          const daysInQuarter = differenceInDays(quarterEnd, quarterStart) + 1
          const dayStatus = new Array(daysInQuarter).fill(DAY_STATUS.AVAILABLE)
          
          for (const sale of productSales) {
            if (sale.end &gt;= quarterStart &amp;&amp; sale.start &lt;= quarterEnd) {
              const overlapStart = sale.start &lt; quarterStart ? quarterStart : sale.start
              const overlapEnd = sale.end &gt; quarterEnd ? quarterEnd : sale.end
              
              const startIdx = differenceInDays(overlapStart, quarterStart)
              const endIdx = differenceInDays(overlapEnd, quarterStart)
              
              for (let i = startIdx; i &lt;= endIdx &amp;&amp; i &lt; daysInQuarter; i++) {
                if (i &gt;= 0) dayStatus[i] = DAY_STATUS.IN_SALE
              }
            }
          }
          
          for (const sale of productSales) {
            if (sale.saleType === 'special') continue
            
            const cooldownStart = addDays(sale.end, 1)
            const cooldownEnd = addDays(sale.end, cooldownDays)
            
            if (cooldownEnd &gt;= quarterStart &amp;&amp; cooldownStart &lt;= quarterEnd) {
              const overlapStart = cooldownStart &lt; quarterStart ? quarterStart : cooldownStart
              const overlapEnd = cooldownEnd &gt; quarterEnd ? quarterEnd : cooldownEnd
              
              const startIdx = differenceInDays(overlapStart, quarterStart)
              const endIdx = differenceInDays(overlapEnd, quarterStart)
              
              for (let i = startIdx; i &lt;= endIdx &amp;&amp; i &lt; daysInQuarter; i++) {
                if (i &gt;= 0 &amp;&amp; dayStatus[i] !== DAY_STATUS.IN_SALE) {
                  dayStatus[i] = DAY_STATUS.IN_COOLDOWN
                }
              }
            }
          }

          const availableDays = dayStatus.filter(s =&gt; s === DAY_STATUS.AVAILABLE).length

          let longestGap = 0
          let currentGap = 0

          for (let i = 0; i &lt; daysInQuarter; i++) {
            if (dayStatus[i] === DAY_STATUS.AVAILABLE) {
              currentGap++
            } else {
              if (currentGap &gt; longestGap) longestGap = currentGap
              currentGap = 0
            }
          }
          if (currentGap &gt; longestGap) longestGap = currentGap

          if (availableDays &gt;= 7) {
            quarterGaps.push({
              quarter: quarterLabel,
              availableDays,
              longestGap
            })
          }
        }

        if (quarterGaps.length &gt; 0) {
          gapMap.set(key, quarterGaps)
        }
      }
    }

    return gapMap
  }, [products, platforms, sales, quarters])

  const getGapIndicator = useCallback((productId: string, platformId: string): { text: string; isWarning: boolean } | null =&gt; {
    const key = `${productId}-${platformId}`
    const gaps = platformGaps.get(key)
    
    if (!gaps || gaps.length === 0) return null

    const now = new Date()
    const currentQuarter = `Q${Math.floor(now.getMonth() / 3) + 1}`

    const currentGap = gaps.find(g =&gt; g.quarter === currentQuarter)
    if (currentGap &amp;&amp; currentGap.availableDays &gt;= 7) {
      return {
        text: `${currentGap.availableDays}d gap ${currentGap.quarter}`,
        isWarning: currentGap.availableDays &gt;= 30
      }
    }

    const sortedGaps = [...gaps].sort((a, b) =&gt; b.availableDays - a.availableDays)
    const largestGap = sortedGaps[0]
    
    if (largestGap &amp;&amp; largestGap.availableDays &gt;= 14) {
      return {
        text: `${largestGap.availableDays}d gap ${largestGap.quarter}`,
        isWarning: largestGap.availableDays &gt;= 30
      }
    }

    return null
  }, [platformGaps])
  
  // Infinite scroll - expand timeline when near edges
  const handleInfiniteScroll = useCallback(() =&gt; {
    if (!scrollContainerRef.current || isLoadingMore) return
    
    const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current
    const maxScroll = scrollWidth - clientWidth
    
    // Check if near start - prepend months
    if (scrollLeft &lt; SCROLL_THRESHOLD) {
      setIsLoadingMore(true)
      
      // Calculate how many pixels we're adding
      const daysToAdd = MONTHS_TO_LOAD * 30 // Approximate
      const pixelsToAdd = daysToAdd * dayWidth
      
      setTimelineStart(prev =&gt; subMonths(prev, MONTHS_TO_LOAD))
      setMonthCount(prev =&gt; prev + MONTHS_TO_LOAD)
      
      // After state update, adjust scroll to maintain position
      requestAnimationFrame(() =&gt; {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollLeft = scrollLeft + pixelsToAdd
        }
        setIsLoadingMore(false)
      })
    }
    
    // Check if near end - append months
    if (scrollLeft &gt; maxScroll - SCROLL_THRESHOLD) {
      setIsLoadingMore(true)
      setMonthCount(prev =&gt; prev + MONTHS_TO_LOAD)
      
      requestAnimationFrame(() =&gt; {
        setIsLoadingMore(false)
      })
    }
  }, [isLoadingMore, dayWidth])
  
  const scrollToToday = useCallback(() =&gt; {
    if (todayIndex === -1 || !scrollContainerRef.current) return
    
    const todayPosition = todayIndex * dayWidth
    const visibleWidth = containerWidth - SIDEBAR_WIDTH
    const scrollTarget = todayPosition - (visibleWidth / 2) + (dayWidth / 2)
    
    scrollContainerRef.current.scrollTo({
      left: Math.max(0, scrollTarget),
      behavior: 'smooth'
    })
  }, [todayIndex, dayWidth, containerWidth])
  
  // Zoom handlers
  const handleZoomIn = useCallback(() =&gt; {
    if (zoomIndex &lt; ZOOM_LEVELS.length - 1) {
      const scrollContainer = scrollContainerRef.current
      if (scrollContainer) {
        // Calculate center day before zoom
        const visibleWidth = containerWidth - SIDEBAR_WIDTH
        const centerX = scrollContainer.scrollLeft + visibleWidth / 2
        const centerDayIndex = centerX / dayWidth
        
        setZoomIndex(prev =&gt; prev + 1)
        
        // After zoom, scroll to maintain center
        requestAnimationFrame(() =&gt; {
          const newMonthsVisible = ZOOM_LEVELS[zoomIndex + 1].monthsVisible
          const newDaysVisible = newMonthsVisible * 30.44
          const newDayWidth = Math.max(4, (containerWidth - SIDEBAR_WIDTH) / newDaysVisible)
          const newScrollLeft = centerDayIndex * newDayWidth - visibleWidth / 2
          scrollContainer.scrollLeft = Math.max(0, newScrollLeft)
        })
      } else {
        setZoomIndex(prev =&gt; prev + 1)
      }
    }
  }, [zoomIndex, dayWidth, containerWidth])
  
  const handleZoomOut = useCallback(() =&gt; {
    if (zoomIndex &gt; 0) {
      const scrollContainer = scrollContainerRef.current
      if (scrollContainer) {
        // Calculate center day before zoom
        const visibleWidth = containerWidth - SIDEBAR_WIDTH
        const centerX = scrollContainer.scrollLeft + visibleWidth / 2
        const centerDayIndex = centerX / dayWidth
        
        setZoomIndex(prev =&gt; prev - 1)
        
        // After zoom, scroll to maintain center
        requestAnimationFrame(() =&gt; {
          const newMonthsVisible = ZOOM_LEVELS[zoomIndex - 1].monthsVisible
          const newDaysVisible = newMonthsVisible * 30.44
          const newDayWidth = Math.max(4, (containerWidth - SIDEBAR_WIDTH) / newDaysVisible)
          const newScrollLeft = centerDayIndex * newDayWidth - visibleWidth / 2
          scrollContainer.scrollLeft = Math.max(0, newScrollLeft)
        })
      } else {
        setZoomIndex(prev =&gt; prev - 1)
      }
    }
  }, [zoomIndex, dayWidth, containerWidth])
  
  const handleZoomPreset = useCallback((index: number) =&gt; {
    if (index &gt;= 0 &amp;&amp; index &lt; ZOOM_LEVELS.length &amp;&amp; index !== zoomIndex) {
      const scrollContainer = scrollContainerRef.current
      if (scrollContainer) {
        const visibleWidth = containerWidth - SIDEBAR_WIDTH
        const centerX = scrollContainer.scrollLeft + visibleWidth / 2
        const centerDayIndex = centerX / dayWidth
        
        setZoomIndex(index)
        
        requestAnimationFrame(() =&gt; {
          const newMonthsVisible = ZOOM_LEVELS[index].monthsVisible
          const newDaysVisible = newMonthsVisible * 30.44
          const newDayWidth = Math.max(4, (containerWidth - SIDEBAR_WIDTH) / newDaysVisible)
          const newScrollLeft = centerDayIndex * newDayWidth - visibleWidth / 2
          scrollContainer.scrollLeft = Math.max(0, newScrollLeft)
        })
      } else {
        setZoomIndex(index)
      }
    }
  }, [zoomIndex, dayWidth, containerWidth])
  
  // Keyboard shortcuts for zoom
  useEffect(() =&gt; {
    const handleKeyDown = (e: KeyboardEvent) =&gt; {
      if ((e.ctrlKey || e.metaKey) &amp;&amp; (e.key === '=' || e.key === '+')) {
        e.preventDefault()
        handleZoomIn()
      } else if ((e.ctrlKey || e.metaKey) &amp;&amp; e.key === '-') {
        e.preventDefault()
        handleZoomOut()
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () =&gt; window.removeEventListener('keydown', handleKeyDown)
  }, [handleZoomIn, handleZoomOut])
  
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
    
    Array.from(gameMap.entries()).forEach(([gameId, prods]) =&gt; {
      if (prods.length &gt; 0 &amp;&amp; prods[0].game) {
        groups.push({ game: prods[0].game, products: prods })
      }
    })
    
    return groups.sort((a, b) =&gt; a.game.name.localeCompare(b.game.name))
  }, [products])
  
  const eventsByPlatform = useMemo(() =&gt; {
    const map = new Map&lt;string, PlatformEvent[]&gt;()
    if (!showEvents) return map
    
    const timelineEndDay = days[days.length - 1]
    
    for (const event of platformEvents) {
      const eventStart = normalizeToLocalDate(event.start_date)
      const eventEnd = normalizeToLocalDate(event.end_date)
      
      if (eventEnd &gt;= days[0] &amp;&amp; eventStart &lt;= timelineEndDay) {
        const platformId = event.platform_id
        if (!map.has(platformId)) {
          map.set(platformId, [])
        }
        map.get(platformId)!.push(event)
      }
    }
    
    return map
  }, [platformEvents, days, showEvents])
  
  const platformsWithEventsArray = useMemo(() =&gt; {
    return Array.from(eventsByPlatform.keys())
  }, [eventsByPlatform])
  
  const getPositionForDate = useCallback((date: Date | string): number =&gt; {
    const d = typeof date === 'string' ? normalizeToLocalDate(date) : date
    const daysDiff = differenceInDays(d, days[0])
    return daysDiff * dayWidth
  }, [days, dayWidth])
  
  const getWidthForRange = useCallback((start: Date | string, end: Date | string): number =&gt; {
    const s = typeof start === 'string' ? normalizeToLocalDate(start) : start
    const e = typeof end === 'string' ? normalizeToLocalDate(end) : end
    const daysDiff = differenceInDays(e, s) + 1
    return daysDiff * dayWidth
  }, [dayWidth])
  
  const getDayIndexForDate = useCallback((date: Date | string): number =&gt; {
    const d = typeof date === 'string' ? normalizeToLocalDate(date) : date
    return differenceInDays(d, days[0])
  }, [days])
  
  const getEventsForPlatform = useCallback((platformId: string) =&gt; {
    const events = eventsByPlatform.get(platformId) || []
    return events.map(event =&gt; {
      const eventStart = normalizeToLocalDate(event.start_date)
      const eventEnd = normalizeToLocalDate(event.end_date)
      const displayStart = eventStart &lt; days[0] ? days[0] : eventStart
      const displayEnd = eventEnd &gt; days[days.length - 1] ? days[days.length - 1] : eventEnd
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
  
  const getSalesForProduct = useCallback((productId: string) =&gt; {
    return sales
      .filter(sale =&gt; sale.product_id === productId)
      .map(sale =&gt; {
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
  
  const getPlatformsForProduct = useCallback((productId: string) =&gt; {
    const productSales = getSalesForProduct(productId)
    const platformIdsWithSales = productSales.map(s =&gt; s.platform_id)
    
    const allPlatformIdsSet = new Set([
      ...platformIdsWithSales,
      ...(showEvents ? platformsWithEventsArray : [])
    ])
    
    return Array.from(allPlatformIdsSet)
      .map(id =&gt; platforms.find(p =&gt; p.id === id))
      .filter((p): p is Platform =&gt; p !== undefined)
      .sort((a, b) =&gt; a.name.localeCompare(b.name))
  }, [getSalesForProduct, platforms, platformsWithEventsArray, showEvents])
  
  const getSalesForProductPlatform = useCallback((productId: string, platformId: string) =&gt; {
    return getSalesForProduct(productId).filter(sale =&gt; sale.platform_id === platformId)
  }, [getSalesForProduct])
  
  const getCooldownForSale = useCallback((sale: SaleWithDetails) =&gt; {
    if (!sale.platform) return null
    
    if ((sale.sale_type === 'seasonal' || sale.sale_type === 'special') &amp;&amp; sale.platform.special_sales_no_cooldown) {
      return null
    }
    
    const cooldownDays = sale.platform.cooldown_days
    if (cooldownDays === 0) return null
    
    const saleEnd = normalizeToLocalDate(sale.end_date)
    const cooldownStart = addDays(saleEnd, 1)
    const cooldownEnd = addDays(saleEnd, cooldownDays)
    
    return {
      start: cooldownStart,
      end: cooldownEnd,
      left: getPositionForDate(cooldownStart),
      width: getWidthForRange(cooldownStart, cooldownEnd)
    }
  }, [getPositionForDate, getWidthForRange])
  
  const calculateCascadeShifts = useCallback((
    movedSaleId: string,
    newStart: Date,
    newEnd: Date,
    productId: string,
    platformId: string,
    cooldownDays: number
  ): CascadeShift[] =&gt; {
    const shifts: CascadeShift[] = []
    
    const otherSales = allSales
      .filter(s =&gt; s.product_id === productId &amp;&amp; s.platform_id === platformId &amp;&amp; s.id !== movedSaleId)
      .sort((a, b) =&gt; normalizeToLocalDate(a.start_date).getTime() - normalizeToLocalDate(b.start_date).getTime())
    
    if (otherSales.length === 0) return shifts
    
    let currentCooldownEnd = addDays(newEnd, cooldownDays)
    
    for (const sale of otherSales) {
      const saleStart = normalizeToLocalDate(sale.start_date)
      const saleEnd = normalizeToLocalDate(sale.end_date)
      const saleDuration = differenceInDays(saleEnd, saleStart)
      
      if (saleStart &lt;= newEnd) continue
      
      if (saleStart &lt; currentCooldownEnd) {
        const shiftAmount = differenceInDays(currentCooldownEnd, saleStart) + 1
        const newSaleStart = addDays(saleStart, shiftAmount)
        const newSaleEnd = addDays(newSaleStart, saleDuration)
        
        shifts.push({
          saleId: sale.id,
          newStart: format(newSaleStart, 'yyyy-MM-dd'),
          newEnd: format(newSaleEnd, 'yyyy-MM-dd')
        })
        
        currentCooldownEnd = addDays(newSaleEnd, cooldownDays)
      } else {
        currentCooldownEnd = addDays(saleEnd, cooldownDays)
      }
    }
    
    const salesBeforeMoved = otherSales.filter(s =&gt; normalizeToLocalDate(s.end_date) &lt; newStart)
    
    for (const sale of salesBeforeMoved) {
      if (shifts.some(s =&gt; s.saleId === sale.id)) continue
      
      const saleStart = normalizeToLocalDate(sale.start_date)
      const saleEnd = normalizeToLocalDate(sale.end_date)
      const saleDuration = differenceInDays(saleEnd, saleStart)
      const saleCooldownEnd = addDays(saleEnd, cooldownDays)
      
      if (saleCooldownEnd &gt; newStart) {
        const overlapDays = differenceInDays(saleCooldownEnd, newStart) + 1
        const newSaleStart = addDays(saleStart, -overlapDays)
        const newSaleEnd = addDays(newSaleStart, saleDuration)
        
        if (newSaleStart &gt;= days[0]) {
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
  
  const completeSelection = useCallback((endDayIndex: number) =&gt; {
    if (!selectionRef.current) return
    
    const { data, callback, days: capturedDays } = selectionRef.current
    
    selectionRef.current = null
    setSelection(null)
    
    if (!callback || capturedDays.length === 0) {
      return
    }
    
    const startIdx = Math.min(data.startDayIndex, endDayIndex)
    const endIdx = Math.max(data.startDayIndex, endDayIndex)
    
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
  
  const handleSelectionStart = useCallback((productId: string, platformId: string, dayIndex: number, e: React.MouseEvent) =&gt; {
    if ((e.target as HTMLElement).closest('[data-sale-block]') || (e.target as HTMLElement).closest('[data-launch-marker]') || (e.target as HTMLElement).closest('[data-launch-sale-block]')) {
      return
    }
    
    if (e.button !== 0) return
    
    e.preventDefault()
    e.stopPropagation()
    
    const newSelection = {
      productId,
      platformId,
      startDayIndex: dayIndex,
      endDayIndex: dayIndex
    }
    
    selectionRef.current = {
      data: newSelection,
      callback: props.onCreateSale,
      days: days
    }
    
    setSelection(newSelection)
  }, [props.onCreateSale, days])
  
  const handleSelectionMove = useCallback((dayIndex: number) =&gt; {
    if (!selectionRef.current) return
    
    const newSelection = {
      ...selectionRef.current.data,
      endDayIndex: dayIndex
    }
    
    selectionRef.current.data = newSelection
    setSelection(newSelection)
  }, [])
  
  const handleLaunchDragStart = useCallback((productId: string, launchDate: string, e: React.MouseEvent) =&gt; {
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
  
  const handleLaunchDragMove = useCallback((e: MouseEvent) =&gt; {
    if (!launchDragRef.current || !launchDateDrag) return
    
    const deltaX = e.clientX - launchDragRef.current.startX
    
    if (Math.abs(deltaX) &gt; 5) {
      launchDragRef.current.hasMoved = true
    }
    
    const daysDelta = Math.round(deltaX / dayWidth)
    const originalDayIndex = getDayIndexForDate(launchDragRef.current.originalDate)
    const newDayIndex = Math.max(0, Math.min(originalDayIndex + daysDelta, days.length - 1))
    
    setLaunchDateDrag(prev =&gt; prev ? { ...prev, currentDayIndex: newDayIndex } : null)
  }, [launchDateDrag, getDayIndexForDate, days.length, dayWidth])
  
  const handleLaunchDragEnd = useCallback(async () =&gt; {
    if (!launchDragRef.current || !launchDateDrag) {
      launchDragRef.current = null
      setLaunchDateDrag(null)
      return
    }
    
    const { productId, originalDate, hasMoved } = launchDragRef.current
    const newDate = format(days[launchDateDrag.currentDayIndex], 'yyyy-MM-dd')
    
    launchDragRef.current = null
    setLaunchDateDrag(null)
    
    if (!hasMoved &amp;&amp; onEditLaunchDate) {
      const product = products.find(p =&gt; p.id === productId)
      if (product) {
        onEditLaunchDate(productId, product.name, originalDate, product.launch_sale_duration || 7)
      }
      return
    }
    
    if (newDate !== originalDate &amp;&amp; onLaunchDateChange) {
      await onLaunchDateChange(productId, newDate)
    }
  }, [launchDateDrag, onLaunchDateChange, onEditLaunchDate, days, products])
  
  // Launch sale resize handlers
  const handleLaunchSaleResizeStart = useCallback((productId: string, launchDate: string, currentDuration: number, e: React.MouseEvent) =&gt; {
    if (e.button !== 0) return
    if (!onLaunchSaleDurationChange) return
    
    e.preventDefault()
    e.stopPropagation()
    
    launchSaleResizeRef.current = {
      productId,
      originalDuration: currentDuration,
      startX: e.clientX,
      launchDate
    }
    
    setLaunchSaleResize({
      productId,
      originalDuration: currentDuration,
      currentDuration: currentDuration,
      edge: 'right'
    })
  }, [onLaunchSaleDurationChange])
  
  const handleLaunchSaleResizeMove = useCallback((e: MouseEvent) =&gt; {
    if (!launchSaleResizeRef.current || !launchSaleResize) return
    
    const deltaX = e.clientX - launchSaleResizeRef.current.startX
    const daysDelta = Math.round(deltaX / dayWidth)
    
    // Calculate new duration (only right edge, so we add to duration)
    const newDuration = Math.max(MIN_LAUNCH_SALE_DAYS, Math.min(MAX_LAUNCH_SALE_DAYS, launchSaleResizeRef.current.originalDuration + daysDelta))
    
    setLaunchSaleResize(prev =&gt; prev ? { ...prev, currentDuration: newDuration } : null)
  }, [launchSaleResize, dayWidth])
  
  const handleLaunchSaleResizeEnd = useCallback(async () =&gt; {
    if (!launchSaleResizeRef.current || !launchSaleResize) {
      launchSaleResizeRef.current = null
      setLaunchSaleResize(null)
      return
    }
    
    const { productId, originalDuration } = launchSaleResizeRef.current
    const { currentDuration } = launchSaleResize
    
    launchSaleResizeRef.current = null
    setLaunchSaleResize(null)
    
    // Only save if duration actually changed
    if (currentDuration !== originalDuration &amp;&amp; onLaunchSaleDurationChange) {
      await onLaunchSaleDurationChange(productId, currentDuration)
    }
  }, [launchSaleResize, onLaunchSaleDurationChange])
  
  const updateScrollFromPosition = useCallback((clientX: number, isThumbDrag: boolean) =&gt; {
    if (!scrollContainerRef.current || !scrollTrackRef.current) return
    
    const trackRect = scrollTrackRef.current.getBoundingClientRect()
    const { scrollWidth, clientWidth } = scrollContainerRef.current
    const maxScroll = scrollWidth - clientWidth
    
    if (isThumbDrag &amp;&amp; scrollGrabRef.current) {
      const deltaX = clientX - scrollGrabRef.current.startX
      const trackWidth = trackRect.width
      const scrollDelta = (deltaX / trackWidth) * maxScroll
      const newScrollLeft = Math.max(0, Math.min(scrollGrabRef.current.startScrollLeft + scrollDelta, maxScroll))
      scrollContainerRef.current.scrollLeft = newScrollLeft
    } else {
      const clickX = clientX - trackRect.left
      const trackWidth = trackRect.width
      const progress = clickX / trackWidth
      const newScrollLeft = Math.max(0, Math.min(progress * maxScroll, maxScroll))
      scrollContainerRef.current.scrollLeft = newScrollLeft
    }
  }, [])
  
  const handleScrollThumbStart = useCallback((e: React.MouseEvent) =&gt; {
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
  
  const handleScrollTrackClick = useCallback((e: React.MouseEvent) =&gt; {
    if (e.button !== 0) return
    if ((e.target as HTMLElement).classList.contains(styles.scrollGrabThumb)) return
    
    e.preventDefault()
    
    updateScrollFromPosition(e.clientX, false)
    
    if (scrollContainerRef.current) {
      scrollGrabRef.current = {
        startX: e.clientX,
        startScrollLeft: scrollContainerRef.current.scrollLeft,
        isThumbDrag: false
      }
      setIsGrabbing(true)
    }
  }, [updateScrollFromPosition])
  
  const handleScrollGrabMove = useCallback((e: MouseEvent) =&gt; {
    if (!scrollGrabRef.current) return
    updateScrollFromPosition(e.clientX, scrollGrabRef.current.isThumbDrag)
  }, [updateScrollFromPosition])
  
  const handleScrollGrabEnd = useCallback(() =&gt; {
    scrollGrabRef.current = null
    setIsGrabbing(false)
  }, [])
  
  const handleScroll = useCallback(() =&gt; {
    if (!scrollContainerRef.current) return
    const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current
    const maxScroll = scrollWidth - clientWidth
    const progress = maxScroll &gt; 0 ? scrollLeft / maxScroll : 0
    setScrollProgress(progress)
    
    // Check for infinite scroll
    handleInfiniteScroll()
  }, [handleInfiniteScroll])
  
  useEffect(() =&gt; {
    const scrollContainer = scrollContainerRef.current
    if (!scrollContainer) return
    
    scrollContainer.addEventListener('scroll', handleScroll)
    handleScroll()
    
    return () =&gt; {
      scrollContainer.removeEventListener('scroll', handleScroll)
    }
  }, [handleScroll])
  
  // Initial scroll to today - with proper dependencies and guards
  useEffect(() =&gt; {
    // Only scroll once, and only when all values are ready
    if (hasInitiallyScrolled.current) return
    if (todayIndex === -1) return
    if (!scrollContainerRef.current) return
    if (containerWidth &lt;= 0 || containerWidth === 1200) return // Still using default
    if (dayWidth &lt;= 4) return // dayWidth not properly calculated yet
    
    const todayPosition = todayIndex * dayWidth
    const visibleWidth = containerWidth - SIDEBAR_WIDTH
    const scrollTarget = todayPosition - (visibleWidth / 2) + (dayWidth / 2)
    
    scrollContainerRef.current.scrollLeft = Math.max(0, scrollTarget)
    hasInitiallyScrolled.current = true
  }, [todayIndex, dayWidth, containerWidth])
  
  useEffect(() =&gt; {
    const handleWindowMouseMove = (e: MouseEvent) =&gt; {
      if (scrollGrabRef.current) {
        handleScrollGrabMove(e)
        return
      }
      if (launchSaleResizeRef.current) {
        handleLaunchSaleResizeMove(e)
        return
      }
      if (launchDragRef.current) {
        handleLaunchDragMove(e)
      }
    }
    
    const handleWindowMouseUp = () =&gt; {
      if (scrollGrabRef.current) {
        handleScrollGrabEnd()
        return
      }
      
      if (launchSaleResizeRef.current) {
        handleLaunchSaleResizeEnd()
        return
      }
      
      if (launchDragRef.current) {
        handleLaunchDragEnd()
        return
      }
      
      if (!selectionRef.current) return
      
      const endDayIndex = selectionRef.current.data.endDayIndex
      completeSelection(endDayIndex)
    }
    
    window.addEventListener('mousemove', handleWindowMouseMove)
    window.addEventListener('mouseup', handleWindowMouseUp, { capture: true })
    
    return () =&gt; {
      window.removeEventListener('mousemove', handleWindowMouseMove)
      window.removeEventListener('mouseup', handleWindowMouseUp, { capture: true })
    }
  }, [completeSelection, handleLaunchDragMove, handleLaunchDragEnd, handleLaunchSaleResizeMove, handleLaunchSaleResizeEnd, handleScrollGrabMove, handleScrollGrabEnd])
  
  const getSelectionStyle = useCallback((productId: string, platformId: string) =&gt; {
    if (!selection || selection.productId !== productId || selection.platformId !== platformId) {
      return null
    }
    
    const startIdx = Math.min(selection.startDayIndex, selection.endDayIndex)
    const endIdx = Math.max(selection.startDayIndex, selection.endDayIndex)
    const left = startIdx * dayWidth
    const width = (endIdx - startIdx + 1) * dayWidth
    
    const platform = platforms.find(p =&gt; p.id === platformId)
    
    return {
      left,
      width,
      backgroundColor: platform ? `${platform.color_hex}40` : 'rgba(59, 130, 246, 0.25)',
      borderColor: platform?.color_hex || '#3b82f6'
    }
  }, [selection, platforms, dayWidth])
  
  const getLaunchDatePosition = useCallback((product: Product) =&gt; {
    if (!product.launch_date) return null
    
    if (launchDateDrag &amp;&amp; launchDateDrag.productId === product.id) {
      const left = launchDateDrag.currentDayIndex * dayWidth
      const date = days[launchDateDrag.currentDayIndex]
      return { left, date, isDragging: true }
    }
    
    const dayIndex = getDayIndexForDate(product.launch_date)
    if (dayIndex &lt; 0 || dayIndex &gt;= days.length) return null
    
    const left = dayIndex * dayWidth
    return { left, date: normalizeToLocalDate(product.launch_date), isDragging: false }
  }, [launchDateDrag, getDayIndexForDate, days, dayWidth])

  // Get launch sale block positioning and conflict info
  const getLaunchSaleBlock = useCallback((product: Product) =&gt; {
    if (!product.launch_date) return null

    // Use resize state if actively resizing this product's launch sale
    const duration = (launchSaleResize &amp;&amp; launchSaleResize.productId === product.id)
      ? launchSaleResize.currentDuration
      : (product.launch_sale_duration || 7)
    
    const launchStart = normalizeToLocalDate(product.launch_date)
    const launchEnd = addDays(launchStart, duration - 1)

    const startDayIndex = getDayIndexForDate(launchStart)
    const endDayIndex = getDayIndexForDate(launchEnd)

    // Check if visible in current timeline
    if (endDayIndex &lt; 0 || startDayIndex &gt;= days.length) return null

    // Clamp to visible range
    const visibleStartIdx = Math.max(0, startDayIndex)
    const visibleEndIdx = Math.min(days.length - 1, endDayIndex)

    const left = visibleStartIdx * dayWidth
    const width = (visibleEndIdx - visibleStartIdx + 1) * dayWidth

    // Check for conflicts
    const conflicts = getLaunchSaleConflicts(product.launch_date, duration)

    const isResizing = launchSaleResize &amp;&amp; launchSaleResize.productId === product.id

    return {
      left,
      width,
      duration,
      hasConflict: conflicts.length &gt; 0,
      conflicts,
      startDate: launchStart,
      endDate: launchEnd,
      isResizing
    }
  }, [getDayIndexForDate, days, dayWidth, getLaunchSaleConflicts, launchSaleResize])
  
  const scrollThumbStyle = useMemo(() =&gt; {
    const totalWidth = totalDays * dayWidth
    const visibleWidth = containerWidth - SIDEBAR_WIDTH
    const thumbWidthPercent = Math.max(10, Math.min(100, (visibleWidth / totalWidth) * 100))
    const maxLeftPercent = 100 - thumbWidthPercent
    const leftPercent = scrollProgress * maxLeftPercent
    
    return { 
      width: `${thumbWidthPercent}%`,
      left: `${leftPercent}%`
    }
  }, [totalDays, scrollProgress, dayWidth, containerWidth])
  
  const handleDragStart = (event: DragStartEvent) =&gt; {
    const saleId = event.active.id as string
    const sale = sales.find(s =&gt; s.id === saleId)
    if (sale) {
      setDraggedSale(sale)
      setValidationError(null)
    }
  }
  
  const handleDragEnd = async (event: DragEndEvent) =&gt; {
    if (!draggedSale) {
      setDraggedSale(null)
      return
    }
    
    const { delta } = event
    const daysMoved = Math.round(delta.x / dayWidth)
    
    if (daysMoved === 0) {
      setDraggedSale(null)
      return
    }
    
    const currentStart = normalizeToLocalDate(draggedSale.start_date)
    const currentEnd = normalizeToLocalDate(draggedSale.end_date)
    const newStart = addDays(currentStart, daysMoved)
    const newEnd = addDays(currentEnd, daysMoved)
    const newStartStr = format(newStart, 'yyyy-MM-dd')
    const newEndStr = format(newEnd, 'yyyy-MM-dd')
    
    const platform = platforms.find(p =&gt; p.id === draggedSale.platform_id)
    if (!platform) {
      setValidationError('Platform not found')
      setDraggedSale(null)
      return
    }
    
    const cascadeShifts = calculateCascadeShifts(
      draggedSale.id,
      newStart,
      newEnd,
      draggedSale.product_id,
      draggedSale.platform_id,
      platform.cooldown_days
    )
    
    const cascadeIds = new Set(cascadeShifts.map(s =&gt; s.saleId))
    const salesForValidation = allSales.filter(s =&gt; !cascadeIds.has(s.id))
    
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
      setTimeout(() =&gt; setValidationError(null), 3000)
      setDraggedSale(null)
      return
    }
    
    if (cascadeShifts.length &gt; 0) {
      setValidationError(`Auto-shifted ${cascadeShifts.length} sale(s) to maintain cooldowns`)
      setTimeout(() =&gt; setValidationError(null), 3000)
    }
    
    const newOptimistic: Record&lt;string, { startDate: string; endDate: string }&gt; = {
      [draggedSale.id]: { startDate: newStartStr, endDate: newEndStr }
    }
    for (const shift of cascadeShifts) {
      newOptimistic[shift.saleId] = { startDate: shift.newStart, endDate: shift.newEnd }
    }
    setOptimisticUpdates(prev =&gt; ({ ...prev, ...newOptimistic }))
    
    setDraggedSale(null)
    
    try {
      await onSaleUpdate(draggedSale.id, {
        start_date: newStartStr,
        end_date: newEndStr
      })
      
      for (const shift of cascadeShifts) {
        await onSaleUpdate(shift.saleId, {
          start_date: shift.newStart,
          end_date: shift.newEnd
        })
      }
    } catch (err) {
      setOptimisticUpdates(prev =&gt; {
        const updated = { ...prev }
        delete updated[draggedSale.id]
        for (const shift of cascadeShifts) {
          delete updated[shift.saleId]
        }
        return updated
      })
      setValidationError('Failed to save - position reverted')
      setTimeout(() =&gt; setValidationError(null), 3000)
    }
    
    setTimeout(() =&gt; {
      setOptimisticUpdates(prev =&gt; {
        const updated = { ...prev }
        delete updated[draggedSale.id]
        for (const shift of cascadeShifts) {
          delete updated[shift.saleId]
        }
        return updated
      })
    }, 500)
  }
  
  const handleSaleResize = useCallback(async (saleId: string, newStartDate: string, newEndDate: string) =&gt; {
    const sale = sales.find(s =&gt; s.id === saleId)
    if (!sale) return
    
    const platform = platforms.find(p =&gt; p.id === sale.platform_id)
    if (!platform) {
      setValidationError('Platform not found')
      return
    }
    
    const validation = validateSale(
      {
        product_id: sale.product_id,
        platform_id: sale.platform_id,
        start_date: newStartDate,
        end_date: newEndDate,
        sale_type: sale.sale_type
      },
      allSales,
      platform,
      saleId
    )
    
    if (!validation.valid) {
      setValidationError(validation.message || 'Invalid resize - conflicts with cooldown')
      setTimeout(() =&gt; setValidationError(null), 3000)
      return
    }
    
    setOptimisticUpdates(prev =&gt; ({
      ...prev,
      [saleId]: { startDate: newStartDate, endDate: newEndDate }
    }))
    
    try {
      await onSaleUpdate(saleId, {
        start_date: newStartDate,
        end_date: newEndDate
      })
    } catch (err) {
      setOptimisticUpdates(prev =&gt; {
        const updated = { ...prev }
        delete updated[saleId]
        return updated
      })
      setValidationError('Failed to resize - reverted')
      setTimeout(() =&gt; setValidationError(null), 3000)
    }
    
    setTimeout(() =&gt; {
      setOptimisticUpdates(prev =&gt; {
        const updated = { ...prev }
        delete updated[saleId]
        return updated
      })
    }, 500)
  }, [sales, platforms, allSales, onSaleUpdate])
  
  const handleMouseLeave = useCallback(() =&gt; {
    if (selectionRef.current) {
      selectionRef.current = null
      setSelection(null)
    }
  }, [])
  
  const getSaleCount = useCallback((productId: string) =&gt; {
    return sales.filter(s =&gt; s.product_id === productId).length
  }, [sales])
  
  const totalWidth = totalDays * dayWidth
  
  return (
    &lt;div 
      className={`${styles.container} ${draggedSale ? styles.dragging : ''}`}
      onMouseLeave={handleMouseLeave}
      ref={containerRef}
    &gt;
      {validationError &amp;&amp; (
        &lt;div className={`${styles.validationError} ${validationError.includes('Auto-shifted') ? styles.infoMessage : ''}`}&gt;
          &lt;span&gt;{validationError.includes('Auto-shifted') ? 'ℹ️' : '⚠️'} {validationError}&lt;/span&gt;
        &lt;/div&gt;
      )}
      
      &lt;div className={styles.legend}&gt;
        &lt;span className={styles.legendTitle}&gt;PLATFORMS:&lt;/span&gt;
        {platforms.map(platform =&gt; (
          &lt;div key={platform.id} className={styles.legendItem}&gt;
            &lt;span 
              className={styles.legendColor}
              style={{ backgroundColor: platform.color_hex }}
            /&gt;
            &lt;span&gt;{platform.name}&lt;/span&gt;
            &lt;span className={styles.legendCooldown}&gt;({platform.cooldown_days}d cooldown)&lt;/span&gt;
          &lt;/div&gt;
        ))}
        &lt;div className={styles.legendLaunchSale}&gt;
          &lt;span className={styles.legendLaunchColor} /&gt;
          &lt;span&gt;Launch Sale Period (drag edge to resize)&lt;/span&gt;
        &lt;/div&gt;
      &lt;/div&gt;
      
      {/* Zoom Controls */}
      &lt;div className={styles.zoomControls}&gt;
        &lt;span className={styles.zoomLabel}&gt;View:&lt;/span&gt;
        &lt;div className={styles.zoomButtons}&gt;
          &lt;button 
            className={styles.zoomBtn}
            onClick={handleZoomOut}
            disabled={zoomIndex === 0}
            title="Zoom out (Ctrl+-)"
          &gt;
            −
          &lt;/button&gt;
          {ZOOM_LEVELS.map((level, idx) =&gt; (
            &lt;button
              key={level.name}
              className={`${styles.zoomPreset} ${idx === zoomIndex ? styles.zoomActive : ''}`}
              onClick={() =&gt; handleZoomPreset(idx)}
              title={`${level.name} view (${level.monthsVisible} months)`}
            &gt;
              {level.label}
            &lt;/button&gt;
          ))}
          &lt;button 
            className={styles.zoomBtn}
            onClick={handleZoomIn}
            disabled={zoomIndex === ZOOM_LEVELS.length - 1}
            title="Zoom in (Ctrl++)"
          &gt;
            +
          &lt;/button&gt;
        &lt;/div&gt;
        &lt;span className={styles.zoomInfo}&gt;
          {ZOOM_LEVELS[zoomIndex].name} ({Math.round(ZOOM_LEVELS[zoomIndex].monthsVisible * 30)} days)
        &lt;/span&gt;
        {visibleDateRange &amp;&amp; (
          &lt;span className={styles.dateRange}&gt;
            {format(visibleDateRange.start, 'MMM d')} - {format(visibleDateRange.end, 'MMM d, yyyy')}
          &lt;/span&gt;
        )}
        {isLoadingMore &amp;&amp; (
          &lt;span className={styles.loadingIndicator}&gt;Loading...&lt;/span&gt;
        )}
      &lt;/div&gt;
      
      &lt;div 
        className={`${styles.scrollGrabBar} ${isGrabbing ? styles.grabbing : ''}`}
      &gt;
        &lt;button
          className={styles.todayButton}
          onClick={scrollToToday}
          disabled={todayIndex === -1}
          title={todayIndex === -1 ? 'Today is not in the current timeline' : 'Jump to today'}
        &gt;
          Today
        &lt;/button&gt;
        &lt;div 
          className={styles.scrollGrabTrack}
          ref={scrollTrackRef}
          onMouseDown={handleScrollTrackClick}
        &gt;
          &lt;div 
            className={styles.scrollGrabThumb} 
            style={scrollThumbStyle}
            onMouseDown={handleScrollThumbStart}
          &gt;
            &lt;span className={styles.scrollGrabIcon}&gt;⟷&lt;/span&gt;
          &lt;/div&gt;
        &lt;/div&gt;
        &lt;span className={styles.scrollGrabHint}&gt;
          {isGrabbing ? 'Dragging...' : 'Drag to navigate • Scroll edges for more months'}
        &lt;/span&gt;
      &lt;/div&gt;
      
      &lt;div className={styles.scrollContainer} ref={scrollContainerRef}&gt;
        &lt;DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        &gt;
          &lt;div className={styles.timeline} style={{ width: totalWidth }}&gt;
            &lt;div className={styles.monthHeaders}&gt;
              {months.map(({ date, days: daysInMonth }, idx) =&gt; (
                &lt;div 
                  key={idx}
                  className={styles.monthHeader}
                  style={{ width: daysInMonth * dayWidth }}
                &gt;
                  {format(date, 'MMMM yyyy')}
                &lt;/div&gt;
              ))}
            &lt;/div&gt;
            
            &lt;div className={styles.dayHeaders}&gt;
              {days.map((day, idx) =&gt; {
                const isWeekend = day.getDay() === 0 || day.getDay() === 6
                const isFirstOfMonth = day.getDate() === 1
                const isTodayDate = idx === todayIndex
                // Only show day numbers at higher zoom levels (when dayWidth is reasonable)
                const showDayNumber = dayWidth &gt;= 14
                return (
                  &lt;div 
                    key={idx}
                    className={`${styles.dayHeader} ${isWeekend ? styles.weekend : ''} ${isFirstOfMonth ? styles.monthStart : ''} ${isTodayDate ? styles.todayHeader : ''}`}
                    style={{ width: dayWidth }}
                  &gt;
                    {showDayNumber ? day.getDate() : ''}
                  &lt;/div&gt;
                )
              })}
            &lt;/div&gt;
            
            {todayIndex !== -1 &amp;&amp; (
              &lt;div 
                className={styles.todayIndicator}
                style={{ left: todayIndex * dayWidth + dayWidth / 2 + SIDEBAR_WIDTH }}
              /&gt;
            )}
            
            &lt;div className={styles.productRows}&gt;
              {groupedProducts.map(({ game, products: gameProducts }) =&gt; (
                &lt;div key={game.id} className={styles.gameGroup}&gt;
                  &lt;div className={styles.gameHeader}&gt;
                    &lt;div className={styles.productLabel}&gt;
                      &lt;span className={styles.gameName}&gt;{game.name}&lt;/span&gt;
                      &lt;span className={styles.clientName}&gt;{game.client?.name}&lt;/span&gt;
                    &lt;/div&gt;
                  &lt;/div&gt;
                  
                  {gameProducts.map(product =&gt; {
                    const productPlatforms = getPlatformsForProduct(product.id)
                    const saleCount = getSaleCount(product.id)
                    const launchPosition = getLaunchDatePosition(product)
                    const launchSaleBlock = getLaunchSaleBlock(product)
                    
                    return (
                      &lt;div key={product.id} className={styles.productGroup}&gt;
                        &lt;div className={styles.productRow}&gt;
                          &lt;div className={styles.productLabel}&gt;
                            &lt;div className={styles.productLabelContent}&gt;
                              &lt;span className={styles.productName}&gt;{product.name}&lt;/span&gt;
                              &lt;span className={styles.productType}&gt;{product.product_type}&lt;/span&gt;
                              {product.launch_date &amp;&amp; (
                                &lt;span 
                                  className={`${styles.launchDateBadge} ${onEditLaunchDate ? styles.clickable : ''}`}
                                  onClick={() =&gt; onEditLaunchDate &amp;&amp; product.launch_date &amp;&amp; onEditLaunchDate(product.id, product.name, product.launch_date, product.launch_sale_duration || 7)}
                                  title="Click to edit launch date"
                                &gt;
                                  🚀 {format(normalizeToLocalDate(product.launch_date), 'MMM d')}
                                &lt;/span&gt;
                              )}
                            &lt;/div&gt;
                            &lt;div className={styles.productActions}&gt;
                              {onGenerateCalendar &amp;&amp; (
                                &lt;button
                                  className={styles.generateButton}
                                  onClick={() =&gt; onGenerateCalendar(product.id, product.name, product.launch_date || undefined)}
                                  title="Auto-generate sale calendar for this product"
                                &gt;
                                  🗓️
                                &lt;/button&gt;
                              )}
                              {onClearSales &amp;&amp; saleCount &gt; 0 &amp;&amp; (
                                &lt;button
                                  className={styles.clearButton}
                                  onClick={() =&gt; onClearSales(product.id, product.name)}
                                  title={`Clear sales for this product (${saleCount})`}
                                &gt;
                                  🗑️
                                &lt;/button&gt;
                              )}
                            &lt;/div&gt;
                          &lt;/div&gt;
                          
                          &lt;div className={styles.timelineRow} style={{ width: totalWidth }}&gt;
                            {days.map((day, idx) =&gt; {
                              const isWeekend = day.getDay() === 0 || day.getDay() === 6
                              return (
                                &lt;div
                                  key={idx}
                                  className={`${styles.dayCell} ${isWeekend ? styles.weekendCell : ''}`}
                                  style={{ left: idx * dayWidth, width: dayWidth }}
                                /&gt;
                              )
                            })}
                            
                            {/* Launch Sale Block - visual representation of launch sale period */}
                            {launchSaleBlock &amp;&amp; (
                              &lt;div
                                data-launch-sale-block
                                className={`${styles.launchSaleBlock} ${launchSaleBlock.hasConflict ? styles.hasConflict : ''} ${onLaunchSaleDurationChange ? styles.resizable : ''} ${launchSaleBlock.isResizing ? styles.resizing : ''}`}
                                style={{ 
                                  left: launchSaleBlock.left, 
                                  width: launchSaleBlock.width,
                                  transition: launchSaleBlock.isResizing ? 'none' : undefined
                                }}
                                title={launchSaleBlock.hasConflict 
                                  ? `⚠️ Launch Sale (${launchSaleBlock.duration}d) - CONFLICTS WITH:\n${launchSaleBlock.conflicts.map(c =&gt; `• ${c.eventName} (${c.overlapDays}d overlap)`).join('\n')}`
                                  : `Launch Sale: ${format(launchSaleBlock.startDate, 'MMM d')} - ${format(launchSaleBlock.endDate, 'MMM d')} (${launchSaleBlock.duration} days)\nDrag right edge to resize`
                                }
                              &gt;
                                &lt;div className={styles.launchSaleBlockContent}&gt;
                                  &lt;span className={styles.launchSaleIcon}&gt;
                                    {launchSaleBlock.hasConflict ? '⚠️' : '🚀'}
                                  &lt;/span&gt;
                                  &lt;span className={styles.launchSaleLabel}&gt;
                                    Launch {launchSaleBlock.duration}d
                                  &lt;/span&gt;
                                &lt;/div&gt;
                                
                                {/* Right resize handle */}
                                {onLaunchSaleDurationChange &amp;&amp; product.launch_date &amp;&amp; (
                                  &lt;div
                                    className={`${styles.launchSaleResizeHandle} ${styles.launchSaleResizeHandleRight}`}
                                    onMouseDown={(e) =&gt; handleLaunchSaleResizeStart(product.id, product.launch_date!, launchSaleBlock.duration, e)}
                                  /&gt;
                                )}
                              &lt;/div&gt;
                            )}
                            
                            {launchPosition &amp;&amp; (onLaunchDateChange || onEditLaunchDate) &amp;&amp; (
                              &lt;div
                                data-launch-marker
                                className={`${styles.launchMarker} ${launchPosition.isDragging ? styles.launchMarkerDragging : ''}`}
                                style={{ left: launchPosition.left }}
                                onMouseDown={(e) =&gt; onLaunchDateChange &amp;&amp; handleLaunchDragStart(product.id, product.launch_date!, e)}
                                title={`Launch Date: ${format(launchPosition.date, 'MMM d, yyyy')}\n${onLaunchDateChange ? 'Drag to shift all sales, or click to edit' : 'Click to edit'}`}
                              &gt;
                                &lt;div className={styles.launchMarkerLine} /&gt;
                                &lt;div className={styles.launchMarkerFlag}&gt;
                                  🚀
                                &lt;/div&gt;
                              &lt;/div&gt;
                            )}
                          &lt;/div&gt;
                        &lt;/div&gt;
                        
                        {productPlatforms.map(platform =&gt; {
                          const platformSales = getSalesForProductPlatform(product.id, platform.id)
                          const platformEventsForRow = getEventsForPlatform(platform.id)
                          const selectionStyle = getSelectionStyle(product.id, platform.id)
                          const gapIndicator = getGapIndicator(product.id, platform.id)
                          
                          return (
                            &lt;div key={`${product.id}-${platform.id}`} className={styles.platformRow}&gt;
                              &lt;div className={styles.platformLabel}&gt;
                                &lt;span 
                                  className={styles.platformIndicator}
                                  style={{ backgroundColor: platform.color_hex }}
                                /&gt;
                                &lt;span className={styles.platformName}&gt;{platform.name}&lt;/span&gt;
                                {gapIndicator &amp;&amp; (
                                  &lt;span 
                                    className={`${styles.gapBadge} ${gapIndicator.isWarning ? styles.gapWarning : ''}`}
                                    title={`${gapIndicator.text} - Available days where you could run a sale (excludes cooldowns)`}
                                  &gt;
                                    {gapIndicator.text}
                                  &lt;/span&gt;
                                )}
                              &lt;/div&gt;
                              
                              &lt;div 
                                className={`${styles.timelineRow} ${styles.clickableTimeline}`}
                                style={{ width: totalWidth }}
                              &gt;
                                {days.map((day, idx) =&gt; {
                                  const isWeekend = day.getDay() === 0 || day.getDay() === 6
                                  return (
                                    &lt;div
                                      key={idx}
                                      className={`${styles.dayCell} ${isWeekend ? styles.weekendCell : ''}`}
                                      style={{ left: idx * dayWidth, width: dayWidth }}
                                      onMouseDown={(e) =&gt; handleSelectionStart(product.id, platform.id, idx, e)}
                                      onMouseEnter={() =&gt; handleSelectionMove(idx)}
                                    /&gt;
                                  )
                                })}
                                
                                {launchPosition &amp;&amp; (
                                  &lt;div
                                    className={styles.launchMarkerLineExtension}
                                    style={{ left: launchPosition.left + dayWidth / 2 - 1 }}
                                  /&gt;
                                )}
                                
                                {selectionStyle &amp;&amp; (
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
                                
                                {showEvents &amp;&amp; platformEventsForRow.map(event =&gt; (
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
                                      {!event.requires_cooldown &amp;&amp; &lt;span className={styles.noCooldownStar}&gt;★&lt;/span&gt;}
                                    &lt;/span&gt;
                                  &lt;/div&gt;
                                ))}
                                
                                {platformSales.map(sale =&gt; {
                                  const left = getPositionForDate(sale.start_date)
                                  const width = getWidthForRange(sale.start_date, sale.end_date)
                                  const cooldown = getCooldownForSale(sale)
                                  
                                  return (
                                    &lt;div key={sale.id} data-sale-block&gt;
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
                                      
                                      &lt;SaleBlock
                                        sale={sale}
                                        left={left}
                                        width={width}
                                        dayWidth={dayWidth}
                                        onEdit={onSaleEdit}
                                        onDelete={onSaleDelete}
                                        onDuplicate={onSaleDuplicate}
                                        onResize={handleSaleResize}
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
