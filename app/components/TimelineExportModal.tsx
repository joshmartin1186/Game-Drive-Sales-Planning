'use client'

import { useRef, useState } from 'react'
import { format, parseISO, differenceInDays, startOfMonth, addMonths } from 'date-fns'
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
  const [exportFormat, setExportFormat] = useState<'summary' | 'detailed'>('summary')
  
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
    return Math.max(0.5, (duration / totalDays) * 100)
  }
  
  // Group products by game
  const groupedProducts = products.reduce((acc, product) => {
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
  
  // Get sales for a product grouped by platform
  const getSalesForProduct = (productId: string) => {
    const productSales = sales.filter(s => s.product_id === productId)
    const byPlatform: Record<string, SaleWithDetails[]> = {}
    
    productSales.forEach(sale => {
      const platformId = sale.platform_id
      if (!byPlatform[platformId]) {
        byPlatform[platformId] = []
      }
      byPlatform[platformId].push(sale)
    })
    
    return byPlatform
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
  const totalProducts = products.length
  const platformCounts = platforms.map(p => ({
    platform: p,
    count: sales.filter(s => s.platform_id === p.id).length
  })).filter(p => p.count > 0)
  
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>Export Sales Calendar</h2>
          <div className={styles.headerActions}>
            <div className={styles.formatToggle}>
              <button
                className={`${styles.formatBtn} ${exportFormat === 'summary' ? styles.active : ''}`}
                onClick={() => setExportFormat('summary')}
              >
                Summary
              </button>
              <button
                className={`${styles.formatBtn} ${exportFormat === 'detailed' ? styles.active : ''}`}
                onClick={() => setExportFormat('detailed')}
              >
                Detailed
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
                  <div className={styles.companyTagline}>Sales Planning</div>
                </div>
              </div>
              <div className={styles.proposalTitle}>
                <h1>Sales Calendar Overview</h1>
                <p className={styles.dateRange}>
                  {format(periodStart, 'MMMM yyyy')} — {format(addMonths(periodEnd, -1), 'MMMM yyyy')}
                </p>
              </div>
              <div className={styles.generatedDate}>
                <div>Generated</div>
                <div className={styles.dateValue}>{format(new Date(), 'MMM d, yyyy')}</div>
              </div>
            </div>
            
            {/* Summary Stats */}
            <div className={styles.summaryStats}>
              <div className={styles.statCard}>
                <div className={styles.statValue}>{totalProducts}</div>
                <div className={styles.statLabel}>Products</div>
              </div>
              <div className={styles.statCard}>
                <div className={styles.statValue}>{totalSales}</div>
                <div className={styles.statLabel}>Planned Sales</div>
              </div>
              {platformCounts.slice(0, 4).map(({ platform, count }) => (
                <div key={platform.id} className={styles.statCard}>
                  <div className={styles.statValue} style={{ color: platform.color_hex }}>{count}</div>
                  <div className={styles.statLabel}>{platform.name}</div>
                </div>
              ))}
            </div>
            
            {/* Timeline Header */}
            <div className={styles.timelineSection}>
              <div className={styles.timelineHeader}>
                <div className={styles.productColumn}>Product</div>
                <div className={styles.monthsRow}>
                  {months.map((month, idx) => (
                    <div key={idx} className={styles.monthLabel}>
                      {format(month, 'MMM')}
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Products and Sales */}
              {Object.values(groupedProducts).map(({ game, products: gameProducts }) => (
                <div key={game.id} className={styles.gameSection}>
                  <div className={styles.gameHeader}>
                    <span className={styles.gameName}>{game.name}</span>
                    <span className={styles.clientName}>{game.client?.name}</span>
                  </div>
                  
                  {gameProducts.map(product => {
                    const salesByPlatform = getSalesForProduct(product.id)
                    const platformIds = Object.keys(salesByPlatform)
                    
                    if (platformIds.length === 0 && exportFormat === 'summary') {
                      return null // Skip products without sales in summary mode
                    }
                    
                    return (
                      <div key={product.id} className={styles.productSection}>
                        <div className={styles.productRow}>
                          <div className={styles.productColumn}>
                            <span className={styles.productName}>{product.name}</span>
                            <span className={styles.productType}>{product.product_type}</span>
                          </div>
                          <div className={styles.timelineArea}>
                            {/* Month grid lines */}
                            <div className={styles.monthGrid}>
                              {months.map((_, idx) => (
                                <div key={idx} className={styles.monthGridLine} />
                              ))}
                            </div>
                          </div>
                        </div>
                        
                        {/* Platform rows */}
                        {platformIds.map(platformId => {
                          const platform = platforms.find(p => p.id === platformId)
                          const platformSales = salesByPlatform[platformId]
                          if (!platform) return null
                          
                          return (
                            <div key={platformId} className={styles.platformRow}>
                              <div className={styles.productColumn}>
                                <span 
                                  className={styles.platformIndicator}
                                  style={{ backgroundColor: platform.color_hex }}
                                />
                                <span className={styles.platformName}>{platform.name}</span>
                              </div>
                              <div className={styles.timelineArea}>
                                {/* Month grid */}
                                <div className={styles.monthGrid}>
                                  {months.map((_, idx) => (
                                    <div key={idx} className={styles.monthGridLine} />
                                  ))}
                                </div>
                                
                                {/* Sales blocks */}
                                {platformSales.map(sale => {
                                  const left = getDayPosition(sale.start_date)
                                  const width = getSaleWidth(sale.start_date, sale.end_date)
                                  
                                  return (
                                    <div
                                      key={sale.id}
                                      className={styles.saleBlock}
                                      style={{
                                        left: `${left}%`,
                                        width: `${width}%`,
                                        backgroundColor: platform.color_hex
                                      }}
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
                    )
                  })}
                </div>
              ))}
            </div>
            
            {/* Sales Table (Detailed view) */}
            {exportFormat === 'detailed' && sales.length > 0 && (
              <div className={styles.salesTable}>
                <h3>Scheduled Sales Details</h3>
                <table>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Platform</th>
                      <th>Sale Name</th>
                      <th>Start</th>
                      <th>End</th>
                      <th>Discount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sales
                      .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())
                      .map(sale => (
                        <tr key={sale.id}>
                          <td>{sale.product?.name}</td>
                          <td>
                            <span 
                              className={styles.tablePlatformDot}
                              style={{ backgroundColor: sale.platform?.color_hex }}
                            />
                            {sale.platform?.name}
                          </td>
                          <td>{sale.sale_name || '-'}</td>
                          <td>{format(parseISO(sale.start_date), 'MMM d, yyyy')}</td>
                          <td>{format(parseISO(sale.end_date), 'MMM d, yyyy')}</td>
                          <td>{sale.discount_percentage}%</td>
                        </tr>
                      ))
                    }
                  </tbody>
                </table>
              </div>
            )}
            
            {/* Footer */}
            <div className={styles.proposalFooter}>
              <div className={styles.legend}>
                <span className={styles.legendTitle}>Platforms:</span>
                {platforms.filter(p => sales.some(s => s.platform_id === p.id)).map(platform => (
                  <div key={platform.id} className={styles.legendItem}>
                    <span 
                      className={styles.legendColor}
                      style={{ backgroundColor: platform.color_hex }}
                    />
                    <span>{platform.name}</span>
                    <span className={styles.legendCooldown}>({platform.cooldown_days}d cooldown)</span>
                  </div>
                ))}
              </div>
              <div className={styles.footerNote}>
                All dates subject to platform approval. Generated by Game Drive Sales Planning Tool.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
