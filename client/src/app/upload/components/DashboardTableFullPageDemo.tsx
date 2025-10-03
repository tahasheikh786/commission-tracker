'use client'
import { useState, useEffect } from 'react'
import { 
  Pencil, 
  Trash2, 
  X, 
  Check, 
  Plus, 
  RotateCcw, 
  FileText,
  ChevronLeft,
  Search,
  MoreVertical,
  MoreHorizontal,
  Filter,
  Calendar,
  Eye,
  EyeOff,
  CheckCircle,
  ArrowLeft,
  PanelLeft,
  PanelLeftClose,
  Download,
  Printer,
  Maximize,
  Minimize,
  ZoomIn,
  ZoomOut,
  File,
  Sparkles,
} from 'lucide-react'
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

type DashboardTableFullPageDemoProps = {
  onClose?: () => void
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

// Demo data
const demoTables: TableData[] = [
  {
    name: "Commission Statement - January 2024",
    header: ["Agent Name", "Policy Number", "Premium Amount", "Commission Rate", "Commission Amount", "Statement Date"],
    rows: [
      { "Agent Name": "John Smith", "Policy Number": "POL-001", "Premium Amount": "$1,200.00", "Commission Rate": "15%", "Commission Amount": "$180.00", "Statement Date": "2024-01-15" },
      { "Agent Name": "Maria Garcia", "Policy Number": "POL-002", "Premium Amount": "$2,500.00", "Commission Rate": "12%", "Commission Amount": "$300.00", "Statement Date": "2024-01-16" },
      { "Agent Name": "Robert Johnson", "Policy Number": "POL-003", "Premium Amount": "$800.00", "Commission Rate": "18%", "Commission Amount": "$144.00", "Statement Date": "2024-01-17" },
      { "Agent Name": "Sarah Wilson", "Policy Number": "POL-004", "Premium Amount": "$3,200.00", "Commission Rate": "14%", "Commission Amount": "$448.00", "Statement Date": "2024-01-18" },
      { "Agent Name": "Michael Brown", "Policy Number": "POL-005", "Premium Amount": "$1,800.00", "Commission Rate": "16%", "Commission Amount": "$288.00", "Statement Date": "2024-01-19" }
    ]
  }
]

const demoFieldConfig: FieldConfig[] = [
  { field: "Agent Name", label: "Agent Name" },
  { field: "Policy Number", label: "Policy Number" },
  { field: "Premium Amount", label: "Premium Amount" },
  { field: "Commission Rate", label: "Commission Rate" },
  { field: "Commission Amount", label: "Commission Amount" },
  { field: "Statement Date", label: "Statement Date" }
]

export default function DashboardTableFullPageDemo({
  onClose
}: DashboardTableFullPageDemoProps) {
  
  // --- Main Table State (tracks edits/deletes) ---
  const [rows, setRows] = useState<TableData[]>(demoTables)
  
  // --- Table Editor Demo State ---
  const [searchTerm, setSearchTerm] = useState('')
  const [zoom, setZoom] = useState(1)
  const [showRowMenu, setShowRowMenu] = useState<{ tableIdx: number, rowIdx: number } | null>(null)
  const [showColumnMenu, setShowColumnMenu] = useState<{ tableIdx: number, colIdx: number } | null>(null)
  const [showHeaderActions, setShowHeaderActions] = useState<number | null>(null)
  const [showRowActions, setShowRowActions] = useState<{ tableIdx: number, rowIdx: number } | null>(null)
  const [hiddenColumns, setHiddenColumns] = useState<Set<number>>(new Set())
  const [columnWidths, setColumnWidths] = useState<Record<number, number>>({})
  const [isResizing, setIsResizing] = useState<number | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [editingCell, setEditingCell] = useState<{ tableIdx: number, rowIdx: number, colIdx: number, value: string } | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  
  
  
  // Format validation state
  const [rightFormatRow, setRightFormatRow] = useState<{ tableIdx: number, rowIdx: number } | null>(null)
  const [formatValidationResults, setFormatValidationResults] = useState<Record<number, any>>({})
  const [isGPTCorrecting, setIsGPTCorrecting] = useState(false)
  
  
  // Minimal loader state
  const [showMinimalLoader, setShowMinimalLoader] = useState(false)
  
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
  
  // Build allRows array when rows change
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
        const values = demoFieldConfig.map(field => (rowItem.row as Record<string, string>)[field.field] || '')
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
            demoFieldConfig.forEach((field, index) => {
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
  const deleteRow = (globalRowIdx: number) => {
    const newRows = [...rows]
    let currentIdx = 0
    
    for (let tableIdx = 0; tableIdx < newRows.length; tableIdx++) {
      for (let rowIdx = 0; rowIdx < newRows[tableIdx].rows.length; rowIdx++) {
        if (currentIdx === globalRowIdx) {
          newRows[tableIdx].rows.splice(rowIdx, 1)
          setRows(newRows)
          return
        }
        currentIdx++
      }
    }
  }

  // Demo handlers
  const handleApprove = () => {
    toast.success('Demo: Commission statement approved!')
    if (onClose) onClose()
  }

  const handleReject = () => {
    toast.error('Demo: Commission statement rejected!')
    if (onClose) onClose()
  }

  const handleEditMapping = () => {
    toast.success('Demo: Would navigate to field mapping')
  }

  const handleReset = () => {
    setRows(demoTables)
    setSelectedRows(new Set())
    setEditRowIdx(null)
    setEditValues([])
    toast.success('Demo: Reset to original data')
  }

  // --- Table Editor Demo Handlers ---
  const handleZoomIn = () => setZoom(z => Math.min(z + 0.2, 2))
  const handleZoomOut = () => setZoom(z => Math.max(z - 0.2, 0.5))

  const handleDownload = () => {
    toast.success('Downloading document...')
  }

  const handlePrint = () => {
    toast.success('Opening print dialog...')
    window.print()
  }

  const handleFullscreen = () => {
    setIsFullscreen(!isFullscreen)
    toast.success(isFullscreen ? 'Exiting fullscreen' : 'Entering fullscreen')
  }




  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest('[data-menu-trigger]') && !target.closest('[data-menu-content]')) {
        setShowHeaderActions(null)
        setShowRowActions(null)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  return (
    <div className={`fixed inset-0 bg-background z-50 flex flex-col ${isFullscreen ? 'z-[9999]' : ''}`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-border bg-card flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4 flex-wrap">
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-all duration-200 flex items-center cursor-pointer"
              title="Regresar"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}
          <h2 className="text-2xl font-bold text-foreground">Dashboard Table Full Page Demo</h2>
          <span className="text-sm text-muted-foreground bg-muted px-4 py-2 rounded-lg border border-border shadow-sm">
            commission_statement_demo.pdf
          </span>
          <div className="flex items-center gap-2 bg-emerald-100 dark:bg-emerald-900/30 px-4 py-2 rounded-lg border border-emerald-200 dark:border-emerald-800">
            <Calendar className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span className="text-sm text-emerald-800 dark:text-emerald-300 font-medium">
              Statement Date: 2024-01-20
            </span>
          </div>
          
        </div>
        
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-row gap-4 p-4 bg-background min-h-0 overflow-hidden max-h-full">
        {/* Document Preview - Left Side */}
        {showPreview && (
          <div className="w-2/5 bg-card rounded-2xl shadow-xl border border-border overflow-hidden flex flex-col min-h-0">
            <div className="bg-card border-b border-border shadow-sm flex-shrink-0">
              <div className="flex items-center justify-between h-12 px-3 bg-muted/50 border-b border-border">
                {/* Left Side - Document Info and Zoom */}
                <div className="flex items-center gap-6">
                  {/* Document Info */}
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-red-500 rounded flex items-center justify-center">
                      <File className="w-3 h-3 text-white" />
                    </div>
                    <span className="text-sm font-medium text-foreground">
                      Document Preview
                    </span>
                  </div>
                </div>

                {/* Right Side - Document Actions */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={handleDownload}
                    className="p-2 bg-background border border-border hover:bg-blue-500 hover:border-blue-500 hover:text-white transition-all duration-200 flex items-center justify-center cursor-pointer hover:shadow-sm rounded-lg"
                    title="Download document"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handlePrint}
                    className="p-2 bg-background border border-border hover:bg-green-500 hover:border-green-500 hover:text-white transition-all duration-200 flex items-center justify-center cursor-pointer hover:shadow-sm rounded-lg"
                    title="Print document"
                  >
                    <Printer className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleFullscreen}
                    className="p-2 bg-background border border-border hover:bg-purple-500 hover:border-purple-500 hover:text-white transition-all duration-200 flex items-center justify-center cursor-pointer hover:shadow-sm rounded-lg"
                    title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                  >
                    {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
            <div className="flex-1 flex items-center justify-center bg-muted/30 p-4 overflow-hidden">
              <div className="text-center">
                <FileText className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                <p className="text-foreground font-medium">PDF Preview</p>
                <p className="text-sm text-muted-foreground">Commission Statement Demo</p>
                <div className="mt-4 text-xs text-muted-foreground">
                  Zoom: {Math.round(zoom * 100)}%
                </div>
              </div>
            </div>
            
            {/* PDF Footer */}
            <div className="border-t border-border bg-muted/30 px-4 py-3 flex items-center justify-end flex-shrink-0">
              {/* Right Side - Zoom Controls */}
              <div className="flex items-center gap-1">
                <button
                  onClick={handleZoomOut}
                  className="p-2 bg-background border border-border hover:bg-red-500 hover:border-red-500 hover:text-white transition-all duration-200 flex items-center justify-center cursor-pointer hover:shadow-sm rounded-lg"
                  title="Zoom out"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <div className="bg-background border border-border rounded-lg px-3 py-2 min-w-[70px] text-center shadow-sm">
                  <span className="text-sm text-foreground font-medium">
                    {Math.round(zoom * 100)}%
                  </span>
                </div>
                <button
                  onClick={handleZoomIn}
                  className="p-2 bg-background border border-border hover:bg-green-500 hover:border-green-500 hover:text-white transition-all duration-200 flex items-center justify-center cursor-pointer hover:shadow-sm rounded-lg"
                  title="Zoom in"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Table Editor - Right Side */}
        <div className={`${showPreview ? 'w-3/5' : 'w-full'} min-w-0 flex flex-col rounded-2xl shadow-xl bg-card border border-border overflow-hidden relative min-h-0 max-h-full`}>
          {/* Table Header - Excel/Google Sheets Style */}
          <div className="bg-card border-b border-border shadow-sm flex-shrink-0">
            <div className="flex items-center h-12 px-3 bg-muted/50 border-b border-border">
              {/* Table Info */}
              <div className="flex items-center gap-1 mr-6">
                <button
                  onClick={() => setShowPreview(!showPreview)}
                  className="p-2 bg-background border border-border hover:bg-blue-500 hover:border-blue-500 hover:text-white transition-all duration-200 flex items-center justify-center cursor-pointer hover:shadow-sm rounded-lg"
                  title={showPreview ? 'Close Document Preview' : 'Open Document Preview'}
                >
                  {showPreview ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeft className="w-4 h-4" />}
                </button>
              </div>

              {/* Toolbar */}
              <div className="flex items-center justify-between w-full min-h-[48px] flex-wrap gap-2">
                {/* Left Side - Table Tools */}
                <div className="flex items-center gap-1 flex-1 flex-wrap">
                  {/* Search */}
                  <div className="relative mr-6">
                    <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 transition-colors duration-200 ${searchTerm ? 'text-blue-500' : 'text-muted-foreground'}`} />
                    <input
                      type="text"
                      placeholder="Search tables..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className={`pl-10 pr-8 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent bg-background text-foreground text-sm focus:outline-none transition-all duration-200 ${
                        searchTerm 
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20' 
                          : 'border-input hover:border-border'
                      }`}
                    />
                    {searchTerm && (
                      <button
                        onClick={() => setSearchTerm('')}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors duration-200 cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>


                  {/* Separator */}
                  <div className="h-6 w-px bg-border mr-6"></div>

                  {/* Format Tools */}
                  <div className="flex items-center gap-1 mr-6">
                  </div>
                </div>

                {/* Right Side - Undo/Redo */}
                <div className="flex items-center gap-2">
                  {/* Delete Selected */}
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
                        toast.success(`Deleted ${selectedRows.size} selected rows`)
                      }}
                      className="px-3 py-2 bg-red-600 text-white border border-red-600 hover:bg-red-700 hover:border-red-700 transition-all duration-200 flex items-center gap-2 cursor-pointer hover:shadow-sm rounded-lg"
                      title="Delete selected rows"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span className="text-sm font-medium">Delete Selected ({selectedRows.size})</span>
                    </button>
                  )}

                </div>
              </div>
            </div>
          </div>

          {/* Table Content */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <div className="bg-card border rounded-xl shadow-lg border-border h-full flex flex-col overflow-hidden">
              <div className="flex-1 overflow-auto">
                <table className="w-full min-w-full">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-muted/50">
                      {/* Checkbox column */}
                      <th className="px-4 py-4 text-left text-xs font-bold text-muted-foreground border-b border-border w-12">
                        <input
                          type="checkbox"
                          checked={selectedRows.size === pagedDataRows.length && pagedDataRows.length > 0}
                          onChange={(e) => {
                            if (e.target.checked) {
                              pagedDataRows.forEach(row => selectedRows.add(row.globalRowIdx))
                            } else {
                              pagedDataRows.forEach(row => selectedRows.delete(row.globalRowIdx))
                            }
                            setSelectedRows(new Set(selectedRows))
                          }}
                          className="w-4 h-4 text-blue-500 bg-background border-input rounded focus:ring-blue-500 focus:ring-2 hover:border-blue-400 transition-all duration-200"
                        />
                      </th>
                      {demoFieldConfig.map((field, colIdx) => (
                        <th
                          key={colIdx}
                          className="px-3 py-3 text-left text-xs font-medium text-muted-foreground border-b border-border border-r border-border last:border-r-0 whitespace-nowrap relative"
                        >
                          <div className="flex items-center justify-between">
                            <span className="truncate flex-1">{field.label}</span>
                          </div>
                        </th>
                      ))}
                      <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground border-b border-border border-r border-border w-24 relative">
                        <div className="flex items-center justify-between">
                          <span>Actions</span>
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedRowsWithHeaders.map((item, i) => {
                      if (item.type === 'row') {
                        const row = item.row
                        const globalIdx = item.globalRowIdx
                        const isEditing = editRowIdx === globalIdx
                        const isSummary = false
                        
                        return (
                          <tr key={globalIdx} className="hover:bg-muted/50 group relative transition-all duration-200 hover:shadow-sm">
                            {/* Checkbox column */}
                            <td className="px-4 py-3 text-xs text-foreground border-b border-border border-r border-border">
                              <input
                                type="checkbox"
                                checked={isRowSelected(globalIdx)}
                                onChange={() => toggleRow(globalIdx)}
                                className="w-4 h-4 text-blue-500 bg-background border-input rounded focus:ring-blue-500 focus:ring-2 hover:border-blue-400 transition-all duration-200"
                              />
                            </td>
                            {Array.isArray(row) ? (
                              // Handle array format (legacy)
                              row.map((val: string, colIdx: number) => (
                                <td key={colIdx} className="px-3 py-3 text-xs text-foreground border-b border-border border-r border-border last:border-r-0 whitespace-nowrap">
                                  {isEditing
                                    ? (
                                      <input
                                        value={editValues[colIdx] ?? ""}
                                        onChange={e => onEditCell(colIdx, e.target.value)}
                                        className="w-full px-2 py-1 border border-blue-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs transition-all duration-200 bg-background text-foreground"
                                        autoFocus
                                      />
                                    )
                                    : (
                                      <div
                                        className="cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg px-2 py-1 transition-all duration-200 truncate hover:shadow-sm"
                                        title={val}
                                      >
                                        {val}
                                      </div>
                                    )
                                  }
                                </td>
                              ))
                            ) : (
                              // Handle object format (new)
                              demoFieldConfig.map((field, colIdx: number) => {
                                const val = (row as Record<string, string>)[field.field] || ''
                                return (
                                  <td key={colIdx} className="px-3 py-3 text-xs text-foreground border-b border-border border-r border-border last:border-r-0 whitespace-nowrap">
                                    {isEditing
                                      ? (
                                        <input
                                          value={editValues[colIdx] ?? ""}
                                          onChange={e => onEditCell(colIdx, e.target.value)}
                                          className="w-full px-2 py-1 border border-blue-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs transition-all duration-200 bg-background text-foreground"
                                          autoFocus
                                        />
                                      )
                                      : (
                                        <div
                                          className="cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg px-2 py-1 transition-all duration-200 truncate hover:shadow-sm"
                                          title={val}
                                        >
                                          {val}
                                        </div>
                                      )
                                    }
                                  </td>
                                )
                              })
                            )}
                            <td className="px-3 py-3 text-xs text-foreground border-b border-border border-r border-border relative">
                              {!isEditing ? (
                                <div className="flex gap-2">
                                  <button 
                                    className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition-all duration-200 hover:shadow-sm cursor-pointer"
                                    onClick={() => startEdit(globalIdx)}
                                    title="Edit"
                                  >
                                    <Pencil size={12} />
                                  </button>
                                  <button 
                                    className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-all duration-200 hover:shadow-sm cursor-pointer"
                                    onClick={() => deleteRow(globalIdx)}
                                    title="Delete"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex gap-2">
                                  <button 
                                    className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all duration-200 hover:shadow-sm cursor-pointer"
                                    onClick={saveEdit}
                                    title="Save"
                                  >
                                    <Check size={12} />
                                  </button>
                                  <button 
                                    className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg transition-all duration-200 hover:shadow-sm cursor-pointer"
                                    onClick={cancelEdit}
                                    title="Cancel"
                                  >
                                    <X size={12} />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        )
                      }
                      return null
                    })}
                  </tbody>
                </table>
              </div>
              
              {/* Table Footer */}
              <div className="border-t border-border bg-muted/30 px-4 py-3 flex items-center justify-between flex-shrink-0">
                {/* Left Side - Table Info and Actions */}
                <div className="flex items-center gap-4">
                  {/* Table Name */}
                  <div className="flex items-center gap-2 bg-background rounded-lg px-3 py-2">
                    <div className="w-5 h-5 bg-blue-500 rounded flex items-center justify-center">
                      <span className="text-white text-xs font-bold">T</span>
                    </div>
                    <span className="text-sm text-foreground font-medium truncate block min-w-[140px] max-w-[200px]" title={rows[0]?.name || 'Untitled Table'}>
                      {rows[0]?.name || 'Untitled Table'}
                    </span>
                  </div>
                  
                  {/* Separator */}
                  <div className="h-6 w-px bg-border"></div>
                  
                  {/* Table Actions */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleEditMapping}
                      className="px-3 py-2 bg-background border border-border hover:bg-blue-500 hover:border-blue-500 hover:text-white transition-all duration-200 flex items-center gap-2 cursor-pointer hover:shadow-sm rounded-lg"
                      title="Edit field mapping"
                    >
                      <Pencil className="w-4 h-4" />
                      <span className="text-sm font-medium">Edit Mapping</span>
                    </button>
                  </div>
                </div>
                
                {/* Right Side - Navigation Buttons */}
                <div className="flex items-center gap-3">
                  {/* Table Navigation Info */}
                  <div className="flex items-center gap-2 bg-background rounded-lg px-3 py-2">
                    <span className="text-sm font-medium text-foreground">
                      Showing {startIdx + 1}-{Math.min(endIdx, allRows.length)} of {allRows.length} items
                    </span>
                  </div>
                  
                  {/* Pagination */}
                  <div className="mt-4">
                    <ProfessionalPagination
                      currentPage={page}
                      totalPages={pageCount}
                      onPageChange={setPage}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      {!isFullscreen && (
        <div className="bg-card border-t border-border px-4 py-2 shadow-lg flex-shrink-0">
          <div className="flex items-center justify-between">
            {/* Left side - Info */}
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">
                {allRows.length} total rows
              </span>
              <div className="flex items-center gap-1 text-sm text-green-600">
                <Calendar className="w-3 h-3" />
                <span>Date: 2024-01-20</span>
              </div>
            </div>

            {/* Center - Progress Bar */}
            <div className="flex-1 flex justify-center px-4">
              <div className="scale-75">
                <ProgressBar currentStep="dashboard" />
              </div>
            </div>

            {/* Right side - Buttons */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleReset}
                className="px-4 py-2 bg-background border border-border hover:bg-orange-500 hover:border-orange-500 hover:text-white transition-all duration-200 flex items-center gap-2 cursor-pointer hover:shadow-sm rounded-lg"
                title="Reset data"
              >
                <RotateCcw className="w-4 h-4" />
                <span className="text-sm font-medium">Reset</span>
              </button>
              <button
                onClick={handleReject}
                className="px-4 py-2 bg-background border border-border hover:bg-red-500 hover:border-red-500 hover:text-white transition-all duration-200 flex items-center gap-2 cursor-pointer hover:shadow-sm rounded-lg"
                title="Reject statement"
              >
                <X className="w-4 h-4" />
                <span className="text-sm font-medium">Reject</span>
              </button>
              <button
                onClick={handleApprove}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 font-medium cursor-pointer"
              >
                <Check className="w-4 h-4" />
                Approve
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

