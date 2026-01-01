'use client'

import { useRef, useState } from 'react'
import { format, parseISO, differenceInDays, startOfMonth, addMonths, getMonth } from 'date-fns'
import html2canvas from 'html2canvas'
import { SaleWithDetails, Platform, Product, Game, Client } from '@/lib/types'
import styles from './TimelineExportModal.module.css'

interface TimelineExportModalProps {
  isOpen: boolean
  onClose: () => void
  sales: SaleWithDetails[]
  products: (Product & { game: Game & { client: Client } })[]
  platforms: Platform[]
  timelineStart: Date
  monthCount: number
}

export default function TimelineExportModal({
  isOpen,
  onClose,
  sales,
  products,
  platforms,
  timelineStart,
  monthCount
}: TimelineExportModalProps) {
  const exportRef = useRef<HTMLDivElement>(null)
  const [isExporting, setIsExporting] = useState(false)
  
  if (!isOpen) return null
  
  const periodStart = startOfMonth(timelineStart)
  const periodEnd = addMonths(periodStart, monthCount)
  
  // Generate months for the timeline
  const months: Date[] = []
  let current = periodStart
  while (current < periodEnd) {
    months.push(current)
    current = addMonths(current, 1)
  }
  
  const handleExportPNG = async () => {
    if (!exportRef.current) return
    
    setIsExporting(true)
    
    try {
      const canvas = await html2canvas(exportRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        logging: false,
        width: exportRef.current.scrollWidth,
        height: exportRef.current.scrollHeight
      })
      
      const link = document.createElement('a')
      link.download = `GameDrive_Sales_Calendar_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
    } catch (err) {
      console.error('Export failed:', err)
    } finally {
      setIsExporting(false)
    }
  }
  
  // Products with sales
  const productsWithSales = products.filter(p => 
    sales.some(s => s.product_id === p.id)
  )
  
  // Calculate stats
  const totalSales = sales.length
  const productsCount = productsWithSales.length
  
  // Get platform counts
  const platformCounts = platforms.map(p => ({
    platform: p,
    count: sales.filter(s => s.platform_id === p.id).length
  })).filter(p => p.count > 0).sort((a, b) => b.count - a.count)
  
  // Group sales by month
  const salesByMonth = months.map(month => {
    const monthSales = sales.filter(s => {
      const saleMonth = getMonth(parseISO(s.start_date))
      const saleYear = parseISO(s.start_date).getFullYear()
      return saleMonth === getMonth(month) && saleYear === month.getFullYear()
    }).sort((a, b) => {
      // Sort by date, then by product name, then by platform
      const dateCompare = new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
      if (dateCompare !== 0) return dateCompare
      const productCompare = (a.product?.name || '').localeCompare(b.product?.name || '')
      if (productCompare !== 0) return productCompare
      return (a.platform?.name || '').localeCompare(b.platform?.name || '')
    })
    
    return {
      month,
      sales: monthSales
    }
  }).filter(m => m.sales.length > 0)
  
  // Used platforms (for legend)
  const usedPlatforms = platforms.filter(p => sales.some(s => s.platform_id === p.id))
  
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>Export Sales Calendar</h2>
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
                <div className={styles.companyInfo}>
                  <div className={styles.companyName}>Game Drive</div>
                  <div className={styles.companyTagline}>SALES PLANNING</div>
                </div>
              </div>
              <div className={styles.proposalTitle}>
                <h1>Sales Calendar {format(periodStart, 'yyyy')}</h1>
                <p className={styles.dateRange}>
                  {format(periodStart, 'MMMM')} — {format(addMonths(periodEnd, -1), 'MMMM yyyy')}
                </p>
              </div>
              <div className={styles.generatedDate}>
                <div>Generated</div>
                <div className={styles.dateValue}>{format(new Date(), 'MMM d, yyyy')}</div>
              </div>
            </div>
            
            {/* Summary Stats Row */}
            <div className={styles.summaryStats}>
              <div className={styles.statCard}>
                <div className={styles.statValue}>{productsCount}</div>
                <div className={styles.statLabel}>Products</div>
              </div>
              <div className={styles.statCard}>
                <div className={styles.statValue}>{totalSales}</div>
                <div className={styles.statLabel}>Planned Sales</div>
              </div>
              <div className={styles.statCard}>
                <div className={styles.statValue}>{usedPlatforms.length}</div>
                <div className={styles.statLabel}>Platforms</div>
              </div>
              {platformCounts.slice(0, 4).map(({ platform, count }) => (
                <div key={platform.id} className={styles.statCard}>
                  <div className={styles.statValue} style={{ color: platform.color_hex }}>{count}</div>
                  <div className={styles.statLabel}>{platform.name}</div>
                </div>
              ))}
            </div>

            {/* Monthly Tables */}
            <div className={styles.monthlySection}>
              {salesByMonth.map(({ month, sales: monthSales }) => (
                <div key={month.toISOString()} className={styles.monthBlock}>
                  <div className={styles.monthHeader}>
                    <h3>{format(month, 'MMMM yyyy')}</h3>
                    <span className={styles.monthCount}>{monthSales.length} sales</span>
                  </div>
                  <table className={styles.salesTable}>
                    <thead>
                      <tr>
                        <th className={styles.colProduct}>Product</th>
                        <th className={styles.colPlatform}>Platform</th>
                        <th className={styles.colDates}>Start</th>
                        <th className={styles.colDates}>End</th>
                        <th className={styles.colDays}>Days</th>
                        <th className={styles.colDiscount}>Discount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthSales.map(sale => {
                        const days = differenceInDays(parseISO(sale.end_date), parseISO(sale.start_date)) + 1
                        return (
                          <tr key={sale.id}>
                            <td className={styles.productCell}>
                              <span className={styles.productName}>{sale.product?.name}</span>
                            </td>
                            <td>
                              <span 
                                className={styles.platformBadge}
                                style={{ backgroundColor: sale.platform?.color_hex }}
                              >
                                {sale.platform?.name}
                              </span>
                            </td>
                            <td className={styles.dateCell}>{format(parseISO(sale.start_date), 'MMM d')}</td>
                            <td className={styles.dateCell}>{format(parseISO(sale.end_date), 'MMM d')}</td>
                            <td className={styles.daysCell}>{days}</td>
                            <td className={styles.discountCell}>{sale.discount_percentage}%</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
            
            {/* Platform Legend */}
            <div className={styles.proposalFooter}>
              <div className={styles.legend}>
                <span className={styles.legendTitle}>Platform Cooldowns:</span>
                <div className={styles.legendGrid}>
                  {usedPlatforms.slice(0, 10).map(platform => (
                    <div key={platform.id} className={styles.legendItem}>
                      <span 
                        className={styles.legendColor}
                        style={{ backgroundColor: platform.color_hex }}
                      />
                      <span className={styles.legendName}>{platform.name}</span>
                      <span className={styles.legendCooldown}>{platform.cooldown_days}d</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className={styles.footerNote}>
                Generated by Game Drive Sales Planning Tool • All dates subject to platform approval
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
