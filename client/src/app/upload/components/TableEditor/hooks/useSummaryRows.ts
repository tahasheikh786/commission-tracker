import { useState } from 'react'
import { TableData } from '../types'
import { findSimilarRows, detectSummaryRowsLocally } from '../utils'
import { toast } from 'react-hot-toast'

export const useSummaryRows = (
  tables: TableData[],
  onTablesChange: (tables: TableData[]) => void,
  saveToUndoStack: () => void
) => {
  const [autoDetectedCount, setAutoDetectedCount] = useState<number>(0)

  const markAsSummaryRow = (tableIdx: number, rowIdx: number) => {
    saveToUndoStack()
    const newTables = [...tables]
    
    if (!newTables[tableIdx].summaryRows) {
      newTables[tableIdx].summaryRows = new Set()
    }
    
    newTables[tableIdx].summaryRows!.add(rowIdx)
    
    const selectedRow = newTables[tableIdx].rows[rowIdx]
    const similarRows = findSimilarRows(newTables[tableIdx], selectedRow, rowIdx)
    
    similarRows.forEach(similarRowIdx => {
      newTables[tableIdx].summaryRows!.add(similarRowIdx)
    })
    
    onTablesChange(newTables)
    toast.success(`Marked ${similarRows.length + 1} similar rows as summary rows`)
  }

  const unmarkAsSummaryRow = (tableIdx: number, rowIdx: number) => {
    saveToUndoStack()
    const newTables = [...tables]
    
    if (newTables[tableIdx].summaryRows) {
      newTables[tableIdx].summaryRows!.delete(rowIdx)
      
      if (newTables[tableIdx].summaryRows!.size === 0) {
        delete newTables[tableIdx].summaryRows
      }
    }
    
    onTablesChange(newTables)
    toast.success('Unmarked as summary row')
  }

  const deleteSummaryRows = (tableIdx: number) => {
    const table = tables[tableIdx]
    if (!table.summaryRows || table.summaryRows.size === 0) {
      toast.error('No summary rows to delete')
      return
    }

    saveToUndoStack()
    const newTables = [...tables]
    const summaryRowIndices = Array.from(table.summaryRows).sort((a, b) => b - a)
    
    summaryRowIndices.forEach(rowIdx => {
      newTables[tableIdx].rows.splice(rowIdx, 1)
    })
    
    delete table.summaryRows
    
    onTablesChange(newTables)
    toast.success(`Deleted ${summaryRowIndices.length} summary rows`)
  }

  const learnSummaryRowPattern = async (tableIdx: number) => {
    const table = tables[tableIdx]
    if (!table.summaryRows || table.summaryRows.size === 0) {
      toast.error('No summary rows marked to learn from')
      return
    }

    try {
      const response = await fetch('/api/summary-rows/learn-pattern/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          company_id: 'default',
          table_data: {
            header: table.header,
            rows: table.rows
          },
          summary_row_indices: Array.from(table.summaryRows)
        })
      })

      if (response.ok) {
        const result = await response.json()
        toast.success(`Learned pattern from ${result.summary_rows_count} summary rows`)
      } else {
        toast.error('Failed to learn pattern')
      }
    } catch (error) {
      console.error('Error learning pattern:', error)
      toast.error('Failed to learn pattern')
    }
  }

  const autoDetectSummaryRows = async (tableIdx: number) => {
    const table = tables[tableIdx]
    
    try {
      // Try server-based detection first
      const response = await fetch('/api/summary-rows/detect-summary-rows/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          company_id: 'default',
          table_data: {
            header: table.header,
            rows: table.rows
          }
        })
      })

      if (response.ok) {
        const result = await response.json()
        if (result.detected_summary_rows.length > 0) {
          saveToUndoStack()
          const newTables = [...tables]
          
          if (!newTables[tableIdx].summaryRows) {
            newTables[tableIdx].summaryRows = new Set()
          }
          
          result.detected_summary_rows.forEach((rowIdx: number) => {
            newTables[tableIdx].summaryRows!.add(rowIdx)
          })
          
          onTablesChange(newTables)
          setAutoDetectedCount(result.detected_summary_rows.length)
          toast.success(`Auto-detected ${result.detected_summary_rows.length} summary rows`)
        } else {
          // Fallback to local detection
          const localDetectedRows = detectSummaryRowsLocally(table)
          if (localDetectedRows.length > 0) {
            saveToUndoStack()
            const newTables = [...tables]
            
            if (!newTables[tableIdx].summaryRows) {
              newTables[tableIdx].summaryRows = new Set()
            }
            
            localDetectedRows.forEach((rowIdx: number) => {
              newTables[tableIdx].summaryRows!.add(rowIdx)
            })
            
            onTablesChange(newTables)
            setAutoDetectedCount(localDetectedRows.length)
            toast.success(`Auto-detected ${localDetectedRows.length} summary rows (local detection)`)
          } else {
            toast.success('No summary rows detected')
          }
        }
      } else {
        // Server failed, use local detection
        const localDetectedRows = detectSummaryRowsLocally(table)
        if (localDetectedRows.length > 0) {
          saveToUndoStack()
          const newTables = [...tables]
          
          if (!newTables[tableIdx].summaryRows) {
            newTables[tableIdx].summaryRows = new Set()
          }
          
          localDetectedRows.forEach((rowIdx: number) => {
            newTables[tableIdx].summaryRows!.add(rowIdx)
          })
          
          onTablesChange(newTables)
          setAutoDetectedCount(localDetectedRows.length)
          toast.success(`Auto-detected ${localDetectedRows.length} summary rows (local detection)`)
        } else {
          toast.success('No summary rows detected')
        }
      }
    } catch (error) {
      console.error('Error detecting summary rows:', error)
      
      // Fallback to local detection on error
      const localDetectedRows = detectSummaryRowsLocally(table)
      if (localDetectedRows.length > 0) {
        saveToUndoStack()
        const newTables = [...tables]
        
        if (!newTables[tableIdx].summaryRows) {
          newTables[tableIdx].summaryRows = new Set()
        }
        
        localDetectedRows.forEach((rowIdx: number) => {
          newTables[tableIdx].summaryRows!.add(rowIdx)
        })
        
        onTablesChange(newTables)
        setAutoDetectedCount(localDetectedRows.length)
        toast.success(`Auto-detected ${localDetectedRows.length} summary rows (local detection)`)
      } else {
        toast.error('Failed to detect summary rows')
      }
    }
  }

  return {
    autoDetectedCount,
    markAsSummaryRow,
    unmarkAsSummaryRow,
    deleteSummaryRows,
    learnSummaryRowPattern,
    autoDetectSummaryRows
  }
}
