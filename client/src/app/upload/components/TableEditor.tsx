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
  Undo2,
  Sparkles,
  Brain
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
  onImproveExtraction?: () => void
  isImprovingExtraction?: boolean
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
  hasUsedAnotherExtraction = false,
  onImproveExtraction,
  isImprovingExtraction
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

  const isGoogleDocAIExtraction = () => {
    const method = getCurrentExtractionMethod()
    return method === 'google_docai' || method === 'google_docai_form_parser' || method === 'google_docai_layout_parser'
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
            <div className="text-lg font-semibold text-gray-800">Re-extracting with Docling...</div>
            <div className="text-sm text-gray-600 text-center">
              Please wait while we process your document with a different extraction method.
            </div>
          </div>
        </div>
      )}
      
      {/* Main Content - Side by Side Layout */}
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-purple-50 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-bold text-gray-900">Table Editor</h2>
            {uploaded && (
              <span className="text-sm text-gray-500 bg-white px-3 py-1 rounded-full border">
                {uploaded.file_name}
              </span>
            )}
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
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-sm"
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

        {/* Side by Side Content */}
        <div className="flex-1 flex flex-row gap-6 p-6 bg-gradient-to-br from-white via-blue-50 to-purple-50 min-h-0">
          {/* PDF Preview - Left Side */}
          {uploaded && (
            <div className="w-2/5 min-w-0 flex flex-col rounded-2xl shadow-xl bg-white border border-blue-100 overflow-hidden">
              <div className="sticky top-0 z-10 bg-white/90 px-4 py-3 border-b font-semibold text-blue-700 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <FileText size={16} />
                  Original PDF
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleZoomOut}
                    className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                  >
                    <ZoomOut size={14} />
                  </button>
                  <span className="text-xs text-gray-500 min-w-[3rem] text-center">{Math.round(zoom * 100)}%</span>
                  <button
                    onClick={handleZoomIn}
                    className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                  >
                    <ZoomIn size={14} />
                  </button>
                  <button
                    onClick={handleDownload}
                    className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                  >
                    <Download size={14} />
                  </button>
                </div>
              </div>
              <div className="flex-1 min-h-0 min-w-0 overflow-auto bg-gray-50">
                {pdfDisplayUrl ? (
                  <div className="w-full h-full flex flex-col items-center justify-center min-h-0 min-w-0 p-4">
                    <div className="w-full h-full overflow-auto">
                      <embed
                        src={pdfDisplayUrl}
                        type="application/pdf"
                        width="100%"
                        height="100%"
                        className="w-full h-full"
                        style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}
                        aria-label="PDF preview"
                      />
                    </div>
                    <div className="text-xs text-gray-500 mt-2 px-2 text-center bg-white/80 rounded p-2">
                      If the PDF is blank, <b>your browser may block cross-origin (CORS) PDF previews</b>.<br />
                      <a href={pdfDisplayUrl} className="underline" target="_blank" rel="noopener noreferrer">Open PDF in a new tab</a> to view.
                    </div>
                  </div>
                ) : (
                  <div className="text-gray-400 text-sm flex items-center justify-center h-full">No PDF file found.</div>
                )}
              </div>
            </div>
          )}

          {/* Table Editor - Right Side */}
          <div className="w-3/5 min-w-0 flex flex-col rounded-2xl shadow-xl bg-white border border-purple-100 overflow-hidden">
            <div className="sticky top-0 z-10 bg-white/90 px-4 py-3 border-b font-semibold text-purple-700 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Settings size={16} />
                Extracted Tables
              </span>
              <div className="flex items-center gap-2">
                {/* Table Navigation */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentTableIdx(Math.max(0, currentTableIdx - 1))}
                    disabled={currentTableIdx === 0}
                    className="p-1.5 text-gray-500 hover:text-gray-700 disabled:opacity-50 bg-white rounded border border-gray-200 hover:border-gray-300"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span className="text-xs text-gray-600 font-medium min-w-[4rem] text-center">
                    {currentTableIdx + 1} of {tables.length}
                  </span>
                  <button
                    onClick={() => setCurrentTableIdx(Math.min(tables.length - 1, currentTableIdx + 1))}
                    disabled={currentTableIdx === tables.length - 1}
                    className="p-1.5 text-gray-500 hover:text-gray-700 disabled:opacity-50 bg-white rounded border border-gray-200 hover:border-gray-300"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
                
                {/* GPT-4o Vision Improvement Button */}
                {onImproveExtraction && (
                  <button
                    onClick={onImproveExtraction}
                    disabled={loading || isUsingAnotherExtraction || isImprovingExtraction}
                    className="px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2 text-sm"
                    title="Use GPT-4o Vision to improve table extraction accuracy"
                  >
                    {isImprovingExtraction ? (
                      <>
                        <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                        Improving...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3 h-3" />
                        Improve with GPT-4o
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
            
            <div className="flex-1 min-h-0 min-w-0 overflow-auto p-4">
              {currentTable && (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                      <span>Table {currentTableIdx + 1}</span>
                      {currentTable.name && (
                        <span className="text-sm font-normal text-gray-500">- {currentTable.name}</span>
                      )}
                    </h3>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => deleteTable(currentTableIdx)}
                        className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  
                  {/* Table Name Input */}
                  <div className="mb-4">
                    <input
                      type="text"
                      value={currentTable?.name || ''}
                      onChange={(e) => {
                        const newTables = [...tables]
                        newTables[currentTableIdx].name = e.target.value
                        onTablesChange(newTables)
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                      placeholder="Table name..."
                    />
                  </div>
                  
                  <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                    <div className="overflow-x-auto w-full">
                      <table className="w-full min-w-full">
                        <thead>
                          <tr className="bg-gray-50">
                            {currentTable.header.map((header, colIdx) => (
                              <th
                                key={colIdx}
                                className="px-3 py-2 text-left text-xs font-medium text-gray-900 border-b border-gray-200 whitespace-nowrap"
                              >
                                <div className="flex items-center gap-1">
                                  <span className="truncate">{header}</span>
                                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                      onClick={() => startCellEdit(currentTableIdx, -1, colIdx)}
                                      className="p-0.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                                    >
                                      <Pencil size={10} />
                                    </button>
                                    <button
                                      onClick={() => deleteColumn(currentTableIdx, colIdx)}
                                      className="p-0.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                    >
                                      <Trash2 size={10} />
                                    </button>
                                  </div>
                                </div>
                              </th>
                            ))}
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-900 border-b border-gray-200 w-20 whitespace-nowrap">
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {currentTable.rows.map((row, rowIdx) => (
                            <tr key={rowIdx} className="hover:bg-gray-50 group">
                              {row.map((cell, colIdx) => (
                                <td
                                  key={colIdx}
                                  className="px-3 py-2 text-xs text-gray-900 border-b border-gray-100 whitespace-nowrap"
                                >
                                  {editingCell && editingCell.tableIdx === currentTableIdx && editingCell.rowIdx === rowIdx && editingCell.colIdx === colIdx ? (
                                    <input
                                      type="text"
                                      value={editingCell.value}
                                      onChange={(e) => setEditingCell({ ...editingCell, value: e.target.value })}
                                      onBlur={saveCellEdit}
                                      onKeyDown={(e) => e.key === 'Enter' && saveCellEdit()}
                                      className="w-full px-2 py-1 border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs"
                                      autoFocus
                                    />
                                  ) : (
                                    <div
                                      className="cursor-pointer hover:bg-blue-50 rounded px-1 py-0.5 transition-colors truncate"
                                      onClick={() => startCellEdit(currentTableIdx, rowIdx, colIdx)}
                                      title={cell}
                                    >
                                      {cell}
                                    </div>
                                  )}
                                </td>
                              ))}
                              <td className="px-3 py-2 text-xs text-gray-900 border-b border-gray-100 whitespace-nowrap">
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    onClick={() => addRowAbove(currentTableIdx, rowIdx)}
                                    className="p-0.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                                    title="Add row above"
                                  >
                                    <ArrowUp size={10} />
                                  </button>
                                  <button
                                    onClick={() => addRowBelow(currentTableIdx, rowIdx)}
                                    className="p-0.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                                    title="Add row below"
                                  >
                                    <ArrowDown size={10} />
                                  </button>
                                  <button
                                    onClick={() => duplicateRow(currentTableIdx, rowIdx)}
                                    className="p-0.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                                    title="Duplicate row"
                                  >
                                    <Copy size={10} />
                                  </button>
                                  <button
                                    onClick={() => deleteRow(currentTableIdx, rowIdx)}
                                    className="p-0.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                    title="Delete row"
                                  >
                                    <Trash2 size={10} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-4 shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Show different buttons based on extraction method and history */}
              {isGoogleDocAIExtraction() && !hasExtractionHistory() && !isUsingAnotherExtraction && !hasUsedAnotherExtraction && (
                <button
                  onClick={onUseAnotherExtraction}
                  className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 flex items-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  Try Docling Extraction
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
              
              {hasExtractionHistory() && !isGoogleDocAIExtraction() && !isUsingAnotherExtraction && !hasUsedAnotherExtraction && (
                <button
                  onClick={onUseAnotherExtraction}
                  className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 flex items-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  Try Docling Extraction
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
    </div>
  )
}