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
import axios from 'axios';

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
      // Fetch all companies using axios for proper authentication
      axios.get(`${process.env.NEXT_PUBLIC_API_URL}/companies/`)
        .then((response) => {
          const data = response.data;
          // Sort carriers alphabetically by name
          const sortedCarriers = data.sort((a: Carrier, b: Carrier) => 
            a.name.localeCompare(b.name)
          );
          setCarriers(sortedCarriers);
        })
        .catch((error) => {
          console.error('Error fetching all companies:', error);
          setCarriers([]);
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
    
    axios.get(endpoint)
      .then(response => {
        const data = response.data;
        setStatements(Array.isArray(data) ? data : []);
      })
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
    const endpoint = viewAllData 
      ? `${process.env.NEXT_PUBLIC_API_URL}/earned-commission/carrier/${selected.id}/stats`
      : `${process.env.NEXT_PUBLIC_API_URL}/earned-commission/carrier/user-specific/${selected.id}/stats`;
    
    axios.get(endpoint)
      .then(response => {
        const data = response.data;
        setCommissionStats(data);
      })
      .catch((error) => {
        console.error('Error fetching commission stats:', error);
        setCommissionStats(null);
      })
      .finally(() => setLoadingCommission(false));
  }, [selected, viewAllData]);

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
    <div className="w-full space-y-6">
      {/* Tab Navigation with View Toggle */}
      <div className="flex items-center justify-between gap-4">
        {/* Tab Navigation */}
        <div className="flex items-center gap-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-1">
          {tabConfig.map((tabItem) => {
            const Icon = tabItem.icon;
            const isActive = activeTab === tabItem.id;
            
            return (
              <button
                key={tabItem.id}
                onClick={() => setActiveTab(tabItem.id)}
                className={`flex items-center gap-3 px-6 py-3 rounded-lg font-medium transition-all duration-200 cursor-pointer ${
                  isActive 
                    ? 'bg-blue-500 text-white shadow-sm hover:bg-blue-600' 
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <Icon size={18} />
                <span>{tabItem.label}</span>
              </button>
            );
          })}
        </div>

        {/* View Toggle and Status - Only show for carriers tab */}
        {activeTab === 'carriers' && (
          <div className="flex items-center gap-4">
            {/* Status Indicators */}
            {viewAllData && !permissions?.is_admin && (
              <div className="bg-amber-50 dark:bg-slate-800 border border-amber-200 dark:border-slate-700 rounded-lg px-3 py-2 shadow-sm">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 bg-amber-100 dark:bg-amber-800/50 rounded-full flex items-center justify-center">
                    <EyeOff className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                  </div>
                  <span className="text-xs font-medium text-amber-800 dark:text-amber-200">Read-Only Mode</span>
                </div>
              </div>
            )}
            {viewAllData && permissions?.is_admin && (
              <div className="bg-green-50 dark:bg-slate-800 border border-green-200 dark:border-slate-700 rounded-lg px-3 py-2 shadow-sm">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 bg-green-100 dark:bg-green-800/50 rounded-full flex items-center justify-center">
                    <Sparkles className="w-3 h-3 text-green-600 dark:text-green-400" />
                  </div>
                  <span className="text-xs font-medium text-green-800 dark:text-green-200">Admin Mode</span>
                </div>
              </div>
            )}

            {/* View Toggle Buttons */}
            <div className="flex items-center gap-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-1">
              <button
                onClick={() => setViewAllData(false)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all duration-200 cursor-pointer ${
                  !viewAllData
                    ? 'bg-blue-500 text-white shadow-sm hover:bg-blue-600'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                <Eye className="w-4 h-4" />
                My Data
              </button>
              <button
                onClick={() => setViewAllData(true)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all duration-200 cursor-pointer ${
                  viewAllData
                    ? 'bg-blue-500 text-white shadow-sm hover:bg-blue-600'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                <EyeOff className="w-4 h-4" />
                All Data
              </button>
            </div>
          </div>
        )}
      </div>


              {activeTab === 'carriers' ? (
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Carrier List */}
          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden hover:shadow-md transition-all duration-200">
              <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-slate-50 dark:from-slate-700/30 to-slate-100 dark:to-slate-600/30">
                <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <Database className="text-primary" size={20} />
                  Carriers
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                  {carriers.length} total carriers
                </p>
              </div>
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
          </div>
          
          {/* Statements Panel */}
          <div className="lg:col-span-3">
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden hover:shadow-md transition-all duration-200">
              <div className="p-6 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-slate-50 dark:from-slate-700/30 to-slate-100 dark:to-slate-600/30">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200 flex items-center gap-3">
                      <Building2 className="text-blue-600" size={20} />
                      {selected?.name || "Select a carrier"}
                    </h2>
                    {selected && (
                      <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 flex items-center gap-2">
                        <FileText className="text-slate-500 dark:text-slate-400" size={14} />
                        {statements.length} statement{statements.length !== 1 ? 's' : ''} found
                      </p>
                    )}
                  </div>
                  
                  {selected && (
                    <button
                      disabled={!canEditData}
                      className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-200 font-medium ${
                        !canEditData
                          ? 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 cursor-not-allowed opacity-50'
                          : 'bg-blue-500 text-white hover:bg-blue-600 cursor-pointer'
                      }`}
                      onClick={() => setShowEditMapping(true)}
                      title={!canEditData ? "Read-only mode - switch to 'My Data' to edit" : "Edit carrier mappings"}
                    >
                      <Settings size={16} />
                      Edit Mappings
                    </button>
                  )}
                </div>
              </div>
              
              {/* Commission Stats Display */}
              {selected && (
                <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/30">
                  {loadingCommission ? (
                    <div className="flex items-center gap-3">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                      <span className="text-slate-600 dark:text-slate-400">Loading commission data...</span>
                    </div>
                  ) : commissionStats ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/30">
                        <div className="w-10 h-10 bg-green-100 dark:bg-green-800/50 rounded-lg flex items-center justify-center shadow-sm">
                          <DollarSign className="text-green-600 dark:text-green-400" size={18} />
                        </div>
                        <div>
                          <p className="text-sm text-slate-600 dark:text-slate-400">Total Commission</p>
                          <p className="font-bold text-green-700 dark:text-green-400 text-lg">{formatCurrency(commissionStats.total_commission)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/30">
                        <div className="w-10 h-10 bg-blue-100 dark:bg-blue-800/50 rounded-lg flex items-center justify-center shadow-sm">
                          <TrendingUp className="text-blue-600 dark:text-blue-400" size={18} />
                        </div>
                        <div>
                          <p className="text-sm text-slate-600 dark:text-slate-400">Total Invoice</p>
                          <p className="font-bold text-blue-700 dark:text-blue-400 text-lg">{formatCurrency(commissionStats.total_invoice)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800/30">
                        <div className="w-10 h-10 bg-purple-100 dark:bg-purple-800/50 rounded-lg flex items-center justify-center shadow-sm">
                          <Users className="text-purple-600 dark:text-purple-400" size={18} />
                        </div>
                        <div>
                          <p className="text-sm text-slate-600 dark:text-slate-400">Total Companies</p>
                          <p className="font-bold text-purple-700 dark:text-purple-400 text-lg">{commissionStats.total_companies}</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <div className="w-12 h-12 bg-slate-200 dark:bg-slate-600 rounded-xl flex items-center justify-center mx-auto mb-3">
                        <DollarSign className="text-slate-500 dark:text-slate-400" size={24} />
                      </div>
                      <p className="text-slate-600 dark:text-slate-400 text-sm">No commission data available for this carrier</p>
                    </div>
                  )}
                </div>
              )}
              
              <div className="p-6">
                {loadingStatements ? (
                  <div className="space-y-4">
                    {/* Statements Skeletons */}
                    {Array.from({ length: 6 }).map((_, index) => (
                      <div key={index} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 animate-pulse">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-4 flex-1">
                            <div className="w-5 h-5 bg-slate-200 dark:bg-slate-600 rounded-full mt-1"></div>
                            <div className="flex-1 min-w-0 space-y-3">
                              <div className="flex items-center gap-3">
                                <div className="h-5 w-80 bg-slate-200 dark:bg-slate-600 rounded"></div>
                                <div className="h-6 w-16 bg-slate-200 dark:bg-slate-600 rounded-full"></div>
                              </div>
                              <div className="flex items-center gap-4">
                                <div className="h-4 w-40 bg-slate-200 dark:bg-slate-600 rounded"></div>
                                <div className="h-4 w-40 bg-slate-200 dark:bg-slate-600 rounded"></div>
                              </div>
                              <div className="flex gap-2">
                                <div className="h-6 w-20 bg-slate-200 dark:bg-slate-600 rounded"></div>
                                <div className="h-6 w-24 bg-slate-200 dark:bg-slate-600 rounded"></div>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 ml-4">
                            <div className="w-8 h-8 bg-slate-200 dark:bg-slate-600 rounded-lg"></div>
                            <div className="w-8 h-8 bg-slate-200 dark:bg-slate-600 rounded-lg"></div>
                            <div className="h-8 w-32 bg-slate-200 dark:bg-slate-600 rounded-lg"></div>
                          </div>
                        </div>
                      </div>
                    ))}
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
                    <div className="w-20 h-20 bg-gradient-to-br from-slate-200 dark:from-slate-600 to-slate-300 dark:to-slate-500 rounded-2xl flex items-center justify-center mb-6 shadow-lg">
                      <Database className="text-slate-500 dark:text-slate-400" size={40} />
                    </div>
                    <h3 className="text-xl font-bold text-slate-800 dark:text-slate-200 mb-3">
                      No Carrier Selected
                    </h3>
                    <p className="text-slate-600 dark:text-slate-400 text-sm max-w-md leading-relaxed">
                      Select a carrier from the list to view and manage their statements, commission data, and analytics
                    </p>
                    <div className="mt-6 flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                      <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
                      <span>Choose a carrier to get started</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
                  </div>
                </div>
              ) : activeTab === 'database-fields' ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-200 dark:border-slate-700">
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200 flex items-center gap-3">
              <Settings className="text-blue-600" size={20} />
              Database Fields Configuration
            </h2>
            <p className="text-slate-600 dark:text-slate-400 mt-1 text-sm">Configure field mappings for data extraction and processing</p>
          </div>
          <div className="p-6">
            <DatabaseFieldsManager />
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-200 dark:border-slate-700">
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200 flex items-center gap-3">
              <Plus className="text-emerald-600" size={20} />
              Plan Types Management
            </h2>
            <p className="text-slate-600 dark:text-slate-400 mt-1 text-sm">Add and manage plan types for commission tracking</p>
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
