'use client'
import React, { useState, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Users, 
  Building2,
  DollarSign,
  FileText,
  ChevronRight,
  Download,
  Filter,
  BarChart3,
  Eye,
  Search,
  X,
  ChevronUp
} from 'lucide-react';
import { 
  TableHeader,
  TableRow,
  ExpandableRow,
  TableSearch,
  TablePagination,
  EmptyState,
  LoadingSkeleton,
  formatTableCurrency,
  sortTableData,
  filterTableData,
  CommissionRateBadge,
  ExpandButton,
  TableColumn
} from './shared/PremiumTableShared';
import { InteractiveLineChart } from '../dashboardTab/InteractiveLineChart';
import { 
  staggerContainer, 
  premiumSpring, 
  dropdownContentVariants, 
  dropdownItemVariants 
} from '../dashboardTab/animations';
import { cn } from '@/lib/utils';

// ============================================
// TYPES & INTERFACES
// ============================================

interface CommissionData {
  id: string;
  carrier_name?: string;
  client_name: string;
  invoice_total: number;
  commission_earned: number;
  statement_count: number;
  upload_ids?: string[];
  approved_statement_count?: number;
  statement_date?: string;
  statement_month?: number;
  statement_year?: number;
  monthly_breakdown?: {
    jan: number; feb: number; mar: number; apr: number;
    may: number; jun: number; jul: number; aug: number;
    sep: number; oct: number; nov: number; dec: number;
  };
  last_updated?: string;
  created_at?: string;
}

interface CarrierGroup {
  carrierName: string;
  companies: CommissionData[];
  totalCommission: number;
  totalInvoice: number;
  companyCount: number;
  statementCount: number;
}

interface EnrichedCarrier extends CarrierGroup {
  id: string;
  avgPerCompany: number;
  commissionRate: number;
  topCompany?: CommissionData;
  monthlyBreakdown: {
    jan: number; feb: number; mar: number; apr: number;
    may: number; jun: number; jul: number; aug: number;
    sep: number; oct: number; nov: number; dec: number;
  };
}

interface CarriersTableViewProps {
  carriers: CarrierGroup[];
  loading?: boolean;
  navigationContext?: {
    source: 'carrier' | 'company' | null;
    sourceId: string | null;
    targetId: string | null;
  };
  onViewCompany?: (company: CommissionData) => void;
  onEditCompany?: (company: CommissionData) => void;
  onViewInCompanies?: (carrierName: string) => void;
}

// ============================================
// MONTHLY CELL COMPONENT
// ============================================

interface MonthlyCellProps {
  value: number;
  month: string;
  maxValue: number;
  index: number;
}

const formatCurrencyCompact = (value: number): string => {
  if (value === 0) return '$0';
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
};

const MonthlyCell: React.FC<MonthlyCellProps> = ({ value, month, maxValue, index }) => {
  const percentage = maxValue > 0 ? (value / maxValue) * 100 : 0;
  
  let bgColor = 'bg-white dark:bg-slate-800';
  let borderColor = 'border-slate-300/40 dark:border-slate-600/40';
  let textColor = 'text-slate-700 dark:text-slate-200';
  
  if (value > 0) {
    if (percentage >= 80) {
      bgColor = 'bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-500/20 dark:to-green-500/20';
      borderColor = 'border-emerald-300 dark:border-emerald-500/50';
      textColor = 'text-emerald-700 dark:text-emerald-300';
    } else if (percentage >= 50) {
      bgColor = 'bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-500/20 dark:to-indigo-500/20';
      borderColor = 'border-blue-300 dark:border-blue-500/50';
      textColor = 'text-blue-700 dark:text-blue-300';
    } else if (percentage >= 20) {
      bgColor = 'bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-500/20 dark:to-yellow-500/20';
      borderColor = 'border-amber-300 dark:border-amber-500/50';
      textColor = 'text-amber-700 dark:text-amber-300';
    } else {
      bgColor = 'bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-700/20 dark:to-slate-600/20';
      borderColor = 'border-slate-300/60 dark:border-slate-500/40';
      textColor = 'text-slate-600 dark:text-slate-300';
    }
  }

  return (
    <div className="relative group h-full flex items-center justify-center">
      <div className={cn(
        "w-full py-2 px-1 rounded-md border shadow-sm transition-all duration-200",
        bgColor,
        borderColor,
        "group-hover:shadow-md group-hover:scale-105"
      )}>
        <div className={cn("text-sm font-bold text-center tabular-nums", textColor)}>
          {formatCurrencyCompact(value)}
        </div>
      </div>
      
      {/* Tooltip */}
      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-3 px-4 py-2.5 bg-gradient-to-br from-slate-900 to-slate-800 dark:from-slate-100 dark:to-slate-50 text-white dark:text-slate-900 text-xs font-medium rounded-xl shadow-2xl opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none whitespace-nowrap z-50 border border-slate-700 dark:border-slate-300">
        <div className="font-bold text-sm mb-1">{month} 2025</div>
        <div className="text-emerald-400 dark:text-emerald-600 font-semibold text-base">{formatTableCurrency(value)}</div>
        <div className="text-white/70 dark:text-slate-600 text-xs mt-1">{percentage.toFixed(1)}% of max</div>
        <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-px">
          <div className="border-[6px] border-transparent border-t-slate-800 dark:border-t-slate-100"></div>
        </div>
      </div>
    </div>
  );
};

