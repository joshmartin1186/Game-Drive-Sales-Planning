'use client'

import { useState, useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { CalendarVariation, GeneratedSale } from '@/lib/sale-calendar-generator'
import styles from './SaleCalendarPreviewModal.module.css'

interface SaleCalendarPreviewModalProps {
  isOpen: boolean
  onClose: () => void
  productName: string
  variations: CalendarVariation[]
  onApply: (sales: GeneratedSale[]) => Promise<void>
  isApplying: boolean
}

export default function SaleCalendarPreviewModal({
  isOpen,
  onClose,
  productName,
  variations,
  onApply,
  isApplying
}: SaleCalendarPreviewModalProps) {
  const [selectedVariation, setSelectedVariation] = useState(0)
  const [selectedPlatform, setSelectedPlatform] = useState<string | 'all'>('all')
  
  const currentVariation = variations[selectedVariation]
  
  // Get unique platforms from the sales
  const platforms = useMemo(() => {
    if (!currentVariation) return []
    const platformMap = new Map<string, { id: string; name: string; color: string }>()
    for (const sale of currentVariation.sales) {
      if (!platformMap.has(sale.platform_id)) {
        platformMap.set(sale.platform_id, {
          id: sale.platform_id,
          name: sale.platform_name,
          color: sale.platform_color
        })
      }
    }
    return Array.from(platformMap.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [currentVariation])
  
  // Filter sales by selected platform
  const filteredSales = useMemo(() => {
    if (!currentVariation) return []
    if (selectedPlatform === 'all') return currentVariation.sales
    return currentVariation.sales.filter(s => s.platform_id === selectedPlatform)
  }, [currentVariation, selectedPlatform])
  
  // Group sales by month for display
  const salesByMonth = useMemo(() => {
    const groups: { [month: string]: GeneratedSale[] } = {}
    for (const sale of filteredSales) {
      const monthKey = format(parseISO(sale.start_date), 'MMMM yyyy')
      if (!groups[monthKey]) {
        groups[monthKey] = []
      }
      groups[monthKey].push(sale)
    }
    return groups
  }, [filteredSales])
  
  if (!isOpen) return null
  
  const handleApply = async () => {
    if (currentVariation) {
      await onApply(currentVariation.sales)
    }
  }
  
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>🗓️ Auto-Generate Sale Calendar</h2>
          <p className={styles.subtitle}>for <strong>{productName}</strong></p>
          <button className={styles.closeButton} onClick={onClose}>×</button>
        </div>
        
        {/* Variation Tabs */}
        <div className={styles.variationTabs}>
          {variations.map((variation, idx) => (
            <button
              key={idx}
              className={`${styles.variationTab} ${selectedVariation === idx ? styles.active : ''}`}
              onClick={() => setSelectedVariation(idx)}
            >
              <span className={styles.tabName}>{variation.name}</span>
              <span className={styles.tabStats}>{variation.stats.totalSales} sales</span>
            </button>
          ))}
        </div>
        
        {currentVariation && (
          <>
            {/* Variation Description & Stats */}
            <div className={styles.variationInfo}>
              <p className={styles.description}>{currentVariation.description}</p>
              <div className={styles.statsGrid}>
                <div className={styles.stat}>
                  <span className={styles.statValue}>{currentVariation.stats.totalSales}</span>
                  <span className={styles.statLabel}>Total Sales</span>
                </div>
                <div className={styles.stat}>
                  <span className={styles.statValue}>{currentVariation.stats.totalDaysOnSale}</span>
                  <span className={styles.statLabel}>Days on Sale</span>
                </div>
                <div className={styles.stat}>
                  <span className={styles.statValue}>{currentVariation.stats.percentageOnSale}%</span>
                  <span className={styles.statLabel}>Year Coverage</span>
                </div>
                <div className={styles.stat}>
                  <span className={styles.statValue}>{currentVariation.stats.eventSales}</span>
                  <span className={styles.statLabel}>Event Sales</span>
                </div>
                <div className={styles.stat}>
                  <span className={styles.statValue}>{currentVariation.stats.customSales}</span>
                  <span className={styles.statLabel}>Custom Sales</span>
                </div>
              </div>
            </div>
            
            {/* Platform Filter */}
            <div className={styles.filterBar}>
              <label>Filter by Platform:</label>
              <select 
                value={selectedPlatform} 
                onChange={e => setSelectedPlatform(e.target.value)}
                className={styles.platformSelect}
              >
                <option value="all">All Platforms ({currentVariation.sales.length})</option>
                {platforms.map(platform => {
                  const count = currentVariation.sales.filter(s => s.platform_id === platform.id).length
                  return (
                    <option key={platform.id} value={platform.id}>
                      {platform.name} ({count})
                    </option>
                  )
                })}
              </select>
            </div>
            
            {/* Sales List */}
            <div className={styles.salesList}>
              {Object.entries(salesByMonth).map(([month, sales]) => (
                <div key={month} className={styles.monthGroup}>
                  <h3 className={styles.monthHeader}>{month}</h3>
                  <div className={styles.salesGrid}>
                    {sales.map(sale => (
                      <div 
                        key={sale.id} 
                        className={`${styles.saleCard} ${sale.is_event ? styles.eventSale : ''}`}
                        style={{ borderLeftColor: sale.platform_color }}
                      >
                        <div className={styles.saleHeader}>
                          <span 
                            className={styles.platformBadge}
                            style={{ backgroundColor: sale.platform_color }}
                          >
                            {sale.platform_name}
                          </span>
                          {sale.is_event && (
                            <span className={styles.eventBadge}>★ Event</span>
                          )}
                        </div>
                        <div className={styles.saleName}>{sale.sale_name}</div>
                        <div className={styles.saleDates}>
                          {format(parseISO(sale.start_date), 'MMM d')} - {format(parseISO(sale.end_date), 'MMM d, yyyy')}
                        </div>
                        <div className={styles.saleDiscount}>-{sale.discount_percentage}%</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              
              {filteredSales.length === 0 && (
                <div className={styles.emptySales}>
                  <p>No sales generated for this selection.</p>
                </div>
              )}
            </div>
          </>
        )}
        
        {/* Footer Actions */}
        <div className={styles.footer}>
          <button className={styles.cancelButton} onClick={onClose} disabled={isApplying}>
            Cancel
          </button>
          <button 
            className={styles.applyButton} 
            onClick={handleApply}
            disabled={isApplying || !currentVariation || currentVariation.sales.length === 0}
          >
            {isApplying ? 'Creating Sales...' : `Apply ${currentVariation?.name || ''} Calendar`}
          </button>
        </div>
      </div>
    </div>
  )
}
