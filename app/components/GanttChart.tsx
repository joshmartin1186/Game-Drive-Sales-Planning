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