const calculateMaxMonthly = (carrier: EnrichedCarrier): number => {
  const values = Object.values(carrier.monthlyBreakdown || {});
  return Math.max(...values, 0);
};

// ============================================
// HORIZONTAL BAR CHART COMPONENT
// ============================================

interface BarChartData {
  label: string;
  value: number;
  color?: string;
}

interface HorizontalBarChartProps {
  data: BarChartData[];
  height?: number;
}

function HorizontalBarChart({ data, height = 300 }: HorizontalBarChartProps) {
  const maxValue = Math.max(...data.map(d => d.value));
  
  // Sort by value descending and take top 10
  const sortedData = [...data]
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  return (
    <div className="w-full" style={{ height }}>
      <div className="space-y-3">
        {sortedData.map((item, index) => {
          const percentage = (item.value / maxValue) * 100;
          const color = item.color || getColorByIndex(index);
          
          return (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05, ...premiumSpring }}
              className="relative"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate max-w-[200px]">
                  {item.label}
                </span>
                <span className="text-sm font-semibold text-slate-900 dark:text-white tabular-nums">
                  {formatTableCurrency(item.value)}
                </span>
              </div>
              <div className="relative h-6 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${percentage}%` }}
                  transition={{ duration: 0.8, delay: index * 0.05, ease: [0.4, 0, 0.2, 1] }}
                  className={cn("absolute inset-y-0 left-0 rounded-full", color)}
                  style={{ 
                    background: `linear-gradient(to right, ${color}, ${adjustColor(color, 20)})`
                  }}
                />
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function getColorByIndex(index: number): string {
  const colors = [
    'rgb(59, 130, 246)',   // blue
    'rgb(16, 185, 129)',   // emerald
    'rgb(168, 85, 247)',   // purple
    'rgb(236, 72, 153)',   // pink
    'rgb(251, 146, 60)',   // orange
    'rgb(250, 204, 21)',   // yellow
    'rgb(14, 165, 233)',   // sky
    'rgb(99, 102, 241)',   // indigo
    'rgb(34, 197, 94)',    // green
    'rgb(239, 68, 68)'     // red
  ];
  return colors[index % colors.length];
}

function adjustColor(color: string, percent: number): string {
  // Simple color adjustment for gradient effect
  return color.replace(/\d+(?=\))/g, (match) => {
    const adjusted = parseInt(match) + percent;
    return Math.min(255, Math.max(0, adjusted)).toString();
  });
}

// ============================================
// VIRTUALIZED COMPANY LIST COMPONENT
// ============================================

interface VirtualizedCompanyListProps {
  carrier: string;
  companies: CommissionData[];
  navigationContext?: {
    source: 'carrier' | 'company' | null;
    sourceId: string | null;
    targetId: string | null;
  };
  onView?: (company: CommissionData) => void;
  onEdit?: (company: CommissionData) => void;
  onViewInCompanies?: (company: CommissionData) => void;
}

function VirtualizedCompanyList({ 
  carrier,
  companies, 
  navigationContext,
  onView, 
  onEdit,
  onViewInCompanies 
}: VirtualizedCompanyListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [displayCount, setDisplayCount] = useState(20);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Filter companies based on search
  const filteredCompanies = useMemo(() => {
    if (!searchQuery) return companies;
    return companies.filter(c => 
      c.client_name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [companies, searchQuery]);

  // Group companies by commission range
  const groupedCompanies = useMemo(() => {
    const sorted = [...filteredCompanies].sort((a, b) => b.commission_earned - a.commission_earned);
    const high = sorted.filter(c => c.commission_earned > 5000);
    const medium = sorted.filter(c => c.commission_earned >= 1000 && c.commission_earned <= 5000);
    const low = sorted.filter(c => c.commission_earned < 1000);
    
    return [
      { title: 'High Performers', companies: high, color: 'emerald' },
      { title: 'Medium Performers', companies: medium, color: 'blue' },
      { title: 'Low Performers', companies: low, color: 'gray' }
    ].filter(group => group.companies.length > 0);
  }, [filteredCompanies]);

  // Handle scroll for virtual loading
  const handleScroll = useCallback(() => {
    if (containerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
      if (scrollHeight - scrollTop - clientHeight < 100 && displayCount < filteredCompanies.length) {
        setDisplayCount(prev => Math.min(prev + 20, filteredCompanies.length));
      }
    }
  }, [displayCount, filteredCompanies.length]);

  return (
    <div className="virtual-company-list">
      {/* Sticky Search */}
      <div className="sticky top-0 z-20 bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-gray-700 p-4 -mx-4 -mt-4 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Search ${companies.length} companies...`}
            className="w-full pl-10 pr-10 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 transform -translate-y-1/2"
            >
              <X className="w-4 h-4 text-gray-400 hover:text-gray-600" />
            </button>
          )}
        </div>
        {searchQuery && (
          <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            {filteredCompanies.length} matches
          </div>
        )}
      </div>

      {/* Grouped Virtual List */}
      <div 
        ref={containerRef}
        className="virtual-scroll-container" 
        onScroll={handleScroll}
      >
        {groupedCompanies.map((group, groupIndex) => (
          <div key={group.title}>
            {/* Section Header */}
            <div className="sticky top-0 z-10 px-4 py-2 bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-gray-700 -mx-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                  {group.title}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {group.companies.length}
                </span>
              </div>
            </div>

            {/* Company List */}
            <div className="space-y-1 py-2">
              {group.companies.slice(0, displayCount).map((company, index) => {
                const isHighlighted = navigationContext?.targetId === company.id;
                const rate = company.invoice_total > 0 ? (company.commission_earned / company.invoice_total) * 100 : 0;
                
                return (
                  <motion.div
                    key={company.id}
                    id={`company-${company.id}`}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.02, ...premiumSpring }}
                    whileHover={{ x: 4, backgroundColor: 'rgba(59, 130, 246, 0.05)' }}
                    className={cn(
                      "company-row-virtualized flex items-center justify-between px-4 h-14 border-b border-gray-100 dark:border-gray-700",
                      isHighlighted && "highlight-pulse"
                    )}
                  >
                    <div className="flex items-center gap-3 flex-1">
                      <Building2 className="w-4 h-4 text-gray-400" />
                      <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-white">{company.client_name}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{company.statement_count} statements</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="text-sm font-semibold tabular-nums text-slate-900 dark:text-white">
                          {formatTableCurrency(company.commission_earned)}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {rate.toFixed(1)}% rate
                        </div>
                      </div>
                      {onViewInCompanies && (
                        <button
                          onClick={() => onViewInCompanies(company)}
                          className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                        >
                          <ChevronRight className="w-4 h-4 text-gray-400" />
                        </button>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        ))}
        
        {/* Load More Indicator */}
        {displayCount < filteredCompanies.length && (
          <div className="text-center py-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Showing {displayCount} of {filteredCompanies.length} companies
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// MONTHLY BREAKDOWN CHART COMPONENT
// ============================================

interface MonthlyBreakdownChartProps {
  carrier: EnrichedCarrier;
}

function MonthlyBreakdownChart({ carrier }: MonthlyBreakdownChartProps) {
  // Aggregate monthly data from all companies and transform for line chart
  const chartData = useMemo(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthKeys = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    
    return months.map((month, index) => {
      const total = carrier.companies.reduce((sum, company) => {
        if (company.monthly_breakdown) {
          return sum + (company.monthly_breakdown[monthKeys[index] as keyof typeof company.monthly_breakdown] || 0);
        }
        return sum;
      }, 0);
      
      return {
        month,
        value: total
      };
    });
  }, [carrier]);

  // Check if there's any data
  const hasData = chartData.some(item => item.value > 0);

  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-400">
        <BarChart3 className="w-12 h-12 mb-2 opacity-30" />
        <p className="text-sm">No monthly data available</p>
      </div>
    );
  }

  return (
    <div className="w-full" style={{ height: '280px' }}>
      <InteractiveLineChart data={chartData} />
    </div>
  );
}

// ============================================
// CARRIER EXPANDED CONTENT COMPONENT - SMART SUMMARY
// ============================================

interface CarrierExpandedContentProps {
  carrier: EnrichedCarrier;
  onViewInCompanies?: () => void;
}

const CarrierExpandedContent: React.FC<CarrierExpandedContentProps> = ({ 
  carrier, 
  onViewInCompanies 
}) => {
  // Get top 5 companies
  const topCompanies = carrier.companies
    .sort((a, b) => b.commission_earned - a.commission_earned)
    .slice(0, 5);
  
  // Calculate summary stats
  const totalMonthlyCommission = carrier.companies.reduce((sum, c) => {
    const monthly = Object.values(c.monthly_breakdown || {});
    return sum + monthly.reduce((a, b) => a + b, 0);
  }, 0);
  
  const avgMonthly = totalMonthlyCommission / 12;

  return (
    <motion.div
      className="relative bg-gradient-to-br from-slate-50 to-white dark:from-slate-800 dark:to-slate-900 border-l-4 border-blue-500 mx-4 my-2 rounded-lg shadow-lg"
      variants={dropdownContentVariants}
      initial="collapsed"
      animate="expanded"
      exit="collapsed"
    >
      {/* Blue accent glow */}
      <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-purple-500/5 to-transparent pointer-events-none rounded-lg" />
      
      <div className="relative p-6">
        
        {/* Header with View All button */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-blue-500" />
              {carrier.carrierName}
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {carrier.companyCount} {carrier.companyCount === 1 ? 'company' : 'companies'} • {carrier.statementCount} statements
            </p>
          </div>
          
          {onViewInCompanies && (
            <button
              onClick={onViewInCompanies}
              className="flex items-center gap-2 px-5 py-3 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-lg transition-all hover:shadow-lg hover:scale-105"
            >
              <Eye className="w-4 h-4" />
              <span>View Full Details</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Summary Stats Grid */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <motion.div 
            variants={dropdownItemVariants}
            className="bg-white dark:bg-slate-800 p-4 rounded-lg border border-slate-200 dark:border-slate-700"
          >
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-2">
              <DollarSign className="w-4 h-4" />
              Total Commission
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
              {formatTableCurrency(carrier.totalCommission)}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {formatTableCurrency(avgMonthly)}/month
            </div>
          </motion.div>

          <motion.div 
            variants={dropdownItemVariants}
            className="bg-white dark:bg-slate-800 p-4 rounded-lg border border-slate-200 dark:border-slate-700"
          >
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-2">
              <Users className="w-4 h-4" />
              Avg per Company
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
              {formatTableCurrency(carrier.avgPerCompany)}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              across {carrier.companyCount} companies
            </div>
          </motion.div>

          <motion.div 
            variants={dropdownItemVariants}
            className="bg-white dark:bg-slate-800 p-4 rounded-lg border border-slate-200 dark:border-slate-700"
          >
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-2">
              <FileText className="w-4 h-4" />
              Total Invoice
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
              {formatTableCurrency(carrier.totalInvoice)}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              billed amount
            </div>
          </motion.div>

          <motion.div 
            variants={dropdownItemVariants}
            className="bg-white dark:bg-slate-800 p-4 rounded-lg border border-slate-200 dark:border-slate-700"
          >
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-2">
              <BarChart3 className="w-4 h-4" />
              Commission Rate
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
              {carrier.commissionRate.toFixed(1)}%
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              overall rate
            </div>
          </motion.div>
        </div>

        {/* Monthly Breakdown Section */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Monthly Commission Breakdown
            </h4>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-5">
            <MonthlyBreakdownChart carrier={carrier} />
          </div>
        </div>

        {/* Top 5 Companies */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
              Top Performing Companies
            </h4>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Showing {topCompanies.length} of {carrier.companyCount}
            </span>
          </div>
          
          <div className="space-y-2">
            {topCompanies.map((company, index) => (
              <motion.div
                key={company.id}
                variants={dropdownItemVariants}
                className="flex items-center justify-between p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600 transition-colors"
              >
                <div className="flex items-center gap-3 flex-1">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {company.client_name}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {company.statement_count} statements
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                    {formatTableCurrency(company.commission_earned)}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {((company.commission_earned / carrier.totalCommission) * 100).toFixed(1)}% of total
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Bottom CTA */}
        {carrier.companyCount > 5 && onViewInCompanies && (
          <motion.div 
            variants={dropdownItemVariants}
            className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                  {carrier.companyCount - 5} more {carrier.companyCount - 5 === 1 ? 'company' : 'companies'}
                </div>
                <div className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                  View complete list with filters and search
                </div>
              </div>
              <button
                onClick={onViewInCompanies}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold rounded-lg transition-all"
              >
                View All
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
        
      </div>
    </motion.div>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

export default function CarriersTableView({ 
  carriers, 
  loading = false,
  navigationContext,
  onViewCompany,
  onEditCompany,
  onViewInCompanies
}: CarriersTableViewProps) {
  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({
    key: 'carrierName',
    direction: 'asc'
  });
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Enrich carrier data
  const enrichedCarriers: EnrichedCarrier[] = useMemo(() => {
    return carriers.map(carrier => {
      // Calculate monthly breakdown by aggregating all companies
      const monthlyBreakdown = {
        jan: 0, feb: 0, mar: 0, apr: 0,
        may: 0, jun: 0, jul: 0, aug: 0,
        sep: 0, oct: 0, nov: 0, dec: 0
      };
      
      carrier.companies.forEach(company => {
        if (company.monthly_breakdown) {
          Object.keys(monthlyBreakdown).forEach(month => {
            monthlyBreakdown[month as keyof typeof monthlyBreakdown] += 
              (company.monthly_breakdown?.[month as keyof typeof company.monthly_breakdown] || 0);
          });
        }
      });

      return {
        ...carrier,
        id: carrier.carrierName,
        avgPerCompany: carrier.companyCount > 0 ? carrier.totalCommission / carrier.companyCount : 0,
        commissionRate: carrier.totalInvoice > 0 ? (carrier.totalCommission / carrier.totalInvoice) * 100 : 0,
        topCompany: carrier.companies.sort((a, b) => b.commission_earned - a.commission_earned)[0],
        monthlyBreakdown
      };
    });
  }, [carriers]);

  // Apply search
  const filteredData = useMemo(() => {
    if (!searchQuery) return enrichedCarriers;
    
    return enrichedCarriers.filter(carrier => 
      carrier.carrierName.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [enrichedCarriers, searchQuery]);

  // Sort data
  const sortedData = useMemo(() => {
    return sortTableData(filteredData, sortConfig.key, sortConfig.direction);
  }, [filteredData, sortConfig]);

  // Paginate data
  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return sortedData.slice(startIndex, startIndex + pageSize);
  }, [sortedData, currentPage, pageSize]);

  const totalPages = Math.ceil(sortedData.length / pageSize);

  // Handlers
  const handleSort = (key: string) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const toggleRow = (carrierName: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(carrierName)) {
        next.delete(carrierName);
      } else {
        next.add(carrierName);
      }
      return next;
    });
  };

  const handleExport = () => {
    // TODO: Implement export functionality
    console.log('Export carriers data');
  };

  // Monthly column names
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Table columns configuration
  const columns: TableColumn<EnrichedCarrier>[] = [
    {
      key: 'expand',
      label: '',
      width: '48px',
      align: 'center',
      className: 'px-3',
      format: (_, row) => (
        <ExpandButton 
          isExpanded={expandedRows.has(row.carrierName)}
          onClick={() => toggleRow(row.carrierName)}
        />
      )
    },
    {
      key: 'carrierName',
      label: 'Carrier Name',
      sortable: true,
      width: '220px',
      align: 'left',
      className: 'sticky left-0 z-10 font-semibold carrier-name-sticky',
      format: (value) => (
        <div className="flex items-center gap-3 py-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold">
            {value.charAt(0).toUpperCase()}
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {value}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Insurance Carrier
            </span>
          </div>
        </div>
      )
    },
    // Monthly columns
    ...monthNames.map((month, index) => ({
      key: `monthlyBreakdown.${month.toLowerCase()}`,
      label: month,
      sortable: true,
      align: 'center' as const,
      width: '90px',
      className: cn(
        'px-2',
        index % 3 === 0 && 'border-l-2 border-slate-300 dark:border-slate-600'
      ),
      format: (value: any, row: EnrichedCarrier) => {
        const monthValue = row.monthlyBreakdown[month.toLowerCase() as keyof typeof row.monthlyBreakdown] || 0;
        return (
          <MonthlyCell 
            value={monthValue}
            month={month}
            maxValue={calculateMaxMonthly(row)}
            index={index}
          />
        );
      }
    })),
    // Total YTD
    {
      key: 'totalCommission',
      label: 'Total YTD',
      sortable: true,
      align: 'right' as const,
      width: '160px',
      className: 'px-4 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-500/20 dark:to-indigo-500/20 border-l-2 border-blue-300 dark:border-blue-500',
      format: (value) => (
        <span className="text-lg font-extrabold bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-300 dark:to-indigo-300 bg-clip-text text-transparent tabular-nums">
          {formatTableCurrency(value)}
        </span>
      )
    }
  ];

  return (
    <div className="space-y-4">
      {/* Header Section */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 flex-1">
          <div className="w-96">
            <TableSearch
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search carriers..."
            />
          </div>
          <button className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-2">
            <Filter className="w-4 h-4" />
            Filters
          </button>
        </div>
        <button 
          onClick={handleExport}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-2"
        >
          <Download className="w-4 h-4" />
          Export
        </button>
      </div>

      {/* Table Container */}
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 overflow-visible"
      >
        <div className="overflow-x-auto overflow-y-visible">
          <table className="w-full premium-data-table">
            <TableHeader
              columns={columns}
              sortConfig={sortConfig}
              onSort={handleSort}
            />
            
            {loading ? (
              <LoadingSkeleton rows={pageSize} columns={columns.length} />
            ) : paginatedData.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={columns.length}>
                    <EmptyState
                      icon={<Users className="w-12 h-12 text-slate-400" />}
                      title="No carriers found"
                      description="Try adjusting your search terms"
                    />
                  </td>
                </tr>
              </tbody>
            ) : (
              <tbody>
                {paginatedData.map((carrier, index) => (
                  <React.Fragment key={carrier.carrierName}>
                    <TableRow
                      data={carrier}
                      columns={columns}
                      index={index}
                      isExpanded={expandedRows.has(carrier.carrierName)}
                      onToggleExpand={() => toggleRow(carrier.carrierName)}
                      expandable
                    />
                    
                    {/* ⚡ Expandable Row with proper overflow */}
                    <ExpandableRow 
                      isExpanded={expandedRows.has(carrier.carrierName)} 
                      colSpan={columns.length}
                    >
                      <CarrierExpandedContent
                        carrier={carrier}
                        onViewInCompanies={() => {
                          // Navigate to Companies view with this carrier pre-filtered
                          if (onViewInCompanies) {
                            onViewInCompanies(carrier.carrierName);
                          }
                        }}
                      />
                    </ExpandableRow>
                  </React.Fragment>
                ))}
              </tbody>
            )}
          </table>
        </div>
        
        {!loading && paginatedData.length > 0 && (
          <TablePagination
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={pageSize}
            totalItems={sortedData.length}
            onPageChange={setCurrentPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setCurrentPage(1);
            }}
          />
        )}
      </motion.div>
    </div>
  );
}
