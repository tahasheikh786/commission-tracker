'use client'
import { useState, useEffect, useCallback } from 'react'
import { Pencil, Trash2, X, Check, Download, ArrowUpDown, ArrowDown, ArrowUp, Table2, Eye, FileText } from 'lucide-react'
import clsx from 'clsx'
import ProfessionalPagination from '../../components/ui/ProfessionalPagination'

type TableData = {
  header: string[]
  rows: string[][]
  name?: string
}

type ExtractedTableEnhancedProps = {
  tables: TableData[]
  onTablesChange?: (tables: TableData[]) => void
  highlightedRow?: { tableIdx: number, rowIdx: number } | null
  onRowHover?: (tableIdx: number, rowIdx: number | null) => void
  showPdfPreview?: boolean
  pdfUrl?: string | null
  onPdfPreview?: () => void
}

// Helper functions
function fixPercent(val: string): string {
  if (!val) return val
  return val
    .replace(/\bolo\b/g, '%')
    .replace(/\b010\b/g, '%')
    .replace(/OLO/g, '%')
    .replace(/010/g, '%')
}

const ROWS_OPTIONS = [10, 25, 50]

export default function ExtractedTableEnhanced({ 
  tables: backendTables, 
  onTablesChange, 
  highlightedRow, 
  onRowHover,
  showPdfPreview = false,
  pdfUrl = null,
  onPdfPreview
}: ExtractedTableEnhancedProps) {
  
  const [currentTableIndex, setCurrentTableIndex] = useState(0)
  const [tables, setTables] = useState<TableData[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Table state
  const [editRow, setEditRow] = useState<{ tableIdx: number, rowIdx: number } | null>(null)
  const [editValues, setEditValues] = useState<string[]>([])
  const [selectedRows, setSelectedRows] = useState<Array<Set<number>>>([])
  const [sort, setSort] = useState<{ col: number, dir: 'asc' | 'desc' } | null>(null)
  
  // Pagination state
  const [page, setPage] = useState(1)
  const [rowsPerPage, setRowsPerPage] = useState(ROWS_OPTIONS[0])

  // Initialize tables
  useEffect(() => {
    if (backendTables && backendTables.length > 0) {
      const processedTables = backendTables.map(table => ({
        ...table,
        rows: Array.isArray(table.rows) ? [...table.rows] : [],
        name: table.name || ''
      }))
      setTables(processedTables)
      setSelectedRows(processedTables.map(() => new Set<number>()))
    }
  }, [backendTables])

  const currentTable = tables[currentTableIndex]

  // Table operations
  const isRowSelected = (tableIdx: number, rowIdx: number) => {
    return selectedRows[tableIdx]?.has(rowIdx) || false
  }

  const toggleRow = (tableIdx: number, rowIdx: number) => {
    setSelectedRows(prev => prev.map((set, idx) => {
      if (idx !== tableIdx) return set
      const newSet = new Set(set)
      if (newSet.has(rowIdx)) {
        newSet.delete(rowIdx)
      } else {
        newSet.add(rowIdx)
      }
      return newSet
    }))
  }

  const toggleSelectAllOnPage = () => {
    if (!currentTable) return
    
    const allSelected = currentTable.rows.every((_, idx) => isRowSelected(currentTableIndex, idx))
    
    setSelectedRows(prev => prev.map((set, idx) => {
      if (idx !== currentTableIndex) return set
      const newSet = new Set(set)
      if (allSelected) {
        currentTable.rows.forEach((_, rowIdx) => newSet.delete(rowIdx))
      } else {
        currentTable.rows.forEach((_, rowIdx) => newSet.add(rowIdx))
      }
      return newSet
    }))
  }

  const deleteSelectedRows = () => {
    if (!currentTable) return
    
    const selected = selectedRows[currentTableIndex]
    const newRows = currentTable.rows.filter((_, idx) => !selected.has(idx))
    
    const newTables = tables.map((table, idx) => 
      idx === currentTableIndex ? { ...table, rows: newRows } : table
    )
    
    setTables(newTables)
    setSelectedRows(prev => prev.map((set, idx) => idx === currentTableIndex ? new Set<number>() : set))
    
    if (onTablesChange) {
      onTablesChange(newTables)
    }
  }

  const startEdit = (rowIdx: number) => {
    if (!currentTable) return
    setEditRow({ tableIdx: currentTableIndex, rowIdx })
    setEditValues([...currentTable.rows[rowIdx]])
  }

  const saveEdit = () => {
    if (!editRow || !currentTable) return
    
    const newTables = tables.map((table, idx) => {
      if (idx !== editRow.tableIdx) return table
      const newRows = [...table.rows]
      newRows[editRow.rowIdx] = [...editValues]
      return { ...table, rows: newRows }
    })
    
    setTables(newTables)
    setEditRow(null)
    setEditValues([])
    
    if (onTablesChange) {
      onTablesChange(newTables)
    }
  }

  const cancelEdit = () => {
    setEditRow(null)
    setEditValues([])
  }

  const onEditCell = (colIdx: number, value: string) => {
    setEditValues(vals => vals.map((val, idx) => idx === colIdx ? value : val))
  }

  const handleSort = (colIdx: number) => {
    setSort(s => {
      if (!s || s.col !== colIdx) return { col: colIdx, dir: 'asc' }
      if (s.dir === 'asc') return { col: colIdx, dir: 'desc' }
      return null
    })
  }

  const downloadCSV = (table: TableData) => {
    const csvContent = [
      (table.header || []).join(','),
      ...(table.rows || []).map(row => (row || []).map(cell => `"${cell}"`).join(','))
    ].join('\n')
    
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${table.name || 'table'}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // Pagination logic
  const totalRows = currentTable?.rows?.length || 0
  const pageCount = Math.max(1, Math.ceil(totalRows / rowsPerPage))
  const startIdx = (page - 1) * rowsPerPage
  const endIdx = Math.min(startIdx + rowsPerPage, totalRows)
  const pagedRows = currentTable?.rows?.slice(startIdx, endIdx) || []

  // Reset page when table changes
  useEffect(() => {
    setPage(1)
  }, [currentTableIndex])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-2 border-slate-200 dark:border-slate-600 border-t-emerald-500 rounded-full animate-spin"></div>
        <span className="ml-3 text-slate-600 dark:text-slate-400 font-medium">Loading tables...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-16">
        <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-xl flex items-center justify-center mx-auto mb-4">
          <FileText className="text-red-600 dark:text-red-400" size={32} />
        </div>
        <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">Error Loading Tables</h3>
        <p className="text-slate-500 dark:text-slate-400 text-sm">{error}</p>
      </div>
    )
  }

  if (tables.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700 rounded-xl flex items-center justify-center mx-auto mb-4">
          <Table2 className="text-slate-400 dark:text-slate-500" size={32} />
        </div>
        <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">No tables found</h3>
        <p className="text-slate-500 dark:text-slate-400 text-sm">No extracted tables available.</p>
      </div>
    )
  }

  return (
    <div className="w-full h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center">
            <Table2 className="text-white" size={20} />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Extracted Tables</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">Review and edit extracted data</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {showPdfPreview && pdfUrl && (
            <button
              onClick={onPdfPreview}
              className="p-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
              aria-label="Preview PDF"
            >
              <Eye size={20} />
            </button>
          )}
          <button
            onClick={() => downloadCSV(currentTable)}
            className="p-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
            aria-label="Download CSV"
          >
            <Download size={20} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden p-6">
        <div className="space-y-6 h-full flex flex-col">
          {/* Table Navigation */}
          {tables.length > 1 && (
            <div className="flex items-center justify-between bg-gray-50 dark:bg-slate-700 p-4 rounded-xl">
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-600 dark:text-slate-400">Table:</span>
                <select
                  value={currentTableIndex}
                  onChange={(e) => setCurrentTableIndex(Number(e.target.value))}
                  className="px-3 py-2 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {tables.map((table, index) => (
                    <option key={index} value={index}>
                      {table.name || `Table ${index + 1}`}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600 dark:text-slate-400">
                  {currentTableIndex + 1} of {tables.length}
                </span>
              </div>
            </div>
          )}

          {/* Table Display */}
          {currentTable && (
            <div className="space-y-4 flex-1 flex flex-col">
              {/* Table Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-slate-200">
                    {currentTable.name || `Table ${currentTableIndex + 1}`}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-slate-400">
                    {currentTable.rows?.length || 0} rows × {currentTable.header?.length || 0} columns
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-3">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Rows per page:</label>
                    <select
                      value={rowsPerPage}
                      onChange={(e) => {
                        setRowsPerPage(Number(e.target.value))
                        setPage(1)
                      }}
                      className="border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      {ROWS_OPTIONS.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={deleteSelectedRows}
                    disabled={selectedRows[currentTableIndex]?.size === 0}
                    className={clsx(
                      "flex items-center gap-2 px-4 py-2 rounded-lg font-medium shadow-lg hover:shadow-xl transition-all duration-200",
                      selectedRows[currentTableIndex]?.size > 0 
                        ? "bg-red-500 text-white hover:bg-red-600" 
                        : "bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed"
                    )}
                  >
                    <Trash2 size={16} />
                    Delete selected
                  </button>
                </div>
              </div>

              {/* Table */}
              <div className="flex-1 overflow-auto border border-gray-200 dark:border-slate-600 rounded-lg">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-slate-700 sticky top-0">
                    <tr>
                      <th className="py-4 px-4 border-b border-slate-200 dark:border-slate-600 w-8 text-center">
                        <input
                          type="checkbox"
                          className="w-4 h-4 text-blue-500 border-slate-300 dark:border-slate-600 rounded focus:ring-blue-500 cursor-pointer"
                          checked={pagedRows.length > 0 && pagedRows.every((_, idx) => isRowSelected(currentTableIndex, startIdx + idx))}
                          onChange={toggleSelectAllOnPage}
                          aria-label="Select all on page"
                        />
                      </th>
                      {currentTable.header?.map((header, index) => (
                        <th
                          key={index}
                          className="px-4 py-4 text-left font-bold text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-slate-600"
                        >
                          <div className="flex items-center gap-2 cursor-pointer" onClick={() => handleSort(index)}>
                            {fixPercent(header)}
                            {sort && sort.col === index ? (
                              sort.dir === 'asc' ? <ArrowUp size={16} className="text-blue-600" /> : <ArrowDown size={16} className="text-blue-600" />
                            ) : (
                              <ArrowUpDown size={16} className="text-gray-400" />
                            )}
                          </div>
                        </th>
                      )) || []}
                      <th className="py-4 px-4 border-b border-slate-200 dark:border-slate-600 w-40 text-slate-800 dark:text-slate-200 font-bold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-slate-600">
                    {pagedRows.map((row, rowIndex) => {
                      const globalRowIndex = startIdx + rowIndex
                      const isEditing = editRow?.tableIdx === currentTableIndex && editRow?.rowIdx === globalRowIndex
                      const isHighlighted = highlightedRow?.tableIdx === currentTableIndex && highlightedRow?.rowIdx === globalRowIndex
                      
                      return (
                        <tr 
                          key={globalRowIndex} 
                          className={clsx(
                            isEditing ? "bg-blue-50 dark:bg-blue-900/20" : "hover:bg-slate-50 dark:hover:bg-slate-700",
                            isHighlighted && "bg-yellow-50 dark:bg-yellow-900/20",
                            "transition-colors"
                          )}
                        >
                          <td className="py-3 px-4 border-b border-slate-200 dark:border-slate-600 align-top text-center">
                            <input
                              type="checkbox"
                              className="w-4 h-4 text-blue-500 border-slate-300 dark:border-slate-600 rounded focus:ring-blue-500 cursor-pointer"
                              checked={isRowSelected(currentTableIndex, globalRowIndex)}
                              onChange={() => toggleRow(currentTableIndex, globalRowIndex)}
                              aria-label={`Select row ${globalRowIndex + 1}`}
                            />
                          </td>
                          {row?.map((cell, cellIndex) => (
                            <td key={cellIndex} className="py-3 px-4 border-b border-slate-200 dark:border-slate-600 align-top">
                              {isEditing ? (
                                <input
                                  value={editValues[cellIndex] ?? ""}
                                  onChange={e => onEditCell(cellIndex, e.target.value)}
                                  className="border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-lg px-3 py-1 w-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                />
                              ) : (
                                (cell && cell.trim())
                                  ? <span className="text-slate-800 dark:text-slate-200 text-sm">{fixPercent(cell)}</span>
                                  : <span className="text-slate-400 dark:text-slate-500">-</span>
                              )}
                            </td>
                          )) || []}
                          <td className="py-3 px-4 border-b border-slate-200 dark:border-slate-600 align-top">
                            {!isEditing ? (
                              <div className="flex gap-2">
                                <button 
                                  className="p-2 text-blue-500 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors" 
                                  onClick={() => startEdit(globalRowIndex)} 
                                  title="Edit"
                                >
                                  <Pencil size={16} />
                                </button>
                                <button 
                                  className="p-2 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors" 
                                  onClick={() => {
                                    const newTables = tables.map((table, idx) => 
                                      idx === currentTableIndex ? { ...table, rows: table.rows.filter((_, i) => i !== globalRowIndex) } : table
                                    )
                                    setTables(newTables)
                                    if (onTablesChange) onTablesChange(newTables)
                                  }} 
                                  title="Delete"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            ) : (
                              <div className="flex gap-2">
                                <button 
                                  className="p-2 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition-colors" 
                                  onClick={saveEdit} 
                                  title="Save"
                                >
                                  <Check size={18} />
                                </button>
                                <button 
                                  className="p-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors" 
                                  onClick={cancelEdit} 
                                  title="Cancel"
                                >
                                  <X size={18} />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    }) || []}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between mt-4">
                <div className="text-sm text-slate-600 dark:text-slate-400">
                  Showing <span className="font-semibold text-slate-800 dark:text-slate-200">{startIdx + 1}-{endIdx}</span> of <span className="font-semibold text-slate-800 dark:text-slate-200">{totalRows}</span> items
                </div>
                <ProfessionalPagination
                  currentPage={page}
                  totalPages={pageCount}
                  onPageChange={setPage}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
