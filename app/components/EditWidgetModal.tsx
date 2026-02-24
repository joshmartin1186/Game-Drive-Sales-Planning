'use client'

import { useState } from 'react'
import type { DashboardWidget } from '@/app/analytics/types'
import styles from '@/app/analytics/page.module.css'

interface EditWidgetModalProps {
  widget: DashboardWidget
  onClose: () => void
  onSave: (widget: DashboardWidget) => void
  products: string[]
  clients: { id: string; name: string }[]
  regions: string[]
  platforms: string[]
}

export default function EditWidgetModal({ widget, onClose, onSave, products, clients, regions, platforms }: EditWidgetModalProps) {
  const [title, setTitle] = useState(widget.title)
  const [widgetType, setWidgetType] = useState(widget.type)
  const [chartType, setChartType] = useState(widget.config.chartType || (widget.type === 'pie' ? 'pie' : 'bar'))
  const [statKey, setStatKey] = useState(widget.config.statKey || 'totalRevenue')
  // Filter states
  const [filterProduct, setFilterProduct] = useState(widget.config.filterProduct || 'all')
  const [filterClient, setFilterClient] = useState(widget.config.filterClient || 'all')
  const [filterRegion, setFilterRegion] = useState(widget.config.filterRegion || 'all')
  const [filterPlatform, setFilterPlatform] = useState(widget.config.filterPlatform || 'all')

  // Display states
  const [showLegend, setShowLegend] = useState(widget.config.showLegend ?? true)
  const [showGrid, setShowGrid] = useState(widget.config.showGrid ?? true)
  const [colorScheme, setColorScheme] = useState(widget.config.colorScheme || 'blue')

  // Aggregation states
  const [aggregateBy, setAggregateBy] = useState(widget.config.aggregateBy || 'sum')
  const [groupBy, setGroupBy] = useState(widget.config.groupBy || 'day')

  const handleSave = () => {
    const updatedWidget: DashboardWidget = {
      ...widget,
      type: widgetType,
      title,
      config: {
        ...widget.config,
        ...(widgetType === 'stat' ? { statKey } : {}),
        ...(widgetType === 'chart' || widgetType === 'pie' ? { chartType } : {}),
        // Always save filter options
        filterProduct: filterProduct === 'all' ? undefined : filterProduct,
        filterClient: filterClient === 'all' ? undefined : filterClient,
        filterRegion: filterRegion === 'all' ? undefined : filterRegion,
        filterPlatform: filterPlatform === 'all' ? undefined : filterPlatform,
        // Display options
        showLegend,
        showGrid,
        colorScheme,
        // Aggregation options
        aggregateBy,
        groupBy
      }
    }
    onSave(updatedWidget)
  }

  const widgetTypeOptions = [
    { value: 'stat', label: 'Stat Card', description: 'Display a single metric' },
    { value: 'chart', label: 'Chart', description: 'Revenue or units over time' },
    { value: 'pie', label: 'Pie Chart', description: 'Revenue breakdown by product' },
    { value: 'region', label: 'Region Breakdown', description: 'Revenue by geographic region' },
    { value: 'countries', label: 'Top Countries', description: 'Revenue by country' },
    { value: 'world-map', label: 'World Map', description: 'Geographic revenue heatmap' },
    { value: 'table', label: 'Period Table', description: 'Compare sale vs regular periods' },
    { value: 'sale-comparison', label: 'Sale Performance', description: 'Sale vs regular analysis' },
    { value: 'heatmap', label: 'Heatmap', description: 'Activity heatmap visualization' }
  ]

  const statOptions = [
    { value: 'totalRevenue', label: 'Total Revenue' },
    { value: 'totalUnits', label: 'Total Units' },
    { value: 'avgDailyRevenue', label: 'Average Daily Revenue' },
    { value: 'avgDailyUnits', label: 'Average Daily Units' },
    { value: 'refundRate', label: 'Refund Rate' }
  ]

  const chartTypeOptions = [
    { value: 'bar', label: 'Bar Chart' },
    { value: 'line', label: 'Line Chart' },
    { value: 'pie', label: 'Pie Chart' },
    { value: 'area', label: 'Area Chart' },
    { value: 'donut', label: 'Donut Chart' },
    { value: 'horizontal-bar', label: 'Horizontal Bar' },
    { value: 'stacked-bar', label: 'Stacked Bar' }
  ]

  const colorSchemeOptions = [
    { value: 'blue', label: 'Blue' },
    { value: 'green', label: 'Green' },
    { value: 'purple', label: 'Purple' },
    { value: 'multi', label: 'Multi-Color' }
  ]

  const aggregateByOptions = [
    { value: 'sum', label: 'Sum' },
    { value: 'avg', label: 'Average' },
    { value: 'min', label: 'Minimum' },
    { value: 'max', label: 'Maximum' }
  ]

  const groupByOptions = [
    { value: 'day', label: 'Daily' },
    { value: 'week', label: 'Weekly' },
    { value: 'month', label: 'Monthly' },
    { value: 'quarter', label: 'Quarterly' },
    { value: 'year', label: 'Yearly' }
  ]

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Edit Widget</h2>
          <button className={styles.modalClose} onClick={onClose}>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className={styles.modalContent}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Widget Title</label>
            <input
              type="text"
              className={styles.formInput}
              placeholder="Enter widget title..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {widgetType === 'stat' && (
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Metric</label>
              <select
                className={styles.formInput}
                value={statKey}
                onChange={(e) => setStatKey(e.target.value)}
              >
                {statOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          )}

          {(widgetType === 'chart' || widgetType === 'pie') && (
            <>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Chart Type</label>
                <select
                  className={styles.formInput}
                  value={chartType}
                  onChange={(e) => setChartType(e.target.value as 'bar' | 'line' | 'pie')}
                >
                  {chartTypeOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

            </>
          )}

          {/* Filters Section */}
          <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', marginBottom: '12px' }}>
              Data Filters
            </h3>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Filter by Product</label>
              <select
                className={styles.formInput}
                value={filterProduct}
                onChange={(e) => setFilterProduct(e.target.value)}
              >
                <option value="all">All Products</option>
                {products.map(product => (
                  <option key={product} value={product}>{product}</option>
                ))}
              </select>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Filter by Client</label>
              <select
                className={styles.formInput}
                value={filterClient}
                onChange={(e) => setFilterClient(e.target.value)}
              >
                <option value="all">All Clients</option>
                {clients.map(client => (
                  <option key={client.id} value={client.id}>{client.name}</option>
                ))}
              </select>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Filter by Region</label>
              <select
                className={styles.formInput}
                value={filterRegion}
                onChange={(e) => setFilterRegion(e.target.value)}
              >
                <option value="all">All Regions</option>
                {regions.map(region => (
                  <option key={region} value={region}>{region}</option>
                ))}
              </select>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Filter by Platform</label>
              <select
                className={styles.formInput}
                value={filterPlatform}
                onChange={(e) => setFilterPlatform(e.target.value)}
              >
                <option value="all">All Platforms</option>
                {platforms.map(platform => (
                  <option key={platform} value={platform}>{platform}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Display Options Section */}
          {(widgetType === 'chart' || widgetType === 'pie') && (
            <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid #e2e8f0' }}>
              <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', marginBottom: '12px' }}>
                Display Options
              </h3>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Color Scheme</label>
                <select
                  className={styles.formInput}
                  value={colorScheme}
                  onChange={(e) => setColorScheme(e.target.value as any)}
                >
                  {colorSchemeOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div className={styles.formGroup}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={showLegend}
                    onChange={(e) => setShowLegend(e.target.checked)}
                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                  />
                  <span className={styles.formLabel} style={{ marginBottom: 0 }}>Show Legend</span>
                </label>
              </div>

              <div className={styles.formGroup}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={showGrid}
                    onChange={(e) => setShowGrid(e.target.checked)}
                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                  />
                  <span className={styles.formLabel} style={{ marginBottom: 0 }}>Show Grid Lines</span>
                </label>
              </div>
            </div>
          )}

          {/* Aggregation Options Section */}
          {(widgetType === 'chart' || widgetType === 'stat') && (
            <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid #e2e8f0' }}>
              <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', marginBottom: '12px' }}>
                Aggregation Options
              </h3>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Aggregate By</label>
                <select
                  className={styles.formInput}
                  value={aggregateBy}
                  onChange={(e) => setAggregateBy(e.target.value as any)}
                >
                  {aggregateByOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Group By</label>
                <select
                  className={styles.formInput}
                  value={groupBy}
                  onChange={(e) => setGroupBy(e.target.value as any)}
                >
                  {groupByOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className={styles.formGroup} style={{ marginTop: '24px' }}>
            <label className={styles.formLabel}>Widget Type</label>
            <select
              className={styles.formInput}
              value={widgetType}
              onChange={(e) => setWidgetType(e.target.value as any)}
            >
              {widgetTypeOptions.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label} - {opt.description}
                </option>
              ))}
            </select>
            <p style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
              Change the widget type to convert between different visualizations
            </p>
          </div>
        </div>

        <div className={styles.modalFooter}>
          <button className={styles.cancelButton} onClick={onClose}>Cancel</button>
          <button className={styles.importSubmitButton} onClick={handleSave}>
            Save Changes
          </button>
        </div>
      </div>
    </div>
  )
}
