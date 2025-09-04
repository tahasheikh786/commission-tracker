'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { flushSync } from 'react-dom'
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
} from 'lucide-react'
import { toast } from 'react-hot-toast'

import { TableEditorProps } from './types'
import { cleanColumnNames, isSummaryRow, isGoogleDocAIExtraction } from './utils'
import { useTableOperations } from './hooks/useTableOperations'
import { useRowOperations } from './hooks/useRowOperations'
import { useSummaryRows } from './hooks/useSummaryRows'
import { useFormatValidation } from './hooks/useFormatValidation'
import { useUndoRedo } from './hooks/useUndoRedo'
import DocumentPreview from './components/DocumentPreview'
import TableHeader from './components/TableHeader'
import TableControls from './components/TableControls'
import DateSelectionModal from '../DateSelectionModal'
import { dateExtractionService, ExtractedDate } from '../../services/dateExtractionService'
import { GPTCorrectionLoader } from '../../../components/ui/FullScreenLoader'

import ProgressBar from '../ProgressBar'

// Custom scrollbar styles
const scrollbarStyles = `
  .custom-scrollbar::-webkit-scrollbar {
    width: 8px;
  }
  .custom-scrollbar::-webkit-scrollbar-track {
    background: #f3f4f6;
    border-radius: 4px;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: #d1d5db;
    border-radius: 4px;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: #9ca3af;
  }
`

