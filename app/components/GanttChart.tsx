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
  onSaleUpdate: (saleId: string, updates: Partial&lt;Sale&gt;) => Promise&lt;void&gt;
  onSaleDelete: (saleId: string) => Promise&lt;void&gt;
  onSaleEdit: (sale: SaleWithDetails) => void
  onSaleDuplicate?: (sale: SaleWithDetails) => void
  onCreateSale?: (prefill: { productId: string; platformId: string; startDate: string; endDate: string }) => void
  onGenerateCalendar?: (productId: string, productName: string, launchDate?: string) => void
  onClearSales?: (productId: string, productName: string) => void
  onLaunchDateChange?: (productId: string, newLaunchDate: string) => Promise&lt;void&gt;
  onEditLaunchDate?: (productId: string, productName: string, currentLaunchDate: string, currentDuration: number) => void
  onLaunchSaleDurationChange?: (productId: string, newDuration: number) => Promise&lt;void&gt;
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

interface ClipboardSale {
  sale_name: string | null
  discount_percentage: number | null
  sale_type: string
  start_date: string
  end_date: string
  product_id: string
  platform_id: string
  duration: number
}

const ZOOM_LEVELS = [
  { name: 'Year', monthsVisible: 12, label: 'Y' },
  { name: 'Half Year', monthsVisible: 6, label: 'H' },
  { name: 'Quarter', monthsVisible: 3, label: 'Q' },
  { name: 'Month', monthsVisible: 1.5, label: 'M' },
  { name: '2 Weeks', monthsVisible: 0.5, label: '2W' },
]

