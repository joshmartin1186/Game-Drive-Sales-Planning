'use client'

import { format, parseISO, differenceInDays, addDays } from 'date-fns'
import { SaleWithDetails, Platform } from '@/lib/types'
import styles from './SalesTable.module.css'
import * as XLSX from 'xlsx'

interface SalesTableProps {
  sales: SaleWithDetails[]
  platforms: Platform[]
  onDelete: (saleId: string) => Promise<void>
  onEdit: (sale: SaleWithDetails) => void
}

export default function SalesTable({ sales, platforms, onDelete, onEdit }: SalesTableProps) {
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
  
  const exportToExcel = () => {
    // Prepare data for Excel - matching client's exact column structure
    // Client columns: Start date | End date | Days | Platform | Cooldown | Sale Name | Product | Campaign? | Goal | Discount % | Submitted? | Confirmed? | Comment | Cooldown Until | Prev. Sale Stops Date
    const excelData = sortedSales.map(sale => {
      const platform = platforms.find(p => p.id === sale.platform_id)
      return {
        'Start date': format(parseISO(sale.start_date), 'dd/MM/yyyy'),
        'End date': format(parseISO(sale.end_date), 'dd/MM/yyyy'),
        'Days': calculateDays(sale.start_date, sale.end_date),
        'Platform': platform?.name || '',
        'Cooldown': platform?.cooldown_days || 0,
        'Sale Name': sale.sale_name || 'Custom',
        'Product': sale.product?.name || '',
        'Game': sale.product?.game?.name || '',
        'Client': sale.product?.game?.client?.name || '',
        'Campaign?': sale.is_campaign ? 'Yes' : '',
        'Goal': sale.goal_type || '',
        'Discount %': sale.discount_percentage ? `${sale.discount_percentage}%` : '',
        'Submitted?': sale.is_submitted ? 'Yes' : '',
        'Confirmed?': sale.is_confirmed ? 'Yes' : '',
        'Comment': sale.comment || sale.notes || '',
        'Cooldown Until': calculateCooldownUntil(sale.end_date, sale.platform_id),
        'Prev. Sale Stops Date': sale.prev_sale_end_date 
          ? format(parseISO(sale.prev_sale_end_date), 'dd/MM/yyyy') 
          : ''
      }
    })
    
    // Create workbook and worksheet
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(excelData)
    
    // Set column widths for better readability
    ws['!cols'] = [
      { wch: 12 }, // Start date
      { wch: 12 }, // End date
      { wch: 6 },  // Days
      { wch: 15 }, // Platform
      { wch: 10 }, // Cooldown
      { wch: 25 }, // Sale Name
      { wch: 25 }, // Product
      { wch: 20 }, // Game
      { wch: 15 }, // Client
      { wch: 10 }, // Campaign?
      { wch: 12 }, // Goal
      { wch: 12 }, // Discount %
      { wch: 10 }, // Submitted?
      { wch: 10 }, // Confirmed?
      { wch: 30 }, // Comment
      { wch: 14 }, // Cooldown Until
      { wch: 18 }, // Prev. Sale Stops Date
    ]
    
    XLSX.utils.book_append_sheet(wb, ws, 'Sales Schedule')
    
    // Generate filename with date
    const filename = `sales_schedule_${format(new Date(), 'yyyy-MM-dd')}.xlsx`
    
    // Download file
    XLSX.writeFile(wb, filename)
  }
  
  const exportToCSV = () => {
    const headers = [
      'Start date',
      'End date', 
      'Days',
      'Platform',
      'Cooldown',
      'Sale Name',
      'Product',
      'Game',
      'Client',
      'Campaign?',
      'Goal',
      'Discount %',
      'Submitted?',
      'Confirmed?',
      'Comment',
      'Cooldown Until',
      'Prev. Sale Stops Date'
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
        sale.is_campaign ? 'Yes' : '',
        sale.goal_type || '',
        sale.discount_percentage ? `${sale.discount_percentage}%` : '',
        sale.is_submitted ? 'Yes' : '',
        sale.is_confirmed ? 'Yes' : '',
        sale.comment || sale.notes || '',
        calculateCooldownUntil(sale.end_date, sale.platform_id),
        sale.prev_sale_end_date 
          ? format(parseISO(sale.prev_sale_end_date), 'dd/MM/yyyy') 
          : ''
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
  
  const handleRowClick = (sale: SaleWithDetails, e: React.MouseEvent) => {
    // Don't trigger edit if clicking on action buttons
    if ((e.target as HTMLElement).closest('button')) return
    onEdit(sale)
  }
  
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.count}>{sales.length} sales scheduled</span>
        <div className={styles.exportButtons}>
          <button className={styles.exportBtn} onClick={exportToExcel} title="Export to Excel">
            📊 Export Excel
          </button>
          <button className={styles.exportBtnSecondary} onClick={exportToCSV} title="Export to CSV">
            📄 CSV
          </button>
        </div>
      </div>
      
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Start Date</th>
              <th>End Date</th>
              <th>Days</th>
              <th>Platform</th>
              <th>Sale Name</th>
              <th>Product</th>
              <th>Discount</th>
              <th>Campaign</th>
              <th>Goal</th>
              <th>Submitted</th>
              <th>Confirmed</th>
              <th>Cooldown Until</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedSales.length === 0 ? (
              <tr>
                <td colSpan={13} className={styles.emptyRow}>
                  No sales scheduled. Click "+ Add Sale" to create one.
                </td>
              </tr>
            ) : (
              sortedSales.map(sale => {
                const platform = platforms.find(p => p.id === sale.platform_id)
                const days = calculateDays(sale.start_date, sale.end_date)
                const cooldownUntil = calculateCooldownUntil(sale.end_date, sale.platform_id)
                
                return (
                  <tr 
                    key={sale.id} 
                    onClick={(e) => handleRowClick(sale, e)}
                    className={styles.clickableRow}
                    title="Click to edit"
                  >
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
                    <td className={styles.checkCell}>
                      {sale.is_campaign && <span className={styles.checkMark}>✓</span>}
                    </td>
                    <td>
                      {sale.goal_type && (
                        <span className={`${styles.goalBadge} ${styles[sale.goal_type]}`}>
                          {sale.goal_type}
                        </span>
                      )}
                    </td>
                    <td className={styles.checkCell}>
                      {sale.is_submitted && <span className={styles.checkMark}>✓</span>}
                    </td>
                    <td className={styles.checkCell}>
                      {sale.is_confirmed && <span className={styles.checkMarkGreen}>✓</span>}
                    </td>
                    <td>{cooldownUntil}</td>
                    <td className={styles.actionCell}>
                      <button 
                        className={styles.editBtn}
                        onClick={(e) => {
                          e.stopPropagation()
                          onEdit(sale)
                        }}
                        title="Edit sale"
                      >
                        ✏️
                      </button>
                      <button 
                        className={styles.deleteBtn}
                        onClick={(e) => {
                          e.stopPropagation()
                          onDelete(sale.id)
                        }}
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
