'use client'

import { useRef, useState } from 'react'
import { format, parseISO, differenceInDays, addMonths } from 'date-fns'
import html2canvas from 'html2canvas'
import { CalendarVariation, GeneratedSale } from '@/lib/sale-calendar-generator'
import styles from './CalendarExport.module.css'

interface CalendarExportProps {
  isOpen: boolean
  onClose: () => void
  productName: string
  launchDate: string
  variations: CalendarVariation[]
}

export default function CalendarExport({
  isOpen,
  onClose,
  productName,
  launchDate,
  variations
}: CalendarExportProps) {
  const exportRef = useRef<HTMLDivElement>(null)
  const [isExporting, setIsExporting] = useState(false)
  
  if (!isOpen) return null
  
  const periodStart = parseISO(launchDate)
  const periodEnd = addMonths(periodStart, 12)
  
  // Generate months for the timeline
  const months: Date[] = []
  let current = periodStart
  while (current < periodEnd) {
    months.push(current)
    current = addMonths(current, 1)
  }
  
  const getDayPosition = (date: string): number => {
    const d = parseISO(date)
    const totalDays = differenceInDays(periodEnd, periodStart)
    const daysDiff = differenceInDays(d, periodStart)
    return (daysDiff / totalDays) * 100
  }
  
  const getSaleWidth = (start: string, end: string): number => {
    const totalDays = differenceInDays(periodEnd, periodStart)
    const duration = differenceInDays(parseISO(end), parseISO(start)) + 1
    return (duration / totalDays) * 100
  }
  
  const handleExportPNG = async () => {
    if (!exportRef.current) return
    
    setIsExporting(true)
    
    try {
      const canvas = await html2canvas(exportRef.current, {
        backgroundColor: '#ffffff',
        scale: 2, // Higher quality
        useCORS: true,
        logging: false,
        width: exportRef.current.scrollWidth,
        height: exportRef.current.scrollHeight
      })
      
      const link = document.createElement('a')
      link.download = `${productName.replace(/\s+/g, '_')}_Sale_Calendar_Proposal_${format(new Date(), 'yyyy-MM-dd')}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
    } catch (err) {
      console.error('Export failed:', err)
    } finally {
      setIsExporting(false)
    }
  }
  
  // Group sales by platform for each variation
  const groupByPlatform = (sales: GeneratedSale[]) => {
    const groups: Record<string, GeneratedSale[]> = {}
    sales.forEach(sale => {
      if (!groups[sale.platform_name]) {
        groups[sale.platform_name] = []
      }
      groups[sale.platform_name].push(sale)
    })
    return groups
  }
  
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>Export Sale Calendar Proposal</h2>
          <div className={styles.headerActions}>
            <button 
              className={styles.exportBtn}
              onClick={handleExportPNG}
              disabled={isExporting}
            >
              {isExporting ? '⏳ Exporting...' : '📸 Download PNG'}
            </button>
            <button className={styles.closeBtn} onClick={onClose}>×</button>
          </div>
        </div>
        
        <div className={styles.previewScroll}>
          {/* Exportable Content */}
          <div ref={exportRef} className={styles.exportContent}>
            {/* Header */}
            <div className={styles.proposalHeader}>
              <div className={styles.logoSection}>
                <div className={styles.logoPlaceholder}>🎮</div>
                <div className={styles.companyName}>Game Drive</div>
              </div>
              <div className={styles.proposalTitle}>
                <h1>Sale Calendar Proposal</h1>
                <h2>{productName}</h2>
                <p className={styles.dateRange}>
                  {format(periodStart, 'MMMM d, yyyy')} — {format(periodEnd, 'MMMM d, yyyy')}
                </p>
              </div>
              <div className={styles.generatedDate}>
                Generated: {format(new Date(), 'MMMM d, yyyy')}
              </div>
            </div>
            
            {/* Timeline Header */}
            <div className={styles.timelineHeader}>
              {months.map((month, idx) => (
                <div key={idx} className={styles.monthLabel}>
                  {format(month, 'MMM yyyy')}
                </div>
              ))}
            </div>
            
            {/* Variations */}
            {variations.map((variation, vIdx) => {
              const platformGroups = groupByPlatform(variation.sales)
              const platformNames = Object.keys(platformGroups).sort()
              
              return (
                <div key={vIdx} className={styles.variationSection}>
                  <div className={styles.variationHeader}>
                    <div className={styles.variationInfo}>
                      <h3>{variation.name}</h3>
                      <p>{variation.description}</p>
                    </div>
                    <div className={styles.variationStats}>
                      <div className={styles.stat}>
                        <span className={styles.statValue}>{variation.stats.totalSales}</span>
                        <span className={styles.statLabel}>Total Sales</span>
                      </div>
                      <div className={styles.stat}>
                        <span className={styles.statValue}>{variation.stats.totalDaysOnSale}</span>
                        <span className={styles.statLabel}>Days on Sale</span>
                      </div>
                      <div className={styles.stat}>
                        <span className={styles.statValue}>{variation.stats.percentageOnSale}%</span>
                        <span className={styles.statLabel}>Coverage</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className={styles.timeline}>
                    {/* Month grid lines */}
                    <div className={styles.monthGridLines}>
                      {months.map((month, idx) => (
                        <div key={idx} className={styles.monthGridLine} />
                      ))}
                    </div>
                    
                    {/* Platform rows */}
                    {platformNames.map((platformName) => {
                      const sales = platformGroups[platformName]
                      const color = sales[0]?.platform_color || '#666'
                      
                      return (
                        <div key={platformName} className={styles.platformRow}>
                          <div className={styles.platformLabel}>
                            <span 
                              className={styles.platformDot}
                              style={{ backgroundColor: color }}
                            />
                            <span className={styles.platformName}>{platformName}</span>
                          </div>
                          <div className={styles.platformTimeline}>
                            {sales.map((sale, sIdx) => {
                              const left = getDayPosition(sale.start_date)
                              const width = getSaleWidth(sale.start_date, sale.end_date)
                              
                              return (
                                <div
                                  key={sIdx}
                                  className={styles.saleBlock}
                                  style={{
                                    left: `${left}%`,
                                    width: `${width}%`,
                                    backgroundColor: color
                                  }}
                                  title={`${sale.sale_name}: ${format(parseISO(sale.start_date), 'MMM d')} - ${format(parseISO(sale.end_date), 'MMM d')}`}
                                >
                                  {width > 3 && (
                                    <span className={styles.saleLabel}>
                                      {sale.discount_percentage}%
                                    </span>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
            
            {/* Footer */}
            <div className={styles.proposalFooter}>
              <div className={styles.legend}>
                <span className={styles.legendTitle}>Platform Legend:</span>
                {variations[0]?.sales
                  .reduce((acc, sale) => {
                    if (!acc.some(s => s.platform_name === sale.platform_name)) {
                      acc.push(sale)
                    }
                    return acc
                  }, [] as GeneratedSale[])
                  .map((sale, idx) => (
                    <div key={idx} className={styles.legendItem}>
                      <span 
                        className={styles.legendColor}
                        style={{ backgroundColor: sale.platform_color }}
                      />
                      <span>{sale.platform_name}</span>
                    </div>
                  ))
                }
              </div>
              <div className={styles.footerNote}>
                All dates subject to platform approval. Cooldown periods apply between sales.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
