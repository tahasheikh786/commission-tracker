'use client'
import { useState, useRef, useEffect } from 'react'
import { 
  Pencil, 
  Trash2, 
  Plus, 
  Save, 
  RotateCcw, 
  Download, 
  Upload,
  Eye,
  EyeOff,
  ArrowUp,
  ArrowDown,
  Copy,
  Scissors,
  FileText,
  Settings,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  Filter,
  Search,
  MoreVertical,
  Edit3,
  UserPlus,
  UserMinus,
  ZoomIn,
  ZoomOut,
  ExternalLink,
  Merge,
  Undo2
} from 'lucide-react'
import { toast } from 'react-hot-toast'

type TableData = {
  header: string[]
  rows: string[][]
  name?: string
  id?: string
  extractor?: string
  metadata?: {
    extraction_method?: string
    [key: string]: any
  }
}

type TableEditorProps = {
  tables: TableData[]
  onTablesChange: (tables: TableData[]) => void
  onSave: (tables: TableData[]) => void
  onUseAnotherExtraction: () => void
  onGoToFieldMapping: () => void
  onGoToPreviousExtraction?: () => void
  onClose?: () => void
  uploaded?: any
  loading?: boolean
  extractionHistory?: TableData[][]
  currentExtractionIndex?: number
  isUsingAnotherExtraction?: boolean
  hasUsedAnotherExtraction?: boolean
}

type CellEdit = {
  tableIdx: number
  rowIdx: number
  colIdx: number
  value: string
}

type RowEdit = {
  tableIdx: number
  rowIdx: number
  values: string[]
}

type MergeHistory = {
  tableIdx: number
  col1Idx: number
  col2Idx: number
  originalHeader: string[]
  originalRows: string[][]
  timestamp: number
}

// Copy exact strategy from CompareModal
function getPdfUrl(uploaded: any) {
  if (!uploaded?.file_name) {
    console.log('getPdfUrl: No file_name found in uploaded object:', uploaded);
    return null;
  }
  const baseUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/api$/, '');
  const url = `${baseUrl}/pdfs/${encodeURIComponent(uploaded.file_name)}`;
  console.log('getPdfUrl:', {
    file_name: uploaded.file_name,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    baseUrl: baseUrl,
    encoded: encodeURIComponent(uploaded.file_name),
    finalUrl: url
  });
  return url;
}

