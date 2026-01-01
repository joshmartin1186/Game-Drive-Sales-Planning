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
        scale: 3, // Higher quality
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
  })).filter(p => p.count > 0).sort((a, b) => b.count - a.count)
  
  // Sort sales for detailed view and split into columns
  const sortedSales = [...sales].sort((a, b) => 
    new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
  )
  
  // Split into 3 columns for detailed view
  const columnSize = Math.ceil(sortedSales.length / 3)
  const columns = [
    sortedSales.slice(0, columnSize),
    sortedSales.slice(columnSize, columnSize * 2),
    sortedSales.slice(columnSize * 2)
  ]
  
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
                  <div className={styles.companyTagline}>SALES PLANNING</div>
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
                <div className={styles.statLabel}>PRODUCTS</div>
              </div>
              <div className={styles.statCard}>
                <div className={styles.statValue}>{totalSales}</div>
                <div className={styles.statLabel}>PLANNED SALES</div>
              </div>
              {platformCounts.slice(0, 5).map(({ platform, count }) => (
                <div key={platform.id} className={styles.statCard}>
                  <div className={styles.statValue} style={{ color: platform.color_hex }}>{count}</div>
                  <div className={styles.statLabel}>{platform.name.toUpperCase()}</div>
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
                    
                    if (platformIds.length === 0) {
                      return null // Skip products without sales
                    }
                    
                    return (
                      <div key={product.id} className={styles.productSection}>
                        <div className={styles.productRow}>
                          <div className={styles.productColumn}>
                            <span className={styles.productName}>{product.name}</span>
                            <span className={styles.productType}>{product.product_type}</span>
                          </div>
                          <div className={styles.timelineArea}>
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
                                <div className={styles.monthGrid}>
                                  {months.map((_, idx) => (
                                    <div key={idx} className={styles.monthGridLine} />
                                  ))}
                                </div>
                                
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
                                      {width > 1.5 && (
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
            
            {/* Sales Table (Detailed view) - Multi-column layout */}
            {exportFormat === 'detailed' && sales.length > 0 && (
              <div className={styles.salesTableSection}>
                <h3>Scheduled Sales Details</h3>
                <div className={styles.multiColumnTable}>
                  {columns.map((columnSales, colIdx) => (
                    <div key={colIdx} className={styles.tableColumn}>
                      <table>
                        <thead>
                          <tr>
                            <th>Product</th>
                            <th>Platform</th>
                            <th>Dates</th>
                            <th>%</th>
                          </tr>
                        </thead>
                        <tbody>
                          {columnSales.map(sale => (
                            <tr key={sale.id}>
                              <td className={styles.productCell}>{sale.product?.name}</td>
                              <td>
                                <span 
                                  className={styles.tablePlatformDot}
                                  style={{ backgroundColor: sale.platform?.color_hex }}
                                />
                                {sale.platform?.name}
                              </td>
                              <td className={styles.dateCell}>
                                {format(parseISO(sale.start_date), 'MMM d')} - {format(parseISO(sale.end_date), 'MMM d')}
                              </td>
                              <td className={styles.discountCell}>{sale.discount_percentage}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Footer */}
            <div className={styles.proposalFooter}>
              <div className={styles.legend}>
                <span className={styles.legendTitle}>PLATFORMS:</span>
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
