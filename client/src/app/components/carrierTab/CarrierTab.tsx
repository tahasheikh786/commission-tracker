'use client'
import React, { useEffect, useState, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import CarrierList from "./CarrierList";
import CarrierStatementsTable from "./CarrierStatementsTable";
import EditMappingModal from "./EditMappingModal";
import CompareModalEnhance from "./CompareModalEnhanced";
import StatementPreviewModal from "./StatementPreviewModal";
import DatabaseFieldsManager from "./DatabaseFieldsManager";
import PlanTypesManager from "./PlanTypesManager";
import toast from 'react-hot-toast';
import { Database, Settings, Plus, Search, Filter, Sparkles, Building2, FileText, DollarSign, TrendingUp, Users, Eye, EyeOff, ReceiptText } from "lucide-react";
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
  final_data?: any[];  // Array of tables with rows
  field_config?: any[];  // Field configuration/mappings
  field_mapping?: Record<string, string> | null;  // Field mappings saved during approval
  raw_data?: any[];
  rejection_reason?: string;
  selected_statement_date?: any;
  uploaded_by_email?: string;
  uploaded_by_name?: string;
  // NEW: Automation metadata
  automated_approval?: boolean;
  automation_timestamp?: string;
  total_amount_match?: boolean | null;
  extracted_total?: number;  // Total extracted from document
};

interface CommissionStats {
  carrier_name: string;
  total_invoice: number;
  total_commission: number;
  total_companies: number;
  total_statements: number;
}

interface CarrierTabProps {
  environmentId?: string | null;
}

