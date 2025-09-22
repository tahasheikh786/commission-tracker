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
import { Database, Settings, Plus, Search, Filter, Sparkles, Building2, FileText, DollarSign, TrendingUp, Users, Eye, EyeOff } from "lucide-react";
import { useSubmission } from "@/context/SubmissionContext";
import { useUserSpecificCompanies } from "@/app/hooks/useDashboard";
import { useAuth } from "@/context/AuthContext";

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
  selected_statement_date?: any;
};

interface CommissionStats {
  carrier_name: string;
  total_invoice: number;
  total_commission: number;
  total_companies: number;
  total_statements: number;
}

export default function CarrierTab() {
  const { triggerDashboardRefresh } = useSubmission();
  const { permissions } = useAuth();
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
  const [commissionStats, setCommissionStats] = useState<CommissionStats | null>(null);
  const [loadingCommission, setLoadingCommission] = useState(false);
  const [viewAllData, setViewAllData] = useState(false);
  
  // Determine if user can edit data (admin can edit even in "All Data" mode)
  const canEditData = !viewAllData || permissions?.is_admin;

  // Fetch user-specific companies
  const { companies: userSpecificCompanies, loading: userCompaniesLoading, refetch: refetchUserCompanies } = useUserSpecificCompanies();

  // Fetch carriers on mount and when view toggle changes
  useEffect(() => {
    setLoadingCarriers(true);
    
    if (viewAllData) {
      // Fetch all companies
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
    } else {
      // Use user-specific companies
      if (userSpecificCompanies !== null && userSpecificCompanies !== undefined) {
        const sortedCarriers = userSpecificCompanies.sort((a: Carrier, b: Carrier) => 
          a.name.localeCompare(b.name)
        );
        setCarriers(sortedCarriers);
        setLoadingCarriers(false);
      }
    }
  }, [viewAllData, userSpecificCompanies]);

  // Fetch statements for selected carrier
  useEffect(() => {
    if (!selected) {
      setStatements([]);
      setCommissionStats(null);
      return;
    }
    setLoadingStatements(true);
    
    const endpoint = viewAllData 
      ? `${process.env.NEXT_PUBLIC_API_URL}/companies/${selected.id}/statements/`
      : `${process.env.NEXT_PUBLIC_API_URL}/companies/user-specific/${selected.id}/statements`;
    
    fetch(endpoint)
      .then(r => r.json())
      .then(data => setStatements(Array.isArray(data) ? data : []))
      .catch(error => {
        console.error('Error fetching statements:', error);
        setStatements([]);
      })
      .finally(() => setLoadingStatements(false));
  }, [selected, viewAllData]);

  // Fetch commission data for selected carrier
  useEffect(() => {
    if (!selected) {
      setCommissionStats(null);
      return;
    }
    
    setLoadingCommission(true);
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/earned-commission/carrier/${selected.id}/stats`)
      .then(r => r.json())
      .then((data) => {
        setCommissionStats(data);
      })
      .catch((error) => {
        console.error('Error fetching commission stats:', error);
        setCommissionStats(null);
      })
      .finally(() => setLoadingCommission(false));
  }, [selected]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount);
  };

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
        // Trigger global dashboard refresh after successful deletion
        triggerDashboardRefresh();
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
      description: 'Manage carriers and statements',
      gradient: 'from-violet-500 to-purple-600'
    },
    {
      id: 'database-fields' as const,
      label: 'Database Fields',
      icon: Settings,
      description: 'Configure field mappings',
      gradient: 'from-blue-500 to-indigo-600'
    },
    {
      id: 'plan-types' as const,
      label: 'Plan Types',
      icon: Plus,
      description: 'Add and manage plan types',
      gradient: 'from-emerald-500 to-teal-600'
    }
  ];
  
  return (
    <div className="w-full space-y-8">
      {/* Enhanced Header */}
      <div className="text-center space-y-4">
        <div className="flex items-center justify-center gap-3">
          <Sparkles className="text-violet-500" size={24} />
          <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-800 via-slate-700 to-slate-600 bg-clip-text text-transparent">
            Carrier Management
          </h1>
          <Sparkles className="text-purple-500" size={24} />
        </div>
        <p className="text-lg text-slate-600 max-w-3xl mx-auto leading-relaxed">
          Manage carriers, statements, and configure field mappings for optimal data processing
          {viewAllData && !permissions?.is_admin && (
            <span className="block mt-2 text-sm font-medium text-amber-600 bg-amber-50 px-3 py-1 rounded-full inline-block">
              🔒 Read-Only Mode - Viewing all company data
            </span>
          )}
          {viewAllData && permissions?.is_admin && (
            <span className="block mt-2 text-sm font-medium text-green-600 bg-green-50 px-3 py-1 rounded-full inline-block">
              👑 Admin Mode - Full access to all company data
            </span>
          )}
        </p>

        {/* View Toggle - Only show for carriers tab */}
        {activeTab === 'carriers' && (
          <div className="flex justify-center">
            <div className="flex items-center gap-3 bg-white/90 backdrop-blur-xl rounded-2xl border border-white/50 shadow-lg p-2">
              <button
                onClick={() => setViewAllData(false)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all duration-200 ${
                  !viewAllData
                    ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Eye className="w-4 h-4" />
                My Data
              </button>
              <button
                onClick={() => setViewAllData(true)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all duration-200 ${
                  viewAllData
                    ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <EyeOff className="w-4 h-4" />
                All Data (Read-Only)
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Enhanced Tab Navigation */}
      <div className="flex items-center justify-center">
        <div className="flex items-center gap-2 bg-slate-100/80 backdrop-blur-sm rounded-2xl p-2 shadow-inner">
          {tabConfig.map((tabItem) => {
            const Icon = tabItem.icon;
            const isActive = activeTab === tabItem.id;
            
            return (
              <button
                key={tabItem.id}
                onClick={() => setActiveTab(tabItem.id)}
                className={`group relative flex items-center gap-3 px-6 py-3 rounded-xl font-semibold transition-all duration-300 ${
                  isActive 
                    ? `bg-gradient-to-r ${tabItem.gradient} text-white shadow-lg transform scale-105` 
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/70 hover:shadow-md'
                }`}
              >
                <Icon size={18} className={`transition-transform duration-200 ${isActive ? 'scale-110' : 'group-hover:scale-105'}`} />
                <span>{tabItem.label}</span>
                {isActive && (
                  <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-white rounded-full shadow-sm"></div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === 'carriers' ? (
        <div className="flex gap-8">
          {/* Enhanced Carrier List - Wider Sidebar */}
          <div className="w-96 flex-shrink-0">
            <CarrierList
              carriers={carriers}
              selected={selected}
              onSelect={c => {
                setSelected(c);
                // Update the carrier in the list if name changed
                setCarriers(prev => prev.map(car => car.id === c.id ? { ...car, name: c.name } : car));
              }}
              loading={loadingCarriers || userCompaniesLoading}
              onDelete={handleCarrierDelete}
              deleting={deletingCarriers}
              readOnly={!canEditData}
            />
          </div>
          
          {/* Enhanced Statements Panel - Main Content */}
          <div className="flex-1 min-w-0">
            <div className="bg-white/90 backdrop-blur-xl rounded-3xl border border-white/50 shadow-2xl overflow-hidden">
              <div className="p-6 border-b border-slate-200/50 bg-gradient-to-r from-slate-50/50 to-slate-100/50">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
                      <Building2 className="text-violet-600" size={24} />
                      {selected?.name || "Select a carrier"}
                    </h2>
                    {selected && (
                      <p className="text-sm text-slate-600 mt-2 flex items-center gap-2">
                        <FileText className="text-slate-400" size={16} />
                        {statements.length} statement{statements.length !== 1 ? 's' : ''} found
                      </p>
                    )}
                  </div>
                  
                  {selected && (
                    <button
                      disabled={!canEditData}
                      className={`inline-flex items-center gap-3 px-6 py-3 rounded-2xl transition-all duration-200 font-semibold ${
                        !canEditData
                          ? 'bg-slate-300 text-slate-500 cursor-not-allowed opacity-50'
                          : 'bg-gradient-to-r from-violet-500 to-purple-600 text-white hover:shadow-lg hover:scale-105'
                      }`}
                      onClick={() => setShowEditMapping(true)}
                      title={!canEditData ? "Read-only mode - switch to 'My Data' to edit" : "Edit carrier mappings"}
                    >
                      <Settings size={18} />
                      Edit Mappings
                    </button>
                  )}
                </div>
              </div>
              
              {/* Commission Stats Display */}
              {selected && (
                <div className="px-6 py-4 border-b border-slate-200/50 bg-gradient-to-r from-green-50/50 to-blue-50/50">
                  {loadingCommission ? (
                    <div className="flex items-center gap-3">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                      <span className="text-slate-600">Loading commission data...</span>
                    </div>
                  ) : commissionStats ? (
                    <div className="grid grid-cols-3 gap-6">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                          <DollarSign className="text-green-600" size={18} />
                        </div>
                        <div>
                          <p className="text-sm text-slate-600">Total Commission</p>
                          <p className="font-bold text-green-700 text-lg">{formatCurrency(commissionStats.total_commission)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                          <TrendingUp className="text-blue-600" size={18} />
                        </div>
                        <div>
                          <p className="text-sm text-slate-600">Total Invoice</p>
                          <p className="font-bold text-blue-700 text-lg">{formatCurrency(commissionStats.total_invoice)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                          <Users className="text-purple-600" size={18} />
                        </div>
                        <div>
                          <p className="text-sm text-slate-600">Total Companies</p>
                          <p className="font-bold text-purple-700 text-lg">{commissionStats.total_companies}</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-2">
                      <p className="text-slate-500 text-sm">No commission data available for this carrier</p>
                    </div>
                  )}
                </div>
              )}
              
              <div className="p-6">
                {loadingStatements ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 border-2 border-slate-200 border-t-violet-500 rounded-full animate-spin"></div>
                      <span className="text-slate-600 font-medium">Loading statements...</span>
                    </div>
                  </div>
                ) : selected ? (
                  <CarrierStatementsTable
                    statements={statements}
                    setStatements={setStatements}
                    onPreview={setShowPreviewIdx}
                    onCompare={setShowCompareIdx}
                    onDelete={handleDelete}
                    deleting={deletingStatements}
                    readOnly={!canEditData}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="w-20 h-20 bg-gradient-to-r from-violet-100 to-purple-100 rounded-3xl flex items-center justify-center mb-6">
                      <Database className="text-violet-500" size={40} />
                    </div>
                    <h3 className="text-xl font-bold text-slate-700 mb-3">
                      No Carrier Selected
                    </h3>
                    <p className="text-slate-600 text-lg max-w-md leading-relaxed">
                      Select a carrier from the list to view and manage their statements
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : activeTab === 'database-fields' ? (
        <div className="bg-white/90 backdrop-blur-xl rounded-3xl border border-white/50 shadow-2xl overflow-hidden">
          <div className="p-6 border-b border-slate-200/50 bg-gradient-to-r from-slate-50/50 to-slate-100/50">
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
              <Settings className="text-blue-600" size={24} />
              Database Fields Configuration
            </h2>
            <p className="text-slate-600 mt-2">Configure field mappings for data extraction and processing</p>
          </div>
          <div className="p-6">
            <DatabaseFieldsManager />
          </div>
        </div>
      ) : (
        <div className="bg-white/90 backdrop-blur-xl rounded-3xl border border-white/50 shadow-2xl overflow-hidden">
          <div className="p-6 border-b border-slate-200/50 bg-gradient-to-r from-slate-50/50 to-slate-100/50">
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
              <Plus className="text-emerald-600" size={24} />
              Plan Types Management
            </h2>
            <p className="text-slate-600 mt-2">Add and manage plan types for commission tracking</p>
          </div>
          <div className="p-6">
            <PlanTypesManager />
          </div>
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
        />
      )}
    </div>
  );
}
