'use client'
import React, { useState, useMemo } from 'react';
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
  Edit
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
  last_updated?: string;
  created_at?: string;
}

export default function EarnedCommissionTab() {
  const [selectedCarrier, setSelectedCarrier] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState<keyof CommissionData>('client_name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingData, setEditingData] = useState<CommissionData | null>(null);
  const [editLoading, setEditLoading] = useState(false);

  // Fetch data
  const { stats: overallStats, loading: statsLoading } = useEarnedCommissionStats();
  const { carriers, loading: carriersLoading } = useCarriersWithCommission();
  const { stats: carrierStats, loading: carrierStatsLoading } = useCarrierCommissionStats(selectedCarrier);
  const { data: carrierData, loading: carrierDataLoading } = useCarrierCommissionData(selectedCarrier);
  const { data: allData, loading: allDataLoading } = useAllCommissionData();

  const ITEMS_PER_PAGE = 15;

  // Filter and sort data
  const filteredData = useMemo(() => {
    let data = selectedCarrier ? (carrierData?.commission_data || []) : allData;
    
    // Filter by search query
    if (searchQuery) {
      data = data.filter((item: CommissionData) =>
        item.client_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.carrier_name && item.carrier_name.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    }
    
    // Sort data
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
  }, [selectedCarrier, carrierData, allData, searchQuery, sortField, sortDirection]);

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

  // Get current stats based on selection
  const currentStats = selectedCarrier ? carrierStats : overallStats;
  const currentStatsLoading = selectedCarrier ? carrierStatsLoading : statsLoading;

  return (
    <div className="w-full animate-fade-in">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent mb-2">
          Earned Commission Dashboard
        </h1>
        <p className="text-gray-600 text-lg">
          Track and analyze commission earnings across all carriers and clients
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Sidebar - Carriers */}
        <div className="lg:col-span-1">
          <div className="glass rounded-2xl p-6 shadow-lg">
            <div className="flex flex-col gap-4 mb-6">
              <h2 className="text-xl font-semibold text-gray-800">Carriers</h2>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                <input
                  type="text"
                  placeholder="Search carriers..."
                  className="w-full pl-10 pr-4 py-2 text-sm bg-white/50 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* All Carriers Option */}
            <button
              onClick={() => setSelectedCarrier(null)}
              className={`w-full flex items-center justify-between p-4 rounded-xl mb-3 transition-all duration-200 ${
                selectedCarrier === null
                  ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-lg'
                  : 'bg-white/50 hover:bg-white/70 text-gray-700'
              }`}
            >
              <div className="flex items-center gap-3">
                <Building2 size={20} />
                <div className="text-left">
                  <div className="font-medium">All Carriers</div>
                  <div className="text-xs opacity-75">
                    {carriersLoading ? 'Loading...' : `${carriers.length} carriers`}
                  </div>
                </div>
              </div>
              <ChevronRight size={16} />
            </button>

            {/* Individual Carriers */}
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {carriersLoading ? (
                <div className="text-center py-4 text-gray-500">Loading carriers...</div>
              ) : (
                carriers.map((carrier) => (
                  <button
                    key={carrier.id}
                    onClick={() => setSelectedCarrier(carrier.id)}
                    className={`w-full flex items-center justify-between p-4 rounded-xl transition-all duration-200 ${
                      selectedCarrier === carrier.id
                        ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-lg'
                        : 'bg-white/50 hover:bg-white/70 text-gray-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Building2 size={20} />
                      <div className="text-left">
                        <div className="font-medium">{carrier.name}</div>
                        <div className="text-xs opacity-75">
                          {formatCurrency(carrier.total_commission)}
                        </div>
                      </div>
                    </div>
                    <ChevronRight size={16} />
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Content */}
        <div className="lg:col-span-3">
          {/* Stats Cards */}
          <div className={`grid gap-8 mb-8 ${selectedCarrier === null ? 'grid-cols-1 md:grid-cols-2 max-w-4xl mx-auto' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4'}`}>
            <div className={`glass rounded-2xl shadow-lg ${selectedCarrier === null ? 'p-8' : 'p-6'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className={`font-medium text-gray-600 ${selectedCarrier === null ? 'text-base' : 'text-sm'}`}>Total Invoice Amount</p>
                  <p className={`font-bold text-gray-800 ${selectedCarrier === null ? 'text-4xl' : 'text-2xl'}`}>
                    {currentStatsLoading ? '...' : formatCurrency(currentStats?.total_invoice || 0)}
                  </p>
                </div>
                <div className={`bg-blue-100 rounded-xl ${selectedCarrier === null ? 'p-4' : 'p-3'}`}>
                  <DollarSign className="text-blue-600" size={selectedCarrier === null ? 32 : 24} />
                </div>
              </div>
            </div>

            <div className={`glass rounded-2xl shadow-lg ${selectedCarrier === null ? 'p-8' : 'p-6'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className={`font-medium text-gray-600 ${selectedCarrier === null ? 'text-base' : 'text-sm'}`}>Total Commission Earned</p>
                  <p className={`font-bold text-green-600 ${selectedCarrier === null ? 'text-4xl' : 'text-2xl'}`}>
                    {currentStatsLoading ? '...' : formatCurrency(currentStats?.total_commission || 0)}
                  </p>
                </div>
                <div className={`bg-green-100 rounded-xl ${selectedCarrier === null ? 'p-4' : 'p-3'}`}>
                  <TrendingUp className="text-green-600" size={selectedCarrier === null ? 32 : 24} />
                </div>
              </div>
            </div>

            <div className={`glass rounded-2xl shadow-lg ${selectedCarrier === null ? 'p-8' : 'p-6'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className={`font-medium text-gray-600 ${selectedCarrier === null ? 'text-base' : 'text-sm'}`}>Total Carriers</p>
                  <p className={`font-bold text-purple-600 ${selectedCarrier === null ? 'text-4xl' : 'text-2xl'}`}>
                    {currentStatsLoading ? '...' : currentStats?.total_carriers || 0}
                  </p>
                </div>
                <div className={`bg-purple-100 rounded-xl ${selectedCarrier === null ? 'p-4' : 'p-3'}`}>
                  <Building2 className="text-purple-600" size={selectedCarrier === null ? 32 : 24} />
                </div>
              </div>
            </div>

            <div className={`glass rounded-2xl shadow-lg ${selectedCarrier === null ? 'p-8' : 'p-6'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className={`font-medium text-gray-600 ${selectedCarrier === null ? 'text-base' : 'text-sm'}`}>Total Companies</p>
                  <p className={`font-bold text-orange-600 ${selectedCarrier === null ? 'text-4xl' : 'text-2xl'}`}>
                    {currentStatsLoading ? '...' : currentStats?.total_companies || 0}
                  </p>
                </div>
                <div className={`bg-orange-100 rounded-xl ${selectedCarrier === null ? 'p-4' : 'p-3'}`}>
                  <Users className="text-orange-600" size={selectedCarrier === null ? 32 : 24} />
                </div>
              </div>
            </div>
          </div>

          {/* Data Table - Only show when a specific carrier is selected */}
          {selectedCarrier !== null && (
            <div className="glass rounded-2xl shadow-lg overflow-hidden">
            {/* Table Header */}
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-semibold text-gray-800">
                    {selectedCarrier ? `${carrierData?.carrier_name || 'Carrier'} Commission Data` : 'All Commission Data'}
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">
                    {filteredData.length} records found
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                    <input
                      type="text"
                      placeholder="Search companies..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10 pr-4 py-2 text-sm bg-white/50 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </div>
                  <button className="p-2 text-gray-500 hover:text-gray-700 hover:bg-white/50 rounded-lg transition-colors">
                    <Download size={16} />
                  </button>
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {!selectedCarrier && (
                        <button
                          onClick={() => handleSort('carrier_name')}
                          className="flex items-center gap-1 hover:text-gray-700 transition-colors"
                        >
                          Carrier
                          {sortField === 'carrier_name' && (
                            sortDirection === 'asc' ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />
                          )}
                        </button>
                      )}
                      {selectedCarrier && (
                        <button
                          onClick={() => handleSort('client_name')}
                          className="flex items-center gap-1 hover:text-gray-700 transition-colors"
                        >
                          Company
                          {sortField === 'client_name' && (
                            sortDirection === 'asc' ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />
                          )}
                        </button>
                      )}
                    </th>
                    {!selectedCarrier && (
                      <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <button
                          onClick={() => handleSort('client_name')}
                          className="flex items-center gap-1 hover:text-gray-700 transition-colors"
                        >
                          Company
                          {sortField === 'client_name' && (
                            sortDirection === 'asc' ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />
                          )}
                        </button>
                      </th>
                    )}
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <button
                        onClick={() => handleSort('invoice_total')}
                        className="flex items-center gap-1 hover:text-gray-700 transition-colors"
                      >
                        Invoice Total
                        {sortField === 'invoice_total' && (
                          sortDirection === 'asc' ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />
                        )}
                      </button>
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <button
                        onClick={() => handleSort('commission_earned')}
                        className="flex items-center gap-1 hover:text-gray-700 transition-colors"
                      >
                        Commission Earned
                        {sortField === 'commission_earned' && (
                          sortDirection === 'asc' ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />
                        )}
                      </button>
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <button
                        onClick={() => handleSort('statement_count')}
                        className="flex items-center gap-1 hover:text-gray-700 transition-colors"
                      >
                        Statements
                        {sortField === 'statement_count' && (
                          sortDirection === 'asc' ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />
                        )}
                      </button>
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Last Updated
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Edit
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {(carrierDataLoading || allDataLoading) ? (
                    <tr>
                      <td colSpan={selectedCarrier ? 6 : 7} className="px-6 py-8 text-center text-gray-500">
                        Loading commission data...
                      </td>
                    </tr>
                  ) : paginatedData.length === 0 ? (
                    <tr>
                      <td colSpan={selectedCarrier ? 6 : 7} className="px-6 py-8 text-center text-gray-500">
                        No commission data found
                      </td>
                    </tr>
                  ) : (
                    paginatedData.map((item: CommissionData) => (
                      <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {!selectedCarrier ? item.carrier_name : item.client_name}
                        </td>
                        {!selectedCarrier && (
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {item.client_name}
                          </td>
                        )}
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {formatCurrency(item.invoice_total)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-green-600">
                          {formatCurrency(item.commission_earned)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            {item.statement_count}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {item.last_updated ? formatDate(item.last_updated) : 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button 
                            onClick={() => handleEditCommission(item)}
                            className="text-blue-600 hover:text-blue-900 transition-colors p-1 hover:bg-blue-50 rounded"
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

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-6 py-4 border-t border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-700">
                    Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, filteredData.length)} of {filteredData.length} results
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      disabled={currentPage === 1}
                      className="px-3 py-1 text-sm bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Previous
                    </button>
                    <span className="px-3 py-1 text-sm text-gray-700">
                      Page {currentPage} of {totalPages}
                    </span>
                    <button
                      onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                      disabled={currentPage === totalPages}
                      className="px-3 py-1 text-sm bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        </div>
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
