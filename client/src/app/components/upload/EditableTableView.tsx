/**
 * Editable Table View Component
 * 
 * Provides full CRUD operations for table editing within the review interface.
 * Includes: add/delete rows, add/delete columns, edit cells, inline editing, and validation.
 */

"use client";

import React, { useState, useEffect } from 'react';
import { Pencil, Trash2, Plus, MoreVertical, MoreHorizontal, AlertCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { isSummaryRow, getSummaryDetectionInfo } from '@/app/utils/summaryRowUtils';

interface TableData {
  header: string[];
  headers?: string[];
  rows: string[][];
  name?: string;
  id?: string;
  summaryRows?: Set<number>;
}

interface EditableTableViewProps {
  tables: TableData[];
  onTablesChange: (tables: TableData[]) => void;
  carrierName?: string;
  statementDate?: string;
  brokerName?: string;
  planType?: string;
}

interface CellEdit {
  tableIdx: number;
  rowIdx: number;
  colIdx: number;
  value: string;
}

export default function EditableTableView({
  tables,
  onTablesChange,
  carrierName,
  statementDate,
  brokerName,
  planType
}: EditableTableViewProps) {
  const [currentTableIdx, setCurrentTableIdx] = useState(0);
  const [editingCell, setEditingCell] = useState<CellEdit | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [showHeaderMenu, setShowHeaderMenu] = useState<number | null>(null);
  const [showRowMenu, setShowRowMenu] = useState<number | null>(null);

  const currentTable = tables[currentTableIdx];
  
  // Helper to safely get table headers (handles both 'header' and 'headers' properties)
  const getTableHeaders = (table: TableData | undefined): string[] => {
    if (!table) return [];
    return table.header || table.headers || [];
  };
  
  // Helper to safely get table rows
  const getTableRows = (table: TableData | undefined): string[][] => {
    if (!table) return [];
    return table.rows || [];
  };

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target.closest('[data-header-menu]') && !target.closest('[data-row-menu]')) {
        setShowHeaderMenu(null);
        setShowRowMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Row operations
  const addRowAbove = (tableIdx: number, rowIdx: number) => {
    const newTables = [...tables];
    const headers = getTableHeaders(newTables[tableIdx]);
    const newRow = new Array(headers.length).fill('');
    newTables[tableIdx].rows.splice(rowIdx, 0, newRow);
    onTablesChange(newTables);
    toast.success('Row added above');
  };

  const addRowBelow = (tableIdx: number, rowIdx: number) => {
    const newTables = [...tables];
    const headers = getTableHeaders(newTables[tableIdx]);
    const newRow = new Array(headers.length).fill('');
    newTables[tableIdx].rows.splice(rowIdx + 1, 0, newRow);
    onTablesChange(newTables);
    toast.success('Row added below');
  };

  const deleteRow = (tableIdx: number, rowIdx: number) => {
    const newTables = [...tables];
    newTables[tableIdx].rows.splice(rowIdx, 1);
    onTablesChange(newTables);
    toast.success('Row deleted');
  };

  const deleteSelectedRows = () => {
    if (selectedRows.size === 0) return;
    const newTables = [...tables];
    const sortedIndices = Array.from(selectedRows).sort((a, b) => b - a);
    sortedIndices.forEach(rowIdx => {
      newTables[currentTableIdx].rows.splice(rowIdx, 1);
    });
    onTablesChange(newTables);
    setSelectedRows(new Set());
    toast.success(`Deleted ${selectedRows.size} rows`);
  };

  // Column operations
  const addColumn = (tableIdx: number, colIdx: number) => {
    const newTables = [...tables];
    const headers = getTableHeaders(newTables[tableIdx]);
    const columnName = `Column ${headers.length + 1}`;
    
    // Ensure header property exists
    if (!newTables[tableIdx].header) {
      newTables[tableIdx].header = [...headers];
    }
    
    newTables[tableIdx].header.splice(colIdx + 1, 0, columnName);
    newTables[tableIdx].rows.forEach(row => {
      row.splice(colIdx + 1, 0, '');
    });
    onTablesChange(newTables);
    toast.success('Column added');
  };

  const deleteColumn = (tableIdx: number, colIdx: number) => {
    const newTables = [...tables];
    const headers = getTableHeaders(newTables[tableIdx]);
    
    // Ensure header property exists
    if (!newTables[tableIdx].header) {
      newTables[tableIdx].header = [...headers];
    }
    
    newTables[tableIdx].header.splice(colIdx, 1);
    newTables[tableIdx].rows.forEach(row => {
      row.splice(colIdx, 1);
    });
    onTablesChange(newTables);
    toast.success('Column deleted');
  };

  const renameColumn = (tableIdx: number, colIdx: number, newName: string) => {
    const newTables = [...tables];
    const headers = getTableHeaders(newTables[tableIdx]);
    
    // Ensure header property exists
    if (!newTables[tableIdx].header) {
      newTables[tableIdx].header = [...headers];
    }
    
    newTables[tableIdx].header[colIdx] = newName;
    onTablesChange(newTables);
    toast.success('Column renamed');
  };

  // Cell editing
  const startCellEdit = (tableIdx: number, rowIdx: number, colIdx: number) => {
    const rows = getTableRows(tables[tableIdx]);
    const cellValue = rows[rowIdx]?.[colIdx] || '';
    
    setEditingCell({
      tableIdx,
      rowIdx,
      colIdx,
      value: cellValue
    });
  };

  const saveCellEdit = () => {
    if (!editingCell) return;
    const newTables = [...tables];
    
    // Ensure rows exist
    if (!newTables[editingCell.tableIdx].rows) {
      newTables[editingCell.tableIdx].rows = [];
    }
    if (!newTables[editingCell.tableIdx].rows[editingCell.rowIdx]) {
      newTables[editingCell.tableIdx].rows[editingCell.rowIdx] = [];
    }
    
    newTables[editingCell.tableIdx].rows[editingCell.rowIdx][editingCell.colIdx] = editingCell.value;
    onTablesChange(newTables);
    setEditingCell(null);
  };

  const cancelCellEdit = () => {
    setEditingCell(null);
  };

  // Row selection
  const toggleRowSelection = (rowIdx: number) => {
    setSelectedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(rowIdx)) {
        newSet.delete(rowIdx);
      } else {
        newSet.add(rowIdx);
      }
      return newSet;
    });
  };

  const selectAllRows = () => {
    const rows = getTableRows(currentTable);
    const allIndices = rows.map((_, idx) => idx);
    setSelectedRows(new Set(allIndices));
  };

  const clearRowSelection = () => {
    setSelectedRows(new Set());
  };

  // Mark selected rows as summary rows
  const markSelectedAsSummaryRows = () => {
    if (selectedRows.size === 0) return;
    const newTables = [...tables];
    
    // Initialize summaryRows if it doesn't exist
    if (!newTables[currentTableIdx].summaryRows) {
      newTables[currentTableIdx].summaryRows = new Set();
    }
    
    // Mark all selected rows as summary rows
    selectedRows.forEach(rowIdx => {
      newTables[currentTableIdx].summaryRows!.add(rowIdx);
    });
    
    onTablesChange(newTables);
    toast.success(`Marked ${selectedRows.size} rows as summary rows`);
    setSelectedRows(new Set());
  };

  // Unmark selected rows as summary rows
  const unmarkSelectedAsSummaryRows = () => {
    if (selectedRows.size === 0) return;
    const newTables = [...tables];
    
    if (newTables[currentTableIdx].summaryRows) {
      // Unmark all selected rows
      selectedRows.forEach(rowIdx => {
        newTables[currentTableIdx].summaryRows!.delete(rowIdx);
      });
      
      // Clean up empty summaryRows
      if (newTables[currentTableIdx].summaryRows!.size === 0) {
        delete newTables[currentTableIdx].summaryRows;
      }
    }
    
    onTablesChange(newTables);
    toast.success(`Unmarked ${selectedRows.size} rows as summary rows`);
    setSelectedRows(new Set());
  };

  // Check if any selected rows are summary rows
  const hasSelectedSummaryRows = () => {
    return Array.from(selectedRows).some(rowIdx => isSummaryRow(currentTable, rowIdx));
  };

  // Check if any selected rows are NOT summary rows
  const hasSelectedNonSummaryRows = () => {
    return Array.from(selectedRows).some(rowIdx => !isSummaryRow(currentTable, rowIdx));
  };

  if (!tables || tables.length === 0 || !currentTable) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <div className="text-center">
          <div className="text-gray-500 text-lg mb-2">No tables extracted</div>
          <div className="text-gray-400 text-sm">The extracted data will appear here</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header with table navigation */}
      {tables.length > 1 && (
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-200 px-6 py-3 flex-shrink-0">
          <div className="flex items-center justify-center space-x-2">
            <button
              onClick={() => setCurrentTableIdx(Math.max(0, currentTableIdx - 1))}
              disabled={currentTableIdx === 0}
              className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <span className="text-sm text-gray-700 font-medium px-2">
              Table {currentTableIdx + 1} of {tables.length}
            </span>
            <button
              onClick={() => setCurrentTableIdx(Math.min(tables.length - 1, currentTableIdx + 1))}
              disabled={currentTableIdx === tables.length - 1}
              className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
      </div>
      )}
        
        {/* Summary Row Detection Info */}
        {(() => {
          const summaryInfo = getSummaryDetectionInfo(currentTable);
          if (summaryInfo && summaryInfo.enabled && summaryInfo.count > 0) {
            return (
              <div className="bg-orange-50 border-b border-orange-300 px-6 py-3 flex-shrink-0">
                <div className="flex items-start space-x-3">
                  <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-orange-900">
                        Summary Rows Detected
                      </h4>
                      <span className="text-xs font-medium text-orange-700 bg-orange-100 px-2 py-1 rounded-full">
                        {Math.round(summaryInfo.confidence * 100)}% confidence
                      </span>
                    </div>
                    <p className="text-xs text-orange-800 mt-1">
                      {summaryInfo.count} summary row{summaryInfo.count !== 1 ? 's' : ''} detected using {summaryInfo.method.replace(/_/g, ' ')}. 
                      These rows are highlighted in orange below.
                    </p>
                  </div>
                </div>
              </div>
            );
          }
          return null;
        })()}

      {/* Table controls - shown when rows are selected */}
      {selectedRows.size > 0 && (
        <div className="bg-blue-50 border-b border-blue-200 px-6 py-3 flex items-center justify-between flex-shrink-0">
          <span className="text-sm text-blue-800 font-medium">
            {selectedRows.size} row{selectedRows.size !== 1 ? 's' : ''} selected
          </span>
          <div className="flex items-center space-x-2">
            {/* Mark as Summary Row button - show if any selected rows are NOT summary rows */}
            {hasSelectedNonSummaryRows() && (
              <button
                onClick={markSelectedAsSummaryRows}
                className="px-3 py-1.5 text-sm bg-orange-600 text-white rounded-md hover:bg-orange-700 flex items-center transition-colors shadow-sm"
                title="Mark selected rows as summary rows"
              >
                <AlertCircle className="w-4 h-4 mr-1.5" />
                Mark as Summary Row
              </button>
            )}
            
            {/* Unmark as Summary Row button - show if any selected rows ARE summary rows */}
            {hasSelectedSummaryRows() && (
              <button
                onClick={unmarkSelectedAsSummaryRows}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center transition-colors shadow-sm"
                title="Unmark selected rows as summary rows"
              >
                <AlertCircle className="w-4 h-4 mr-1.5" />
                Unmark as Summary Row
              </button>
            )}
            
            <button
              onClick={deleteSelectedRows}
              className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 flex items-center transition-colors shadow-sm"
              title="Delete selected rows"
            >
              <Trash2 className="w-4 h-4 mr-1.5" />
              Delete Selected
            </button>
            
            <button
              onClick={clearRowSelection}
              className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              title="Clear selection"
            >
              Clear Selection
            </button>
          </div>
        </div>
      )}

      {/* Table Container - Fixed height with scroll */}
      <div className="flex-1 overflow-auto bg-gray-50 p-4">
        <div className="min-w-full inline-block align-middle">
          <div className="border border-gray-300 rounded-lg overflow-hidden shadow-sm bg-white">
            <table className="min-w-full divide-y divide-gray-300">
              <thead className="bg-gradient-to-r from-gray-50 to-gray-100 sticky top-0 z-20">
                <tr className="border-b-2 border-gray-300">
                  {/* Checkbox column */}
                  <th className="px-6 py-3 text-left w-14 bg-gray-50 border-r border-gray-200">
                  <input
                    type="checkbox"
                    checked={selectedRows.size === getTableRows(currentTable).length && getTableRows(currentTable).length > 0}
                    onChange={(e) => e.target.checked ? selectAllRows() : clearRowSelection()}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  />
                </th>
                
                {/* Column headers */}
                {getTableHeaders(currentTable).map((header, colIdx) => (
                  <th
                    key={colIdx}
                    className="px-6 py-3 text-left text-sm font-semibold text-gray-900 relative bg-gray-50 border-r border-gray-200"
                  >
                    <div className="flex items-center justify-between min-w-[120px]">
                      <span className="truncate font-semibold">{header}</span>
                      <button
                        onClick={() => setShowHeaderMenu(showHeaderMenu === colIdx ? null : colIdx)}
                        className="ml-2 p-1.5 hover:bg-gray-200 rounded-md transition-all opacity-70 hover:opacity-100"
                        data-header-menu={colIdx}
                      >
                        <MoreHorizontal size={14} className="text-gray-600" />
                      </button>
                    </div>
                    
                    {/* Header menu */}
                    {showHeaderMenu === colIdx && (
                      <HeaderMenu
                        tableIdx={currentTableIdx}
                        colIdx={colIdx}
                        currentName={header}
                        onRename={renameColumn}
                        onAddColumn={addColumn}
                        onDeleteColumn={deleteColumn}
                        onClose={() => setShowHeaderMenu(null)}
                      />
                    )}
                  </th>
                ))}
                
                {/* Actions column */}
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 w-24 bg-gray-50">
                  Actions
                </th>
              </tr>
            </thead>
            
            <tbody className="bg-white divide-y divide-gray-100">
              {getTableRows(currentTable).map((row, rowIdx) => {
                const isRowSummary = isSummaryRow(currentTable, rowIdx);
                return (
                <tr
                  key={rowIdx}
                  className={`transition-colors ${
                    isRowSummary
                      ? 'bg-orange-50 border-l-4 border-orange-400 hover:bg-orange-100'
                      : selectedRows.has(rowIdx) 
                        ? 'bg-blue-50 hover:bg-blue-100' 
                        : 'hover:bg-gray-50'
                  }`}
                  title={isRowSummary ? 'Summary Row - Contains total or aggregate data' : ''}
                >
                  {/* Checkbox */}
                  <td className="px-6 py-3 border-r border-gray-200" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedRows.has(rowIdx)}
                      onChange={(e) => {
                        e.stopPropagation();
                        toggleRowSelection(rowIdx);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
                    />
                  </td>
                  
                  {/* Row cells */}
                  {row.map((cell, colIdx) => (
                    <td key={colIdx} className="px-6 py-3 text-sm text-gray-900 border-r border-gray-200">
                      {editingCell && editingCell.tableIdx === currentTableIdx && editingCell.rowIdx === rowIdx && editingCell.colIdx === colIdx ? (
                        <input
                          type="text"
                          value={editingCell.value}
                          onChange={(e) => setEditingCell({ ...editingCell, value: e.target.value })}
                          onBlur={saveCellEdit}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveCellEdit();
                            if (e.key === 'Escape') cancelCellEdit();
                          }}
                          className="w-full px-3 py-1.5 border-2 border-blue-400 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white shadow-sm"
                          autoFocus
                        />
                      ) : (
                        <div
                          className="cursor-pointer hover:bg-blue-50 rounded-md px-3 py-1.5 transition-colors min-h-[32px] flex items-center"
                          onClick={() => startCellEdit(currentTableIdx, rowIdx, colIdx)}
                          title="Click to edit"
                        >
                          {cell || <span className="text-gray-400">-</span>}
                        </div>
                      )}
                    </td>
                  ))}
                  
                  {/* Row actions */}
                  <td className="px-6 py-3 relative">
                    <button
                      onClick={() => setShowRowMenu(showRowMenu === rowIdx ? null : rowIdx)}
                      className="p-2 hover:bg-gray-200 rounded-md transition-colors text-gray-600 hover:text-gray-900"
                      data-row-menu={rowIdx}
                      title="Row actions"
                    >
                      <MoreVertical size={16} />
                    </button>
                    
                    {showRowMenu === rowIdx && (
                      <RowMenu
                        tableIdx={currentTableIdx}
                        rowIdx={rowIdx}
                        onAddRowAbove={addRowAbove}
                        onAddRowBelow={addRowBelow}
                        onDeleteRow={deleteRow}
                        onClose={() => setShowRowMenu(null)}
                      />
                    )}
                  </td>
                </tr>
              );
              })}
            </tbody>
          </table>
          </div>
        </div>
      </div>

      {/* Footer info */}
      <div className="bg-gradient-to-r from-gray-50 to-gray-100 border-t-2 border-gray-200 px-6 py-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <span className="text-sm font-medium text-gray-700">
              <span className="text-blue-600 font-semibold">{getTableRows(currentTable).length}</span> row{getTableRows(currentTable).length !== 1 ? 's' : ''}
              <span className="mx-2 text-gray-400">×</span>
              <span className="text-blue-600 font-semibold">{getTableHeaders(currentTable).length}</span> column{getTableHeaders(currentTable).length !== 1 ? 's' : ''}
            </span>
            {selectedRows.size > 0 && (
              <span className="text-sm text-blue-600 font-medium">
                • {selectedRows.size} selected
              </span>
            )}
          </div>
          <div className="flex items-center space-x-1 text-sm text-gray-600">
            <Pencil className="w-3.5 h-3.5" />
            <span>Click any cell to edit • Use menus for more actions</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Header Menu Component
