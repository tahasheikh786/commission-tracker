import { ChevronLeft, ChevronRight, Brain } from 'lucide-react'

type TableHeaderProps = {
  currentTableIdx: number
  tablesLength: number
  showSummaryRows: boolean
  onToggleSummaryRows: () => void
  onNavigateTable: (direction: 'prev' | 'next') => void
  onImproveExtraction?: () => void
  isImprovingExtraction?: boolean
  loading?: boolean
  isUsingAnotherExtraction?: boolean
}

export default function TableHeader({
  currentTableIdx,
  tablesLength,
  showSummaryRows,
  onToggleSummaryRows,
  onNavigateTable,
  onImproveExtraction,
  isImprovingExtraction,
  loading,
  isUsingAnotherExtraction
}: TableHeaderProps) {
  return (
    <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Table {currentTableIdx + 1} of {tablesLength}
          </h2>
          <div className="flex items-center space-x-2">
            <button 
              onClick={() => onNavigateTable('prev')}
              disabled={currentTableIdx === 0}
              className="p-2 rounded-lg bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button 
              onClick={() => onNavigateTable('next')}
              disabled={currentTableIdx >= tablesLength - 1}
              className="p-2 rounded-lg bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="h-4 w-4 rotate-180" />
            </button>
          </div>
        </div>
        
        {/* Essential Controls Only */}
        <div className="flex items-center space-x-3">
          {onImproveExtraction && (
            <button
              onClick={onImproveExtraction}
              disabled={isImprovingExtraction}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
            >
              {isImprovingExtraction ? (
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
              ) : (
                <Brain className="h-4 w-4 mr-2" />
              )}
              Improve with AI
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
