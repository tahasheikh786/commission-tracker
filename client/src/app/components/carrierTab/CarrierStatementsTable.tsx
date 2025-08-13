import React, { useState } from 'react';
import { Eye, LayoutList, Trash2, CheckCircle, XCircle, Clock, FileText, ExternalLink } from "lucide-react";
import { useRouter } from 'next/navigation';

type Statement = {
  id: string;
  file_name: string;
  uploaded_at: string;
  status: string;
  rejection_reason?: string;
};

type Props = {
  statements: Statement[];
  setStatements: React.Dispatch<React.SetStateAction<Statement[]>>;
  onPreview: (idx: number) => void;
  onCompare: (idx: number) => void;
  onDelete: (ids: string[]) => void;
  deleting?: boolean;
};

export default function CarrierStatementsTable({ statements, setStatements, onPreview, onCompare, onDelete, deleting }: Props) {
  const [selectedStatements, setSelectedStatements] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const router = useRouter();

  const handleCheckboxChange = (id: string) => {
    const newSelectedStatements = new Set(selectedStatements);
    if (newSelectedStatements.has(id)) {
      newSelectedStatements.delete(id);
    } else {
      newSelectedStatements.add(id);
    }
    setSelectedStatements(newSelectedStatements);
  };

  const handleDelete = () => {
    if (selectedStatements.size > 0) {
      const idsToDelete = Array.from(selectedStatements);
      onDelete(idsToDelete);
      setSelectedStatements(new Set());
    }
  };

  const handleSelectAllChange = () => {
    const newSelectedStatements = new Set<string>();
    if (!selectAll) {
      statements.forEach(statement => newSelectedStatements.add(statement.id));
    }
    setSelectedStatements(newSelectedStatements);
    setSelectAll(!selectAll);
  };

  const getStatusInfo = (status: string) => {
    switch (status.toLowerCase()) {
      case 'approved':
      case 'completed':
        return {
          label: 'Approved',
          color: 'success',
          icon: CheckCircle,
          bgColor: 'bg-success/10',
          textColor: 'text-success',
          borderColor: 'border-success/20'
        };
      case 'rejected':
        return {
          label: 'Rejected',
          color: 'destructive',
          icon: XCircle,
          bgColor: 'bg-destructive/10',
          textColor: 'text-destructive',
          borderColor: 'border-destructive/20'
        };
      case 'pending':
      case 'extracted':
      case 'success':
      default:
        return {
          label: 'Pending',
          color: 'warning',
          icon: Clock,
          bgColor: 'bg-warning/10',
          textColor: 'text-warning',
          borderColor: 'border-warning/20'
        };
    }
  };

  return (
    <div className="overflow-hidden relative">
      {deleting && (
        <div className="absolute inset-0 bg-white/90 backdrop-blur-sm flex items-center justify-center z-10">
          <div className="flex items-center space-x-3">
            <div className="loading-spinner w-6 h-6"></div>
            <span className="text-gray-700 font-medium">Deleting statements...</span>
          </div>
        </div>
      )}
      
      {/* Enhanced Delete Button */}
      {selectedStatements.size > 0 && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Trash2 className="text-red-600" size={20} />
              <span className="text-red-700 font-medium">
                {selectedStatements.size} statement{selectedStatements.size !== 1 ? 's' : ''} selected for deletion
              </span>
            </div>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="btn btn-destructive px-4 py-2"
            >
              <Trash2 size={16} className="mr-2" />
              {deleting ? 'Deleting...' : 'Delete Selected'}
            </button>
          </div>
        </div>
      )}

      {/* Enhanced Table */}
      <div className="card overflow-hidden">
        <table className="table w-full">
          <thead>
            <tr>
              <th className="p-4 w-12">
                <input
                  type="checkbox"
                  checked={selectAll}
                  onChange={handleSelectAllChange}
                  disabled={deleting}
                  className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                />
              </th>
              <th className="p-4 text-left">
                <div className="flex items-center gap-2">
                  <FileText size={16} className="text-gray-500" />
                  Statement
                </div>
              </th>
              <th className="p-4 text-left">Uploaded On</th>
              <th className="p-4 text-left">Status</th>
              <th className="p-4 text-left">Rejection Reason</th>
              <th className="p-4 text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {statements.map((statement, idx) => {
              const statusInfo = getStatusInfo(statement.status);
              const StatusIcon = statusInfo.icon;
              
              return (
                <tr 
                  key={statement.id} 
                  className="hover:bg-gray-50 transition-colors duration-200 animate-fade-in"
                  style={{ animationDelay: `${idx * 50}ms` }}
                >
                  <td className="p-4">
                    <input
                      type="checkbox"
                      checked={selectedStatements.has(statement.id)}
                      onChange={() => handleCheckboxChange(statement.id)}
                      disabled={deleting}
                      className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                    />
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                        <FileText size={16} className="text-primary" />
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">{statement.file_name}</div>
                        <div className="text-sm text-gray-500">ID: {statement.id.slice(0, 8)}...</div>
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="text-sm text-gray-900">
                      {new Date(statement.uploaded_at).toLocaleDateString()}
                    </div>
                    <div className="text-xs text-gray-500">
                      {new Date(statement.uploaded_at).toLocaleTimeString()}
                    </div>
                  </td>
                  <td className="p-4">
                    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium border ${statusInfo.bgColor} ${statusInfo.textColor} ${statusInfo.borderColor}`}>
                      <StatusIcon size={14} />
                      {statusInfo.label}
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="max-w-xs">
                      {statement.rejection_reason ? (
                        <div className="text-sm text-gray-600 bg-red-50 p-2 rounded border border-red-200">
                          {statement.rejection_reason}
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center justify-center gap-2">
                      {/* Show eye icon only for approved/rejected statements */}
                      {(statement.status === "Approved" || statement.status === "completed" || statement.status === "Rejected" || statement.status === "rejected") && (
                        <button
                          title="View mapped table"
                          className="btn btn-ghost p-2 text-primary hover:bg-primary/10"
                          onClick={() => onPreview(idx)}
                        >
                          <Eye size={16} />
                        </button>
                      )}
                      
                      <button
                        title="Compare mapped & extracted"
                        className="btn btn-ghost p-2 text-secondary hover:bg-secondary/10"
                        onClick={() => onCompare(idx)}
                      >
                        <LayoutList size={16} />
                      </button>
                      
                      {(statement.status === "Pending" || statement.status === "pending" || statement.status === "extracted" || statement.status === "success") && (
                        <button
                          onClick={() => router.push(`/upload?resume=${statement.id}`)}
                          className="btn btn-primary px-3 py-2 text-sm"
                          title="Complete Review"
                        >
                          <ExternalLink size={14} className="mr-1" />
                          Review
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        
        {/* Empty State */}
        {statements.length === 0 && (
          <div className="text-center py-12">
            <FileText className="mx-auto h-12 w-12 text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-600 mb-2">No statements found</h3>
            <p className="text-gray-500">
              Upload statements to see them listed here
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
