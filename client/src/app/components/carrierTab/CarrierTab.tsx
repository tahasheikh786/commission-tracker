'use client'
import React, { useEffect, useState } from "react";
import CarrierList from "./CarrierList";
import CarrierStatementsTable from "./CarrierStatementsTable";
import EditMappingModal from "./EditMappingModal";
import CompareModal from "./CompareModal";
import StatementPreviewModal from "./StatementPreviewModal";
import DatabaseFieldsManager from "./DatabaseFieldsManager";
import PlanTypesManager from "./PlanTypesManager";
import toast from 'react-hot-toast';
import Loader from "@/app/upload/components/Loader";

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
  const [deletingCarriers, setDeletingCarriers] = useState(false);
  const [activeTab, setActiveTab] = useState<'carriers' | 'database-fields' | 'plan-types'>('carriers');

  // Fetch carriers on mount
  useEffect(() => {
    setLoadingCarriers(true);
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/companies/`)
      .then(r => r.json())
      .then((data) => {
        // Sort carriers alphabetically by name
        const sortedCarriers = data.sort((a: Carrier, b: Carrier) => 
          a.name.localeCompare(b.name)
        );
        setCarriers(sortedCarriers);
      })
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
    if (!selected) return;
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/companies/${selected.id}/statements/`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ statement_ids: ids }),
    })
      .then(res => {
        if (!res.ok) throw new Error('Failed to delete statements');
        setStatements(statements.filter(statement => !ids.includes(statement.id)));
        toast.success('Statements deleted successfully!');
      })
      .catch((error) => {
        console.error('Delete statements error:', error);
        toast.error('Error deleting statements.');
      });
  };

  const handleCarrierDelete = (ids: string[]) => {
    setDeletingCarriers(true);
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/companies/`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ company_ids: ids }),
    })
      .then(async res => {
        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.detail || 'Failed to delete carriers');
        }
        const result = await res.json();
        setCarriers(carriers.filter(carrier => !ids.includes(carrier.id)));
        toast.success(result.message || 'Carriers deleted successfully!');
      })
      .catch((error) => {
        console.error('Delete error:', error);
        toast.error(error.message || 'Error deleting carriers.');
      })
      .finally(() => {
        setDeletingCarriers(false);
      });
  };
  
  

  return (
    <div className="w-full max-w-[1600px] mx-auto px-2 md:px-10 py-6">
      {/* Tab Navigation */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('carriers')}
          className={`px-4 py-2 rounded-md font-medium transition ${
            activeTab === 'carriers'
              ? 'bg-white text-blue-600 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Carriers
        </button>
        <button
          onClick={() => setActiveTab('database-fields')}
          className={`px-4 py-2 rounded-md font-medium transition ${
            activeTab === 'database-fields'
              ? 'bg-white text-blue-600 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Database Fields
        </button>
        <button
          onClick={() => setActiveTab('plan-types')}
          className={`px-4 py-2 rounded-md font-medium transition ${
            activeTab === 'plan-types'
              ? 'bg-white text-blue-600 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Add Plan Types
        </button>
      </div>

      {activeTab === 'carriers' ? (
        <div className="flex flex-col md:flex-row gap-10">
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
            deleting={deletingCarriers}
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
        </div>
      ) : activeTab === 'database-fields' ? (
        <DatabaseFieldsManager />
      ) : (
        <PlanTypesManager />
      )}
      {/* Modals */}
      {showEditMapping && selected && (
        <EditMappingModal
          company={selected}
          onClose={() => setShowEditMapping(false)}
          onSave={(mapping, fields, planTypes) => {
            // Handle save logic here
            console.log('Saving mapping:', { mapping, fields, planTypes });
            setShowEditMapping(false);
            toast.success('Mapping saved successfully!');
          }}
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
          // highlightedRow={highlightedRow}
          // onRowHover={setHighlightedRow}
        />
      )}
    </div>
  );
}
