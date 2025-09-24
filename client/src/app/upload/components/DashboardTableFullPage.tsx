'use client'
import { useState, useEffect } from 'react'
import { Pencil, Trash2, X, Check } from 'lucide-react'
import clsx from 'clsx'
import { toast } from 'react-hot-toast'
import ProgressBar from './ProgressBar'
import { ApprovalLoader } from '../../components/ui/FullScreenLoader'
import ProfessionalPagination from '../../components/ui/ProfessionalPagination'

type TableData = {
  header: string[]
  rows: (string[] | Record<string, string>)[]
  name?: string
}

type FieldConfig = { field: string, label: string }

type DashboardTableFullPageProps = {
  tables: TableData[],
  fieldConfig: FieldConfig[],
  onEditMapping: () => void,
  onApprove: () => void,
  onReject: () => void,
  onReset: () => void,
  company?: { id: string, name: string } | null,
  fileName?: string,
  fileUrl?: string | null,
  readOnly?: boolean,
  onTableChange?: (tables: TableData[]) => void,
  planTypes?: string[],
  uploadId?: string,
  submitting?: boolean,
  showRejectModal?: boolean,
  rejectReason?: string,
  onRejectReasonChange?: (reason: string) => void,
  onRejectSubmit?: () => void,
  onCloseRejectModal?: () => void,
  selectedStatementDate?: any,
  approvalProgress?: { totalRows: number; processedRows: number }
}

function fixPercent(val: string): string {
  if (!val) return val
  return val
    .replace(/\bolo\b/g, '%')
    .replace(/\b010\b/g, '%')
    .replace(/OLO/g, '%')
    .replace(/010/g, '%')
}


const ROWS_OPTIONS = [10, 25, 50]

