'use client'

import { useState } from 'react'
import type { DashboardWidget } from '@/app/analytics/types'
import styles from '@/app/analytics/page.module.css'

interface AddWidgetModalProps {
  onClose: () => void
  onAdd: (type: DashboardWidget['type'], title: string) => void
}

export default function AddWidgetModal({ onClose, onAdd }: AddWidgetModalProps) {
  const [selectedType, setSelectedType] = useState<DashboardWidget['type']>('stat')
  const [title, setTitle] = useState('')

  const widgetTypes = [
    { type: 'stat' as const, name: 'Stat Card', description: 'Display a single metric', icon: 'M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z' },
    { type: 'chart' as const, name: 'Chart', description: 'Revenue or units over time', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
    { type: 'pie' as const, name: 'Pie Chart', description: 'Revenue breakdown by product', icon: 'M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z' },
    { type: 'region' as const, name: 'Region Breakdown', description: 'Revenue by geographic region', icon: 'M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
    { type: 'countries' as const, name: 'Top Countries', description: 'Revenue by top countries', icon: 'M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9' },
    { type: 'world-map' as const, name: 'World Map', description: 'Geographic revenue heatmap', icon: 'M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
    { type: 'table' as const, name: 'Period Table', description: 'Compare sale vs regular periods', icon: 'M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z' },
    { type: 'sale-comparison' as const, name: 'Sale Performance', description: 'Sale vs regular analysis', icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6' },
    { type: 'heatmap' as const, name: 'Heatmap', description: 'Activity heatmap visualization', icon: 'M4 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-3zM14 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1h-4a1 1 0 01-1-1v-3z' },
  ]

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Add Widget</h2>
          <button className={styles.modalClose} onClick={onClose}>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className={styles.modalContent}>
          <div className={styles.widgetTypeGrid}>
            {widgetTypes.map(wt => (
              <button
                key={wt.type}
                className={`${styles.widgetTypeCard} ${selectedType === wt.type ? styles.widgetTypeSelected : ''}`}
                onClick={() => setSelectedType(wt.type)}
              >
                <svg className={styles.widgetTypeIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={wt.icon} />
                </svg>
                <span className={styles.widgetTypeName}>{wt.name}</span>
                <span className={styles.widgetTypeDesc}>{wt.description}</span>
              </button>
            ))}
          </div>

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
        </div>

        <div className={styles.modalFooter}>
          <button className={styles.cancelButton} onClick={onClose}>Cancel</button>
          <button
            className={styles.importSubmitButton}
            onClick={() => onAdd(selectedType, title || widgetTypes.find(w => w.type === selectedType)?.name || 'Widget')}
          >
            Add Widget
          </button>
        </div>
      </div>
    </div>
  )
}
