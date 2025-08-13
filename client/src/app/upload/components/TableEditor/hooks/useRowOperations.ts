import { useState } from 'react'
import { TableData, CellEdit, RowEdit } from '../types'
import { toast } from 'react-hot-toast'

export const useRowOperations = (
  tables: TableData[],
  onTablesChange: (tables: TableData[]) => void,
  saveToUndoStack: () => void
) => {
  const [editingCell, setEditingCell] = useState<CellEdit | null>(null)
  const [editingRow, setEditingRow] = useState<RowEdit | null>(null)

  const addRowAbove = (tableIdx: number, rowIdx: number) => {
    saveToUndoStack()
    const newTables = [...tables]
    const newRow = new Array(newTables[tableIdx].header.length).fill('')
    newTables[tableIdx].rows.splice(rowIdx, 0, newRow)
    onTablesChange(newTables)
    toast.success('Row added above')
  }

  const addRowBelow = (tableIdx: number, rowIdx: number) => {
    saveToUndoStack()
    const newTables = [...tables]
    const newRow = new Array(newTables[tableIdx].header.length).fill('')
    newTables[tableIdx].rows.splice(rowIdx + 1, 0, newRow)
    onTablesChange(newTables)
    toast.success('Row added below')
  }

  const deleteRow = (tableIdx: number, rowIdx: number) => {
    saveToUndoStack()
    const newTables = [...tables]
    newTables[tableIdx].rows.splice(rowIdx, 1)
    onTablesChange(newTables)
    toast.success('Row deleted')
  }

  const duplicateRow = (tableIdx: number, rowIdx: number) => {
    saveToUndoStack()
    const newTables = [...tables]
    const rowToDuplicate = [...newTables[tableIdx].rows[rowIdx]]
    newTables[tableIdx].rows.splice(rowIdx + 1, 0, rowToDuplicate)
    onTablesChange(newTables)
    toast.success('Row duplicated')
  }

  const startCellEdit = (tableIdx: number, rowIdx: number, colIdx: number) => {
    setEditingCell({
      tableIdx,
      rowIdx,
      colIdx,
      value: tables[tableIdx].rows[rowIdx][colIdx] || ''
    })
  }

  const saveCellEdit = () => {
    if (!editingCell) return
    
    saveToUndoStack()
    const newTables = [...tables]
    newTables[editingCell.tableIdx].rows[editingCell.rowIdx][editingCell.colIdx] = editingCell.value
    onTablesChange(newTables)
    setEditingCell(null)
  }

  const cancelCellEdit = () => {
    setEditingCell(null)
  }

  const startRowEdit = (tableIdx: number, rowIdx: number) => {
    const row = tables[tableIdx].rows[rowIdx]
    setEditingRow({
      tableIdx,
      rowIdx,
      values: [...row]
    })
  }

  const saveRowEdit = () => {
    if (!editingRow) return
    
    saveToUndoStack()
    const newTables = [...tables]
    newTables[editingRow.tableIdx].rows[editingRow.rowIdx] = [...editingRow.values]
    onTablesChange(newTables)
    setEditingRow(null)
    toast.success('Row updated successfully')
  }

  const cancelRowEdit = () => {
    setEditingRow(null)
  }

  const updateRowEditValue = (colIdx: number, value: string) => {
    if (!editingRow) return
    setEditingRow({
      ...editingRow,
      values: editingRow.values.map((val, idx) => idx === colIdx ? value : val)
    })
  }

  return {
    editingCell,
    editingRow,
    addRowAbove,
    addRowBelow,
    deleteRow,
    duplicateRow,
    startCellEdit,
    saveCellEdit,
    cancelCellEdit,
    startRowEdit,
    saveRowEdit,
    cancelRowEdit,
    updateRowEditValue,
    setEditingCell,
    setEditingRow
  }
}