export default function DashboardTableFullPage({
  tables,
  fieldConfig,
  onEditMapping,
  onApprove,
  onReject,
  onReset,
  company,
  fileName,
  fileUrl,
  readOnly = false,
  onTableChange,
  planTypes = [],
  uploadId,
  submitting = false,
  showRejectModal = false,
  rejectReason = '',
  onRejectReasonChange,
  onRejectSubmit,
  onCloseRejectModal,
  selectedStatementDate,
  approvalProgress = { totalRows: 0, processedRows: 0 }
}: DashboardTableFullPageProps) {

  
  // --- Main Table State (tracks edits/deletes) ---
  const [rows, setRows] = useState<TableData[]>(tables)
  // If `tables` prop changes (new upload, remap, etc), update local state
  useEffect(() => {
    setRows(tables)
  }, [tables])

  // Inform parent of any changes!
  useEffect(() => {
    if (onTableChange) onTableChange(rows)
    // eslint-disable-next-line
  }, [rows])

  // --- Flatten all tables into one long list with group headers ---
  type RowWithGroup = {
    type: 'header',
    groupIdx: number,
    header: string[],
    name?: string
  } | {
    type: 'row',
    groupIdx: number,
    row: string[] | Record<string, string>,
    globalRowIdx: number
  }
  const allRows: RowWithGroup[] = []
  let runningIdx = 0

  rows.forEach((table, groupIdx) => {
    // Add table name as header if it exists
    if (table.name) {
      allRows.push({
        type: 'header',
        groupIdx,
        header: table.header,
        name: table.name
      })
    }
    
    // Add all rows from this table
    table.rows.forEach((row, rowIdx) => {
      allRows.push({
        type: 'row',
        groupIdx,
        row,
        globalRowIdx: runningIdx++
      })
    })
  })

  // --- Pagination ---
  const [page, setPage] = useState(1)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  
  // Reset to page 1 when data changes
  useEffect(() => {
    setPage(1)
  }, [allRows.length])

  const startIdx = (page - 1) * rowsPerPage
  const endIdx = startIdx + rowsPerPage
  const pagedRowsWithHeaders = allRows.slice(startIdx, endIdx)
  const pagedDataRows = pagedRowsWithHeaders.filter(item => item.type === 'row')
  const pageCount = Math.ceil(allRows.length / rowsPerPage)

  // --- Row Selection ---
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set())

  const toggleRow = (rowIdx: number) => {
    const newSelected = new Set(selectedRows)
    if (newSelected.has(rowIdx)) {
      newSelected.delete(rowIdx)
    } else {
      newSelected.add(rowIdx)
    }
    setSelectedRows(newSelected)
  }

  const isRowSelected = (rowIdx: number) => selectedRows.has(rowIdx)

  const toggleSelectAllOnPage = () => {
    const pageRowIndices = pagedDataRows.map(item => item.globalRowIdx)
    const allSelected = pageRowIndices.every(idx => selectedRows.has(idx))
    
    const newSelected = new Set(selectedRows)
    if (allSelected) {
      pageRowIndices.forEach(idx => newSelected.delete(idx))
    } else {
      pageRowIndices.forEach(idx => newSelected.add(idx))
    }
    setSelectedRows(newSelected)
  }

  // --- Row Editing ---
  const [editRowIdx, setEditRowIdx] = useState<number | null>(null)
  const [editValues, setEditValues] = useState<string[]>([])

  const startEdit = (rowIdx: number) => {
    const rowItem = allRows.find(item => item.type === 'row' && item.globalRowIdx === rowIdx)
    if (rowItem && rowItem.type === 'row') {
      setEditRowIdx(rowIdx)
      // Handle both array and object formats
      if (Array.isArray(rowItem.row)) {
        setEditValues([...rowItem.row])
      } else {
        // Convert object to array based on fieldConfig
        const values = fieldConfig.map(field => (rowItem.row as Record<string, string>)[field.field] || '')
        setEditValues(values)
      }
    }
  }

  const saveEdit = () => {
    if (editRowIdx === null) return

    const newRows = [...rows]
    let currentIdx = 0
    
    for (let tableIdx = 0; tableIdx < newRows.length; tableIdx++) {
      for (let rowIdx = 0; rowIdx < newRows[tableIdx].rows.length; rowIdx++) {
        if (currentIdx === editRowIdx) {
          const currentRow = newRows[tableIdx].rows[rowIdx]
          if (Array.isArray(currentRow)) {
            newRows[tableIdx].rows[rowIdx] = [...editValues]
          } else {
            // Convert array back to object format
            const updatedRow: Record<string, string> = {}
            fieldConfig.forEach((field, index) => {
              updatedRow[field.field] = editValues[index] || ''
            })
            newRows[tableIdx].rows[rowIdx] = updatedRow
          }
          setRows(newRows)
          setEditRowIdx(null)
          setEditValues([])
          return
        }
        currentIdx++
      }
    }
  }

  const cancelEdit = () => {
    setEditRowIdx(null)
    setEditValues([])
  }

  const onEditCell = (colIdx: number, value: string) => {
    const newValues = [...editValues]
    newValues[colIdx] = value
    setEditValues(newValues)
  }

  // --- Row Deletion ---
  const deleteRow = (rowIdx: number) => {
    const newRows = [...rows]
    let currentIdx = 0
    
    for (let tableIdx = 0; tableIdx < newRows.length; tableIdx++) {
      for (let rowIdx = 0; rowIdx < newRows[tableIdx].rows.length; rowIdx++) {
        if (currentIdx === rowIdx) {
          newRows[tableIdx].rows.splice(rowIdx, 1)
          setRows(newRows)
          return
        }
        currentIdx++
      }
    }
  }

  return (
    <>
      <ApprovalLoader 
        isVisible={submitting}
        progress={approvalProgress.totalRows > 0 ? Math.round((approvalProgress.processedRows / approvalProgress.totalRows) * 100) : 0}
        totalRows={approvalProgress.totalRows}
        processedRows={approvalProgress.processedRows}
        onCancel={() => {
          // Note: Approval process cannot be cancelled as it's a server-side process
          toast.error("Approval process is already in progress and cannot be cancelled");
        }}
      />
      <div className="fixed inset-0 bg-white z-50 flex flex-col overflow-hidden">
      {/* Progress Bar at the very top */}
      <ProgressBar currentStep="dashboard" />

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto bg-slate-50">
        {/* Compact Table Controls */}
        <div className="bg-white border-b border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="text-sm text-slate-600 font-medium">
                Showing {startIdx + 1}-{Math.min(endIdx, allRows.length)} of {allRows.length} items
              </span>
              <select
                value={rowsPerPage}
                onChange={(e) => setRowsPerPage(Number(e.target.value))}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {ROWS_OPTIONS.map(option => (
                  <option key={option} value={option}>Rows per page: {option}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-3">
              {selectedRows.size > 0 && (
                <button
                  onClick={() => {
                    const newRows = [...rows]
                    const selectedIndices = Array.from(selectedRows).sort((a, b) => b - a)
                    let currentIdx = 0
                    
                    for (let tableIdx = 0; tableIdx < newRows.length; tableIdx++) {
                      for (let rowIdx = 0; rowIdx < newRows[tableIdx].rows.length; rowIdx++) {
                        if (selectedIndices.includes(currentIdx)) {
                          newRows[tableIdx].rows.splice(rowIdx, 1)
                          rowIdx-- // Adjust index after deletion
                        }
                        currentIdx++
                      }
                    }
                    setRows(newRows)
                    setSelectedRows(new Set())
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-all duration-200 shadow-lg hover:shadow-xl text-sm font-medium"
                >
                  <Trash2 size={16} />
                  Delete selected ({selectedRows.size})
                </button>
              )}
              <button
                onClick={onEditMapping}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all duration-200 shadow-lg hover:shadow-xl text-sm font-medium"
              >
                <Pencil size={16} />
                Edit Field Mapping
              </button>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white overflow-hidden">
          <div className="overflow-auto">
            <table className="min-w-full">
              <thead className="bg-gradient-to-r from-slate-50 to-blue-50 sticky top-0">
                {/* Render table name row only above the corresponding table's header */}
                {pagedRowsWithHeaders.map((item, i) => {
                  if (item.type === 'header' && item.name) {
                    return (
                      <tr key={`name-${item.groupIdx}-${i}`}>
                        <td colSpan={fieldConfig.length + (!readOnly ? 2 : 1)} className="py-3 px-4 text-lg font-bold text-blue-700 bg-blue-50 border-b border-slate-200 text-center">
                          {item.name}
                        </td>
                      </tr>
                    )
                  }
                  return null;
                })}
                <tr>
                  {!readOnly && (
                    <th className="py-4 px-4 border-b border-slate-200 w-8 text-center">
                      <input
                        type="checkbox"
                        className="accent-blue-600 w-4 h-4"
                        checked={pagedDataRows.length > 0 && pagedDataRows.every(row => isRowSelected(row.globalRowIdx))}
                        onChange={toggleSelectAllOnPage}
                        aria-label="Select all on page"
                      />
                    </th>
                  )}
                  {fieldConfig && fieldConfig.length > 0 ? (
                    fieldConfig.map((f, idx) => (
                      <th key={f.field || idx} className="px-4 py-4 text-left font-bold text-slate-800 border-b border-slate-200">
                        {f.label}
                      </th>
                    ))
                  ) : (
                    // Fallback headers when fieldConfig is not available
                    rows[0]?.header?.map((header, idx) => (
                      <th key={idx} className="px-4 py-4 text-left font-bold text-slate-800 border-b border-slate-200">
                        {header}
                      </th>
                    )) || []
                  )}
                  {!readOnly && <th className="py-4 px-4 border-b border-slate-200 w-40 text-slate-800 font-bold">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {pagedRowsWithHeaders.map((item, i) => {
                  if (item.type === 'row') {
                    const row = item.row
                    const globalIdx = item.globalRowIdx
                    const isEditing = editRowIdx === globalIdx
                    return (
                      <tr key={globalIdx} className={isEditing ? "bg-blue-50" : "hover:bg-slate-50 transition-colors"}>
                        {!readOnly && (
                          <td className="py-3 px-4 border-b border-slate-200 align-top text-center">
                            <input
                              type="checkbox"
                              className="accent-blue-600 w-4 h-4"
                              checked={isRowSelected(globalIdx)}
                              onChange={() => toggleRow(globalIdx)}
                              aria-label={`Select row ${globalIdx + 1}`}
                            />
                          </td>
                        )}
                        {Array.isArray(row) ? (
                          // Handle array format (legacy)
                          row.map((val: string, colIdx: number) => (
                            <td key={colIdx} className="py-3 px-4 border-b border-slate-200 align-top">
                              {isEditing
                                ? (
                                  <input
                                    value={editValues[colIdx] ?? ""}
                                    onChange={e => onEditCell(colIdx, e.target.value)}
                                    className="border border-slate-200 rounded-lg px-3 py-1 w-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                  />
                                )
                                : (
                                  (val && val.trim())
                                    ? <span className="text-slate-800 text-sm">{fixPercent(val)}</span>
                                    : <span className="text-slate-400">-</span>
                                  )
                              }
                            </td>
                          ))
                        ) : (
                          // Handle object format (new)
                          fieldConfig.map((field, colIdx: number) => {
                            const val = (row as Record<string, string>)[field.field] || ''
                            return (
                              <td key={colIdx} className="py-3 px-4 border-b border-slate-200 align-top">
                                {isEditing
                                  ? (
                                    <input
                                      value={editValues[colIdx] ?? ""}
                                      onChange={e => onEditCell(colIdx, e.target.value)}
                                      className="border border-slate-200 rounded-lg px-3 py-1 w-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    />
                                  )
                                  : (
                                    (val && val.trim())
                                      ? <span className="text-slate-800 text-sm">{fixPercent(val)}</span>
                                      : <span className="text-slate-400">-</span>
                                    )
                                }
                              </td>
                            )
                          })
                        )}
                        {!readOnly && (
                          <td className="py-3 px-4 border-b border-slate-200 align-top">
                            {!isEditing ? (
                              <div className="flex gap-2">
                                <button className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors" onClick={() => startEdit(globalIdx)} title="Edit">
                                  <Pencil size={16} />
                                </button>
                                <button className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors" onClick={() => deleteRow(globalIdx)} title="Delete">
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            ) : (
                              <div className="flex gap-2">
                                <button className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors" onClick={saveEdit} title="Save">
                                  <Check size={18} />
                                </button>
                                <button className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors" onClick={cancelEdit} title="Cancel">
                                  <X size={18} />
                                </button>
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    )
                  }
                  return null
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-4 p-4">
            <ProfessionalPagination
              currentPage={page}
              totalPages={pageCount}
              onPageChange={setPage}
            />
          </div>
        </div>
      </div>

      {/* Action Buttons - Fixed at bottom */}
      <div className="flex-shrink-0 bg-white border-t border-slate-200 p-6">
        <div className="flex justify-center gap-6">
          <button
            onClick={onReject}
            className="px-8 py-3 bg-gradient-to-r from-red-500 to-rose-600 text-white rounded-xl hover:shadow-xl transition-all duration-200 hover:scale-105 font-semibold"
            disabled={submitting}
          >
            {submitting ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Processing...
              </div>
            ) : (
              'Reject'
            )}
          </button>
          <button
            onClick={onApprove}
            className="px-8 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl hover:shadow-xl transition-all duration-200 hover:scale-105 font-semibold"
            disabled={submitting}
          >
            {submitting ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Processing...
              </div>
            ) : (
              'Approve'
            )}
          </button>
        </div>
      </div>

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-3xl p-8 shadow-2xl max-w-md w-full mx-4">
            <h3 className="text-xl font-bold text-slate-800 mb-4">Reject Submission</h3>
            <input
              className="w-full border border-slate-200 rounded-xl px-4 py-3 mb-6 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
              placeholder="Enter rejection reason"
              value={rejectReason}
              onChange={e => onRejectReasonChange?.(e.target.value)}
            />
            <div className="flex gap-3">
              <button
                className="flex-1 bg-gradient-to-r from-red-500 to-rose-600 text-white px-4 py-3 rounded-xl font-semibold disabled:opacity-50"
                disabled={!rejectReason.trim() || submitting}
                onClick={onRejectSubmit}
              >
                Submit
              </button>
              <button
                className="flex-1 bg-slate-200 text-slate-800 px-4 py-3 rounded-xl font-semibold hover:bg-slate-300 transition-colors"
                onClick={onCloseRejectModal}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </>
  )
}
