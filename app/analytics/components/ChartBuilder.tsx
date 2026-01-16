'use client'

import { useState, useCallback } from 'react'
import GridLayout from 'react-grid-layout'
import type { Layout, LayoutItem } from 'react-grid-layout'
import { ChartConfig, createChartConfig, CHART_TEMPLATES } from '@/lib/chart-types'
import ChartRenderer from './ChartRenderer'
import ChartConfigPanel from './ChartConfigPanel'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import './grid-layout-overrides.css'
import styles from './ChartBuilder.module.css'

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

interface ChartBuilderProps {
  performanceData: PerformanceData[]
  initialCharts?: ChartConfig[]
  onChartsChange?: (charts: ChartConfig[]) => void
}

export default function ChartBuilder({ performanceData, initialCharts = [], onChartsChange }: ChartBuilderProps) {
  const [charts, setCharts] = useState<ChartConfig[]>(initialCharts)
  const [editingChart, setEditingChart] = useState<ChartConfig | null>(null)
  const [showConfigPanel, setShowConfigPanel] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)

  // Convert charts to grid layout format
  const layout: LayoutItem[] = charts.map(chart => ({
    i: chart.id,
    x: chart.position.x,
    y: chart.position.y,
    w: chart.position.w,
    h: chart.position.h,
    minW: 2,
    minH: 2,
  }))

  const handleLayoutChange = useCallback((newLayout: Layout) => {
    setCharts(prevCharts => {
      const updatedCharts = prevCharts.map(chart => {
        const layoutItem = newLayout.find(l => l.i === chart.id)
        if (layoutItem) {
          return {
            ...chart,
            position: {
              x: layoutItem.x,
              y: layoutItem.y,
              w: layoutItem.w,
              h: layoutItem.h,
            },
          }
        }
        return chart
      })
      onChartsChange?.(updatedCharts)
      return updatedCharts
    })
  }, [onChartsChange])

  const handleAddChart = (template: Partial<ChartConfig>) => {
    const maxY = charts.length > 0 ? Math.max(...charts.map(c => c.position.y + c.position.h)) : 0
    const newChart = createChartConfig(template, { y: maxY })
    const updatedCharts = [...charts, newChart]
    setCharts(updatedCharts)
    onChartsChange?.(updatedCharts)
    setShowTemplates(false)
  }

  const handleEditChart = (chartId: string) => {
    const chart = charts.find(c => c.id === chartId)
    if (chart) {
      setEditingChart(chart)
      setShowConfigPanel(true)
    }
  }

  const handleDeleteChart = (chartId: string) => {
    if (confirm('Are you sure you want to delete this chart?')) {
      const updatedCharts = charts.filter(c => c.id !== chartId)
      setCharts(updatedCharts)
      onChartsChange?.(updatedCharts)
    }
  }

  const handleSaveChart = (updatedChart: ChartConfig) => {
    setCharts(prevCharts => {
      const updatedCharts = prevCharts.map(chart =>
        chart.id === updatedChart.id ? updatedChart : chart
      )
      // If it's a new chart (not found in existing), add it
      if (!prevCharts.find(c => c.id === updatedChart.id)) {
        updatedCharts.push(updatedChart)
      }
      onChartsChange?.(updatedCharts)
      return updatedCharts
    })
    setEditingChart(null)
    setShowConfigPanel(false)
  }

  const handleCreateNewChart = () => {
    setEditingChart(null)
    setShowConfigPanel(true)
  }

  return (
    <div className={styles.builderContainer}>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <h2 className={styles.toolbarTitle}>Dashboard Builder</h2>
          <span className={styles.chartCount}>{charts.length} charts</span>
        </div>
        <div className={styles.toolbarRight}>
          <button
            className={styles.toolbarButton}
            onClick={() => setShowTemplates(!showTemplates)}
          >
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-3zM14 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1h-4a1 1 0 01-1-1v-3z" />
            </svg>
            Templates
          </button>
          <button
            className={styles.toolbarButtonPrimary}
            onClick={handleCreateNewChart}
          >
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Chart
          </button>
        </div>
      </div>

      {/* Templates Panel */}
      {showTemplates && (
        <div className={styles.templatesPanel}>
          <div className={styles.templatesPanelHeader}>
            <h3 className={styles.templatesPanelTitle}>Chart Templates</h3>
            <button
              className={styles.closeTemplatesButton}
              onClick={() => setShowTemplates(false)}
            >
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className={styles.templatesGrid}>
            {CHART_TEMPLATES.map((template, index) => (
              <button
                key={index}
                className={styles.templateCard}
                onClick={() => handleAddChart(template)}
              >
                <div className={styles.templateIcon}>
                  {template.type === 'metric_card' && '🔢'}
                  {template.type === 'bar' && '📊'}
                  {template.type === 'line' && '📈'}
                  {template.type === 'pie' && '🥧'}
                  {template.type === 'table' && '📋'}
                </div>
                <div className={styles.templateTitle}>{template.title}</div>
                <div className={styles.templateType}>
                  {template.type?.replace('_', ' ').toUpperCase()}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Grid Layout */}
      <div className={styles.gridContainer}>
        {charts.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>📊</div>
            <h3 className={styles.emptyTitle}>No charts yet</h3>
            <p className={styles.emptyDescription}>
              Get started by adding a chart from templates or creating a custom chart
            </p>
            <div className={styles.emptyActions}>
              <button
                className={styles.emptyButton}
                onClick={() => setShowTemplates(true)}
              >
                Browse Templates
              </button>
              <button
                className={styles.emptyButtonPrimary}
                onClick={handleCreateNewChart}
              >
                Create Custom Chart
              </button>
            </div>
          </div>
        ) : (
          <GridLayout
            className={styles.gridLayout}
            layout={layout}
            width={1200}
            gridConfig={{
              cols: 12,
              rowHeight: 60,
              maxRows: Infinity,
            }}
            dragConfig={{
              handle: `.${styles.dragHandle}`,
              enabled: true,
            }}
            resizeConfig={{
              enabled: true,
            }}
            onLayoutChange={handleLayoutChange}
          >
            {charts.map(chart => (
              <div key={chart.id} className={styles.gridItem}>
                <div className={styles.dragHandle} title="Drag to reposition">
                  <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                    <circle cx="4" cy="4" r="1.5" />
                    <circle cx="4" cy="8" r="1.5" />
                    <circle cx="4" cy="12" r="1.5" />
                    <circle cx="12" cy="4" r="1.5" />
                    <circle cx="12" cy="8" r="1.5" />
                    <circle cx="12" cy="12" r="1.5" />
                  </svg>
                </div>
                <ChartRenderer
                  config={chart}
                  data={performanceData}
                  onEdit={() => handleEditChart(chart.id)}
                  onDelete={() => handleDeleteChart(chart.id)}
                />
              </div>
            ))}
          </GridLayout>
        )}
      </div>

      {/* Config Panel */}
      {showConfigPanel && (
        <ChartConfigPanel
          config={editingChart}
          onSave={handleSaveChart}
          onClose={() => {
            setShowConfigPanel(false)
            setEditingChart(null)
          }}
        />
      )}
    </div>
  )
}
