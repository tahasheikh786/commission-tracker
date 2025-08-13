import { useState } from 'react'
import { TableData } from '../types'

export const useUndoRedo = (
  tables: TableData[],
  onTablesChange: (tables: TableData[]) => void
) => {
  const [undoStack, setUndoStack] = useState<TableData[][]>([])
  const [redoStack, setRedoStack] = useState<TableData[][]>([])
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  const saveToUndoStack = () => {
    setUndoStack(prev => [...prev, JSON.parse(JSON.stringify(tables))])
    setRedoStack([])
    setHasUnsavedChanges(true)
  }

  const undo = () => {
    if (undoStack.length === 0) return
    
    const previousState = undoStack[undoStack.length - 1]
    const currentState = JSON.parse(JSON.stringify(tables))
    
    setRedoStack(prev => [...prev, currentState])
    setUndoStack(prev => prev.slice(0, -1))
    onTablesChange(previousState)
  }

  const redo = () => {
    if (redoStack.length === 0) return
    
    const nextState = redoStack[redoStack.length - 1]
    const currentState = JSON.parse(JSON.stringify(tables))
    
    setUndoStack(prev => [...prev, currentState])
    setRedoStack(prev => prev.slice(0, -1))
    onTablesChange(nextState)
  }

  const clearHistory = () => {
    setUndoStack([])
    setRedoStack([])
    setHasUnsavedChanges(false)
  }

  return {
    undoStack,
    redoStack,
    hasUnsavedChanges,
    saveToUndoStack,
    undo,
    redo,
    clearHistory,
    setHasUnsavedChanges
  }
}
