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
  products: (Product & { game: Game & { client: Client } })[]
  platforms: Platform[]
  platformEvents: PlatformEvent[]
  timelineStart: Date
  monthCount: number
  onSaleUpdate: (saleId: string, updates: Partial<Sale>) => Promise<void>
  onSaleDelete: (saleId: string) => Promise<void>
  onSaleEdit: (sale: SaleWithDetails) => void
  onSaleDuplicate?: (sale: SaleWithDetails) => void
  onCreateSale?: (prefill: { productId: string; platformId: string; startDate: string; endDate: string }) => void
  onGenerateCalendar?: (productId: string, productName: string, launchDate?: string) => void
  onClearSales?: (productId: string, productName: string) => void
  onLaunchDateChange?: (productId: string, newLaunchDate: string) => Promise<void>
  onEditLaunchDate?: (productId: string, productName: string, currentLaunchDate: string, currentDuration: number) => void
  onLaunchSaleDurationChange?: (productId: string, newDuration: number) => Promise<void>
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
  const [containerWidth, setContainerWidth] = useState(1200)
  
  const dayWidth = useMemo(() => {
    const monthsVisible = ZOOM_LEVELS[zoomIndex].monthsVisible
    const daysVisible = monthsVisible * 30.44
    const availableWidth = containerWidth - SIDEBAR_WIDTH
    const calculated = availableWidth / daysVisible
    return Math.max(4, calculated)
  }, [zoomIndex, containerWidth])
  
  const [draggedSale, setDraggedSale] = useState<SaleWithDetails | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [optimisticUpdates, setOptimisticUpdates] = useState<Record<string, { startDate: string; endDate: string }>>({})
  const [selection, setSelection] = useState<SelectionState | null>(null)
  const [launchDateDrag, setLaunchDateDrag] = useState<LaunchDateDragState | null>(null)
  const [launchSaleResize, setLaunchSaleResize] = useState<LaunchSaleResizeState | null>(null)
  const [isGrabbing, setIsGrabbing] = useState(false)
  const [scrollProgress, setScrollProgress] = useState(0)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const scrollTrackRef = useRef<HTMLDivElement>(null)
  
  const selectionRef = useRef<{
    data: SelectionState
    callback: typeof onCreateSale
    days: Date[]
  } | null>(null)
  
  const launchDragRef = useRef<{
    productId: string
    originalDate: string
    startX: number
    hasMoved: boolean
  } | null>(null)
  
  const launchSaleResizeRef = useRef<{
    productId: string
    originalDuration: number
    startX: number
    launchDate: string
  } | null>(null)
  
  const scrollGrabRef = useRef<{
    startX: number
    startScrollLeft: number
    isThumbDrag: boolean
  } | null>(null)
  
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width
        if (width > 0) {
          setContainerWidth(width)
        }
      }
    })
    
    resizeObserver.observe(container)
    setContainerWidth(container.clientWidth || 1200)
    
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
    
    for (let i = 0; i < monthCount; i++) {
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
    const visibleWidth = containerWidth - SIDEBAR_WIDTH
    const startDayIndex = Math.floor(scrollLeft / dayWidth)
    const endDayIndex = Math.min(Math.floor((scrollLeft + visibleWidth) / dayWidth), days.length - 1)
    
    if (startDayIndex >= 0 && startDayIndex < days.length && endDayIndex >= 0) {
      return {
        start: days[startDayIndex],
        end: days[endDayIndex]
      }
    }
    return null
  }, [days, dayWidth, scrollProgress, containerWidth])

  const steamPlatformIds = useMemo(() => {
    return platforms
      .filter(p => p.name.toLowerCase().includes('steam'))
      .map(p => p.id)
  }, [platforms])

  const steamSeasonalEvents = useMemo(() => {
    if (steamPlatformIds.length === 0) return []
    return platformEvents.filter(e => 
      steamPlatformIds.includes(e.platform_id) && 
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

      if (launchStart <= eventEnd && launchEnd >= eventStart) {
        const overlapStart = launchStart > eventStart ? launchStart : eventStart
        const overlapEnd = launchEnd < eventEnd ? launchEnd : eventEnd
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

  return (
    <div 
      className={`${styles.container} ${draggedSale ? styles.dragging : ''}`}
      ref={containerRef}
    >
      <div>GanttChart component - file restored</div>
    </div>
  )
}