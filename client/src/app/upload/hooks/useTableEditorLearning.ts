import { useState, useEffect } from 'react'
import { toast } from 'react-hot-toast'
import { TableData } from '../components/TableEditor/types'

export const useTableEditorLearning = (companyId?: string) => {
  const [isLoading, setIsLoading] = useState(false)
  const [learnedSettings, setLearnedSettings] = useState<any>(null)

  const fetchTableEditorSettings = async (tables: TableData[]) => {
    if (!companyId || !tables || tables.length === 0) return null

    try {
      setIsLoading(true)
      
      // Use the first table for format matching
      const mainTable = tables[0]
      const tableStructure = {
        column_count: mainTable.header.length,
        row_count: mainTable.rows.length,
        has_header_row: true
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/companies/${companyId}/get-table-editor-settings/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          headers: mainTable.header,
          table_structure: tableStructure
        })
      })

      if (response.ok) {
        const result = await response.json()
        if (result.found_match && result.table_editor_settings) {
          setLearnedSettings(result.table_editor_settings)
          return result.table_editor_settings
        }
      }
      
      return null
    } catch (error) {
      console.error('Error fetching table editor settings:', error)
      return null
    } finally {
      setIsLoading(false)
    }
  }

  const applyLearnedSettings = (tables: TableData[], settings: any): TableData[] => {
    if (!settings || !tables || tables.length === 0) return tables

    try {
      const updatedTables = [...tables]
      const mainTable = updatedTables[0]

      // Apply learned headers if they match
      if (settings.headers && settings.headers.length === mainTable.header.length) {
        mainTable.header = settings.headers
      }

      // Apply learned summary rows
      if (settings.summary_rows && settings.summary_rows.length > 0) {
        mainTable.summaryRows = new Set(settings.summary_rows)
      }

      // Apply other table editor settings as needed
      if (settings.table_structure) {
        // Could apply additional structure-based corrections
      }

      toast.success('Applied learned table editor settings!')
      return updatedTables
    } catch (error) {
      console.error('Error applying learned settings:', error)
      toast.error('Failed to apply learned settings')
      return tables
    }
  }

  const autoApplyLearnedSettings = async (tables: TableData[]): Promise<TableData[]> => {
    const settings = await fetchTableEditorSettings(tables)
    if (settings) {
      return applyLearnedSettings(tables, settings)
    }
    return tables
  }

  return {
    isLoading,
    learnedSettings,
    fetchTableEditorSettings,
    applyLearnedSettings,
    autoApplyLearnedSettings
  }
}
