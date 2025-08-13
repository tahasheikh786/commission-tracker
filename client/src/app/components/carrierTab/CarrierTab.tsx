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
import { TableLoader, CardLoader } from "@/app/upload/components/Loader";
import { Database, Settings, Plus, Search, Filter } from "lucide-react";

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
  const [deletingStatements, setDeletingStatements] = useState(false);
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
    setDeletingStatements(true);
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
      })
      .finally(() => {
        setDeletingStatements(false);
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

  const tabConfig = [
    {
      id: 'carriers' as const,
      label: 'Carriers',
      icon: Database,
      description: 'Manage carriers and statements'
    },
    {
      id: 'database-fields' as const,
      label: 'Database Fields',
      icon: Settings,
      description: 'Configure field mappings'
    },
    {
      id: 'plan-types' as const,
      label: 'Plan Types',
      icon: Plus,
      description: 'Add and manage plan types'
    }
  ];
  
  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-6 animate-fade-in">
      {/* Enhanced Header */}
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent mb-2">
          Carrier Management
        </h1>
        <p className="text-gray-600 text-lg">
          Manage your carriers, review statements, and configure system settings
        </p>
      </div>

      {/* Enhanced Tab Navigation */}
      <div className="flex justify-center mb-8">
        <div className="glass rounded-2xl shadow-lg p-2 max-w-4xl w-full">
          <div className="flex gap-2">
            {tabConfig.map((tabItem) => {
              const Icon = tabItem.icon;
              const isActive = activeTab === tabItem.id;
              
              return (
                <button
                  key={tabItem.id}
                  onClick={() => setActiveTab(tabItem.id)}
                  className={`flex-1 flex items-center gap-3 px-6 py-4 rounded-xl font-medium transition-all duration-300 group relative overflow-hidden ${
                    isActive 
                      ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg transform scale-105' 
                      : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
                  }`}
                >
                  <Icon 
                    size={20} 
                    className={`transition-transform duration-300 ${
                      isActive ? 'text-white' : 'text-gray-500 group-hover:text-gray-700'
                    } ${isActive ? 'scale-110' : 'group-hover:scale-105'}`}
                  />
                  
                  <div className="text-left">
                    <div className={`font-semibold ${isActive ? 'text-white' : 'text-gray-800'}`}>
                      {tabItem.label}
                    </div>
                    <div className={`text-xs ${isActive ? 'text-white/80' : 'text-gray-500'}`}>
                      {tabItem.description}
                    </div>
                  </div>
                  
                  {/* Active indicator */}
                  {isActive && (
                    <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-8 h-1 bg-white rounded-full"></div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {activeTab === 'carriers' ? (
        <div className="flex flex-col lg:flex-row gap-8 animate-slide-in">
          {/* Enhanced Carrier List */}
          <div className="lg:w-1/3">
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
          </div>
          
          {/* Enhanced Statements Panel */}
          <div className="lg:flex-1">
            <div className="card p-8 min-h-[500px]">
              <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 gap-4">
                <div>
                  <h2 className="text-3xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent">
                    {selected?.name || "Select a carrier"}
                  </h2>
                  {selected && (
                    <p className="text-gray-600 mt-1">
                      {statements.length} statement{statements.length !== 1 ? 's' : ''} found
                    </p>
                  )}
                </div>
                
                {selected && (
                  <div className="flex gap-3">
                    <button
                      className="btn btn-secondary px-6 py-3"
                      onClick={() => setShowEditMapping(true)}
                    >
                      <Settings size={18} className="mr-2" />
                      Edit Mappings
                    </button>
                  </div>
                )}
              </div>
              
              {loadingStatements ? (
                <TableLoader />
              ) : selected ? (
                <CarrierStatementsTable
                  statements={statements}
                  setStatements={setStatements}
                  onPreview={setShowPreviewIdx}
                  onCompare={setShowCompareIdx}
                  onDelete={handleDelete}
                  deleting={deletingStatements}
                />
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Database className="text-gray-300 mb-4" size={64} />
                  <h3 className="text-xl font-semibold text-gray-600 mb-2">
                    No Carrier Selected
                  </h3>
                  <p className="text-gray-500 max-w-md">
                    Select a carrier from the list to view and manage their statements
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : activeTab === 'database-fields' ? (
        <div className="animate-slide-in">
          <DatabaseFieldsManager />
        </div>
      ) : (
        <div className="animate-slide-in">
          <PlanTypesManager />
        </div>
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
