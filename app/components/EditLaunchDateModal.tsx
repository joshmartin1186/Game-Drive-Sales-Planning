'use client'

import { useState, useMemo } from 'react'
import { format, addDays, parseISO, differenceInDays } from 'date-fns'
import { PlatformEvent, Platform, LaunchConflict } from '@/lib/types'
import { normalizeToLocalDate } from '@/lib/dateUtils'
import styles from './EditLaunchDateModal.module.css'

interface EditLaunchDateModalProps {
  isOpen: boolean
  onClose: () => void
  productId: string
  productName: string
  currentLaunchDate: string
  currentLaunchSaleDuration: number
  onSave: (productId: string, newLaunchDate: string, launchSaleDuration: number, shiftSales: boolean) => void
  salesCount: number
  platformEvents: PlatformEvent[]
  platforms: Platform[]
}

export default function EditLaunchDateModal({
  isOpen,
  onClose,
  productId,
  productName,
  currentLaunchDate,
  currentLaunchSaleDuration,
  onSave,
  salesCount,
  platformEvents,
  platforms
}: EditLaunchDateModalProps) {
  const [newDate, setNewDate] = useState(currentLaunchDate)
  const [launchSaleDuration, setLaunchSaleDuration] = useState(currentLaunchSaleDuration || 7)
  const [shiftSales, setShiftSales] = useState(true)

  // Find Steam platform
  const steamPlatform = useMemo(() => {
    return platforms.find(p => p.name.toLowerCase() === 'steam')
  }, [platforms])

  // Check for conflicts with Steam seasonal sales
  const conflicts = useMemo((): LaunchConflict[] => {
    if (!newDate || !steamPlatform) return []

    const launchStart = normalizeToLocalDate(newDate)
    const launchEnd = addDays(launchStart, launchSaleDuration - 1)

    // Get Steam seasonal events
    const steamSeasonalEvents = platformEvents.filter(e => 
      e.platform_id === steamPlatform.id && 
      e.event_type === 'seasonal'
    )

    const foundConflicts: LaunchConflict[] = []

    for (const event of steamSeasonalEvents) {
      const eventStart = normalizeToLocalDate(event.start_date)
      const eventEnd = normalizeToLocalDate(event.end_date)

      // Check for overlap
      if (launchStart <= eventEnd && launchEnd >= eventStart) {
        const overlapStart = launchStart > eventStart ? launchStart : eventStart
        const overlapEnd = launchEnd < eventEnd ? launchEnd : eventEnd
        const overlapDays = differenceInDays(overlapEnd, overlapStart) + 1

        foundConflicts.push({
          eventName: event.name,
          eventStart,
          eventEnd,
          overlapStart,
          overlapEnd,
          overlapDays
        })
      }
    }

    return foundConflicts
  }, [newDate, launchSaleDuration, platformEvents, steamPlatform])

  if (!isOpen) return null

  const handleSave = () => {
    onSave(productId, newDate, launchSaleDuration, shiftSales)
  }

  const hasDateChanged = newDate !== currentLaunchDate
  const hasDurationChanged = launchSaleDuration !== currentLaunchSaleDuration
  const hasChanges = hasDateChanged || hasDurationChanged

  const launchEnd = newDate ? format(addDays(normalizeToLocalDate(newDate), launchSaleDuration - 1), 'MMM d, yyyy') : ''

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

          <div className={styles.field}>
            <label>Launch Sale Duration</label>
            <div className={styles.durationInput}>
              <input
                type="number"
                min={1}
                max={30}
                value={launchSaleDuration}
                onChange={(e) => setLaunchSaleDuration(Math.max(1, Math.min(30, parseInt(e.target.value) || 7)))}
                className={styles.numberInput}
              />
              <span className={styles.durationLabel}>days</span>
              <div className={styles.quickDurations}>
                {[7, 10, 14].map(d => (
                  <button
                    key={d}
                    type="button"
                    className={`${styles.quickDurationBtn} ${launchSaleDuration === d ? styles.active : ''}`}
                    onClick={() => setLaunchSaleDuration(d)}
                  >
                    {d}d
                  </button>
                ))}
              </div>
            </div>
            {newDate && (
              <p className={styles.dateRange}>
                Launch Sale: {format(normalizeToLocalDate(newDate), 'MMM d')} → {launchEnd}
              </p>
            )}
          </div>

          {/* Steam Seasonal Conflict Warning */}
          {conflicts.length > 0 && (
            <div className={styles.conflictWarning}>
              <div className={styles.conflictHeader}>
                <span className={styles.conflictIcon}>⚠️</span>
                <span className={styles.conflictTitle}>Steam Seasonal Sale Conflict!</span>
              </div>
              <p className={styles.conflictExplain}>
                Your launch sale overlaps with Steam's major seasonal sale(s). 
                New releases often get less visibility during these events.
              </p>
              {conflicts.map((conflict, idx) => (
                <div key={idx} className={styles.conflictItem}>
                  <span className={styles.conflictEvent}>{conflict.eventName}</span>
                  <span className={styles.conflictDates}>
                    {format(conflict.eventStart, 'MMM d')} - {format(conflict.eventEnd, 'MMM d')}
                  </span>
                  <span className={styles.conflictOverlap}>
                    {conflict.overlapDays} day{conflict.overlapDays !== 1 ? 's' : ''} overlap
                  </span>
                </div>
              ))}
              <p className={styles.conflictSuggestion}>
                💡 Consider launching before or after the seasonal sale for better visibility.
              </p>
            </div>
          )}

          {/* No conflicts - show green confirmation */}
          {conflicts.length === 0 && newDate && steamPlatform && (
            <div className={styles.noConflict}>
              <span className={styles.noConflictIcon}>✓</span>
              <span>No conflicts with Steam Seasonal Sales</span>
            </div>
          )}

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
            className={`${styles.saveBtn} ${conflicts.length > 0 ? styles.saveBtnWarning : ''}`}
            onClick={handleSave}
            disabled={!hasChanges}
          >
            {conflicts.length > 0 ? 'Save Anyway' : 'Save Launch Date'}
          </button>
        </div>
      </div>
    </div>
  )
}