function HeaderMenu({
  tableIdx,
  colIdx,
  currentName,
  onRename,
  onAddColumn,
  onDeleteColumn,
  onClose
}: {
  tableIdx: number;
  colIdx: number;
  currentName: string;
  onRename: (tableIdx: number, colIdx: number, newName: string) => void;
  onAddColumn: (tableIdx: number, colIdx: number) => void;
  onDeleteColumn: (tableIdx: number, colIdx: number) => void;
  onClose: () => void;
}) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState(currentName);

  const handleRename = () => {
    if (newName.trim()) {
      onRename(tableIdx, colIdx, newName.trim());
      setIsRenaming(false);
      onClose();
    }
  };

  return (
    <div
      className="absolute top-full left-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-xl z-50 min-w-[220px]"
      data-header-menu
    >
      {isRenaming ? (
        <div className="p-4">
          <label className="text-xs font-medium text-gray-700 block mb-2">Column Name</label>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleRename()}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Enter column name"
            autoFocus
          />
          <div className="flex gap-2 mt-3">
            <button
              onClick={handleRename}
              className="flex-1 px-3 py-1.5 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 transition-colors font-medium"
            >
              Save
            </button>
            <button
              onClick={() => setIsRenaming(false)}
              className="flex-1 px-3 py-1.5 bg-gray-200 text-gray-700 rounded-md text-sm hover:bg-gray-300 transition-colors font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="p-2">
          <button
            onClick={() => setIsRenaming(true)}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
          >
            <Pencil className="w-4 h-4 text-blue-600" />
            <span className="font-medium">Rename Column</span>
          </button>
          <button
            onClick={() => {
              onAddColumn(tableIdx, colIdx);
              onClose();
            }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
          >
            <Plus className="w-4 h-4 text-green-600" />
            <span className="font-medium">Add Column After</span>
          </button>
          <div className="border-t border-gray-200 my-2"></div>
          <button
            onClick={() => {
              onDeleteColumn(tableIdx, colIdx);
              onClose();
            }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 rounded-md transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            <span className="font-medium">Delete Column</span>
          </button>
        </div>
      )}
    </div>
  );
}

