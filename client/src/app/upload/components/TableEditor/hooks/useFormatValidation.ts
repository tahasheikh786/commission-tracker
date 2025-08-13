import { useState } from 'react'
import { TableData, FormatValidationResults, RightFormatRow } from '../types'
import { validateRowFormat, correctRowFormat } from '../utils'
import { toast } from 'react-hot-toast'

export const useFormatValidation = (
  tables: TableData[],
  onTablesChange: (tables: TableData[]) => void,
  saveToUndoStack: () => void
) => {
  const [rightFormatRow, setRightFormatRow] = useState<RightFormatRow>(null)
  const [formatValidationResults, setFormatValidationResults] = useState<FormatValidationResults>({})

  const markAsRightFormatRow = (tableIdx: number, rowIdx: number) => {
    setRightFormatRow({ tableIdx, rowIdx })
    validateAllRowsFormat(tableIdx, rowIdx)
    toast.success('Right format row set - validating all rows...')
  }

  const validateAllRowsFormat = (tableIdx: number, referenceRowIdx: number) => {
    const table = tables[tableIdx]
    const referenceRow = table.rows[referenceRowIdx]
    const results: FormatValidationResults = {}
    
    table.rows.forEach((row, rowIdx) => {
      if (rowIdx === referenceRowIdx || table.summaryRows?.has(rowIdx)) {
        results[rowIdx] = { isValid: true, issues: [] }
        return
      }
      
      results[rowIdx] = validateRowFormat(referenceRow, row)
    })
    
    setFormatValidationResults(results)
    
    const invalidRows = Object.values(results).filter(result => !result.isValid).length
    if (invalidRows > 0) {
      toast.error(`${invalidRows} rows have format issues`)
    } else {
      toast.success('All rows match the reference format!')
    }
  }

  const clearFormatValidation = () => {
    setRightFormatRow(null)
    setFormatValidationResults({})
  }

  const autoCorrectFormatIssues = () => {
    if (!rightFormatRow || rightFormatRow.tableIdx !== tables.length) {
      toast.error('Please set a format reference row first')
      return
    }

    saveToUndoStack()
    const newTables = [...tables]
    const currentTable = newTables[rightFormatRow.tableIdx]
    const referenceRow = currentTable.rows[rightFormatRow.rowIdx]
    
    let correctedCount = 0
    
    currentTable.rows.forEach((row, rowIdx) => {
      if (rowIdx === rightFormatRow.rowIdx || currentTable.summaryRows?.has(rowIdx)) {
        return
      }
      
      const correctedRow = correctRowFormat(referenceRow, row)
      if (correctedRow !== null) {
        currentTable.rows[rowIdx] = correctedRow
        correctedCount++
      }
    })
    
    onTablesChange(newTables)
    
    if (correctedCount > 0) {
      toast.success(`Auto-corrected ${correctedCount} rows`)
      validateAllRowsFormat(rightFormatRow.tableIdx, rightFormatRow.rowIdx)
    } else {
      toast.success('No corrections were needed')
    }
  }

  const correctSpecificRow = (rowIdx: number) => {
    if (!rightFormatRow) {
      toast.error('Please set a format reference row first')
      return
    }

    saveToUndoStack()
    const newTables = [...tables]
    const currentTable = newTables[rightFormatRow.tableIdx]
    const referenceRow = currentTable.rows[rightFormatRow.rowIdx]
    
    const correctedRow = correctRowFormat(referenceRow, currentTable.rows[rowIdx])
    if (correctedRow) {
      currentTable.rows[rowIdx] = correctedRow
      onTablesChange(newTables)
      toast.success(`Corrected row ${rowIdx + 1}`)
      validateAllRowsFormat(rightFormatRow.tableIdx, rightFormatRow.rowIdx)
    } else {
      toast.success('No corrections needed for this row')
    }
  }

  const fixRowFormatWithGPT = async () => {
    if (!rightFormatRow) {
      toast.error('Please set a format reference row first')
      return
    }

    const currentTable = tables[rightFormatRow.tableIdx]
    const referenceRow = currentTable.rows[rightFormatRow.rowIdx]
    
    const problematicRows: { rowIdx: number; row: string[]; issues: string[] }[] = []
    
    currentTable.rows.forEach((row, rowIdx) => {
      if (rowIdx === rightFormatRow.rowIdx || currentTable.summaryRows?.has(rowIdx)) {
        return
      }
      
      const result = validateRowFormat(referenceRow, row)
      if (!result.isValid) {
        problematicRows.push({
          rowIdx,
          row,
          issues: result.issues
        })
      }
    })

    if (problematicRows.length === 0) {
      toast.success('No format issues found to correct')
      return
    }

    try {
      toast.loading('Fixing row formats with GPT-5...', { id: 'gpt-correction' })
      
      const response = await fetch('/api/improve-extraction/fix-row-formats/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reference_row: referenceRow,
          problematic_rows: problematicRows,
          table_headers: currentTable.header
        })
      })

      if (response.ok) {
        const result = await response.json()
        
        if (result.corrected_rows && result.corrected_rows.length > 0) {
          saveToUndoStack()
          const newTables = [...tables]
          const newCurrentTable = newTables[rightFormatRow.tableIdx]
          
          result.corrected_rows.forEach((correction: { row_idx: number; corrected_row: string[] }) => {
            newCurrentTable.rows[correction.row_idx] = correction.corrected_row
          })
          
          onTablesChange(newTables)
          toast.success(`GPT-5 corrected ${result.corrected_rows.length} rows`, { id: 'gpt-correction' })
          
          validateAllRowsFormat(rightFormatRow.tableIdx, rightFormatRow.rowIdx)
        } else {
          toast.error('No corrections were made by GPT-5', { id: 'gpt-correction' })
        }
      } else {
        toast.error('Failed to fix row formats with GPT-5', { id: 'gpt-correction' })
      }
    } catch (error) {
      console.error('Error fixing row formats with GPT-5:', error)
      toast.error('Failed to fix row formats with GPT-5', { id: 'gpt-correction' })
    }
  }

  return {
    rightFormatRow,
    formatValidationResults,
    markAsRightFormatRow,
    validateAllRowsFormat,
    clearFormatValidation,
    autoCorrectFormatIssues,
    correctSpecificRow,
    fixRowFormatWithGPT
  }
}
