'use client'

import { useState } from 'react'
import styles from './EditLaunchDateModal.module.css'

interface EditLaunchDateModalProps {
  isOpen: boolean
  onClose: () => void
  productId: string
  productName: string
  currentLaunchDate: string
  onSave: (productId: string, newLaunchDate: string, shiftSales: boolean) => void
  salesCount: number
}

export default function EditLaunchDateModal({
  isOpen,
  onClose,
  productId,
  productName,
  currentLaunchDate,
  onSave,
  salesCount
}: EditLaunchDateModalProps) {
  const [newDate, setNewDate] = useState(currentLaunchDate)
  const [shiftSales, setShiftSales] = useState(true)

  if (!isOpen) return null

  const handleSave = () => {
    onSave(productId, newDate, shiftSales)
  }

  const hasDateChanged = newDate !== currentLaunchDate

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>🚀 Edit Launch Date</h2>
          <button className={styles.closeBtn} onClick={onClose}>×</button>
        </div>

        <div className={styles.content}>
          <div className={styles.productInfo}>
            <span className={styles.label}>Product:</span>
            <span className={styles.productName}>{productName}</span>
          </div>

          <div className={styles.field}>
            <label>Launch Date</label>
            <input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className={styles.dateInput}
            />
          </div>

          {salesCount > 0 && hasDateChanged && (
            <div className={styles.shiftOption}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={shiftSales}
                  onChange={(e) => setShiftSales(e.target.checked)}
                />
                <span className={styles.checkboxText}>
                  Shift all {salesCount} sale{salesCount !== 1 ? 's' : ''} by the same amount
                </span>
              </label>
              <p className={styles.hint}>
                {shiftSales 
                  ? 'All existing sales will be moved to maintain their relative timing from launch.'
                  : 'Only the launch date marker will move. Sales will stay at their current dates.'}
              </p>
            </div>
          )}

          {salesCount === 0 && (
            <p className={styles.noSalesHint}>
              No sales scheduled for this product yet.
            </p>
          )}
        </div>

        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onClose}>
            Cancel
          </button>
          <button 
            className={styles.saveBtn} 
            onClick={handleSave}
            disabled={!hasDateChanged}
          >
            Save Launch Date
          </button>
        </div>
      </div>
    </div>
  )
}
