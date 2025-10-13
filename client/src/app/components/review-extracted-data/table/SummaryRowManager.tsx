/**
 * Summary Row Manager Component
 * Controls for managing summary row detection and marking
 */

'use client';

import React from 'react';
import { Wand2, Eye, EyeOff } from 'lucide-react';

interface SummaryRowManagerProps {
  showSummaryRows: boolean;
  onToggleSummaryRows: () => void;
  onAutoDetect: () => void;
  summaryRowCount: number;
}

export default function SummaryRowManager({
  showSummaryRows,
  onToggleSummaryRows,
  onAutoDetect,
  summaryRowCount
}: SummaryRowManagerProps) {
  return (
    <div className="flex items-center gap-3">
      {/* Summary Row Count Badge */}
      {summaryRowCount > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 bg-orange-50 border border-orange-200 rounded-lg">
          <div className="w-6 h-6 bg-orange-100 rounded-full flex items-center justify-center">
            <span className="text-xs font-bold text-orange-700">{summaryRowCount}</span>
          </div>
          <span className="text-sm font-medium text-orange-700">
            Summary Row{summaryRowCount !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* Toggle Visibility Button */}
      <button
        onClick={onToggleSummaryRows}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all ${
          showSummaryRows
            ? 'bg-orange-100 text-orange-700 hover:bg-orange-200'
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
        }`}
        title={showSummaryRows ? 'Hide summary rows' : 'Show summary rows'}
      >
        {showSummaryRows ? (
          <>
            <Eye className="w-4 h-4" />
            Hide Summary Rows
          </>
        ) : (
          <>
            <EyeOff className="w-4 h-4" />
            Show Summary Rows
          </>
        )}
      </button>

      {/* Auto Detect Button */}
      <button
        onClick={onAutoDetect}
        className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg font-medium text-sm hover:bg-purple-700 transition-all hover:scale-105 active:scale-95"
        title="Automatically detect summary rows using pattern matching"
      >
        <Wand2 className="w-4 h-4" />
        Auto-Detect Summary Rows
      </button>
    </div>
  );
}

