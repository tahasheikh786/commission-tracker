'use client'
import React, { useState, useEffect, useCallback } from 'react';
import { X, Database, Table, Download, Eye, FileText, ZoomIn, ZoomOut, ExternalLink } from 'lucide-react';

interface TableData {
  header: string[];
  rows: string[][];
  name?: string;
  id?: string;
  extractor?: string;
  metadata?: {
    extraction_method?: string;
    [key: string]: any;
  };
}


interface CompareModalEnhancedProps {
  statement: any;
  onClose: () => void;
}

export default function CompareModalEnhanced({ statement, onClose }: CompareModalEnhancedProps) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [tables, setTables] = useState<TableData[]>([]);
  const [currentTableIndex, setCurrentTableIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Load PDF URL with enhanced debugging
  useEffect(() => {
    const fetchPdfUrl = async () => {
      if (!statement?.gcs_key && !statement?.file_name) {
        setLoading(false);
        setError('No file information available');
        return;
      }

      try {
        const gcsKey = statement.gcs_key || statement.file_name;
        const baseUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/api$/, '');
        
        console.log('🔍 Fetching PDF for GCS key:', gcsKey);
        console.log('🔍 Using base URL:', baseUrl);
        
        // Use the enhanced test endpoint for better debugging
        const response = await fetch(`${baseUrl}/api/test-pdf-preview/?gcs_key=${encodeURIComponent(gcsKey)}`);
        
        if (response.ok) {
          const data = await response.json();
          console.log('📄 PDF Preview Response:', data);
          
          if (data.success && data.url) {
            setPdfUrl(data.url);
            setError(null);
            console.log('✅ PDF URL generated successfully');
          } else {
            setError(data.error || 'Failed to generate PDF URL');
            console.error('❌ PDF Preview failed:', data);
          }
        } else {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          setError(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
          console.error('❌ HTTP Error:', response.status, errorData);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Network error';
        setError(`Failed to fetch PDF: ${errorMessage}`);
        console.error('❌ Error fetching PDF URL:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchPdfUrl();
  }, [statement]);

  // Load tables
  useEffect(() => {
    if (statement) {
      const tableData = statement.edited_tables || statement.raw_data || [];
      if (Array.isArray(tableData) && tableData.length > 0) {
        setTables(tableData);
        setCurrentTableIndex(0);
      } else {
        setTables([]);
        setError('No table data available for this statement');
      }
    }
  }, [statement]);

  const currentTable = tables[currentTableIndex];

  const downloadCSV = (table: TableData) => {
    const csvContent = [
      (table.header || []).join(','),
      ...(table.rows || []).map(row => (row || []).map(cell => `"${cell}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${table.name || 'table'}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev + 0.1, 2));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev - 0.1, 0.5));
  };

  const handleFullPage = () => {
    if (pdfUrl) {
      window.open(pdfUrl, '_blank');
    }
  };


  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-white dark:bg-slate-800 w-full h-full overflow-hidden flex flex-col rounded-lg">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center">
              <Table className="text-white" size={16} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Compare Statement</h2>
              <p className="text-xs text-slate-600 dark:text-slate-400">Review PDF and extracted data side by side</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="p-2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col lg:flex-row w-full min-h-0 bg-slate-50 dark:bg-slate-900">
          {/* PDF Card */}
          <div className="w-1/3 flex flex-col bg-white dark:bg-slate-800 shadow-lg overflow-hidden border-r border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between p-3 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="font-semibold text-slate-800 dark:text-slate-200">PDF Document</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleZoomOut}
                  className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                  aria-label="Zoom out"
                >
                  <ZoomOut size={16} />
                </button>
                <span className="text-sm font-medium text-slate-600 dark:text-slate-400 min-w-[3rem] text-center">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  onClick={handleZoomIn}
                  className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                  aria-label="Zoom in"
                >
                  <ZoomIn size={16} />
                </button>
                <button
                  onClick={handleFullPage}
                  className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                  aria-label="Open PDF in new tab"
                >
                  <ExternalLink size={16} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-3">
              {loading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="w-8 h-8 border-2 border-slate-200 dark:border-slate-600 border-t-emerald-500 rounded-full animate-spin"></div>
                  <span className="ml-3 text-slate-600 dark:text-slate-400 font-medium">Loading PDF...</span>
                </div>
              ) : pdfUrl ? (
                <div className="w-full h-full flex items-center justify-center">
                  <iframe
                    src={pdfUrl}
                    className="w-full h-full border-0 rounded-lg shadow-lg"
                    style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}
                    title="PDF Preview"
                  />
                </div>
              ) : error ? (
                <div className="text-center py-16 px-4">
                  <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <FileText className="text-red-600 dark:text-red-400" size={32} />
                  </div>
                  <h3 className="text-lg font-semibold text-red-700 dark:text-red-300 mb-2">PDF Preview Error</h3>
                  <p className="text-red-600 dark:text-red-400 text-sm mb-4">{error}</p>
                  <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 text-left">
                    <p className="text-xs text-red-600 dark:text-red-400 font-mono">
                      GCS Key: {statement?.gcs_key || statement?.file_name || 'N/A'}
                    </p>
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                      Check browser console for detailed debugging information
                    </p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-16">
                  <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <FileText className="text-slate-400 dark:text-slate-500" size={32} />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">PDF not available</h3>
                  <p className="text-slate-500 dark:text-slate-400 text-sm">Unable to load PDF preview</p>
                </div>
              )}
            </div>
          </div>

          {/* Table Card */}
          <div className="w-2/3 flex flex-col bg-white dark:bg-slate-800 shadow-lg overflow-hidden border-l border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between p-3 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0V4a1 1 0 011-1h16a1 1 0 011 1v16a1 1 0 01-1 1H4a1 1 0 01-1-1z" />
                  </svg>
                </div>
                <div className="flex items-center gap-4">
                  <h3 className="font-semibold text-slate-800 dark:text-slate-200">
                    {statement.edited_tables && statement.edited_tables.length > 0 ? 'Formatted Table(s)' : 'Extracted Table(s)'}
                  </h3>
                  {tables.length > 1 && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600 dark:text-slate-400">Table:</span>
                      <select
                        value={currentTableIndex}
                        onChange={(e) => setCurrentTableIndex(Number(e.target.value))}
                        className="px-3 py-2 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        {tables.map((table, index) => (
                          <option key={index} value={index}>
                            {table.name || `Table ${index + 1}`}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-gray-600 dark:text-slate-400">
                      {currentTableIndex + 1} of {tables.length}
                    </span>
                    <span className="text-sm text-gray-600 dark:text-slate-400">
                      {currentTable?.rows?.length || 0} rows × {currentTable?.header?.length || 0} columns
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => downloadCSV(currentTable)}
                  className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                  aria-label="Download CSV"
                >
                  <Download size={16} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto">
              {tables.length === 0 ? (
                <div className="text-center py-16">
                  <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <Table className="text-slate-400 dark:text-slate-500" size={32} />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">No extracted data found</h3>
                  <p className="text-slate-500 dark:text-slate-400 text-sm">This statement doesn&apos;t have any processed data yet.</p>
                </div>
              ) : (
                <div className="h-full flex flex-col">

                  {/* Table Display */}
                  {currentTable && (
                    <div className="flex-1 overflow-auto">
                      <div>

                        {/* Table */}
                        <div className="overflow-hidden shadow-sm bg-white dark:bg-slate-800">
                          <table className="min-w-full divide-y divide-gray-300 dark:divide-slate-600">
                            <thead className="bg-gray-50 dark:bg-slate-700 sticky top-0 z-20">
                              <tr className="border-b-2 border-gray-300 dark:border-slate-600">
                                {currentTable?.header?.map((header, index) => (
                                  <th
                                    key={index}
                                    className="px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-slate-300 border-r border-gray-200 dark:border-slate-600"
                                  >
                                    {header}
                                  </th>
                                )) || []}
                              </tr>
                            </thead>
                            <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-200 dark:divide-slate-600">
                              {currentTable?.rows?.map((row, rowIndex) => (
                                <tr key={rowIndex} className="hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors">
                                  {row?.map((cell, cellIndex) => (
                                    <td key={cellIndex} className="px-4 py-3 text-sm text-gray-900 dark:text-slate-300 border-r border-gray-200 dark:border-slate-600">
                                      {cell}
                                    </td>
                                  )) || []}
                                </tr>
                              )) || []}
                            </tbody>
                          </table>
                        </div>

                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
