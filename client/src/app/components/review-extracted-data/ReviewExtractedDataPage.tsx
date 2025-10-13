/**
 * Review Extracted Data Page
 * Main container with modern split-panel layout
 */

'use client';

import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import { FileText, Building2, Calendar, ArrowRight } from 'lucide-react';
import { TableData, DocumentData } from './types';
import CollapsibleDocumentPreview from './document-preview/CollapsibleDocumentPreview';
import ExtractedDataTable from './table/ExtractedDataTable';

interface ReviewExtractedDataPageProps {
  tables: TableData[];
  onTablesChange: (tables: TableData[]) => void;
  uploaded?: DocumentData;
  onSave?: (tables: TableData[]) => void;
  extractedCarrier?: string;
  extractedDate?: string;
  carrierConfidence?: number;
  selectedStatementDate?: any;
  onStatementDateSelect?: (date: any) => void;
}

export default function ReviewExtractedDataPage({
  tables,
  onTablesChange,
  uploaded,
  onSave,
  extractedCarrier,
  extractedDate,
  carrierConfidence,
  selectedStatementDate,
  onStatementDateSelect
}: ReviewExtractedDataPageProps) {
  const [currentTableIdx, setCurrentTableIdx] = useState(0);
  const [isPreviewCollapsed, setIsPreviewCollapsed] = useState(false);
  const [showSummaryRows, setShowSummaryRows] = useState(true);

  const currentTable = tables[currentTableIdx];

  const handleTableChange = (updatedTable: TableData) => {
    const updatedTables = [...tables];
    updatedTables[currentTableIdx] = updatedTable;
    onTablesChange(updatedTables);
  };

  const handleSave = () => {
    if (!selectedStatementDate) {
      toast.error('Please select a statement date first');
      return;
    }
    if (!extractedCarrier) {
      toast.error('Please ensure carrier name is extracted');
      return;
    }

    if (onSave) {
      onSave(tables);
      toast.success('Data saved successfully!');
    }
  };

  const totalRowCount = tables.reduce((acc, table) => acc + table.rows.length, 0);

  return (
    <div className="w-full h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm flex-shrink-0">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <h1 className="text-3xl font-bold text-gray-900">Review & Validate</h1>

              {/* Metadata Cards */}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-3 px-4 py-2 bg-blue-50 rounded-xl border border-blue-200">
                  <Building2 className="h-5 w-5 text-blue-600" />
                  <div>
                    <p className="text-xs font-medium text-blue-800 uppercase">Carrier</p>
                    <p className="text-sm font-semibold text-blue-900">
                      {extractedCarrier || 'Unknown'}
                    </p>
                  </div>
                  {carrierConfidence && (
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        carrierConfidence > 0.8
                          ? 'bg-green-100 text-green-800'
                          : carrierConfidence > 0.6
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {Math.round(carrierConfidence * 100)}%
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3 px-4 py-2 bg-emerald-50 rounded-xl border border-emerald-200">
                  <Calendar className="h-5 w-5 text-emerald-600" />
                  <div>
                    <p className="text-xs font-medium text-emerald-800 uppercase">Date</p>
                    <p className="text-sm font-semibold text-emerald-900">
                      {extractedDate || selectedStatementDate?.date || 'Not set'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content - Split Panel Layout */}
      <div className="flex-1 flex gap-6 p-6 min-h-0 overflow-hidden">
        {/* PDF Preview Panel */}
        {uploaded && (
          <CollapsibleDocumentPreview
            uploaded={uploaded}
            isCollapsed={isPreviewCollapsed}
            onToggleCollapse={() => setIsPreviewCollapsed(!isPreviewCollapsed)}
          />
        )}

        {/* Table Editor Panel */}
        <div
          className={`flex flex-col bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden transition-all duration-300 ease-in-out ${
            isPreviewCollapsed ? 'w-full' : 'flex-1'
          }`}
        >
          {/* Table Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-purple-50">
            <div className="flex items-center gap-4">
              <FileText className="w-6 h-6 text-blue-600" />
              <div>
                <h2 className="text-lg font-bold text-gray-900">
                  {currentTable?.name || `Table ${currentTableIdx + 1}`}
                </h2>
                <p className="text-sm text-gray-600">
                  {tables.length} table{tables.length !== 1 ? 's' : ''} · {totalRowCount} total
                  rows
                </p>
              </div>
            </div>

            {/* Table Navigation */}
            {tables.length > 1 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentTableIdx(Math.max(0, currentTableIdx - 1))}
                  disabled={currentTableIdx === 0}
                  className="px-3 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                >
                  Previous
                </button>
                <span className="text-sm text-gray-600 px-3">
                  {currentTableIdx + 1} / {tables.length}
                </span>
                <button
                  onClick={() =>
                    setCurrentTableIdx(Math.min(tables.length - 1, currentTableIdx + 1))
                  }
                  disabled={currentTableIdx === tables.length - 1}
                  className="px-3 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                >
                  Next
                </button>
              </div>
            )}
          </div>

          {/* Table Content */}
          <div className="flex-1 overflow-hidden">
            {!tables.length ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="text-gray-500 text-lg">No tables available</div>
                  <div className="text-gray-400 text-sm">Upload a file to extract tables</div>
                </div>
              </div>
            ) : currentTable ? (
              <ExtractedDataTable
                table={currentTable}
                onTableChange={handleTableChange}
                showSummaryRows={showSummaryRows}
                onToggleSummaryRows={() => setShowSummaryRows(!showSummaryRows)}
              />
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

      {/* Footer */}
      <div className="bg-white border-t border-gray-200 px-6 py-4 shadow-lg flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">{totalRowCount} total rows</span>
            {selectedStatementDate && (
              <div className="flex items-center gap-1 text-sm text-green-600">
                <Calendar className="w-3 h-3" />
                <span>Date: {selectedStatementDate.date}</span>
              </div>
            )}
          </div>

          <button
            onClick={handleSave}
            disabled={!selectedStatementDate || !extractedCarrier}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium transition-all hover:scale-105 active:scale-95"
            title={
              !selectedStatementDate
                ? 'Please select a statement date first'
                : !extractedCarrier
                ? 'Please ensure carrier name is extracted'
                : 'Save and continue'
            }
          >
            <FileText className="w-4 h-4" />
            Save & Continue
            <ArrowRight className="w-4 h-4 ml-2" />
          </button>
        </div>
      </div>
    </div>
  );
}

