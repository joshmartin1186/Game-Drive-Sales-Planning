'use client'

import { format, parseISO, differenceInDays, addDays } from 'date-fns'
import { SaleWithDetails, Platform } from '@/lib/types'
import styles from './SalesTable.module.css'

interface SalesTableProps {
  sales: SaleWithDetails[]
  platforms: Platform[]
  onDelete: (saleId: string) => Promise<void>
}

export default function SalesTable({ sales, platforms, onDelete }: SalesTableProps) {
  // Sort sales by start date
  const sortedSales = [...sales].sort((a, b) => 
    new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
  )
  
  const calculateDays = (start: string, end: string): number => {
    return differenceInDays(parseISO(end), parseISO(start)) + 1
  }
  
  const calculateCooldownUntil = (endDate: string, platformId: string): string => {
    const platform = platforms.find(p => p.id === platformId)
    if (!platform || platform.cooldown_days === 0) return '-'
    
    const cooldownEnd = addDays(parseISO(endDate), platform.cooldown_days)
    return format(cooldownEnd, 'dd/MM/yyyy')
  }
  
  const exportToCSV = () => {
    const headers = [
      'Start Date',
      'End Date', 
      'Days',
      'Platform',
      'Cooldown',
      'Sale Name',
      'Product',
      'Game',
      'Client',
      'Discount %',
      'Status',
      'Goal',
      'Cooldown Until',
      'Notes'
    ]
    
    const rows = sortedSales.map(sale => {
      const platform = platforms.find(p => p.id === sale.platform_id)
      return [
        format(parseISO(sale.start_date), 'dd/MM/yyyy'),
        format(parseISO(sale.end_date), 'dd/MM/yyyy'),
        calculateDays(sale.start_date, sale.end_date),
        platform?.name || '',
        platform?.cooldown_days || 0,
        sale.sale_name || 'Custom',
        sale.product?.name || '',
        sale.product?.game?.name || '',
        sale.product?.game?.client?.name || '',
        sale.discount_percentage || '',
        sale.status || '',
        sale.goal_type || '',
        calculateCooldownUntil(sale.end_date, sale.platform_id),
        sale.notes || ''
      ]
    })
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n')
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `sales_schedule_${format(new Date(), 'yyyy-MM-dd')}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }
  
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.count}>{sales.length} sales scheduled</span>
        <button className={styles.exportBtn} onClick={exportToCSV}>
          ⬇ Export CSV
        </button>
      </div>
      
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Start Date</th>
              <th>End Date</th>
              <th>Days</th>
              <th>Platform</th>
              <th>Cooldown</th>
              <th>Sale Name</th>
              <th>Product</th>
              <th>Discount</th>
              <th>Status</th>
              <th>Cooldown Until</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedSales.length === 0 ? (
              <tr>
                <td colSpan={11} className={styles.emptyRow}>
                  No sales scheduled. Click "+ Add Sale" to create one.
                </td>
              </tr>
            ) : (
              sortedSales.map(sale => {
                const platform = platforms.find(p => p.id === sale.platform_id)
                const days = calculateDays(sale.start_date, sale.end_date)
                const cooldownUntil = calculateCooldownUntil(sale.end_date, sale.platform_id)
                
                return (
                  <tr key={sale.id}>
                    <td>{format(parseISO(sale.start_date), 'dd/MM/yyyy')}</td>
                    <td>{format(parseISO(sale.end_date), 'dd/MM/yyyy')}</td>
                    <td>{days}</td>
                    <td>
                      <span 
                        className={styles.platformBadge}
                        style={{ backgroundColor: platform?.color_hex || '#666' }}
                      >
                        {platform?.name || 'Unknown'}
                      </span>
                    </td>
                    <td>{platform?.cooldown_days || 0}d</td>
                    <td>{sale.sale_name || 'Custom'}</td>
                    <td>
                      <div className={styles.productCell}>
                        <span className={styles.productName}>{sale.product?.name}</span>
                        <span className={styles.gameName}>{sale.product?.game?.name}</span>
                      </div>
                    </td>
                    <td className={styles.discount}>
                      {sale.discount_percentage ? `-${sale.discount_percentage}%` : '-'}
                    </td>
                    <td>
                      <span className={`${styles.statusBadge} ${styles[sale.status || 'draft']}`}>
                        {sale.status || 'draft'}
                      </span>
                    </td>
                    <td>{cooldownUntil}</td>
                    <td>
                      <button 
                        className={styles.deleteBtn}
                        onClick={() => onDelete(sale.id)}
                        title="Delete sale"
                      >
                        🗑
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
