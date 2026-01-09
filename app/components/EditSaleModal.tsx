'use client'

import { useState, useEffect } from 'react'
import { format, addDays, parseISO, differenceInDays } from 'date-fns'
import { Sale, Platform, Product, Game, Client, SaleWithDetails } from '@/lib/types'
import { validateSale } from '@/lib/validation'
import styles from './AddSaleModal.module.css'

interface EditSaleModalProps {
  sale: SaleWithDetails
  products: (Product &amp; { game: Game &amp; { client: Client } })[]
  platforms: Platform[]
  existingSales: SaleWithDetails[]
  onSave: (saleId: string, updates: Partial&lt;Sale&gt;) => Promise&lt;void&gt;
  onDelete: (saleId: string) => Promise&lt;void&gt;
  onDuplicate?: (sale: SaleWithDetails) => void
  onClose: () => void
}

type SaleType = 'custom' | 'seasonal' | 'festival' | 'special'
type SaleStatus = 'planned' | 'submitted' | 'confirmed' | 'live' | 'ended'

export default function EditSaleModal({
  sale,
  products,
  platforms,
  existingSales,
  onSave,
  onDelete,
  onDuplicate,
  onClose
}: EditSaleModalProps) {
  const [productId, setProductId] = useState(sale.product_id)
  const [platformId, setPlatformId] = useState(sale.platform_id)
  const [startDate, setStartDate] = useState(sale.start_date)
  const [duration, setDuration] = useState(
    differenceInDays(parseISO(sale.end_date), parseISO(sale.start_date)) + 1
  )
  const [endDate, setEndDate] = useState(sale.end_date)
  const [discountPercentage, setDiscountPercentage] = useState(sale.discount_percentage || 50)
  const [saleName, setSaleName] = useState(sale.sale_name || '')
  const [saleType, setSaleType] = useState&lt;SaleType&gt;(sale.sale_type || 'custom')
  const [status, setStatus] = useState&lt;SaleStatus&gt;(sale.status || 'planned')
  const [goalType, setGoalType] = useState&lt;'acquisition' | 'visibility' | 'event' | 'revenue' | ''&gt;(
    sale.goal_type || ''
  )
  const [notes, setNotes] = useState(sale.notes || '')
  // New fields matching client's Excel workflow
  const [isCampaign, setIsCampaign] = useState(sale.is_campaign || false)
  const [isSubmitted, setIsSubmitted] = useState(sale.is_submitted || false)
  const [isConfirmed, setIsConfirmed] = useState(sale.is_confirmed || false)
  const [comment, setComment] = useState(sale.comment || '')
  
  const [saving, setSaving] = useState(false)
  const [validationError, setValidationError] = useState&lt;string | null&gt;(null)
  const [durationWarning, setDurationWarning] = useState&lt;string | null&gt;(null)
  
  const selectedPlatform = platforms.find(p => p.id === platformId)
  
  // Calculate cooldown end date
  const cooldownEndDate = endDate &amp;&amp; selectedPlatform
    ? format(addDays(parseISO(endDate), selectedPlatform.cooldown_days), 'yyyy-MM-dd')
    : ''

  // Find previous sale end date for this product/platform
  const prevSaleEndDate = (() => {
    if (!productId || !platformId || !startDate) return sale.prev_sale_end_date || null
    const relevantSales = existingSales.filter(s => 
      s.product_id === productId &amp;&amp; 
      s.platform_id === platformId &amp;&amp;
      s.end_date &lt; startDate &amp;&amp;
      s.id !== sale.id
    ).sort((a, b) => new Date(b.end_date).getTime() - new Date(a.end_date).getTime())
    return relevantSales.length > 0 ? relevantSales[0].end_date : null
  })()

  // Handle start date change - keep duration, update end date
  const handleStartDateChange = (newStartDate: string) => {
    setStartDate(newStartDate)
    if (newStartDate) {
      const newEndDate = format(addDays(parseISO(newStartDate), duration - 1), 'yyyy-MM-dd')
      setEndDate(newEndDate)
    }
  }

  // Handle duration change - update end date
  const handleDurationChange = (newDuration: number) => {
    const clampedDuration = Math.max(1, newDuration)
    setDuration(clampedDuration)
    if (startDate) {
      const newEndDate = format(addDays(parseISO(startDate), clampedDuration - 1), 'yyyy-MM-dd')
      setEndDate(newEndDate)
    }
  }

  // Handle end date change - update duration
  const handleEndDateChange = (newEndDate: string) => {
    setEndDate(newEndDate)
    if (startDate &amp;&amp; newEndDate) {
      const newDuration = differenceInDays(parseISO(newEndDate), parseISO(startDate)) + 1
      setDuration(Math.max(1, newDuration))
    }
  }

  // Check duration warning (soft limit)
  useEffect(() => {
    if (selectedPlatform &amp;&amp; duration > selectedPlatform.max_sale_days) {
      setDurationWarning(`Exceeds platform recommendation of ${selectedPlatform.max_sale_days} days`)
    } else {
      setDurationWarning(null)
    }
  }, [selectedPlatform, duration])
  
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
      platform,
      sale.id // Exclude current sale from validation
    )
    
    setValidationError(validation.valid ? null : validation.message || 'Conflicts with existing sale or cooldown')
  }, [productId, platformId, startDate, endDate, saleType, existingSales, platforms, sale.id])
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (validationError) return
    if (!productId || !platformId || !startDate) return
    
    setSaving(true)
    
    try {
      await onSave(sale.id, {
        product_id: productId,
        platform_id: platformId,
        start_date: startDate,
        end_date: endDate,
        discount_percentage: discountPercentage,
        sale_name: saleName || 'Custom Sale',
        sale_type: saleType,
        status: status,
        goal_type: goalType || undefined,
        notes: notes || undefined,
        is_campaign: isCampaign,
        is_submitted: isSubmitted,
        is_confirmed: isConfirmed,
        comment: comment || undefined,
        prev_sale_end_date: prevSaleEndDate || undefined
      })
      onClose()
    } catch (err) {
      console.error('Error saving sale:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this sale?')) return
    
    try {
      await onDelete(sale.id)
      onClose()
    } catch (err) {
      console.error('Error deleting sale:', err)
    }
  }

  const handleDuplicate = () => {
    if (onDuplicate) {
      onClose()
      onDuplicate(sale)
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
  }, {} as Record&lt;string, typeof products&gt;)
  
  return (
    &lt;div className={styles.overlay} onClick={onClose}&gt;
      &lt;div className={styles.modal} onClick={e => e.stopPropagation()}&gt;
        &lt;div className={styles.header}&gt;
          &lt;h2&gt;Edit Sale&lt;/h2&gt;
          &lt;button className={styles.closeBtn} onClick={onClose}&gt;×&lt;/button&gt;
        &lt;/div&gt;
        
        &lt;form onSubmit={handleSubmit} className={styles.form}&gt;
          {validationError &amp;&amp; (
            &lt;div className={styles.error}&gt;
              &lt;span&gt;⚠️ {validationError}&lt;/span&gt;
            &lt;/div&gt;
          )}
          
          {durationWarning &amp;&amp; (
            &lt;div className={styles.warning}&gt;
              &lt;span&gt;⚠️ {durationWarning}&lt;/span&gt;
            &lt;/div&gt;
          )}
          
          &lt;div className={styles.row}&gt;
            &lt;div className={styles.field}&gt;
              &lt;label&gt;Product *&lt;/label&gt;
              &lt;select 
                value={productId} 
                onChange={e => setProductId(e.target.value)}
                required
              &gt;
                &lt;option value=""&gt;Select a product...&lt;/option&gt;
                {Object.entries(groupedProducts).map(([gameName, prods]) => (
                  &lt;optgroup key={gameName} label={gameName}&gt;
                    {prods.map(product => (
                      &lt;option key={product.id} value={product.id}&gt;
                        {product.name} ({product.product_type})
                      &lt;/option&gt;
                    ))}
                  &lt;/optgroup&gt;
                ))}
              &lt;/select&gt;
            &lt;/div&gt;
            
            &lt;div className={styles.field}&gt;
              &lt;label&gt;Platform *&lt;/label&gt;
              &lt;select 
                value={platformId} 
                onChange={e => setPlatformId(e.target.value)}
                required
              &gt;
                &lt;option value=""&gt;Select a platform...&lt;/option&gt;
                {platforms.map(platform => (
                  &lt;option key={platform.id} value={platform.id}&gt;
                    {platform.name} ({platform.cooldown_days}d cooldown)
                  &lt;/option&gt;
                ))}
              &lt;/select&gt;
            &lt;/div&gt;
          &lt;/div&gt;
          
          &lt;div className={styles.row}&gt;
            &lt;div className={styles.field}&gt;
              &lt;label&gt;Start Date *&lt;/label&gt;
              &lt;input 
                type="date" 
                value={startDate}
                onChange={e => handleStartDateChange(e.target.value)}
                required
              /&gt;
            &lt;/div&gt;
            
            &lt;div className={styles.field}&gt;
              &lt;label&gt;Duration (days)&lt;/label&gt;
              &lt;input 
                type="number" 
                value={duration}
                onChange={e => handleDurationChange(parseInt(e.target.value) || 1)}
                min={1}
              /&gt;
              {selectedPlatform &amp;&amp; (
                &lt;span className={styles.hint}&gt;Recommended: {selectedPlatform.max_sale_days} days max&lt;/span&gt;
              )}
            &lt;/div&gt;
            
            &lt;div className={styles.field}&gt;
              &lt;label&gt;End Date *&lt;/label&gt;
              &lt;input 
                type="date" 
                value={endDate}
                onChange={e => handleEndDateChange(e.target.value)}
                min={startDate}
                required
              /&gt;
            &lt;/div&gt;
          &lt;/div&gt;
          
          &lt;div className={styles.row}&gt;
            &lt;div className={styles.field}&gt;
              &lt;label&gt;Discount % *&lt;/label&gt;
              &lt;input 
                type="number" 
                value={discountPercentage}
                onChange={e => setDiscountPercentage(Math.max(5, Math.min(parseInt(e.target.value) || 5, 95)))}
                min={5}
                max={95}
                required
              /&gt;
              &lt;span className={styles.hint}&gt;5% - 95%&lt;/span&gt;
            &lt;/div&gt;
            
            &lt;div className={styles.field}&gt;
              &lt;label&gt;Sale Name&lt;/label&gt;
              &lt;input 
                type="text" 
                value={saleName}
                onChange={e => setSaleName(e.target.value)}
                placeholder="Custom Sale"
              /&gt;
            &lt;/div&gt;
            
            &lt;div className={styles.field}&gt;
              &lt;label&gt;Sale Type&lt;/label&gt;
              &lt;select 
                value={saleType} 
                onChange={e => setSaleType(e.target.value as SaleType)}
              &gt;
                &lt;option value="custom"&gt;Custom / Regular&lt;/option&gt;
                &lt;option value="seasonal"&gt;Seasonal (Steam)&lt;/option&gt;
                &lt;option value="festival"&gt;Festival&lt;/option&gt;
                &lt;option value="special"&gt;Special Event&lt;/option&gt;
              &lt;/select&gt;
              {(saleType === 'seasonal' || saleType === 'special') &amp;&amp; selectedPlatform?.special_sales_no_cooldown &amp;&amp; (
                &lt;span className={styles.hint}&gt;✓ No cooldown for this sale type&lt;/span&gt;
              )}
            &lt;/div&gt;
          &lt;/div&gt;
          
          &lt;div className={styles.row}&gt;
            &lt;div className={styles.field}&gt;
              &lt;label&gt;Status&lt;/label&gt;
              &lt;select 
                value={status} 
                onChange={e => setStatus(e.target.value as SaleStatus)}
              &gt;
                &lt;option value="planned"&gt;Planned&lt;/option&gt;
                &lt;option value="submitted"&gt;Submitted&lt;/option&gt;
                &lt;option value="confirmed"&gt;Confirmed&lt;/option&gt;
                &lt;option value="live"&gt;Live&lt;/option&gt;
                &lt;option value="ended"&gt;Ended&lt;/option&gt;
              &lt;/select&gt;
            &lt;/div&gt;

            &lt;div className={styles.field}&gt;
              &lt;label&gt;Goal&lt;/label&gt;
              &lt;select 
                value={goalType} 
                onChange={e => setGoalType(e.target.value as typeof goalType)}
              &gt;
                &lt;option value=""&gt;Select goal...&lt;/option&gt;
                &lt;option value="acquisition"&gt;Acquisition&lt;/option&gt;
                &lt;option value="visibility"&gt;Visibility&lt;/option&gt;
                &lt;option value="event"&gt;Event&lt;/option&gt;
                &lt;option value="revenue"&gt;Revenue&lt;/option&gt;
              &lt;/select&gt;
            &lt;/div&gt;
            
            &lt;div className={styles.field}&gt;
              &lt;label&gt;Cooldown Until&lt;/label&gt;
              &lt;input 
                type="text" 
                value={cooldownEndDate ? format(parseISO(cooldownEndDate), 'dd/MM/yyyy') : '-'}
                disabled
                className={styles.disabled}
              /&gt;
            &lt;/div&gt;
          &lt;/div&gt;

          &lt;div className={styles.row}&gt;
            &lt;div className={styles.field}&gt;
              &lt;label&gt;Prev. Sale Ends&lt;/label&gt;
              &lt;input 
                type="text" 
                value={prevSaleEndDate ? format(parseISO(prevSaleEndDate), 'dd/MM/yyyy') : '-'}
                disabled
                className={styles.disabled}
              /&gt;
            &lt;/div&gt;
          &lt;/div&gt;

          {/* Checkboxes row */}
          &lt;div className={styles.checkboxRow}&gt;
            &lt;label className={styles.checkboxLabel}&gt;
              &lt;input 
                type="checkbox" 
                checked={isCampaign}
                onChange={e => setIsCampaign(e.target.checked)}
              /&gt;
              &lt;span&gt;Campaign?&lt;/span&gt;
            &lt;/label&gt;
            
            &lt;label className={styles.checkboxLabel}&gt;
              &lt;input 
                type="checkbox" 
                checked={isSubmitted}
                onChange={e => setIsSubmitted(e.target.checked)}
              /&gt;
              &lt;span&gt;Submitted?&lt;/span&gt;
            &lt;/label&gt;
            
            &lt;label className={styles.checkboxLabel}&gt;
              &lt;input 
                type="checkbox" 
                checked={isConfirmed}
                onChange={e => setIsConfirmed(e.target.checked)}
              /&gt;
              &lt;span&gt;Confirmed?&lt;/span&gt;
            &lt;/label&gt;
          &lt;/div&gt;
          
          &lt;div className={styles.field + ' ' + styles.fullWidth}&gt;
            &lt;label&gt;Comment&lt;/label&gt;
            &lt;textarea 
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="Any comments about this sale..."
              rows={2}
            /&gt;
          &lt;/div&gt;

          &lt;div className={styles.field + ' ' + styles.fullWidth}&gt;
            &lt;label&gt;Internal Notes&lt;/label&gt;
            &lt;textarea 
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Internal notes (not exported)..."
              rows={2}
            /&gt;
          &lt;/div&gt;
          
          &lt;div className={styles.actions}&gt;
            &lt;button 
              type="button" 
              className={styles.deleteBtn} 
              onClick={handleDelete}
            &gt;
              Delete
            &lt;/button&gt;
            {onDuplicate &amp;&amp; (
              &lt;button 
                type="button" 
                className={styles.duplicateBtn} 
                onClick={handleDuplicate}
              &gt;
                Duplicate
              &lt;/button&gt;
            )}
            &lt;button type="button" className={styles.cancelBtn} onClick={onClose}&gt;
              Cancel
            &lt;/button&gt;
            &lt;button 
              type="submit" 
              className={styles.saveBtn}
              disabled={saving || !!validationError || !productId || !platformId}
            &gt;
              {saving ? 'Saving...' : 'Save Changes'}
            &lt;/button&gt;
          &lt;/div&gt;
        &lt;/form&gt;
      &lt;/div&gt;
    &lt;/div&gt;
  )
}
