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
  SlidersHorizontal
} from 'lucide-react';
import EditCommissionModal from './EditCommissionModal';
import { 
  useEarnedCommissionStats, 
  useCarriersWithCommission, 
  useCarrierCommissionStats, 
  useCarrierCommissionData,
  useAllCommissionData 
} from '../../hooks/useDashboard';

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
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState<keyof CommissionData>('client_name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingData, setEditingData] = useState<CommissionData | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [carrierFilter, setCarrierFilter] = useState<string>('');
  const [minCommissionFilter, setMinCommissionFilter] = useState<string>('');
  const [maxCommissionFilter, setMaxCommissionFilter] = useState<string>('');

  // Fetch data
  const { stats: overallStats, loading: statsLoading, refetch: refetchStats } = useEarnedCommissionStats();
  const { carriers, loading: carriersLoading, refetch: refetchCarriers } = useCarriersWithCommission();
  const { data: allData, loading: allDataLoading, refetch: refetchAllData } = useAllCommissionData();

  // Refresh all data
  const refreshAllData = useCallback(() => {
    console.log('🔄 Refreshing all earned commission data...');
    refetchStats();
    refetchCarriers();
    refetchAllData();
  }, [refetchStats, refetchCarriers, refetchAllData]);

  // Refresh data when component mounts
  useEffect(() => {
    refreshAllData();
  }, [refreshAllData]);

  const ITEMS_PER_PAGE = 20;

  // Filter and sort data
  const filteredData = useMemo(() => {
    let data = allData || [];
    
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
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/earned-commission/${updatedData.id}`, {
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

      // Refresh the data
      window.location.reload();
    } catch (error) {
      console.error('Error updating commission data:', error);
      alert('Failed to update commission data. Please try again.');
    } finally {
      setEditLoading(false);
    }
  };

  // Clear all filters
  const clearFilters = () => {
    setSearchQuery('');
    setCarrierFilter('');
    setMinCommissionFilter('');
    setMaxCommissionFilter('');
    setCurrentPage(1);
  };

  // Check if any filters are active
  const hasActiveFilters = searchQuery || carrierFilter || minCommissionFilter || maxCommissionFilter;

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
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
    <div className="w-full space-y-8">
      {/* Enhanced Header */}
      <div className="text-center space-y-4">
        <div className="flex items-center justify-center gap-3">
          <Sparkles className="text-emerald-500" size={24} />
          <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-800 via-slate-700 to-slate-600 bg-clip-text text-transparent">
            Earned Commission Dashboard
          </h1>
          <Sparkles className="text-teal-500" size={24} />
        </div>
        <p className="text-lg text-slate-600 max-w-3xl mx-auto leading-relaxed">
          Track and analyze commission earnings across all carriers and clients with comprehensive insights
        </p>
        
        {/* Refresh Button */}
        <div className="flex justify-center">
          <button
            onClick={refreshAllData}
            disabled={statsLoading || carriersLoading || allDataLoading}
            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-2xl font-semibold shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw size={18} className={statsLoading || carriersLoading || allDataLoading ? 'animate-spin' : ''} />
            Refresh Data
          </button>
        </div>
      </div>

      {/* Enhanced Stats Cards */}
      <div className="grid gap-6 mb-8 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
        <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-xl border border-white/50 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-slate-600 text-sm">Total Invoice Amount</p>
              <p className="font-bold text-slate-800 text-2xl">
                {statsLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 border-2 border-slate-200 border-t-blue-500 rounded-full animate-spin"></div>
                    <span>Loading...</span>
                  </div>
                ) : formatCurrency(overallStats?.total_invoice || 0)}
              </p>
            </div>
            <div className="bg-gradient-to-r from-blue-500 to-indigo-600 rounded-2xl p-3 shadow-lg">
              <DollarSign className="text-white" size={24} />
            </div>
          </div>
        </div>

        <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-xl border border-white/50 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-slate-600 text-sm">Total Commission Earned</p>
              <p className="font-bold text-emerald-600 text-2xl">
                {statsLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 border-2 border-slate-200 border-t-emerald-500 rounded-full animate-spin"></div>
                    <span>Loading...</span>
                  </div>
                ) : formatCurrency(overallStats?.total_commission || 0)}
              </p>
            </div>
            <div className="bg-gradient-to-r from-emerald-500 to-teal-600 rounded-2xl p-3 shadow-lg">
              <TrendingUp className="text-white" size={24} />
            </div>
          </div>
        </div>

        <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-xl border border-white/50 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-slate-600 text-sm">Total Carriers</p>
              <p className="font-bold text-purple-600 text-2xl">
                {statsLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 border-2 border-slate-200 border-t-purple-500 rounded-full animate-spin"></div>
                    <span>Loading...</span>
                  </div>
                ) : overallStats?.total_carriers || 0}
              </p>
            </div>
            <div className="bg-gradient-to-r from-purple-500 to-violet-600 rounded-2xl p-3 shadow-lg">
              <Building2 className="text-white" size={24} />
            </div>
          </div>
        </div>

        <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-xl border border-white/50 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-slate-600 text-sm">Total Companies</p>
              <p className="font-bold text-orange-600 text-2xl">
                {statsLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 border-2 border-slate-200 border-t-orange-500 rounded-full animate-spin"></div>
                    <span>Loading...</span>
                  </div>
                ) : overallStats?.total_companies || 0}
              </p>
            </div>
            <div className="bg-gradient-to-r from-orange-500 to-amber-600 rounded-2xl p-3 shadow-lg">
              <Users className="text-white" size={24} />
            </div>
          </div>
        </div>
      </div>

      {/* Enhanced Data Table - Full Width */}
      <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/50 overflow-hidden">
        {/* Enhanced Table Header */}
        <div className="p-6 border-b border-slate-200/50 bg-gradient-to-r from-slate-50/50 to-slate-100/50">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <BarChart3 className="text-emerald-600" size={20} />
                Commission Data by Company
              </h3>
              <p className="text-sm text-slate-600 mt-1">
                {filteredData.length} records found
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-200 ${
                  showFilters 
                    ? 'bg-emerald-500 text-white shadow-lg' 
                    : 'bg-white/80 text-slate-700 hover:bg-slate-100/80'
                }`}
              >
                <SlidersHorizontal size={16} />
                <span className="text-sm font-medium">Filters</span>
                {hasActiveFilters && (
                  <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                )}
              </button>
              <button className="p-3 text-slate-500 hover:text-slate-700 hover:bg-slate-100/80 rounded-xl transition-all duration-200 hover:scale-105">
                <Download size={18} />
              </button>
            </div>
          </div>

          {/* Search Bar */}
          <div className="relative mb-4">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Search companies or carriers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 text-sm bg-white/80 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200"
            />
          </div>

          {/* Filter Panel */}
          {showFilters && (
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-4 mb-4 border border-slate-200/50">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-semibold text-slate-800 flex items-center gap-2">
                  <Filter size={16} />
                  Advanced Filters
                </h4>
                {hasActiveFilters && (
                  <button
                    onClick={clearFilters}
                    className="flex items-center gap-1 px-3 py-1 text-xs bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors"
                  >
                    <X size={12} />
                    Clear All
                  </button>
                )}
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-2">Carrier</label>
                  <input
                    type="text"
                    placeholder="Filter by carrier..."
                    value={carrierFilter}
                    onChange={(e) => setCarrierFilter(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white/80 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-2">Min Commission</label>
                  <input
                    type="number"
                    placeholder="Min amount..."
                    value={minCommissionFilter}
                    onChange={(e) => setMinCommissionFilter(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white/80 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-2">Max Commission</label>
                  <input
                    type="number"
                    placeholder="Max amount..."
                    value={maxCommissionFilter}
                    onChange={(e) => setMaxCommissionFilter(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white/80 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Enhanced Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gradient-to-r from-slate-50/80 to-slate-100/80">
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
                  Last Updated
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
                      {item.monthly_breakdown?.jan ? formatCurrency(item.monthly_breakdown.jan) : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                      {item.monthly_breakdown?.feb ? formatCurrency(item.monthly_breakdown.feb) : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                      {item.monthly_breakdown?.mar ? formatCurrency(item.monthly_breakdown.mar) : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                      {item.monthly_breakdown?.apr ? formatCurrency(item.monthly_breakdown.apr) : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                      {item.monthly_breakdown?.may ? formatCurrency(item.monthly_breakdown.may) : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                      {item.monthly_breakdown?.jun ? formatCurrency(item.monthly_breakdown.jun) : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                      {item.monthly_breakdown?.jul ? formatCurrency(item.monthly_breakdown.jul) : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                      {item.monthly_breakdown?.aug ? formatCurrency(item.monthly_breakdown.aug) : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                      {item.monthly_breakdown?.sep ? formatCurrency(item.monthly_breakdown.sep) : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                      {item.monthly_breakdown?.oct ? formatCurrency(item.monthly_breakdown.oct) : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                      {item.monthly_breakdown?.nov ? formatCurrency(item.monthly_breakdown.nov) : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                      {item.monthly_breakdown?.dec ? formatCurrency(item.monthly_breakdown.dec) : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-emerald-600">
                      {formatCurrency(item.commission_earned)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                      {formatCurrency(item.invoice_total)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                      {item.last_updated ? formatDate(item.last_updated) : 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button 
                        onClick={() => handleEditCommission(item)}
                        className="text-blue-600 hover:text-blue-800 transition-colors p-2 hover:bg-blue-50 rounded-xl hover:scale-110"
                        title="Edit commission data"
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

        {/* Enhanced Pagination */}
        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-slate-200/50 bg-gradient-to-r from-slate-50/50 to-slate-100/50">
            <div className="flex items-center justify-between">
              <div className="text-sm text-slate-700 font-medium">
                Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, filteredData.length)} of {filteredData.length} results
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  className="px-4 py-2 text-sm bg-white/80 backdrop-blur-sm border border-slate-300 rounded-xl hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-medium"
                >
                  Previous
                </button>
                <span className="px-4 py-2 text-sm text-slate-700 font-semibold bg-white/80 backdrop-blur-sm rounded-xl">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
                  className="px-4 py-2 text-sm bg-white/80 backdrop-blur-sm border border-slate-300 rounded-xl hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-medium"
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
    </div>
  );
}
