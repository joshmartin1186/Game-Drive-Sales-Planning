'use client'

import { useEffect, useState } from 'react'
import styles from './UndoRedoIndicator.module.css'

interface UndoRedoIndicatorProps {
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
}

export default function UndoRedoIndicator({
  canUndo,
  canRedo,
  onUndo,
  onRedo
}: UndoRedoIndicatorProps) {
  const [showToast, setShowToast] = useState<string | null>(null)
  
  // Show toast notification for keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
          if (canRedo) setShowToast('Redo')
        } else {
          if (canUndo) setShowToast('Undo')
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        if (canRedo) setShowToast('Redo')
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [canUndo, canRedo])
  
  // Auto-hide toast
  useEffect(() => {
    if (showToast) {
      const timer = setTimeout(() => setShowToast(null), 1500)
      return () => clearTimeout(timer)
    }
  }, [showToast])
  
  return (
    <>
      {/* Floating indicator bar */}
      <div className={styles.indicator}>
        <button
          className={`${styles.button} ${!canUndo ? styles.disabled : ''}`}
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
        >
          <span className={styles.icon}>↩️</span>
          <span className={styles.label}>Undo</span>
          <span className={styles.shortcut}>⌘Z</span>
        </button>
        
        <div className={styles.divider} />
        
        <button
          className={`${styles.button} ${!canRedo ? styles.disabled : ''}`}
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo (Ctrl+Shift+Z)"
        >
          <span className={styles.icon}>↪️</span>
          <span className={styles.label}>Redo</span>
          <span className={styles.shortcut}>⌘⇧Z</span>
        </button>
      </div>
      
      {/* Toast notification */}
      {showToast && (
        <div className={styles.toast}>
          {showToast === 'Undo' ? '↩️' : '↪️'} {showToast}
        </div>
      )}
    </>
  )
}
