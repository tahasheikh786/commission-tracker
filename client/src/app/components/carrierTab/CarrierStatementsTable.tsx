import React, { useState } from 'react';
import { Eye, LayoutList } from "lucide-react";
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
  setStatements: React.Dispatch<React.SetStateAction<Statement[]>>;  // Corrected type for setStatements
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
      onDelete(idsToDelete);  // Trigger the delete function passed from the parent component
      setSelectedStatements(new Set());  // Clear selected checkboxes after delete
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

  return (
    <div className="overflow-x-auto relative">
      {deleting && (
        <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center z-10">
          <div className="flex items-center space-x-2">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-600"></div>
            <span className="text-gray-700 font-medium">Deleting statements...</span>
          </div>
        </div>
      )}
      <div className="flex justify-between items-center mb-3">
        {selectedStatements.size > 0 && (
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="px-4 py-2 bg-red-600 text-white rounded font-semibold hover:bg-red-700 transition focus:outline-none focus:ring-2 focus:ring-red-400 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Delete selected statements"
          >
            {deleting ? 'Deleting...' : 'Delete Selected'}
          </button>
        )}
      </div>
      <table className="w-full text-left rounded-lg overflow-hidden shadow border bg-white" role="table" aria-label="Carrier statements">
        <thead>
          <tr className="text-gray-600 font-semibold bg-blue-50">
                          <th className="p-2">
                <input
                  type="checkbox"
                  checked={selectAll}
                  onChange={handleSelectAllChange}
                  disabled={deleting}
                  className="mr-2 accent-blue-600 w-4 h-4 disabled:opacity-50"
                  aria-label="Select all statements"
                />
              </th>
            <th className="p-2">Statement</th>
            <th className="p-2">Uploaded On</th>
            <th className="p-2">Status</th>
            <th className="p-2">Rejection Reason</th>
            <th className="p-2 text-center">Actions</th>
          </tr>
        </thead>
        <tbody>
          {statements.map((statement, idx) => (
            <tr key={statement.id} className="hover:bg-blue-50 transition focus-within:bg-blue-100">
              <td className="p-2">
                <input
                  type="checkbox"
                  checked={selectedStatements.has(statement.id)}
                  onChange={() => handleCheckboxChange(statement.id)}
                  disabled={deleting}
                  className="mr-2 accent-blue-600 w-4 h-4 disabled:opacity-50"
                  aria-label={`Select statement ${statement.file_name}`}
                />
              </td>
              <td className="p-2">{statement.file_name}</td>
              <td className="p-2">{new Date(statement.uploaded_at).toLocaleDateString()}</td>
              <td className="p-2">
                <span className={
                  statement.status === "Approved" || statement.status === "completed"
                    ? "bg-green-100 text-green-700 px-2 py-1 rounded-md"
                    : statement.status === "Rejected" || statement.status === "rejected"
                      ? "bg-red-100 text-red-700 px-2 py-1 rounded-md"
                      : "bg-yellow-100 text-yellow-700 px-2 py-1 rounded-md"
                }>
                  {statement.status === "extracted" || statement.status === "success" || statement.status === "pending" ? "Pending" : statement.status}
                </span>
              </td>
              <td className="p-2">{statement.rejection_reason || "-"}</td>
              <td className="p-2 flex gap-2 justify-center">
                {/* Show eye icon only for approved/rejected statements */}
                {(statement.status === "Approved" || statement.status === "completed" || statement.status === "Rejected" || statement.status === "rejected") && (
                  <button
                    title="View mapped table"
                    className="text-blue-600 hover:bg-blue-100 p-1 rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
                    onClick={() => onPreview(idx)}
                    aria-label={`View mapped table for ${statement.file_name}`}
                  >
                    <Eye size={18} />
                  </button>
                )}
                <button
                  title="Compare mapped & extracted"
                  className="text-purple-600 hover:bg-purple-100 p-1 rounded focus:outline-none focus:ring-2 focus:ring-purple-400"
                  onClick={() => onCompare(idx)}
                  aria-label={`Compare mapped and extracted for ${statement.file_name}`}
                >
                  <LayoutList size={18} />
                </button>
                {(statement.status === "Pending" || statement.status === "pending" || statement.status === "extracted" || statement.status === "success") && (
                  <button
                    onClick={() => router.push(`/upload?resume=${statement.id}`)}
                    className="px-3 py-1 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors"
                    title="Complete Review"
                  >
                    Complete Review
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
