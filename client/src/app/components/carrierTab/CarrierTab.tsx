'use client'
import React, { useEffect, useState } from "react";
import CarrierList from "./CarrierList";
import CarrierStatementsTable from "./CarrierStatementsTable";
import EditMappingModal from "./EditMappingModal";
import CompareModal from "./CompareModal";
import StatementPreviewModal from "./StatementPreviewModal";

// Loader component (minimalist, can reuse elsewhere)
function Loader({ className = "" }: { className?: string }) {
  return (
    <div className={"flex justify-center items-center w-full py-12 " + className}>
      <svg className="animate-spin h-8 w-8 text-blue-600" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
      </svg>
      <span className="ml-3 text-blue-700 font-medium animate-pulse">Loading...</span>
    </div>
  );
}

type Carrier = { id: string; name: string };
type Statement = {
  id: string;
  file_name: string;
  uploaded_at: string;
  status: string;
  final_data?: any[];
  field_config?: any[];
  raw_data?: any[];
  rejection_reason?: string;
};

export default function CarrierTab() {
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [selected, setSelected] = useState<Carrier | null>(null);
  const [statements, setStatements] = useState<Statement[]>([]);
  const [showEditMapping, setShowEditMapping] = useState(false);
  const [showPreviewIdx, setShowPreviewIdx] = useState<number | null>(null);
  const [showCompareIdx, setShowCompareIdx] = useState<number | null>(null);
  const [loadingCarriers, setLoadingCarriers] = useState(true);
  const [loadingStatements, setLoadingStatements] = useState(false);

  // Fetch carriers on mount
  useEffect(() => {
    setLoadingCarriers(true);
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/companies/`)
      .then(r => r.json())
      .then(setCarriers)
      .finally(() => setLoadingCarriers(false));
  }, []);

  // Fetch statements for selected carrier
  useEffect(() => {
    if (!selected) {
      setStatements([]);
      return;
    }
    setLoadingStatements(true);
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/companies/${selected.id}/statements/`)
      .then(r => r.json())
      .then(setStatements)
      .finally(() => setLoadingStatements(false));
  }, [selected]);

  // Handle deletion of selected statements
  const handleDelete = (ids: string[]) => {
    if (!selected) return;  // Make sure a carrier is selected before proceeding
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/companies/${selected.id}/statements`, {  // Use company_id from selected
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ statement_ids: ids }),  // Properly passing statement_ids
    })
      .then(() => {
        setStatements(statements.filter(statement => !ids.includes(statement.id)));  // Remove deleted statements from state
      })
      .catch((error) => {
        console.error('Error deleting statements:', error);
      });
  };

  const handleCarrierDelete = (ids: string[]) => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/companies`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ company_ids: ids }),
    })
      .then(() => {
        setCarriers(carriers.filter(carrier => !ids.includes(carrier.id)));
      })
      .catch((error) => {
        console.error('Error deleting carriers:', error);
      });
  };
  
  

  return (
    <div className="w-full max-w-[1600px] mx-auto flex flex-col md:flex-row gap-10 px-2 md:px-10 py-6">
      <CarrierList
        carriers={carriers}
        selected={selected}
        onSelect={c => {
          setSelected(c);
          // Update the carrier in the list if name changed
          setCarriers(prev => prev.map(car => car.id === c.id ? { ...car, name: c.name } : car));
        }}
        loading={loadingCarriers}
        onDelete={handleCarrierDelete} 
      />
      <div className="flex-1 bg-white/80 rounded-2xl shadow p-6 min-h-[320px]">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-3 gap-3">
          <div className="text-2xl font-bold text-blue-900">
            {selected?.name || "Select a carrier"}
          </div>
          {selected && (
            <button
              className="px-4 py-2 bg-violet-600 text-white rounded font-semibold hover:bg-violet-700 transition"
              onClick={() => setShowEditMapping(true)}
            >
              Edit Mappings
            </button>
          )}
        </div>
        {loadingStatements ? (
          <Loader />
        ) : (
          <CarrierStatementsTable
            statements={statements}
            setStatements={setStatements}
            onPreview={setShowPreviewIdx}
            onCompare={setShowCompareIdx}
            onDelete={handleDelete}  // Pass delete handler here
          />
        )}
      </div>
      {/* Modals */}
      {showEditMapping && selected && (
        <EditMappingModal
          carrier={selected}
          onClose={() => setShowEditMapping(false)}
        />
      )}
      {showPreviewIdx !== null && statements[showPreviewIdx] && (
        <StatementPreviewModal
          statement={statements[showPreviewIdx]}
          onClose={() => setShowPreviewIdx(null)}
        />
      )}
      {showCompareIdx !== null && statements[showCompareIdx] && (
        <CompareModal
          statement={statements[showCompareIdx]}
          onClose={() => setShowCompareIdx(null)}
        />
      )}
    </div>
  );
}
