import React, { useState } from 'react';
import { Eye, LayoutList } from "lucide-react";

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
};

export default function CarrierStatementsTable({ statements, setStatements, onPreview, onCompare, onDelete }: Props) {
  const [selectedStatements, setSelectedStatements] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);

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
    <div className="overflow-x-auto">
      <div className="flex justify-between items-center mb-3">
        {selectedStatements.size > 0 && (
          <button
            onClick={handleDelete}
            className="px-4 py-2 bg-red-600 text-white rounded font-semibold hover:bg-red-700 transition"
          >
            Delete Selected
          </button>
        )}
      </div>
      <table className="w-full text-left rounded-lg overflow-hidden">
        <thead>
          <tr className="text-gray-600 font-semibold bg-blue-50">
            <th className="p-2">
              <input
                type="checkbox"
                checked={selectAll}
                onChange={handleSelectAllChange}
                className="mr-2"
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
            <tr key={statement.id} className="hover:bg-blue-50 transition">
              <td className="p-2">
                <input
                  type="checkbox"
                  checked={selectedStatements.has(statement.id)}
                  onChange={() => handleCheckboxChange(statement.id)}
                  className="mr-2"
                />
              </td>
              <td className="p-2">{statement.file_name}</td>
              <td className="p-2">{new Date(statement.uploaded_at).toLocaleDateString()}</td>
              <td className="p-2">
                <span className={
                  statement.status === "Approved"
                    ? "bg-green-100 text-green-700 px-2 py-1 rounded-md"
                    : statement.status === "Rejected"
                      ? "bg-red-100 text-red-700 px-2 py-1 rounded-md"
                      : "bg-yellow-100 text-yellow-700 px-2 py-1 rounded-md"
                }>
                  {statement.status}
                </span>
              </td>
              <td className="p-2">{statement.rejection_reason || "-"}</td>
              <td className="p-2 flex gap-2 justify-center">
                <button
                  title="View mapped table"
                  className="text-blue-600 hover:bg-blue-100 p-1 rounded"
                  onClick={() => onPreview(idx)}
                >
                  <Eye size={18} />
                </button>
                <button
                  title="Compare mapped & extracted"
                  className="text-purple-600 hover:bg-purple-100 p-1 rounded"
                  onClick={() => onCompare(idx)}
                >
                  <LayoutList size={18} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
