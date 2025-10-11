/**
 * Editable Table View Component
 * 
 * Provides full CRUD operations for table editing within the review interface.
 * Includes: add/delete rows, add/delete columns, edit cells, inline editing, and validation.
 */

"use client";

import React, { useState, useEffect } from 'react';
import { Pencil, Trash2, Plus, MoreVertical, MoreHorizontal, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
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
          <div className="text-gray-500 dark:text-slate-400 text-lg mb-2">No tables extracted</div>
          <div className="text-gray-400 dark:text-slate-500 text-sm">The extracted data will appear here</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white dark:bg-slate-800">

      {/* Summary Row Detection Info */}
      {(() => {
        const summaryInfo = getSummaryDetectionInfo(currentTable);
        if (summaryInfo && summaryInfo.enabled && summaryInfo.count > 0) {
          return (
            <div className="bg-orange-50 dark:bg-orange-900/20 border-b border-orange-300 dark:border-orange-700 px-6 py-3 flex-shrink-0">
              <div className="flex items-start space-x-3">
                <AlertCircle className="w-5 h-5 text-orange-600 dark:text-orange-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-orange-900 dark:text-orange-300">
                      Summary Rows Detected
                    </h4>
                    <span className="text-xs font-medium text-orange-700 dark:text-orange-300 bg-orange-100 dark:bg-orange-800/30 px-2 py-1 rounded-full">
                      {Math.round(summaryInfo.confidence * 100)}% confidence
                    </span>
                  </div>
                  <p className="text-xs text-orange-800 dark:text-orange-300 mt-1">
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

      {/* Table Container - Fixed height with scroll */}
      <div className="flex-1 overflow-auto bg-gray-50 dark:bg-slate-900">
        <div className="min-w-full inline-block align-middle">
          <div className="overflow-hidden shadow-sm bg-white dark:bg-slate-800">
            <table className="min-w-full divide-y divide-gray-300 dark:divide-slate-600">
              <thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-slate-700 dark:to-slate-800 sticky top-0 z-20">
                <tr className="border-b-2 border-gray-300 dark:border-slate-600">
                  {/* Checkbox column */}
                  <th className="px-2 py-2 w-14 bg-gray-50 dark:bg-slate-700 border-r border-gray-200 dark:border-slate-600">
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        selectedRows.size === getTableRows(currentTable).length && getTableRows(currentTable).length > 0
                          ? clearRowSelection()
                          : selectAllRows();
                      }}
                      className={`w-4 h-4 border-2 rounded cursor-pointer transition-all duration-200 mx-auto ${selectedRows.size === getTableRows(currentTable).length && getTableRows(currentTable).length > 0
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'bg-white dark:bg-slate-800 border-gray-300 dark:border-slate-600 hover:border-blue-500 dark:hover:border-blue-400'
                        }`}
                    >
                      {selectedRows.size === getTableRows(currentTable).length && getTableRows(currentTable).length > 0 && (
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                  </th>

                  {/* Column headers */}
                  {getTableHeaders(currentTable).map((header, colIdx) => (
                    <th
                      key={colIdx}
                      className="px-4 text-left text-sm font-semibold text-gray-900 dark:text-slate-300 relative bg-gray-50 dark:bg-slate-700 border-r border-gray-200 dark:border-slate-600"
                    >
                      <div className="flex items-center justify-between min-w-[120px]">
                        <span className="truncate font-semibold">{header}</span>
                        <button
                          onClick={() => setShowHeaderMenu(showHeaderMenu === colIdx ? null : colIdx)}
                          className="ml-2 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-md transition-all opacity-70 hover:opacity-100"
                          data-header-menu={colIdx}
                        >
                          <MoreHorizontal size={14} className="text-gray-600 dark:text-slate-400" />
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
                  <th className="px-4 text-left text-sm font-semibold text-gray-900 dark:text-slate-300 w-20 bg-gray-50 dark:bg-slate-700">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-100 dark:divide-slate-700">
                {getTableRows(currentTable).map((row, rowIdx) => {
                  const isRowSummary = isSummaryRow(currentTable, rowIdx);
                  return (
                    <tr
                      key={rowIdx}
                      className={`transition-colors ${isRowSummary
                        ? 'bg-orange-50 dark:bg-orange-900/20 border-l-4 border-orange-400 dark:border-orange-500 hover:bg-orange-100 dark:hover:bg-orange-900/30'
                        : selectedRows.has(rowIdx)
                          ? 'bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30'
                          : 'hover:bg-gray-50 dark:hover:bg-slate-700'
                        }`}
                      title={isRowSummary ? 'Summary Row - Contains total or aggregate data' : ''}
                    >
                      {/* Checkbox */}
                      <td className="px-2 border-r border-gray-200 dark:border-slate-600" onClick={(e) => e.stopPropagation()}>
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleRowSelection(rowIdx);
                          }}
                          className={`w-4 h-4 border-2 rounded cursor-pointer transition-all duration-200 mx-auto ${selectedRows.has(rowIdx)
                            ? 'bg-blue-600 border-blue-600 text-white'
                            : 'bg-white dark:bg-slate-800 border-gray-300 dark:border-slate-600 hover:border-blue-500 dark:hover:border-blue-400'
                            }`}
                        >
                          {selectedRows.has(rowIdx) && (
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </div>
                      </td>

                      {/* Row cells */}
                      {row.map((cell, colIdx) => (
                        <td key={colIdx} className="text-sm text-gray-900 dark:text-slate-300 border-r border-gray-200 dark:border-slate-600">
                          {editingCell && editingCell.tableIdx === currentTableIdx && editingCell.rowIdx === rowIdx && editingCell.colIdx === colIdx ? (
                            <textarea
                              value={editingCell.value}
                              onChange={(e) => {
                                setEditingCell({ ...editingCell, value: e.target.value });
                                // Auto-resize based on content
                                e.target.style.height = 'auto';
                                e.target.style.height = e.target.scrollHeight + 'px';
                              }}
                              onBlur={saveCellEdit}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                  e.preventDefault();
                                  saveCellEdit();
                                }
                                if (e.key === 'Escape') cancelCellEdit();
                              }}
                              className="w-full px-2 py-4 focus:outline-none focus:ring-1 bg-white dark:bg-slate-800 shadow-sm resize-none overflow-hidden text-gray-900 dark:text-slate-300"
                              style={{
                                resize: 'none'
                              }}
                              autoFocus
                            />
                          ) : (
                            <div
                              className="cursor-pointer  px-2 py-4 transition-colors min-h-[32px] flex items-center"
                              onClick={() => startCellEdit(currentTableIdx, rowIdx, colIdx)}
                              title="Click to edit"
                            >
                              {cell || <span className="text-gray-400 dark:text-slate-500">-</span>}
                            </div>
                          )}
                        </td>
                      ))}

                      {/* Row actions */}
                      <td className="px-6 py-3 relative">
                        <button
                          onClick={() => setShowRowMenu(showRowMenu === rowIdx ? null : rowIdx)}
                          className="p-2 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-md transition-colors text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-300"
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
      <div className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-slate-700 dark:to-slate-800 border-t-2 border-gray-200 dark:border-slate-600 px-2 py-3 flex-shrink-0">
        <div className="flex items-center justify-start space-x-6">
          {tables.length >= 1 && (
            <div className="flex items-center justify-center">
              <button
                onClick={() => setCurrentTableIdx(Math.max(0, currentTableIdx - 1))}
                disabled={currentTableIdx === 0}
                className="px-2 py-1.5 text-sm bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-md hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="h-4 w-4 text-gray-700 dark:text-slate-300" />
              </button>
              <span className="text-sm text-gray-700 dark:text-slate-300 font-medium px-2">
                Table {currentTableIdx + 1} of {tables.length}
              </span>
              <button
                onClick={() => setCurrentTableIdx(Math.min(tables.length - 1, currentTableIdx + 1))}
                disabled={currentTableIdx === tables.length - 1}
                className="px-2 py-1.5 text-sm bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-md hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="h-4 w-4 text-gray-700 dark:text-slate-300" />
              </button>
            </div>
          )}
          <div className="flex items-center space-x-4">
            <span className="text-sm font-medium text-gray-700 dark:text-slate-300">
              <span className="text-blue-600 dark:text-blue-400 font-semibold">{getTableRows(currentTable).length}</span> row{getTableRows(currentTable).length !== 1 ? 's' : ''}
              <span className="mx-2 text-gray-400 dark:text-slate-500">×</span>
              <span className="text-blue-600 dark:text-blue-400 font-semibold">{getTableHeaders(currentTable).length}</span> column{getTableHeaders(currentTable).length !== 1 ? 's' : ''}
            </span>
            {selectedRows.size > 0 && (
              <>
                <span className="text-sm text-blue-600 dark:text-blue-400 font-medium">
                  • {selectedRows.size} selected
                </span>
                <div className="flex items-center space-x-1">
                  {/* Mark as Summary Row button - show if any selected rows are NOT summary rows */}
                  {hasSelectedNonSummaryRows() && (
                    <button
                      onClick={markSelectedAsSummaryRows}
                      className="px-3 py-1.5 text-sm bg-orange-600 dark:bg-orange-700 text-white rounded-md hover:bg-orange-700 dark:hover:bg-orange-800 flex items-center transition-colors shadow-sm"
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
                      className="px-3 py-1.5 text-sm bg-blue-600 dark:bg-blue-700 text-white rounded-md hover:bg-blue-700 dark:hover:bg-blue-800 flex items-center transition-colors shadow-sm"
                      title="Unmark selected rows as summary rows"
                    >
                      <AlertCircle className="w-4 h-4 mr-1.5" />
                      Unmark as Summary Row
                    </button>
                  )}

                  <button
                    onClick={deleteSelectedRows}
                    className="px-3 py-1.5 text-sm bg-red-600 dark:bg-red-700 text-white rounded-md hover:bg-red-700 dark:hover:bg-red-800 flex items-center transition-colors shadow-sm"
                    title="Delete selected rows"
                  >
                    <Trash2 className="w-4 h-4 mr-1.5" />
                    Delete Selected
                  </button>

                  <button
                    onClick={clearRowSelection}
                    className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors dark:bg-slate-800 dark:border-slate-600 dark:hover:bg-slate-700"
                    title="Clear selection"
                  >
                    Clear Selection
                  </button>
                </div>
              </>

            )}
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
      className="absolute top-full left-0 mt-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg shadow-xl z-50 min-w-[220px]"
      data-header-menu
    >
      {isRenaming ? (
        <div className="p-4">
          <label className="text-xs font-medium text-gray-700 dark:text-slate-300 block mb-2">Column Name</label>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleRename()}
            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-300"
            placeholder="Enter column name"
            autoFocus
          />
          <div className="flex gap-2 mt-3">
            <button
              onClick={handleRename}
              className="flex-1 px-3 py-1.5 bg-blue-600 dark:bg-blue-700 text-white rounded-md text-sm hover:bg-blue-700 dark:hover:bg-blue-800 transition-colors font-medium"
            >
              Save
            </button>
            <button
              onClick={() => setIsRenaming(false)}
              className="flex-1 px-3 py-1.5 bg-gray-200 dark:bg-slate-600 text-gray-700 dark:text-slate-300 rounded-md text-sm hover:bg-gray-300 dark:hover:bg-slate-500 transition-colors font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="p-2">
          <button
            onClick={() => setIsRenaming(true)}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-md transition-colors"
          >
            <Pencil className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span className="font-medium">Rename Column</span>
          </button>
          <button
            onClick={() => {
              onAddColumn(tableIdx, colIdx);
              onClose();
            }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-md transition-colors"
          >
            <Plus className="w-4 h-4 text-green-600 dark:text-green-400" />
            <span className="font-medium">Add Column After</span>
          </button>
          <div className="border-t border-gray-200 dark:border-slate-600 my-2"></div>
          <button
            onClick={() => {
              onDeleteColumn(tableIdx, colIdx);
              onClose();
            }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
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
      className="absolute right-0 top-full mt-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg shadow-xl z-50 min-w-[200px]"
      data-row-menu
    >
      <div className="p-2">
        <button
          onClick={() => {
            onAddRowAbove(tableIdx, rowIdx);
            onClose();
          }}
          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-md transition-colors"
        >
          <Plus className="w-4 h-4 text-green-600 dark:text-green-400" />
          <span className="font-medium">Add Row Above</span>
        </button>
        <button
          onClick={() => {
            onAddRowBelow(tableIdx, rowIdx);
            onClose();
          }}
          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-md transition-colors"
        >
          <Plus className="w-4 h-4 text-green-600 dark:text-green-400" />
          <span className="font-medium">Add Row Below</span>
        </button>
        <div className="border-t border-gray-200 dark:border-slate-600 my-2"></div>
        <button
          onClick={() => {
            onDeleteRow(tableIdx, rowIdx);
            onClose();
          }}
          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
        >
          <Trash2 className="w-4 h-4" />
          <span className="font-medium">Delete Row</span>
        </button>
      </div>
    </div>
  );
}

