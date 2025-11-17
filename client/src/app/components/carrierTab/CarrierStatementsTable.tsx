import React, { useState } from 'react';
import { Trash2, CheckCircle2, XCircle, Clock, FileText, ExternalLink, ChevronLeft, ChevronRight, Table as TableIcon, User, Edit, AlertTriangle, PlayCircle, AlertCircle, ReceiptText } from "lucide-react";
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
  user_id?: string;  // User who uploaded the statement
  environment_id?: string;  // Environment context for data isolation
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
  extracted_total?: number;  // Earned commission total extracted from document (AI-extracted)
  calculated_total?: number;  // Earned commission total calculated from table rows
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
  // CRITICAL FIX: Removed 'rejected' - only Approved and needs_review statements are stored
  const [activeStatusTab, setActiveStatusTab] = useState<'all' | 'approved' | 'pending'>('all');
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewStatement, setReviewStatement] = useState<Statement | null>(null);
  const itemsPerPage = 10;
  const router = useRouter();

  // CRITICAL STATUS FILTERING (Defense in Depth)
  // 1. Backend should only return 'Approved' or 'needs_review' statuses
  // 2. Frontend adds defensive filtering to ensure no ghost records appear
  // 3. This prevents orphaned/failed extractions from cluttering the UI
  
  // Valid statuses that should be displayed (matches backend VALID_PERSISTENT_STATUSES)
  const VALID_DISPLAY_STATUSES = ['Approved', 'needs_review'];
  
  // First filter: Remove any statements with invalid statuses (defensive layer)
  const validStatements = (statements || []).filter(statement => 
    VALID_DISPLAY_STATUSES.includes(statement.status)
  );
  
  // Second filter: Apply user-selected status tab filter
  const filteredStatements = validStatements.filter(statement => {
    if (activeStatusTab === 'all') return true;
    
    const status = statement.status;  // Don't lowercase - backend returns exact case
    switch (activeStatusTab) {
      case 'approved':
        return status === 'Approved';  // Exact match for backend status
      case 'pending':
        return status === 'needs_review';  // Exact match for backend status
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

  const handleStatusTabChange = (tab: 'all' | 'approved' | 'pending') => {
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

  // Helper function to render commission cells
  const renderCommissionCell = (statement: Statement) => {
    const status = statement.status.toLowerCase();
    const extractedTotal = statement.extracted_total || 0;
    const extractedInvoice = statement.extracted_invoice_total || 0;
    const isApproved = status === "approved" || status === "completed";
    const isNeedsReview = status === "needs_review";
    
    // For APPROVED statements - show the values directly
    if (isApproved && extractedTotal > 0) {
      return {
        invoice: (
          <div className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
            {extractedInvoice.toLocaleString("en-US", {
              style: "currency",
              currency: "USD",
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            })}
          </div>
        ),
        commission: (
          <div className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
            {extractedTotal.toLocaleString("en-US", {
              style: "currency",
              currency: "USD",
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            })}
          </div>
        )
      };
    }
    
    // For NEEDSREVIEW statements - show the stored calculated total and difference
    if (isNeedsReview && extractedTotal > 0) {
      // Use the calculated_total from database (calculated during auto-approval)
      const calculatedTotal = statement.calculated_total || 0;
      
      const difference = calculatedTotal - extractedTotal;
      const isMatch = Math.abs(difference) < 0.01;
      
      return {
        invoice: (
          <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {extractedInvoice > 0 ? extractedInvoice.toLocaleString("en-US", {
              style: "currency",
              currency: "USD",
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            }) : "—"}
          </div>
        ),
        commission: (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">File:</span>
              <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                ${extractedTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">Calc:</span>
              <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                ${calculatedTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </span>
            </div>
            {!isMatch && Math.abs(difference) > 0.01 && (
              <div className="flex items-center gap-1 px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 rounded">
                <span className="text-xs text-amber-700 dark:text-amber-300 font-bold">
                  Δ {difference > 0 ? "+" : ""}{difference.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  })}
                </span>
              </div>
            )}
          </div>
        )
      };
    }
    
    // For PENDING or no data - show placeholders
    return {
      invoice: (
        <div className="text-sm text-slate-400 dark:text-slate-500">—</div>
      ),
      commission: (
        <div className="text-sm text-slate-400 dark:text-slate-500">—</div>
      )
    };
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

      {/* ✅ ORPHAN FIX: Show incomplete extractions with delete option */}
      {(() => {
        const orphanFiles = (statements || []).filter(statement => 
          ['failed', 'processing'].includes(statement.status.toLowerCase())
        );
        
        if (orphanFiles.length === 0) return null;
        
        return (
          <div className="mb-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-600 rounded-xl">
            <div className="flex items-center gap-3 mb-3">
              <AlertTriangle className="text-yellow-600 dark:text-yellow-400" size={20} />
              <h3 className="text-sm font-semibold text-yellow-800 dark:text-yellow-200">
                ⚠️ Incomplete Extractions ({orphanFiles.length})
              </h3>
            </div>
            <p className="text-xs text-yellow-700 dark:text-yellow-300 mb-3">
              These files did not complete extraction. You can delete them to re-upload.
            </p>
            <div className="space-y-2">
              {orphanFiles.map(file => (
                <div key={file.id} className="flex items-center justify-between bg-white dark:bg-slate-800 p-2 rounded border border-yellow-200 dark:border-yellow-700">
                  <div className="flex items-center gap-2 flex-1">
                    <FileText size={16} className="text-yellow-600 dark:text-yellow-400 flex-shrink-0" />
                    <span className="text-sm text-slate-700 dark:text-slate-300 truncate">{file.file_name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      file.status.toLowerCase() === 'failed' 
                        ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300' 
                        : 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300'
                    }`}>
                      {file.status}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      if (window.confirm(`Delete ${file.file_name}? This will allow you to re-upload it.`)) {
                        onDelete([file.id]);
                      }
                    }}
                    className="text-xs px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 transition-colors flex-shrink-0 ml-2"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

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
              {/* Use validStatements (filtered for valid statuses) */}
              {validStatements.length}
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
              {/* Count only valid Approved statements */}
              {validStatements.filter(s => s.status === 'Approved').length}
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
            <span>Pending Review</span>
            <span className="text-xs bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300 px-2 py-1 rounded-full">
              {/* Count only valid needs_review statements */}
              {validStatements.filter(s => s.status === 'needs_review').length}
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
                
                {/* NEW COLUMN: Total Invoice */}
                <th className="py-3 px-4 text-right">
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                    Total Invoice
                  </span>
                </th>
                
                {/* NEW COLUMN: Earned Commission */}
                <th className="py-3 px-4 text-right">
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                    Earned Commission
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

                    {/* NEW: Total Invoice Column */}
                    <td className="py-3 px-4 text-right">
                      {renderCommissionCell(statement).invoice}
                    </td>

                    {/* NEW: Earned Commission Column */}
                    <td className="py-3 px-4 text-right">
                      {renderCommissionCell(statement).commission}
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
