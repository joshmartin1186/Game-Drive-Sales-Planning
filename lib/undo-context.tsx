'use client'

import { createContext, useContext, useCallback, useRef, useEffect, ReactNode } from 'react'

// Action types for undo/redo
export type UndoableAction = {
  type: 'CREATE_SALE'
  saleId: string
  saleData: Record<string, unknown>
} | {
  type: 'UPDATE_SALE'
  saleId: string
  previousData: Record<string, unknown>
  newData: Record<string, unknown>
} | {
  type: 'DELETE_SALE'
  saleId: string
  saleData: Record<string, unknown>
} | {
  type: 'BATCH_CREATE_SALES'
  sales: { id: string; data: Record<string, unknown> }[]
} | {
  type: 'BATCH_DELETE_SALES'
  sales: { id: string; data: Record<string, unknown> }[]
}

interface UndoContextType {
  canUndo: boolean
  canRedo: boolean
  undoStack: UndoableAction[]
  redoStack: UndoableAction[]
  pushAction: (action: UndoableAction) => void
  undo: () => Promise<void>
  redo: () => Promise<void>
  clearHistory: () => void
  setHandlers: (handlers: {
    onCreateSale: (data: Record<string, unknown>) => Promise<string>
    onUpdateSale: (id: string, data: Record<string, unknown>) => Promise<void>
    onDeleteSale: (id: string) => Promise<void>
    onRefresh: () => Promise<void>
  }) => void
}

const UndoContext = createContext<UndoContextType | null>(null)

export function UndoProvider({ children }: { children: ReactNode }) {
  const undoStackRef = useRef<UndoableAction[]>([])
  const redoStackRef = useRef<UndoableAction[]>([])
  const handlersRef = useRef<{
    onCreateSale: (data: Record<string, unknown>) => Promise<string>
    onUpdateSale: (id: string, data: Record<string, unknown>) => Promise<void>
    onDeleteSale: (id: string) => Promise<void>
    onRefresh: () => Promise<void>
  } | null>(null)
  
  // Force re-render when stacks change
  const forceUpdate = useCallback(() => {
    // Trigger state update by dispatching custom event
    window.dispatchEvent(new CustomEvent('undo-stack-change'))
  }, [])
  
  const pushAction = useCallback((action: UndoableAction) => {
    undoStackRef.current = [...undoStackRef.current, action]
    // Limit stack size to prevent memory issues
    if (undoStackRef.current.length > 50) {
      undoStackRef.current = undoStackRef.current.slice(-50)
    }
    // Clear redo stack when new action is performed
    redoStackRef.current = []
    forceUpdate()
  }, [forceUpdate])
  
  const undo = useCallback(async () => {
    if (undoStackRef.current.length === 0 || !handlersRef.current) return
    
    const action = undoStackRef.current[undoStackRef.current.length - 1]
    undoStackRef.current = undoStackRef.current.slice(0, -1)
    
    try {
      switch (action.type) {
        case 'CREATE_SALE':
          // Undo create = delete
          await handlersRef.current.onDeleteSale(action.saleId)
          break
          
        case 'UPDATE_SALE':
          // Undo update = restore previous data
          await handlersRef.current.onUpdateSale(action.saleId, action.previousData)
          break
          
        case 'DELETE_SALE':
          // Undo delete = recreate
          const newId = await handlersRef.current.onCreateSale(action.saleData)
          // Update the action with new ID for redo
          action.saleId = newId
          break
          
        case 'BATCH_CREATE_SALES':
          // Undo batch create = delete all
          for (const sale of action.sales) {
            await handlersRef.current.onDeleteSale(sale.id)
          }
          break
          
        case 'BATCH_DELETE_SALES':
          // Undo batch delete = recreate all
          const newSales: { id: string; data: Record<string, unknown> }[] = []
          for (const sale of action.sales) {
            const newSaleId = await handlersRef.current.onCreateSale(sale.data)
            newSales.push({ id: newSaleId, data: sale.data })
          }
          action.sales = newSales
          break
      }
      
      // Move action to redo stack
      redoStackRef.current = [...redoStackRef.current, action]
      await handlersRef.current.onRefresh()
      forceUpdate()
    } catch (error) {
      console.error('Undo failed:', error)
      // Put action back on undo stack
      undoStackRef.current = [...undoStackRef.current, action]
      forceUpdate()
    }
  }, [forceUpdate])
  
  const redo = useCallback(async () => {
    if (redoStackRef.current.length === 0 || !handlersRef.current) return
    
    const action = redoStackRef.current[redoStackRef.current.length - 1]
    redoStackRef.current = redoStackRef.current.slice(0, -1)
    
    try {
      switch (action.type) {
        case 'CREATE_SALE':
          // Redo create = create again
          const newId = await handlersRef.current.onCreateSale(action.saleData)
          action.saleId = newId
          break
          
        case 'UPDATE_SALE':
          // Redo update = apply new data
          await handlersRef.current.onUpdateSale(action.saleId, action.newData)
          break
          
        case 'DELETE_SALE':
          // Redo delete = delete again
          await handlersRef.current.onDeleteSale(action.saleId)
          break
          
        case 'BATCH_CREATE_SALES':
          // Redo batch create = create all again
          const newSales: { id: string; data: Record<string, unknown> }[] = []
          for (const sale of action.sales) {
            const newSaleId = await handlersRef.current.onCreateSale(sale.data)
            newSales.push({ id: newSaleId, data: sale.data })
          }
          action.sales = newSales
          break
          
        case 'BATCH_DELETE_SALES':
          // Redo batch delete = delete all again
          for (const sale of action.sales) {
            await handlersRef.current.onDeleteSale(sale.id)
          }
          break
      }
      
      // Move action back to undo stack
      undoStackRef.current = [...undoStackRef.current, action]
      await handlersRef.current.onRefresh()
      forceUpdate()
    } catch (error) {
      console.error('Redo failed:', error)
      // Put action back on redo stack
      redoStackRef.current = [...redoStackRef.current, action]
      forceUpdate()
    }
  }, [forceUpdate])
  
  const clearHistory = useCallback(() => {
    undoStackRef.current = []
    redoStackRef.current = []
    forceUpdate()
  }, [forceUpdate])
  
  const setHandlers = useCallback((handlers: {
    onCreateSale: (data: Record<string, unknown>) => Promise<string>
    onUpdateSale: (id: string, data: Record<string, unknown>) => Promise<void>
    onDeleteSale: (id: string) => Promise<void>
    onRefresh: () => Promise<void>
  }) => {
    handlersRef.current = handlers
  }, [])
  
  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Ctrl+Z (undo) or Ctrl+Shift+Z (redo)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) {
          redo()
        } else {
          undo()
        }
      }
      // Also support Ctrl+Y for redo (Windows convention)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [undo, redo])
  
  // Create value object that updates when stacks change
  const value: UndoContextType = {
    canUndo: undoStackRef.current.length > 0,
    canRedo: redoStackRef.current.length > 0,
    undoStack: undoStackRef.current,
    redoStack: redoStackRef.current,
    pushAction,
    undo,
    redo,
    clearHistory,
    setHandlers
  }
  
  return (
    <UndoContext.Provider value={value}>
      {children}
    </UndoContext.Provider>
  )
}

export function useUndo() {
  const context = useContext(UndoContext)
  if (!context) {
    throw new Error('useUndo must be used within an UndoProvider')
  }
  return context
}
