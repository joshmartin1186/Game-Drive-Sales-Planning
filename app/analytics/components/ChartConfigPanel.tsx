'use client'

import { useState } from 'react'
import { ChartConfig, ChartType, AxisField, AggregationType, FIELD_LABELS, AGGREGATION_LABELS } from '@/lib/chart-types'
import styles from './ChartConfigPanel.module.css'

interface ChartConfigPanelProps {
  config: ChartConfig | null
  onSave: (config: ChartConfig) => void
  onClose: () => void
}

const CHART_TYPES: { value: ChartType; label: string; icon: string }[] = [
  { value: 'metric_card', label: 'Metric Card', icon: '🔢' },
  { value: 'bar', label: 'Bar Chart', icon: '📊' },
  { value: 'line', label: 'Line Chart', icon: '📈' },
  { value: 'pie', label: 'Pie Chart', icon: '🥧' },
  { value: 'table', label: 'Table', icon: '📋' },
]

const NUMERIC_FIELDS: AxisField[] = [
  'net_steam_sales_usd',
  'net_units_sold',
  'gross_units_sold',
  'gross_steam_sales_usd',
  'base_price_usd',
  'sale_price_usd',
]

const DIMENSION_FIELDS: AxisField[] = [
  'date',
  'region',
  'product_name',
  'platform',
  'country',
  'country_code',
]

export default function ChartConfigPanel({ config, onSave, onClose }: ChartConfigPanelProps) {
  const [editedConfig, setEditedConfig] = useState<ChartConfig>(
    config || {
      id: `chart_${Date.now()}`,
      type: 'bar',
      title: 'New Chart',
      dataSource: 'steam_performance_data',
      aggregation: 'sum',
      filters: {},
      position: { x: 0, y: 0, w: 4, h: 4 },
    }
  )

  const handleSave = () => {
    onSave(editedConfig)
    onClose()
  }

  const updateConfig = <K extends keyof ChartConfig>(key: K, value: ChartConfig[K]) => {
    setEditedConfig(prev => ({ ...prev, [key]: value }))
  }

  const updateStyle = (key: string, value: string) => {
    setEditedConfig(prev => ({
      ...prev,
      style: { ...prev.style, [key]: value },
    }))
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <div className={styles.header}>
          <h2 className={styles.title}>
            {config ? 'Edit Chart' : 'Create Chart'}
          </h2>
          <button className={styles.closeButton} onClick={onClose}>
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className={styles.body}>
          {/* Chart Type Selection */}
          <div className={styles.section}>
            <label className={styles.label}>Chart Type</label>
            <div className={styles.chartTypeGrid}>
              {CHART_TYPES.map(type => (
                <button
                  key={type.value}
                  className={`${styles.chartTypeButton} ${editedConfig.type === type.value ? styles.chartTypeActive : ''}`}
                  onClick={() => updateConfig('type', type.value)}
                >
                  <span className={styles.chartTypeIcon}>{type.icon}</span>
                  <span className={styles.chartTypeLabel}>{type.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Chart Title */}
          <div className={styles.section}>
            <label className={styles.label}>Chart Title</label>
            <input
              type="text"
              className={styles.input}
              value={editedConfig.title}
              onChange={(e) => updateConfig('title', e.target.value)}
              placeholder="Enter chart title"
            />
          </div>

          {/* Data Configuration */}
          {editedConfig.type !== 'metric_card' && (
            <div className={styles.section}>
              <label className={styles.label}>X-Axis (Category)</label>
              <select
                className={styles.select}
                value={editedConfig.xAxis || ''}
                onChange={(e) => updateConfig('xAxis', e.target.value as AxisField)}
              >
                <option value="">Select dimension</option>
                {DIMENSION_FIELDS.map(field => (
                  <option key={field} value={field}>
                    {FIELD_LABELS[field]}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className={styles.section}>
            <label className={styles.label}>
              {editedConfig.type === 'metric_card' ? 'Metric' : 'Y-Axis (Value)'}
            </label>
            <select
              className={styles.select}
              value={editedConfig.yAxis || ''}
              onChange={(e) => updateConfig('yAxis', e.target.value as AxisField)}
            >
              <option value="">Select metric</option>
              {NUMERIC_FIELDS.map(field => (
                <option key={field} value={field}>
                  {FIELD_LABELS[field]}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.section}>
            <label className={styles.label}>Aggregation</label>
            <select
              className={styles.select}
              value={editedConfig.aggregation}
              onChange={(e) => updateConfig('aggregation', e.target.value as AggregationType)}
            >
              {Object.entries(AGGREGATION_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {/* Chart Filters */}
          <div className={styles.section}>
            <label className={styles.label}>Chart Filters (Optional)</label>
            <div className={styles.filterGroup}>
              <input
                type="text"
                className={styles.input}
                placeholder="Product Name"
                value={editedConfig.filters.product_name || ''}
                onChange={(e) =>
                  updateConfig('filters', { ...editedConfig.filters, product_name: e.target.value || undefined })
                }
              />
              <input
                type="text"
                className={styles.input}
                placeholder="Region"
                value={editedConfig.filters.region || ''}
                onChange={(e) =>
                  updateConfig('filters', { ...editedConfig.filters, region: e.target.value || undefined })
                }
              />
              <input
                type="text"
                className={styles.input}
                placeholder="Platform"
                value={editedConfig.filters.platform || ''}
                onChange={(e) =>
                  updateConfig('filters', { ...editedConfig.filters, platform: e.target.value || undefined })
                }
              />
            </div>
          </div>

          {/* Chart Styling */}
          <div className={styles.section}>
            <label className={styles.label}>Chart Color</label>
            <div className={styles.colorPicker}>
              <input
                type="color"
                value={editedConfig.style?.color || '#3b82f6'}
                onChange={(e) => updateStyle('color', e.target.value)}
              />
              <span className={styles.colorValue}>{editedConfig.style?.color || '#3b82f6'}</span>
            </div>
          </div>
        </div>

        <div className={styles.footer}>
          <button className={styles.cancelButton} onClick={onClose}>
            Cancel
          </button>
          <button className={styles.saveButton} onClick={handleSave}>
            {config ? 'Save Changes' : 'Create Chart'}
          </button>
        </div>
      </div>
    </div>
  )
}
