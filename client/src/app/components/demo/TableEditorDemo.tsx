'use client'
import { useState, useEffect } from 'react'
import { 
  Pencil, 
  Trash2, 
  Plus, 
  RotateCcw, 
  FileText,
  ChevronLeft,
  Search,
  MoreVertical,
  MoreHorizontal,
  Filter,
  Calendar,
  X,
  Brain,
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
  Save,
  ArrowRight,
  Upload,
  Settings,
  MapPin,
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import SpinnerLoader from '../ui/SpinnerLoader'
import ProgressBar from '../../upload/components/ProgressBar'
import { CompactThemeToggle } from '../ui/CompactThemeToggle'

// Datos de ejemplo para el demo
const sampleTables = [
  {
    name: "Commission Statement",
    header: ["Agent Name", "Policy Number", "Premium", "Commission Rate", "Commission Amount", "Date"],
    rows: [
      ["John Smith", "POL-001", "$1,200.00", "15%", "$180.00", "2024-01-15"],
      ["Maria Garcia", "POL-002", "$2,500.00", "12%", "$300.00", "2024-01-16"],
      ["Robert Johnson", "POL-003", "$800.00", "18%", "$144.00", "2024-01-17"],
      ["Sarah Wilson", "POL-004", "$3,200.00", "10%", "$320.00", "2024-01-18"],
      ["Michael Brown", "POL-005", "$1,800.00", "14%", "$252.00", "2024-01-19"],
    ]
  },
  {
    name: "Summary Report",
    header: ["Category", "Total Premium", "Total Commission", "Agent Count"],
    rows: [
      ["Life Insurance", "$5,200.00", "$650.00", "3"],
      ["Health Insurance", "$3,800.00", "$456.00", "2"],
      ["Auto Insurance", "$2,100.00", "$315.00", "4"],
    ]
  }
]

const sampleUploaded = {
  file_name: "commission_statement_demo.pdf",
  file: null as File | null
}

interface TableEditorDemoProps {
  onClose?: () => void;
  onSaveAndContinue?: () => void;
}

export default function TableEditorDemo({ onClose, onSaveAndContinue }: TableEditorDemoProps) {
  const [tables, setTables] = useState(sampleTables)
  const [currentTableIdx, setCurrentTableIdx] = useState(0)
  const [searchTerm, setSearchTerm] = useState('')
  const [zoom, setZoom] = useState(1)
  const [showRowMenu, setShowRowMenu] = useState<{ tableIdx: number, rowIdx: number } | null>(null)
  const [showColumnMenu, setShowColumnMenu] = useState<{ tableIdx: number, colIdx: number } | null>(null)
  const [showHeaderActions, setShowHeaderActions] = useState<number | null>(null)
  const [showRowActions, setShowRowActions] = useState<{ tableIdx: number, rowIdx: number } | null>(null)
  const [hiddenColumns, setHiddenColumns] = useState<Set<number>>(new Set())
  const [columnWidths, setColumnWidths] = useState<Record<number, number>>({})
  const [isResizing, setIsResizing] = useState<number | null>(null)
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set())
  const [showPreview, setShowPreview] = useState(true)
  const [editingCell, setEditingCell] = useState<{ tableIdx: number, rowIdx: number, colIdx: number, value: string } | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  
  // Step management for demo flow
  const steps = [
    { key: 'upload', label: 'Upload', icon: Upload, description: 'Document uploaded' },
    { key: 'process', label: 'Process', icon: Settings, description: 'Table editing' },
    { key: 'mapping', label: 'Mapping', icon: MapPin, description: 'Field mapping' }
  ] as const
  
  const currentStep = 'process'
  const completedSteps = new Set(['upload'])
  
  const handleSaveAndContinue = () => {
    setShowSpinnerLoader(true)
    
    // El SpinnerLoader maneja su propia duración y auto-cierre
    // No necesitamos setTimeout aquí, el loader se cerrará automáticamente
  }
  
  // Extraction handlers state
  const [isExtractingWithGPT, setIsExtractingWithGPT] = useState(false)
  const [isExtractingWithGoogleDocAI, setIsExtractingWithGoogleDocAI] = useState(false)
  const [isExtractingWithMistral, setIsExtractingWithMistral] = useState(false)
  const [gptServiceAvailable, setGptServiceAvailable] = useState(true)
  const [googleDocAIServiceAvailable, setGoogleDocAIServiceAvailable] = useState(true)
  const [mistralServiceAvailable, setMistralServiceAvailable] = useState(true)
  
  // Date extraction state
  const [showDateModal, setShowDateModal] = useState(false)
  const [extractedDates, setExtractedDates] = useState<any[]>([])
  const [dateExtractionLoading, setDateExtractionLoading] = useState(false)
  const [hasExtractedDates, setHasExtractedDates] = useState(false)
  
  // Format validation state
  const [rightFormatRow, setRightFormatRow] = useState<{ tableIdx: number, rowIdx: number } | null>(null)
  const [formatValidationResults, setFormatValidationResults] = useState<Record<number, any>>({})
  const [isGPTCorrecting, setIsGPTCorrecting] = useState(false)
  
  // Summary rows state
  const [showSummaryRows, setShowSummaryRows] = useState(true)
  const [summaryRows, setSummaryRows] = useState<Set<number>>(new Set())
  
  // Spinner loader state
  const [showSpinnerLoader, setShowSpinnerLoader] = useState(false)

  const currentTable = tables[currentTableIdx]

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

  const handleZoomIn = () => setZoom(z => Math.min(z + 0.2, 2))
  const handleZoomOut = () => setZoom(z => Math.max(z - 0.2, 0.5))

  const handleDownload = () => {
    toast.success('Downloading document...')
    // In a real implementation, this would trigger the actual download
  }

  const handlePrint = () => {
    toast.success('Opening print dialog...')
    // In a real implementation, this would open the browser's print dialog
    window.print()
  }

  const handleFullscreen = () => {
    setIsFullscreen(!isFullscreen)
    toast.success(isFullscreen ? 'Exiting fullscreen' : 'Entering fullscreen')
  }

  const startCellEdit = (tableIdx: number, rowIdx: number, colIdx: number) => {
    const table = tables[tableIdx]
    const cellValue = table.rows[rowIdx][colIdx]
    setEditingCell({ tableIdx, rowIdx, colIdx, value: cellValue })
  }

  const saveCellEdit = () => {
    if (!editingCell) return
    
    const newTables = [...tables]
    newTables[editingCell.tableIdx].rows[editingCell.rowIdx][editingCell.colIdx] = editingCell.value
    setTables(newTables)
    setEditingCell(null)
    toast.success('Cell updated successfully')
  }

  const cancelCellEdit = () => {
    setEditingCell(null)
  }

  const addRow = (tableIdx: number, rowIdx: number) => {
    const newTables = [...tables]
    const newRow = newTables[tableIdx].header.map(() => '')
    newTables[tableIdx].rows.splice(rowIdx + 1, 0, newRow)
    setTables(newTables)
    toast.success('Row added successfully')
  }

  const deleteRow = (tableIdx: number, rowIdx: number) => {
    const newTables = [...tables]
    newTables[tableIdx].rows.splice(rowIdx, 1)
    setTables(newTables)
    toast.success('Row deleted successfully')
  }

  const addColumn = (tableIdx: number, colIdx: number) => {
    const newTables = [...tables]
    newTables[tableIdx].header.splice(colIdx + 1, 0, 'New Column')
    newTables[tableIdx].rows.forEach(row => {
      row.splice(colIdx + 1, 0, '')
    })
    setTables(newTables)
    toast.success('Column added successfully')
  }

  const deleteColumn = (tableIdx: number, colIdx: number) => {
    const newTables = [...tables]
    newTables[tableIdx].header.splice(colIdx, 1)
    newTables[tableIdx].rows.forEach(row => {
      row.splice(colIdx, 1)
    })
    setTables(newTables)
    toast.success('Column deleted successfully')
  }

  const renameColumn = (tableIdx: number, colIdx: number, newName: string) => {
    const newTables = [...tables]
    newTables[tableIdx].header[colIdx] = newName
    setTables(newTables)
    toast.success('Column renamed successfully')
  }

  const toggleRowSelection = (rowIdx: number) => {
    setSelectedRows(prev => {
      const newSet = new Set(prev)
      if (newSet.has(rowIdx)) {
        newSet.delete(rowIdx)
      } else {
        newSet.add(rowIdx)
      }
      return newSet
    })
  }

  const selectAllRows = () => {
    const currentTable = tables[currentTableIdx]
    if (currentTable) {
      setSelectedRows(new Set(currentTable.rows.map((_, idx) => idx)))
    }
  }

  const clearRowSelection = () => {
    setSelectedRows(new Set())
  }

  const deleteSelectedRows = () => {
    if (selectedRows.size === 0) return
    
    const newTables = [...tables]
    const currentTable = newTables[currentTableIdx]
    const sortedIndices = Array.from(selectedRows).sort((a, b) => b - a)
    
    sortedIndices.forEach(rowIdx => {
      currentTable.rows.splice(rowIdx, 1)
    })
    
    setTables(newTables)
    setSelectedRows(new Set())
    toast.success(`Deleted ${selectedRows.size} selected rows`)
  }

  const toggleColumnVisibility = (colIdx: number) => {
    setHiddenColumns(prev => {
      const newSet = new Set(prev)
      if (newSet.has(colIdx)) {
        newSet.delete(colIdx)
      } else {
        newSet.add(colIdx)
      }
      return newSet
    })
  }

  const resetColumnVisibility = () => {
    setHiddenColumns(new Set())
  }

  // Extraction handlers
  const handleExtractWithGPT = async () => {
    setIsExtractingWithGPT(true)
    setShowSpinnerLoader(true)
    
    // Simulate extraction - loader will auto-close after reaching 100%
    setTimeout(() => {
      setIsExtractingWithGPT(false)
      // SpinnerLoader will auto-close after reaching 100% (handled by the component itself)
    }, 3000)
  }

  const handleExtractWithGoogleDocAI = async () => {
    setIsExtractingWithGoogleDocAI(true)
    setShowSpinnerLoader(true)
    
    // Simulate extraction - loader will auto-close after reaching 100%
    setTimeout(() => {
      setIsExtractingWithGoogleDocAI(false)
      // SpinnerLoader will auto-close after reaching 100% (handled by the component itself)
    }, 3000)
  }

  const handleExtractWithMistral = async () => {
    setIsExtractingWithMistral(true)
    setShowSpinnerLoader(true)
    
    // Simulate extraction - loader will auto-close after reaching 100%
    setTimeout(() => {
      setIsExtractingWithMistral(false)
      // SpinnerLoader will auto-close after reaching 100% (handled by the component itself)
    }, 3000)
  }

  // Date extraction
  const handleDateExtraction = () => {
    setDateExtractionLoading(true)
    toast.loading('Extracting dates from document...', { id: 'extract-dates' })
    
    // Simulate date extraction
    setTimeout(() => {
      setDateExtractionLoading(false)
      setExtractedDates([
        { date: '2024-01-15', type: 'statement_date', confidence: 0.95 },
        { date: '2024-01-20', type: 'statement_date', confidence: 0.88 }
      ])
      setHasExtractedDates(true)
      setShowDateModal(true)
      toast.success('Found 2 date(s) in your document', { id: 'extract-dates' })
    }, 2000)
  }

  // Format validation
  const markAsRightFormatRow = (tableIdx: number, rowIdx: number) => {
    setRightFormatRow({ tableIdx, rowIdx })
    toast.success('Row marked as reference format')
  }

  const validateAllRowsFormat = () => {
    const results: Record<number, any> = {}
    currentTable.rows.forEach((_, rowIdx) => {
      if (rowIdx === 0) return // Skip header
      results[rowIdx] = {
        isValid: Math.random() > 0.3, // Simulate some validation issues
        issues: Math.random() > 0.3 ? [`Column 2 format issue in row ${rowIdx + 1}`] : []
      }
    })
    setFormatValidationResults(results)
    toast.success('Format validation completed')
  }

  const fixRowFormatWithGPT = (rowIdx: number) => {
    setIsGPTCorrecting(true)
    toast.loading('Fixing row format with GPT...', { id: 'fix-format' })
    
    setTimeout(() => {
      setIsGPTCorrecting(false)
      toast.success('Row format corrected successfully', { id: 'fix-format' })
    }, 2000)
  }

  // Summary rows
  const markAsSummaryRow = (tableIdx: number, rowIdx: number) => {
    setSummaryRows(prev => new Set([...prev, rowIdx]))
    toast.success('Row marked as summary row')
  }

  const unmarkAsSummaryRow = (tableIdx: number, rowIdx: number) => {
    setSummaryRows(prev => {
      const newSet = new Set(prev)
      newSet.delete(rowIdx)
      return newSet
    })
    toast.success('Row unmarked as summary row')
  }

  const autoDetectSummaryRows = () => {
    // Simulate auto-detection
    const detectedRows = new Set([2, 4]) // Simulate detecting rows 2 and 4 as summary
    setSummaryRows(detectedRows)
    toast.success('Auto-detected 2 summary rows')
  }

  const deleteSummaryRows = () => {
    const newTables = [...tables]
    const currentTable = newTables[currentTableIdx]
    const sortedIndices = Array.from(summaryRows).sort((a, b) => b - a)
    
    sortedIndices.forEach(rowIdx => {
      currentTable.rows.splice(rowIdx, 1)
    })
    
    setTables(newTables)
    setSummaryRows(new Set())
    toast.success(`Deleted ${summaryRows.size} summary rows`)
  }

  // Table operations
  const addTable = () => {
    const newTable = {
      name: `New Table ${tables.length + 1}`,
      header: ['Column 1', 'Column 2', 'Column 3'],
      rows: [['', '', '']]
    }
    setTables([...tables, newTable])
    setCurrentTableIdx(tables.length)
    toast.success('New table added')
  }

  const deleteTable = (tableIdx: number) => {
    if (tables.length <= 1) {
      toast.error('Cannot delete the last table')
      return
    }
    
    const newTables = tables.filter((_, idx) => idx !== tableIdx)
    setTables(newTables)
    setCurrentTableIdx(Math.max(0, tableIdx - 1))
    toast.success('Table deleted')
  }

  const duplicateTable = (tableIdx: number) => {
    const tableToDuplicate = tables[tableIdx]
    const duplicatedTable = {
      ...tableToDuplicate,
      name: `${tableToDuplicate.name} (Copy)`,
      rows: tableToDuplicate.rows.map(row => [...row])
    }
    setTables([...tables, duplicatedTable])
    toast.success('Table duplicated')
  }

  return (
    <div className={`fixed inset-0 bg-white dark:bg-slate-900 z-50 flex flex-col ${isFullscreen ? 'z-[9999]' : ''}`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4 flex-wrap">
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-all duration-200 flex items-center cursor-pointer"
              title="Regresar"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200">Table Editor Demo</h2>
          <span className="text-sm text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 shadow-sm">
            {sampleUploaded.file_name}
          </span>
          <div className="flex items-center gap-2 bg-emerald-100 dark:bg-emerald-900/30 px-4 py-2 rounded-lg border border-emerald-200 dark:border-emerald-800">
            <Calendar className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span className="text-sm text-emerald-800 dark:text-emerald-300 font-medium">
              Statement Date: 2024-01-20
            </span>
          </div>
          
          {/* Extract Dates Button with Spikes */}
          <button
            onClick={handleDateExtraction}
            disabled={dateExtractionLoading}
            className="px-3 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 flex items-center gap-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-300 ease-in-out transform hover:scale-[1.02] active:scale-[0.98] hover:shadow-lg disabled:transform-none cursor-pointer"
          >
            <Sparkles className={`w-4 h-4 transition-transform duration-200 ${dateExtractionLoading ? 'animate-spin' : ''}`} />
            <span className="transition-all duration-200">
              {dateExtractionLoading ? 'Extracting...' : 'Extract Dates'}
            </span>
          </button>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Progress Bar in Header */}
          <div className="scale-75">
            <ProgressBar currentStep="table_editor" />
          </div>
          
          {/* Theme Toggle */}
          <CompactThemeToggle />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-row gap-4 p-4 bg-slate-50 dark:bg-slate-900 min-h-0 overflow-hidden max-h-full">
        {/* Document Preview - Left Side */}
        {showPreview && (
          <div className="w-2/5 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col min-h-0">
            <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shadow-sm flex-shrink-0">
              <div className="flex items-center justify-between h-12 px-3 bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700">
                {/* Left Side - Document Info and Zoom */}
                <div className="flex items-center gap-6">
                  {/* Document Info */}
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-red-500 rounded flex items-center justify-center">
                      <File className="w-3 h-3 text-white" />
                    </div>
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                      Document Preview
                    </span>
                  </div>

                </div>

                {/* Right Side - Document Actions */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={handleDownload}
                    className="p-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 hover:bg-blue-500 hover:border-blue-500 hover:text-white transition-all duration-200 flex items-center justify-center cursor-pointer hover:shadow-sm rounded-lg"
                    title="Download document"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handlePrint}
                    className="p-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 hover:bg-green-500 hover:border-green-500 hover:text-white transition-all duration-200 flex items-center justify-center cursor-pointer hover:shadow-sm rounded-lg"
                    title="Print document"
                  >
                    <Printer className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleFullscreen}
                    className="p-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 hover:bg-purple-500 hover:border-purple-500 hover:text-white transition-all duration-200 flex items-center justify-center cursor-pointer hover:shadow-sm rounded-lg"
                    title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                  >
                    {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
            <div className="flex-1 flex items-center justify-center bg-slate-100 dark:bg-slate-700/30 p-4 overflow-hidden">
              <div className="text-center">
                <FileText className="w-16 h-16 text-slate-500 dark:text-slate-400 mx-auto mb-4" />
                <p className="text-slate-800 dark:text-slate-200 font-medium">PDF Preview</p>
                <p className="text-sm text-slate-600 dark:text-slate-400">Commission Statement Demo</p>
                <div className="mt-4 text-xs text-slate-500 dark:text-slate-400">
                  Zoom: {Math.round(zoom * 100)}%
                </div>
              </div>
            </div>
            
            {/* PDF Footer */}
            <div className="border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/30 px-4 py-3 flex items-center justify-between flex-shrink-0">
              {/* Left Side - Extract Options */}
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200">Extract with:</span>
                
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleExtractWithMistral}
                    disabled={isExtractingWithMistral || !mistralServiceAvailable}
                    className="px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 hover:bg-blue-500 hover:border-blue-500 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-all duration-200 flex items-center gap-2 hover:shadow-sm rounded-lg"
                    title="Extract with Mistral"
                  >
                    <Brain className={`w-4 h-4 ${isExtractingWithMistral ? 'animate-pulse' : ''}`} />
                    <span className="text-sm font-medium">
                      {isExtractingWithMistral ? 'Extracting...' : 'Mistral'}
                    </span>
                  </button>
                  
                  <button
                    onClick={handleExtractWithGPT}
                    disabled={isExtractingWithGPT || !gptServiceAvailable}
                    className="px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 hover:bg-purple-500 hover:border-purple-500 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-all duration-200 flex items-center gap-2 hover:shadow-sm rounded-lg"
                    title="Extract with Open AI"
                  >
                    <Brain className={`w-4 h-4 ${isExtractingWithGPT ? 'animate-pulse' : ''}`} />
                    <span className="text-sm font-medium">
                      {isExtractingWithGPT ? 'Extracting...' : 'Open AI'}
                    </span>
                  </button>
                  
                  <button
                    onClick={handleExtractWithGoogleDocAI}
                    disabled={isExtractingWithGoogleDocAI || !googleDocAIServiceAvailable}
                    className="px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 hover:bg-green-500 hover:border-green-500 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-all duration-200 flex items-center gap-2 hover:shadow-sm rounded-lg"
                    title="Extract with Google Doc"
                  >
                    <Brain className={`w-4 h-4 ${isExtractingWithGoogleDocAI ? 'animate-pulse' : ''}`} />
                    <span className="text-sm font-medium">
                      {isExtractingWithGoogleDocAI ? 'Extracting...' : 'Google Doc'}
                    </span>
                  </button>
                </div>
              </div>
              
              {/* Right Side - Zoom Controls */}
              <div className="flex items-center gap-1">
                <button
                  onClick={handleZoomOut}
                  className="p-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 hover:bg-red-500 hover:border-red-500 hover:text-white transition-all duration-200 flex items-center justify-center cursor-pointer hover:shadow-sm rounded-lg"
                  title="Zoom out"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <div className="bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 min-w-[70px] text-center shadow-sm">
                  <span className="text-sm text-slate-800 dark:text-slate-200 font-medium">
                    {Math.round(zoom * 100)}%
                  </span>
                </div>
                <button
                  onClick={handleZoomIn}
                  className="p-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 hover:bg-green-500 hover:border-green-500 hover:text-white transition-all duration-200 flex items-center justify-center cursor-pointer hover:shadow-sm rounded-lg"
                  title="Zoom in"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Table Editor - Right Side */}
        <div className={`${showPreview ? 'w-3/5' : 'w-full'} min-w-0 flex flex-col rounded-2xl shadow-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 overflow-hidden relative min-h-0 max-h-full`}>
          {/* Table Header - Excel/Google Sheets Style */}
          <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shadow-sm flex-shrink-0">
            <div className="flex items-center h-12 px-3 bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700">
              {/* Table Info */}
              <div className="flex items-center gap-1 mr-6">
                <button
                  onClick={() => setShowPreview(!showPreview)}
                  className="p-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 hover:bg-blue-500 hover:border-blue-500 hover:text-white transition-all duration-200 flex items-center justify-center cursor-pointer hover:shadow-sm rounded-lg"
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
                    <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 transition-colors duration-200 ${searchTerm ? 'text-blue-500' : 'text-slate-500 dark:text-slate-400'}`} />
                    <input
                      type="text"
                      placeholder="Search tables..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className={`pl-10 pr-8 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 text-sm focus:outline-none transition-all duration-200 ${
                        searchTerm 
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20' 
                          : 'border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500'
                      }`}
                    />
                    {searchTerm && (
                      <button
                        onClick={() => setSearchTerm('')}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors duration-200 cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Summary Toggle */}
                  <div className="flex items-center gap-2 mr-6">
                    <button
                      onClick={() => setShowSummaryRows(!showSummaryRows)}
                      className={`px-3 py-2 border transition-all duration-200 flex items-center gap-2 cursor-pointer hover:shadow-sm rounded-lg ${
                        showSummaryRows 
                          ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300 border-orange-200 dark:border-orange-800' 
                          : 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-600 hover:bg-orange-50 dark:hover:bg-orange-900/20 hover:border-orange-200 dark:hover:border-orange-800 hover:text-orange-800 dark:hover:text-orange-300'
                      }`}
                      title={showSummaryRows ? 'Hide summary rows' : 'Show summary rows'}
                    >
                      <Eye className="w-4 h-4" />
                      <span className="text-sm font-medium">
                        Summary Rows: {summaryRows.size}
                      </span>
                    </button>
                    
                    <button
                      onClick={autoDetectSummaryRows}
                      className="px-3 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white border-0 hover:from-blue-700 hover:to-purple-700 transition-all duration-200 flex items-center gap-2 cursor-pointer hover:shadow-lg rounded-lg transform hover:scale-[1.02] active:scale-[0.98]"
                      title="Auto detect summary rows"
                    >
                      <Sparkles className="w-4 h-4 text-white" />
                      <span className="text-sm font-medium">Auto Detect</span>
                    </button>
                    
                    {summaryRows.size > 0 && showSummaryRows && (
                      <button
                        onClick={deleteSummaryRows}
                        className="px-3 py-2 bg-red-600 text-white border border-red-600 hover:bg-red-700 hover:border-red-700 transition-all duration-200 flex items-center gap-2 cursor-pointer hover:shadow-sm rounded-lg"
                        title="Delete summary rows"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span className="text-sm font-medium">Delete Summary</span>
                      </button>
                    )}
                  </div>

                  {/* Separator */}
                  <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 mr-6"></div>

                  {/* Format Tools */}
                  <div className="flex items-center gap-1 mr-6">
                  </div>

                </div>

                {/* Right Side - Undo/Redo */}
                <div className="flex items-center gap-2">

                  {/* Delete Selected */}
                  {selectedRows.size > 0 && (
                    <button
                      onClick={deleteSelectedRows}
                      className="px-3 py-2 bg-red-600 text-white border border-red-600 hover:bg-red-700 hover:border-red-700 transition-all duration-200 flex items-center gap-2 cursor-pointer hover:shadow-sm rounded-lg"
                      title="Delete selected rows"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span className="text-sm font-medium">Delete Selected ({selectedRows.size})</span>
                    </button>
                  )}

                  {/* Undo/Redo */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => toast('Undo functionality in demo')}
                      className="p-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600 hover:border-slate-300 dark:hover:border-slate-500 transition-all duration-200 flex items-center justify-center cursor-pointer hover:shadow-sm rounded-lg"
                      title="Undo last action"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => toast('Redo functionality in demo')}
                      className="p-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600 hover:border-slate-300 dark:hover:border-slate-500 transition-all duration-200 flex items-center justify-center cursor-pointer hover:shadow-sm rounded-lg"
                      title="Redo last action"
                    >
                      <RotateCcw className="w-4 h-4 transform scale-x-[-1]" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Table Content */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {currentTable ? (
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg h-full flex flex-col overflow-hidden">
                <div className="flex-1 overflow-auto">
                  <table className="w-full min-w-full">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-slate-50 dark:bg-slate-700/50">
                        {/* Checkbox column */}
                        <th className="px-4 py-4 text-left text-xs font-bold text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700 w-12">
                          <input
                            type="checkbox"
                            checked={selectedRows.size === currentTable.rows.length && currentTable.rows.length > 0}
                            onChange={(e) => {
                              if (e.target.checked) {
                                selectAllRows()
                              } else {
                                clearRowSelection()
                              }
                            }}
                            className="w-4 h-4 text-blue-500 bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 rounded focus:ring-blue-500 focus:ring-2 hover:border-blue-400 transition-all duration-200 cursor-pointer"
                          />
                        </th>
                        {currentTable.header.map((header, colIdx) => (
                          <th
                            key={colIdx}
                            className="px-3 py-3 text-left text-xs font-medium text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700 border-r border-slate-200 dark:border-slate-700 last:border-r-0 whitespace-nowrap relative"
                          >
                            <div className="flex items-center justify-between">
                              <span className="truncate flex-1">{header}</span>
                              <button
                                onClick={() => setShowHeaderActions(showHeaderActions === colIdx ? null : colIdx)}
                                className="ml-2 p-1 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-600 rounded-lg transition-all duration-200 hover:shadow-sm cursor-pointer"
                                data-menu-trigger
                              >
                                <MoreVertical size={12} />
                              </button>
                            </div>
                            
                            {/* Header Action Menu */}
                            {showHeaderActions === colIdx && (
                              <div className="absolute top-full right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-[9999] min-w-[200px] backdrop-blur-sm animate-in slide-in-from-top-2 duration-200" data-menu-content>
                                <div className="p-2 space-y-1">
                                  <button
                                    onClick={() => {
                                      const newName = prompt('Enter new column name:', header)
                                      if (newName && newName.trim()) {
                                        renameColumn(currentTableIdx, colIdx, newName.trim())
                                      }
                                      setShowHeaderActions(null)
                                    }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-all duration-200 hover:shadow-sm cursor-pointer"
                                  >
                                    <Pencil className="w-4 h-4" />
                                    Rename Column
                                  </button>
                                  <button
                                    onClick={() => {
                                      addColumn(currentTableIdx, colIdx)
                                      setShowHeaderActions(null)
                                    }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-all duration-200 hover:shadow-sm cursor-pointer"
                                  >
                                    <Plus className="w-4 h-4" />
                                    Add Column After
                                  </button>
                                  <div className="border-t border-slate-200 dark:border-slate-700 my-1"></div>
                                  <button
                                    onClick={() => {
                                      deleteColumn(currentTableIdx, colIdx)
                                      setShowHeaderActions(null)
                                    }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-all duration-200 hover:shadow-sm cursor-pointer"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                    Delete Column
                                  </button>
                                </div>
                              </div>
                            )}
                          </th>
                        ))}
                        <th className="px-3 py-3 text-left text-xs font-medium text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700 border-r border-slate-200 dark:border-slate-700 w-24 relative">
                          <div className="flex items-center justify-between">
                            <span>Actions</span>
                            <button
                              onClick={() => setShowRowActions(showRowActions?.tableIdx === currentTableIdx && showRowActions?.rowIdx === -1 ? null : { tableIdx: currentTableIdx, rowIdx: -1 })}
                              className="ml-2 p-1 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-600 rounded-lg transition-all duration-200 hover:shadow-sm cursor-pointer"
                              data-menu-trigger
                            >
                              <MoreVertical size={12} />
                            </button>
                          </div>
                          
                          {/* Header Actions Menu */}
                          {showRowActions?.tableIdx === currentTableIdx && showRowActions?.rowIdx === -1 && (
                            <div className="absolute top-full right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-[100] min-w-[200px] backdrop-blur-sm animate-in slide-in-from-top-2 duration-200" data-menu-content>
                              <div className="p-2 space-y-1">
                                <button
                                  onClick={() => {
                                    selectAllRows()
                                    setShowRowActions(null)
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-all duration-200 hover:shadow-sm cursor-pointer"
                                >
                                  <CheckCircle className="w-4 h-4" />
                                  Select All Rows
                                </button>
                                <button
                                  onClick={() => {
                                    clearRowSelection()
                                    setShowRowActions(null)
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-all duration-200 hover:shadow-sm cursor-pointer"
                                >
                                  <X className="w-4 h-4" />
                                  Clear Selection
                                </button>
                                <div className="border-t border-slate-200 dark:border-slate-700 my-1"></div>
                                <button
                                  onClick={() => {
                                    deleteSelectedRows()
                                    setShowRowActions(null)
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-all duration-200 hover:shadow-sm cursor-pointer"
                                >
                                  <Trash2 className="w-4 h-4" />
                                  Delete Selected
                                </button>
                              </div>
                            </div>
                          )}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentTable.rows.map((row, rowIdx) => {
                        const isSummary = summaryRows.has(rowIdx)
                        const hasFormatError = formatValidationResults[rowIdx] && !formatValidationResults[rowIdx].isValid
                        const isRightFormat = rightFormatRow && rightFormatRow.tableIdx === currentTableIdx && rightFormatRow.rowIdx === rowIdx
                        
                        return (
                        <tr key={rowIdx} className={`hover:bg-muted/50 group relative transition-all duration-200 ${
                          isSummary 
                            ? showSummaryRows 
                              ? 'bg-orange-50 dark:bg-orange-900/20 border-l-4 border-orange-500 hover:bg-orange-100 dark:hover:bg-orange-900/30' 
                              : 'hover:shadow-sm'
                            : isRightFormat
                            ? 'bg-emerald-50 dark:bg-emerald-900/20 border-l-4 border-emerald-500 hover:bg-emerald-100 dark:hover:bg-emerald-900/30'
                            : hasFormatError
                            ? 'bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 hover:bg-red-100 dark:hover:bg-red-900/30'
                            : 'hover:shadow-sm'
                        }`}>
                          {/* Checkbox column */}
                          <td className="px-4 py-3 text-xs text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 border-r border-slate-200 dark:border-slate-700">
                            <input
                              type="checkbox"
                              checked={selectedRows.has(rowIdx)}
                              onChange={() => toggleRowSelection(rowIdx)}
                              className="w-4 h-4 text-blue-500 bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 rounded focus:ring-blue-500 focus:ring-2 hover:border-blue-400 transition-all duration-200 cursor-pointer"
                            />
                          </td>
                          {row.map((cell, colIdx) => (
                            <td
                              key={colIdx}
                              className="px-3 py-3 text-xs text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 border-r border-slate-200 dark:border-slate-700 last:border-r-0 whitespace-nowrap"
                            >
                              {editingCell && editingCell.tableIdx === currentTableIdx && editingCell.rowIdx === rowIdx && editingCell.colIdx === colIdx ? (
                                <input
                                  type="text"
                                  value={editingCell.value}
                                  onChange={(e) => setEditingCell({ ...editingCell, value: e.target.value })}
                                  onBlur={saveCellEdit}
                                  onKeyDown={(e) => e.key === 'Enter' && saveCellEdit()}
                                  className="w-full px-2 py-1 border border-blue-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs transition-all duration-200 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                                  autoFocus
                                />
                              ) : (
                                <div
                                  className="cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg px-2 py-1 transition-all duration-200 truncate hover:shadow-sm"
                                  onClick={() => startCellEdit(currentTableIdx, rowIdx, colIdx)}
                                  title={cell}
                                >
                                  {cell}
                                </div>
                              )}
                            </td>
                          ))}
                          <td className="px-3 py-3 text-xs text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 border-r border-slate-200 dark:border-slate-700 relative">
                            <button
                              onClick={() => setShowRowActions(showRowActions?.tableIdx === currentTableIdx && showRowActions?.rowIdx === rowIdx ? null : { tableIdx: currentTableIdx, rowIdx })}
                              className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-600 rounded-lg transition-all duration-200 hover:shadow-sm cursor-pointer"
                              data-menu-trigger
                            >
                              <MoreVertical size={12} />
                            </button>
                            
                            {/* Row Action Menu */}
                            {showRowActions?.tableIdx === currentTableIdx && showRowActions?.rowIdx === rowIdx && (
                              <div className="absolute top-full right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-[9999] min-w-[200px] backdrop-blur-sm animate-in slide-in-from-top-2 duration-200" data-menu-content>
                                <div className="p-2 space-y-1">
                                  <button
                                    onClick={() => {
                                      addRow(currentTableIdx, rowIdx)
                                      setShowRowActions(null)
                                    }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-all duration-200 hover:shadow-sm cursor-pointer"
                                  >
                                    <Plus className="w-4 h-4" />
                                    Add Row Below
                                  </button>
                                  <button
                                    onClick={() => {
                                      startCellEdit(currentTableIdx, rowIdx, 0)
                                      setShowRowActions(null)
                                    }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-all duration-200 hover:shadow-sm cursor-pointer"
                                  >
                                    <Pencil className="w-4 h-4" />
                                    Edit Row
                                  </button>
                                  
                                  <div className="border-t border-slate-200 dark:border-slate-700 my-1"></div>
                                  
                                  {/* Summary Row Actions */}
                                  {!isSummary ? (
                                    <button
                                      onClick={() => {
                                        markAsSummaryRow(currentTableIdx, rowIdx)
                                        setShowRowActions(null)
                                      }}
                                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/30 rounded-lg transition-all duration-200 hover:shadow-sm cursor-pointer"
                                    >
                                      <FileText className="w-4 h-4" />
                                      Mark as Summary Row
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => {
                                        unmarkAsSummaryRow(currentTableIdx, rowIdx)
                                        setShowRowActions(null)
                                      }}
                                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/30 rounded-lg transition-all duration-200 hover:shadow-sm cursor-pointer"
                                    >
                                      <FileText className="w-4 h-4" />
                                      Unmark as Summary Row
                                    </button>
                                  )}
                                  
                                  {/* Format Actions */}
                                  {!isRightFormat && (
                                    <button
                                      onClick={() => {
                                        markAsRightFormatRow(currentTableIdx, rowIdx)
                                        setShowRowActions(null)
                                      }}
                                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded-lg transition-all duration-200 hover:shadow-sm cursor-pointer"
                                    >
                                      <CheckCircle className="w-4 h-4" />
                                      Mark as Right Format
                                    </button>
                                  )}
                                  
                                  {hasFormatError && (
                                    <button
                                      onClick={() => {
                                        fixRowFormatWithGPT(rowIdx)
                                        setShowRowActions(null)
                                      }}
                                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-all duration-200 hover:shadow-sm cursor-pointer"
                                    >
                                      <Brain className="w-4 h-4" />
                                      Fix Format with GPT
                                    </button>
                                  )}
                                  
                                  <div className="border-t border-slate-200 dark:border-slate-700 my-1"></div>
                                  <button
                                    onClick={() => {
                                      deleteRow(currentTableIdx, rowIdx)
                                      setShowRowActions(null)
                                    }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-all duration-200 hover:shadow-sm cursor-pointer"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                    Delete Row
                                  </button>
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                
                {/* Table Footer */}
                <div className="border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/30 px-4 py-3 flex items-center justify-between flex-shrink-0">
                  {/* Left Side - Table Info and Actions */}
                  <div className="flex items-center gap-4">
                    {/* Table Name */}
                    <div className="flex items-center gap-2 bg-white dark:bg-slate-700 rounded-lg px-3 py-2">
                      <div className="w-5 h-5 bg-blue-500 rounded flex items-center justify-center">
                        <span className="text-white text-xs font-bold">T</span>
                      </div>
                      <span className="text-sm text-slate-800 dark:text-slate-200 font-medium truncate block min-w-[140px] max-w-[200px]" title={currentTable?.name || 'Untitled Table'}>
                        {currentTable?.name || 'Untitled Table'}
                      </span>
                    </div>
                    
                    {/* Separator */}
                    <div className="h-6 w-px bg-border"></div>
                    
                    {/* Table Actions */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={addTable}
                        className="px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 hover:bg-purple-500 hover:border-purple-500 hover:text-white transition-all duration-200 flex items-center gap-2 cursor-pointer hover:shadow-sm rounded-lg"
                        title="Add new table"
                      >
                        <Plus className="w-4 h-4" />
                        <span className="text-sm font-medium">Add Table</span>
                      </button>
                      
                      {tables.length > 1 && (
                        <button
                          onClick={() => deleteTable(currentTableIdx)}
                          className="px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 hover:bg-red-500 hover:border-red-500 hover:text-white transition-all duration-200 flex items-center gap-2 cursor-pointer hover:shadow-sm rounded-lg"
                          title="Delete current table"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span className="text-sm font-medium">Delete Table</span>
                        </button>
                      )}
                      
                      <button
                        onClick={() => duplicateTable(currentTableIdx)}
                        className="px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600 hover:border-slate-300 dark:hover:border-slate-500 transition-all duration-200 flex items-center gap-2 cursor-pointer hover:shadow-sm rounded-lg"
                        title="Duplicate current table"
                      >
                        <FileText className="w-4 h-4" />
                        <span className="text-sm font-medium">Duplicate</span>
                      </button>
                    </div>
                  </div>
                  
                  {/* Right Side - Navigation Buttons */}
                  <div className="flex items-center gap-3">
                    {/* Table Navigation Info */}
                    <div className="flex items-center gap-2 bg-white dark:bg-slate-700 rounded-lg px-3 py-2">
                      <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                        Table {currentTableIdx + 1} of {tables.length}
                      </span>
                    </div>
                    
                    {/* Navigation Buttons */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setCurrentTableIdx(Math.max(0, currentTableIdx - 1))}
                        disabled={currentTableIdx === 0}
                        className="p-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 hover:bg-blue-500 hover:border-blue-500 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-all duration-200 flex items-center justify-center hover:shadow-sm rounded-lg"
                        title="Previous table"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setCurrentTableIdx(Math.min(tables.length - 1, currentTableIdx + 1))}
                        disabled={currentTableIdx === tables.length - 1}
                        className="p-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 hover:bg-blue-500 hover:border-blue-500 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-all duration-200 flex items-center justify-center hover:shadow-sm rounded-lg"
                        title="Next table"
                      >
                        <ChevronLeft className="w-4 h-4 transform rotate-180" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="text-slate-500 dark:text-slate-400 text-lg mb-2">No table available</div>
                  <div className="text-slate-500 dark:text-slate-400 text-sm">Please select a table</div>
                </div>
              </div>
            )}
            
            {/* Format Validation Summary */}
            {rightFormatRow && rightFormatRow.tableIdx === currentTableIdx && (
              <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-700/30 rounded-lg border border-slate-200 dark:border-slate-700 flex-shrink-0">
                <h4 className="text-sm font-medium text-slate-800 dark:text-slate-200 mb-2">Format Validation Results</h4>
                <div className="space-y-2">
                  {Object.entries(formatValidationResults).map(([rowIdx, result]) => {
                    if (result.isValid) return null
                    return (
                      <div key={rowIdx} className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 p-2 rounded border border-red-200 dark:border-red-800">
                        <div className="flex items-center justify-between">
                          <div className="font-medium">Row {parseInt(rowIdx) + 1}:</div>
                          <button
                            onClick={() => fixRowFormatWithGPT(parseInt(rowIdx))}
                            className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 cursor-pointer"
                            title="Auto-correct this row"
                          >
                            Fix Row
                          </button>
                        </div>
                        <ul className="list-disc list-inside mt-1 space-y-1">
                          {result.issues.map((issue: string, idx: number) => (
                            <li key={idx}>{issue}</li>
                          ))}
                        </ul>
                      </div>
                    )
                  })}
                  {Object.values(formatValidationResults).every(result => result.isValid) && (
                    <div className="text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/20 p-2 rounded border border-green-200 dark:border-green-800">
                      ✓ All rows match the reference format!
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      {!isFullscreen && (
        <div className="bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 px-4 py-3 shadow-lg flex-shrink-0">
          <div className="flex items-center justify-between">
            {/* Left side - Info */}
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-500 dark:text-slate-400">
                Step {steps.findIndex(s => s.key === currentStep) + 1} of {steps.length}: {steps.find(s => s.key === currentStep)?.label}
              </span>
              <div className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
                <Calendar className="w-3 h-3" />
                <span>Date: 2024-01-20</span>
              </div>
            </div>


            {/* Right side - Save & Continue Button */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleSaveAndContinue}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 font-medium cursor-pointer transition-all duration-200"
              >
                <Save className="w-4 h-4" />
                Save & Continue
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Spinner Loader */}
      <SpinnerLoader 
        isVisible={showSpinnerLoader} 
        onCancel={() => {
          setShowSpinnerLoader(false);
          toast.success('Demo saved successfully!')
          // Si hay callback, ejecutarlo
          if (onSaveAndContinue) {
            onSaveAndContinue()
          }
        }}
        duration={1500}
      />
    </div>
  )
}