export default function TableEditor({
  tables,
  onTablesChange,
  onSave,
  onUseAnotherExtraction,
  onGoToFieldMapping,
  onGoToPreviousExtraction,
  uploaded,
  loading = false,
  extractionHistory = [],
  currentExtractionIndex = 0,
  isUsingAnotherExtraction = false,
  hasUsedAnotherExtraction = false,
  onImproveExtraction,
  isImprovingExtraction,
  onStatementDateSelect,
  companyId,
  selectedStatementDate,
  disableAutoDateExtraction = false,
  tableEditorLearning,

}: TableEditorProps) {
  const [currentTableIdx, setCurrentTableIdx] = useState(0)
  const [searchTerm, setSearchTerm] = useState('')
  const [zoom, setZoom] = useState(1)
  const [showRowMenu, setShowRowMenu] = useState<{ tableIdx: number, rowIdx: number } | null>(null)
  const [showColumnMenu, setShowColumnMenu] = useState<{ tableIdx: number, colIdx: number } | null>(null)
  const [showHeaderActions, setShowHeaderActions] = useState<number | null>(null)
  const [showRowActions, setShowRowActions] = useState<{ tableIdx: number, rowIdx: number } | null>(null)
  const [showSummaryRows, setShowSummaryRows] = useState(true)
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set())
  
  // Date extraction state
  const [showDateModal, setShowDateModal] = useState(false)
  const [extractedDates, setExtractedDates] = useState<ExtractedDate[]>([])
  const [dateExtractionLoading, setDateExtractionLoading] = useState(false)
  const [hasExtractedDates, setHasExtractedDates] = useState(false) // Track if dates were ever extracted

  // Extraction handlers state
  const [isExtractingWithGPT, setIsExtractingWithGPT] = useState(false)
  const [isExtractingWithGoogleDocAI, setIsExtractingWithGoogleDocAI] = useState(false)
  const [gptServiceAvailable, setGptServiceAvailable] = useState(true)
  const [googleDocAIServiceAvailable, setGoogleDocAIServiceAvailable] = useState(true)

  // Extraction handlers
  const handleExtractWithGPT = async () => {
    // Always show loading state
    setIsExtractingWithGPT(true)
    toast.loading('Extracting with GPT-5 Vision...', { id: 'extract-gpt' })

    try {
      // Get upload ID from any possible field
      const uploadId = uploaded?.upload_id || uploaded?.id || uploaded?.extraction_id
      const currentCompanyId = companyId
      
      if (!uploadId || !currentCompanyId) {
        throw new Error('Missing upload or company information')
      }

      const formData = new FormData()
      formData.append('upload_id', uploadId)
      formData.append('company_id', currentCompanyId)

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/extract-tables-gpt/`, {
        method: 'POST',
        body: formData
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.detail || `HTTP error! status: ${response.status}`
        
        // Handle specific GPT error
        if (errorMessage.includes("'str' object has no attribute 'append'")) {
          setGptServiceAvailable(false)
          throw new Error('GPT extraction service is experiencing technical difficulties. Please try again later.')
        }
        
        throw new Error(errorMessage)
      }

      const result = await response.json()
      
      if (result.success) {
        // Update tables with new extraction result
        const extractedTables = result.tables || []
        onTablesChange(extractedTables)
        
        if (extractedTables.length === 0) {
          toast('GPT extraction completed but no tables were found in the document.', { id: 'extract-gpt' })
        } else {
          toast.success(`GPT extraction completed! ${extractedTables.length} tables extracted.`, { id: 'extract-gpt' })
        }
      } else {
        throw new Error(result.error || 'GPT extraction failed')
      }
    } catch (error) {
      console.error('❌ Error in GPT extraction:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      toast.error(`GPT extraction failed: ${errorMessage}`, { id: 'extract-gpt' })
    } finally {
      setIsExtractingWithGPT(false)
    }
  }



  const handleExtractWithGoogleDocAI = async () => {
    // Always show loading state
    setIsExtractingWithGoogleDocAI(true)
    toast.loading('Extracting with Google Document AI...', { id: 'extract-google' })

    try {
      // Get upload ID from any possible field
      const uploadId = uploaded?.upload_id || uploaded?.id || uploaded?.extraction_id
      const currentCompanyId = companyId
      
      if (!uploadId || !currentCompanyId) {
        throw new Error('Missing upload or company information')
      }

      const formData = new FormData()
      formData.append('upload_id', uploadId)
      formData.append('company_id', currentCompanyId)

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/extract-tables-google-docai/`, {
        method: 'POST',
        body: formData
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.detail || `HTTP error! status: ${response.status}`
        
        // Handle specific Google DOCAI permission error
        if (errorMessage.includes('IAM_PERMISSION_DENIED') || errorMessage.includes('documentai.processors.processOnline')) {
          setGoogleDocAIServiceAvailable(false)
          throw new Error('Google Document AI is not properly configured. Please contact your administrator.')
        }
        
        throw new Error(errorMessage)
      }

      const result = await response.json()
      
      if (result.success) {
        // Update tables with new extraction result
        const extractedTables = result.tables || []
        onTablesChange(extractedTables)
        
        if (extractedTables.length === 0) {
          toast('Google DOC AI extraction completed but no tables were found in the document.', { id: 'extract-google' })
        } else {
          toast.success(`Google DOC AI extraction completed! ${extractedTables.length} tables extracted.`, { id: 'extract-google' })
        }
      } else {
        throw new Error(result.error || 'Google DOC AI extraction failed')
      }
    } catch (error) {
      console.error('❌ Error in Google DOC AI extraction:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      toast.error(`Google DOC AI extraction failed: ${errorMessage}`, { id: 'extract-google' })
    } finally {
      setIsExtractingWithGoogleDocAI(false)
    }
  }
  
  // Ref to track processed data keys to prevent duplicate extractions
  const processedDataKeysRef = useRef<Set<string>>(new Set())
  


  // Click outside handler for menus
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      
      // Check if click is outside of any menu
      if (!target.closest('[data-header-menu]') && !target.closest('[data-row-actions-menu]') && 
          !target.closest('[data-header-menu-trigger]') && !target.closest('[data-row-menu-trigger]')) {
        setShowHeaderActions(null)
        setShowRowActions(null)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])
  
  // Ref to track if component is unmounting
  const isUnmountingRef = useRef(false)
  

  
  const fileInputRef = useRef<HTMLInputElement>(null)



  // Custom hooks
  const {
    undoStack,
    redoStack,
    hasUnsavedChanges,
    saveToUndoStack,
    undo,
    redo,
    clearHistory,
    setHasUnsavedChanges
  } = useUndoRedo(tables, onTablesChange)

  const {
    mergeHistory,
    mergeSelection,
    addTable,
    deleteTable,
    addColumn,
    deleteColumn,
    renameColumn,
    startMergeSelection,
    mergeColumns,
    revertLastMerge,
    handleColumnClick,
    setMergeSelection
  } = useTableOperations(tables, onTablesChange, saveToUndoStack)

  const {
    editingCell,
    editingRow,
    addRowAbove,
    addRowBelow,
    deleteRow,
    duplicateRow,
    startCellEdit,
    saveCellEdit,
    cancelCellEdit,
    startRowEdit,
    saveRowEdit,
    cancelRowEdit,
    updateRowEditValue,
    setEditingCell,
    setEditingRow
  } = useRowOperations(tables, onTablesChange, saveToUndoStack)

  const {
    autoDetectedCount,
    markAsSummaryRow,
    unmarkAsSummaryRow,
    deleteSummaryRows,
    learnSummaryRowPattern,
    autoDetectSummaryRows
  } = useSummaryRows(tables, onTablesChange, saveToUndoStack)

  const {
    rightFormatRow,
    formatValidationResults,
    isGPTCorrecting,
    markAsRightFormatRow,
    validateAllRowsFormat,
    clearFormatValidation,
    autoCorrectFormatIssues,
    correctSpecificRow,
    fixRowFormatWithGPT
  } = useFormatValidation(tables, onTablesChange, saveToUndoStack)

  // Helper functions
  const getDisplayRows = (tableIdx: number) => {
    const table = tables[tableIdx]
    if (!table) return []
    
    if (showSummaryRows) {
      return table.rows
    } else {
      return table.rows.filter((_, rowIdx) => !isSummaryRow(table, rowIdx))
    }
  }

  const hasExtractionHistory = () => {
    return extractionHistory.length > 1
  }

  const canGoToPreviousExtraction = () => {
    return hasExtractionHistory() && currentExtractionIndex > 0
  }

  // Multiple row selection functions
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

  const onClearAll = () => {
    setSelectedRows(new Set())
    clearFormatValidation()
    toast.success('Cleared all selections and format validation')
  }

  const selectAllRows = () => {
    const currentTable = tables[currentTableIdx]
    if (currentTable) {
      const displayRows = getDisplayRows(currentTableIdx)
      const displayRowIndices = displayRows.map((_, displayIdx) => {
        return showSummaryRows 
          ? displayIdx 
          : currentTable.rows.findIndex((_, idx) => !isSummaryRow(currentTable, idx) && 
              currentTable.rows.slice(0, idx).filter((_, i) => !isSummaryRow(currentTable, i)).length === displayIdx)
      })
      setSelectedRows(new Set(displayRowIndices))
    }
  }

  const clearRowSelection = () => {
    setSelectedRows(new Set())
  }

  const deleteSelectedRows = () => {
    if (selectedRows.size === 0) return
    
    saveToUndoStack()
    const newTables = [...tables]
    const currentTable = newTables[currentTableIdx]
    
    const sortedIndices = Array.from(selectedRows).sort((a, b) => b - a)
    
    sortedIndices.forEach(rowIdx => {
      currentTable.rows.splice(rowIdx, 1)
    })
    
    onTablesChange(newTables)
    setSelectedRows(new Set())
    toast.success(`Deleted ${selectedRows.size} selected rows`)
  }

  // Process tables and call onTablesChange when needed
  useEffect(() => {
    if (!tables.length) return

    const cleanedTables = tables.map(table => ({
      ...table,
      header: cleanColumnNames(table.header)
    }))

    const hasChanges = JSON.stringify(cleanedTables) !== JSON.stringify(tables)
    
    if (hasChanges) {
      onTablesChange(cleanedTables)
    }
  }, [tables, extractionHistory, currentExtractionIndex, onTablesChange])

  // Trigger date extraction when TableEditor loads
  useEffect(() => {
    if (!tables.length || !uploaded?.file || !companyId || disableAutoDateExtraction || dateExtractionLoading) {
      return
    }

    const dataKey = `${tables.length}-${uploaded.file_name}-${companyId}`
    
    // Skip if already processed
    if (processedDataKeysRef.current.has(dataKey)) {
      return
    }

    processedDataKeysRef.current.add(dataKey)
    
    const extractDates = async () => {
      if (isUnmountingRef.current) return
      
      setDateExtractionLoading(true)
      
      try {
        const response = await dateExtractionService.extractDatesFromFile(uploaded.file, companyId)
        
        // Always try to show modal if we have a successful response, even if component is unmounting
        if (response.success) {
          setExtractedDates(response.dates || [])
          if (response.dates && response.dates.length > 0) {
            setHasExtractedDates(true) // Mark that dates were extracted
          }
          setShowDateModal(true) // 🎯 This will now work!
          
          if (response.dates && response.dates.length > 0) {
            toast.success(`Found ${response.dates.length} date(s) in your document`)
          } else {
            toast.success('No dates found in the document. You can manually select a date.')
          }
        }
      } catch (error) {
        console.log('❌ Date extraction failed:', error)
        // Always try to show modal for manual selection, even if component is unmounting
        setExtractedDates([])
        setHasExtractedDates(false) // Reset flag on error
        setShowDateModal(true)
        toast.error('Date extraction failed. Please select manually.')
      } finally {
        // Always reset loading state
        setDateExtractionLoading(false)
      }
    }
    
    extractDates()
  }, [tables.length, uploaded?.file, uploaded?.file_name, companyId, disableAutoDateExtraction, dateExtractionLoading])

  // Cleanup effect that only runs on unmount
  useEffect(() => {
    return () => {
      isUnmountingRef.current = true
    }
  }, [])

  const handleDateSelect = (selectedDate: string, dateType: string) => {
    if (onStatementDateSelect) {
      const dateInfo = {
        date: selectedDate,
        type: dateType,
        source: 'extraction'
      }
      onStatementDateSelect(dateInfo)
    }
    toast.success(`Selected statement date: ${selectedDate}`)
  }

  const handleCloseDateModalWithoutSelection = () => {
    console.log('Modal closed without selection:', { extractedDates: extractedDates.length, hasExtractedDates })
    // Always reset the state when modal is closed without selection to allow retry
    console.log('Resetting state for retry')
    setHasExtractedDates(false)
    setExtractedDates([])
    // Always reset loading state when modal is closed
    setDateExtractionLoading(false)
  }

  const performDateExtraction = useCallback(async () => {
    console.log('Starting date extraction')
    setDateExtractionLoading(true)
    
    // Check if component is unmounting
    if (isUnmountingRef.current) {
      return
    }
    
    if (!uploaded?.file || !companyId) {
      setDateExtractionLoading(false)
      return
    }
    
    try {
      const fileToUse = uploaded.file
      let response
      
      if (fileToUse instanceof File) {
        response = await dateExtractionService.extractDatesFromFile(fileToUse, companyId)
      } else if (fileToUse && typeof fileToUse === 'object' && fileToUse.url) {
        try {
          const fileResponse = await fetch(fileToUse.url)
          if (!fileResponse.ok) {
            throw new Error(`Failed to fetch file from URL: ${fileResponse.status}`)
          }
          const fileBlob = await fileResponse.blob()
          const fileName = uploaded.file_name || 'document.pdf'
          const file = new File([fileBlob], fileName, { type: fileBlob.type || 'application/pdf' })
          response = await dateExtractionService.extractDatesFromFile(file, companyId)
        } catch (fetchError) {
          // Always try to show modal, even if component is unmounting
          setExtractedDates([])
          setHasExtractedDates(true) // Reset flag on error
          setShowDateModal(true)
          toast.success('Could not access the file for date extraction. You can manually select a date.')
          setDateExtractionLoading(false)
          return
        }
      } else {
        // Always try to show modal, even if component is unmounting
        setExtractedDates([])
        setHasExtractedDates(false) // Reset flag on error
        setShowDateModal(true)
        toast.success('Date extraction not available. You can manually select a date.')
        setDateExtractionLoading(false)
        return
      }
      
      // Always try to show modal, even if component is unmounting
      if (response.success && response.dates && response.dates.length > 0) {
        setExtractedDates(response.dates)
        setHasExtractedDates(true) // Mark that dates were extracted
        setShowDateModal(true)
        toast.success(`Found ${response.dates.length} date(s) in your document`)
      } else {
        setExtractedDates([])
        setHasExtractedDates(true) // Set to true to indicate extraction was attempted
        setShowDateModal(true)
        toast.success('No dates found in the document. You can manually select a date.')
      }
    } catch (error: any) {
      // Always try to show modal for manual selection, even if component is unmounting
      setExtractedDates([])
      setHasExtractedDates(true) // Set to true to indicate extraction was attempted
      setShowDateModal(true)
      toast.success('Date extraction failed. You can manually select a date.')
    } finally {
      // Always reset loading state
      setDateExtractionLoading(false)
    }
  }, [uploaded?.file, uploaded?.file_name, companyId])

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element
      
      if (showRowMenu && !target.closest('[data-row-menu]')) {
        setShowRowMenu(null)
      }
      
      if (showColumnMenu && !target.closest('[data-column-menu]')) {
        setShowColumnMenu(null)
      }
      
      // Close header and row action menus
      if (showHeaderActions !== null && !target.closest('[data-header-menu]')) {
        setShowHeaderActions(null)
      }
      
      if (showRowActions && !target.closest('[data-row-actions-menu]')) {
        setShowRowActions(null)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showRowMenu, showColumnMenu, showHeaderActions, showRowActions])

  // Reset loading state when modal closes
  useEffect(() => {
    if (!showDateModal && dateExtractionLoading) {
      setDateExtractionLoading(false)
    }
  }, [showDateModal, dateExtractionLoading])

  // Save changes
  const handleSave = () => {
    onSave(tables, selectedStatementDate)
    setHasUnsavedChanges(false)
    clearHistory()
    toast.success('Changes saved successfully')
  }

  const currentTable = tables[currentTableIdx]

  const handleZoomIn = () => setZoom(z => Math.min(z + 0.2, 2))
  const handleZoomOut = () => setZoom(z => Math.max(z - 0.2, 0.5))

  // Header Action Menu Component
  const HeaderActionMenu = ({ tableIdx, colIdx }: { tableIdx: number, colIdx: number }) => {
    const table = tables[tableIdx]
    const [newName, setNewName] = useState(table?.header[colIdx] || '')
    const [isRenaming, setIsRenaming] = useState(false)
    const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 })

    const handleRename = () => {
      if (newName.trim()) {
        renameColumn(tableIdx, colIdx, newName.trim())
        setIsRenaming(false)
      }
    }

    // Calculate menu position when component mounts
    useEffect(() => {
      const headerElement = document.querySelector(`[data-header-menu-trigger="${tableIdx}-${colIdx}"]`) as HTMLElement
      if (headerElement) {
        const rect = headerElement.getBoundingClientRect()
        const menuWidth = 200 // Approximate menu width
        const menuHeight = 300 // Approximate menu height
        
        // Calculate position with viewport bounds checking
        let left = rect.left + window.scrollX
        let top = rect.bottom + window.scrollY + 4 // Add small gap
        
        // Adjust if menu would go off the right edge
        if (left + menuWidth > window.innerWidth) {
          left = window.innerWidth - menuWidth - 10
        }
        
        // Adjust if menu would go off the bottom edge
        if (top + menuHeight > window.innerHeight + window.scrollY) {
          top = rect.top + window.scrollY - menuHeight - 4
        }
        
        setMenuPosition({ top, left })
      }
    }, [tableIdx, colIdx])

    return (
      <div 
        className="fixed bg-white border border-gray-200 rounded-lg shadow-2xl z-[99999] min-w-[200px] max-h-[300px] overflow-y-auto backdrop-blur-sm animate-in fade-in-0 zoom-in-95 duration-100"
        style={{
          top: `${menuPosition.top}px`,
          left: `${menuPosition.left}px`
        }}
        data-header-menu
      >
        <div className="p-2 border-b border-gray-100">
          <div className="text-xs font-medium text-gray-700 mb-2">Column Actions</div>
        </div>
        
        {isRenaming ? (
          <div className="p-3">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleRename()}
              className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
              placeholder="New column name"
              autoFocus
            />
            <div className="flex gap-1 mt-2">
              <button
                onClick={handleRename}
                className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
              >
                Save
              </button>
              <button
                onClick={() => setIsRenaming(false)}
                className="px-2 py-1 bg-gray-300 text-gray-700 rounded text-xs hover:bg-gray-400"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            <button
              onClick={() => setIsRenaming(true)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded transition-colors"
            >
              <Pencil className="w-4 h-4" />
              Rename Column
            </button>
            
            <button
              onClick={() => addColumn(tableIdx, colIdx + 1)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Column After
            </button>
            
            <button
              onClick={() => startMergeSelection(tableIdx, colIdx)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded transition-colors"
            >
              <Filter className="w-4 h-4" />
              Merge with Another Column
            </button>
            
            <div className="border-t border-gray-100 my-1"></div>
            
            <button
              onClick={() => deleteColumn(tableIdx, colIdx)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Delete Column
            </button>
          </div>
        )}
      </div>
    )
  }

  // Row Action Menu Component
  const RowActionMenu = ({ tableIdx, rowIdx }: { tableIdx: number, rowIdx: number }) => {
    const table = tables[tableIdx]
    const isSummary = table ? isSummaryRow(table, rowIdx) : false
    const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 })
    
    // Calculate menu position when component mounts
    useEffect(() => {
      const rowElement = document.querySelector(`[data-row-menu-trigger="${tableIdx}-${rowIdx}"]`) as HTMLElement
      if (rowElement) {
        const rect = rowElement.getBoundingClientRect()
        const menuWidth = 200 // Approximate menu width
        const menuHeight = 300 // Approximate menu height
        
        // Calculate position with viewport bounds checking
        let left = rect.left + window.scrollX
        let top = rect.bottom + window.scrollY + 4 // Add small gap
        
        // Adjust if menu would go off the right edge
        if (left + menuWidth > window.innerWidth) {
          left = window.innerWidth - menuWidth - 10
        }
        
        // Adjust if menu would go off the bottom edge
        if (top + menuHeight > window.innerHeight + window.scrollY) {
          top = rect.top + window.scrollY - menuHeight - 4
        }
        
        setMenuPosition({ top, left })
      }
    }, [tableIdx, rowIdx])
    
    return (
      <div 
        className="fixed bg-white border border-gray-200 rounded-lg shadow-2xl z-[99999] min-w-[200px] max-h-[300px] overflow-y-auto backdrop-blur-sm animate-in fade-in-0 zoom-in-95 duration-100"
        style={{
          top: `${menuPosition.top}px`,
          left: `${menuPosition.left}px`
        }}
        data-row-actions-menu
      >
        <div className="p-2 border-b border-gray-100">
          <div className="text-xs font-medium text-gray-700 mb-2">Row Actions</div>
        </div>
        
        <div className="p-2 space-y-1">
          <button
            onClick={() => {
              addRowAbove(tableIdx, rowIdx)
              setShowRowActions(null)
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Row Above
          </button>
          
          <button
            onClick={() => {
              addRowBelow(tableIdx, rowIdx)
              setShowRowActions(null)
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Row Below
          </button>
          
          <button
            onClick={() => {
              duplicateRow(tableIdx, rowIdx)
              setShowRowActions(null)
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded transition-colors"
          >
            <FileText className="w-4 h-4" />
            Duplicate Row
          </button>
          
          <button
            onClick={() => {
              startRowEdit(tableIdx, rowIdx)
              setShowRowActions(null)
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded transition-colors"
          >
            <Pencil className="w-4 h-4" />
            Edit Row
          </button>
          
          <div className="border-t border-gray-100 my-1"></div>
          
          {/* Summary Row Actions */}
          {!isSummary ? (
            <button
              onClick={() => {
                markAsSummaryRow(tableIdx, rowIdx)
                setShowRowActions(null)
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded transition-colors"
            >
              <FileText className="w-4 h-4" />
              Mark as Summary Row
            </button>
          ) : (
            <button
              onClick={() => {
                unmarkAsSummaryRow(tableIdx, rowIdx)
                setShowRowActions(null)
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-orange-600 hover:bg-orange-50 rounded transition-colors"
            >
              <FileText className="w-4 h-4" />
              Unmark as Summary Row
            </button>
          )}
          
          <div className="border-t border-gray-100 my-1"></div>
          
          <button
            onClick={() => {
              deleteRow(tableIdx, rowIdx)
              setShowRowActions(null)
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Delete Row
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: scrollbarStyles }} />
      <div className="fixed inset-0 bg-gradient-to-br from-gray-50 to-blue-50 z-50">
      {/* Full-screen loader overlays */}
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

      {/* GPT Correction Full-Screen Loader */}
      <GPTCorrectionLoader 
        isVisible={isGPTCorrecting}
        progress={isGPTCorrecting ? 75 : 0}
        onCancel={() => {
          // Note: GPT correction cannot be easily cancelled as it's a server-side process
          // This would require implementing a cancellation mechanism on the backend
          toast.error("GPT correction is already in progress and cannot be cancelled");
        }}
      />
      
      {/* Main Content - Side by Side Layout */}
      <div className="flex flex-col h-full">
        {/* Progress Bar */}
        <ProgressBar currentStep="table_editor" />
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-purple-50 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-bold text-gray-900">Table Editor</h2>
            {uploaded && (
              <span className="text-sm text-gray-500 bg-white px-3 py-1 rounded-full border">
                {uploaded.file_name}
              </span>
            )}
            {selectedStatementDate && (
              <div className="flex items-center gap-2 bg-green-100 px-3 py-1 rounded-full border border-green-200">
                <Calendar className="w-4 h-4 text-green-600" />
                <span className="text-sm text-green-700 font-medium">
                  Statement Date: {selectedStatementDate.date}
                </span>
                <button
                  onClick={() => {
                    if (onStatementDateSelect) {
                      onStatementDateSelect(null)
                    }
                    // Reset all date extraction state to allow re-extraction
                    processedDataKeysRef.current.clear()
                    setDateExtractionLoading(false)
                    setExtractedDates([])
                    setHasExtractedDates(false) // Reset the flag
                    setShowDateModal(false)
                    toast.success('Date selection reset. You can extract dates again.')
                  }}
                  className="ml-1 p-1 text-green-600 hover:text-green-800 hover:bg-green-200 rounded-full transition-colors"
                  title="Reset date selection"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-3">
                        {/* Date Extraction Button */}
            <button
              onClick={() => {
                console.log('Extract dates button clicked:', { hasExtractedDates, extractedDates: extractedDates.length, dateExtractionLoading })
                
                // If dates were already extracted and we have dates, just reopen the modal
                if (hasExtractedDates && extractedDates.length > 0) {
                  console.log('Reopening modal with existing dates')
                  setShowDateModal(true)
                  return
                }
                
                // If not loading, perform extraction (this will handle both initial extraction and retry)
                if (!dateExtractionLoading) {
                  console.log('Starting date extraction')
                  performDateExtraction()
                }
              }}
              disabled={dateExtractionLoading}
              className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 text-sm"
              title={hasExtractedDates && extractedDates.length > 0 ? "Reopen date selection modal" : "Extract dates from document"}
            >
              <Calendar className="w-4 h-4" />
              {dateExtractionLoading ? 'Extracting...' : (hasExtractedDates && extractedDates.length > 0 ? 'Select Date' : 'Extract Dates')}
            </button>



            {/* Extract with GPT 5 Button */}
            <button
              onClick={handleExtractWithGPT}
              disabled={isExtractingWithGPT || loading || !gptServiceAvailable}
              className="px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2 text-sm"
              title="Extract tables using GPT-5 Vision"
            >
              <Brain className="w-4 h-4" />
              {isExtractingWithGPT ? 'Extracting with GPT...' : !gptServiceAvailable ? 'GPT Service Unavailable' : 'Extract with GPT 5'}
            </button>

            {/* Extract with Google DOC AI Button */}
            <button
              onClick={handleExtractWithGoogleDocAI}
              disabled={isExtractingWithGoogleDocAI || loading || !googleDocAIServiceAvailable}
              className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2 text-sm"
              title="Extract tables using Google Document AI"
            >
              <FileText className="w-4 h-4" />
              {isExtractingWithGoogleDocAI ? 'Extracting with DOC AI...' : !googleDocAIServiceAvailable ? 'DOC AI Service Unavailable' : 'Extract with Google DOC AI'}
            </button>




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
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Side by Side Content */}
        <div className="flex-1 flex flex-row gap-6 p-6 bg-gradient-to-br from-white via-blue-50 to-purple-50 min-h-0">
          {/* Document Preview - Left Side */}
          {uploaded && (
            <DocumentPreview
              uploaded={uploaded}
              zoom={zoom}
              onZoomIn={handleZoomIn}
              onZoomOut={handleZoomOut}
            />
          )}

          {/* Table Editor - Right Side */}
          <div className="w-3/5 min-w-0 flex flex-col rounded-2xl shadow-xl bg-white border border-purple-100 overflow-hidden">
            <TableHeader
              currentTableIdx={currentTableIdx}
              tablesLength={tables.length}
              showSummaryRows={showSummaryRows}
              onToggleSummaryRows={() => setShowSummaryRows(!showSummaryRows)}
              onNavigateTable={(direction) => {
                if (direction === 'prev') {
                  setCurrentTableIdx(Math.max(0, currentTableIdx - 1))
                } else {
                  setCurrentTableIdx(Math.min(tables.length - 1, currentTableIdx + 1))
                }
              }}
              onImproveExtraction={onImproveExtraction}
              isImprovingExtraction={isImprovingExtraction}
              loading={loading}
              isUsingAnotherExtraction={isUsingAnotherExtraction}
            />
            
            <div className="flex-1 min-h-0 min-w-0 overflow-auto p-4">
              {!tables.length ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="text-gray-500 text-lg mb-2">No tables available</div>
                    <div className="text-gray-400 text-sm">Please upload a file to extract tables</div>
                  </div>
                </div>
              ) : currentTable ? (
                <>
                  {/* Merge Mode Indicator */}
                  {mergeSelection && mergeSelection.tableIdx === currentTableIdx && (
                    <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                          <span className="text-sm font-medium text-blue-800">
                            Merge Mode Active
                          </span>
                          <span className="text-xs text-blue-600">
                            Click on another column to merge with &quot;{currentTable.header[mergeSelection.colIdx]}&quot;
                          </span>
                        </div>
                        <button
                          onClick={() => setMergeSelection(null)}
                          className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                  
                  <TableControls
                    currentTable={currentTable}
                    currentTableIdx={currentTableIdx}
                    rightFormatRow={rightFormatRow}
                    formatValidationResults={formatValidationResults}
                    selectedRows={selectedRows}
                    onSetFormatRow={() => {
                      const selectedRow = Array.from(selectedRows)[0]
                      if (selectedRow !== undefined) {
                        markAsRightFormatRow(currentTableIdx, selectedRow)
                      } else {
                        toast.error('Please select a row first to mark as right format')
                      }
                    }}
                    onFixRowFormatWithGPT={fixRowFormatWithGPT}
                    onClearAll={onClearAll}
                    onDeleteSelectedRows={deleteSelectedRows}
                    onAutoDetectSummaryRows={() => autoDetectSummaryRows(currentTableIdx)}
                    onLearnSummaryRowPattern={() => learnSummaryRowPattern(currentTableIdx)}
                    onDeleteSummaryRows={() => deleteSummaryRows(currentTableIdx)}
                    onDeleteTable={() => deleteTable(currentTableIdx)}
                    onUpdateTableName={(name) => {
                      const newTables = [...tables]
                      newTables[currentTableIdx].name = name
                      onTablesChange(newTables)
                    }}
                  />
                  
                  <div className={`bg-white border rounded-lg shadow-sm ${
                    mergeSelection && mergeSelection.tableIdx === currentTableIdx
                      ? 'border-blue-300 bg-blue-50/30'
                      : 'border-gray-200'
                  }`}>
                    <div className="overflow-x-auto w-full">
                      <div 
                        className="max-h-[420px] overflow-y-auto border-t border-gray-100 custom-scrollbar" 
                        style={{ 
                          scrollbarWidth: 'thin', 
                          scrollbarColor: '#d1d5db #f3f4f6',
                          msOverflowStyle: 'none'
                        }}
                      >
                        <table className="w-full min-w-full">
                        <thead className="sticky top-0 z-10">
                          <tr className="bg-gray-50">
                            {/* Checkbox column for multiple selection */}
                            <th className="px-3 py-3 text-left text-xs font-medium text-gray-900 border-b border-gray-200 w-12 whitespace-nowrap">
                              <input
                                type="checkbox"
                                checked={selectedRows.size === getDisplayRows(currentTableIdx).length && getDisplayRows(currentTableIdx).length > 0}
                                ref={(input) => {
                                  if (input) {
                                    input.indeterminate = selectedRows.size > 0 && selectedRows.size < getDisplayRows(currentTableIdx).length
                                  }
                                }}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    selectAllRows()
                                  } else {
                                    clearRowSelection()
                                  }
                                }}
                                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                              />
                            </th>
                            {currentTable?.header?.map((header, colIdx) => (
                              <th
                                key={colIdx}
                                className={`px-3 py-3 text-left text-xs font-medium text-gray-900 border-b border-gray-200 whitespace-nowrap relative ${
                                  mergeSelection && mergeSelection.tableIdx === currentTableIdx && mergeSelection.colIdx === colIdx
                                    ? 'bg-blue-100 border-blue-300'
                                    : mergeSelection && mergeSelection.tableIdx === currentTableIdx
                                    ? 'cursor-pointer hover:bg-blue-50 hover:border-blue-200'
                                    : ''
                                }`}
                                title={
                                  mergeSelection && mergeSelection.tableIdx === currentTableIdx && mergeSelection.colIdx !== colIdx
                                    ? `Click to merge with &quot;${currentTable.header[mergeSelection.colIdx]}&quot;`
                                    : mergeSelection && mergeSelection.tableIdx === currentTableIdx && mergeSelection.colIdx === colIdx
                                    ? 'Selected for merge'
                                    : ''
                                }
                                onClick={() => {
                                  if (mergeSelection && mergeSelection.tableIdx === currentTableIdx) {
                                    handleColumnClick(currentTableIdx, colIdx)
                                  }
                                }}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="truncate flex-1">{header}</span>
                                  {mergeSelection && mergeSelection.tableIdx === currentTableIdx && mergeSelection.colIdx === colIdx && (
                                    <div className="ml-1 w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                                  )}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation() // Prevent triggering column click for merge
                                      setShowHeaderActions(showHeaderActions === colIdx ? null : colIdx)
                                    }}
                                    className="ml-2 p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                                    data-header-menu-trigger={`${currentTableIdx}-${colIdx}`}
                                  >
                                    <MoreHorizontal size={12} />
                                  </button>
                                </div>
                                
                                {/* Header Action Menu */}
                                {showHeaderActions === colIdx && (
                                  <HeaderActionMenu tableIdx={currentTableIdx} colIdx={colIdx} />
                                )}
                              </th>
                            ))}
                            <th className="px-3 py-3 text-left text-xs font-medium text-gray-900 border-b border-gray-200 w-24 whitespace-nowrap">
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {currentTable && getDisplayRows(currentTableIdx).map((row, displayRowIdx) => {
                            // Map display row index back to original row index
                            const originalRowIdx = showSummaryRows 
                              ? displayRowIdx 
                              : currentTable.rows.findIndex((_, idx) => !isSummaryRow(currentTable, idx) && 
                                  currentTable.rows.slice(0, idx).filter((_, i) => !isSummaryRow(currentTable, i)).length === displayRowIdx)
                            
                            return (
                              <tr 
                                key={originalRowIdx} 
                                className={`hover:bg-gray-50 group relative ${
                                  isSummaryRow(currentTable, originalRowIdx) 
                                    ? 'bg-orange-50 border-l-4 border-orange-400' 
                                    : rightFormatRow && rightFormatRow.tableIdx === currentTableIdx && rightFormatRow.rowIdx === originalRowIdx
                                    ? 'bg-green-50 border-l-4 border-green-400'
                                    : formatValidationResults[originalRowIdx] && !formatValidationResults[originalRowIdx].isValid
                                    ? 'bg-red-50 border-l-4 border-red-400'
                                    : ''
                                }`}
                              >
                                {/* Checkbox column for multiple selection */}
                                <td className="px-3 py-3 text-xs text-gray-900 border-b border-gray-100 whitespace-nowrap">
                                  <input
                                    type="checkbox"
                                    checked={selectedRows.has(originalRowIdx)}
                                    onChange={() => toggleRowSelection(originalRowIdx)}
                                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                                  />
                                </td>
                                {row.map((cell, colIdx) => (
                                  <td
                                    key={colIdx}
                                    className="px-3 py-3 text-xs text-gray-900 border-b border-gray-100 whitespace-nowrap"
                                  >
                                    {editingCell && editingCell.tableIdx === currentTableIdx && editingCell.rowIdx === originalRowIdx && editingCell.colIdx === colIdx ? (
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
                                        className={`cursor-pointer hover:bg-blue-50 rounded px-1 py-0.5 transition-colors truncate ${
                                          formatValidationResults[originalRowIdx] && 
                                          formatValidationResults[originalRowIdx].issues.some(issue => issue.includes(`Column ${colIdx + 1}`))
                                            ? 'bg-red-100 border border-red-300'
                                            : ''
                                        }`}
                                        onClick={() => startCellEdit(currentTableIdx, originalRowIdx, colIdx)}
                                        title={
                                          formatValidationResults[originalRowIdx] && 
                                          formatValidationResults[originalRowIdx].issues.some(issue => issue.includes(`Column ${colIdx + 1}`))
                                            ? formatValidationResults[originalRowIdx].issues.filter(issue => issue.includes(`Column ${colIdx + 1}`)).join('\n')
                                            : cell
                                        }
                                      >
                                        {cell}
                                        {formatValidationResults[originalRowIdx] && 
                                         formatValidationResults[originalRowIdx].issues.some(issue => issue.includes(`Column ${colIdx + 1}`)) && (
                                          <div className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full"></div>
                                        )}
                                      </div>
                                    )}
                                  </td>
                                ))}
                                <td className="px-3 py-3 text-xs text-gray-900 border-b border-gray-100 whitespace-nowrap relative">
                                  <button
                                    onClick={() => setShowRowActions(showRowActions?.tableIdx === currentTableIdx && showRowActions?.rowIdx === originalRowIdx ? null : { tableIdx: currentTableIdx, rowIdx: originalRowIdx })}
                                    className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                                    data-row-menu-trigger={`${currentTableIdx}-${originalRowIdx}`}
                                  >
                                    <MoreVertical size={12} />
                                  </button>
                                  
                                  {/* Row Action Menu */}
                                  {showRowActions?.tableIdx === currentTableIdx && showRowActions?.rowIdx === originalRowIdx && (
                                    <RowActionMenu tableIdx={currentTableIdx} rowIdx={originalRowIdx} />
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                        </div>
                        {/* Scroll indicator */}
                        <div className="h-1 bg-gradient-to-t from-gray-50 to-transparent pointer-events-none"></div>
                    </div>
                  </div>
                  
                  {/* Format Validation Summary */}
                  {rightFormatRow && rightFormatRow.tableIdx === currentTableIdx && (
                    <div className="mt-4 p-4 bg-gray-50 rounded-lg border">
                      <h4 className="text-sm font-medium text-gray-900 mb-2">Format Validation Results</h4>
                      <div className="space-y-2">
                        {Object.entries(formatValidationResults).map(([rowIdx, result]) => {
                          if (result.isValid) return null
                          return (
                            <div key={rowIdx} className="text-xs text-red-600 bg-red-50 p-2 rounded border border-red-200">
                              <div className="flex items-center justify-between">
                                <div className="font-medium">Row {parseInt(rowIdx) + 1}:</div>
                                <button
                                  onClick={() => correctSpecificRow(parseInt(rowIdx))}
                                  className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
                                  title="Auto-correct this row"
                                >
                                  Fix Row
                                </button>
                              </div>
                              <ul className="list-disc list-inside mt-1 space-y-1">
                                {result.issues.map((issue, idx) => (
                                  <li key={idx}>{issue}</li>
                                ))}
                              </ul>
                            </div>
                          )
                        })}
                        {Object.values(formatValidationResults).every(result => result.isValid) && (
                          <div className="text-xs text-green-600 bg-green-50 p-2 rounded border border-green-200">
                            ✓ All rows match the reference format!
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="text-gray-500 text-lg mb-2">Table not found</div>
                    <div className="text-gray-400 text-sm">The selected table is not available</div>
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
              {isGoogleDocAIExtraction(tables) && !hasExtractionHistory() && !isUsingAnotherExtraction && !hasUsedAnotherExtraction && (
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
              
              {hasExtractionHistory() && !isGoogleDocAIExtraction(tables) && !isUsingAnotherExtraction && !hasUsedAnotherExtraction && (
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
              {selectedStatementDate && (
                <div className="flex items-center gap-1 text-sm text-green-600">
                  <Calendar className="w-3 h-3" />
                  <span>Date: {selectedStatementDate.date}</span>
                </div>
              )}
              {tableEditorLearning && (
                <button
                  onClick={async () => {
                    try {
                      const settings = await tableEditorLearning.fetchTableEditorSettings(tables)
                      if (settings) {
                        const updatedTables = tableEditorLearning.applyLearnedSettings(tables, settings)
                        onTablesChange(updatedTables)
                      } else {
                        toast.error('No learned settings found for this format')
                      }
                    } catch (error) {
                      console.error('Error applying learned settings:', error)
                      toast.error('Failed to apply learned settings')
                    }
                  }}
                  disabled={loading || isUsingAnotherExtraction || tableEditorLearning.isLoading}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2 text-sm"
                >
                  <Brain className="w-4 h-4" />
                  Apply Learned Settings
                </button>
              )}
              <button
                onClick={() => {
                  onSave(tables)
                  onGoToFieldMapping()
                }}
                disabled={loading || isUsingAnotherExtraction || !selectedStatementDate}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 font-medium"
                title={!selectedStatementDate ? "Please select a statement date first" : "Save tables and proceed to field mapping"}
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
          onChange={() => {}} // TODO: Implement import functionality
          className="hidden"
        />

        {/* Date Selection Modal */}
        <DateSelectionModal
          isOpen={showDateModal}
          onClose={() => {
            console.log('Modal closed normally')
            setShowDateModal(false)
          }}
          onDateSelect={handleDateSelect}
          onCloseWithoutSelection={handleCloseDateModalWithoutSelection}
          extractedDates={extractedDates}
          fileName={uploaded?.file_name || 'Unknown file'}
          loading={dateExtractionLoading}
        />

      </div>
    </div>
    </>
  )
}