export default function TableEditor({
  tables,
  onTablesChange,
  onSave,
  onUseAnotherExtraction,
  onGoToFieldMapping,
  onGoToPreviousExtraction,
  onClose,
  uploaded,
  loading = false,
  extractionHistory = [],
  currentExtractionIndex = 0,
  isUsingAnotherExtraction = false,
  hasUsedAnotherExtraction = false
}: TableEditorProps) {
  const [currentTableIdx, setCurrentTableIdx] = useState(0)
  const [editingCell, setEditingCell] = useState<CellEdit | null>(null)
  const [editingRow, setEditingRow] = useState<RowEdit | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [undoStack, setUndoStack] = useState<TableData[][]>([])
  const [redoStack, setRedoStack] = useState<TableData[][]>([])
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [showRowMenu, setShowRowMenu] = useState<{ tableIdx: number, rowIdx: number } | null>(null)
  const [showColumnMenu, setShowColumnMenu] = useState<{ tableIdx: number, colIdx: number } | null>(null)
  const [mergeSelection, setMergeSelection] = useState<{ tableIdx: number, colIdx: number } | null>(null)
  const [mergeHistory, setMergeHistory] = useState<MergeHistory[]>([])
  
  const fileInputRef = useRef<HTMLInputElement>(null)
  const embedRef = useRef<HTMLDivElement>(null)
  const rowMenuRef = useRef<HTMLDivElement>(null)

  const pdfDisplayUrl = getPdfUrl(uploaded)

  // Helper functions for extraction method detection
  const getCurrentExtractionMethod = () => {
    if (tables.length === 0) return null
    // Check if all tables have the same extractor
    const extractors = tables.map(table => {
      // Check multiple possible locations for extraction method
      const extractor = table.extractor || 
                       table.metadata?.extraction_method || 
                       table.metadata?.extractor
      
      if (extractor) return extractor
      
      // Check if table name suggests Docling
      if (table.name?.toLowerCase().includes('docling')) return 'docling'
      
      return null
    }).filter(Boolean)
    
    if (extractors.length === 0) {
      // If no explicit extractor found, check if it looks like Docling extraction
      // Docling often produces tables with specific characteristics
      const hasDoclingCharacteristics = tables.some(table => 
        table.header.some(header => 
          header.toLowerCase().includes('client') || 
          header.toLowerCase().includes('agent') ||
          header.toLowerCase().includes('policy') ||
          header.toLowerCase().includes('commission')
        )
      )
      return hasDoclingCharacteristics ? 'docling' : null
    }
    return extractors[0]
  }

  // Clean up column names and debug logging
  useEffect(() => {
    // Clean up repeating column names
    const cleanedTables = tables.map(table => ({
      ...table,
      header: cleanColumnNames(table.header)
    }))
    
    // Only update if there are changes
    const hasChanges = cleanedTables.some((table, idx) => 
      JSON.stringify(table.header) !== JSON.stringify(tables[idx].header)
    )
    
    if (hasChanges) {
      onTablesChange(cleanedTables)
    }
    

  }, [tables, extractionHistory, currentExtractionIndex])

  const isDoclingExtraction = () => {
    const method = getCurrentExtractionMethod()
    return method === 'docling' || method === 'docling_Docling'
  }

  const hasExtractionHistory = () => {
    return extractionHistory.length > 1
  }

  const canGoToPreviousExtraction = () => {
    return hasExtractionHistory() && currentExtractionIndex > 0
  }

  // Clean up repeating column names (e.g., "Client Account.Client Account" -> "Client Account")
  const cleanColumnNames = (headers: string[]) => {
    return headers.map(header => {
      // Check if header contains a period and has repeating text
      if (header.includes('.')) {
        const parts = header.split('.')
        if (parts.length === 2 && parts[0].trim() === parts[1].trim()) {
          return parts[0].trim()
        }
      }
      return header
    })
  }

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element
      
      // Close row menu if clicking outside
      if (showRowMenu && !target.closest('[data-row-menu]')) {
        setShowRowMenu(null)
      }
      
      // Close column menu if clicking outside
      if (showColumnMenu && !target.closest('[data-column-menu]')) {
        setShowColumnMenu(null)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showRowMenu, showColumnMenu])

  // Save current state to undo stack before making changes
  const saveToUndoStack = () => {
    setUndoStack(prev => [...prev, JSON.parse(JSON.stringify(tables))])
    setRedoStack([]) // Clear redo stack when new action is performed
    setHasUnsavedChanges(true)
  }

  // Undo functionality
  const undo = () => {
    if (undoStack.length === 0) return
    
    const previousState = undoStack[undoStack.length - 1]
    const currentState = JSON.parse(JSON.stringify(tables))
    
    setRedoStack(prev => [...prev, currentState])
    setUndoStack(prev => prev.slice(0, -1))
    onTablesChange(previousState)
  }

  // Redo functionality
  const redo = () => {
    if (redoStack.length === 0) return
    
    const nextState = redoStack[redoStack.length - 1]
    const currentState = JSON.parse(JSON.stringify(tables))
    
    setUndoStack(prev => [...prev, currentState])
    setRedoStack(prev => prev.slice(0, -1))
    onTablesChange(nextState)
  }

  // Row operations
  const addRowAbove = (tableIdx: number, rowIdx: number) => {
    saveToUndoStack()
    const newTables = [...tables]
    const newRow = new Array(newTables[tableIdx].header.length).fill('')
    newTables[tableIdx].rows.splice(rowIdx, 0, newRow)
    onTablesChange(newTables)
    toast.success('Row added above')
    setShowRowMenu(null)
  }

  const addRowBelow = (tableIdx: number, rowIdx: number) => {
    saveToUndoStack()
    const newTables = [...tables]
    const newRow = new Array(newTables[tableIdx].header.length).fill('')
    newTables[tableIdx].rows.splice(rowIdx + 1, 0, newRow)
    onTablesChange(newTables)
    toast.success('Row added below')
    setShowRowMenu(null)
  }

  const deleteRow = (tableIdx: number, rowIdx: number) => {
    saveToUndoStack()
    const newTables = [...tables]
    newTables[tableIdx].rows.splice(rowIdx, 1)
    onTablesChange(newTables)
    toast.success('Row deleted')
    setShowRowMenu(null)
  }

  const duplicateRow = (tableIdx: number, rowIdx: number) => {
    saveToUndoStack()
    const newTables = [...tables]
    const rowToDuplicate = [...newTables[tableIdx].rows[rowIdx]]
    newTables[tableIdx].rows.splice(rowIdx + 1, 0, rowToDuplicate)
    onTablesChange(newTables)
    toast.success('Row duplicated')
    setShowRowMenu(null)
  }

  // Column operations
  const addColumn = (tableIdx: number, colIdx: number, columnName: string = 'New Column') => {
    saveToUndoStack()
    const newTables = [...tables]
    
    // Add header
    newTables[tableIdx].header.splice(colIdx, 0, columnName)
    
    // Add empty cells to all rows
    newTables[tableIdx].rows.forEach(row => {
      row.splice(colIdx, 0, '')
    })
    
    onTablesChange(newTables)
    toast.success('Column added')
  }

  const deleteColumn = (tableIdx: number, colIdx: number) => {
    saveToUndoStack()
    const newTables = [...tables]
    
    // Remove header
    newTables[tableIdx].header.splice(colIdx, 1)
    
    // Remove cells from all rows
    newTables[tableIdx].rows.forEach(row => {
      row.splice(colIdx, 1)
    })
    
    onTablesChange(newTables)
    toast.success('Column deleted')
    setShowColumnMenu(null)
  }

  const renameColumn = (tableIdx: number, colIdx: number, newName: string) => {
    saveToUndoStack()
    const newTables = [...tables]
    newTables[tableIdx].header[colIdx] = newName
    onTablesChange(newTables)
    toast.success('Column renamed')
    setShowColumnMenu(null)
  }

  // Merge columns functionality
  const startMergeSelection = (tableIdx: number, colIdx: number) => {
    setMergeSelection({ tableIdx, colIdx })
    setShowColumnMenu(null)
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
    
    // Save original state for revert
    const originalHeader = [...table.header]
    const originalRows = table.rows.map(row => [...row])
    
    // Merge headers
    const mergedHeader = `${table.header[col1Idx]} - ${table.header[col2Idx]}`
    table.header[col1Idx] = mergedHeader
    
    // Merge data
    table.rows.forEach(row => {
      const value1 = row[col1Idx] || ''
      const value2 = row[col2Idx] || ''
      row[col1Idx] = value1 && value2 ? `${value1} ${value2}` : value1 || value2
    })
    
    // Remove second column
    table.header.splice(col2Idx, 1)
    table.rows.forEach(row => row.splice(col2Idx, 1))
    
    // Add to merge history
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
    
    // Restore original state
    table.header = [...lastMerge.originalHeader]
    table.rows = lastMerge.originalRows.map(row => [...row])
    
    // Remove from history
    setMergeHistory(prev => prev.slice(0, -1))
    
    onTablesChange(newTables)
    toast.success('Last merge operation reverted')
  }

  const handleColumnClick = (tableIdx: number, colIdx: number) => {
    if (mergeSelection && mergeSelection.tableIdx === tableIdx) {
      mergeColumns(tableIdx, mergeSelection.colIdx, colIdx)
    }
  }

  // Cell editing
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

  // Row editing
  const startRowEdit = (tableIdx: number, rowIdx: number) => {
    const row = tables[tableIdx].rows[rowIdx]
    setEditingRow({
      tableIdx,
      rowIdx,
      values: [...row]
    })
    setShowRowMenu(null)
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

  // Table operations
  const addTable = () => {
    saveToUndoStack()
    const newTable: TableData = {
      header: ['Column 1', 'Column 2', 'Column 3'],
      rows: [['', '', '']],
      name: `Table ${tables.length + 1}`
    }
    onTablesChange([...tables, newTable])
    setCurrentTableIdx(tables.length)
    toast.success('New table added')
  }

  const deleteTable = (tableIdx: number) => {
    saveToUndoStack()
    const newTables = tables.filter((_, idx) => idx !== tableIdx)
    onTablesChange(newTables)
    if (currentTableIdx >= newTables.length) {
      setCurrentTableIdx(Math.max(0, newTables.length - 1))
    }
    toast.success('Table deleted')
  }

  // Import/Export
  const exportTable = (tableIdx: number) => {
    const table = tables[tableIdx]
    const csv = [
      table.header.join(','),
      ...table.rows.map(row => 
        row.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(',')
      )
    ].join('\n')
    
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${table.name || 'table'}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Table exported')
  }

  const importTable = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const csv = e.target?.result as string
        const lines = csv.split('\n')
        const header = lines[0].split(',').map(cell => cell.replace(/"/g, ''))
        const rows = lines.slice(1).map(line => 
          line.split(',').map(cell => cell.replace(/"/g, ''))
        ).filter(row => row.some(cell => cell.trim()))

        saveToUndoStack()
        const newTable: TableData = {
          header,
          rows,
          name: file.name.replace('.csv', '')
        }
        onTablesChange([...tables, newTable])
        setCurrentTableIdx(tables.length)
        toast.success('Table imported')
      } catch (error) {
        toast.error('Failed to import table')
      }
    }
    reader.readAsText(file)
  }

  // Save changes
  const handleSave = () => {
    onSave(tables)
    setHasUnsavedChanges(false)
    setUndoStack([])
    setRedoStack([])
    toast.success('Changes saved successfully')
  }

  const currentTable = tables[currentTableIdx]

  const handleZoomIn = () => setZoom(z => Math.min(z + 0.2, 2))
  const handleZoomOut = () => setZoom(z => Math.max(z - 0.2, 0.5))
  const handleDownload = () => {
    if (pdfDisplayUrl) {
      const a = document.createElement('a');
      a.href = pdfDisplayUrl;
      a.download = uploaded?.file_name || 'statement.pdf';
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.click();
    }
  };

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-gray-50 to-blue-50 z-50">
      {/* Full-screen loader overlay */}
      {isUsingAnotherExtraction && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 shadow-xl flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            <div className="text-lg font-semibold text-gray-800">Re-extracting with DOCAI...</div>
            <div className="text-sm text-gray-600 text-center">
              Please wait while we process your document with a different extraction method.
            </div>
          </div>
        </div>
      )}
      
      {/* Main Content - 2 Row Layout */}
      <div className="flex flex-col h-full">
        {/* Row 1: Extracted Table - Full Width */}
        <div className="flex-1 bg-white border-b border-gray-200 overflow-hidden">
          <div className="h-full flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Table Editor</h2>
                <p className="text-sm text-gray-600 mt-1">Edit your extracted data before proceeding to field mapping</p>
              </div>
              
              <div className="flex items-center gap-3">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    placeholder="Search tables..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                  />
                </div>

                {/* Undo/Redo */}
                <button
                  onClick={undo}
                  disabled={undoStack.length === 0}
                  className="p-2 text-gray-600 hover:text-gray-900 disabled:opacity-50 bg-white rounded-lg border border-gray-200 hover:border-gray-300"
                  title="Undo"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
                <button
                  onClick={redo}
                  disabled={redoStack.length === 0}
                  className="p-2 text-gray-600 hover:text-gray-900 disabled:opacity-50 bg-white rounded-lg border border-gray-200 hover:border-gray-300"
                  title="Redo"
                >
                  <RotateCcw className="w-4 h-4 transform scale-x-[-1]" />
                </button>

                {/* Revert Merge */}
                {mergeHistory.length > 0 && (
                  <button
                    onClick={revertLastMerge}
                    className="p-2 text-orange-600 hover:text-orange-700 bg-white rounded-lg border border-orange-200 hover:border-orange-300"
                    title="Revert last merge"
                  >
                    <Undo2 className="w-4 h-4" />
                  </button>
                )}

              </div>
            </div>

            {/* Table Navigation */}
            <div className="px-6 py-3 border-b border-gray-200 bg-white flex items-center justify-between">
              <div className="flex items-center gap-4">
                <h3 className="font-semibold text-gray-900">Tables</h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentTableIdx(Math.max(0, currentTableIdx - 1))}
                    disabled={currentTableIdx === 0}
                    className="p-2 text-gray-500 hover:text-gray-700 disabled:opacity-50 bg-white rounded-lg border border-gray-200 hover:border-gray-300"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm text-gray-600 font-medium">
                    {currentTableIdx + 1} of {tables.length}
                  </span>
                  <button
                    onClick={() => setCurrentTableIdx(Math.min(tables.length - 1, currentTableIdx + 1))}
                    disabled={currentTableIdx === tables.length - 1}
                    className="p-2 text-gray-500 hover:text-gray-700 disabled:opacity-50 bg-white rounded-lg border border-gray-200 hover:border-gray-300"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Table Name */}
              <input
                type="text"
                value={currentTable?.name || ''}
                onChange={(e) => {
                  const newTables = [...tables]
                  newTables[currentTableIdx].name = e.target.value
                  onTablesChange(newTables)
                }}
                className="text-lg font-semibold text-gray-900 bg-transparent border-none outline-none focus:ring-2 focus:ring-blue-500 rounded px-3 py-1"
                placeholder="Table Name"
              />
            </div>
            
            <div className="flex-1 overflow-auto p-6">
              {currentTable && (
                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                  {/* Table Header */}
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-200">
                    <div className="flex">
                      {currentTable.header.map((header, colIdx) => (
                        <div
                          key={colIdx}
                          className={`flex-1 p-4 border-r border-gray-200 last:border-r-0 relative group cursor-pointer ${
                            mergeSelection && mergeSelection.tableIdx === currentTableIdx && mergeSelection.colIdx === colIdx 
                              ? 'bg-blue-200' 
                              : ''
                          }`}
                          onClick={() => handleColumnClick(currentTableIdx, colIdx)}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-gray-900">{header}</span>
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1" data-column-menu>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setShowColumnMenu(showColumnMenu?.tableIdx === currentTableIdx && showColumnMenu?.colIdx === colIdx ? null : { tableIdx: currentTableIdx, colIdx })
                                }}
                                className="p-1 text-gray-500 hover:text-gray-700 bg-white rounded"
                                title="Column actions"
                                data-column-menu
                              >
                                <MoreVertical className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                          
                          {/* Column Actions Menu */}
                          {showColumnMenu?.tableIdx === currentTableIdx && showColumnMenu?.colIdx === colIdx && (
                            <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10 min-w-[160px]" data-column-menu>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  const newName = prompt('Enter new column name:', header)
                                  if (newName) renameColumn(currentTableIdx, colIdx, newName)
                                }}
                                className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                                data-column-menu
                              >
                                <Edit3 className="w-3 h-3" />
                                Rename Column
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  startMergeSelection(currentTableIdx, colIdx)
                                }}
                                className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                                data-column-menu
                              >
                                <Merge className="w-3 h-3" />
                                Merge with Another Column
                              </button>
                              <hr className="my-1" />
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  deleteColumn(currentTableIdx, colIdx)
                                }}
                                className="w-full px-3 py-2 text-left text-sm hover:bg-red-50 text-red-600 flex items-center gap-2"
                                data-column-menu
                              >
                                <Trash2 className="w-3 h-3" />
                                Delete Column
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Table Rows */}
                  <div className="max-h-96 overflow-auto">
                    {currentTable.rows.map((row, rowIdx) => (
                      <div
                        key={rowIdx}
                        className="flex border-b border-gray-200 last:border-b-0 hover:bg-gray-50 group relative"
                      >
                        {/* Row Editing Mode */}
                        {editingRow?.tableIdx === currentTableIdx && editingRow?.rowIdx === rowIdx ? (
                          <>
                            {editingRow.values.map((value, colIdx) => (
                              <div
                                key={colIdx}
                                className="flex-1 p-4 border-r border-gray-200 last:border-r-0 relative"
                              >
                                <input
                                  type="text"
                                  value={value}
                                  onChange={(e) => updateRowEditValue(colIdx, e.target.value)}
                                  className="w-full px-3 py-1 border border-blue-500 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  placeholder={`Enter ${currentTable.header[colIdx] || 'value'}`}
                                />
                              </div>
                            ))}
                            <div className="flex items-center gap-1 p-4">
                              <button
                                onClick={saveRowEdit}
                                className="p-2 text-green-600 hover:text-green-700 bg-white rounded border border-green-200"
                                title="Save row"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                              <button
                                onClick={cancelRowEdit}
                                className="p-2 text-red-600 hover:text-red-700 bg-white rounded border border-red-200"
                                title="Cancel row edit"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            {row.map((cell, colIdx) => (
                              <div
                                key={colIdx}
                                className="flex-1 p-4 border-r border-gray-200 last:border-r-0 relative"
                              >
                                {editingCell?.tableIdx === currentTableIdx &&
                                 editingCell?.rowIdx === rowIdx &&
                                 editingCell?.colIdx === colIdx ? (
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="text"
                                      value={editingCell.value}
                                      onChange={(e) => setEditingCell({...editingCell, value: e.target.value})}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') saveCellEdit()
                                        if (e.key === 'Escape') cancelCellEdit()
                                      }}
                                      className="flex-1 px-3 py-1 border border-blue-500 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                      autoFocus
                                    />
                                    <button
                                      onClick={saveCellEdit}
                                      className="p-1 text-green-600 hover:text-green-700 bg-white rounded"
                                    >
                                      <Check className="w-3 h-3" />
                                    </button>
                                    <button
                                      onClick={cancelCellEdit}
                                      className="p-1 text-red-600 hover:text-red-700 bg-white rounded"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-between">
                                    <span 
                                      className="flex-1 cursor-pointer hover:bg-blue-50 px-2 py-1 rounded"
                                      onClick={() => startCellEdit(currentTableIdx, rowIdx, colIdx)}
                                    >
                                      {cell || ''}
                                    </span>
                                  </div>
                                )}
                              </div>
                            ))}
                            
                            {/* Row Actions Menu - Fixed positioning */}
                            <div className="flex items-center justify-center p-4 relative">
                              <div className="relative" ref={rowMenuRef} data-row-menu>
                                <button
                                  onClick={() => setShowRowMenu(showRowMenu?.tableIdx === currentTableIdx && showRowMenu?.rowIdx === rowIdx ? null : { tableIdx: currentTableIdx, rowIdx })}
                                  className="p-2 text-gray-500 hover:text-gray-700 bg-white rounded-lg border border-gray-200 hover:border-gray-300 shadow-sm"
                                  data-row-menu
                                >
                                  <MoreVertical className="w-4 h-4" />
                                </button>
                                
                                {showRowMenu?.tableIdx === currentTableIdx && showRowMenu?.rowIdx === rowIdx && (
                                  <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10 min-w-[160px]" data-row-menu>
                                    <button
                                      onClick={() => startRowEdit(currentTableIdx, rowIdx)}
                                      className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                                      data-row-menu
                                    >
                                      <Edit3 className="w-3 h-3" />
                                      Edit Row
                                    </button>
                                    <button
                                      onClick={() => addRowAbove(currentTableIdx, rowIdx)}
                                      className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                                      data-row-menu
                                    >
                                      <ArrowUp className="w-3 h-3" />
                                      Add Row Above
                                    </button>
                                    <button
                                      onClick={() => addRowBelow(currentTableIdx, rowIdx)}
                                      className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                                      data-row-menu
                                    >
                                      <ArrowDown className="w-3 h-3" />
                                      Add Row Below
                                    </button>
                                    <button
                                      onClick={() => duplicateRow(currentTableIdx, rowIdx)}
                                      className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                                      data-row-menu
                                    >
                                      <Copy className="w-3 h-3" />
                                      Duplicate Row
                                    </button>
                                    <hr className="my-1" />
                                    <button
                                      onClick={() => deleteRow(currentTableIdx, rowIdx)}
                                      className="w-full px-3 py-2 text-left text-sm hover:bg-red-50 text-red-600 flex items-center gap-2"
                                      data-row-menu
                                    >
                                      <Trash2 className="w-3 h-3" />
                                      Delete Row
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Row 2: PDF Preview - Full Width */}
        <div className="h-1/2 bg-white border-t border-gray-200 overflow-hidden">
          <div className="h-full flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">PDF Preview</h2>
                <p className="text-sm text-gray-600 mt-1">{uploaded?.file_name}</p>
              </div>
              <nav aria-label="PDF toolbar" className="flex gap-2">
                <button
                  onClick={handleZoomOut}
                  aria-label="Zoom out"
                  className="p-2 rounded hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white border border-gray-200"
                >
                  <ZoomOut size={20} />
                </button>
                <button
                  onClick={handleZoomIn}
                  aria-label="Zoom in"
                  className="p-2 rounded hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white border border-gray-200"
                >
                  <ZoomIn size={20} />
                </button>
                <button
                  onClick={handleDownload}
                  aria-label="Download PDF"
                  className="p-2 rounded hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white border border-gray-200"
                >
                  <Download size={20} />
                </button>
                <a
                  href={pdfDisplayUrl || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Open PDF in new tab"
                  className="p-2 rounded hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white border border-gray-200"
                >
                  <ExternalLink size={20} />
                </a>
              </nav>
            </div>
            
            <div className="flex-1 overflow-hidden">
              {pdfDisplayUrl ? (
                <div
                  ref={embedRef}
                  className="w-full h-full flex flex-col items-center justify-center"
                >
                  <embed
                    src={pdfDisplayUrl}
                    type="application/pdf"
                    width="100%"
                    height="100%"
                    className="w-full h-full"
                    style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}
                    aria-label="PDF preview"
                  />
                  <div className="text-xs text-gray-500 mt-2 px-2 text-center">
                    If the PDF is blank, <b>your browser may block cross-origin (CORS) PDF previews for presigned URLs</b>.<br />
                    <a href={pdfDisplayUrl} className="underline" target="_blank" rel="noopener noreferrer">Open PDF in a new tab</a> to view or download.
                  </div>
                </div>
              ) : (
                <div className="text-gray-400 text-sm flex items-center justify-center h-full">
                  No PDF file found.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Show different buttons based on extraction method and history */}
            {isDoclingExtraction() && !hasExtractionHistory() && !isUsingAnotherExtraction && !hasUsedAnotherExtraction && (
              <button
                onClick={onUseAnotherExtraction}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 flex items-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                Use Another Extraction Method
              </button>
            )}
            
            {hasExtractionHistory() && canGoToPreviousExtraction() && onGoToPreviousExtraction && (
              <button
                onClick={onGoToPreviousExtraction}
                className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 flex items-center gap-2"
              >
                <ChevronLeft className="w-4 h-4" />
                Use Previous Extraction
              </button>
            )}
            
            {hasExtractionHistory() && !isDoclingExtraction() && !isUsingAnotherExtraction && !hasUsedAnotherExtraction && (
              <button
                onClick={onUseAnotherExtraction}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 flex items-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                Use Another Extraction Method
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">
              {tables.reduce((acc, table) => acc + table.rows.length, 0)} total rows
            </span>
            <button
              onClick={onGoToFieldMapping}
              disabled={loading || isUsingAnotherExtraction}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 font-medium"
            >
              <FileText className="w-4 h-4" />
              Save & Go to Field Mapping
            </button>
          </div>
        </div>
      </div>

      {/* Hidden file input for import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        onChange={importTable}
        className="hidden"
      />
    </div>
  )
}