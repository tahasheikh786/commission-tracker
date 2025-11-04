'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, TrendingUp, TrendingDown, ExternalLink } from 'lucide-react';

interface Company {
  name: string;
  commission: number;
  growth: number;
  statements: number;
  lastUpdated: string;
}

interface TopCompaniesTableProps {
  data?: Company[];
  limit?: number;
}

export default function TopCompaniesTable({ data, limit = 10 }: TopCompaniesTableProps) {
  const router = useRouter();
  const [sortBy, setSortBy] = useState<'commission' | 'growth'>('commission');

  // Sort and limit to top 10
  const topCompanies = useMemo(() => {
    if (!data || data.length === 0) return [];
    
    const sorted = [...data].sort((a, b) => {
      if (sortBy === 'commission') {
        return b.commission - a.commission;
      }
      return b.growth - a.growth;
    });
    
    return sorted.slice(0, limit);
  }, [data, sortBy, limit]);

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            Top {limit} Companies
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Highest earning companies by commission
          </p>
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

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full premium-table">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700">
              <th className="text-left text-sm font-medium text-slate-500 dark:text-slate-400 pb-3">
                Rank
              </th>
              <th className="text-left text-sm font-medium text-slate-500 dark:text-slate-400 pb-3">
                Company
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
            {topCompanies.map((company, index) => {
              return (
                <tr 
                  key={company.name}
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
                  onClick={() => {
                    // Navigate to earned commission companies tab with company filter and auto-expand
                    router.push(`/?tab=earned-commission-companies&company=${encodeURIComponent(company.name)}&autoExpand=true`);
                  }}
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

                {/* Company Name */}
                <td className="py-4">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-slate-400" />
                    <span className="font-medium text-slate-900 dark:text-white">
                      {company.name}
                    </span>
                  </div>
                </td>

                {/* Commission */}
                <td className="py-4 text-right">
                  <span className="text-lg font-semibold text-slate-900 dark:text-white">
                    ${(company.commission / 1000).toFixed(1)}K
                  </span>
                </td>

                {/* Growth */}
                <td className="py-4 text-right">
                  <span className={`inline-flex items-center gap-1 text-sm font-medium ${
                    company.growth > 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}>
                    {company.growth > 0 ? (
                      <TrendingUp className="w-4 h-4" />
                    ) : (
                      <TrendingDown className="w-4 h-4" />
                    )}
                    {company.growth > 0 ? '+' : ''}{company.growth}%
                  </span>
                </td>

                {/* Statements */}
                <td className="py-4 text-right text-sm text-slate-600 dark:text-slate-400">
                  {company.statements}
                </td>

                {/* Action */}
                <td className="py-4 text-right">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/?tab=earned-commission-companies&company=${encodeURIComponent(company.name)}&autoExpand=true`);
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
          Showing top {topCompanies.length} of {data?.length || 0} companies
        </span>
        <button className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium">
          View All Companies →
        </button>
      </div>
    </div>
  );
}
