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
  onDelete: (saleId: string) => Promise<void>
}

export default function SaleBlock({ sale, left, width, onDelete }: SaleBlockProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: sale.id,
    data: { sale }
  })
  
  const style = {
    left,
    width,
    backgroundColor: sale.platform?.color_hex || '#3b82f6',
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 100 : 5,
  }
  
  const startDate = parseISO(sale.start_date)
  const endDate = parseISO(sale.end_date)
  
  const displayName = sale.sale_name || 'Custom Sale'
  const discountText = sale.discount_percentage ? `-${sale.discount_percentage}%` : ''
  
  return (
    <div
      ref={setNodeRef}
      className={styles.saleBlock}
      style={style}
      {...listeners}
      {...attributes}
      title={`${displayName}\n${format(startDate, 'MMM d')} - ${format(endDate, 'MMM d, yyyy')}\n${sale.platform?.name || 'Unknown Platform'}\n${discountText}`}
    >
      <span className={styles.saleName}>
        {displayName} {discountText}
      </span>
      
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
