import { useState } from 'react'
import { TableData, MergeHistory } from '../types'
import { toast } from 'react-hot-toast'

export const useTableOperations = (
  tables: TableData[],
  onTablesChange: (tables: TableData[]) => void,
  saveToUndoStack: () => void
) => {
  const [mergeHistory, setMergeHistory] = useState<MergeHistory[]>([])
  const [mergeSelection, setMergeSelection] = useState<{ tableIdx: number, colIdx: number } | null>(null)

  const addTable = () => {
    saveToUndoStack()
    const newTable: TableData = {
      header: ['Column 1', 'Column 2', 'Column 3'],
      rows: [['', '', '']],
      name: `Table ${tables.length + 1}`
    }
    onTablesChange([...tables, newTable])
    toast.success('New table added')
  }

  const deleteTable = (tableIdx: number) => {
    saveToUndoStack()
    const newTables = tables.filter((_, idx) => idx !== tableIdx)
    onTablesChange(newTables)
    toast.success('Table deleted')
  }

  const addColumn = (tableIdx: number, colIdx: number, columnName: string = 'New Column') => {
    saveToUndoStack()
    const newTables = [...tables]
    
    newTables[tableIdx].header.splice(colIdx, 0, columnName)
    
    newTables[tableIdx].rows.forEach(row => {
      row.splice(colIdx, 0, '')
    })
    
    onTablesChange(newTables)
    toast.success('Column added')
  }

  const deleteColumn = (tableIdx: number, colIdx: number) => {
    saveToUndoStack()
    const newTables = [...tables]
    
    newTables[tableIdx].header.splice(colIdx, 1)
    
    newTables[tableIdx].rows.forEach(row => {
      row.splice(colIdx, 1)
    })
    
    onTablesChange(newTables)
    toast.success('Column deleted')
  }

  const renameColumn = (tableIdx: number, colIdx: number, newName: string) => {
    saveToUndoStack()
    const newTables = [...tables]
    newTables[tableIdx].header[colIdx] = newName
    onTablesChange(newTables)
    toast.success('Column renamed')
  }

  const startMergeSelection = (tableIdx: number, colIdx: number) => {
    setMergeSelection({ tableIdx, colIdx })
    toast.success('Click on another column to merge with')
  }

  const mergeColumns = (tableIdx: number, col1Idx: number, col2Idx: number) => {
    if (col1Idx === col2Idx) {
      toast.error('Cannot merge column with itself')
      setMergeSelection(null)
      return
    }

    saveToUndoStack()
    const newTables = [...tables]
    const table = newTables[tableIdx]
    
    const originalHeader = [...table.header]
    const originalRows = table.rows.map(row => [...row])
    
    const mergedHeader = `${table.header[col1Idx]} - ${table.header[col2Idx]}`
    table.header[col1Idx] = mergedHeader
    
    table.rows.forEach(row => {
      const value1 = row[col1Idx] || ''
      const value2 = row[col2Idx] || ''
      row[col1Idx] = value1 && value2 ? `${value1} ${value2}` : value1 || value2
    })
    
    table.header.splice(col2Idx, 1)
    table.rows.forEach(row => row.splice(col2Idx, 1))
    
    setMergeHistory(prev => [...prev, {
      tableIdx,
      col1Idx,
      col2Idx,
      originalHeader,
      originalRows,
      timestamp: Date.now()
    }])
    
    onTablesChange(newTables)
    toast.success('Columns merged successfully')
    setMergeSelection(null)
  }

  const revertLastMerge = () => {
    if (mergeHistory.length === 0) {
      toast.error('No merge operations to revert')
      return
    }

    const lastMerge = mergeHistory[mergeHistory.length - 1]
    saveToUndoStack()
    
    const newTables = [...tables]
    const table = newTables[lastMerge.tableIdx]
    
    table.header = [...lastMerge.originalHeader]
    table.rows = lastMerge.originalRows.map(row => [...row])
    
    setMergeHistory(prev => prev.slice(0, -1))
    
    onTablesChange(newTables)
    toast.success('Last merge operation reverted')
  }

  const handleColumnClick = (tableIdx: number, colIdx: number) => {
    if (mergeSelection && mergeSelection.tableIdx === tableIdx) {
      mergeColumns(tableIdx, mergeSelection.colIdx, colIdx)
    }
  }

  return {
    mergeHistory,
    mergeSelection,
    addTable,
    deleteTable,
    addColumn,
    deleteColumn,
    renameColumn,
    startMergeSelection,
    mergeColumns,
    revertLastMerge,
    handleColumnClick,
    setMergeSelection
  }
}
