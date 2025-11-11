import React, { useState } from 'react';
import { Trash2, CheckCircle2, XCircle, Clock, FileText, ExternalLink, ChevronLeft, ChevronRight, Table as TableIcon, User, Edit, AlertTriangle, PlayCircle, AlertCircle, ReceiptText, ChevronDown, ChevronRight as ChevronRightIcon } from "lucide-react";
import { useRouter } from 'next/navigation';
import TableViewerModal from './TableViewerModal';
import EditableCompareModal from './EditableCompareModal';
import toast from 'react-hot-toast';

type Statement = {
  id: string;
  file_name: string;
  uploaded_at: string;
  status: string;
  carrier_id?: string;  // Insurance carrier ID
  rejection_reason?: string;
  selected_statement_date?: any;
  raw_data?: any;
  edited_tables?: any;
  final_data?: any[];  // Array of commission records (tables with rows)
  field_config?: any[];  // Field configuration/mappings
  field_mapping?: Record<string, string> | null;  // Field mappings saved during approval
  uploaded_by_email?: string;
  uploaded_by_name?: string;
  // NEW: Automation metadata
  automated_approval?: boolean;
  automation_timestamp?: string;
  total_amount_match?: boolean | null;
  extracted_total?: number;  // Earned commission total extracted from document
  extracted_invoice_total?: number;  // Invoice total calculated from table data
  gcs_key?: string;
  gcs_url?: string;
};

type Props = {
  statements: Statement[];
  setStatements: React.Dispatch<React.SetStateAction<Statement[]>>;
  onPreview: (idx: number) => void;
  onCompare: (idx: number) => void;
  onDelete: (ids: string[]) => void;
  deleting?: boolean;
  canSelectFiles?: boolean;
  canDeleteFiles?: boolean;
  showUploadedByColumn?: boolean;
  onRefresh?: () => void;
};

