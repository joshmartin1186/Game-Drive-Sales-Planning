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
    // Prepare data for Excel
    const excelData = sortedSales.map(sale => {
      const platform = platforms.find(p => p.id === sale.platform_id)
      return {
        'Start Date': format(parseISO(sale.start_date), 'dd/MM/yyyy'),
        'End Date': format(parseISO(sale.end_date), 'dd/MM/yyyy'),
        'Days': calculateDays(sale.start_date, sale.end_date),
        'Platform': platform?.name || '',
        'Cooldown (days)': platform?.cooldown_days || 0,
        'Sale Name': sale.sale_name || 'Custom',
        'Product': sale.product?.name || '',
        'Game': sale.product?.game?.name || '',
        'Client': sale.product?.game?.client?.name || '',
        'Discount %': sale.discount_percentage || '',
        'Status': sale.status || 'planned',
        'Goal': sale.goal_type || '',
        'Cooldown Until': calculateCooldownUntil(sale.end_date, sale.platform_id),
        'Notes': sale.notes || ''
      }
    })
    
    // Create workbook and worksheet
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(excelData)
    
    // Set column widths for better readability
    ws['!cols'] = [
      { wch: 12 }, // Start Date
      { wch: 12 }, // End Date
      { wch: 6 },  // Days
      { wch: 15 }, // Platform
      { wch: 12 }, // Cooldown
      { wch: 25 }, // Sale Name
      { wch: 25 }, // Product
      { wch: 20 }, // Game
      { wch: 15 }, // Client
      { wch: 10 }, // Discount
      { wch: 10 }, // Status
      { wch: 12 }, // Goal
      { wch: 14 }, // Cooldown Until
      { wch: 30 }, // Notes
    ]
    
    XLSX.utils.book_append_sheet(wb, ws, 'Sales Schedule')
    
    // Generate filename with date
    const filename = `sales_schedule_${format(new Date(), 'yyyy-MM-dd')}.xlsx`
    
    // Download file
    XLSX.writeFile(wb, filename)
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
                      <span className={`${styles.statusBadge} ${styles[sale.status || 'planned']}`}>
                        {sale.status || 'planned'}
                      </span>
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