// Row Menu Component
function RowMenu({
  tableIdx,
  rowIdx,
  onAddRowAbove,
  onAddRowBelow,
  onDeleteRow,
  onClose
}: {
  tableIdx: number;
  rowIdx: number;
  onAddRowAbove: (tableIdx: number, rowIdx: number) => void;
  onAddRowBelow: (tableIdx: number, rowIdx: number) => void;
  onDeleteRow: (tableIdx: number, rowIdx: number) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="absolute right-0 top-full mt-2 bg-white border border-gray-200 rounded-lg shadow-xl z-50 min-w-[200px]"
      data-row-menu
    >
      <div className="p-2">
        <button
          onClick={() => {
            onAddRowAbove(tableIdx, rowIdx);
            onClose();
          }}
          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
        >
          <Plus className="w-4 h-4 text-green-600" />
          <span className="font-medium">Add Row Above</span>
        </button>
        <button
          onClick={() => {
            onAddRowBelow(tableIdx, rowIdx);
            onClose();
          }}
          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
        >
          <Plus className="w-4 h-4 text-green-600" />
          <span className="font-medium">Add Row Below</span>
        </button>
        <div className="border-t border-gray-200 my-2"></div>
        <button
          onClick={() => {
            onDeleteRow(tableIdx, rowIdx);
            onClose();
          }}
          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 rounded-md transition-colors"
        >
          <Trash2 className="w-4 h-4" />
          <span className="font-medium">Delete Row</span>
        </button>
      </div>
    </div>
  );
}

