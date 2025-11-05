'use client'
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Users, X, Building2 } from 'lucide-react';
import { useSubmission } from '@/context/SubmissionContext';
import { useEnvironment } from '@/context/EnvironmentContext';
import { useCarriersWithCommission, useAvailableYears } from '../../hooks/useDashboard';
import type { CommissionData, CarrierGroup } from '../earned-commission/types';
import CompaniesTableView from '../earned-commission/CompaniesTableView';
import CarriersTableView from '../earned-commission/CarriersTableView';

interface EarnedCommissionTabProps {
  environmentId?: string | null;
  activeView: 'companies' | 'carriers';
  onViewChange?: (view: 'companies' | 'carriers') => void;
  companyFilter?: string | null;
  autoExpandCompany?: boolean;
  initialCarrierFilter?: string | null;
  autoExpandCarrier?: boolean;
}

export default function EarnedCommissionTab({ environmentId, activeView, onViewChange, companyFilter, autoExpandCompany, initialCarrierFilter, autoExpandCarrier }: EarnedCommissionTabProps) {
  const { refreshTrigger } = useSubmission();
  const { loading: environmentsLoading } = useEnvironment();

  const [selectedYear, setSelectedYear] = useState<number | null>(2025);
  const [viewAllData, setViewAllData] = useState(false);
  const [commissionData, setCommissionData] = useState<any[]>([]);
  const [aggregatedCompaniesData, setAggregatedCompaniesData] = useState<any[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [carrierFilter, setCarrierFilter] = useState<string | null>(initialCarrierFilter || null);
  const [selectedCarrierId, setSelectedCarrierId] = useState<string | null>(null);
  const [viewType, setViewType] = useState<'companies' | 'carriers'>(activeView);
  const [companyFilterState, setCompanyFilterState] = useState<string | null>(companyFilter || null);
  
  const { refetch: refetchCarriers } = useCarriersWithCommission();
  const { years: availableYears, refetch: refetchYears } = useAvailableYears();

  const viewMode = viewAllData ? 'all_data' : 'my_data';

  const fetchCommissionData = useCallback(async () => {
    setDataLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('view_mode', viewMode);
      if (selectedYear) params.append('year', selectedYear.toString());
      if (viewMode === 'my_data' && environmentId) {
        params.append('environment_id', environmentId);
      }
      const queryString = params.toString();
      
      const dataResponse = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/dashboard/earned-commissions?${queryString}`,
        { credentials: 'include' }
      );
      
      if (!dataResponse.ok) {
        if (dataResponse.status === 401) {
          setCommissionData([]);
          return;
        }
        throw new Error(`Data fetch failed: ${dataResponse.status}`);
      }
      
      const data = await dataResponse.json();
      
      if (Array.isArray(data)) {
        setCommissionData(data);
      } else {
        console.warn('⚠️ API returned non-array data:', typeof data, data);
        setCommissionData([]);
      }
    } catch (error) {
      console.error('❌ Error fetching commission data:', error);
      setCommissionData([]);
    } finally {
      setDataLoading(false);
    }
  }, [viewMode, selectedYear, environmentId]);

  const fetchAggregatedCompaniesData = useCallback(async () => {
    setDataLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('view_mode', viewMode);
      if (selectedYear) params.append('year', selectedYear.toString());
      if (selectedCarrierId) params.append('carrier_id', selectedCarrierId);
      if (viewMode === 'my_data' && environmentId) {
        params.append('environment_id', environmentId);
      }
      const queryString = params.toString();
      
      const dataResponse = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/earned-commission/companies-aggregated?${queryString}`,
        { credentials: 'include' }
      );
      
      if (!dataResponse.ok) {
        if (dataResponse.status === 401) {
          setAggregatedCompaniesData([]);
          return;
        }
        throw new Error(`Data fetch failed: ${dataResponse.status}`);
      }
      
      const data = await dataResponse.json();
      
      if (Array.isArray(data)) {
        setAggregatedCompaniesData(data);
      } else {
        console.warn('⚠️ API returned non-array data:', typeof data, data);
        setAggregatedCompaniesData([]);
      }
    } catch (error) {
      console.error('❌ Error fetching aggregated companies data:', error);
      setAggregatedCompaniesData([]);
    } finally {
      setDataLoading(false);
    }
  }, [viewMode, selectedYear, selectedCarrierId, environmentId]);

  useEffect(() => {
    if (!environmentsLoading) {
      fetchCommissionData();
      fetchAggregatedCompaniesData();
    }
  }, [fetchCommissionData, fetchAggregatedCompaniesData, environmentsLoading]);

  useEffect(() => {
    if (!environmentsLoading && (viewType === 'companies' || selectedCarrierId)) {
      fetchAggregatedCompaniesData();
    }
  }, [selectedCarrierId, fetchAggregatedCompaniesData, environmentsLoading, viewType]);

  useEffect(() => {
    if (refreshTrigger) {
      fetchCommissionData();
      fetchAggregatedCompaniesData();
      refetchCarriers();
      refetchYears();
    }
  }, [refreshTrigger, fetchCommissionData, fetchAggregatedCompaniesData, refetchCarriers, refetchYears]);

  // Transform data into carrier groups for carriers view
  const carrierGroups = useMemo(() => {
    const rawData = commissionData || [];
    
    if (!Array.isArray(rawData) || rawData.length === 0) {
      return [];
    }
    
    try {
      const groups = rawData.reduce((groups, item: CommissionData) => {
        if (!item || typeof item !== 'object') {
          return groups;
        }
        
        const carrierName = item.carrier_name || 'Unknown Carrier';
        if (!groups[carrierName]) {
          groups[carrierName] = [];
        }
        groups[carrierName].push(item);
        return groups;
      }, {} as Record<string, CommissionData[]>);

      const result = Object.entries(groups).map(([carrierName, companies]) => {
        const typedCompanies = companies as CommissionData[];
        const uniqueCompanies = new Set(typedCompanies.map(c => c.client_name?.toLowerCase()?.trim() || 'unknown'));
        const totalStatementCount = typedCompanies[0]?.approved_statement_count || 0;
        const carrierId = typedCompanies[0]?.carrier_id || '';
        
        return {
          carrierId,
          carrierName,
          companies: typedCompanies,
          totalCommission: typedCompanies.reduce((sum: number, company: CommissionData) => sum + (company.commission_earned || 0), 0),
          totalInvoice: typedCompanies.reduce((sum: number, company: CommissionData) => sum + (company.invoice_total || 0), 0),
          companyCount: uniqueCompanies.size,
          statementCount: totalStatementCount,
        };
      }).sort((a, b) => b.totalCommission - a.totalCommission);
      
      return result;
    } catch (error) {
      console.error('❌ Error calculating carrier groups:', error);
      return [];
    }
  }, [commissionData]);

  // Transform data for companies view with carrier filter support
  const allCompaniesData = useMemo(() => {
    const allCompanies = carrierGroups.flatMap(carrier => 
      carrier.companies.map(company => ({
        ...company,
        carrier_name: carrier.carrierName
      }))
    );
    
    // Apply carrier filter if set
    if (carrierFilter) {
      return allCompanies.filter(c => c.carrier_name === carrierFilter);
    }
    
    return allCompanies;
  }, [carrierGroups, carrierFilter]);
  
  // Navigation handler from Carriers to Companies
  const handleViewInCompanies = useCallback((carrierName: string, carrierId?: string) => {
    // Switch to companies view
    setViewType('companies');
    
    // Notify parent component of view change
    if (onViewChange) {
      onViewChange('companies');
    }
    
    // Set carrier filter
    setCarrierFilter(carrierName);
    setSelectedCarrierId(carrierId || null);
    
    // Optional: Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [onViewChange]);
  
  // Clear filter handler
  const handleClearCarrierFilter = useCallback(() => {
    setCarrierFilter(null);
    setSelectedCarrierId(null);
  }, []);
  
  // Update viewType when activeView changes
  useEffect(() => {
    setViewType(activeView);
  }, [activeView]);

  // Handle companyFilter prop change
  useEffect(() => {
    if (companyFilter) {
      setViewType('companies');
      setCompanyFilterState(companyFilter);
    }
  }, [companyFilter]);

  return (
    <div className="p-6 bg-slate-50 dark:bg-slate-900 min-h-screen">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Earned Commission - {viewType === 'companies' ? 'Companies View' : 'Carriers View'}
          </h1>
          <div className="flex items-center gap-4">
            {/* Year Filter */}
            {availableYears && availableYears.length > 0 && (
              <select
                value={selectedYear || ''}
                onChange={(e) => setSelectedYear(e.target.value ? Number(e.target.value) : null)}
                className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              >
                <option value="">All Years</option>
                {availableYears.map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            )}
            
            {/* My Data / All Data Toggle */}
            <div className="flex items-center gap-2 bg-white dark:bg-slate-800 rounded-lg p-1 border border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setViewAllData(false)}
                className={`px-4 py-2 rounded-md transition-all text-sm font-medium ${
                  !viewAllData
                    ? "bg-blue-500 text-white"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                My Data
              </button>
              <button
                onClick={() => setViewAllData(true)}
                className={`px-4 py-2 rounded-md transition-all text-sm font-medium ${
                  viewAllData
                    ? "bg-blue-500 text-white"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                All Data
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Badge */}
      {carrierFilter && viewType === 'companies' && (
        <div className="mb-4">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
            <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
              Filtered by Carrier: {carrierFilter}
            </span>
            <button
              onClick={handleClearCarrierFilter}
              className="ml-2 p-1 hover:bg-blue-100 dark:hover:bg-blue-800 rounded transition-colors"
            >
              <X className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            </button>
          </div>
        </div>
      )}
      
      {/* Company Filter Badge */}
      {companyFilterState && viewType === 'companies' && (
        <div className="mb-4">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700 rounded-lg">
            <Building2 className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            <span className="text-sm font-medium text-purple-900 dark:text-purple-100">
              Filtered by Company: {companyFilterState}
            </span>
            <button
              onClick={() => setCompanyFilterState(null)}
              className="ml-2 p-1 hover:bg-purple-100 dark:hover:bg-purple-800 rounded transition-colors"
            >
              <X className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
            </button>
          </div>
        </div>
      )}

      {/* Table View */}
      {viewType === 'companies' ? (
        <CompaniesTableView
          data={aggregatedCompaniesData}
          loading={dataLoading}
          selectedCarrierId={selectedCarrierId}
          onCarrierFilterChange={setSelectedCarrierId}
          availableCarriers={carrierGroups.map(g => ({ id: g.carrierId, name: g.carrierName }))}
          initialSearchQuery={companyFilterState}
          autoExpandRow={autoExpandCompany}
        />
      ) : (
        <CarriersTableView
          carriers={carrierGroups}
          loading={dataLoading}
          onViewInCompanies={handleViewInCompanies}
          carrierFilter={carrierFilter}
          autoExpandRow={autoExpandCarrier}
        />
      )}
    </div>
  );
}
