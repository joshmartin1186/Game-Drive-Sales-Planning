'use client'

import { useState, useEffect } from 'react'
import { format, addDays, parseISO, differenceInDays } from 'date-fns'
import { Sale, Platform, Product, Game, Client, SaleWithDetails } from '@/lib/types'
import { validateSale } from '@/lib/validation'
import styles from './AddSaleModal.module.css'

interface AddSaleModalProps {
  products: (Product & { game: Game & { client: Client } })[]
  platforms: Platform[]
  existingSales: SaleWithDetails[]
  onSave: (sale: Omit<Sale, 'id' | 'created_at'>) => Promise<void>
  onClose: () => void
  initialDate?: Date
  initialProductId?: string
  initialPlatformId?: string
  initialEndDate?: Date
}

// Database constraint: 'custom' | 'seasonal' | 'festival' | 'special'
type SaleType = 'custom' | 'seasonal' | 'festival' | 'special'

export default function AddSaleModal({
  products,
  platforms,
  existingSales,
  onSave,
  onClose,
  initialDate,
  initialProductId,
  initialPlatformId,
  initialEndDate
}: AddSaleModalProps) {
  // Calculate initial duration from start and end dates
  const initialDuration = initialDate && initialEndDate 
    ? differenceInDays(initialEndDate, initialDate) + 1 
    : 7

  const [productId, setProductId] = useState(initialProductId || '')
  const [platformId, setPlatformId] = useState(initialPlatformId || '')
  const [startDate, setStartDate] = useState(
    initialDate ? format(initialDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd')
  )
  const [duration, setDuration] = useState(initialDuration)
  const [discountPercentage, setDiscountPercentage] = useState(50)
  const [saleName, setSaleName] = useState('')
  const [saleType, setSaleType] = useState<SaleType>('custom')
  const [goalType, setGoalType] = useState<'acquisition' | 'visibility' | 'event' | 'revenue' | ''>('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)
  
  const selectedPlatform = platforms.find(p => p.id === platformId)
  const selectedProduct = products.find(p => p.id === productId)
  
  // Calculate end date from start date + duration
  const endDate = startDate 
    ? format(addDays(parseISO(startDate), duration - 1), 'yyyy-MM-dd')
    : ''
  
  // Calculate cooldown end date
  const cooldownEndDate = endDate && selectedPlatform
    ? format(addDays(parseISO(endDate), selectedPlatform.cooldown_days), 'yyyy-MM-dd')
    : ''
  
  // Validate on change
  useEffect(() => {
    if (!productId || !platformId || !startDate || !endDate) {
      setValidationError(null)
      return
    }
    
    const platform = platforms.find(p => p.id === platformId)
    if (!platform) return
    
    const validation = validateSale(
      {
        product_id: productId,
        platform_id: platformId,
        start_date: startDate,
        end_date: endDate,
        sale_type: saleType
      },
      existingSales,
      platform
    )
    
    setValidationError(validation.valid ? null : validation.message || 'Conflicts with existing sale or cooldown')
  }, [productId, platformId, startDate, endDate, saleType, existingSales, platforms])
  
  // Limit duration based on platform
  useEffect(() => {
    if (selectedPlatform && duration > selectedPlatform.max_sale_days) {
      setDuration(selectedPlatform.max_sale_days)
    }
  }, [selectedPlatform, duration])
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (validationError) return
    if (!productId || !platformId || !startDate) return
    
    setSaving(true)
    
    try {
      await onSave({
        product_id: productId,
        platform_id: platformId,
        start_date: startDate,
        end_date: endDate,
        discount_percentage: discountPercentage,
        sale_name: saleName || 'Custom Sale',
        sale_type: saleType,
        status: 'planned',
        goal_type: goalType || undefined,
        notes: notes || undefined
      })
    } catch (err) {
      console.error('Error saving sale:', err)
    } finally {
      setSaving(false)
    }
  }
  
  // Group products by game for easier selection
  const groupedProducts = products.reduce((acc, product) => {
    const gameName = product.game?.name || 'Unknown Game'
    if (!acc[gameName]) {
      acc[gameName] = []
    }
    acc[gameName].push(product)
    return acc
  }, {} as Record<string, typeof products>)
  
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>Add New Sale</h2>
          <button className={styles.closeBtn} onClick={onClose}>×</button>
        </div>
        
        {/* Pre-filled indicator */}
        {(initialProductId || initialPlatformId) && (
          <div className={styles.prefillNotice}>
            {selectedProduct && selectedPlatform ? (
              <>Creating sale for <strong>{selectedProduct.name}</strong> on <strong>{selectedPlatform.name}</strong></>
            ) : selectedProduct ? (
              <>Creating sale for <strong>{selectedProduct.name}</strong></>
            ) : (
              <>Creating sale from timeline selection</>
            )}
          </div>
        )}
        
        <form onSubmit={handleSubmit} className={styles.form}>
          {validationError && (
            <div className={styles.error}>
              <span>⚠️ {validationError}</span>
            </div>
          )}
          
          <div className={styles.row}>
            <div className={styles.field}>
              <label>Product *</label>
              <select 
                value={productId} 
                onChange={e => setProductId(e.target.value)}
                required
              >
                <option value="">Select a product...</option>
                {Object.entries(groupedProducts).map(([gameName, prods]) => (
                  <optgroup key={gameName} label={gameName}>
                    {prods.map(product => (
                      <option key={product.id} value={product.id}>
                        {product.name} ({product.product_type})
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            
            <div className={styles.field}>
              <label>Platform *</label>
              <select 
                value={platformId} 
                onChange={e => setPlatformId(e.target.value)}
                required
              >
                <option value="">Select a platform...</option>
                {platforms.map(platform => (
                  <option key={platform.id} value={platform.id}>
                    {platform.name} ({platform.cooldown_days}d cooldown)
                  </option>
                ))}
              </select>
            </div>
          </div>
          
          <div className={styles.row}>
            <div className={styles.field}>
              <label>Start Date *</label>
              <input 
                type="date" 
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                required
              />
            </div>
            
            <div className={styles.field}>
              <label>Duration (days) *</label>
              <input 
                type="number" 
                value={duration}
                onChange={e => setDuration(Math.max(1, Math.min(parseInt(e.target.value) || 1, selectedPlatform?.max_sale_days || 30)))}
                min={1}
                max={selectedPlatform?.max_sale_days || 30}
                required
              />
              {selectedPlatform && (
                <span className={styles.hint}>Max: {selectedPlatform.max_sale_days} days</span>
              )}
            </div>
            
            <div className={styles.field}>
              <label>End Date</label>
              <input 
                type="date" 
                value={endDate}
                disabled
                className={styles.disabled}
              />
            </div>
          </div>
          
          <div className={styles.row}>
            <div className={styles.field}>
              <label>Discount % *</label>
              <input 
                type="number" 
                value={discountPercentage}
                onChange={e => setDiscountPercentage(Math.max(5, Math.min(parseInt(e.target.value) || 5, 95)))}
                min={5}
                max={95}
                required
              />
              <span className={styles.hint}>5% - 95%</span>
            </div>
            
            <div className={styles.field}>
              <label>Sale Name</label>
              <input 
                type="text" 
                value={saleName}
                onChange={e => setSaleName(e.target.value)}
                placeholder="e.g., Winter Sale, Daily Deal"
              />
            </div>
            
            <div className={styles.field}>
              <label>Sale Type</label>
              <select 
                value={saleType} 
                onChange={e => setSaleType(e.target.value as SaleType)}
              >
                <option value="custom">Custom / Regular</option>
                <option value="seasonal">Seasonal (Steam)</option>
                <option value="festival">Festival</option>
                <option value="special">Special Event</option>
              </select>
              {(saleType === 'seasonal' || saleType === 'special') && selectedPlatform?.special_sales_no_cooldown && (
                <span className={styles.hint}>✓ No cooldown for this sale type</span>
              )}
            </div>
          </div>
          
          <div className={styles.row}>
            <div className={styles.field}>
              <label>Goal</label>
              <select 
                value={goalType} 
                onChange={e => setGoalType(e.target.value as any)}
              >
                <option value="">Select goal...</option>
                <option value="acquisition">Acquisition</option>
                <option value="visibility">Visibility</option>
                <option value="event">Event</option>
                <option value="revenue">Revenue</option>
              </select>
            </div>
            
            <div className={styles.field}>
              <label>Cooldown Until</label>
              <input 
                type="text" 
                value={cooldownEndDate ? format(parseISO(cooldownEndDate), 'MM/dd/yyyy') : '-'}
                disabled
                className={styles.disabled}
              />
            </div>
          </div>
          
          <div className={styles.field + ' ' + styles.fullWidth}>
            <label>Notes</label>
            <textarea 
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Any additional notes..."
              rows={2}
            />
          </div>
          
          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>
              Cancel
            </button>
            <button 
              type="submit" 
              className={styles.saveBtn}
              disabled={saving || !!validationError || !productId || !platformId}
            >
              {saving ? 'Saving...' : 'Add Sale'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
