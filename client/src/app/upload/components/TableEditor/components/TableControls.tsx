import { CheckCircle, Trash2 } from 'lucide-react'
import { TableData, RightFormatRow, FormatValidationResults } from '../types'
import { isSummaryRow } from '../utils'

type TableControlsProps = {
  currentTable: TableData
  currentTableIdx: number
  rightFormatRow: RightFormatRow
  formatValidationResults: FormatValidationResults
  selectedRows: Set<number>
  onSetFormatRow: () => void
  onFixRowFormatWithGPT: () => void
  onClearAll: () => void
  onDeleteSelectedRows: () => void
  onAutoDetectSummaryRows: () => void
  onLearnSummaryRowPattern: () => void
  onDeleteSummaryRows: () => void
  onDeleteTable: () => void
  onUpdateTableName: (name: string) => void
}

export default function TableControls({
  currentTable,
  currentTableIdx,
  rightFormatRow,
  formatValidationResults,
  selectedRows,
  onSetFormatRow,
  onFixRowFormatWithGPT,
  onClearAll,
  onDeleteSelectedRows,
  onAutoDetectSummaryRows,
  onLearnSummaryRowPattern,
  onDeleteSummaryRows,
  onDeleteTable,
  onUpdateTableName
}: TableControlsProps) {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <span>Table {currentTableIdx + 1}</span>
          {currentTable.name && (
            <span className="text-sm font-normal text-gray-500">- {currentTable.name}</span>
          )}
        </h3>
        <div className="flex items-center gap-4">
          {/* Format Validation Section */}
          <div className="flex items-center gap-2">
            {rightFormatRow && rightFormatRow.tableIdx === currentTableIdx ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-green-600 font-medium">✓ Format Row Set</span>
                <button
                  onClick={onFixRowFormatWithGPT}
                  className="px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center gap-2 text-sm"
                  title="Fix row formats using GPT-5"
                >
                  <CheckCircle className="w-3 h-3" />
                  Fix Row Format with GPT-5
                </button>
              </div>
            ) : (
              <button
                onClick={onSetFormatRow}
                disabled={selectedRows.size !== 1}
                className="px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                title="Mark selected row as the right format reference"
              >
                <CheckCircle className="w-3 h-3" />
                Set Format Row
              </button>
            )}
          </div>

          {/* Row Operations Section */}
          <div className="flex items-center gap-2 border-l border-gray-300 pl-4">
            <span className="text-xs text-gray-500 font-medium">Row Operations:</span>
            <button
              onClick={onClearAll}
              className="px-2 py-1 bg-gray-600 text-white rounded text-xs hover:bg-gray-700"
              title="Clear all selections and format validation"
            >
              Clear
            </button>
            <button
              onClick={onAutoDetectSummaryRows}
              className="px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700"
              title="Auto-detect summary rows"
            >
              Auto-Detect
            </button>
            <button
              onClick={onDeleteSelectedRows}
              disabled={selectedRows.size === 0}
              className="px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Delete ({selectedRows.size})
            </button>
          </div>

          {/* Summary Row Section */}
          <div className="flex items-center gap-2 border-l border-gray-300 pl-4">
            <span className="text-xs text-gray-500 font-medium">Summary Rows:</span>
            
            {currentTable.summaryRows && currentTable.summaryRows.size > 0 && (
              <>
                <button
                  onClick={onLearnSummaryRowPattern}
                  className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
                  title="Learn pattern from marked summary rows"
                >
                  Learn Pattern
                </button>
                
                <button
                  onClick={onDeleteSummaryRows}
                  className="px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700"
                  title="Delete all summary rows"
                >
                  Delete Summary
                </button>
              </>
            )}
          </div>
          
          <button
            onClick={onDeleteTable}
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
          onChange={(e) => onUpdateTableName(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
          placeholder="Table name..."
        />
      </div>
    </div>
  )
}
