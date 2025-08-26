import { Settings, Eye, EyeOff, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react'

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
    <div className="sticky top-0 z-10 bg-white/90 px-4 py-3 border-b font-semibold text-purple-700 flex items-center justify-between">
      <span className="flex items-center gap-2">
        <Settings size={16} />
        Extracted Tables
      </span>
      <div className="flex items-center gap-2">
        {/* Summary Row Toggle */}
        <button
          onClick={onToggleSummaryRows}
          className={`px-3 py-1.5 rounded-lg flex items-center gap-2 text-sm ${
            showSummaryRows 
              ? 'bg-green-600 text-white hover:bg-green-700' 
              : 'bg-gray-600 text-white hover:bg-gray-700'
          }`}
          title={showSummaryRows ? 'Hide summary rows' : 'Show summary rows'}
        >
          {showSummaryRows ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
          {showSummaryRows ? 'Show All' : 'Hide Summary'}
        </button>
        
        {/* Table Navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onNavigateTable('prev')}
            disabled={currentTableIdx === 0}
            className="p-1.5 text-gray-500 hover:text-gray-700 disabled:opacity-50 bg-white rounded border border-gray-200 hover:border-gray-300"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="text-xs text-gray-600 font-medium min-w-[4rem] text-center">
            {currentTableIdx + 1} of {tablesLength}
          </span>
          <button
            onClick={() => onNavigateTable('next')}
            disabled={currentTableIdx === tablesLength - 1}
            className="p-1.5 text-gray-500 hover:text-gray-700 disabled:opacity-50 bg-white rounded border border-gray-200 hover:border-gray-300"
          >
            <ChevronRight size={14} />
          </button>
        </div>
        
        {/* GPT-5 Vision Improvement Button */}
        {onImproveExtraction && (
          <button
            onClick={onImproveExtraction}
            disabled={loading || isUsingAnotherExtraction || isImprovingExtraction}
            className="px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2 text-sm"
            title="Use GPT-5 Vision to improve table extraction accuracy"
          >
            {isImprovingExtraction ? (
              <>
                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                Improving...
              </>
            ) : (
              <>
                <Sparkles className="w-3 h-3" />
                Improve with GPT-5
              </>
            )}
          </button>
        )}
      </div>
    </div>
  )
}
