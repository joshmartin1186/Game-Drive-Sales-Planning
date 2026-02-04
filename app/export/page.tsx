'use client'

import { useState, useEffect } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { Sidebar } from '../components/Sidebar'
import { useAuth } from '@/lib/auth-context'
import { format, differenceInDays, parseISO } from 'date-fns'
import * as XLSX from 'xlsx'

interface Sale {
  id: string
  start_date: string
  end_date: string
  discount_percentage: number | null
  sale_name: string | null
  status: string
  sale_type: string | null
  products: {
    id: string
    name: string
    launch_date: string | null
    games: {
      id: string
      name: string
      clients: {
        id: string
        name: string
      } | null
    } | null
  } | null
  platforms: {
    id: string
    name: string
    cooldown_days: number
    color_hex: string
  } | null
}

type ExportStructure = 'flat' | 'by-client' | 'by-game' | 'by-platform'

export default function ExportPage() {
  const supabase = createClientComponentClient()
  const { hasAccess, loading: authLoading } = useAuth()
  const canView = hasAccess('export', 'view')
  const [sales, setSales] = useState<Sale[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [exportFormat, setExportFormat] = useState<'csv' | 'xlsx'>('xlsx')
  const [dateFilter, setDateFilter] = useState('all')
  const [exportStructure, setExportStructure] = useState<ExportStructure>('flat')
  const [includeSummary, setIncludeSummary] = useState(true)
  const [isExporting, setIsExporting] = useState(false)

  useEffect(() => {
    fetchSales()
  }, [dateFilter])

  const fetchSales = async () => {
    setIsLoading(true)
    let query = supabase
      .from('sales')
      .select(`
        *,
        products (id, name, launch_date, games (id, name, clients (id, name))),
        platforms (id, name, cooldown_days, color_hex)
      `)
      .order('start_date', { ascending: false })

    if (dateFilter !== 'all') {
      const now = new Date()
      let startDate = new Date()
      
      switch (dateFilter) {
        case '30d':
          startDate.setDate(now.getDate() - 30)
          break
        case '90d':
          startDate.setDate(now.getDate() - 90)
          break
        case 'ytd':
          startDate = new Date(now.getFullYear(), 0, 1)
          break
        case 'upcoming':
          query = query.gte('start_date', now.toISOString().split('T')[0])
          break
      }
      
      if (dateFilter !== 'upcoming') {
        query = query.gte('start_date', startDate.toISOString().split('T')[0])
      }
    }

    const { data, error } = await query
    
    if (!error && data) {
      setSales(data)
    }
    setIsLoading(false)
  }

  const calculateCooldownEnd = (endDate: string, cooldownDays: number) => {
    const end = new Date(endDate)
    end.setDate(end.getDate() + cooldownDays)
    return end.toISOString().split('T')[0]
  }

  const calculateDuration = (startDate: string, endDate: string) => {
    const start = new Date(startDate)
    const end = new Date(endDate)
    return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
  }

  const buildExportData = () => {
    const headers = [
      'Client',
      'Game Name',
      'Product',
      'Platform',
      'Start Date',
      'End Date',
      'Duration (Days)',
      'Discount %',
      'Sale Name',
      'Sale Type',
      'Status',
      'Cooldown End'
    ]

    const rows = sales.map(sale => [
      sale.products?.games?.clients?.name || '',
      sale.products?.games?.name || '',
      sale.products?.name || '',
      sale.platforms?.name || '',
      sale.start_date,
      sale.end_date,
      calculateDuration(sale.start_date, sale.end_date),
      sale.discount_percentage || '',
      sale.sale_name || '',
      sale.sale_type || '',
      sale.status,
      sale.platforms ? calculateCooldownEnd(sale.end_date, sale.platforms.cooldown_days) : ''
    ])

    return { headers, rows }
  }

  // Build summary statistics
  const buildSummaryStats = () => {
    const totalSales = sales.length
    const totalDays = sales.reduce((acc, sale) => acc + calculateDuration(sale.start_date, sale.end_date), 0)
    const avgDiscount = sales.length > 0
      ? Math.round(sales.reduce((acc, sale) => acc + (sale.discount_percentage || 0), 0) / sales.length)
      : 0

    // Group by status
    const byStatus: Record<string, number> = {}
    sales.forEach(sale => {
      byStatus[sale.status] = (byStatus[sale.status] || 0) + 1
    })

    // Group by platform
    const byPlatform: Record<string, number> = {}
    sales.forEach(sale => {
      const platformName = sale.platforms?.name || 'Unknown'
      byPlatform[platformName] = (byPlatform[platformName] || 0) + 1
    })

    // Group by client
    const byClient: Record<string, number> = {}
    sales.forEach(sale => {
      const clientName = sale.products?.games?.clients?.name || 'Unknown'
      byClient[clientName] = (byClient[clientName] || 0) + 1
    })

    return {
      totalSales,
      totalDays,
      avgDiscount,
      byStatus,
      byPlatform,
      byClient
    }
  }

  // Build structured export for multi-sheet Excel
  const buildStructuredExport = (wb: XLSX.WorkBook) => {
    const stats = buildSummaryStats()

    // Summary sheet
    if (includeSummary) {
      const summaryData: (string | number)[][] = [
        ['Sales Export Summary'],
        [],
        ['Total Sales', stats.totalSales],
        ['Total Sale Days', stats.totalDays],
        ['Average Discount', `${stats.avgDiscount}%`],
        [],
        ['By Status'],
        ...Object.entries(stats.byStatus).map(([status, count]) => [`  ${status}`, count]),
        [],
        ['By Platform'],
        ...Object.entries(stats.byPlatform).sort((a, b) => b[1] - a[1]).map(([platform, count]) => [`  ${platform}`, count]),
        [],
        ['By Client'],
        ...Object.entries(stats.byClient).sort((a, b) => b[1] - a[1]).map(([client, count]) => [`  ${client}`, count]),
        [],
        [`Generated: ${format(new Date(), 'MMMM d, yyyy HH:mm')}`]
      ]
      const summaryWs = XLSX.utils.aoa_to_sheet(summaryData)
      summaryWs['!cols'] = [{ wch: 25 }, { wch: 15 }]
      XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary')
    }

    if (exportStructure === 'flat') {
      // Single flat sheet with all data
      const { headers, rows } = buildExportData()
      const wsData = [headers, ...rows]
      const ws = XLSX.utils.aoa_to_sheet(wsData)
      ws['!cols'] = [
        { wch: 18 }, // Client
        { wch: 20 }, // Game
        { wch: 20 }, // Product
        { wch: 14 }, // Platform
        { wch: 12 }, // Start
        { wch: 12 }, // End
        { wch: 8 },  // Duration
        { wch: 10 }, // Discount
        { wch: 25 }, // Sale Name
        { wch: 12 }, // Sale Type
        { wch: 12 }, // Status
        { wch: 14 }, // Cooldown End
      ]
      XLSX.utils.book_append_sheet(wb, ws, 'All Sales')

    } else if (exportStructure === 'by-client') {
      // Group sales by client, each client gets a sheet
      const clientGroups: Record<string, Sale[]> = {}
      sales.forEach(sale => {
        const clientName = sale.products?.games?.clients?.name || 'No Client'
        if (!clientGroups[clientName]) clientGroups[clientName] = []
        clientGroups[clientName].push(sale)
      })

      Object.entries(clientGroups).forEach(([clientName, clientSales]) => {
        const headers = ['Game', 'Product', 'Platform', 'Start Date', 'End Date', 'Duration', 'Discount %', 'Sale Name', 'Status']
        const rows = clientSales.map(sale => [
          sale.products?.games?.name || '',
          sale.products?.name || '',
          sale.platforms?.name || '',
          sale.start_date,
          sale.end_date,
          calculateDuration(sale.start_date, sale.end_date),
          sale.discount_percentage || '',
          sale.sale_name || '',
          sale.status
        ])
        const wsData = [
          [`Client: ${clientName}`],
          [`Total Sales: ${clientSales.length}`],
          [],
          headers,
          ...rows
        ]
        const ws = XLSX.utils.aoa_to_sheet(wsData)
        ws['!cols'] = [{ wch: 20 }, { wch: 20 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 10 }, { wch: 25 }, { wch: 12 }]
        // Truncate sheet name to 31 chars (Excel limit)
        const sheetName = clientName.substring(0, 31).replace(/[\\/\\?\\*\\[\\]]/g, '')
        XLSX.utils.book_append_sheet(wb, ws, sheetName)
      })

    } else if (exportStructure === 'by-game') {
      // Group sales by game, each game gets a sheet
      const gameGroups: Record<string, Sale[]> = {}
      sales.forEach(sale => {
        const gameName = sale.products?.games?.name || 'No Game'
        if (!gameGroups[gameName]) gameGroups[gameName] = []
        gameGroups[gameName].push(sale)
      })

      Object.entries(gameGroups).forEach(([gameName, gameSales]) => {
        const clientName = gameSales[0]?.products?.games?.clients?.name || ''
        const headers = ['Product', 'Platform', 'Start Date', 'End Date', 'Duration', 'Discount %', 'Sale Name', 'Status']
        const rows = gameSales.map(sale => [
          sale.products?.name || '',
          sale.platforms?.name || '',
          sale.start_date,
          sale.end_date,
          calculateDuration(sale.start_date, sale.end_date),
          sale.discount_percentage || '',
          sale.sale_name || '',
          sale.status
        ])
        const wsData = [
          [`Game: ${gameName}`],
          [`Client: ${clientName}`],
          [`Total Sales: ${gameSales.length}`],
          [],
          headers,
          ...rows
        ]
        const ws = XLSX.utils.aoa_to_sheet(wsData)
        ws['!cols'] = [{ wch: 20 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 10 }, { wch: 25 }, { wch: 12 }]
        const sheetName = gameName.substring(0, 31).replace(/[\\/\\?\\*\\[\\]]/g, '')
        XLSX.utils.book_append_sheet(wb, ws, sheetName)
      })

    } else if (exportStructure === 'by-platform') {
      // Group sales by platform, each platform gets a sheet
      const platformGroups: Record<string, Sale[]> = {}
      sales.forEach(sale => {
        const platformName = sale.platforms?.name || 'No Platform'
        if (!platformGroups[platformName]) platformGroups[platformName] = []
        platformGroups[platformName].push(sale)
      })

      Object.entries(platformGroups).forEach(([platformName, platformSales]) => {
        const headers = ['Client', 'Game', 'Product', 'Start Date', 'End Date', 'Duration', 'Discount %', 'Sale Name', 'Status']
        const rows = platformSales.map(sale => [
          sale.products?.games?.clients?.name || '',
          sale.products?.games?.name || '',
          sale.products?.name || '',
          sale.start_date,
          sale.end_date,
          calculateDuration(sale.start_date, sale.end_date),
          sale.discount_percentage || '',
          sale.sale_name || '',
          sale.status
        ])
        const wsData = [
          [`Platform: ${platformName}`],
          [`Total Sales: ${platformSales.length}`],
          [],
          headers,
          ...rows
        ]
        const ws = XLSX.utils.aoa_to_sheet(wsData)
        ws['!cols'] = [{ wch: 18 }, { wch: 20 }, { wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 10 }, { wch: 25 }, { wch: 12 }]
        const sheetName = platformName.substring(0, 31).replace(/[\\/\\?\\*\\[\\]]/g, '')
        XLSX.utils.book_append_sheet(wb, ws, sheetName)
      })
    }
  }

  const handleExport = async () => {
    setIsExporting(true)

    try {
      const { headers, rows } = buildExportData()
      const structureSuffix = exportStructure === 'flat' ? '' : `-by-${exportStructure.replace('by-', '')}`
      const filename = `gamedrive-sales-export${structureSuffix}-${format(new Date(), 'yyyy-MM-dd')}`

      if (exportFormat === 'xlsx') {
        // Create workbook with structured sheets
        const wb = XLSX.utils.book_new()
        buildStructuredExport(wb)
        XLSX.writeFile(wb, `${filename}.xlsx`)
      } else {
        // CSV export (flat only for CSV)
        const csvContent = [
          headers.join(','),
          ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n')

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `${filename}.csv`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
      }
    } catch (error) {
      console.error('Export error:', error)
    } finally {
      setIsExporting(false)
    }
  }

  if (authLoading || isLoading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
        <Sidebar />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p>Loading...</p>
        </div>
      </div>
    )
  }

  if (!canView) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
        <Sidebar />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1f2937' }}>Access Denied</h2>
          <p style={{ color: '#6b7280' }}>You don&apos;t have permission to view Excel Export.</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <Sidebar />

      <div style={{ flex: 1, padding: '32px' }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
          <div style={{ marginBottom: '32px' }}>
            <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#1e293b', margin: 0 }}>Excel Export</h1>
            <p style={{ fontSize: '14px', color: '#64748b', margin: '4px 0 0 0' }}>Download your sales data in spreadsheet format</p>
          </div>

          {/* Export Options */}
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '24px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            marginBottom: '24px'
          }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#1e293b', margin: '0 0 16px 0' }}>Export Options</h2>
            
            <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', marginBottom: '20px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>
                  Date Range
                </label>
                <select
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  style={{
                    padding: '10px 12px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    fontSize: '14px',
                    minWidth: '180px'
                  }}
                >
                  <option value="all">All Time</option>
                  <option value="30d">Last 30 Days</option>
                  <option value="90d">Last 90 Days</option>
                  <option value="ytd">Year to Date</option>
                  <option value="upcoming">Upcoming Only</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>
                  Format
                </label>
                <select
                  value={exportFormat}
                  onChange={(e) => setExportFormat(e.target.value as 'csv' | 'xlsx')}
                  style={{
                    padding: '10px 12px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    fontSize: '14px',
                    minWidth: '180px'
                  }}
                >
                  <option value="xlsx">Excel (.xlsx)</option>
                  <option value="csv">CSV (.csv)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>
                  Structure {exportFormat === 'csv' && <span style={{ color: '#9ca3af', fontWeight: 400 }}>(xlsx only)</span>}
                </label>
                <select
                  value={exportStructure}
                  onChange={(e) => setExportStructure(e.target.value as ExportStructure)}
                  disabled={exportFormat === 'csv'}
                  style={{
                    padding: '10px 12px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    fontSize: '14px',
                    minWidth: '180px',
                    backgroundColor: exportFormat === 'csv' ? '#f8fafc' : 'white'
                  }}
                >
                  <option value="flat">Flat (All Sales)</option>
                  <option value="by-client">By Client (sheets)</option>
                  <option value="by-game">By Game (sheets)</option>
                  <option value="by-platform">By Platform (sheets)</option>
                </select>
              </div>
            </div>

            {/* Additional Options */}
            {exportFormat === 'xlsx' && (
              <div style={{ display: 'flex', gap: '20px', marginBottom: '20px', paddingTop: '16px', borderTop: '1px solid #e2e8f0' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={includeSummary}
                    onChange={(e) => setIncludeSummary(e.target.checked)}
                    style={{ width: '16px', height: '16px', accentColor: '#2563eb' }}
                  />
                  <span style={{ fontSize: '14px', color: '#374151' }}>
                    Include Summary Sheet
                  </span>
                  <span style={{ fontSize: '12px', color: '#9ca3af' }}>
                    (stats, breakdowns by status/platform/client)
                  </span>
                </label>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button
                onClick={handleExport}
                disabled={isExporting || sales.length === 0}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 24px',
                  backgroundColor: sales.length === 0 ? '#94a3b8' : '#2563eb',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: sales.length === 0 ? 'not-allowed' : 'pointer'
                }}
              >
                <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                {isExporting ? 'Exporting...' : `Download ${exportFormat.toUpperCase()}`}
              </button>
            </div>
          </div>

          {/* Preview */}
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '24px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#1e293b', margin: 0 }}>Preview</h2>
              <span style={{ fontSize: '14px', color: '#64748b' }}>{sales.length} records</span>
            </div>

            {isLoading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>Loading sales data...</div>
            ) : sales.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '60px 20px',
                backgroundColor: '#f8fafc',
                borderRadius: '8px',
                border: '2px dashed #e2e8f0'
              }}>
                <svg width="48" height="48" fill="none" stroke="#cbd5e1" viewBox="0 0 24 24" style={{ margin: '0 auto 12px' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p style={{ fontSize: '14px', color: '#94a3b8', margin: 0 }}>No sales data found for the selected date range</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ textAlign: 'left', padding: '12px 8px', color: '#475569', fontWeight: 600 }}>Game</th>
                      <th style={{ textAlign: 'left', padding: '12px 8px', color: '#475569', fontWeight: 600 }}>Platform</th>
                      <th style={{ textAlign: 'left', padding: '12px 8px', color: '#475569', fontWeight: 600 }}>Dates</th>
                      <th style={{ textAlign: 'left', padding: '12px 8px', color: '#475569', fontWeight: 600 }}>Discount</th>
                      <th style={{ textAlign: 'left', padding: '12px 8px', color: '#475569', fontWeight: 600 }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sales.slice(0, 10).map(sale => (
                      <tr key={sale.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '12px 8px', color: '#334155' }}>
                          {sale.products?.games?.name || sale.products?.name || '-'}
                        </td>
                        <td style={{ padding: '12px 8px', color: '#334155' }}>
                          {sale.platforms?.name || '-'}
                        </td>
                        <td style={{ padding: '12px 8px', color: '#334155' }}>
                          {new Date(sale.start_date).toLocaleDateString()} - {new Date(sale.end_date).toLocaleDateString()}
                        </td>
                        <td style={{ padding: '12px 8px', color: '#334155' }}>
                          {sale.discount_percentage ? `${sale.discount_percentage}%` : '-'}
                        </td>
                        <td style={{ padding: '12px 8px' }}>
                          <span style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '12px',
                            fontWeight: 500,
                            backgroundColor: sale.status === 'confirmed' ? '#dcfce7' : sale.status === 'live' ? '#dbeafe' : '#f1f5f9',
                            color: sale.status === 'confirmed' ? '#166534' : sale.status === 'live' ? '#1d4ed8' : '#475569'
                          }}>
                            {sale.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {sales.length > 10 && (
                  <div style={{ textAlign: 'center', padding: '12px', color: '#64748b', fontSize: '13px' }}>
                    Showing 10 of {sales.length} records. Download to see all.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