const DEFAULT_ZOOM_INDEX = 1
const SIDEBAR_WIDTH = 220
const ROW_HEIGHT = 40
const HEADER_HEIGHT = 60
const SCROLL_THRESHOLD = 300
const MONTHS_TO_LOAD = 3

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
  
  const [timelineStart, setTimelineStart] = useState(() => {
    return subMonths(initialTimelineStart, 3)
  })
  const [monthCount, setMonthCount] = useState(initialMonthCount + 6)
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX)
  const [containerWidth, setContainerWidth] = useState(0)
  const [isContainerReady, setIsContainerReady] = useState(false)
  const [hasInitialScrolled, setHasInitialScrolled] = useState(false)
  const [legendCollapsed, setLegendCollapsed] = useState(false)
  const [selectedSaleId, setSelectedSaleId] = useState&lt;string | null&gt;(null)
  const [clipboardSale, setClipboardSale] = useState&lt;ClipboardSale | null&gt;(null)
  const [copyFeedback, setCopyFeedback] = useState&lt;string | null&gt;(null)
  
  const safeContainerWidth = containerWidth > 0 ? containerWidth : 1200
  
  const dayWidth = useMemo(() => {
    const monthsVisible = ZOOM_LEVELS[zoomIndex].monthsVisible
    const daysVisible = monthsVisible * 30.44
    const availableWidth = safeContainerWidth - SIDEBAR_WIDTH
    const calculated = availableWidth / daysVisible
    return Math.max(4, calculated)
  }, [zoomIndex, safeContainerWidth])
  
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
  
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width
        if (width > 0) {
          setContainerWidth(width)
          setIsContainerReady(true)
        }
      }
    })
    
    resizeObserver.observe(container)
    
    const initialWidth = container.clientWidth
    if (initialWidth > 0) {
      setContainerWidth(initialWidth)
      setIsContainerReady(true)
    }
    
    return () => resizeObserver.disconnect()
  }, [])
  
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  )
  
  const { months, days, totalDays, todayIndex } = useMemo(() => {
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
    
    const todayIdx = daysArr.findIndex(day => isToday(day))
    
    return { months: monthsArr, days: daysArr, totalDays: daysArr.length, todayIndex: todayIdx }
  }, [timelineStart, monthCount])

  const timelineEnd = useMemo(() => {
    const end = new Date(timelineStart)
    end.setMonth(end.getMonth() + monthCount)
    return end
  }, [timelineStart, monthCount])

  const quarters = useMemo(() => {
    return eachQuarterOfInterval({
      start: timelineStart,
      end: timelineEnd
    })
  }, [timelineStart, timelineEnd])

  const visibleDateRange = useMemo(() => {
    if (!scrollContainerRef.current) return null
    const scrollLeft = scrollContainerRef.current.scrollLeft
    const visibleWidth = safeContainerWidth - SIDEBAR_WIDTH
    const startDayIndex = Math.floor(scrollLeft / dayWidth)
    const endDayIndex = Math.min(Math.floor((scrollLeft + visibleWidth) / dayWidth), days.length - 1)
    
    if (startDayIndex >= 0 &amp;&amp; startDayIndex &lt; days.length &amp;&amp; endDayIndex >= 0) {
      return {
        start: days[startDayIndex],
        end: days[endDayIndex]
      }
    }
    return null
  }, [days, dayWidth, scrollProgress, safeContainerWidth])

  const steamPlatformIds = useMemo(() => {
    return platforms
      .filter(p => p.name.toLowerCase().includes('steam'))
      .map(p => p.id)
  }, [platforms])

  const steamSeasonalEvents = useMemo(() => {
    if (steamPlatformIds.length === 0) return []
    return platformEvents.filter(e => 
      steamPlatformIds.includes(e.platform_id) &amp;&amp; 
      e.event_type === 'seasonal'
    )
  }, [platformEvents, steamPlatformIds])

  const getLaunchSaleConflicts = useCallback((launchDate: string, duration: number): LaunchConflict[] => {
    if (steamPlatformIds.length === 0 || steamSeasonalEvents.length === 0) return []

    const launchStart = normalizeToLocalDate(launchDate)
    const launchEnd = addDays(launchStart, duration - 1)

    const conflicts: LaunchConflict[] = []

    for (const event of steamSeasonalEvents) {
      const eventStart = normalizeToLocalDate(event.start_date)
      const eventEnd = normalizeToLocalDate(event.end_date)

      if (launchStart &lt;= eventEnd &amp;&amp; launchEnd >= eventStart) {
        const overlapStart = launchStart > eventStart ? launchStart : eventStart
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

  const platformGaps = useMemo(() => {
    const gapMap = new Map&lt;string, PlatformGapInfo[]&gt;()

    for (const product of products) {
      for (const platform of platforms) {
        const key = `${product.id}-${platform.id}`
        const cooldownDays = platform.cooldown_days || 28

        const productSales = sales
          .filter(s => s.product_id === product.id &amp;&amp; s.platform_id === platform.id)
          .map(s => ({
            start: normalizeToLocalDate(s.start_date),
            end: normalizeToLocalDate(s.end_date),
            saleType: s.sale_type
          }))
          .sort((a, b) => a.start.getTime() - b.start.getTime())

        const quarterGaps: PlatformGapInfo[] = []

        for (const quarterStart of quarters) {
          const quarterEnd = endOfQuarter(quarterStart)
          const quarterLabel = `Q${Math.floor(quarterStart.getMonth() / 3) + 1}`
          
          const daysInQuarter = differenceInDays(quarterEnd, quarterStart) + 1
          const dayStatus = new Array(daysInQuarter).fill(DAY_STATUS.AVAILABLE)
          
          for (const sale of productSales) {
            if (sale.end >= quarterStart &amp;&amp; sale.start &lt;= quarterEnd) {
              const overlapStart = sale.start &lt; quarterStart ? quarterStart : sale.start
              const overlapEnd = sale.end > quarterEnd ? quarterEnd : sale.end
              
              const startIdx = differenceInDays(overlapStart, quarterStart)
              const endIdx = differenceInDays(overlapEnd, quarterStart)
              
              for (let i = startIdx; i &lt;= endIdx &amp;&amp; i &lt; daysInQuarter; i++) {
                if (i >= 0) dayStatus[i] = DAY_STATUS.IN_SALE
              }
            }
          }
          
          for (const sale of productSales) {
            if (sale.saleType === 'special') continue
            
            const cooldownStart = addDays(sale.end, 1)
            const cooldownEnd = addDays(sale.end, cooldownDays)
            
            if (cooldownEnd >= quarterStart &amp;&amp; cooldownStart &lt;= quarterEnd) {
              const overlapStart = cooldownStart &lt; quarterStart ? quarterStart : cooldownStart
              const overlapEnd = cooldownEnd > quarterEnd ? quarterEnd : cooldownEnd
              
              const startIdx = differenceInDays(overlapStart, quarterStart)
              const endIdx = differenceInDays(overlapEnd, quarterStart)
              
              for (let i = startIdx; i &lt;= endIdx &amp;&amp; i &lt; daysInQuarter; i++) {
                if (i >= 0 &amp;&amp; dayStatus[i] !== DAY_STATUS.IN_SALE) {
                  dayStatus[i] = DAY_STATUS.IN_COOLDOWN
                }
              }
            }
          }

          const availableDays = dayStatus.filter(s => s === DAY_STATUS.AVAILABLE).length

          let longestGap = 0
          let currentGap = 0

          for (let i = 0; i &lt; daysInQuarter; i++) {
            if (dayStatus[i] === DAY_STATUS.AVAILABLE) {
              currentGap++
            } else {
              if (currentGap > longestGap) longestGap = currentGap
              currentGap = 0
            }
          }
          if (currentGap > longestGap) longestGap = currentGap

          if (availableDays >= 7) {
            quarterGaps.push({
              quarter: quarterLabel,
              availableDays,
              longestGap
            })
          }
        }

        if (quarterGaps.length > 0) {
          gapMap.set(key, quarterGaps)
        }
      }
    }

    return gapMap
  }, [products, platforms, sales, quarters])

  const getGapIndicator = useCallback((productId: string, platformId: string): { text: string; isWarning: boolean } | null => {
    const key = `${productId}-${platformId}`
    const gaps = platformGaps.get(key)
    
    if (!gaps || gaps.length === 0) return null

    const now = new Date()
    const currentQuarter = `Q${Math.floor(now.getMonth() / 3) + 1}`

    const currentGap = gaps.find(g => g.quarter === currentQuarter)
    if (currentGap &amp;&amp; currentGap.availableDays >= 7) {
      return {
        text: `${currentGap.availableDays}d gap ${currentGap.quarter}`,
        isWarning: currentGap.availableDays >= 30
      }
    }

    const sortedGaps = [...gaps].sort((a, b) => b.availableDays - a.availableDays)
    const largestGap = sortedGaps[0]
    
    if (largestGap &amp;&amp; largestGap.availableDays >= 14) {
      return {
        text: `${largestGap.availableDays}d gap ${largestGap.quarter}`,
        isWarning: largestGap.availableDays >= 30
      }
    }

    return null
  }, [platformGaps])
  
  const handleInfiniteScroll = useCallback(() => {
    if (!scrollContainerRef.current || isLoadingMore) return
    
    const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current
    const maxScroll = scrollWidth - clientWidth
    
    if (scrollLeft &lt; SCROLL_THRESHOLD) {
      setIsLoadingMore(true)
      
      const daysToAdd = MONTHS_TO_LOAD * 30
      const pixelsToAdd = daysToAdd * dayWidth
      
      setTimelineStart(prev => subMonths(prev, MONTHS_TO_LOAD))
      setMonthCount(prev => prev + MONTHS_TO_LOAD)
      
      requestAnimationFrame(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollLeft = scrollLeft + pixelsToAdd
        }
        setIsLoadingMore(false)
      })
    }
    
    if (scrollLeft > maxScroll - SCROLL_THRESHOLD) {
      setIsLoadingMore(true)
      setMonthCount(prev => prev + MONTHS_TO_LOAD)
      
      requestAnimationFrame(() => {
        setIsLoadingMore(false)
      })
    }
  }, [isLoadingMore, dayWidth])
  
  const scrollToToday = useCallback(() => {
    if (todayIndex === -1 || !scrollContainerRef.current) return
    
    const todayPosition = todayIndex * dayWidth
    const visibleWidth = safeContainerWidth - SIDEBAR_WIDTH
    const scrollTarget = todayPosition - (visibleWidth / 2) + (dayWidth / 2)
    
    scrollContainerRef.current.scrollTo({
      left: Math.max(0, scrollTarget),
      behavior: 'smooth'
    })
  }, [todayIndex, dayWidth, safeContainerWidth])
  
  const handleZoomIn = useCallback(() => {
    if (zoomIndex &lt; ZOOM_LEVELS.length - 1) {
      const scrollContainer = scrollContainerRef.current
      if (scrollContainer) {
        const visibleWidth = safeContainerWidth - SIDEBAR_WIDTH
        const centerX = scrollContainer.scrollLeft + visibleWidth / 2
        const centerDayIndex = centerX / dayWidth
        
        setZoomIndex(prev => prev + 1)
        
        requestAnimationFrame(() => {
          const newMonthsVisible = ZOOM_LEVELS[zoomIndex + 1].monthsVisible
          const newDaysVisible = newMonthsVisible * 30.44
          const newDayWidth = Math.max(4, (safeContainerWidth - SIDEBAR_WIDTH) / newDaysVisible)
          const newScrollLeft = centerDayIndex * newDayWidth - visibleWidth / 2
          scrollContainer.scrollLeft = Math.max(0, newScrollLeft)
        })
      } else {
        setZoomIndex(prev => prev + 1)
      }
    }
  }, [zoomIndex, dayWidth, safeContainerWidth])
  
  const handleZoomOut = useCallback(() => {
    if (zoomIndex > 0) {
      const scrollContainer = scrollContainerRef.current
      if (scrollContainer) {
        const visibleWidth = safeContainerWidth - SIDEBAR_WIDTH
        const centerX = scrollContainer.scrollLeft + visibleWidth / 2
        const centerDayIndex = centerX / dayWidth
        
        setZoomIndex(prev => prev - 1)
        
        requestAnimationFrame(() => {
          const newMonthsVisible = ZOOM_LEVELS[zoomIndex - 1].monthsVisible
          const newDaysVisible = newMonthsVisible * 30.44
          const newDayWidth = Math.max(4, (safeContainerWidth - SIDEBAR_WIDTH) / newDaysVisible)
          const newScrollLeft = centerDayIndex * newDayWidth - visibleWidth / 2
          scrollContainer.scrollLeft = Math.max(0, newScrollLeft)
        })
      } else {
        setZoomIndex(prev => prev - 1)
      }
    }
  }, [zoomIndex, dayWidth, safeContainerWidth])
  
  const handleZoomPreset = useCallback((index: number) => {
    if (index >= 0 &amp;&amp; index &lt; ZOOM_LEVELS.length &amp;&amp; index !== zoomIndex) {
      const scrollContainer = scrollContainerRef.current
      if (scrollContainer) {
        const visibleWidth = safeContainerWidth - SIDEBAR_WIDTH
        const centerX = scrollContainer.scrollLeft + visibleWidth / 2
        const centerDayIndex = centerX / dayWidth
        
        setZoomIndex(index)
        
        requestAnimationFrame(() => {
          const newMonthsVisible = ZOOM_LEVELS[index].monthsVisible
          const newDaysVisible = newMonthsVisible * 30.44
          const newDayWidth = Math.max(4, (safeContainerWidth - SIDEBAR_WIDTH) / newDaysVisible)
          const newScrollLeft = centerDayIndex * newDayWidth - visibleWidth / 2
          scrollContainer.scrollLeft = Math.max(0, newScrollLeft)
        })
      } else {
        setZoomIndex(index)
      }
    }
  }, [zoomIndex, dayWidth, safeContainerWidth])
  
  const handleCopySale = useCallback((sale: SaleWithDetails) => {
    const startDate = normalizeToLocalDate(sale.start_date)
    const endDate = normalizeToLocalDate(sale.end_date)
    const duration = differenceInDays(endDate, startDate) + 1
    
    setClipboardSale({
      sale_name: sale.sale_name ?? null,
      discount_percentage: sale.discount_percentage ?? null,
      sale_type: sale.sale_type,
      start_date: sale.start_date,
      end_date: sale.end_date,
      product_id: sale.product_id,
      platform_id: sale.platform_id,
      duration
    })
    setSelectedSaleId(sale.id)
    
    setCopyFeedback('Sale copied! Press Cmd+V to paste')
    setTimeout(() => setCopyFeedback(null), 2000)
  }, [])
  
  const handlePasteSale = useCallback(() => {
    if (!clipboardSale || !onCreateSale) return
    
    const today = new Date()
    const startDate = format(today, 'yyyy-MM-dd')
    const endDate = format(addDays(today, clipboardSale.duration - 1), 'yyyy-MM-dd')
    
    onCreateSale({
      productId: clipboardSale.product_id,
      platformId: clipboardSale.platform_id,
      startDate,
      endDate
    })
    
    setCopyFeedback('Pasted! Adjust dates in the modal')
    setTimeout(() => setCopyFeedback(null), 2000)
  }, [clipboardSale, onCreateSale])
  
  const handleSaleSelect = useCallback((sale: SaleWithDetails) => {
    setSelectedSaleId(prev => prev === sale.id ? null : sale.id)
  }, [])
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }
      
      if ((e.ctrlKey || e.metaKey) &amp;&amp; (e.key === '=' || e.key === '+')) {
        e.preventDefault()
        handleZoomIn()
      } else if ((e.ctrlKey || e.metaKey) &amp;&amp; e.key === '-') {
        e.preventDefault()
        handleZoomOut()
      }
      else if ((e.ctrlKey || e.metaKey) &amp;&amp; e.key === 'c') {
        if (selectedSaleId) {
          const sale = sales.find(s => s.id === selectedSaleId)
          if (sale) {
            e.preventDefault()
            handleCopySale(sale)
          }
        }
      }
      else if ((e.ctrlKey || e.metaKey) &amp;&amp; e.key === 'v') {
        if (clipboardSale) {
          e.preventDefault()
          handlePasteSale()
        }
      }
      else if (e.key === 'Escape') {
        setSelectedSaleId(null)
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleZoomIn, handleZoomOut, selectedSaleId, sales, handleCopySale, clipboardSale, handlePasteSale])
  
  const groupedProducts = useMemo(() => {
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
    
    Array.from(gameMap.entries()).forEach(([gameId, prods]) => {
      if (prods.length > 0 &amp;&amp; prods[0].game) {
        groups.push({ game: prods[0].game, products: prods })
      }
    })
    
    return groups.sort((a, b) => a.game.name.localeCompare(b.game.name))
  }, [products])
  
  const eventsByPlatform = useMemo(() => {
    const map = new Map&lt;string, PlatformEvent[]&gt;()
    if (!showEvents) return map
    
    const timelineEndDay = days[days.length - 1]
    
    for (const event of platformEvents) {
      const eventStart = normalizeToLocalDate(event.start_date)
      const eventEnd = normalizeToLocalDate(event.end_date)
      
      if (eventEnd >= days[0] &amp;&amp; eventStart &lt;= timelineEndDay) {
        const platformId = event.platform_id
        if (!map.has(platformId)) {
          map.set(platformId, [])
        }
        map.get(platformId)!.push(event)
      }
    }
    
    return map
  }, [platformEvents, days, showEvents])
  
  const platformsWithEventsArray = useMemo(() => {
    return Array.from(eventsByPlatform.keys())
  }, [eventsByPlatform])
  
  const getPositionForDate = useCallback((date: Date | string): number => {
    const d = typeof date === 'string' ? normalizeToLocalDate(date) : date
    const daysDiff = differenceInDays(d, days[0])
    return daysDiff * dayWidth
  }, [days, dayWidth])
  
  const getWidthForRange = useCallback((start: Date | string, end: Date | string): number => {
    const s = typeof start === 'string' ? normalizeToLocalDate(start) : start
    const e = typeof end === 'string' ? normalizeToLocalDate(end) : end
    const daysDiff = differenceInDays(e, s) + 1
    return daysDiff * dayWidth
  }, [dayWidth])
  
  const getDayIndexForDate = useCallback((date: Date | string): number => {
    const d = typeof date === 'string' ? normalizeToLocalDate(date) : date
    return differenceInDays(d, days[0])
  }, [days])
  
  const getEventsForPlatform = useCallback((platformId: string) => {
    const events = eventsByPlatform.get(platformId) || []
    return events.map(event => {
      const eventStart = normalizeToLocalDate(event.start_date)
      const eventEnd = normalizeToLocalDate(event.end_date)
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
  
  const getPlatformsForProduct = useCallback((productId: string) => {
    const productSales = getSalesForProduct(productId)
    const platformIdsWithSales = productSales.map(s => s.platform_id)
    
    const allPlatformIdsSet = new Set([
      ...platformIdsWithSales,
      ...(showEvents ? platformsWithEventsArray : [])
    ])
    
    return Array.from(allPlatformIdsSet)
      .map(id => platforms.find(p => p.id === id))
      .filter((p): p is Platform => p !== undefined)
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [getSalesForProduct, platforms, platformsWithEventsArray, showEvents])
  
  const getSalesForProductPlatform = useCallback((productId: string, platformId: string) => {
    return getSalesForProduct(productId).filter(sale => sale.platform_id === platformId)
  }, [getSalesForProduct])
  
  const getCooldownForSale = useCallback((sale: SaleWithDetails) => {
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
  
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const saleId = event.active.id as string
    const sale = sales.find(s => s.id === saleId)
    if (sale) {
      setDraggedSale(sale)
      setValidationError(null)
    }
  }, [sales])
  
  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, delta } = event
    
    if (!draggedSale || !delta) {
      setDraggedSale(null)
      return
    }
    
    const daysMoved = Math.round(delta.x / dayWidth)
    
    if (daysMoved === 0) {
      setDraggedSale(null)
      return
    }
    
    const originalStart = normalizeToLocalDate(draggedSale.start_date)
    const originalEnd = normalizeToLocalDate(draggedSale.end_date)
    const newStart = addDays(originalStart, daysMoved)
    const newEnd = addDays(originalEnd, daysMoved)
    
    const newStartStr = format(newStart, 'yyyy-MM-dd')
    const newEndStr = format(newEnd, 'yyyy-MM-dd')
    
    const otherSales = allSales.filter(s => s.id !== draggedSale.id)
    const platform = platforms.find(p => p.id === draggedSale.platform_id)
    
    if (!platform) {
      setValidationError('Platform not found')
      setTimeout(() => setValidationError(null), 3000)
      setDraggedSale(null)
      return
    }
    
    const validation = validateSale(
      {
        ...draggedSale,
        start_date: newStartStr,
        end_date: newEndStr
      },
      otherSales,
      platform
    )
    
    if (!validation.valid) {
      setValidationError(validation.error || 'Invalid sale placement')
      setTimeout(() => setValidationError(null), 3000)
      setDraggedSale(null)
      return
    }
    
    setOptimisticUpdates(prev => ({
      ...prev,
      [draggedSale.id]: { startDate: newStartStr, endDate: newEndStr }
    }))
    
    try {
      await onSaleUpdate(draggedSale.id, {
        start_date: newStartStr,
        end_date: newEndStr
      })
    } catch (error) {
      setOptimisticUpdates(prev => {
        const next = { ...prev }
        delete next[draggedSale.id]
        return next
      })
      setValidationError('Failed to update sale')
      setTimeout(() => setValidationError(null), 3000)
    }
    
    setDraggedSale(null)
  }, [draggedSale, dayWidth, allSales, platforms, onSaleUpdate])
  
  const handleSelectionStart = useCallback((productId: string, platformId: string, dayIndex: number, e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    
    const newSelection: SelectionState = {
      productId,
      platformId,
      startDayIndex: dayIndex,
      endDayIndex: dayIndex
    }
    setSelection(newSelection)
    
    selectionRef.current = {
      data: newSelection,
      callback: onCreateSale,
      days
    }
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!selectionRef.current) return
      
      const container = scrollContainerRef.current
      if (!container) return
      
      const rect = container.getBoundingClientRect()
      const scrollLeft = container.scrollLeft
      const x = moveEvent.clientX - rect.left + scrollLeft
      const currentDayIndex = Math.floor(x / dayWidth)
      const clampedDayIndex = Math.max(0, Math.min(currentDayIndex, days.length - 1))
      
      setSelection(prev => {
        if (!prev) return prev
        return { ...prev, endDayIndex: clampedDayIndex }
      })
      
      if (selectionRef.current) {
        selectionRef.current.data = {
          ...selectionRef.current.data,
          endDayIndex: clampedDayIndex
        }
      }
    }
    
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      
      if (selectionRef.current) {
        const { data, callback, days: selDays } = selectionRef.current
        const startIdx = Math.min(data.startDayIndex, data.endDayIndex)
        const endIdx = Math.max(data.startDayIndex, data.endDayIndex)
        
        if (endIdx - startIdx >= 0 &amp;&amp; callback) {
          const startDate = format(selDays[startIdx], 'yyyy-MM-dd')
          const endDate = format(selDays[endIdx], 'yyyy-MM-dd')
          
          callback({
            productId: data.productId,
            platformId: data.platformId,
            startDate,
            endDate
          })
        }
        
        selectionRef.current = null
      }
      
      setSelection(null)
    }
    
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [onCreateSale, days, dayWidth])
  
  const handleLaunchDateDragStart = useCallback((productId: string, originalDate: string, e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    
    launchDragRef.current = {
      productId,
      originalDate,
      startX: e.clientX,
      hasMoved: false
    }
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!launchDragRef.current) return
      
      const deltaX = moveEvent.clientX - launchDragRef.current.startX
      if (Math.abs(deltaX) > 5) {
        launchDragRef.current.hasMoved = true
      }
      
      const daysMoved = Math.round(deltaX / dayWidth)
      const originalDateObj = normalizeToLocalDate(launchDragRef.current.originalDate)
      const newDate = addDays(originalDateObj, daysMoved)
      const newDayIndex = getDayIndexForDate(newDate)
      
      setLaunchDateDrag({
        productId: launchDragRef.current.productId,
        originalDate: launchDragRef.current.originalDate,
        currentDayIndex: Math.max(0, Math.min(newDayIndex, days.length - 1))
      })
    }
    
    const handleMouseUp = async () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      
      if (launchDragRef.current &amp;&amp; launchDragRef.current.hasMoved &amp;&amp; launchDateDrag &amp;&amp; onLaunchDateChange) {
        const newDate = days[launchDateDrag.currentDayIndex]
        const newDateStr = format(newDate, 'yyyy-MM-dd')
        
        try {
          await onLaunchDateChange(launchDragRef.current.productId, newDateStr)
        } catch (error) {
          console.error('Failed to update launch date:', error)
        }
      }
      
      launchDragRef.current = null
      setLaunchDateDrag(null)
    }
    
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [dayWidth, days, getDayIndexForDate, launchDateDrag, onLaunchDateChange])
  
  const handleLaunchSaleResizeStart = useCallback((productId: string, currentDuration: number, launchDate: string, e: React.MouseEvent) => {
    if (e.button !== 0) return
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
      currentDuration,
      edge: 'right'
    })
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!launchSaleResizeRef.current) return
      
      const deltaX = moveEvent.clientX - launchSaleResizeRef.current.startX
      const daysChanged = Math.round(deltaX / dayWidth)
      const newDuration = Math.max(MIN_LAUNCH_SALE_DAYS, Math.min(MAX_LAUNCH_SALE_DAYS, launchSaleResizeRef.current.originalDuration + daysChanged))
      
      setLaunchSaleResize(prev => prev ? { ...prev, currentDuration: newDuration } : null)
    }
    
    const handleMouseUp = async () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      
      if (launchSaleResizeRef.current &amp;&amp; launchSaleResize &amp;&amp; onLaunchSaleDurationChange) {
        const newDuration = launchSaleResize.currentDuration
        if (newDuration !== launchSaleResizeRef.current.originalDuration) {
          try {
            await onLaunchSaleDurationChange(launchSaleResizeRef.current.productId, newDuration)
          } catch (error) {
            console.error('Failed to update launch sale duration:', error)
          }
        }
      }
      
      launchSaleResizeRef.current = null
      setLaunchSaleResize(null)
    }
    
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [dayWidth, launchSaleResize, onLaunchSaleDurationChange])
  
  const handleScrollGrabStart = useCallback((e: React.MouseEvent, isThumbDrag: boolean = false) => {
    if (e.button !== 0) return
    
    const scrollContainer = scrollContainerRef.current
    if (!scrollContainer) return
    
    e.preventDefault()
    setIsGrabbing(true)
    
    scrollGrabRef.current = {
      startX: e.clientX,
      startScrollLeft: scrollContainer.scrollLeft,
      isThumbDrag
    }
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!scrollGrabRef.current || !scrollContainer) return
      
      const deltaX = moveEvent.clientX - scrollGrabRef.current.startX
      
      if (scrollGrabRef.current.isThumbDrag) {
        const trackWidth = scrollContainer.clientWidth - SIDEBAR_WIDTH
        const contentWidth = scrollContainer.scrollWidth - SIDEBAR_WIDTH
        const scrollRatio = contentWidth / trackWidth
        scrollContainer.scrollLeft = scrollGrabRef.current.startScrollLeft + (deltaX * scrollRatio)
      } else {
        scrollContainer.scrollLeft = scrollGrabRef.current.startScrollLeft - deltaX
      }
    }
    
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      setIsGrabbing(false)
      scrollGrabRef.current = null
    }
    
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [])
  
  const handleScroll = useCallback(() => {
    const scrollContainer = scrollContainerRef.current
    if (!scrollContainer) return
    
    const { scrollLeft, scrollWidth, clientWidth } = scrollContainer
    const maxScroll = scrollWidth - clientWidth
    const progress = maxScroll > 0 ? scrollLeft / maxScroll : 0
    setScrollProgress(progress)
    
    handleInfiniteScroll()
  }, [handleInfiniteScroll])
  
  useEffect(() => {
    if (!isContainerReady || hasInitialScrolled || todayIndex === -1) return
    
    const timer = setTimeout(() => {
      scrollToToday()
      setHasInitialScrolled(true)
    }, 100)
    
    return () => clearTimeout(timer)
  }, [isContainerReady, hasInitialScrolled, todayIndex, scrollToToday])
  
  const visibleWidth = safeContainerWidth - SIDEBAR_WIDTH
  const contentWidth = totalDays * dayWidth
  const thumbWidth = Math.max(40, (visibleWidth / contentWidth) * visibleWidth)
  const trackWidth = visibleWidth - thumbWidth
  const thumbLeft = SIDEBAR_WIDTH + (scrollProgress * trackWidth)
  
  const totalRows = useMemo(() => {
    return groupedProducts.reduce((total, group) => {
      const platformsForGroup = group.products.reduce((platformSet, product) => {
        const productPlatforms = getPlatformsForProduct(product.id)
        productPlatforms.forEach(p => platformSet.add(p.id))
        return platformSet
      }, new Set&lt;string&gt;())
      return total + group.products.length * platformsForGroup.size + 1
    }, 0)
  }, [groupedProducts, getPlatformsForProduct])
  
  const totalContentHeight = totalRows * ROW_HEIGHT
  
  return (
    &lt;div className={styles.ganttContainer} ref={containerRef}&gt;
      {validationError &amp;&amp; (
        &lt;div className={styles.validationError}&gt;
          {validationError}
        &lt;/div&gt;
      )}
      
      {copyFeedback &amp;&amp; (
        &lt;div className={styles.copyFeedback}&gt;
          {copyFeedback}
        &lt;/div&gt;
      )}
      
      &lt;div className={styles.toolbar}&gt;
        &lt;div className={styles.toolbarLeft}&gt;
          &lt;button onClick={scrollToToday} className={styles.todayButton}&gt;
            Today
          &lt;/button&gt;
          {visibleDateRange &amp;&amp; (
            &lt;span className={styles.dateRange}&gt;
              {format(visibleDateRange.start, 'MMM d')} - {format(visibleDateRange.end, 'MMM d, yyyy')}
            &lt;/span&gt;
          )}
        &lt;/div&gt;
        &lt;div className={styles.toolbarRight}&gt;
          &lt;div className={styles.zoomControls}&gt;
            &lt;button 
              onClick={handleZoomOut} 
              disabled={zoomIndex === 0}
              className={styles.zoomButton}
              title="Zoom out (Ctrl+-)"
            &gt;
              −
            &lt;/button&gt;
            &lt;div className={styles.zoomPresets}&gt;
              {ZOOM_LEVELS.map((level, idx) =&gt; (
                &lt;button
                  key={level.name}
                  onClick={() =&gt; handleZoomPreset(idx)}
                  className={`${styles.zoomPresetButton} ${idx === zoomIndex ? styles.zoomPresetActive : ''}`}
                  title={level.name}
                &gt;
                  {level.label}
                &lt;/button&gt;
              ))}
            &lt;/div&gt;
            &lt;button 
              onClick={handleZoomIn} 
              disabled={zoomIndex === ZOOM_LEVELS.length - 1}
              className={styles.zoomButton}
              title="Zoom in (Ctrl++)"
            &gt;
              +
            &lt;/button&gt;
          &lt;/div&gt;
          {clipboardSale &amp;&amp; (
            &lt;div className={styles.clipboardIndicator} title="Sale copied - press Cmd+V to paste"&gt;
              📋
            &lt;/div&gt;
          )}
        &lt;/div&gt;
      &lt;/div&gt;
      
      &lt;div className={styles.legend}&gt;
        &lt;button 
          className={styles.legendToggle}
          onClick={() =&gt; setLegendCollapsed(!legendCollapsed)}
          title={legendCollapsed ? 'Show legend' : 'Hide legend'}
        &gt;
          {legendCollapsed ? '▶' : '▼'} Legend
        &lt;/button&gt;
        {!legendCollapsed &amp;&amp; (
          &lt;div className={styles.legendItems}&gt;
            &lt;div className={styles.legendItem}&gt;
              &lt;span className={styles.legendSwatch} style={{ backgroundColor: '#10b981' }}&gt;&lt;/span&gt;
              &lt;span&gt;Sale&lt;/span&gt;
            &lt;/div&gt;
            &lt;div className={styles.legendItem}&gt;
              &lt;span className={`${styles.legendSwatch} ${styles.cooldownSwatch}`}&gt;&lt;/span&gt;
              &lt;span&gt;Cooldown&lt;/span&gt;
            &lt;/div&gt;
            &lt;div className={styles.legendItem}&gt;
              &lt;span className={styles.legendSwatch} style={{ backgroundColor: '#f59e0b' }}&gt;&lt;/span&gt;
              &lt;span&gt;Seasonal Event&lt;/span&gt;
            &lt;/div&gt;
            &lt;div className={styles.legendItem}&gt;
              &lt;span className={styles.legendSwatch} style={{ backgroundColor: '#8b5cf6' }}&gt;&lt;/span&gt;
              &lt;span&gt;Major Event&lt;/span&gt;
            &lt;/div&gt;
            &lt;div className={styles.legendItem}&gt;
              &lt;span className={styles.legendSwatch} style={{ backgroundColor: '#06b6d4' }}&gt;&lt;/span&gt;
              &lt;span&gt;Launch Sale&lt;/span&gt;
            &lt;/div&gt;
            &lt;div className={styles.legendItem}&gt;
              &lt;span className={styles.legendSelected}&gt;&lt;/span&gt;
              &lt;span&gt;Selected&lt;/span&gt;
            &lt;/div&gt;
          &lt;/div&gt;
        )}
      &lt;/div&gt;
      
      &lt;div 
        className={`${styles.scrollContainer} ${isGrabbing ? styles.grabbing : ''}`}
        ref={scrollContainerRef}
        onScroll={handleScroll}
        onMouseDown={(e) =&gt; {
          if (e.target === e.currentTarget) {
            handleScrollGrabStart(e)
          }
        }}
      &gt;
        &lt;div className={styles.ganttContent} style={{ width: SIDEBAR_WIDTH + totalDays * dayWidth }}&gt;
          &lt;div className={styles.header} style={{ height: HEADER_HEIGHT }}&gt;
            &lt;div className={styles.sidebarHeader} style={{ width: SIDEBAR_WIDTH }}&gt;
              Products / Platforms
            &lt;/div&gt;
            &lt;div className={styles.timelineHeader}&gt;
              &lt;div className={styles.monthsRow}&gt;
                {months.map((month, idx) =&gt; (
                  &lt;div 
                    key={idx} 
                    className={styles.monthCell}
                    style={{ width: month.days * dayWidth }}
                  &gt;
                    {format(month.date, 'MMMM yyyy')}
                  &lt;/div&gt;
                ))}
              &lt;/div&gt;
              &lt;div className={styles.daysRow}&gt;
                {days.map((day, idx) =&gt; {
                  const isWeekend = day.getDay() === 0 || day.getDay() === 6
                  const isTodayDay = isToday(day)
                  return (
                    &lt;div 
                      key={idx}
                      className={`${styles.dayCell} ${isWeekend ? styles.weekend : ''} ${isTodayDay ? styles.today : ''}`}
                      style={{ width: dayWidth }}
                      title={format(day, 'EEEE, MMMM d, yyyy')}
                    &gt;
                      {dayWidth &gt; 20 &amp;&amp; format(day, 'd')}
                    &lt;/div&gt;
                  )
                })}
              &lt;/div&gt;
            &lt;/div&gt;
          &lt;/div&gt;
          
          &lt;div className={styles.body} style={{ minHeight: totalContentHeight }}&gt;
            &lt;DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}&gt;
              {groupedProducts.map((group) =&gt; (
                &lt;div key={group.game.id} className={styles.gameGroup}&gt;
                  &lt;div className={styles.gameHeader}&gt;
                    &lt;div className={styles.sidebarCell} style={{ width: SIDEBAR_WIDTH }}&gt;
                      &lt;span className={styles.gameName}&gt;{group.game.name}&lt;/span&gt;
                      &lt;span className={styles.clientName}&gt;{group.game.client?.name}&lt;/span&gt;
                    &lt;/div&gt;
                    &lt;div className={styles.timelineRow} style={{ width: totalDays * dayWidth }}&gt;
                      {todayIndex &gt;= 0 &amp;&amp; (
                        &lt;div 
                          className={styles.todayLine} 
                          style={{ left: todayIndex * dayWidth + dayWidth / 2 }}
                        /&gt;
                      )}
                    &lt;/div&gt;
                  &lt;/div&gt;
                  
                  {group.products.map((product) =&gt; {
                    const productPlatforms = getPlatformsForProduct(product.id)
                    const launchDate = product.launch_date
                    const launchSaleDuration = product.launch_sale_duration || 7
                    
                    return (
                      &lt;div key={product.id} className={styles.productGroup}&gt;
                        {productPlatforms.map((platform) =&gt; {
                          const platformSales = getSalesForProductPlatform(product.id, platform.id)
                          const platformEvents = getEventsForPlatform(platform.id)
                          const gapInfo = getGapIndicator(product.id, platform.id)
                          
                          const isLaunchRow = launchDate &amp;&amp; platform.name.toLowerCase().includes('steam')
                          let launchDayIndex = -1
                          let displayLaunchSaleDuration = launchSaleDuration
                          
                          if (isLaunchRow &amp;&amp; launchDate) {
                            if (launchDateDrag &amp;&amp; launchDateDrag.productId === product.id) {
                              launchDayIndex = launchDateDrag.currentDayIndex
                            } else {
                              launchDayIndex = getDayIndexForDate(launchDate)
                            }
                            
                            if (launchSaleResize &amp;&amp; launchSaleResize.productId === product.id) {
                              displayLaunchSaleDuration = launchSaleResize.currentDuration
                            }
                          }
                          
                          const launchConflicts = isLaunchRow &amp;&amp; launchDate 
                            ? getLaunchSaleConflicts(launchDate, displayLaunchSaleDuration)
                            : []
                          
                          return (
                            &lt;div key={platform.id} className={styles.platformRow} style={{ height: ROW_HEIGHT }}&gt;
                              &lt;div className={styles.sidebarCell} style={{ width: SIDEBAR_WIDTH }}&gt;
                                &lt;div className={styles.productInfo}&gt;
                                  &lt;span className={styles.productName}&gt;{product.name}&lt;/span&gt;
                                  &lt;div className={styles.platformInfo}&gt;
                                    &lt;span 
                                      className={styles.platformBadge}
                                      style={{ backgroundColor: platform.color_hex || '#666' }}
                                    &gt;
                                      {platform.name}
                                    &lt;/span&gt;
                                    {gapInfo &amp;&amp; (
                                      &lt;span className={`${styles.gapIndicator} ${gapInfo.isWarning ? styles.gapWarning : ''}`}&gt;
                                        {gapInfo.text}
                                      &lt;/span&gt;
                                    )}
                                  &lt;/div&gt;
                                &lt;/div&gt;
                                &lt;div className={styles.productActions}&gt;
                                  {onGenerateCalendar &amp;&amp; (
                                    &lt;button
                                      className={styles.actionButton}
                                      onClick={() =&gt; onGenerateCalendar(product.id, product.name, launchDate || undefined)}
                                      title="Auto-generate sales calendar"
                                    &gt;
                                      🗓️
                                    &lt;/button&gt;
                                  )}
                                  {onClearSales &amp;&amp; (
                                    &lt;button
                                      className={styles.actionButton}
                                      onClick={() =&gt; onClearSales(product.id, product.name)}
                                      title="Clear all sales for this product"
                                    &gt;
                                      🗑️
                                    &lt;/button&gt;
                                  )}
                                &lt;/div&gt;
                              &lt;/div&gt;
                              
                              &lt;div 
                                className={styles.timelineRow}
                                style={{ width: totalDays * dayWidth }}
                                onMouseDown={(e) =&gt; {
                                  if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains(styles.dayColumn)) {
                                    const rect = e.currentTarget.getBoundingClientRect()
                                    const x = e.clientX - rect.left
                                    const dayIndex = Math.floor(x / dayWidth)
                                    handleSelectionStart(product.id, platform.id, dayIndex, e)
                                  }
                                }}
                              &gt;
                                {days.map((day, dayIdx) =&gt; {
                                  const isWeekend = day.getDay() === 0 || day.getDay() === 6
                                  return (
                                    &lt;div
                                      key={dayIdx}
                                      className={`${styles.dayColumn} ${isWeekend ? styles.weekend : ''}`}
                                      style={{ width: dayWidth, left: dayIdx * dayWidth }}
                                    /&gt;
                                  )
                                })}
                                
                                {todayIndex &gt;= 0 &amp;&amp; (
                                  &lt;div 
                                    className={styles.todayLine} 
                                    style={{ left: todayIndex * dayWidth + dayWidth / 2 }}
                                  /&gt;
                                )}
                                
                                {showEvents &amp;&amp; platformEvents.map((event) =&gt; (
                                  &lt;div
                                    key={event.id}
                                    className={`${styles.eventBlock} ${event.event_type === 'seasonal' ? styles.seasonalEvent : styles.majorEvent}`}
                                    style={{
                                      left: event.left,
                                      width: event.width
                                    }}
                                    title={`${event.name} (${format(event.displayStart, 'MMM d')} - ${format(event.displayEnd, 'MMM d')})`}
                                  &gt;
                                    {event.width &gt; 60 &amp;&amp; (
                                      &lt;span className={styles.eventLabel}&gt;{event.name}&lt;/span&gt;
                                    )}
                                  &lt;/div&gt;
                                ))}
                                
                                {platformSales.map((sale) =&gt; {
                                  const saleStart = normalizeToLocalDate(sale.start_date)
                                  const saleEnd = normalizeToLocalDate(sale.end_date)
                                  const left = getPositionForDate(saleStart)
                                  const width = getWidthForRange(saleStart, saleEnd)
                                  const cooldown = getCooldownForSale(sale)
                                  const isSelected = selectedSaleId === sale.id
                                  
                                  return (
                                    &lt;div key={sale.id}&gt;
                                      &lt;SaleBlock
                                        sale={sale}
                                        left={left}
                                        width={width}
                                        dayWidth={dayWidth}
                                        onEdit={onSaleEdit}
                                        onDelete={onSaleDelete}
                                        onDuplicate={onSaleDuplicate}
                                        onCopy={handleCopySale}
                                        onSelect={handleSaleSelect}
                                        isSelected={isSelected}
                                        isDragging={draggedSale?.id === sale.id}
                                      /&gt;
                                      {cooldown &amp;&amp; (
                                        &lt;div
                                          className={styles.cooldownBlock}
                                          style={{
                                            left: cooldown.left,
                                            width: cooldown.width
                                          }}
                                          title={`Cooldown until ${format(cooldown.end, 'MMM d, yyyy')}`}
                                        /&gt;
                                      )}
                                    &lt;/div&gt;
                                  )
                                })}
                                
                                {isLaunchRow &amp;&amp; launchDayIndex &gt;= 0 &amp;&amp; launchDayIndex &lt; days.length &amp;&amp; (
                                  &lt;div
                                    className={`${styles.launchSaleBlock} ${launchConflicts.length &gt; 0 ? styles.launchConflict : ''}`}
                                    style={{
                                      left: launchDayIndex * dayWidth,
                                      width: displayLaunchSaleDuration * dayWidth
                                    }}
                                    onMouseDown={(e) =&gt; handleLaunchDateDragStart(product.id, launchDate!, e)}
                                    onDoubleClick={() =&gt; onEditLaunchDate?.(product.id, product.name, launchDate!, launchSaleDuration)}
                                    title={launchConflicts.length &gt; 0 
                                      ? `Launch sale conflicts with: ${launchConflicts.map(c =&gt; c.eventName).join(', ')}`
                                      : `Launch sale: ${format(days[launchDayIndex], 'MMM d')} - ${format(addDays(days[launchDayIndex], displayLaunchSaleDuration - 1), 'MMM d')} (${displayLaunchSaleDuration} days). Drag to move, double-click to edit.`
                                    }
                                  &gt;
                                    &lt;span className={styles.launchLabel}&gt;
                                      🚀 Launch {launchConflicts.length &gt; 0 &amp;&amp; '⚠️'}
                                    &lt;/span&gt;
                                    &lt;div 
                                      className={styles.launchResizeHandle}
                                      onMouseDown={(e) =&gt; handleLaunchSaleResizeStart(product.id, launchSaleDuration, launchDate!, e)}
                                      title="Drag to resize launch sale duration"
                                    /&gt;
                                  &lt;/div&gt;
                                )}
                                
                                {selection &amp;&amp; selection.productId === product.id &amp;&amp; selection.platformId === platform.id &amp;&amp; (
                                  &lt;div
                                    className={styles.selectionBox}
                                    style={{
                                      left: Math.min(selection.startDayIndex, selection.endDayIndex) * dayWidth,
                                      width: (Math.abs(selection.endDayIndex - selection.startDayIndex) + 1) * dayWidth
                                    }}
                                  /&gt;
                                )}
                              &lt;/div&gt;
                            &lt;/div&gt;
                          )
                        })}
                      &lt;/div&gt;
                    )
                  })}
                &lt;/div&gt;
              ))}
              
              &lt;DragOverlay&gt;
                {draggedSale &amp;&amp; (
                  &lt;div className={styles.dragOverlay}&gt;
                    &lt;SaleBlock
                      sale={draggedSale}
                      left={0}
                      width={getWidthForRange(draggedSale.start_date, draggedSale.end_date)}
                      dayWidth={dayWidth}
                      onEdit={() =&gt; {}}
                      onDelete={async () =&gt; {}}
                      isDragging={true}
                    /&gt;
                  &lt;/div&gt;
                )}
              &lt;/DragOverlay&gt;
            &lt;/DndContext&gt;
          &lt;/div&gt;
        &lt;/div&gt;
      &lt;/div&gt;
      
      &lt;div 
        className={styles.scrollTrack}
        ref={scrollTrackRef}
        style={{ left: SIDEBAR_WIDTH }}
        onMouseDown={(e) =&gt; {
          if (e.target === scrollTrackRef.current) {
            const rect = scrollTrackRef.current!.getBoundingClientRect()
            const clickX = e.clientX - rect.left
            const clickRatio = clickX / rect.width
            const scrollContainer = scrollContainerRef.current
            if (scrollContainer) {
              const maxScroll = scrollContainer.scrollWidth - scrollContainer.clientWidth
              scrollContainer.scrollLeft = clickRatio * maxScroll
            }
          }
        }}
      &gt;
        &lt;div 
          className={`${styles.scrollThumb} ${isGrabbing ? styles.grabbing : ''}`}
          style={{ 
            width: thumbWidth,
            left: thumbLeft - SIDEBAR_WIDTH
          }}
          onMouseDown={(e) =&gt; handleScrollGrabStart(e, true)}
        /&gt;
      &lt;/div&gt;
    &lt;/div&gt;
  )
}
