'use client'

import { useMemo } from 'react'
import { ChartConfig, FIELD_LABELS } from '@/lib/chart-types'
import styles from './ChartRenderer.module.css'

interface PerformanceData {
  id: string
  client_id: string
  date: string
  product_name: string
  platform: string
  region: string | null
  country: string | null
  country_code: string | null
  net_steam_sales_usd: number | string
  net_units_sold: number | string
  gross_units_sold: number | string
  gross_steam_sales_usd: number | string
  base_price_usd: number | string | null
  sale_price_usd: number | string | null
}

interface ChartRendererProps {
  config: ChartConfig
  data: PerformanceData[]
  onEdit?: () => void
  onDelete?: () => void
}

// Safe number conversion (matching analytics page pattern)
function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0
  if (typeof value === 'number') return isNaN(value) ? 0 : value
  const parsed = parseFloat(String(value).replace(/[$,]/g, ''))
  return isNaN(parsed) ? 0 : parsed
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

export default function ChartRenderer({ config, data, onEdit, onDelete }: ChartRendererProps) {
  // Process data based on chart configuration
  const processedData = useMemo(() => {
    if (!data || data.length === 0) return []

    // Apply chart-specific filters
    let filteredData = data

    if (config.filters.product_name) {
      filteredData = filteredData.filter(row => row.product_name === config.filters.product_name)
    }
    if (config.filters.region) {
      filteredData = filteredData.filter(row => row.region === config.filters.region)
    }
    if (config.filters.platform) {
      filteredData = filteredData.filter(row => row.platform === config.filters.platform)
    }

    // Group and aggregate data based on xAxis
    if (config.type === 'metric_card') {
      // Single aggregated value
      const value = filteredData.reduce((sum, row) => {
        const fieldValue = config.yAxis ? row[config.yAxis] : 0
        return sum + toNumber(fieldValue)
      }, 0)

      return [{ value, label: config.title }]
    }

    if (!config.xAxis) return []

    // Group by xAxis field
    const grouped = new Map<string, number[]>()

    filteredData.forEach(row => {
      const xValue = String(row[config.xAxis!] || 'Unknown')
      const yValue = config.yAxis ? toNumber(row[config.yAxis]) : 1

      if (!grouped.has(xValue)) {
        grouped.set(xValue, [])
      }
      grouped.get(xValue)!.push(yValue)
    })

    // Apply aggregation
    const result = Array.from(grouped.entries()).map(([label, values]) => {
      let value = 0
      switch (config.aggregation) {
        case 'sum':
          value = values.reduce((a, b) => a + b, 0)
          break
        case 'avg':
          value = values.reduce((a, b) => a + b, 0) / values.length
          break
        case 'count':
          value = values.length
          break
        case 'max':
          value = Math.max(...values)
          break
        case 'min':
          value = Math.min(...values)
          break
      }
      return { label, value }
    })

    // Sort by value descending for most chart types
    if (config.type !== 'line') {
      result.sort((a, b) => b.value - a.value)
    } else {
      // For line charts, sort by label (usually date)
      result.sort((a, b) => a.label.localeCompare(b.label))
    }

    return result
  }, [data, config])

  // Render different chart types
  const renderChart = () => {
    if (processedData.length === 0) {
      return <div className={styles.emptyState}>No data available</div>
    }

    switch (config.type) {
      case 'metric_card':
        return renderMetricCard()
      case 'bar':
        return renderBarChart()
      case 'line':
        return renderLineChart()
      case 'pie':
        return renderPieChart()
      case 'table':
        return renderTable()
      default:
        return <div className={styles.emptyState}>Chart type not supported</div>
    }
  }

  const renderMetricCard = () => {
    const { value } = processedData[0]
    const isMonetary = config.yAxis?.includes('usd')
    const displayValue = isMonetary ? formatCurrency(value) : formatNumber(value)

    return (
      <div className={styles.metricCard}>
        <div className={styles.metricValue}>{displayValue}</div>
        <div className={styles.metricLabel}>
          {config.yAxis ? FIELD_LABELS[config.yAxis] : config.title}
        </div>
      </div>
    )
  }

  const renderBarChart = () => {
    const maxValue = Math.max(...processedData.map(d => d.value))
    const isMonetary = config.yAxis?.includes('usd')

    return (
      <div className={styles.barChart}>
        {processedData.slice(0, 15).map((item, index) => (
          <div key={index} className={styles.barColumn}>
            <div className={styles.barWrapper}>
              <div
                className={styles.bar}
                style={{
                  height: `${(item.value / maxValue) * 100}%`,
                  backgroundColor: config.style?.color || '#3b82f6',
                }}
                title={`${item.label}: ${isMonetary ? formatCurrency(item.value) : formatNumber(item.value)}`}
              />
            </div>
            <span className={styles.barLabel} title={item.label}>
              {item.label.length > 8 ? item.label.substring(0, 8) + '...' : item.label}
            </span>
            <span className={styles.barValue}>
              {isMonetary ? formatCurrency(item.value) : formatNumber(item.value)}
            </span>
          </div>
        ))}
      </div>
    )
  }

  const renderLineChart = () => {
    const maxValue = Math.max(...processedData.map(d => d.value))
    const minValue = Math.min(...processedData.map(d => d.value))
    const range = maxValue - minValue

    // Calculate points for SVG path
    const width = 100
    const height = 100
    const padding = 10

    const points = processedData.map((item, index) => {
      const x = padding + (index / (processedData.length - 1)) * (width - 2 * padding)
      const y = height - padding - ((item.value - minValue) / range) * (height - 2 * padding)
      return `${x},${y}`
    })

    return (
      <div className={styles.lineChart}>
        <svg viewBox={`0 0 ${width} ${height}`} className={styles.lineSvg}>
          <polyline
            points={points.join(' ')}
            fill="none"
            stroke={config.style?.color || '#3b82f6'}
            strokeWidth="2"
          />
          {processedData.map((item, index) => {
            const x = padding + (index / (processedData.length - 1)) * (width - 2 * padding)
            const y = height - padding - ((item.value - minValue) / range) * (height - 2 * padding)
            return (
              <circle
                key={index}
                cx={x}
                cy={y}
                r="2"
                fill={config.style?.color || '#3b82f6'}
              />
            )
          })}
        </svg>
      </div>
    )
  }

  const renderPieChart = () => {
    const total = processedData.reduce((sum, item) => sum + item.value, 0)
    let currentAngle = 0

    return (
      <div className={styles.pieChart}>
        <svg viewBox="0 0 100 100" className={styles.pieSvg}>
          {processedData.slice(0, 8).map((item, index) => {
            const percentage = item.value / total
            const angle = percentage * 360
            const startAngle = currentAngle
            const endAngle = currentAngle + angle

            // Calculate arc path
            const startX = 50 + 40 * Math.cos((startAngle - 90) * (Math.PI / 180))
            const startY = 50 + 40 * Math.sin((startAngle - 90) * (Math.PI / 180))
            const endX = 50 + 40 * Math.cos((endAngle - 90) * (Math.PI / 180))
            const endY = 50 + 40 * Math.sin((endAngle - 90) * (Math.PI / 180))
            const largeArc = angle > 180 ? 1 : 0

            currentAngle += angle

            const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16']
            const color = colors[index % colors.length]

            return (
              <path
                key={index}
                d={`M 50 50 L ${startX} ${startY} A 40 40 0 ${largeArc} 1 ${endX} ${endY} Z`}
                fill={color}
              >
                <title>{`${item.label}: ${(percentage * 100).toFixed(1)}%`}</title>
              </path>
            )
          })}
        </svg>
        <div className={styles.pieLegend}>
          {processedData.slice(0, 8).map((item, index) => {
            const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16']
            const color = colors[index % colors.length]
            const percentage = (item.value / total) * 100

            return (
              <div key={index} className={styles.legendItem}>
                <div className={styles.legendColor} style={{ backgroundColor: color }} />
                <span className={styles.legendLabel}>{item.label}</span>
                <span className={styles.legendValue}>{percentage.toFixed(1)}%</span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const renderTable = () => {
    const isMonetary = config.yAxis?.includes('usd')

    return (
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{config.xAxis ? FIELD_LABELS[config.xAxis] : 'Category'}</th>
              <th>{config.yAxis ? FIELD_LABELS[config.yAxis] : 'Value'}</th>
            </tr>
          </thead>
          <tbody>
            {processedData.map((item, index) => (
              <tr key={index}>
                <td>{item.label}</td>
                <td>{isMonetary ? formatCurrency(item.value) : formatNumber(item.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className={styles.chartContainer} style={{ backgroundColor: config.style?.backgroundColor }}>
      <div className={styles.chartHeader}>
        <h3 className={styles.chartTitle}>{config.title}</h3>
        <div className={styles.chartActions}>
          {onEdit && (
            <button className={styles.actionButton} onClick={onEdit} title="Edit chart">
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          )}
          {onDelete && (
            <button className={styles.actionButton} onClick={onDelete} title="Delete chart">
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      </div>
      <div className={styles.chartBody}>{renderChart()}</div>
    </div>
  )
}
