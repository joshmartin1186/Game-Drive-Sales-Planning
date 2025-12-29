'use client'

import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { format, parseISO } from 'date-fns'
import { SaleWithDetails } from '@/lib/types'
import styles from './SaleBlock.module.css'

interface SaleBlockProps {
  sale: SaleWithDetails
  left: number
  width: number
  isDragging?: boolean
  optimisticLeft?: number
  onEdit: (sale: SaleWithDetails) => void
  onDelete: (saleId: string) => Promise<void>
}

export default function SaleBlock({ 
  sale, 
  left, 
  width, 
  isDragging: externalDragging,
  optimisticLeft,
  onEdit,
  onDelete 
}: SaleBlockProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: sale.id,
    data: { sale }
  })
  
  // Use optimistic position if provided, otherwise use actual position
  const displayLeft = optimisticLeft !== undefined ? optimisticLeft : left
  
  const style = {
    left: displayLeft,
    width,
    backgroundColor: sale.platform?.color_hex || '#3b82f6',
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.7 : 1,
    zIndex: isDragging ? 100 : 5,
    cursor: isDragging ? 'grabbing' : 'grab',
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
    // Only trigger edit if not dragging and click target is not the delete button
    if (!isDragging && !(e.target as HTMLElement).closest('button')) {
      onEdit(sale)
    }
  }

  return (
    <div
      ref={setNodeRef}
      className={`${styles.saleBlock} ${isDragging ? styles.dragging : ''}`}
      style={style}
      onClick={handleClick}
      title={`${displayName}\n${format(startDate, 'MMM d')} - ${format(endDate, 'MMM d, yyyy')}\n${sale.platform?.name || 'Unknown Platform'}\n${discountText}\nClick to edit`}
    >
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
    </div>
  )
}
