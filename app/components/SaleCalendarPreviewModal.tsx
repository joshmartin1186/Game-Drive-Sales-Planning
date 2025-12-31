'use client'

import { useState, useMemo } from 'react'
import { format, parseISO, addMonths } from 'date-fns'
import { CalendarVariation, GeneratedSale } from '@/lib/sale-calendar-generator'
import styles from './SaleCalendarPreviewModal.module.css'

interface SaleCalendarPreviewModalProps {
  isOpen: boolean
  onClose: () => void
  productName: string
  launchDate: string
  variations: CalendarVariation[]
  onApply: (sales: GeneratedSale[]) => Promise<void>
  isApplying: boolean
}

export default function SaleCalendarPreviewModal({
  isOpen,
  onClose,
  productName,
  launchDate,
  variations,
  onApply,
  isApplying
}: SaleCalendarPreviewModalProps) {
  const [selectedVariation, setSelectedVariation] = useState(1) // Default to "Balanced" (middle option)
  const [selectedPlatform, setSelectedPlatform] = useState<string | 'all'>('all')
  
  const currentVariation = variations[selectedVariation]
  
  // Calculate period end (12 months from launch)
  const periodEnd = useMemo(() => {
    return format(addMonths(parseISO(launchDate), 12), 'MMM d, yyyy')
  }, [launchDate])
  
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

  // Icons for each variation
  const variationIcons = ['🚀', '⚖️', '🎯']
  const variationColors = ['#ef4444', '#3b82f6', '#22c55e']
  
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>🗓️ Auto-Generate Sale Calendar</h2>
          <p className={styles.subtitle}>for <strong>{productName}</strong></p>
          <div className={styles.launchInfo}>
            <span className={styles.launchBadge}>🚀 Launch: {format(parseISO(launchDate), 'MMM d, yyyy')}</span>
            <span className={styles.periodBadge}>📅 Planning through {periodEnd}</span>
          </div>
          <button className={styles.closeButton} onClick={onClose}>×</button>
        </div>
        
        {/* Big Variation Selector */}
        <div className={styles.variationSelector}>
          <h3 className={styles.selectorTitle}>Choose Your Strategy</h3>
          <div className={styles.variationCards}>
            {variations.map((variation, idx) => (
              <button
                key={idx}
                className={`${styles.variationCard} ${selectedVariation === idx ? styles.selectedCard : ''}`}
                onClick={() => setSelectedVariation(idx)}
                style={{ 
                  '--card-color': variationColors[idx],
                  borderColor: selectedVariation === idx ? variationColors[idx] : 'transparent'
                } as React.CSSProperties}
              >
                <span className={styles.cardIcon}>{variationIcons[idx]}</span>
                <span className={styles.cardName}>{variation.name}</span>
                <span className={styles.cardDescription}>{variation.description}</span>
                <div className={styles.cardStats}>
                  <span className={styles.cardStatMain}>{variation.stats.totalSales} sales</span>
                  <span className={styles.cardStatSub}>{variation.stats.percentageOnSale}% coverage</span>
                </div>
                {selectedVariation === idx && (
                  <span className={styles.selectedBadge}>✓ Selected</span>
                )}
              </button>
            ))}
          </div>
        </div>
        
        {currentVariation && (
          <>
            {/* Quick Stats Bar */}
            <div className={styles.quickStats}>
              <div className={styles.quickStat}>
                <span className={styles.quickStatValue}>{currentVariation.stats.totalSales}</span>
                <span className={styles.quickStatLabel}>Total</span>
              </div>
              <div className={styles.quickStatDivider} />
              <div className={styles.quickStat}>
                <span className={styles.quickStatValue}>{currentVariation.stats.totalDaysOnSale}</span>
                <span className={styles.quickStatLabel}>Days</span>
              </div>
              <div className={styles.quickStatDivider} />
              <div className={styles.quickStat}>
                <span className={styles.quickStatValue}>{currentVariation.stats.eventSales}</span>
                <span className={styles.quickStatLabel}>Events</span>
              </div>
              <div className={styles.quickStatDivider} />
              <div className={styles.quickStat}>
                <span className={styles.quickStatValue}>{currentVariation.stats.customSales}</span>
                <span className={styles.quickStatLabel}>Custom</span>
              </div>
              <div className={styles.quickStatDivider} />
              <div className={styles.quickStat}>
                <span className={styles.quickStatValue}>{platforms.length}</span>
                <span className={styles.quickStatLabel}>Platforms</span>
              </div>
            </div>
            
            {/* Platform Filter */}
            <div className={styles.filterBar}>
              <label>Preview by Platform:</label>
              <div className={styles.platformTabs}>
                <button
                  className={`${styles.platformTab} ${selectedPlatform === 'all' ? styles.activePlatformTab : ''}`}
                  onClick={() => setSelectedPlatform('all')}
                >
                  All ({currentVariation.sales.length})
                </button>
                {platforms.map(platform => {
                  const count = currentVariation.sales.filter(s => s.platform_id === platform.id).length
                  return (
                    <button
                      key={platform.id}
                      className={`${styles.platformTab} ${selectedPlatform === platform.id ? styles.activePlatformTab : ''}`}
                      onClick={() => setSelectedPlatform(platform.id)}
                      style={{ 
                        '--platform-color': platform.color,
                        backgroundColor: selectedPlatform === platform.id ? platform.color : undefined 
                      } as React.CSSProperties}
                    >
                      {platform.name} ({count})
                    </button>
                  )
                })}
              </div>
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
            {isApplying ? 'Creating Sales...' : `Apply ${currentVariation?.stats.totalSales || 0} Sales`}
          </button>
        </div>
      </div>
    </div>
  )
}
