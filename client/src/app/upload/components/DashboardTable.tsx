'use client'
import { useState, useEffect } from 'react'
import { Pencil, Trash2, X, Check, Clock } from 'lucide-react'
import clsx from 'clsx'

type TableData = {
  header: string[]
  rows: string[][]
  name?: string // <-- add table name support
}

type FieldConfig = { field: string, label: string }

type DashboardTableProps = {
  tables: TableData[],
  fieldConfig: FieldConfig[],
  onEditMapping: () => void,
  company?: { id: string, name: string } | null,
  fileName?: string,
  fileUrl?: string | null,
  readOnly?: boolean,
  onTableChange?: (tables: TableData[]) => void,
  planTypes?: string[],
  onSendToPending?: () => void,
  uploadId?: string
}

function fixPercent(val: string): string {
  if (!val) return val
  return val
    .replace(/\bolo\b/g, '%')
    .replace(/\b010\b/g, '%')
    .replace(/OLO/g, '%')
    .replace(/010/g, '%')
}

function Pagination({
  page, setPage, pageCount
}: { page: number, setPage: (n: number) => void, pageCount: number }) {
  return (
    <div className="flex justify-center mt-4 space-x-2">
      <button disabled={page <= 1}
        className="px-2 py-1 rounded border bg-white hover:bg-gray-100 disabled:opacity-40"
        onClick={() => setPage(page - 1)}
      >Prev</button>
      {Array.from({ length: pageCount }, (_, i) => (
        <button key={i}
          onClick={() => setPage(i + 1)}
          className={clsx(
            "px-2 py-1 rounded border",
            page === i + 1 ? "bg-blue-600 text-white" : "bg-white hover:bg-gray-100"
          )}
        >{i + 1}</button>
      ))}
      <button disabled={page >= pageCount}
        className="px-2 py-1 rounded border bg-white hover:bg-gray-100 disabled:opacity-40"
        onClick={() => setPage(page + 1)}
      >Next</button>
    </div>
  )
}

const ROWS_OPTIONS = [10, 25, 50]

