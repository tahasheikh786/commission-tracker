'use client'

import { useState, useRef, useEffect } from 'react'
import { 
  Pencil, Trash2, Plus, RotateCcw, FileText, ChevronLeft,
  MoreVertical, MoreHorizontal, Filter, Calendar, X,
  Brain, Eye, EyeOff, Building2, AlertCircle,
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
import { dateExtractionService, ExtractedDate } from '../../services/dateExtractionService'
import { GPTCorrectionLoader, GPTExtractionLoader, DOCAIExtractionLoader, MistralExtractionLoader } from '../../../components/ui/FullScreenLoader'
import ProgressBar from '../ProgressBar'

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
  extractedCarrier: initialExtractedCarrier,
  extractedDate: initialExtractedDate,
  carrierConfidence: initialCarrierConfidence,
}: TableEditorProps) {
  
  // ============ STATE ==============
  const [currentTableIdx, setCurrentTableIdx] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [showHeaderActions, setShowHeaderActions] = useState<number | null>(null)
  const [showRowActions, setShowRowActions] = useState<{ tableIdx: number, rowIdx: number } | null>(null)
  const [showSummaryRows, setShowSummaryRows] = useState(true)
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set())
  const [showPreview, setShowPreview] = useState(true)
  const [extractedCarrier, setExtractedCarrier] = useState<string | null>(initialExtractedCarrier || null)
  const [extractedDate, setExtractedDate] = useState<string | null>(initialExtractedDate || null)
  const [carrierConfidence, setCarrierConfidence] = useState<number | null>(initialCarrierConfidence || null)
  const [isExtractingWithGPT, setIsExtractingWithGPT] = useState(false)
  const [isExtractingWithGoogleDocAI, setIsExtractingWithGoogleDocAI] = useState(false)
  const [isExtractingWithMistral, setIsExtractingWithMistral] = useState(false)
  
  // ============ CUSTOM HOOKS ==============
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

  // ============ HELPER FUNCTIONS ==============
  const currentTable = tables[currentTableIdx]
  
  const getDisplayRows = (tableIdx: number) => {
    const table = tables[tableIdx]
    if (!table) return []
    return showSummaryRows ? table.rows : table.rows.filter((_, rowIdx) => !isSummaryRow(table, rowIdx))
  }

  const hasExtractionHistory = () => extractionHistory.length > 1
  const canGoToPreviousExtraction = () => hasExtractionHistory() && currentExtractionIndex > 0

  // ============ ROW SELECTION ==============
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
    if (currentTable) {
      const displayRows = getDisplayRows(currentTableIdx)
      const indices = displayRows.map((_, displayIdx) => {
        return showSummaryRows 
          ? displayIdx 
          : currentTable.rows.findIndex((_, idx) => 
              !isSummaryRow(currentTable, idx) && 
              currentTable.rows.slice(0, idx).filter((_, i) => !isSummaryRow(currentTable, i)).length === displayIdx
            )
      })
      setSelectedRows(new Set(indices))
    }
  }

  const clearRowSelection = () => setSelectedRows(new Set())

  const deleteSelectedRows = () => {
    if (selectedRows.size === 0) return
    
    saveToUndoStack()
    const newTables = [...tables]
    const table = newTables[currentTableIdx]
    const sortedIndices = Array.from(selectedRows).sort((a, b) => b - a)
    
    sortedIndices.forEach(rowIdx => {
      table.rows.splice(rowIdx, 1)
    })
    
    onTablesChange(newTables)
    setSelectedRows(new Set())
    toast.success(`Deleted ${selectedRows.size} row(s)`)
  }

  const onClearAll = () => {
    setSelectedRows(new Set())
    clearFormatValidation()
    toast.success('Cleared selections')
  }

  // ============ ZOOM ==============
  const handleZoomIn = () => setZoom(z => Math.min(z + 0.2, 2))
  const handleZoomOut = () => setZoom(z => Math.max(z - 0.2, 0.5))

  // ============ SAVE ==============
  const handleSave = async () => {
    try {
      // Learn format patterns
      const learningResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/table-editor/learn-format-patterns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          upload_id: uploaded?.upload_id || uploaded?.id,
          tables: tables,
          company_id: companyId,
          selected_statement_date: selectedStatementDate,
          extracted_carrier: extractedCarrier,
          extracted_date: extractedDate
        })
      })
      
      if (learningResponse.ok) {
        toast.success('Format patterns learned!')
      }
      
      onSave(tables, selectedStatementDate, extractedCarrier || undefined, extractedDate || undefined)
      onGoToFieldMapping()
    } catch (error) {
      console.error('Format learning error:', error)
      onSave(tables, selectedStatementDate, extractedCarrier || undefined, extractedDate || undefined)
      onGoToFieldMapping()
    }
  }

  // ============ EFFECTS ==============
  // Extract carrier/date from uploaded
  useEffect(() => {
    if (uploaded) {
      if (uploaded.extracted_carrier) {
        setExtractedCarrier(uploaded.extracted_carrier)
        setCarrierConfidence(uploaded.document_metadata?.carrier_confidence || 0.9)
      }
      if (uploaded.extracted_date) {
        setExtractedDate(uploaded.extracted_date)
      }
    }
  }, [uploaded])

  // Clean column names
  useEffect(() => {
    if (!tables.length) return
    
    const cleanedTables = tables.map(table => ({
      ...table,
      header: cleanColumnNames(table.header || (table as any).headers || []),
      headers: cleanColumnNames(table.header || (table as any).headers || [])
    }))

    if (JSON.stringify(cleanedTables) !== JSON.stringify(tables)) {
      onTablesChange(cleanedTables)
    }
  }, [tables.length])

  // Close menus on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Element
      if (!target.closest('[data-header-menu]') && !target.closest('[data-row-actions-menu]')) {
        setShowHeaderActions(null)
        setShowRowActions(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // ============ RENDER ==============
  return (
    <div className="w-full h-full bg-gradient-to-br from-slate-50 to-blue-50 flex flex-col overflow-hidden relative">
      {/* Loading Overlays */}
      {isUsingAnotherExtraction && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
          <div className="bg-white rounded-xl p-8 shadow-2xl">
            <div className="w-12 h-12 border-2 border-slate-200 border-t-blue-500 rounded-full animate-spin mx-auto mb-4" />
            <div className="text-lg font-semibold text-slate-800">Re-extracting...</div>
          </div>
        </div>
      )}
      
      <GPTCorrectionLoader isVisible={isGPTCorrecting} progress={75} onCancel={() => {}} />
      <GPTExtractionLoader isVisible={isExtractingWithGPT} progress={60} onCancel={() => setIsExtractingWithGPT(false)} />
      <DOCAIExtractionLoader isVisible={isExtractingWithGoogleDocAI} progress={60} onCancel={() => setIsExtractingWithGoogleDocAI(false)} />
      <MistralExtractionLoader isVisible={isExtractingWithMistral} progress={60} onCancel={() => setIsExtractingWithMistral(false)} />

      {/* Progress Bar */}
      <ProgressBar currentStep="table_editor" />
      
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <h1 className="text-3xl font-bold text-gray-900">Review & Validate</h1>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-3 px-4 py-2 bg-blue-50 rounded-xl border border-blue-200">
                  <Building2 className="h-5 w-5 text-blue-600" />
                  <div>
                    <p className="text-xs font-medium text-blue-800 uppercase">Carrier</p>
                    <p className="text-sm font-semibold text-blue-900">{extractedCarrier || 'Unknown'}</p>
                  </div>
                  {carrierConfidence && (
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      carrierConfidence > 0.8 ? 'bg-green-100 text-green-800' : 
                      carrierConfidence > 0.6 ? 'bg-yellow-100 text-yellow-800' : 
                      'bg-red-100 text-red-800'
                    }`}>
                      {Math.round(carrierConfidence * 100)}%
                    </span>
                  )}
                </div>
                
                <div className="flex items-center gap-3 px-4 py-2 bg-emerald-50 rounded-xl border border-emerald-200">
                  <Calendar className="h-5 w-5 text-emerald-600" />
                  <div>
                    <p className="text-xs font-medium text-emerald-800 uppercase">Date</p>
                    <p className="text-sm font-semibold text-emerald-900">{extractedDate || selectedStatementDate?.date || 'Not set'}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Toggle Preview Button */}
      {uploaded && (
        <div className="px-6 pt-4">
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium"
          >
            {showPreview ? <EyeOff size={16} /> : <Eye size={16} />}
            {showPreview ? 'Hide Preview' : 'Show Preview'}
          </button>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex gap-6 p-6 min-h-0 overflow-hidden">
        {/* PDF Preview */}
        {uploaded && showPreview && (
          <DocumentPreview
            uploaded={uploaded}
            zoom={zoom}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
          />
        )}

        {/* Table Editor */}
        <div className={`${showPreview ? 'flex-1' : 'w-full'} flex flex-col bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden`}>
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
          
          <div className="flex-1 p-4 overflow-auto">
            {!tables.length ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="text-gray-500 text-lg">No tables available</div>
                  <div className="text-gray-400 text-sm">Upload a file to extract tables</div>
                </div>
              </div>
            ) : currentTable ? (
              <>
                {/* Merge Mode Banner */}
                {mergeSelection && mergeSelection.tableIdx === currentTableIdx && (
                  <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-blue-800">
                        Merge Mode: Click another column to merge with &quot;{currentTable.header[mergeSelection.colIdx]}&quot;
                      </span>
                      <button
                        onClick={() => setMergeSelection(null)}
                        className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
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
                      toast.error('Select a row first')
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
                
                <div className="bg-white border rounded-lg shadow-sm mt-4">
                  <div className="overflow-x-auto">
                    <div className="max-h-[600px] overflow-y-auto">
                      <table className="w-full min-w-full">
                        <thead className="sticky top-0 z-10 bg-slate-50">
                          <tr>
                            {/* Select All Checkbox */}
                            <th className="px-4 py-3 text-left w-12 border-b border-gray-200">
                              <label 
                                className="cursor-pointer flex items-center justify-center w-full h-full"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  console.log('🔵 Header checkbox clicked')
                                  if (selectedRows.size === getDisplayRows(currentTableIdx).length && getDisplayRows(currentTableIdx).length > 0) {
                                    clearRowSelection()
                                  } else {
                                    selectAllRows()
                                  }
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedRows.size === getDisplayRows(currentTableIdx).length && getDisplayRows(currentTableIdx).length > 0}
                                  onChange={() => {}}
                                  ref={(input) => {
                                    if (input) {
                                      input.indeterminate = selectedRows.size > 0 && selectedRows.size < getDisplayRows(currentTableIdx).length
                                    }
                                  }}
                                  className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 pointer-events-none"
                                  aria-label="Select all rows"
                                />
                              </label>
                            </th>
                            
                            {/* Column Headers */}
                            {currentTable?.header?.map((header, colIdx) => (
                              <th
                                key={colIdx}
                                className={`px-3 py-3 text-left text-xs font-medium text-gray-900 border-b border-gray-200 whitespace-nowrap relative ${
                                  mergeSelection && mergeSelection.tableIdx === currentTableIdx && mergeSelection.colIdx === colIdx
                                    ? 'bg-blue-100 border-blue-300'
                                    : mergeSelection && mergeSelection.tableIdx === currentTableIdx
                                    ? 'cursor-pointer hover:bg-blue-50'
                                    : ''
                                }`}
                                onClick={() => {
                                  if (mergeSelection && mergeSelection.tableIdx === currentTableIdx) {
                                    handleColumnClick(currentTableIdx, colIdx)
                                  }
                                }}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="truncate flex-1">{header}</span>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setShowHeaderActions(showHeaderActions === colIdx ? null : colIdx)
                                    }}
                                    className="ml-2 p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                                    data-header-menu-trigger={`${currentTableIdx}-${colIdx}`}
                                  >
                                    <MoreHorizontal size={12} />
                                  </button>
                                </div>
                                
                                {/* Header Menu - positioned absolutely */}
                                {showHeaderActions === colIdx && (
                                  <HeaderActionMenu 
                                    tableIdx={currentTableIdx} 
                                    colIdx={colIdx} 
                                    header={header}
                                    onRename={(newName) => {
                                      renameColumn(currentTableIdx, colIdx, newName)
                                      setShowHeaderActions(null)
                                    }}
                                    onAddAfter={() => {
                                      addColumn(currentTableIdx, colIdx + 1)
                                      setShowHeaderActions(null)
                                    }}
                                    onStartMerge={() => {
                                      startMergeSelection(currentTableIdx, colIdx)
                                      setShowHeaderActions(null)
                                    }}
                                    onDelete={() => {
                                      deleteColumn(currentTableIdx, colIdx)
                                      setShowHeaderActions(null)
                                    }}
                                    onClose={() => setShowHeaderActions(null)}
                                  />
                                )}
                              </th>
                            ))}
                            
                            <th className="px-3 py-3 text-left text-xs font-medium text-gray-900 border-b border-gray-200 w-24">
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {getDisplayRows(currentTableIdx).map((row, displayRowIdx) => {
                            const originalRowIdx = showSummaryRows 
                              ? displayRowIdx 
                              : currentTable.rows.findIndex((_, idx) => 
                                  !isSummaryRow(currentTable, idx) && 
                                  currentTable.rows.slice(0, idx).filter((_, i) => !isSummaryRow(currentTable, i)).length === displayRowIdx
                                )
                            
                            return (
                              <tr 
                                key={originalRowIdx} 
                                className={`hover:bg-slate-50 ${
                                  isSummaryRow(currentTable, originalRowIdx) 
                                    ? 'bg-orange-50 border-l-4 border-orange-400' 
                                    : rightFormatRow && rightFormatRow.tableIdx === currentTableIdx && rightFormatRow.rowIdx === originalRowIdx
                                    ? 'bg-emerald-50 border-l-4 border-emerald-400'
                                    : formatValidationResults[originalRowIdx] && !formatValidationResults[originalRowIdx].isValid
                                    ? 'bg-red-50 border-l-4 border-red-400'
                                    : ''
                                }`}
                              >
                                {/* Row Checkbox */}
                                <td className="px-4 py-3 border-b border-gray-200">
                                  <label 
                                    className="cursor-pointer flex items-center justify-center w-full h-full"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      console.log('🔵 Row checkbox clicked:', originalRowIdx)
                                      toggleRowSelection(originalRowIdx)
                                    }}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={selectedRows.has(originalRowIdx)}
                                      onChange={() => {}}
                                      className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 pointer-events-none"
                                      aria-label={`Select row ${originalRowIdx + 1}`}
                                    />
                                  </label>
                                </td>
                                
                                {/* Row Cells */}
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
                                        className="w-full px-2 py-1 border border-blue-300 rounded text-xs"
                                        autoFocus
                                      />
                                    ) : (
                                      <div
                                        className="cursor-pointer hover:bg-blue-50 rounded px-1 py-0.5 truncate"
                                        onClick={() => startCellEdit(currentTableIdx, originalRowIdx, colIdx)}
                                      >
                                        {cell}
                                      </div>
                                    )}
                                  </td>
                                ))}
                                
                                {/* Row Actions */}
                                <td className="px-3 py-3 border-b border-gray-100">
                                  <button
                                    onClick={() => setShowRowActions(
                                      showRowActions?.tableIdx === currentTableIdx && showRowActions?.rowIdx === originalRowIdx 
                                        ? null 
                                        : { tableIdx: currentTableIdx, rowIdx: originalRowIdx }
                                    )}
                                    className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                                  >
                                    <MoreVertical size={12} />
                                  </button>
                                  
                                  {showRowActions?.tableIdx === currentTableIdx && showRowActions?.rowIdx === originalRowIdx && (
                                    <RowActionMenu
                                      tableIdx={currentTableIdx}
                                      rowIdx={originalRowIdx}
                                      isSummary={isSummaryRow(currentTable, originalRowIdx)}
                                      onAddAbove={() => { addRowAbove(currentTableIdx, originalRowIdx); setShowRowActions(null) }}
                                      onAddBelow={() => { addRowBelow(currentTableIdx, originalRowIdx); setShowRowActions(null) }}
                                      onDuplicate={() => { duplicateRow(currentTableIdx, originalRowIdx); setShowRowActions(null) }}
                                      onEdit={() => { startRowEdit(currentTableIdx, originalRowIdx); setShowRowActions(null) }}
                                      onMarkSummary={() => { markAsSummaryRow(currentTableIdx, originalRowIdx); setShowRowActions(null) }}
                                      onUnmarkSummary={() => { unmarkAsSummaryRow(currentTableIdx, originalRowIdx); setShowRowActions(null) }}
                                      onDelete={() => { deleteRow(currentTableIdx, originalRowIdx); setShowRowActions(null) }}
                                      onClose={() => setShowRowActions(null)}
                                    />
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="text-gray-500 text-lg">Table not found</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Selected Rows Footer */}
      {selectedRows.size > 0 && (
        <div className="absolute bottom-16 left-0 right-0 bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-4 shadow-2xl z-30">
          <div className="flex items-center justify-between max-w-7xl mx-auto">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                  <span className="text-sm font-bold">{selectedRows.size}</span>
                </div>
                <span className="font-medium">{selectedRows.size} row(s) selected</span>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <button
                onClick={deleteSelectedRows}
                className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 rounded-lg font-medium"
              >
                <Trash2 className="w-4 h-4" />
                Delete Selected
              </button>
              <button
                onClick={clearRowSelection}
                className="flex items-center gap-2 px-4 py-2 bg-gray-500 hover:bg-gray-600 rounded-lg font-medium"
              >
                <X className="w-4 h-4" />
                Clear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="bg-white border-t border-gray-200 px-6 py-4 shadow-lg relative z-20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isGoogleDocAIExtraction(tables) && !hasExtractionHistory() && !isUsingAnotherExtraction && !hasUsedAnotherExtraction && (
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
            <button
              onClick={handleSave}
              disabled={loading || isUsingAnotherExtraction || !selectedStatementDate || !extractedCarrier}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 font-medium"
              title={
                !selectedStatementDate ? "Please select a statement date first" : 
                !extractedCarrier ? "Please ensure carrier name is extracted" : 
                "Save and continue"
              }
            >
              <FileText className="w-4 h-4" />
              Save & Continue
              <span className="ml-2 text-blue-200">→</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============ SUB-COMPONENTS ==============

function HeaderActionMenu({ 
  tableIdx, colIdx, header, 
  onRename, onAddAfter, onStartMerge, onDelete, onClose 
}: {
  tableIdx: number
  colIdx: number
  header: string
  onRename: (name: string) => void
  onAddAfter: () => void
  onStartMerge: () => void
  onDelete: () => void
  onClose: () => void
}) {
  const [isRenaming, setIsRenaming] = useState(false)
  const [newName, setNewName] = useState(header)

  return (
    <div 
      className="absolute top-full right-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-2xl z-[9999] min-w-[200px] max-h-[300px] overflow-y-auto"
      data-header-menu
      onClick={(e) => e.stopPropagation()}
    >
      <div className="p-2 border-b border-gray-100">
        <div className="text-xs font-medium text-gray-700">Column Actions</div>
      </div>
      
      {isRenaming ? (
        <div className="p-3">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newName.trim()) {
                onRename(newName.trim())
                setIsRenaming(false)
              }
              if (e.key === 'Escape') {
                setIsRenaming(false)
              }
            }}
            className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
            placeholder="New column name"
            autoFocus
          />
          <div className="flex gap-1 mt-2">
            <button
              onClick={() => {
                if (newName.trim()) {
                  onRename(newName.trim())
                  setIsRenaming(false)
                }
              }}
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
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded"
          >
            <Pencil className="w-4 h-4" />
            Rename Column
          </button>
          
          <button
            onClick={onAddAfter}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded"
          >
            <Plus className="w-4 h-4" />
            Add Column After
          </button>
          
          <button
            onClick={onStartMerge}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded"
          >
            <Filter className="w-4 h-4" />
            Merge with Another
          </button>
          
          <div className="border-t border-gray-100 my-1" />
          
          <button
            onClick={onDelete}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded"
          >
            <Trash2 className="w-4 h-4" />
            Delete Column
          </button>
        </div>
      )}
    </div>
  )
}

function RowActionMenu({ 
  tableIdx, rowIdx, isSummary,
  onAddAbove, onAddBelow, onDuplicate, onEdit,
  onMarkSummary, onUnmarkSummary, onDelete, onClose
}: {
  tableIdx: number
  rowIdx: number
  isSummary: boolean
  onAddAbove: () => void
  onAddBelow: () => void
  onDuplicate: () => void
  onEdit: () => void
  onMarkSummary: () => void
  onUnmarkSummary: () => void
  onDelete: () => void
  onClose: () => void
}) {
  return (
    <div 
      className="absolute right-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-2xl z-[9999] min-w-[200px]"
      data-row-actions-menu
      onClick={(e) => e.stopPropagation()}
    >
      <div className="p-2 border-b border-gray-100">
        <div className="text-xs font-medium text-gray-700">Row Actions</div>
      </div>
      
      <div className="p-2 space-y-1">
        <button onClick={onAddAbove} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded">
          <Plus className="w-4 h-4" />
          Add Row Above
        </button>
        
        <button onClick={onAddBelow} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded">
          <Plus className="w-4 h-4" />
          Add Row Below
        </button>
        
        <button onClick={onDuplicate} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded">
          <FileText className="w-4 h-4" />
          Duplicate Row
        </button>
        
        <button onClick={onEdit} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded">
          <Pencil className="w-4 h-4" />
          Edit Row
        </button>
        
        <div className="border-t border-gray-100 my-1" />
        
        {!isSummary ? (
          <button onClick={onMarkSummary} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded">
            <FileText className="w-4 h-4" />
            Mark as Summary
          </button>
        ) : (
          <button onClick={onUnmarkSummary} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-orange-600 hover:bg-orange-50 rounded">
            <FileText className="w-4 h-4" />
            Unmark Summary
          </button>
        )}
        
        <div className="border-t border-gray-100 my-1" />
        
        <button onClick={onDelete} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded">
          <Trash2 className="w-4 h-4" />
          Delete Row
        </button>
      </div>
    </div>
  )
}