export default function CarrierStatementsTable({ statements, setStatements, onPreview, onCompare, onDelete, deleting, canSelectFiles = true, canDeleteFiles = true, showUploadedByColumn = false, onRefresh }: Props) {
  const [selectedStatements, setSelectedStatements] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [tableViewerOpen, setTableViewerOpen] = useState(false);
  const [selectedStatementId, setSelectedStatementId] = useState<string>('');
  const [activeStatusTab, setActiveStatusTab] = useState<'all' | 'approved' | 'pending' | 'rejected'>('all');
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewStatement, setReviewStatement] = useState<Statement | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const itemsPerPage = 10;
  const router = useRouter();

  // Filter statements based on active status tab
  const filteredStatements = (statements || []).filter(statement => {
    if (activeStatusTab === 'all') return true;
    
    const status = statement.status.toLowerCase();
    switch (activeStatusTab) {
      case 'approved':
        return status === 'approved' || status === 'completed';
      case 'pending':
        // ✅ FIX: Include 'needs_review' status in pending filter
        return ['pending', 'extracted', 'success', 'processing', 'needs_review'].includes(status);
      case 'rejected':
        return status === 'rejected';
      default:
        return true;
    }
  });

  const totalPages = Math.ceil(filteredStatements.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedStatements = filteredStatements.slice(startIndex, endIndex);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    setSelectedStatements(new Set()); // Clear selections when changing pages
    setSelectAll(false);
  };

  const handleStatusTabChange = (tab: 'all' | 'approved' | 'pending' | 'rejected') => {
    setActiveStatusTab(tab);
    setCurrentPage(1); // Reset to first page when changing tabs
    setSelectedStatements(new Set()); // Clear selections when changing tabs
    setSelectAll(false);
  };

  const handleCheckboxChange = (id: string) => {
   
    
    // Only block if user cannot select files, not based on deleting state
    if (!canSelectFiles) {
      return;
    }
    
    setSelectedStatements(prevSelected => {
      const newSelectedStatements = new Set(prevSelected);
      if (newSelectedStatements.has(id)) {
        newSelectedStatements.delete(id);
      } else {
        newSelectedStatements.add(id);
      }
      return newSelectedStatements;
    });
  };

  const handleDelete = () => {
    if (selectedStatements.size > 0) {
      const idsToDelete = Array.from(selectedStatements);
      onDelete(idsToDelete);
      setSelectedStatements(new Set());
      setSelectAll(false);
    }
  };

  const handleSelectAllChange = () => {
    const newSelectedStatements = new Set<string>();
    if (!selectAll) {
      paginatedStatements.forEach(statement => newSelectedStatements.add(statement.id));
    }
    setSelectedStatements(newSelectedStatements);
    setSelectAll(!selectAll);
  };

  const handleViewFormattedTables = (statementId: string) => {
    setSelectedStatementId(statementId);
    setTableViewerOpen(true);
  };

  const handleReviewStatement = (statement: Statement) => {
    setReviewStatement(statement);
    setReviewModalOpen(true);
  };

  const handleReviewModalClose = () => {
    setReviewModalOpen(false);
    setReviewStatement(null);
  };

  const handleReviewComplete = () => {
    // Refresh statement list to show updated status
    setReviewModalOpen(false);
    setReviewStatement(null);
    
    // Trigger parent refresh if callback provided
    if (onRefresh) {
      onRefresh();
    }
    
    toast.success("Statement recalculated successfully!");
  };

  const toggleExpand = (statementId: string) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(statementId)) {
        newSet.delete(statementId);
      } else {
        newSet.add(statementId);
      }
      return newSet;
    });
  };

  const normalizeFileName = (fileName: string) => {
    // Extract just the filename from the full path
    const parts = fileName.split('/');
    return parts[parts.length - 1];
  };

  const formatStatementDate = (selectedStatementDate: any) => {
    if (!selectedStatementDate) return '—';
    
    try {
      // Handle different date formats that might be stored
      const dateStr = selectedStatementDate.date || selectedStatementDate.date_value || selectedStatementDate;
      
      if (typeof dateStr === 'string') {
        // Handle different date formats
        let date: Date;
        
        // Try parsing as MM/DD/YYYY format first (common in US)
        if (dateStr.includes('/')) {
          const parts = dateStr.split('/');
          if (parts.length === 3) {
            // MM/DD/YYYY format
            date = new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
          } else {
            date = new Date(dateStr);
          }
        } else {
          // Try standard Date parsing for ISO format
          date = new Date(dateStr);
        }
        
        if (!isNaN(date.getTime())) {
          return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
          });
        }
      }
      
      return dateStr || '—';
    } catch (error) {
      console.error('Error formatting statement date:', error, selectedStatementDate);
      return '—';
    }
  };

  const getStatusInfo = (status: string) => {
    switch (status.toLowerCase()) {
      case 'approved':
      case 'completed':
        return {
          label: 'Approved',
          color: 'success',
          icon: CheckCircle2,
          bgColor: 'bg-green-50 dark:bg-green-950/20',
          textColor: 'text-green-700 dark:text-green-400',
          borderColor: 'border-green-200 dark:border-green-800'
        };
      case 'rejected':
        return {
          label: 'Rejected',
          color: 'destructive',
          icon: XCircle,
          bgColor: 'bg-red-50 dark:bg-red-950/20',
          textColor: 'text-red-700 dark:text-red-400',
          borderColor: 'border-red-200 dark:border-red-800'
        };
      case 'needs_review':
        return {
          label: 'Needs Review',
          color: 'amber',
          icon: AlertCircle,
          bgColor: 'bg-amber-50 dark:bg-amber-950/20',
          textColor: 'text-amber-700 dark:text-amber-400',
          borderColor: 'border-2 border-amber-400 dark:border-amber-600',
          pulse: true
        };
      case 'pending':
      case 'extracted':
      case 'success':
      default:
        return {
          label: 'Pending',
          color: 'warning',
          icon: Clock,
          bgColor: 'bg-slate-50 dark:bg-slate-800/30',
          textColor: 'text-slate-600 dark:text-slate-400',
          borderColor: 'border-slate-200 dark:border-slate-700'
        };
    }
  };

  return (
    <div className="overflow-hidden relative">
      {deleting && (
        <div className="absolute inset-0 bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm flex items-center justify-center z-10 rounded-xl">
          <div className="flex items-center space-x-3">
            <div className="w-6 h-6 border-2 border-slate-200 dark:border-slate-600 border-t-red-500 rounded-full animate-spin"></div>
            <span className="text-slate-700 dark:text-slate-300 font-medium">Deleting statements...</span>
          </div>
        </div>
      )}
      
      {/* Enhanced Delete Button */}
      {selectedStatements.size > 0 && canDeleteFiles && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Trash2 className="text-red-600 dark:text-red-400" size={20} />
              <span className="text-red-700 dark:text-red-300 font-medium">
                {selectedStatements.size} statement{selectedStatements.size !== 1 ? 's' : ''} selected for deletion
              </span>
            </div>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="inline-flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg font-medium shadow-sm hover:bg-red-600 transition-all duration-200 disabled:opacity-50"
            >
              <Trash2 size={16} />
              {deleting ? 'Deleting...' : 'Delete Selected'}
            </button>
          </div>
        </div>
      )}

      {/* Read-only mode indicator */}
      {!canSelectFiles && (
        <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-600 rounded-xl">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 bg-amber-100 dark:bg-amber-800/60 rounded-full flex items-center justify-center">
              <span className="text-amber-600 dark:text-amber-200 text-xs">🔒</span>
            </div>
            <span className="text-amber-700 dark:text-amber-200 font-medium">
              Read-only mode - You can view data but cannot make changes
            </span>
          </div>
        </div>
      )}

      {/* Status Tabs */}
      <div className="mb-6">
        <div className="flex items-center gap-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-1">
          <button
            onClick={() => handleStatusTabChange('all')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
              activeStatusTab === 'all'
                ? 'bg-blue-500 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            <span>All</span>
            <span className="text-xs bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300 px-2 py-1 rounded-full">
              {statements?.length || 0}
            </span>
          </button>
          <button
            onClick={() => handleStatusTabChange('approved')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
              activeStatusTab === 'approved'
                ? 'bg-green-500 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            <CheckCircle2 size={16} />
            <span>Approved</span>
            <span className="text-xs bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300 px-2 py-1 rounded-full">
              {(statements || []).filter(s => s.status.toLowerCase() === 'approved' || s.status.toLowerCase() === 'completed').length}
            </span>
          </button>
          <button
            onClick={() => handleStatusTabChange('pending')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
              activeStatusTab === 'pending'
                ? 'bg-orange-500 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            <Clock size={16} />
            <span>Pending</span>
            <span className="text-xs bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300 px-2 py-1 rounded-full">
              {(statements || []).filter(s => ['pending', 'extracted', 'success', 'processing', 'needs_review'].includes(s.status.toLowerCase())).length}
            </span>
          </button>
          <button
            onClick={() => handleStatusTabChange('rejected')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
              activeStatusTab === 'rejected'
                ? 'bg-red-500 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            <XCircle size={16} />
            <span>Rejected</span>
            <span className="text-xs bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300 px-2 py-1 rounded-full">
              {(statements || []).filter(s => s.status.toLowerCase() === 'rejected').length}
            </span>
          </button>
        </div>
      </div>

      {/* Minimalist Table */}
      <div className="w-full overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-10 bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur-sm">
              <tr className="border-b-2 border-slate-200 dark:border-slate-700">
                <th className="py-3 px-4 w-8">
                  {/* Expand column */}
                </th>
                <th className="py-3 px-4 w-12">
                  {canSelectFiles ? (
                    <input
                      type="checkbox"
                      checked={selectAll}
                      onChange={(e) => {
                        e.stopPropagation();
                        handleSelectAllChange();
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectAllChange();
                      }}
                      className="w-4 h-4 text-blue-500 border-slate-300 dark:border-slate-600 rounded focus:ring-blue-500 cursor-pointer"
                      style={{ pointerEvents: 'auto', zIndex: 10 }}
                    />
                  ) : (
                    <div className="w-4 h-4 border border-slate-300 dark:border-slate-600 rounded bg-slate-100 dark:bg-slate-700" title="Selection disabled"></div>
                  )}
                </th>
                <th className="py-3 px-4 text-left">
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                    Statement
                  </span>
                </th>
                <th className="py-3 px-4 text-left">
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                    Uploaded On
                  </span>
                </th>
                {showUploadedByColumn && (
                  <th className="py-3 px-4 text-left">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                      Uploaded By
                    </span>
                  </th>
                )}
                <th className="py-3 px-4 text-left">
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                    Date
                  </span>
                </th>
                <th className="py-3 px-4 text-left">
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                    Status
                  </span>
                </th>
                <th className="py-3 px-4 text-right">
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                    Actions
                  </span>
                </th>
              </tr>
            </thead>
          <tbody>
            {paginatedStatements.map((statement, idx) => {
              const statusInfo = getStatusInfo(statement.status);
              const StatusIcon = statusInfo.icon;
              const isExpanded = expandedRows.has(statement.id);
              
              // Determine row background based on status - Premium visible colors
              const getRowBgColor = () => {
                const status = statement.status.toLowerCase();
                if (status === 'approved' || status === 'completed') {
                  return 'bg-emerald-50 dark:bg-emerald-900/20 hover:!bg-emerald-100 dark:hover:!bg-emerald-900/30';
                } else if (status === 'needs_review') {
                  return 'bg-amber-50 dark:bg-amber-900/20 hover:!bg-amber-100 dark:hover:!bg-amber-900/30';
                }
                return 'bg-white dark:bg-slate-900 hover:!bg-slate-50 dark:hover:!bg-slate-800/50';
              };
              
              return (
                <React.Fragment key={statement.id}>
                  {/* Main compact row */}
                  <tr 
                    className={`border-b border-slate-100 dark:border-slate-800 transition-colors group ${getRowBgColor()}`}
                  >
                    {/* Expand icon column */}
                    <td className="py-3 px-4">
                      <button 
                        onClick={() => toggleExpand(statement.id)}
                        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRightIcon className="w-4 h-4" />
                        )}
                      </button>
                    </td>

                    {/* Checkbox column */}
                    <td className="py-3 px-4">
                      {canSelectFiles ? (
                        <input
                          type="checkbox"
                          checked={selectedStatements.has(statement.id)}
                          onChange={(e) => {
                            e.stopPropagation();
                            handleCheckboxChange(statement.id);
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCheckboxChange(statement.id);
                          }}
                          className="w-4 h-4 text-blue-500 border-slate-300 dark:border-slate-600 rounded focus:ring-blue-500 cursor-pointer"
                          style={{ pointerEvents: 'auto', zIndex: 10 }}
                        />
                      ) : (
                        <div className="w-4 h-4 border border-slate-300 dark:border-slate-600 rounded bg-slate-100 dark:bg-slate-700" title="Selection disabled"></div>
                      )}
                    </td>

                    {/* Statement name column */}
                    <td className="py-3 px-4">
                      <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {normalizeFileName(statement.file_name)}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        ID: {statement.id.slice(0, 8)}
                      </div>
                    </td>

                    {/* Uploaded date column */}
                    <td className="py-3 px-4">
                      <div className="text-sm text-slate-700 dark:text-slate-300">
                        {new Date(statement.uploaded_at).toLocaleDateString()}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {new Date(statement.uploaded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>

                    {/* Uploaded by column (conditional) */}
                    {showUploadedByColumn && (
                      <td className="py-3 px-4">
                        <div className="text-sm text-slate-900 dark:text-slate-100">
                          {statement.uploaded_by_name || statement.uploaded_by_email || '—'}
                        </div>
                        {statement.uploaded_by_name && statement.uploaded_by_email && (
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            {statement.uploaded_by_email}
                          </div>
                        )}
                      </td>
                    )}

                    {/* Statement date column */}
                    <td className="py-3 px-4">
                      <div className="text-sm text-slate-700 dark:text-slate-300">
                        {formatStatementDate(statement.selected_statement_date)}
                      </div>
                    </td>

                    {/* Status column - minimal dot + text */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        {/* Minimalist status badge */}
                        {statement.status.toLowerCase() === 'approved' || statement.status.toLowerCase() === 'completed' ? (
                          <div className="inline-flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400"></span>
                            <span className="text-sm text-emerald-700 dark:text-emerald-400 font-medium">Approved</span>
                          </div>
                        ) : statement.status.toLowerCase() === 'needs_review' ? (
                          <div className="inline-flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 dark:bg-amber-400 animate-pulse"></span>
                            <span className="text-sm text-amber-700 dark:text-amber-400 font-semibold">Needs Review</span>
                          </div>
                        ) : statement.status.toLowerCase() === 'rejected' ? (
                          <div className="inline-flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500 dark:bg-red-400"></span>
                            <span className="text-sm text-red-700 dark:text-red-400 font-medium">Rejected</span>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500"></span>
                            <span className="text-sm text-slate-600 dark:text-slate-400">Pending</span>
                          </div>
                        )}
                        
                        {/* Warning icon for rejection reason - only icon, details in expandable row */}
                        {statement.rejection_reason && (
                          <div className="relative group">
                            <AlertCircle className="w-4 h-4 text-red-500" />
                            {/* Tooltip on hover */}
                            <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-3 py-2 text-xs text-white bg-slate-900 dark:bg-slate-700 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap max-w-xs z-20 shadow-lg">
                              {statement.rejection_reason.slice(0, 100)}{statement.rejection_reason.length > 100 ? '...' : ''}
                            </div>
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Actions column - compact buttons */}
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* View Table button - always visible */}
                        <button
                          onClick={() => handleViewFormattedTables(statement.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm"
                        >
                          <TableIcon className="w-3.5 h-3.5" />
                          <span>View Table</span>
                        </button>

                        {/* Primary action button - compact */}
                        {statement.status.toLowerCase() === 'needs_review' ? (
                          <button
                            onClick={() => handleReviewStatement(statement)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-900 dark:text-amber-100 bg-amber-200 dark:bg-amber-600 border border-amber-400 dark:border-amber-500 rounded hover:bg-amber-300 dark:hover:bg-amber-500 transition-colors animate-pulse shadow-sm"
                          >
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>Review</span>
                          </button>
                        ) : (statement.status.toLowerCase() === 'approved' || statement.status.toLowerCase() === 'completed') ? (
                          <button
                            onClick={() => handleReviewStatement(statement)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm"
                          >
                            <Edit className="w-3.5 h-3.5" />
                            <span>Edit</span>
                          </button>
                        ) : (statement.status.toLowerCase() === 'pending' || statement.status.toLowerCase() === 'extracted' || statement.status.toLowerCase() === 'success') ? (
                          <button
                            onClick={() => router.push(`/upload?resume=${statement.id}`)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm"
                          >
                            <PlayCircle className="w-3.5 h-3.5" />
                            <span>Continue</span>
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>

                  {/* Expandable detail row - ONLY shown when expanded */}
                  {isExpanded && (
                    <tr className={`border-b border-slate-100 dark:border-slate-800 ${getRowBgColor()} !transition-colors`}>
                      <td colSpan={showUploadedByColumn ? 8 : 7} className="py-4 px-4">
                        <div className="max-w-3xl ml-12">
                          {/* Commission Details Section */}
                          {(statement.status.toLowerCase() === 'approved' || 
                            statement.status.toLowerCase() === 'completed' ||
                            statement.status.toLowerCase() === 'needs_review') && (
                            (() => {
                              const extractedTotal = statement.extracted_total;
                          
                          // Find the commission field name from field_config or field_mapping
                          let sourceCommissionFieldName = ''; // The actual column name in the data
                          
                          // Try field_mapping first (most reliable)
                          if (statement.field_mapping && typeof statement.field_mapping === 'object') {
                            // field_mapping is like: {"Paid Amount": "Commission Earned"}
                            // Find the source field that maps to a commission-related target
                            const commissionMappingCandidates = [
                              'commission earned', 'commission_earned', 'total commission paid',
                              'commission', 'paid amount', 'paid_amount', 'amount paid'
                            ];
                            
                            for (const [sourceField, targetField] of Object.entries(statement.field_mapping)) {
                              const normalizedTarget = String(targetField).toLowerCase().trim();
                              if (commissionMappingCandidates.some(candidate => 
                                normalizedTarget.includes(candidate) || candidate.includes(normalizedTarget)
                              )) {
                                sourceCommissionFieldName = sourceField;
                                console.log(`💰 Found commission field from field_mapping: "${sourceField}" → "${targetField}"`);
                                break;
                              }
                            }
                          }
                          
                          // Fallback to field_config if field_mapping didn't work
                          if (!sourceCommissionFieldName && statement.field_config && Array.isArray(statement.field_config)) {
                            const commissionField = statement.field_config.find((field: any) => {
                              const fieldName = field.field || field.source_field || '';
                              const mappingName = field.mapping || field.label || field.display_name || '';
                              return fieldName.toLowerCase().includes('commission') ||
                                     fieldName.toLowerCase().includes('paid') ||
                                     mappingName.toLowerCase().includes('commission');
                            });
                            
                            if (commissionField) {
                              sourceCommissionFieldName = commissionField.field || commissionField.source_field || '';
                              console.log(`💰 Found commission field from field_config: "${sourceCommissionFieldName}"`);
                            }
                          }
                          
                          // Calculate total from final_data
                          // CRITICAL FIX: Rows are stored as ARRAYS, not objects!
                          // We need to find the column index from headers and access by index
                          let calculatedTotal = 0;
                          
                          console.log('🔍 Calculating total for statement:', statement.id);
                          console.log('📊 final_data structure:', statement.final_data);
                          console.log('🏷️ Using source commission field name:', sourceCommissionFieldName);
                          console.log('⚙️ field_mapping:', statement.field_mapping);
                          console.log('⚙️ field_config:', statement.field_config);
                          
                          if (statement.final_data && Array.isArray(statement.final_data)) {
                            // Iterate through each table in final_data
                            statement.final_data.forEach((table: any, tableIdx: number) => {
                              // Get headers (can be 'header' or 'headers')
                              const headers = table.header || table.headers || [];
                              const rows = table.rows || [];
                              const summaryRows = new Set(table.summaryRows || []);
                              
                              console.log(`📋 Table ${tableIdx + 1}:`, table.name);
                              console.log(`  Headers (${headers.length}):`, headers);
                              console.log(`  Rows: ${rows.length}, Summary rows: ${summaryRows.size}`);
                              
                              // Find the column index for the commission field
                              let commissionColumnIndex = -1;
                              
                              if (sourceCommissionFieldName) {
                                // Try exact match first
                                commissionColumnIndex = headers.indexOf(sourceCommissionFieldName);
                                
                                // Try case-insensitive match
                                if (commissionColumnIndex === -1) {
                                  commissionColumnIndex = headers.findIndex((h: string) => 
                                    h && h.toLowerCase() === sourceCommissionFieldName.toLowerCase()
                                  );
                                }
                              }
                              
                              // Fallback: search for common commission field names in headers
                              if (commissionColumnIndex === -1) {
                                const commissionHeaderCandidates = [
                                  'commission earned', 'paid amount', 'total commission paid',
                                  'commission', 'amount paid', 'earned'
                                ];
                                
                                commissionColumnIndex = headers.findIndex((h: string) => {
                                  if (!h) return false;
                                  const normalized = h.toLowerCase().trim();
                                  return commissionHeaderCandidates.some(candidate => 
                                    normalized.includes(candidate) || candidate.includes(normalized)
                                  );
                                });
                              }
                              
                              if (commissionColumnIndex === -1) {
                                console.warn(`  ⚠️ Could not find commission column in headers:`, headers);
                                return;
                              }
                              
                              console.log(`  💰 Commission column found at index ${commissionColumnIndex}: "${headers[commissionColumnIndex]}"`);
                              
                              // Sum up commission values from non-summary rows
                              let tableTotal = 0;
                              rows.forEach((row: any[], rowIdx: number) => {
                                // Skip summary rows
                                if (summaryRows.has(rowIdx)) {
                                  console.log(`    Row ${rowIdx}: SKIPPED (summary row)`);
                                  return;
                                }
                                
                                // Access by index (rows are arrays!)
                                const rawValue = row[commissionColumnIndex];
                                
                                if (rawValue === undefined || rawValue === null || rawValue === '') {
                                  console.log(`    Row ${rowIdx}: EMPTY value`);
                                  return;
                                }
                                
                                // Parse the value
                                let numericValue = 0;
                                if (typeof rawValue === 'number') {
                                  numericValue = rawValue;
                                } else if (typeof rawValue === 'string') {
                                  // Remove currency symbols and commas
                                  const cleaned = rawValue.replace(/[$,]/g, '').trim();
                                  numericValue = parseFloat(cleaned);
                                }
                                
                                if (!isNaN(numericValue) && numericValue !== 0) {
                                  tableTotal += numericValue;
                                  calculatedTotal += numericValue;
                                  console.log(`    Row ${rowIdx}: Added $${numericValue.toFixed(2)} (raw: "${rawValue}")`);
                                } else {
                                  console.log(`    Row ${rowIdx}: Could not parse "${rawValue}"`);
                                }
                              });
                              
                              console.log(`  ✅ Table ${tableIdx + 1} total: $${tableTotal.toFixed(2)}`);
                            });
                          }
                          
                          console.log('💰 Final calculated total:', calculatedTotal.toFixed(2));
                          
                          // Get invoice total (NEW)
                          const extractedInvoiceTotal = (statement as any).extracted_invoice_total;
                          const hasInvoiceTotal = extractedInvoiceTotal !== undefined && extractedInvoiceTotal !== null && extractedInvoiceTotal > 0;
                          
                          // Calculate the difference and match status
                              const difference = calculatedTotal - (extractedTotal || 0);
                              const isMatch = statement.total_amount_match === true;
                              const hasExtractedTotal = extractedTotal !== undefined && extractedTotal !== null && extractedTotal > 0;
                              const hasCalculatedTotal = calculatedTotal > 0;
                              
                              // If no data at all, don't show the card
                              if (!hasExtractedTotal && !hasCalculatedTotal && !hasInvoiceTotal) return null;
                              
                              return (
                                <div className="mb-4">
                                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                                    <ReceiptText className="w-4 h-4" />
                                    <span>Commission Details</span>
                                  </div>
                                  
                                  <div className="grid grid-cols-3 gap-4 text-sm">
                                    {/* Show Invoice Total if available */}
                                    {hasInvoiceTotal && (
                                      <div>
                                        <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                                          Total Invoice
                                        </div>
                                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                                          ${extractedInvoiceTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </div>
                                      </div>
                                    )}
                                    
                                    {/* Show Earned Commission (from document extraction or calculation) */}
                                    <div>
                                      <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                                        {statement.status.toLowerCase() === 'needs_review' ? 'Commission on File' : 'Earned Commission'}
                                      </div>
                                      <div className="font-semibold text-slate-900 dark:text-slate-100">
                                        {hasExtractedTotal 
                                          ? `$${extractedTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                          : hasCalculatedTotal 
                                            ? `$${calculatedTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                            : '—'
                                        }
                                      </div>
                                    </div>
                                    
                                    {/* Show calculated commission if we have both extracted and calculated */}
                                    {hasExtractedTotal && hasCalculatedTotal && Math.abs(calculatedTotal - extractedTotal) > 0.01 && (
                                      <div>
                                        <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                                          Calculated Commission
                                        </div>
                                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                                          ${calculatedTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </div>
                                      </div>
                                    )}
                                    
                                    {/* Show difference if there's a mismatch */}
                                    {hasExtractedTotal && !isMatch && Math.abs(difference) > 0.01 && (
                                      <div>
                                        <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Difference</div>
                                        <div className={`font-semibold ${
                                          difference > 0 
                                            ? 'text-amber-600 dark:text-amber-400' 
                                            : 'text-amber-600 dark:text-amber-400'
                                        }`}>
                                          {difference > 0 ? '+' : ''}${Math.abs(difference).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })()
                          )}

                          {/* Rejection reason in expandable section */}
                          {statement.rejection_reason && (
                            <div className="pt-3 border-t border-slate-200 dark:border-slate-700">
                              <div className="flex items-start gap-2 text-sm">
                                <AlertCircle className="w-4 h-4 text-red-500 mt-0.5" />
                                <div>
                                  <div className="font-medium text-red-700 dark:text-red-400 mb-1">Rejection Reason</div>
                                  <div className="text-slate-600 dark:text-slate-400">{statement.rejection_reason}</div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-slate-700">
            <div className="flex-1 flex justify-between sm:hidden">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="inline-flex items-center px-4 py-2 border border-slate-300 dark:border-slate-600 text-sm font-medium rounded-lg text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="ml-3 inline-flex items-center px-4 py-2 border border-slate-300 dark:border-slate-600 text-sm font-medium rounded-lg text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
              >
                Next
              </button>
            </div>
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="inline-flex items-center px-3 py-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm font-medium rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <span className="text-sm text-slate-700 dark:text-slate-300 font-medium">
                  Page <span className="font-semibold">{currentPage}</span> of{' '}
                  <span className="font-semibold">{totalPages}</span>
                </span>
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="inline-flex items-center px-3 py-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm font-medium rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Empty State */}
        {filteredStatements.length === 0 && (
          <div className="text-center py-16 bg-white dark:bg-slate-900">
            <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center mx-auto mb-4">
              <FileText className="h-8 w-8 text-slate-400 dark:text-slate-500" />
            </div>
            <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200 mb-2">
              {activeStatusTab === 'all' ? 'No statements found' : `No ${activeStatusTab} statements found`}
            </h3>
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              {activeStatusTab === 'all' 
                ? 'Upload statements to see them listed here'
                : `Try selecting a different status tab to view other statements`
              }
            </p>
          </div>
        )}
      </div>

      {/* Table Viewer Modal */}
      <TableViewerModal
        isOpen={tableViewerOpen}
        onClose={() => setTableViewerOpen(false)}
        statementId={selectedStatementId}
        tableType="formatted"
        title="Formatted Tables"
        statement={(statements || []).find(s => s.id === selectedStatementId)}
      />

      {/* Review Modal */}
      {reviewModalOpen && reviewStatement && (
        <EditableCompareModal
          statement={reviewStatement}
          onClose={handleReviewModalClose}
          onComplete={handleReviewComplete}
        />
      )}
    </div>
  );
}
