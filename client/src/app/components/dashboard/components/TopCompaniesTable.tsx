'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, TrendingUp, TrendingDown, ExternalLink, Truck } from 'lucide-react';

interface Company {
  name: string;
  commission: number;
  growth: number;
  statements: number;
  lastUpdated: string;
}

interface Carrier {
  carriers: string[];
  amounts: number[];
  percentages: number[];
  growth: number[];
  statements: number[];
}

interface TopCompaniesTableProps {
  data?: Company[];
  carriersData?: Carrier;
  limit?: number;
}

export default function TopCompaniesTable({ data, carriersData, limit = 10 }: TopCompaniesTableProps) {
  const router = useRouter();
  const [sortBy, setSortBy] = useState<'commission' | 'growth'>('commission');
  const [viewMode, setViewMode] = useState<'companies' | 'carriers'>('companies');

  // Transform carriers data to match company format
  const carriersAsCompanies = useMemo(() => {
    if (!carriersData || !carriersData.carriers || carriersData.carriers.length === 0) return [];
    
    return carriersData.carriers.map((name, index) => ({
      name,
      commission: carriersData.amounts[index] || 0,
      growth: carriersData.growth[index] || 0,
      statements: carriersData.statements[index] || 0,
      lastUpdated: new Date().toISOString()
    }));
  }, [carriersData]);

  // Sort and limit to top 10
  const topItems = useMemo(() => {
    const sourceData = viewMode === 'companies' ? data : carriersAsCompanies;
    if (!sourceData || sourceData.length === 0) return [];
    
    const sorted = [...sourceData].sort((a, b) => {
      if (sortBy === 'commission') {
        return b.commission - a.commission;
      }
      return b.growth - a.growth;
    });
    
    return sorted.slice(0, limit);
  }, [data, carriersAsCompanies, sortBy, limit, viewMode]);

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            Top {limit} {viewMode === 'companies' ? 'Companies' : 'Carriers'}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Highest earning {viewMode === 'companies' ? 'companies' : 'carriers'} by commission
          </p>
        </div>

        <div className="flex gap-4">
          {/* View Mode Toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('companies')}
              className={`px-3 py-1 text-sm rounded transition flex items-center gap-1.5 ${
                viewMode === 'companies'
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              Companies
            </button>
            <button
              onClick={() => setViewMode('carriers')}
              className={`px-3 py-1 text-sm rounded transition flex items-center gap-1.5 ${
                viewMode === 'carriers'
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              <Truck className="w-3.5 h-3.5" />
              Carriers
            </button>
          </div>

          {/* Sort Toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => setSortBy('commission')}
              className={`px-3 py-1 text-sm rounded transition ${
                sortBy === 'commission'
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              By Commission
            </button>
            <button
              onClick={() => setSortBy('growth')}
              className={`px-3 py-1 text-sm rounded transition ${
                sortBy === 'growth'
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              By Growth
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full premium-table">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700">
              <th className="text-left text-sm font-medium text-slate-500 dark:text-slate-400 pb-3">
                Rank
              </th>
              <th className="text-left text-sm font-medium text-slate-500 dark:text-slate-400 pb-3">
                {viewMode === 'companies' ? 'Company' : 'Carrier'}
              </th>
              <th className="text-right text-sm font-medium text-slate-500 dark:text-slate-400 pb-3">
                Commission
              </th>
              <th className="text-right text-sm font-medium text-slate-500 dark:text-slate-400 pb-3">
                Growth
              </th>
              <th className="text-right text-sm font-medium text-slate-500 dark:text-slate-400 pb-3">
                Statements
              </th>
              <th className="text-right text-sm font-medium text-slate-500 dark:text-slate-400 pb-3">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {topItems.map((item, index) => {
              const handleRowClick = () => {
                if (viewMode === 'companies') {
                  router.push(`/?tab=earned-commission-companies&company=${encodeURIComponent(item.name)}&autoExpand=true`);
                } else {
                  router.push(`/?tab=earned-commission-carriers&carrier=${encodeURIComponent(item.name)}&autoExpand=true`);
                }
              };

              return (
                <tr 
                  key={item.name}
                  className={`border-b border-slate-100 dark:border-slate-700/50 transition-all duration-200 cursor-pointer ${
                    // Gold - 1st place
                    index === 0 ? 'bg-yellow-50 dark:bg-yellow-900/20 hover:!bg-yellow-100 dark:hover:!bg-yellow-900/30' :
                    // Silver - 2nd place  
                    index === 1 ? 'bg-slate-50 dark:bg-slate-700/30 hover:!bg-slate-100 dark:hover:!bg-slate-700/50' :
                    // Bronze - 3rd place
                    index === 2 ? 'bg-orange-50 dark:bg-orange-900/20 hover:!bg-orange-100 dark:hover:!bg-orange-900/30' :
                    // All other rows - let premium-table global CSS handle it
                    ''
                  }`}
                  onClick={handleRowClick}
                >
                {/* Rank */}
                <td className="py-4 text-sm">
                  <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-semibold ${
                    index === 0 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                    index === 1 ? 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300' :
                    index === 2 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' :
                    'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                  }`}>
                    {index + 1}
                  </span>
                </td>

                {/* Name */}
                <td className="py-4">
                  <div className="flex items-center gap-2">
                    {viewMode === 'companies' ? (
                      <Building2 className="w-4 h-4 text-slate-400" />
                    ) : (
                      <Truck className="w-4 h-4 text-slate-400" />
                    )}
                    <span className="font-medium text-slate-900 dark:text-white">
                      {item.name}
                    </span>
                  </div>
                </td>

                {/* Commission */}
                <td className="py-4 text-right">
                  <span className="text-lg font-semibold text-slate-900 dark:text-white">
                    ${(item.commission / 1000).toFixed(1)}K
                  </span>
                </td>

                {/* Growth */}
                <td className="py-4 text-right">
                  {item.growth !== 0 ? (
                    <span className={`inline-flex items-center gap-1 text-sm font-medium ${
                      item.growth > 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}>
                      {item.growth > 0 ? (
                        <TrendingUp className="w-4 h-4" />
                      ) : (
                        <TrendingDown className="w-4 h-4" />
                      )}
                      {item.growth > 0 ? '+' : ''}{parseFloat(item.growth.toFixed(1))}%
                    </span>
                  ) : (
                    <span className="text-sm font-medium text-slate-400">
                      N/A
                    </span>
                  )}
                </td>

                {/* Statements */}
                <td className="py-4 text-right text-sm text-slate-600 dark:text-slate-400">
                  {item.statements}
                </td>

                {/* Action */}
                <td className="py-4 text-right">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRowClick();
                    }}
                    className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
        <span className="text-sm text-slate-500 dark:text-slate-400">
          Showing top {topItems.length} of {viewMode === 'companies' ? (data?.length || 0) : (carriersAsCompanies.length || 0)} {viewMode === 'companies' ? 'companies' : 'carriers'}
        </span>
        <button 
          onClick={() => {
            if (viewMode === 'companies') {
              router.push('/?tab=earned-commission-companies');
            } else {
              router.push('/?tab=earned-commission-carriers');
            }
          }}
          className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
        >
          View All {viewMode === 'companies' ? 'Companies' : 'Carriers'} →
        </button>
      </div>
    </div>
  );
}
