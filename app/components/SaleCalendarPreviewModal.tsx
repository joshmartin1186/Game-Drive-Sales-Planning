'use client'

import { useState, useMemo, useEffect } from 'react'
import { format, parseISO, addMonths } from 'date-fns'
import { CalendarVariation, GeneratedSale, generateSaleCalendar, getDefaultSelectedPlatforms } from '@/lib/sale-calendar-generator'
import { Platform, PlatformEvent, SaleWithDetails } from '@/lib/types'
import CalendarExport from './CalendarExport'
import styles from './SaleCalendarPreviewModal.module.css'

interface SaleCalendarPreviewModalProps {
  isOpen: boolean
  onClose: () => void
  productId: string
  productName: string
  launchDate: string
  platforms: Platform[]
  platformEvents: PlatformEvent[]
  existingSales: SaleWithDetails[]
  onApply: (sales: GeneratedSale[]) => Promise<void>
  isApplying: boolean
}

export default function SaleCalendarPreviewModal({
  isOpen,
  onClose,
  productId,
  productName,
  launchDate,
  platforms,
  platformEvents,
  existingSales,
  onApply,
  isApplying
}: SaleCalendarPreviewModalProps) {
  // Step 1: Platform selection, Step 2: Strategy selection
  const [step, setStep] = useState<1 | 2>(1)
  const [selectedPlatformIds, setSelectedPlatformIds] = useState<string[]>([])
  const [variations, setVariations] = useState<CalendarVariation[]>([])
  const [selectedVariation, setSelectedVariation] = useState(1) // Default to "Balanced"
  const [selectedPlatform, setSelectedPlatform] = useState<string | 'all'>('all')
  const [showExport, setShowExport] = useState(false)
  
  // Initialize selected platforms (exclude 0-day cooldown by default)
  useEffect(() => {
    if (isOpen && platforms.length > 0) {
      setSelectedPlatformIds(getDefaultSelectedPlatforms(platforms))
      setStep(1)
      setVariations([])
    }
  }, [isOpen, platforms])
  
  const currentVariation = variations[selectedVariation]
  
  // Calculate period end (12 months from launch)
  const periodEnd = useMemo(() => {
    return format(addMonths(parseISO(launchDate), 12), 'MMM d, yyyy')
  }, [launchDate])
  
  // Get unique platforms from the sales for filtering
  const variationPlatforms = useMemo(() => {
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
  
  // Toggle platform selection
  const togglePlatform = (platformId: string) => {
    setSelectedPlatformIds(prev => 
      prev.includes(platformId)
        ? prev.filter(id => id !== platformId)
        : [...prev, platformId]
    )
  }
  
  // Select all / deselect all
  const selectAllPlatforms = () => {
    setSelectedPlatformIds(platforms.map(p => p.id))
  }
  
  const deselectAllPlatforms = () => {
    setSelectedPlatformIds([])
  }
  
  // Generate calendar with selected platforms
  const handleGenerate = () => {
    if (selectedPlatformIds.length === 0) return
    
    const newVariations = generateSaleCalendar({
      productId,
      platforms,
      platformEvents,
      launchDate,
      defaultDiscount: 50,
      existingSales,
      selectedPlatformIds
    })
    
    setVariations(newVariations)
    setSelectedVariation(1) // Default to Balanced
    setSelectedPlatform('all')
    setStep(2)
  }
  
  // Go back to platform selection
  const handleBack = () => {
    setStep(1)
  }
  
  if (!isOpen) return null
  
  const handleApply = async () => {
    if (currentVariation) {
      await onApply(currentVariation.sales)
    }
  }

  // Icons for each variation
  const variationIcons = ['🚀', '⚖️', '🎯']
  const variationColors = ['#ef4444', '#3b82f6', '#22c55e']
  
  // Sort platforms: with cooldown first, then 0-day cooldown
  const sortedPlatforms = useMemo(() => {
    return [...platforms].sort((a, b) => {
      // Platforms with cooldown first
      if (a.cooldown_days > 0 && b.cooldown_days === 0) return -1
      if (a.cooldown_days === 0 && b.cooldown_days > 0) return 1
      // Then alphabetically
      return a.name.localeCompare(b.name)
    })
  }, [platforms])
  
  const selectedCount = selectedPlatformIds.length
  const zeroCooldownCount = platforms.filter(p => p.cooldown_days === 0).length
  
  return (
    <>
      <div className={styles.overlay} onClick={onClose}>
        <div className={styles.modal} onClick={e => e.stopPropagation()}>
          <div className={styles.header}>
            <h2>🗓️ Auto-Generate Sale Calendar</h2>
            <p className={styles.subtitle}>for <strong>{productName}</strong></p>
            <div className={styles.launchInfo}>
              <span className={styles.launchBadge}>🚀 Launch: {format(parseISO(launchDate), 'MMM d, yyyy')}</span>
              <span className={styles.periodBadge}>📅 Planning through {periodEnd}</span>
            </div>
            {step === 2 && (
              <div className={styles.headerActions}>
                <button 
                  className={styles.exportPngButton}
                  onClick={() => setShowExport(true)}
                  title="Export all variations as PNG for client proposals"
                >
                  📸 Export PNG
                </button>
              </div>
            )}
            <button className={styles.closeButton} onClick={onClose}>×</button>
          </div>
          
          {/* Step Indicator */}
          <div className={styles.stepIndicator}>
            <div className={`${styles.step} ${step >= 1 ? styles.activeStep : ''}`}>
              <span className={styles.stepNumber}>1</span>
              <span className={styles.stepLabel}>Select Platforms</span>
            </div>
            <div className={styles.stepConnector} />
            <div className={`${styles.step} ${step >= 2 ? styles.activeStep : ''}`}>
              <span className={styles.stepNumber}>2</span>
              <span className={styles.stepLabel}>Choose Strategy</span>
            </div>
          </div>
          
          {/* Step 1: Platform Selection */}
          {step === 1 && (
            <div className={styles.platformSelection}>
              <div className={styles.platformHeader}>
                <h3>Which platforms should be included?</h3>
                <p className={styles.platformSubtext}>
                  Platforms with 0-day cooldown are excluded by default (no scheduling constraints)
                </p>
                <div className={styles.platformActions}>
                  <button 
                    className={styles.selectAllBtn}
                    onClick={selectAllPlatforms}
                  >
                    Select All
                  </button>
                  <button 
                    className={styles.deselectAllBtn}
                    onClick={deselectAllPlatforms}
                  >
                    Deselect All
                  </button>
                </div>
              </div>
              
              <div className={styles.platformGrid}>
                {sortedPlatforms.map(platform => {
                  const isSelected = selectedPlatformIds.includes(platform.id)
                  const isZeroCooldown = platform.cooldown_days === 0
                  
                  return (
                    <label 
                      key={platform.id}
                      className={`${styles.platformCheckbox} ${isSelected ? styles.platformSelected : ''} ${isZeroCooldown ? styles.zeroCooldown : ''}`}
                      style={{ '--platform-color': platform.color_hex } as React.CSSProperties}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => togglePlatform(platform.id)}
                      />
                      <span 
                        className={styles.platformColor}
                        style={{ backgroundColor: platform.color_hex }}
                      />
                      <span className={styles.platformInfo}>
                        <span className={styles.platformName}>{platform.name}</span>
                        <span className={styles.platformCooldown}>
                          {platform.cooldown_days > 0 
                            ? `${platform.cooldown_days}-day cooldown`
                            : '0-day cooldown (no limit)'}
                        </span>
                      </span>
                      {isZeroCooldown && (
                        <span className={styles.zeroCooldownBadge}>No Limit</span>
                      )}
                    </label>
                  )
                })}
              </div>
              
              <div className={styles.platformSummary}>
                <span className={styles.summaryText}>
                  {selectedCount} of {platforms.length} platforms selected
                  {zeroCooldownCount > 0 && selectedPlatformIds.filter(id => 
                    platforms.find(p => p.id === id)?.cooldown_days === 0
                  ).length > 0 && (
                    <span className={styles.warningText}>
                      (includes {selectedPlatformIds.filter(id => 
                        platforms.find(p => p.id === id)?.cooldown_days === 0
                      ).length} with no cooldown)
                    </span>
                  )}
                </span>
              </div>
            </div>
          )}
          
          {/* Step 2: Strategy Selection */}
          {step === 2 && (
            <>
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
                      <span className={styles.quickStatValue}>{variationPlatforms.length}</span>
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
                      {variationPlatforms.map(platform => {
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
            </>
          )}
          
          {/* Footer Actions */}
          <div className={styles.footer}>
            {step === 1 ? (
              <>
                <button className={styles.cancelButton} onClick={onClose}>
                  Cancel
                </button>
                <button 
                  className={styles.generateButton} 
                  onClick={handleGenerate}
                  disabled={selectedPlatformIds.length === 0}
                >
                  Generate Calendar →
                </button>
              </>
            ) : (
              <>
                <button className={styles.backButton} onClick={handleBack}>
                  ← Back to Platforms
                </button>
                <div className={styles.footerRight}>
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
              </>
            )}
          </div>
        </div>
      </div>
      
      {/* PNG Export Modal */}
      <CalendarExport
        isOpen={showExport}
        onClose={() => setShowExport(false)}
        productName={productName}
        launchDate={launchDate}
        variations={variations}
      />
    </>
  )
}
