'use client'

import { useState, useMemo } from 'react'
import styles from './ClearSalesModal.module.css'
import { Platform, SaleWithDetails } from '@/lib/types'

interface ClearSalesModalProps {
  isOpen: boolean
  onClose: () => void
  productId: string
  productName: string
  platforms: Platform[]
  sales: SaleWithDetails[]
  onConfirm: (productId: string, platformId: string | null) => void
}

export default function ClearSalesModal({
  isOpen,
  onClose,
  productId,
  productName,
  platforms,
  sales,
  onConfirm
}: ClearSalesModalProps) {
  const [selectedPlatform, setSelectedPlatform] = useState<string | 'all'>('all')
  
  // Get sales for this product
  const productSales = useMemo(() => {
    return sales.filter(s => s.product_id === productId)
  }, [sales, productId])
  
  // Group sales by platform
  const salesByPlatform = useMemo(() => {
    const groups: { [platformId: string]: SaleWithDetails[] } = {}
    for (const sale of productSales) {
      if (!groups[sale.platform_id]) {
        groups[sale.platform_id] = []
      }
      groups[sale.platform_id].push(sale)
    }
    return groups
  }, [productSales])
  
  // Get platforms that have sales
  const platformsWithSales = useMemo(() => {
    return platforms.filter(p => salesByPlatform[p.id]?.length > 0)
  }, [platforms, salesByPlatform])
  
  const selectedCount = selectedPlatform === 'all' 
    ? productSales.length 
    : (salesByPlatform[selectedPlatform]?.length || 0)
  
  if (!isOpen) return null
  
  const handleConfirm = () => {
    onConfirm(productId, selectedPlatform === 'all' ? null : selectedPlatform)
  }
  
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>🗑️ Clear Sales</h2>
          <p className={styles.subtitle}>for <strong>{productName}</strong></p>
          <button className={styles.closeButton} onClick={onClose}>×</button>
        </div>
        
        {productSales.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No sales to clear for this product.</p>
            <button className={styles.cancelButton} onClick={onClose}>Close</button>
          </div>
        ) : (
          <>
            <div className={styles.content}>
              <p className={styles.warning}>
                ⚠️ This action will delete sales and cannot be undone directly.
                Use <kbd>Ctrl+Z</kbd> to undo after clearing.
              </p>
              
              <div className={styles.optionGroup}>
                <label className={styles.optionLabel}>Clear sales from:</label>
                
                <div className={styles.options}>
                  <label 
                    className={`${styles.option} ${selectedPlatform === 'all' ? styles.selected : ''}`}
                  >
                    <input
                      type="radio"
                      name="platform"
                      value="all"
                      checked={selectedPlatform === 'all'}
                      onChange={() => setSelectedPlatform('all')}
                    />
                    <span className={styles.optionContent}>
                      <span className={styles.optionTitle}>🌐 All Platforms</span>
                      <span className={styles.optionCount}>{productSales.length} sales</span>
                    </span>
                  </label>
                  
                  {platformsWithSales.map(platform => (
                    <label 
                      key={platform.id}
                      className={`${styles.option} ${selectedPlatform === platform.id ? styles.selected : ''}`}
                    >
                      <input
                        type="radio"
                        name="platform"
                        value={platform.id}
                        checked={selectedPlatform === platform.id}
                        onChange={() => setSelectedPlatform(platform.id)}
                      />
                      <span className={styles.optionContent}>
                        <span 
                          className={styles.platformDot}
                          style={{ backgroundColor: platform.color_hex }}
                        />
                        <span className={styles.optionTitle}>{platform.name}</span>
                        <span className={styles.optionCount}>
                          {salesByPlatform[platform.id]?.length || 0} sales
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            
            <div className={styles.footer}>
              <button className={styles.cancelButton} onClick={onClose}>
                Cancel
              </button>
              <button 
                className={styles.deleteButton} 
                onClick={handleConfirm}
                disabled={selectedCount === 0}
              >
                Delete {selectedCount} Sale{selectedCount !== 1 ? 's' : ''}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