export default function DashboardTable({
  tables,
  fieldConfig,
  onEditMapping,
  company,
  fileName,
  fileUrl,
  readOnly = false,
  onTableChange,
  planTypes = [],
  onSendToPending,
  uploadId,
}: DashboardTableProps) {
  console.log('DashboardTable received tables:', tables)
  console.log('DashboardTable received fieldConfig:', fieldConfig)
  
  // --- Main Table State (tracks edits/deletes) ---
  const [rows, setRows] = useState<TableData[]>(tables)
  // If `tables` prop changes (new upload, remap, etc), update local state
  useEffect(() => {
    console.log('DashboardTable updating rows with:', tables)
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
    name?: string // <-- add name for group
  } | {
    type: 'row',
    groupIdx: number,
    row: string[],
    globalRowIdx: number
  }
  const allRows: RowWithGroup[] = []
  let runningIdx = 0
  rows.forEach((table, groupIdx) => {
    allRows.push({ type: 'header', groupIdx, header: table.header, name: table.name })
    table.rows.forEach(row => {
      allRows.push({ type: 'row', groupIdx, row, globalRowIdx: runningIdx++ })
    })
  })

  // Pagination logic applies to only 'row' rows, not headers
  const dataRows = allRows.filter(r => r.type === 'row') as Extract<RowWithGroup, { type: 'row' }>[]
  const [page, setPage] = useState(1)
  const [rowsPerPage, setRowsPerPage] = useState(ROWS_OPTIONS[0])
  const pageCount = Math.max(1, Math.ceil(dataRows.length / rowsPerPage))
  const pagedDataRows = dataRows.slice((page - 1) * rowsPerPage, page * rowsPerPage)

  // To show headers with paginated rows, build a new "pagedRowsWithHeaders" array:
  const pagedRowsWithHeaders: RowWithGroup[] = []
  let lastGroupIdx: number | null = null
  pagedDataRows.forEach(row => {
    if (lastGroupIdx !== row.groupIdx) {
      pagedRowsWithHeaders.push({
        type: 'header',
        groupIdx: row.groupIdx,
        header: rows[row.groupIdx]?.header ?? [],
        name: rows[row.groupIdx]?.name
      })
      lastGroupIdx = row.groupIdx
    }
    pagedRowsWithHeaders.push(row)
  })

  // Selections tracked by globalRowIdx
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set())
  function isRowSelected(idx: number) {
    return selectedRows.has(idx)
  }
  function toggleRow(idx: number) {
    setSelectedRows(sel => {
      const next = new Set(sel)
      if (next.has(idx)) {
        next.delete(idx)
      } else {
        next.add(idx)
      }
      return next
    })
  }
  function toggleSelectAllOnPage() {
    const allSelected = pagedDataRows.every(row => isRowSelected(row.globalRowIdx))
    setSelectedRows(sel => {
      const next = new Set(sel)
      pagedDataRows.forEach(row => {
        if (allSelected) next.delete(row.globalRowIdx)
        else next.add(row.globalRowIdx)
      })
      return next
    })
  }
  function deleteSelectedRowsOnPage() {
    let rowIdx = 0
    const newTables = rows.map((table) => {
      const newRows = table.rows.filter(() => {
        const keep = !selectedRows.has(rowIdx)
        rowIdx++
        return keep
      })
      return { ...table, rows: newRows }
    })
    setSelectedRows(new Set())
    setPage(1)
    setRows(newTables)
  }
  function deleteRow(globalRowIdx: number) {
    let idx = 0
    const newTables = rows.map(table => {
      const newRows = table.rows.filter(() => {
        if (idx === globalRowIdx) {
          idx++
          return false
        }
        idx++
        return true
      })
      return { ...table, rows: newRows }
    })
    setRows(newTables)
    setSelectedRows(sel => {
      const next = new Set(sel)
      next.delete(globalRowIdx)
      return next
    })
    setPage(1)
  }

  // Editing logic
  const [editRowIdx, setEditRowIdx] = useState<number | null>(null)
  const [editValues, setEditValues] = useState<string[]>([])
  function startEdit(globalRowIdx: number) {
    setEditRowIdx(globalRowIdx)
    let idx = 0
    let foundRow: string[] = []
    rows.forEach(table => {
      table.rows.forEach(row => {
        if (idx === globalRowIdx) foundRow = row
        idx++
      })
    })
    setEditValues([...foundRow])
  }
  function cancelEdit() {
    setEditRowIdx(null)
    setEditValues([])
  }
  function saveEdit() {
    let idx = 0
    const newTables = rows.map(table => {
      const newRows = table.rows.map((row) => {
        if (idx === editRowIdx) {
          idx++
          return editValues
        }
        idx++
        return row
      })
      return { ...table, rows: newRows }
    })
    setRows(newTables)
    setEditRowIdx(null)
    setEditValues([])
  }
  function onEditCell(i: number, v: string) {
    setEditValues(vals => vals.map((val, idx) => idx === i ? v : val))
  }

  // Show message if empty
  const allDataRows = rows.flatMap(t => t.rows)
  if (!allDataRows.length) {
    return <div className="text-gray-500 text-center my-10">No dashboard data found in the extracted table.</div>
  }

  return (
    <div className="mt-8 mb-20 shadow-lg rounded-2xl p-5 border bg-white overflow-x-auto w-full">
      {planTypes && planTypes.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2 items-center">
          <span className="font-semibold text-gray-700 text-base mr-2">Plan Types:</span>
          {planTypes.map(pt => (
            <span key={pt} className="inline-block px-3 py-1 rounded-full bg-blue-100 text-blue-700 font-medium text-sm border border-blue-300">
              {pt.charAt(0).toUpperCase() + pt.slice(1)}
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2 px-2">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">Rows per page:</label>
          <select
            value={rowsPerPage}
            onChange={e => { setRowsPerPage(Number(e.target.value)); setPage(1) }}
            className="border rounded px-2 py-1 text-sm shadow-sm focus:ring-2 focus:ring-blue-200"
          >
            {ROWS_OPTIONS.map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>
        <div className="text-sm text-gray-600">
          Showing <span className="font-semibold">{(page - 1) * rowsPerPage + 1}-{Math.min(page * rowsPerPage, dataRows.length)}</span> of <span className="font-semibold">{dataRows.length}</span> items
        </div>
        {!readOnly && (
          <>
            <button
              className={clsx(
                "flex items-center px-3 py-1.5 rounded bg-red-600 text-white font-medium shadow hover:bg-red-700 transition",
                selectedRows.size > 0 ? "" : "opacity-50 cursor-not-allowed"
              )}
              disabled={selectedRows.size === 0}
              onClick={deleteSelectedRowsOnPage}
            >
              <Trash2 size={16} className="mr-1" />
              Delete selected
            </button>
            <button
              onClick={onEditMapping}
              className="px-4 py-2 rounded bg-gradient-to-br from-blue-600 to-indigo-500 text-white font-semibold shadow hover:scale-105 transition"
            >
              Edit Field Mapping
            </button>
            {onSendToPending && (
              <button
                onClick={onSendToPending}
                className="px-4 py-2 rounded bg-gradient-to-br from-orange-500 to-red-500 text-white font-semibold shadow hover:scale-105 transition flex items-center gap-2"
              >
                <Clock size={16} />
                Send to Pending
              </button>
            )}
          </>
        )}
       
      </div>
      <table className="min-w-full">
        <thead className="bg-gradient-to-br from-blue-100 to-purple-50">
          {/* Render table name row only above the corresponding table's header */}
          {pagedRowsWithHeaders.map((item, i) => {
            if (item.type === 'header' && item.name) {
              return (
                <tr key={`name-${item.groupIdx}-${i}`}>
                  <td colSpan={fieldConfig.length + (!readOnly ? 2 : 1)} className="py-2 px-4 text-lg font-bold text-blue-700 bg-blue-50 border-b text-center">
                    {item.name}
                  </td>
                </tr>
              )
            }
            return null;
          })}
          <tr>
            {!readOnly && (
              <th className="py-3 px-3 border-b w-8 text-center">
                <input
                  type="checkbox"
                  className="accent-blue-600 w-4 h-4"
                  checked={pagedDataRows.length > 0 && pagedDataRows.every(row => isRowSelected(row.globalRowIdx))}
                  onChange={toggleSelectAllOnPage}
                  aria-label="Select all on page"
                />
              </th>
            )}
            {fieldConfig.map((f, idx) => (
              <th key={f.field || idx} className="px-4 py-3 text-left font-bold text-gray-700 border-b">
                {f.label}
              </th>
            ))}
            {!readOnly && <th className="py-3 px-2 border-b w-40">Actions</th>}
          </tr>
        </thead>
        <tbody>
         
          {pagedRowsWithHeaders.map((item, i) => {
            if (item.type === 'row') {
              const row = item.row
              const globalIdx = item.globalRowIdx
              const isEditing = editRowIdx === globalIdx
              return (
                <tr key={globalIdx} className={isEditing ? "bg-blue-50" : "hover:bg-gray-50"}>
                  {!readOnly && (
                    <td className="py-2 px-3 border-b align-top text-center">
                      <input
                        type="checkbox"
                        className="accent-blue-600 w-4 h-4"
                        checked={isRowSelected(globalIdx)}
                        onChange={() => toggleRow(globalIdx)}
                        aria-label={`Select row ${globalIdx + 1}`}
                      />
                    </td>
                  )}
                  {row.map((val: string, colIdx: number) => (
                    <td key={colIdx} className="py-2 px-4 border-b align-top">
                      {isEditing
                        ? (
                          <input
                            value={editValues[colIdx] ?? ""}
                            onChange={e => onEditCell(colIdx, e.target.value)}
                            className="border rounded px-2 py-1 w-full text-sm"
                          />
                        )
                        : (
                          (val && val.trim())
                            ? <span className="text-gray-800 text-sm">{fixPercent(val)}</span>
                            : <span className="text-gray-400">-</span>
                        )
                      }
                    </td>
                  ))}
                  {!readOnly && (
                    <td className="py-2 px-2 border-b align-top">
                      {!isEditing ? (
                        <div className="flex flex-wrap gap-2">
                          <button className="p-1 text-blue-500 hover:bg-blue-50 rounded" onClick={() => startEdit(globalIdx)} title="Edit">
                            <Pencil size={18} />
                          </button>
                          <button className="p-1 text-red-500 hover:bg-red-50 rounded" onClick={() => deleteRow(globalIdx)} title="Delete">
                            <Trash2 size={18} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex space-x-2">
                          <button className="p-1 text-green-600 hover:bg-green-100 rounded" onClick={saveEdit} title="Save">
                            <Check size={20} />
                          </button>
                          <button className="p-1 text-gray-600 hover:bg-gray-200 rounded" onClick={cancelEdit} title="Cancel">
                            <X size={20} />
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
      <Pagination
        page={page}
        setPage={setPage}
        pageCount={pageCount}
      />
    </div>
  )
}
