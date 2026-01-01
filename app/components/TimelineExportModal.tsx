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
  const [exportFormat, setExportFormat] = useState<'visual' | 'table'>('visual')
  
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
  
  const getDayPosition = (date: string): number => {
    const d = parseISO(date)
    const totalDays = differenceInDays(periodEnd, periodStart)
    const daysDiff = differenceInDays(d, periodStart)
    return Math.max(0, Math.min(100, (daysDiff / totalDays) * 100))
  }
  
  const getSaleWidth = (start: string, end: string): number => {
    const totalDays = differenceInDays(periodEnd, periodStart)
    const duration = differenceInDays(parseISO(end), parseISO(start)) + 1
    return Math.max(0.8, (duration / totalDays) * 100)
  }
  
  // Group products by game - only include products with sales
  const productsWithSales = products.filter(p => 
    sales.some(s => s.product_id === p.id)
  )
  
  const groupedProducts = productsWithSales.reduce((acc, product) => {
    if (!product.game) return acc
    const gameId = product.game.id
    if (!acc[gameId]) {
      acc[gameId] = {
        game: product.game,
        products: []
      }
    }
    acc[gameId].products.push(product)
    return acc
  }, {} as Record<string, { game: Game & { client: Client }, products: (Product & { game: Game & { client: Client } })[] }>)
  
  // Get ALL sales for a product (across all platforms)
  const getAllSalesForProduct = (productId: string): SaleWithDetails[] => {
    return sales.filter(s => s.product_id === productId)
      .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())
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
  
  // Calculate stats
  const totalSales = sales.length
  const productsCount = productsWithSales.length
  
  // Get top platforms by usage
  const platformCounts = platforms.map(p => ({
    platform: p,
    count: sales.filter(s => s.platform_id === p.id).length
  })).filter(p => p.count > 0).sort((a, b) => b.count - a.count)
  
  // Sort sales for table view - group by month
  const salesByMonth = months.map(month => {
    const monthSales = sales.filter(s => {
      const saleMonth = getMonth(parseISO(s.start_date))
      const saleYear = parseISO(s.start_date).getFullYear()
      return saleMonth === getMonth(month) && saleYear === month.getFullYear()
    }).sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())
    
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
            <div className={styles.formatToggle}>
              <button
                className={`${styles.formatBtn} ${exportFormat === 'visual' ? styles.active : ''}`}
                onClick={() => setExportFormat('visual')}
              >
                Visual Timeline
              </button>
              <button
                className={`${styles.formatBtn} ${exportFormat === 'table' ? styles.active : ''}`}
                onClick={() => setExportFormat('table')}
              >
                Table View
              </button>
            </div>
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
              {platformCounts.slice(0, 3).map(({ platform, count }) => (
                <div key={platform.id} className={styles.statCard}>
                  <div className={styles.statValue} style={{ color: platform.color_hex }}>{count}</div>
                  <div className={styles.statLabel}>{platform.name}</div>
                </div>
              ))}
            </div>

            {exportFormat === 'visual' ? (
              /* VISUAL TIMELINE - One row per product, all sales as colored blocks */
              <div className={styles.timelineSection}>
                <div className={styles.timelineHeader}>
                  <div className={styles.productColumnHeader}>Product</div>
                  <div className={styles.monthsRow}>
                    {months.map((month, idx) => (
                      <div key={idx} className={styles.monthLabel}>
                        {format(month, 'MMM')}
                      </div>
                    ))}
                  </div>
                </div>
                
                {Object.values(groupedProducts).map(({ game, products: gameProducts }) => (
                  <div key={game.id} className={styles.gameSection}>
                    <div className={styles.gameHeader}>
                      <span className={styles.gameName}>{game.name}</span>
                      <span className={styles.clientBadge}>{game.client?.name}</span>
                    </div>
                    
                    {gameProducts.map(product => {
                      const productSales = getAllSalesForProduct(product.id)
                      if (productSales.length === 0) return null
                      
                      return (
                        <div key={product.id} className={styles.productRow}>
                          <div className={styles.productColumn}>
                            <span className={styles.productName}>{product.name}</span>
                            <span className={styles.salesCount}>{productSales.length} sales</span>
                          </div>
                          <div className={styles.timelineArea}>
                            <div className={styles.monthGrid}>
                              {months.map((_, idx) => (
                                <div key={idx} className={styles.monthGridLine} />
                              ))}
                            </div>
                            
                            {/* All sales for this product as colored blocks */}
                            {productSales.map((sale, idx) => {
                              const left = getDayPosition(sale.start_date)
                              const width = getSaleWidth(sale.start_date, sale.end_date)
                              const platform = platforms.find(p => p.id === sale.platform_id)
                              
                              return (
                                <div
                                  key={sale.id}
                                  className={styles.saleBlock}
                                  style={{
                                    left: `${left}%`,
                                    width: `${width}%`,
                                    backgroundColor: platform?.color_hex || '#666',
                                    top: `${4 + (idx % 2) * 16}px`
                                  }}
                                  title={`${platform?.name}: ${format(parseISO(sale.start_date), 'MMM d')} - ${format(parseISO(sale.end_date), 'MMM d')} (${sale.discount_percentage}%)`}
                                >
                                  {width > 2 && (
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
                ))}
              </div>
            ) : (
              /* TABLE VIEW - Organized by month */
              <div className={styles.tableSection}>
                {salesByMonth.map(({ month, sales: monthSales }) => (
                  <div key={month.toISOString()} className={styles.monthTable}>
                    <h3 className={styles.monthTitle}>{format(month, 'MMMM yyyy')}</h3>
                    <table className={styles.salesTable}>
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th>Platform</th>
                          <th>Start</th>
                          <th>End</th>
                          <th>Days</th>
                          <th>Discount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {monthSales.map(sale => {
                          const days = differenceInDays(parseISO(sale.end_date), parseISO(sale.start_date)) + 1
                          return (
                            <tr key={sale.id}>
                              <td className={styles.productCell}>
                                <strong>{sale.product?.name}</strong>
                                <span className={styles.gameLabel}>{sale.product?.game?.name}</span>
                              </td>
                              <td>
                                <span 
                                  className={styles.platformBadge}
                                  style={{ backgroundColor: sale.platform?.color_hex }}
                                >
                                  {sale.platform?.name}
                                </span>
                              </td>
                              <td>{format(parseISO(sale.start_date), 'MMM d')}</td>
                              <td>{format(parseISO(sale.end_date), 'MMM d')}</td>
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
            )}
            
            {/* Platform Legend */}
            <div className={styles.proposalFooter}>
              <div className={styles.legend}>
                <span className={styles.legendTitle}>Platforms:</span>
                <div className={styles.legendGrid}>
                  {usedPlatforms.map(platform => (
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
