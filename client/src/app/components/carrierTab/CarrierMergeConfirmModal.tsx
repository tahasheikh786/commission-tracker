import React from 'react';
import { X, AlertTriangle, CheckCircle, FileText, Database, Settings } from 'lucide-react';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  sourceCarrierName: string;
  targetCarrierName: string;
  sourceStatementCount: number;
  targetStatementCount: number;
  isProcessing: boolean;
};

export default function CarrierMergeConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  sourceCarrierName,
  targetCarrierName,
  sourceStatementCount,
  targetStatementCount,
  isProcessing
}: Props) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={!isProcessing ? onClose : undefined}
      />
      
      {/* Modal */}
      <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-amber-500 to-orange-500 p-6 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                <AlertTriangle className="text-white" size={24} />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">Merge Carriers</h2>
                <p className="text-amber-100 text-sm">This action cannot be undone</p>
              </div>
            </div>
            {!isProcessing && (
              <button
                onClick={onClose}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              >
                <X className="text-white" size={20} />
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Explanation */}
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-4">
            <p className="text-amber-900 dark:text-amber-200 text-sm">
              <strong className="font-semibold">A carrier with this name already exists.</strong> You can merge these carriers to consolidate all their data under one name.
            </p>
          </div>

          {/* Merge Flow Visualization */}
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              {/* Source Carrier */}
              <div className="flex-1 bg-red-50 dark:bg-red-900/20 border-2 border-red-300 dark:border-red-700 rounded-xl p-4">
                <div className="text-xs font-semibold text-red-600 dark:text-red-400 uppercase tracking-wide mb-2">
                  Will be merged
                </div>
                <div className="font-bold text-slate-900 dark:text-slate-100 text-lg mb-2">
                  {sourceCarrierName}
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                  <FileText size={14} />
                  <span>{sourceStatementCount} statement{sourceStatementCount !== 1 ? 's' : ''}</span>
                </div>
              </div>

              {/* Arrow */}
              <div className="flex flex-col items-center">
                <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </div>

              {/* Target Carrier */}
              <div className="flex-1 bg-green-50 dark:bg-green-900/20 border-2 border-green-300 dark:border-green-700 rounded-xl p-4">
                <div className="text-xs font-semibold text-green-600 dark:text-green-400 uppercase tracking-wide mb-2">
                  Will receive data
                </div>
                <div className="font-bold text-slate-900 dark:text-slate-100 text-lg mb-2">
                  {targetCarrierName}
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                  <FileText size={14} />
                  <span>{targetStatementCount} statement{targetStatementCount !== 1 ? 's' : ''}</span>
                </div>
              </div>
            </div>

            {/* Result */}
            <div className="flex justify-center">
              <div className="bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-300 dark:border-blue-700 rounded-xl p-4 max-w-md">
                <div className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide mb-2">
                  After merge
                </div>
                <div className="font-bold text-slate-900 dark:text-slate-100 text-lg mb-2">
                  {targetCarrierName}
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                  <FileText size={14} />
                  <span>{sourceStatementCount + targetStatementCount} total statement{(sourceStatementCount + targetStatementCount) !== 1 ? 's' : ''}</span>
                </div>
              </div>
            </div>
          </div>

          {/* What will be merged */}
          <div className="space-y-3">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Database size={18} className="text-blue-500" />
              What will be merged:
            </h3>
            
            <div className="space-y-2">
              <div className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                <CheckCircle size={16} className="text-green-500 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="font-medium text-slate-900 dark:text-slate-100 text-sm">All Statements</div>
                  <div className="text-xs text-slate-600 dark:text-slate-400">
                    All {sourceStatementCount} statements from &ldquo;{sourceCarrierName}&rdquo; will become statements of &ldquo;{targetCarrierName}&rdquo;
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                <CheckCircle size={16} className="text-green-500 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="font-medium text-slate-900 dark:text-slate-100 text-sm">Format Learning</div>
                  <div className="text-xs text-slate-600 dark:text-slate-400">
                    AI-learned format patterns will be preserved and merged intelligently
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                <CheckCircle size={16} className="text-green-500 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="font-medium text-slate-900 dark:text-slate-100 text-sm">Field Mappings & Configurations</div>
                  <div className="text-xs text-slate-600 dark:text-slate-400">
                    Field mappings, plan types, and table configurations will be merged
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                <CheckCircle size={16} className="text-green-500 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="font-medium text-slate-900 dark:text-slate-100 text-sm">Commission Data</div>
                  <div className="text-xs text-slate-600 dark:text-slate-400">
                    Earned commission records will be aggregated by client and statement date
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Warning */}
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle size={18} className="text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <div className="font-semibold text-red-900 dark:text-red-200 mb-1">Important:</div>
                <ul className="list-disc list-inside text-red-800 dark:text-red-300 space-y-1">
                  <li>The carrier &ldquo;{sourceCarrierName}&rdquo; will be deleted after the merge</li>
                  <li>This action cannot be undone</li>
                  <li>All references will be updated automatically</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-slate-50 dark:bg-slate-900 p-6 rounded-b-2xl border-t border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between gap-4">
            <button
              onClick={onClose}
              disabled={isProcessing}
              className="px-6 py-3 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={isProcessing}
              className="px-6 py-3 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-lg font-medium shadow-lg hover:shadow-xl hover:from-orange-600 hover:to-red-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isProcessing ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Merging...</span>
                </>
              ) : (
                <>
                  <Settings size={18} />
                  <span>Merge Carriers</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

