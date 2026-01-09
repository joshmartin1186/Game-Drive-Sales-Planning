'use client'

import { useState, useMemo } from 'react'
import { format, parseISO, addDays } from 'date-fns'
import { SaleWithDetails, Platform, Game } from '@/lib/types'
import styles from './BulkEditSalesModal.module.css'

interface BulkEditSalesModalProps {
  isOpen: boolean
  onClose: () => void
  selectedSales: SaleWithDetails[]
  platforms: Platform[]
  games: (Game & { client: { name: string } })[]
  onBulkUpdate: (saleIds: string[], updates: Partial<{
    discount_percentage: number | null
    platform_id: string
    sale_name: string
    status: string
    dateShiftDays: number
  }>) => Promise<void>
  onBulkDelete: (saleIds: string[]) => Promise<void>
}

type EditMode = 'discount' | 'platform' | 'saleName' | 'dateShift' | 'status' | 'delete'

export default function BulkEditSalesModal({
  isOpen,
  onClose,
  selectedSales,
  platforms,
  games,
  onBulkUpdate,
  onBulkDelete
}: BulkEditSalesModalProps) {
  const [editMode, setEditMode] = useState<EditMode | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Edit values
  const [discountValue, setDiscountValue] = useState<number>(50)
  const [platformValue, setPlatformValue] = useState<string>('')
  const [saleNameValue, setSaleNameValue] = useState<string>('')
  const [dateShiftDays, setDateShiftDays] = useState<number>(7)
  const [statusValue, setStatusValue] = useState<string>('planned')
  
  // Group sales by game for display
  const salesByGame = useMemo(() => {
    const grouped: Record<string, { game: string; client: string; sales: SaleWithDetails[] }> = {}
    
    selectedSales.forEach(sale => {
      const gameId = sale.product?.game_id || 'unknown'
      const gameName = sale.product?.game?.name || 'Unknown Game'
      const clientName = sale.product?.game?.client?.name || 'Unknown Client'
      
      if (!grouped[gameId]) {
        grouped[gameId] = { game: gameName, client: clientName, sales: [] }
      }
      grouped[gameId].sales.push(sale)
    })
    
    return Object.values(grouped)
  }, [selectedSales])
  
  // Get unique platforms in selection
  const uniquePlatforms = useMemo(() => {
    const platformIds = new Set(selectedSales.map(s => s.platform_id))
    return platforms.filter(p => platformIds.has(p.id))
  }, [selectedSales, platforms])
  
  // Date range of selection
  const dateRange = useMemo(() => {
    if (selectedSales.length === 0) return null
    const dates = selectedSales.flatMap(s => [parseISO(s.start_date), parseISO(s.end_date)])
    const minDate = new Date(Math.min(...dates.map(d => d.getTime())))
    const maxDate = new Date(Math.max(...dates.map(d => d.getTime())))
    return { min: minDate, max: maxDate }
  }, [selectedSales])

  const handleApply = async () => {
    if (!editMode) return
    
    setLoading(true)
    setError(null)
    
    try {
      const saleIds = selectedSales.map(s => s.id)
      
      if (editMode === 'delete') {
        await onBulkDelete(saleIds)
      } else {
        const updates: Partial<{
          discount_percentage: number | null
          platform_id: string
          sale_name: string
          status: string
          dateShiftDays: number
        }> = {}
        
        switch (editMode) {
          case 'discount':
            updates.discount_percentage = discountValue
            break
          case 'platform':
            if (!platformValue) {
              setError('Please select a platform')
              setLoading(false)
              return
            }
            updates.platform_id = platformValue
            break
          case 'saleName':
            updates.sale_name = saleNameValue.trim() || null
            break
          case 'dateShift':
            updates.dateShiftDays = dateShiftDays
            break
          case 'status':
            updates.status = statusValue
            break
        }
        
        await onBulkUpdate(saleIds, updates)
      }
      
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to update sales')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>Bulk Edit Sales</h2>
          <button className={styles.closeBtn} onClick={onClose}>×</button>
        </div>
        
        {error && (
          <div className={styles.error}>
            {error}
            <button onClick={() => setError(null)}>×</button>
          </div>
        )}
        
        {/* Selection Summary */}
        <div className={styles.summary}>
          <div className={styles.summaryStats}>
            <div className={styles.stat}>
              <span className={styles.statValue}>{selectedSales.length}</span>
              <span className={styles.statLabel}>Sales Selected</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statValue}>{salesByGame.length}</span>
              <span className={styles.statLabel}>Games</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statValue}>{uniquePlatforms.length}</span>
              <span className={styles.statLabel}>Platforms</span>
            </div>
          </div>
          
          {dateRange && (
            <div className={styles.dateRange}>
              {format(dateRange.min, 'MMM d, yyyy')} — {format(dateRange.max, 'MMM d, yyyy')}
            </div>
          )}
        </div>
        
        {/* Games breakdown */}
        <div className={styles.gamesBreakdown}>
          {salesByGame.map((group, idx) => (
            <div key={idx} className={styles.gameGroup}>
              <span className={styles.gameName}>{group.game}</span>
              <span className={styles.clientName}>{group.client}</span>
              <span className={styles.saleCount}>{group.sales.length} sales</span>
            </div>
          ))}
        </div>
        
        {/* Edit Mode Selection */}
        <div className={styles.editModes}>
          <h3>What would you like to change?</h3>
          
          <div className={styles.modeGrid}>
            <button 
              className={`${styles.modeBtn} ${editMode === 'discount' ? styles.active : ''}`}
              onClick={() => setEditMode('discount')}
            >
              <span className={styles.modeIcon}>💰</span>
              <span className={styles.modeLabel}>Discount %</span>
            </button>
            
            <button 
              className={`${styles.modeBtn} ${editMode === 'platform' ? styles.active : ''}`}
              onClick={() => setEditMode('platform')}
            >
              <span className={styles.modeIcon}>🎮</span>
              <span className={styles.modeLabel}>Platform</span>
            </button>
            
            <button 
              className={`${styles.modeBtn} ${editMode === 'dateShift' ? styles.active : ''}`}
              onClick={() => setEditMode('dateShift')}
            >
              <span className={styles.modeIcon}>📅</span>
              <span className={styles.modeLabel}>Shift Dates</span>
            </button>
            
            <button 
              className={`${styles.modeBtn} ${editMode === 'saleName' ? styles.active : ''}`}
              onClick={() => setEditMode('saleName')}
            >
              <span className={styles.modeIcon}>🏷️</span>
              <span className={styles.modeLabel}>Sale Name</span>
            </button>
            
            <button 
              className={`${styles.modeBtn} ${editMode === 'status' ? styles.active : ''}`}
              onClick={() => setEditMode('status')}
            >
              <span className={styles.modeIcon}>📊</span>
              <span className={styles.modeLabel}>Status</span>
            </button>
            
            <button 
              className={`${styles.modeBtn} ${styles.deleteMode} ${editMode === 'delete' ? styles.active : ''}`}
              onClick={() => setEditMode('delete')}
            >
              <span className={styles.modeIcon}>🗑️</span>
              <span className={styles.modeLabel}>Delete All</span>
            </button>
          </div>
        </div>
        
        {/* Edit Form based on mode */}
        {editMode && editMode !== 'delete' && (
          <div className={styles.editForm}>
            {editMode === 'discount' && (
              <div className={styles.formField}>
                <label>New Discount Percentage</label>
                <div className={styles.discountInput}>
                  <input
                    type="range"
                    min="0"
                    max="90"
                    step="5"
                    value={discountValue}
                    onChange={e => setDiscountValue(parseInt(e.target.value))}
                  />
                  <span className={styles.discountValue}>{discountValue}%</span>
                </div>
                <div className={styles.quickValues}>
                  {[10, 25, 33, 50, 66, 75].map(v => (
                    <button 
                      key={v} 
                      className={discountValue === v ? styles.active : ''}
                      onClick={() => setDiscountValue(v)}
                    >
                      {v}%
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            {editMode === 'platform' && (
              <div className={styles.formField}>
                <label>New Platform</label>
                <select 
                  value={platformValue} 
                  onChange={e => setPlatformValue(e.target.value)}
                >
                  <option value="">Select platform...</option>
                  {platforms.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <p className={styles.hint}>
                  ⚠️ Changing platform may affect cooldown calculations
                </p>
              </div>
            )}
            
            {editMode === 'dateShift' && (
              <div className={styles.formField}>
                <label>Shift all sales by</label>
                <div className={styles.dateShiftInput}>
                  <button 
                    className={styles.shiftBtn}
                    onClick={() => setDateShiftDays(d => d - 7)}
                  >
                    -7
                  </button>
                  <button 
                    className={styles.shiftBtn}
                    onClick={() => setDateShiftDays(d => d - 1)}
                  >
                    -1
                  </button>
                  <input
                    type="number"
                    value={dateShiftDays}
                    onChange={e => setDateShiftDays(parseInt(e.target.value) || 0)}
                    className={styles.shiftValue}
                  />
                  <span className={styles.shiftLabel}>days</span>
                  <button 
                    className={styles.shiftBtn}
                    onClick={() => setDateShiftDays(d => d + 1)}
                  >
                    +1
                  </button>
                  <button 
                    className={styles.shiftBtn}
                    onClick={() => setDateShiftDays(d => d + 7)}
                  >
                    +7
                  </button>
                </div>
                {dateRange && dateShiftDays !== 0 && (
                  <p className={styles.preview}>
                    New range: {format(addDays(dateRange.min, dateShiftDays), 'MMM d')} — {format(addDays(dateRange.max, dateShiftDays), 'MMM d, yyyy')}
                  </p>
                )}
              </div>
            )}
            
            {editMode === 'saleName' && (
              <div className={styles.formField}>
                <label>New Sale Name</label>
                <input
                  type="text"
                  value={saleNameValue}
                  onChange={e => setSaleNameValue(e.target.value)}
                  placeholder="e.g., Summer Sale 2025"
                />
                <p className={styles.hint}>
                  Leave empty to clear sale names
                </p>
              </div>
            )}
            
            {editMode === 'status' && (
              <div className={styles.formField}>
                <label>New Status</label>
                <select 
                  value={statusValue} 
                  onChange={e => setStatusValue(e.target.value)}
                >
                  <option value="planned">Planned</option>
                  <option value="submitted">Submitted</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="live">Live</option>
                  <option value="ended">Ended</option>
                </select>
              </div>
            )}
          </div>
        )}
        
        {/* Delete Confirmation */}
        {editMode === 'delete' && (
          <div className={styles.deleteConfirm}>
            <div className={styles.deleteWarning}>
              <span className={styles.warningIcon}>⚠️</span>
              <div>
                <h4>Delete {selectedSales.length} sales?</h4>
                <p>This action cannot be undone.</p>
              </div>
            </div>
          </div>
        )}
        
        {/* Actions */}
        <div className={styles.actions}>
          <button className={styles.cancelBtn} onClick={onClose}>
            Cancel
          </button>
          <button 
            className={`${styles.applyBtn} ${editMode === 'delete' ? styles.deleteBtn : ''}`}
            onClick={handleApply}
            disabled={!editMode || loading}
          >
            {loading ? 'Applying...' : editMode === 'delete' ? `Delete ${selectedSales.length} Sales` : 'Apply Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
