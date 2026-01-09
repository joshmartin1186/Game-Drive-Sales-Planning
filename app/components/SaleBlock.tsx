'use client'

import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { format, parseISO, addDays, differenceInDays } from 'date-fns'
import { useState, useCallback, useRef, useEffect } from 'react'
import { SaleWithDetails } from '@/lib/types'
import styles from './SaleBlock.module.css'

interface SaleBlockProps {
  sale: SaleWithDetails
  left: number
  width: number
  dayWidth: number
  isDragging?: boolean
  optimisticLeft?: number
  onEdit: (sale: SaleWithDetails) => void
  onDelete: (saleId: string) => Promise<void>
  onResize?: (saleId: string, newStart: string, newEnd: string) => Promise<void>
}

export default function SaleBlock({ 
  sale, 
  left, 
  width, 
  dayWidth = 28,
  isDragging: externalDragging,
  optimisticLeft,
  onEdit,
  onDelete,
  onResize
}: SaleBlockProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: sale.id,
    data: { sale }
  })
  
  const [isResizing, setIsResizing] = useState<'left' | 'right' | null>(null)
  const [resizeOffset, setResizeOffset] = useState(0)
  const resizeRef = useRef<{
    startX: number
    initialStart: string
    initialEnd: string
    edge: 'left' | 'right'
  } | null>(null)
  
  // Use optimistic position if provided, otherwise use actual position
  const displayLeft = optimisticLeft !== undefined ? optimisticLeft : left
  
  // Calculate display values based on resize offset
  const displayWidth = isResizing 
    ? (isResizing === 'right' ? width + resizeOffset : width - resizeOffset)
    : width
  const displayLeftPos = isResizing === 'left' 
    ? displayLeft + resizeOffset 
    : displayLeft
  
  const style = {
    left: displayLeftPos,
    width: Math.max(dayWidth, displayWidth), // Minimum 1 day width
    backgroundColor: sale.platform?.color_hex || '#3b82f6',
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.7 : 1,
    zIndex: isDragging || isResizing ? 100 : 5,
    cursor: isDragging ? 'grabbing' : isResizing ? 'ew-resize' : 'grab',
  }
  
  const startDate = parseISO(sale.start_date)
  const endDate = parseISO(sale.end_date)
  
  const displayName = sale.sale_name || 'Custom Sale'
  const discountText = sale.discount_percentage ? `-${sale.discount_percentage}%` : ''
  
  // Status badge
  const statusColors: Record<string, string> = {
    planned: '#94a3b8',
    submitted: '#f59e0b',
    confirmed: '#22c55e',
    live: '#ef4444',
    ended: '#6b7280'
  }

  const handleClick = (e: React.MouseEvent) => {
    // Only trigger edit if not dragging/resizing and click target is not a button or handle
    if (!isDragging && !isResizing && !(e.target as HTMLElement).closest('button') && !(e.target as HTMLElement).closest(`.${styles.resizeHandle}`)) {
      onEdit(sale)
    }
  }

  const handleResizeStart = useCallback((edge: 'left' | 'right', e: React.MouseEvent) => {
    if (!onResize) return
    e.preventDefault()
    e.stopPropagation()
    
    resizeRef.current = {
      startX: e.clientX,
      initialStart: sale.start_date,
      initialEnd: sale.end_date,
      edge
    }
    setIsResizing(edge)
    setResizeOffset(0)
  }, [onResize, sale.start_date, sale.end_date])

  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (!resizeRef.current || !isResizing) return
    
    const deltaX = e.clientX - resizeRef.current.startX
    // Snap to day increments
    const daysDelta = Math.round(deltaX / dayWidth)
    const pixelOffset = daysDelta * dayWidth
    
    // Prevent making sale shorter than 1 day
    const currentDays = differenceInDays(parseISO(sale.end_date), parseISO(sale.start_date)) + 1
    
    if (isResizing === 'left') {
      // Left edge: positive delta shrinks sale, negative extends it
      const newDays = currentDays - daysDelta
      if (newDays >= 1) {
        setResizeOffset(pixelOffset)
      }
    } else {
      // Right edge: positive delta extends sale, negative shrinks it
      const newDays = currentDays + daysDelta
      if (newDays >= 1) {
        setResizeOffset(pixelOffset)
      }
    }
  }, [isResizing, dayWidth, sale.start_date, sale.end_date])

  const handleResizeEnd = useCallback(async () => {
    if (!resizeRef.current || !isResizing || !onResize) {
      resizeRef.current = null
      setIsResizing(null)
      setResizeOffset(0)
      return
    }
    
    const daysDelta = Math.round(resizeOffset / dayWidth)
    
    if (daysDelta === 0) {
      resizeRef.current = null
      setIsResizing(null)
      setResizeOffset(0)
      return
    }
    
    const originalStart = parseISO(resizeRef.current.initialStart)
    const originalEnd = parseISO(resizeRef.current.initialEnd)
    
    let newStart: Date, newEnd: Date
    
    if (isResizing === 'left') {
      newStart = addDays(originalStart, daysDelta)
      newEnd = originalEnd
    } else {
      newStart = originalStart
      newEnd = addDays(originalEnd, daysDelta)
    }
    
    const newStartStr = format(newStart, 'yyyy-MM-dd')
    const newEndStr = format(newEnd, 'yyyy-MM-dd')
    
    resizeRef.current = null
    setIsResizing(null)
    setResizeOffset(0)
    
    try {
      await onResize(sale.id, newStartStr, newEndStr)
    } catch (err) {
      console.error('Error resizing sale:', err)
    }
  }, [isResizing, resizeOffset, dayWidth, onResize, sale.id])

  // Global mouse event listeners for resize
  useEffect(() => {
    if (!isResizing) return
    
    const handleMouseMove = (e: MouseEvent) => {
      handleResizeMove(e)
    }
    
    const handleMouseUp = () => {
      handleResizeEnd()
    }
    
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing, handleResizeMove, handleResizeEnd])

  return (
    <div
      ref={setNodeRef}
      className={`${styles.saleBlock} ${isDragging ? styles.dragging : ''} ${isResizing ? styles.resizing : ''}`}
      style={style}
      onClick={handleClick}
      title={`${displayName}\n${format(startDate, 'MMM d')} - ${format(endDate, 'MMM d, yyyy')}\n${sale.platform?.name || 'Unknown Platform'}\n${discountText}\nClick to edit • Drag edges to resize`}
    >
      {/* Left resize handle */}
      {onResize && (
        <div
          className={`${styles.resizeHandle} ${styles.resizeHandleLeft}`}
          onMouseDown={(e) => handleResizeStart('left', e)}
        />
      )}
      
      <div 
        className={styles.dragHandle}
        {...listeners}
        {...attributes}
      >
        <span className={styles.saleName}>
          {displayName} {discountText}
        </span>
        
        {sale.status && (
          <span 
            className={styles.statusBadge}
            style={{ backgroundColor: statusColors[sale.status] || '#6b7280' }}
          >
            {sale.status}
          </span>
        )}
      </div>
      
      <div className={styles.actions}>
        <button
          className={styles.deleteBtn}
          onClick={(e) => {
            e.stopPropagation()
            onDelete(sale.id)
          }}
          title="Delete sale"
        >
          ×
        </button>
      </div>
      
      {/* Right resize handle */}
      {onResize && (
        <div
          className={`${styles.resizeHandle} ${styles.resizeHandleRight}`}
          onMouseDown={(e) => handleResizeStart('right', e)}
        />
      )}
    </div>
  )
}
