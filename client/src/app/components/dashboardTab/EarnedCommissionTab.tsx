'use client'
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  DollarSign,
  Building2,
  TrendingUp,
  Users,
  Search,
  ChevronRight,
  FileText,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Filter,
  Download,
  Edit,
  ChevronLeft,
  Menu,
  Sparkles,
  BarChart3,
  RefreshCw,
  X,
  SlidersHorizontal,
  Eye,
  EyeOff
} from 'lucide-react';
import EditCommissionModal from './EditCommissionModal';
import MergeConfirmationModal from './MergeConfirmationModal';
import { 
  useEarnedCommissionStats, 
  useGlobalEarnedCommissionStats,
  useGlobalCommissionData,
  useCarriersWithCommission, 
  useCarrierCommissionStats, 
  useCarrierCommissionData,
  useAllCommissionData,
  useAvailableYears
} from '../../hooks/useDashboard';
import { useSubmission } from '@/context/SubmissionContext';

interface CommissionData {
  id: string;
  carrier_name?: string;
  client_name: string;
  invoice_total: number;
  commission_earned: number;
  statement_count: number;
  statement_date?: string;
  statement_month?: number;
  statement_year?: number;
  monthly_breakdown?: {
    jan: number;
    feb: number;
    mar: number;
    apr: number;
    may: number;
    jun: number;
    jul: number;
    aug: number;
    sep: number;
    oct: number;
    nov: number;
    dec: number;
  };
  last_updated?: string;
  created_at?: string;
}