export default function CarrierTab({ environmentId }: CarrierTabProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
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
  const [filterYear, setFilterYear] = useState<number | null>(null);
  const [filterMonth, setFilterMonth] = useState<number | null>(null);
  
  // ✅ FIX: Track if URL parameter has been processed to prevent override on user clicks
  const urlParamProcessed = useRef(false);
  
  // Simplified permission logic:
  // My Data tab: All authenticated users can select and delete their own files
  // All Data tab: Only admins can select and delete any files
  // Add fallback permissions if not loaded yet
  const safePermissions = permissions || {
    can_upload: true,
    can_edit: true,
    is_admin: false,
    is_read_only: false
  };
  
  const canSelectFiles = viewAllData ? safePermissions.is_admin === true : true;
  const canDeleteFiles = viewAllData ? safePermissions.is_admin === true : true;


  // Fetch user-specific companies
  const { companies: userSpecificCompanies, loading: userCompaniesLoading, refetch: refetchUserCompanies } = useUserSpecificCompanies(environmentId);

  // Refetch data when environment changes
  useEffect(() => {
    if (!viewAllData) {
      refetchUserCompanies();
    }
  }, [environmentId, viewAllData, refetchUserCompanies]);

  // Fetch carriers on mount and when view toggle changes
  useEffect(() => {
    setLoadingCarriers(true);
    
    // Use unified API endpoint with view_mode parameter
    const params = new URLSearchParams();
    params.append('view_mode', viewAllData ? 'all_data' : 'my_data');
    if (environmentId && !viewAllData) {
      params.append('environment_id', environmentId);
    }
    
    axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/companies/?${params.toString()}`, {
      withCredentials: true
    })
      .then((response) => {
        const data = response.data;
        // Sort carriers alphabetically by name
        const sortedCarriers = data.sort((a: Carrier, b: Carrier) => 
          a.name.localeCompare(b.name)
        );
        setCarriers(sortedCarriers);
      })
      .catch((error) => {
        console.error('Error fetching companies:', error);
        setCarriers([]);
      })
      .finally(() => setLoadingCarriers(false));
  }, [viewAllData, environmentId]);

  // ✅ FIX: Auto-select carrier from URL parameter (ONLY ONCE on mount)
  useEffect(() => {
    const carrierParam = searchParams?.get('carrier');
    
    // Only process URL parameter once to avoid overriding user clicks
    if (carrierParam && carriers.length > 0 && !loadingCarriers && !urlParamProcessed.current) {
      console.log('📌 Processing URL parameter (one-time): carrier=', carrierParam);
      
      // Decode the carrier name from URL
      const decodedCarrierName = decodeURIComponent(carrierParam);
      
      // Find matching carrier (case-insensitive comparison)
      const matchingCarrier = carriers.find(
        carrier => carrier.name.toLowerCase() === decodedCarrierName.toLowerCase()
      );
      
      if (matchingCarrier) {
        setSelected(matchingCarrier);
        toast.success(`Viewing statements for ${matchingCarrier.name}`);
        console.log('✅ URL carrier selected:', matchingCarrier.name);
      } else {
        toast(`Carrier "${decodedCarrierName}" not found in your carriers list`);
        console.log('❌ URL carrier not found:', decodedCarrierName);
      }
      
      // Mark as processed so it doesn't run again
      urlParamProcessed.current = true;
      console.log('✅ URL parameter processed, will not override user selections anymore');
    }
  }, [searchParams, carriers, loadingCarriers]);

  // Function to refresh statements
  const handleStatementsRefresh = async () => {
    if (!selected) return;
    
    setLoadingStatements(true);
    
    const endpoint = viewAllData 
      ? `${process.env.NEXT_PUBLIC_API_URL}/api/companies/${selected.id}/statements/`
      : `${process.env.NEXT_PUBLIC_API_URL}/api/companies/user-specific/${selected.id}/statements`;
    
    try {
      const response = await axios.get(endpoint, {
        withCredentials: true  // CRITICAL FIX: Ensure cookies are sent
      });
      const data = response.data;
      setStatements(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching statements:', error);
      setStatements([]);
    } finally {
      setLoadingStatements(false);
    }
  };

  // Fetch statements for selected carrier
  useEffect(() => {
    if (!selected) {
      setStatements([]);
      setCommissionStats(null);
      return;
    }
    handleStatementsRefresh();
  }, [selected, viewAllData]);

  // Function to fetch commission stats
  const fetchCommissionStats = async () => {
    if (!selected) {
      setCommissionStats(null);
      return;
    }
    
    setLoadingCommission(true);
    
    // Build query parameters for filtering
    const params = new URLSearchParams();
    if (filterYear !== null) {
      params.append('year', filterYear.toString());
    }
    if (filterMonth !== null) {
      params.append('month', filterMonth.toString());
    }
    
    const queryString = params.toString();
    const endpoint = viewAllData 
      ? `${process.env.NEXT_PUBLIC_API_URL}/api/earned-commission/carrier/${selected.id}/stats${queryString ? `?${queryString}` : ''}`
      : `${process.env.NEXT_PUBLIC_API_URL}/api/earned-commission/carrier/user-specific/${selected.id}/stats${queryString ? `?${queryString}` : ''}`;
    
    try {
      const response = await axios.get(endpoint, {
        withCredentials: true  // CRITICAL FIX: Ensure cookies are sent
      });
      setCommissionStats(response.data);
    } catch (error) {
      console.error('Error fetching commission stats:', error);
      setCommissionStats(null);
    } finally {
      setLoadingCommission(false);
    }
  };

  // Fetch commission data for selected carrier
  useEffect(() => {
    fetchCommissionStats();
  }, [selected, viewAllData, filterYear, filterMonth]);

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
    axios.delete(`${process.env.NEXT_PUBLIC_API_URL}/api/companies/${selected.id}/statements/`, {
      data: { statement_ids: ids },
      withCredentials: true  // CRITICAL FIX: Ensure cookies are sent with DELETE request
    })
      .then(() => {
        setStatements(statements.filter(statement => !ids.includes(statement.id)));
        toast.success('Statements deleted successfully!');
        // Refresh commission stats immediately to update totals
        fetchCommissionStats();
        // Trigger global dashboard refresh after successful deletion
        triggerDashboardRefresh();
      })
      .catch((error) => {
        console.error('Delete statements error:', error);
        const errorMessage = error.response?.data?.detail || 'Error deleting statements.';
        toast.error(errorMessage);
      })
      .finally(() => {
        setDeletingStatements(false);
      });
  };

  const handleCarrierDelete = (ids: string[]) => {
    setDeletingCarriers(true);
    axios.delete(`${process.env.NEXT_PUBLIC_API_URL}/api/companies/`, {
      data: { company_ids: ids },
      withCredentials: true  // CRITICAL FIX: Ensure cookies are sent with DELETE request
    })
      .then((response) => {
        setCarriers(carriers.filter(carrier => !ids.includes(carrier.id)));
        
        // Clear selection if the deleted carrier was currently selected
        if (selected && ids.includes(selected.id)) {
          setSelected(null);
          setStatements([]);
          setCommissionStats(null);
        }
        
        toast.success(response.data.message || 'Carriers deleted successfully!');
        // Trigger global dashboard refresh after successful deletion
        triggerDashboardRefresh();
      })
      .catch((error) => {
        console.error('Delete error:', error);
        const errorMessage = error.response?.data?.detail || 'Error deleting carriers.';
        toast.error(errorMessage);
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
    <div className="w-full space-y-6 bg-slate-50 dark:bg-slate-900 min-h-screen">
      {/* View Toggle - Only show for carriers tab */}
      {activeTab === 'carriers' && (
        <div className="flex justify-end">
          <div className="flex items-center gap-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-1">
            <button
              onClick={() => setViewAllData(false)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                !viewAllData
                  ? 'bg-blue-500 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              <Eye className="w-4 h-4" />
              My Data
            </button>
            <button
              onClick={() => setViewAllData(true)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                viewAllData
                  ? 'bg-blue-500 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              <EyeOff className="w-4 h-4" />
              All Data
            </button>
          </div>
        </div>
      )}

      {/* Status Indicators */}
      {viewAllData && !permissions?.is_admin && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-600 rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-amber-100 dark:bg-amber-800/60 rounded-full flex items-center justify-center">
              <span className="text-amber-600 dark:text-amber-200 text-sm">🔒</span>
            </div>
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-100">Read-Only Mode</p>
              <p className="text-xs text-amber-600 dark:text-amber-200">Viewing all company data</p>
            </div>
          </div>
        </div>
      )}
      {viewAllData && permissions?.is_admin && (
        <div className="bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-600 rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-green-100 dark:bg-green-800/60 rounded-full flex items-center justify-center">
              <span className="text-green-600 dark:text-green-200 text-sm">👑</span>
            </div>
            <div>
              <p className="text-sm font-medium text-green-800 dark:text-green-100">Admin Mode</p>
              <p className="text-xs text-green-600 dark:text-green-200">Full access to all company data</p>
            </div>
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex items-center gap-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-1">
        {tabConfig.map((tabItem) => {
          const Icon = tabItem.icon;
          const isActive = activeTab === tabItem.id;
          
          return (
            <button
              key={tabItem.id}
              onClick={() => setActiveTab(tabItem.id)}
              className={`flex items-center gap-3 px-6 py-3 rounded-lg font-medium transition-all duration-200 ${
                isActive 
                  ? 'bg-blue-500 text-white shadow-sm' 
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              <Icon size={18} />
              <span>{tabItem.label}</span>
            </button>
          );
        })}
      </div>

              {activeTab === 'carriers' ? (
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Carrier List */}
          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-200 dark:border-slate-700">
                <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Carriers</h3>
              </div>
              <CarrierList
                carriers={carriers}
                selected={selected}
                onSelect={c => {
                  console.log('🔄 CarrierTab: User manually selected carrier:', c.name);
                  setSelected(c);
                  // Update the carrier in the list if name changed
                  setCarriers(prev => prev.map(car => car.id === c.id ? { ...car, name: c.name } : car));
                  
                  // ✅ FIX: Clear carrier URL parameter but keep other params (like tab=carriers)
                  if (searchParams?.get('carrier')) {
                    console.log('✅ Clearing carrier URL parameter to allow manual carrier switching');
                    // Build new URL with all params except 'carrier'
                    const params = new URLSearchParams(window.location.search);
                    params.delete('carrier');
                    const newUrl = params.toString() ? `${window.location.pathname}?${params.toString()}` : window.location.pathname;
                    console.log('✅ New URL:', newUrl);
                    router.replace(newUrl, { scroll: false });
                  }
                }}
                loading={loadingCarriers || userCompaniesLoading}
                onDelete={handleCarrierDelete}
                deleting={deletingCarriers}
                canSelectFiles={canSelectFiles}
                canDeleteFiles={canDeleteFiles}
              />
            </div>
          </div>
          
          {/* Statements Panel */}
          <div className="lg:col-span-3">
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200 flex items-center gap-3">
                      <Building2 className="text-blue-600 dark:text-blue-400" size={20} />
                      {selected?.name || "Select a carrier"}
                    </h2>
                    {selected && (
                      <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 flex items-center gap-2">
                        <FileText className="text-slate-400 dark:text-slate-500" size={14} />
                        {statements.length} statement{statements.length !== 1 ? 's' : ''} found
                      </p>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Commission Stats Display */}
              {selected && (
                <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/30">
                  {/* Filter Controls */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex items-center gap-2">
                      <Filter className="text-slate-500 dark:text-slate-400" size={16} />
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Filter:</span>
                    </div>
                    
                    {/* Year Filter */}
                    <select
                      value={filterYear || ''}
                      onChange={(e) => setFilterYear(e.target.value ? parseInt(e.target.value) : null)}
                      className="px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
                    >
                      <option value="">All Years</option>
                      {[2025, 2024, 2023, 2022].map(year => (
                        <option key={year} value={year}>{year}</option>
                      ))}
                    </select>
                    
                    {/* Month Filter */}
                    <select
                      value={filterMonth || ''}
                      onChange={(e) => setFilterMonth(e.target.value ? parseInt(e.target.value) : null)}
                      className="px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
                      disabled={!filterYear}
                    >
                      <option value="">All Months</option>
                      {[
                        { value: 1, label: 'January' },
                        { value: 2, label: 'February' },
                        { value: 3, label: 'March' },
                        { value: 4, label: 'April' },
                        { value: 5, label: 'May' },
                        { value: 6, label: 'June' },
                        { value: 7, label: 'July' },
                        { value: 8, label: 'August' },
                        { value: 9, label: 'September' },
                        { value: 10, label: 'October' },
                        { value: 11, label: 'November' },
                        { value: 12, label: 'December' }
                      ].map(month => (
                        <option key={month.value} value={month.value}>{month.label}</option>
                      ))}
                    </select>
                    
                    {/* Clear Filters Button */}
                    {(filterYear || filterMonth) && (
                      <button
                        onClick={() => {
                          setFilterYear(null);
                          setFilterMonth(null);
                        }}
                        className="px-3 py-1.5 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
                      >
                        Clear Filters
                      </button>
                    )}
                  </div>
                  
                  {loadingCommission ? (
                    <div className="flex items-center gap-3">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                      <span className="text-slate-600 dark:text-slate-400">Loading commission data...</span>
                    </div>
                  ) : commissionStats ? (
                    <>
                      {/* Show filter info if filters are applied */}
                      {(filterYear || filterMonth) && (
                        <div className="mb-3 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                          <p className="text-sm text-blue-700 dark:text-blue-300">
                            Showing data for {filterYear && !filterMonth ? `all of ${filterYear}` : filterYear && filterMonth ? `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][filterMonth - 1]} ${filterYear}` : 'all time'}
                          </p>
                        </div>
                      )}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Total Commission Card */}
                        <div className="bg-gradient-to-br from-green-50 to-green-100/50 dark:from-green-950/30 dark:to-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow duration-200">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="text-sm font-medium text-green-600 dark:text-green-400 mb-2">
                                Total Commission
                              </div>
                              <div className="text-3xl font-bold text-green-900 dark:text-green-100">
                                {formatCurrency(commissionStats.total_commission)}
                              </div>
                            </div>
                            <div className="w-12 h-12 bg-green-600 dark:bg-green-500 rounded-lg flex items-center justify-center">
                              <DollarSign className="w-6 h-6 text-white" />
                            </div>
                          </div>
                        </div>
                        
                        {/* Total Invoice Card */}
                        <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/30 dark:to-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow duration-200">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="text-sm font-medium text-blue-600 dark:text-blue-400 mb-2">
                                Total Invoice
                              </div>
                              <div className="text-3xl font-bold text-blue-900 dark:text-blue-100">
                                {formatCurrency(commissionStats.total_invoice)}
                              </div>
                            </div>
                            <div className="w-12 h-12 bg-blue-600 dark:bg-blue-500 rounded-lg flex items-center justify-center">
                              <ReceiptText className="w-6 h-6 text-white" />
                            </div>
                          </div>
                        </div>
                        
                        {/* Total Companies Card */}
                        <div className="bg-gradient-to-br from-purple-50 to-purple-100/50 dark:from-purple-950/30 dark:to-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow duration-200">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="text-sm font-medium text-purple-600 dark:text-purple-400 mb-2">
                                Total Companies
                              </div>
                              <div className="text-3xl font-bold text-purple-900 dark:text-purple-100">
                                {commissionStats.total_companies}
                              </div>
                            </div>
                            <div className="w-12 h-12 bg-purple-600 dark:bg-purple-500 rounded-lg flex items-center justify-center">
                              <Users className="w-6 h-6 text-white" />
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : statements.length === 0 ? (
                    <div className="text-center py-2">
                      <p className="text-slate-500 dark:text-slate-400 text-sm">No statements found for this carrier</p>
                    </div>
                  ) : (
                    <div className="text-center py-2">
                      <p className="text-slate-500 dark:text-slate-400 text-sm">Commission data will be calculated after statements are processed</p>
                    </div>
                  )}
                </div>
              )}
              
              <div className="p-6">
                {loadingStatements ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 border-2 border-slate-200 dark:border-slate-600 border-t-blue-500 rounded-full animate-spin"></div>
                      <span className="text-slate-600 dark:text-slate-400 font-medium">Loading statements...</span>
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
                    canSelectFiles={canSelectFiles}
                    canDeleteFiles={canDeleteFiles}
                    showUploadedByColumn={viewAllData}
                    onRefresh={handleStatementsRefresh}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700 rounded-xl flex items-center justify-center mb-4">
                      <Database className="text-slate-400 dark:text-slate-500" size={32} />
                    </div>
                    <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">
                      No Carrier Selected
                    </h3>
                    <p className="text-slate-500 dark:text-slate-400 text-sm max-w-md">
                      Select a carrier from the list to view and manage their statements
                    </p>
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
              <Settings className="text-blue-600 dark:text-blue-400" size={20} />
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
              <Plus className="text-emerald-600 dark:text-emerald-400" size={20} />
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
        <CompareModalEnhance
          statement={statements[showCompareIdx]}
          onClose={() => setShowCompareIdx(null)}
        />
      )}
    </div>
  );
}