export default function EarnedCommissionTab() {
  const { refreshTrigger } = useSubmission();
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState<keyof CommissionData>('client_name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingData, setEditingData] = useState<CommissionData | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [mergeModalOpen, setMergeModalOpen] = useState(false);
  const [mergeData, setMergeData] = useState<{
    existingRecord: CommissionData;
    newData: { client_name: string; invoice_total: number; commission_earned: number };
    sourceId: string;
  } | null>(null);
  const [mergeLoading, setMergeLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [carrierFilter, setCarrierFilter] = useState<string>('');
  const [minCommissionFilter, setMinCommissionFilter] = useState<string>('');
  const [maxCommissionFilter, setMaxCommissionFilter] = useState<string>('');
  const [selectedYear, setSelectedYear] = useState<number | null>(2025);
  const [viewAllData, setViewAllData] = useState(false);

  // Fetch data - use different endpoints based on view toggle
  const { stats: userStats, loading: userStatsLoading, refetch: refetchUserStats } = useEarnedCommissionStats(selectedYear || undefined);
  const { stats: globalStats, loading: globalStatsLoading, refetch: refetchGlobalStats } = useGlobalEarnedCommissionStats(selectedYear || undefined);
  const { data: userData, loading: userDataLoading, refetch: refetchUserData } = useAllCommissionData(selectedYear || undefined);
  const { data: globalData, loading: globalDataLoading, refetch: refetchGlobalData } = useGlobalCommissionData(selectedYear || undefined);
  const { carriers, loading: carriersLoading, refetch: refetchCarriers } = useCarriersWithCommission();
  const { years: availableYears, loading: yearsLoading, refetch: refetchYears } = useAvailableYears();

  // Use the appropriate data based on view toggle
  const overallStats = viewAllData ? globalStats : userStats;
  const statsLoading = viewAllData ? globalStatsLoading : userStatsLoading;
  const allData = viewAllData ? globalData : userData;
  const allDataLoading = viewAllData ? globalDataLoading : userDataLoading;

  // Refresh all data
  const refreshAllData = useCallback(() => {
    if (viewAllData) {
      refetchGlobalStats();
      refetchGlobalData();
    } else {
      refetchUserStats();
      refetchUserData();
    }
    refetchCarriers();
    refetchYears();
  }, [viewAllData, refetchGlobalStats, refetchGlobalData, refetchUserStats, refetchUserData, refetchCarriers, refetchYears]);

  // Listen for global refresh events only
  useEffect(() => {
    if (refreshTrigger) {
      refreshAllData();
    }
  }, [refreshTrigger, refreshAllData]);

  const ITEMS_PER_PAGE = 20;

  // Filter and sort data
  const filteredData = useMemo(() => {
    let data = allData || [];
    
    // Note: The backend already filters data based on user role and view permissions
    // viewAllData toggle is for UI indication only - the actual filtering happens on the backend
    
    // Filter by search query (company name or carrier name)
    if (searchQuery) {
      data = data.filter((item: CommissionData) =>
        item.client_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.carrier_name && item.carrier_name.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    }

    // Filter by carrier
    if (carrierFilter) {
      data = data.filter((item: CommissionData) =>
        item.carrier_name && item.carrier_name.toLowerCase().includes(carrierFilter.toLowerCase())
      );
    }

    // Filter by commission range
    if (minCommissionFilter) {
      const minCommission = parseFloat(minCommissionFilter);
      if (!isNaN(minCommission)) {
        data = data.filter((item: CommissionData) => item.commission_earned >= minCommission);
      }
    }

    if (maxCommissionFilter) {
      const maxCommission = parseFloat(maxCommissionFilter);
      if (!isNaN(maxCommission)) {
        data = data.filter((item: CommissionData) => item.commission_earned <= maxCommission);
      }
    }
    
    // Sort data - default to alphabetical by company name
    data.sort((a: CommissionData, b: CommissionData) => {
      const aValue = a[sortField];
      const bValue = b[sortField];
      
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc' 
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }
      
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
      }
      
      return 0;
    });
    
    return data;
  }, [allData, searchQuery, sortField, sortDirection, carrierFilter, minCommissionFilter, maxCommissionFilter]);

  // Pagination
  const totalPages = Math.ceil(filteredData.length / ITEMS_PER_PAGE);
  const paginatedData = filteredData.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // Handle sorting
  const handleSort = (field: keyof CommissionData) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      // Set default direction based on field type
      const isStringField = field === 'client_name' || field === 'carrier_name';
      setSortDirection(isStringField ? 'asc' : 'desc');
    }
    setCurrentPage(1);
  };

  // Handle edit commission data
  const handleEditCommission = (data: CommissionData) => {
    setEditingData(data);
    setEditModalOpen(true);
  };

  const handleSaveCommission = async (updatedData: Partial<CommissionData>) => {
    setEditLoading(true);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/earned-commission/${updatedData.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_name: updatedData.client_name,
          invoice_total: updatedData.invoice_total,
          commission_earned: updatedData.commission_earned,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update commission data');
      }

      const result = await response.json();

      // Check if merge confirmation is required
      if (result.requires_merge_confirmation) {
        setMergeData({
          existingRecord: result.existing_record,
          newData: result.new_data,
          sourceId: updatedData.id!
        });
        setMergeModalOpen(true);
        setEditModalOpen(false);
        return;
      }

      // Refresh the data
      window.location.reload();
    } catch (error) {
      console.error('Error updating commission data:', error);
      alert('Failed to update commission data. Please try again.');
    } finally {
      setEditLoading(false);
    }
  };

  const handleConfirmMerge = async () => {
    if (!mergeData) return;
    
    setMergeLoading(true);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/earned-commission/merge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          source_id: mergeData.sourceId,
          target_id: mergeData.existingRecord.id,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to merge commission records');
      }

      // Close modal and refresh data
      setMergeModalOpen(false);
      setMergeData(null);
      window.location.reload();
    } catch (error) {
      console.error('Error merging commission records:', error);
      alert('Failed to merge commission records. Please try again.');
    } finally {
      setMergeLoading(false);
    }
  };

  const handleCancelMerge = () => {
    setMergeModalOpen(false);
    setMergeData(null);
    setEditModalOpen(true); // Reopen the edit modal
  };

  // Clear all filters
  const clearFilters = () => {
    setSearchQuery('');
    setCarrierFilter('');
    setMinCommissionFilter('');
    setMaxCommissionFilter('');
    setSelectedYear(2025);
    setCurrentPage(1);
  };

  // Check if any filters are active
  const hasActiveFilters = searchQuery || carrierFilter || minCommissionFilter || maxCommissionFilter || selectedYear !== 2025;

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  // Format monthly value - show dash for 0, currency for non-zero values
  const formatMonthlyValue = (value: number | undefined | null) => {
    if (value === undefined || value === null || value === 0) {
      return '-';
    }
    return formatCurrency(value);
  };

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="w-full space-y-6">
      {/* Controls */}
      <div className="flex justify-between items-center">
        {/* View Toggle */}
        <div className="flex items-center gap-2 bg-white rounded-xl border border-slate-200 shadow-sm p-1">
          <button
            onClick={() => setViewAllData(false)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
              !viewAllData
                ? 'bg-blue-500 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
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
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <EyeOff className="w-4 h-4" />
            All Data
          </button>
        </div>

        {/* Refresh Button */}
        <button
          onClick={refreshAllData}
          disabled={statsLoading || carriersLoading || allDataLoading}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-lg font-medium shadow-sm hover:bg-emerald-600 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw size={16} className={statsLoading || carriersLoading || allDataLoading ? 'animate-spin' : ''} />
          Refresh Data
        </button>
      </div>

      {/* Status Indicators */}
      {selectedYear && selectedYear !== 2025 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
              <span className="text-blue-600 text-sm">📅</span>
            </div>
            <div>
              <p className="text-sm font-medium text-blue-800">Year Filter Active</p>
              <p className="text-xs text-blue-600">Showing data for year {selectedYear}</p>
            </div>
          </div>
        </div>
      )}
      {viewAllData && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center">
              <span className="text-amber-600 text-sm">🔒</span>
            </div>
            <div>
              <p className="text-sm font-medium text-amber-800">Read-Only Mode</p>
              <p className="text-xs text-amber-600">Viewing all company data</p>
            </div>
          </div>
        </div>
      )}

      

      {/* Stats Cards */}
      <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-slate-600 text-sm">Total Invoice Amount</p>
              <div className="font-bold text-slate-800 text-2xl">
                {statsLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 border-2 border-slate-200 border-t-blue-500 rounded-full animate-spin"></div>
                    <span>Loading...</span>
                  </div>
                ) : formatCurrency(overallStats?.total_invoice || 0)}
              </div>
            </div>
            <div className="bg-blue-100 rounded-lg p-3">
              <DollarSign className="text-blue-600" size={24} />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-slate-600 text-sm">Total Commission Earned</p>
              <p className="font-bold text-emerald-600 text-2xl">
                {statsLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 border-2 border-slate-200 border-t-emerald-500 rounded-full animate-spin"></div>
                    <span>Loading...</span>
                  </div>
                ) : formatCurrency(overallStats?.total_commission || 0)}
              </p>
            </div>
            <div className="bg-emerald-100 rounded-lg p-3">
              <TrendingUp className="text-emerald-600" size={24} />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-slate-600 text-sm">Total Carriers</p>
              <p className="font-bold text-purple-600 text-2xl">
                {statsLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 border-2 border-slate-200 border-t-purple-500 rounded-full animate-spin"></div>
                    <span>Loading...</span>
                  </div>
                ) : overallStats?.total_carriers || 0}
              </p>
            </div>
            <div className="bg-purple-100 rounded-lg p-3">
              <Building2 className="text-purple-600" size={24} />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-slate-600 text-sm">Total Companies</p>
              <p className="font-bold text-orange-600 text-2xl">
                {statsLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 border-2 border-slate-200 border-t-orange-500 rounded-full animate-spin"></div>
                    <span>Loading...</span>
                  </div>
                ) : overallStats?.total_companies || 0}
              </p>
            </div>
            <div className="bg-orange-100 rounded-lg p-3">
              <Users className="text-orange-600" size={24} />
            </div>
          </div>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Table Header */}
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <BarChart3 className="text-emerald-600" size={18} />
                Commission Data by Company
              </h3>
              <p className="text-sm text-slate-600 mt-1">
                {filteredData.length} records found
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200 ${
                  showFilters 
                    ? 'bg-emerald-500 text-white shadow-sm' 
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <SlidersHorizontal size={14} />
                <span className="text-sm font-medium">Filters</span>
                {(minCommissionFilter || maxCommissionFilter) && (
                  <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                )}
              </button>
              <button className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all duration-200">
                <Download size={16} />
              </button>
            </div>
          </div>

          {/* Search and Filter Row */}
          <div className="space-y-4 mb-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="text"
                  placeholder="Search by company..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 text-sm bg-white rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200"
                />
              </div>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="text"
                  placeholder="Search by carrier..."
                  value={carrierFilter}
                  onChange={(e) => setCarrierFilter(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 text-sm bg-white rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200"
                />
              </div>
              <div>
                <select
                  value={selectedYear || 2025}
                  onChange={(e) => setSelectedYear(e.target.value ? parseInt(e.target.value) : null)}
                  className="w-full px-4 py-2 text-sm bg-white rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200"
                >
                  <option value="">All Years</option>
                  {yearsLoading ? (
                    <option value="" disabled>Loading years...</option>
                  ) : (
                    availableYears.map((year) => (
                      <option key={year} value={year}>{year}</option>
                    ))
                  )}
                </select>
              </div>
            </div>
            
            {/* Clear Filters Button */}
            {hasActiveFilters && (
              <div className="flex justify-center">
                <button
                  onClick={clearFilters}
                  className="flex items-center gap-2 px-3 py-1 text-sm bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors font-medium"
                >
                  <X size={14} />
                  Clear All Filters
                </button>
              </div>
            )}
          </div>

          {/* Advanced Filters Panel */}
          {showFilters && (
            <div className="bg-slate-50 rounded-lg p-4 mb-4 border border-slate-200">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-medium text-slate-800 flex items-center gap-2">
                  <Filter size={14} />
                  Advanced Filters
                </h4>
                {hasActiveFilters && (
                  <button
                    onClick={clearFilters}
                    className="flex items-center gap-1 px-2 py-1 text-xs bg-red-100 text-red-600 rounded hover:bg-red-200 transition-colors"
                  >
                    <X size={10} />
                    Clear All
                  </button>
                )}
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-2">Min Commission</label>
                  <input
                    type="number"
                    placeholder="Min amount..."
                    value={minCommissionFilter}
                    onChange={(e) => setMinCommissionFilter(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white rounded border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-2">Max Commission</label>
                  <input
                    type="number"
                    placeholder="Max amount..."
                    value={maxCommissionFilter}
                    onChange={(e) => setMaxCommissionFilter(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white rounded border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">
                  <button
                    onClick={() => handleSort('client_name')}
                    className="flex items-center gap-1 hover:text-slate-800 transition-colors"
                  >
                    Company
                    {sortField === 'client_name' && (
                      sortDirection === 'asc' ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />
                    )}
                  </button>
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">
                  <button
                    onClick={() => handleSort('carrier_name')}
                    className="flex items-center gap-1 hover:text-slate-800 transition-colors"
                  >
                    Carrier
                    {sortField === 'carrier_name' && (
                      sortDirection === 'asc' ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />
                    )}
                  </button>
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">
                  Jan
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">
                  Feb
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">
                  Mar
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">
                  Apr
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">
                  May
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">
                  Jun
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">
                  Jul
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">
                  Aug
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">
                  Sep
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">
                  Oct
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">
                  Nov
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">
                  Dec
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">
                  Total
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">
                  <button
                    onClick={() => handleSort('invoice_total')}
                    className="flex items-center gap-1 hover:text-slate-800 transition-colors"
                  >
                    Invoice Total
                    {sortField === 'invoice_total' && (
                      sortDirection === 'asc' ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />
                    )}
                  </button>
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">
                  Statement Year
                </th>
                <th className="px-6 py-4 text-right text-xs font-bold text-slate-600 uppercase tracking-wider">
                  Edit
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200/50">
              {allDataLoading ? (
                <tr>
                  <td colSpan={18} className="px-6 py-12 text-center text-slate-500">
                    <div className="flex items-center justify-center gap-3">
                      <div className="w-8 h-8 border-2 border-slate-200 border-t-emerald-500 rounded-full animate-spin"></div>
                      <span>Loading commission data...</span>
                    </div>
                  </td>
                </tr>
              ) : paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={18} className="px-6 py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center gap-3">
                      <BarChart3 className="text-slate-300" size={48} />
                      <span>No commission data found</span>
                      {hasActiveFilters && (
                        <button
                          onClick={clearFilters}
                          className="text-sm text-emerald-600 hover:text-emerald-700 underline"
                        >
                          Clear filters to see all data
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedData.map((item: CommissionData) => (
                  <tr key={item.id} className="hover:bg-slate-50/50 transition-colors duration-200">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-slate-900">
                      {item.client_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                      {item.carrier_name || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                      {formatMonthlyValue(item.monthly_breakdown?.jan)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                      {formatMonthlyValue(item.monthly_breakdown?.feb)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                      {formatMonthlyValue(item.monthly_breakdown?.mar)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                      {formatMonthlyValue(item.monthly_breakdown?.apr)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                      {formatMonthlyValue(item.monthly_breakdown?.may)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                      {formatMonthlyValue(item.monthly_breakdown?.jun)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                      {formatMonthlyValue(item.monthly_breakdown?.jul)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                      {formatMonthlyValue(item.monthly_breakdown?.aug)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                      {formatMonthlyValue(item.monthly_breakdown?.sep)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                      {formatMonthlyValue(item.monthly_breakdown?.oct)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                      {formatMonthlyValue(item.monthly_breakdown?.nov)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                      {formatMonthlyValue(item.monthly_breakdown?.dec)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-emerald-600">
                      {formatCurrency(item.commission_earned)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                      {formatCurrency(item.invoice_total)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                      {item.statement_year || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button 
                        onClick={() => handleEditCommission(item)}
                        disabled={viewAllData}
                        className={`transition-colors p-2 rounded-xl hover:scale-110 ${
                          viewAllData 
                            ? 'text-slate-400 cursor-not-allowed opacity-50' 
                            : 'text-blue-600 hover:text-blue-800 hover:bg-blue-50'
                        }`}
                        title={viewAllData ? "Read-only mode - switch to 'My Data' to edit" : "Edit commission data"}
                      >
                        <Edit size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-slate-200 bg-slate-50">
            <div className="flex items-center justify-between">
              <div className="text-sm text-slate-700 font-medium">
                Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, filteredData.length)} of {filteredData.length} results
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  className="px-4 py-2 text-sm bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-medium"
                >
                  Previous
                </button>
                <span className="px-4 py-2 text-sm text-slate-700 font-semibold bg-white rounded-lg">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
                  className="px-4 py-2 text-sm bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-medium"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Edit Commission Modal */}
      <EditCommissionModal
        isOpen={editModalOpen}
        onClose={() => {
          setEditModalOpen(false);
          setEditingData(null);
        }}
        data={editingData}
        onSave={handleSaveCommission}
        loading={editLoading}
      />

      {/* Merge Confirmation Modal */}
      {mergeData?.existingRecord && mergeData?.newData && (
        <MergeConfirmationModal
          isOpen={mergeModalOpen}
          onClose={() => {
            setMergeModalOpen(false);
            setMergeData(null);
          }}
          existingRecord={mergeData.existingRecord}
          newData={mergeData.newData}
          onConfirmMerge={handleConfirmMerge}
          onCancel={handleCancelMerge}
          loading={mergeLoading}
        />
      )}
    </div>
  );
}
