'use client'
import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Building2, 
  TrendingUp, 
  Calendar,
  DollarSign,
  FileText,
  ChevronRight,
  Download,
  Filter,
  Users,
  X,
  BarChart3,
  Eye,
  ArrowUpDown,
  Check
} from 'lucide-react';
import { 
  TableHeader,
  TableRow,
  ExpandableRow,
  TableSearch,
  TablePagination,
  EmptyState,
  LoadingSkeleton,
  BulkActionsBar,
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
  monthlyValueVariants,
  premiumRowVariants,
  premiumExpandVariants,
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

interface CompanyTableRow extends CommissionData {
  companyName: string;
  carrierName: string;
  year: number;
  commission: number;
  invoice: number;
  statements: number;
  rate: number;
}

interface CompaniesTableViewProps {
  data: CommissionData[];
  loading?: boolean;
  onEdit?: (company: CommissionData) => void;
  onDelete?: (ids: string[]) => void;
  onMerge?: (company: CommissionData) => void;
  navigationContext?: {
    source: 'carrier' | 'company' | null;
    sourceId: string | null;
    targetId: string | null;
  };
  onViewInCarrier?: (company: CommissionData) => void;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function formatCurrencyCompact(value: number): string {
  if (!value || value === 0) return '-';
  
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}k`;
  }
  
  return value.toFixed(0);
}

function calculateMaxMonthly(row: CompanyTableRow): number {
  if (!row.monthly_breakdown) return 0;
  
  const values = Object.values(row.monthly_breakdown);
  return Math.max(...values);
}

function calculateTrend(data: number[]): 'up' | 'down' | 'neutral' {
  if (data.length < 2) return 'neutral';
  
  const recentAvg = data.slice(-3).reduce((a, b) => a + b, 0) / 3;
  const previousAvg = data.slice(-6, -3).reduce((a, b) => a + b, 0) / 3;
  
  if (recentAvg > previousAvg * 1.05) return 'up';
  if (recentAvg < previousAvg * 0.95) return 'down';
  return 'neutral';
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

const MonthlyCell: React.FC<MonthlyCellProps> = ({ value, month, maxValue, index }) => {
  const percentage = maxValue > 0 ? (value / maxValue) * 100 : 0;
  
  if (!value || value === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-full text-center py-2 px-1 rounded-md bg-slate-100 dark:bg-slate-600/30 border border-slate-200/50 dark:border-slate-500/30">
          <span className="text-xs text-slate-400 dark:text-slate-500">—</span>
        </div>
      </div>
    );
  }

  // Determine color intensity based on percentage - optimized for both light and dark modes
  let bgColor = '';
  let textColor = '';
  let borderColor = '';
  let percentageColor = '';
  
  if (percentage >= 80) {
    bgColor = 'bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-500/25 dark:to-emerald-600/25';
    textColor = 'text-emerald-900 dark:text-emerald-100';
    borderColor = 'border-emerald-300/60 dark:border-emerald-400/40';
    percentageColor = 'text-emerald-600 dark:text-emerald-300';
  } else if (percentage >= 60) {
    bgColor = 'bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-500/25 dark:to-blue-600/25';
    textColor = 'text-blue-900 dark:text-blue-100';
    borderColor = 'border-blue-300/60 dark:border-blue-400/40';
    percentageColor = 'text-blue-600 dark:text-blue-300';
  } else if (percentage >= 40) {
    bgColor = 'bg-gradient-to-br from-indigo-50 to-indigo-100 dark:from-indigo-500/25 dark:to-indigo-600/25';
    textColor = 'text-indigo-900 dark:text-indigo-100';
    borderColor = 'border-indigo-300/60 dark:border-indigo-400/40';
    percentageColor = 'text-indigo-600 dark:text-indigo-300';
  } else if (percentage >= 20) {
    bgColor = 'bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-500/25 dark:to-purple-600/25';
    textColor = 'text-purple-900 dark:text-purple-100';
    borderColor = 'border-purple-300/60 dark:border-purple-400/40';
    percentageColor = 'text-purple-600 dark:text-purple-300';
  } else {
    bgColor = 'bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-600/30 dark:to-slate-700/30';
    textColor = 'text-slate-900 dark:text-slate-100';
    borderColor = 'border-slate-300/60 dark:border-slate-500/40';
    percentageColor = 'text-slate-600 dark:text-slate-300';
  }

  return (
    <motion.div
      className="relative group h-full flex items-center justify-center"
      custom={index}
      initial="initial"
      animate="animate"
      whileHover="hover"
      variants={monthlyValueVariants}
    >
      <div className={cn(
        "w-full py-2 px-1 rounded-md border shadow-sm transition-all duration-200",
        bgColor,
        borderColor,
        "group-hover:shadow-md group-hover:scale-105"
      )}>
        <div className={cn("text-sm font-bold text-center tabular-nums", textColor)}>
          {formatCurrencyCompact(value)}
        </div>
        <div className={cn("text-[10px] text-center font-semibold mt-0.5", percentageColor)}>
          {percentage.toFixed(0)}%
        </div>
      </div>
      
      {/* Enhanced Tooltip */}
      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-3 px-4 py-2.5 bg-gradient-to-br from-slate-900 to-slate-800 dark:from-slate-100 dark:to-slate-50 text-white dark:text-slate-900 text-xs font-medium rounded-xl shadow-2xl opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none whitespace-nowrap z-50 border border-slate-700 dark:border-slate-300">
        <div className="font-bold text-sm mb-1">{month} 2025</div>
        <div className="text-emerald-400 dark:text-emerald-600 font-semibold text-base">{formatTableCurrency(value)}</div>
        <div className="text-white/70 dark:text-slate-600 text-xs mt-1">{percentage.toFixed(1)}% of max</div>
        <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-px">
          <div className="border-[6px] border-transparent border-t-slate-800 dark:border-t-slate-100"></div>
        </div>
      </div>
    </motion.div>
  );
};

// ============================================
// MINI SPARKLINE COMPONENT
// ============================================

const MiniSparkline: React.FC<{ data: number[] }> = ({ data }) => {
  if (!data || data.length === 0) return null;

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  const points = data
    .map((value, index) => {
      const x = (index / (data.length - 1)) * 100;
      const y = 100 - ((value - min) / range) * 100;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <div className="mini-sparkline">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs>
          <linearGradient id="sparklineGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(59, 130, 246, 0.3)" />
            <stop offset="100%" stopColor="rgba(59, 130, 246, 0.05)" />
          </linearGradient>
        </defs>
        <polyline
          points={`0,100 ${points} 100,100`}
          fill="url(#sparklineGradient)"
          stroke="none"
        />
        <polyline
          points={points}
          fill="none"
          stroke="rgba(59, 130, 246, 0.8)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
};

// ============================================
// COMMISSION RATE BADGE EXTENDED
// ============================================

const CommissionRateBadgeExtended: React.FC<{ rate: number }> = ({ rate }) => {
  let className = 'commission-badge ';
  
  if (rate >= 15) {
    className += 'high';
  } else if (rate >= 10) {
    className += 'medium';
  } else if (rate >= 5) {
    className += 'low';
  } else {
    className += 'minimal';
  }

  return (
    <div className={className}>
      {rate.toFixed(1)}%
    </div>
  );
};

// ============================================
// STAT CARD COMPONENT
// ============================================

interface StatCardProps {
  label: string;
  value: string;
  amount?: string;
  icon?: React.ReactNode;
}

function StatCard({ label, value, amount, icon }: StatCardProps) {
  return (
    <motion.div
      whileHover={{ scale: 1.02, x: 4 }}
      className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3 border border-slate-200 dark:border-slate-700 transition-all duration-200 hover:shadow-md"
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">{label}</p>
        {icon && (
          <div className="flex-shrink-0">
            {icon}
          </div>
        )}
      </div>
      <p className="text-lg font-bold text-slate-900 dark:text-slate-100">
        {value}
      </p>
      {amount && (
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          {amount}
        </p>
      )}
    </motion.div>
  );
}

// ============================================
// EXPANDED COMPANY CONTENT COMPONENT
// ============================================

interface ExpandedCompanyContentProps {
  company: CompanyTableRow;
  onEdit?: () => void;
  onMerge?: () => void;
  onViewInCarrier?: () => void;
}

const ExpandedCompanyContent: React.FC<ExpandedCompanyContentProps> = ({
  company,
  onEdit,
  onMerge,
  onViewInCarrier
}) => {
  const monthlyValues = Object.values(company.monthly_breakdown || {});
  const chartData = transformMonthlyData(company.monthly_breakdown);

  return (
    <motion.div
      variants={dropdownContentVariants}
      initial="collapsed"
      animate="expanded"
      className="relative w-full bg-white dark:bg-slate-900 rounded-xl shadow-lg p-8"
      style={{
        overflow: 'visible',
        minHeight: '320px'  // ⚡ Ensure minimum height for smooth animation
      }}
    >
      {/* Blue accent border - left side only for visual hierarchy */}
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-500 via-blue-600 to-blue-700 rounded-l-xl" />
      
      {/* ⚡ FIXED: Balanced 3-6-3 grid layout instead of congested 4-5-3 */}
      <div className="grid grid-cols-12 gap-8 items-start">
        
        {/* LEFT: Key Metrics - 3 columns (25%) */}
        <motion.div 
          variants={dropdownItemVariants}
          className="col-span-3 space-y-4 pl-4"
        >
          <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Performance Metrics
          </h4>
          <div className="space-y-3">
            <StatCard 
              label="Invoice Total" 
              value={formatTableCurrency(company.invoice)}
              icon={<DollarSign className="w-4 h-4 text-emerald-500" />}
            />
            <StatCard 
              label="Statements" 
              value={company.statements.toString()}
              icon={<FileText className="w-4 h-4 text-blue-500" />}
            />
            <StatCard 
              label="Avg Monthly" 
              value={formatTableCurrency(company.commission / 12)}
              icon={<TrendingUp className="w-4 h-4 text-purple-500" />}
            />
            <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Commission Rate</p>
              <CommissionRateBadge rate={company.rate} />
            </div>
          </div>
        </motion.div>

        {/* MIDDLE: Chart Visualization - 6 columns (50%) - ⚡ INCREASED FROM 5 */}
        <motion.div 
          variants={dropdownItemVariants}
          className="col-span-6"
          style={{ overflow: 'visible' }}
        >
          <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Monthly Trend Analysis
          </h4>
          
          {/* ⚡ FIXED: Proper chart container with explicit dimensions */}
          <div 
            className="w-full bg-gradient-to-br from-slate-50 via-white to-slate-50 dark:from-slate-800 dark:via-slate-900 dark:to-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm"
            style={{ 
              minHeight: '280px',  // ⚡ Explicit minimum height
              height: '280px',     // ⚡ Fixed height for consistent layout
              overflow: 'visible',
              position: 'relative'
            }}
          >
            {chartData && chartData.length > 0 ? (
              <div style={{ width: '100%', height: '100%' }}>
                <InteractiveLineChart data={chartData} />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-slate-400">
                <BarChart3 className="w-12 h-12 mb-2 opacity-30" />
                <p className="text-sm">No commission data available</p>
              </div>
            )}
          </div>
          
          {/* Chart metadata - ⚡ Better spacing and layout */}
          <div className="mt-4 grid grid-cols-3 gap-4 text-xs">
            <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3">
              <p className="text-slate-500 dark:text-slate-400 mb-1 font-medium">Peak Month</p>
              <p className="text-slate-900 dark:text-slate-100 font-semibold">
                {getPeakMonth(company.monthly_breakdown)}
              </p>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3">
              <p className="text-slate-500 dark:text-slate-400 mb-1 font-medium">Peak Amount</p>
              <p className="text-slate-900 dark:text-slate-100 font-semibold">
                {formatTableCurrency(getPeakAmount(company.monthly_breakdown))}
              </p>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3">
              <p className="text-slate-500 dark:text-slate-400 mb-1 font-medium">Last Update</p>
              <p className="text-slate-900 dark:text-slate-100 font-semibold">
                {formatDate(company.last_updated)}
              </p>
            </div>
          </div>
        </motion.div>

        {/* RIGHT: Actions - 3 columns (25%) */}
        <motion.div 
          variants={dropdownItemVariants}
          className="col-span-3 space-y-3"
        >
          <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
            Quick Actions
          </h4>
          
          {onViewInCarrier && (
            <motion.button 
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={onViewInCarrier}
              className="w-full px-4 py-3 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/30 rounded-lg transition-all duration-200 flex items-center justify-center gap-2 shadow-sm hover:shadow-md"
            >
              <Eye className="w-4 h-4" />
              View in Carrier
            </motion.button>
          )}
          
          {onEdit && (
            <motion.button 
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={onEdit}
              className="w-full px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg transition-all duration-200 flex items-center justify-center gap-2 shadow-sm hover:shadow-md"
            >
              Edit Commission
            </motion.button>
          )}
          
          <motion.button 
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
            className="w-full px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg transition-all duration-200 flex items-center justify-center gap-2 shadow-sm hover:shadow-md"
          >
            <Download className="w-4 h-4" />
            Export Data
          </motion.button>
        </motion.div>
      </div>
    </motion.div>
  );
};

// ============================================
// MONTHLY CHART DATA TRANSFORMER
// ============================================

function transformMonthlyData(breakdown?: any) {
  if (!breakdown) return [];
  
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthKeys = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  
  return months.map((month, index) => ({
    month,
    value: breakdown[monthKeys[index]] || 0
  }));
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function CompaniesTableView({ 
  data, 
  loading = false,
  onEdit,
  onDelete,
  onMerge,
  navigationContext,
  onViewInCarrier
}: CompaniesTableViewProps) {
  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({
    key: 'commission_earned',
    direction: 'desc'
  });
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [activeFilters, setActiveFilters] = useState<Record<string, any>>({});

  // Transform data to table rows
  const tableRows: CompanyTableRow[] = useMemo(() => {
    return data.map(company => ({
      ...company,
      companyName: company.client_name,
      carrierName: company.carrier_name || 'Unknown',
      year: company.statement_year || new Date().getFullYear(),
      commission: company.commission_earned,
      invoice: company.invoice_total,
      statements: company.statement_count,
      rate: company.invoice_total > 0 ? (company.commission_earned / company.invoice_total) * 100 : 0
    }));
  }, [data]);

  // Apply filters and search
  const filteredData = useMemo(() => {
    let filtered = filterTableData(tableRows, activeFilters);
    
    if (searchQuery) {
      filtered = filtered.filter(row => 
        row.companyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        row.carrierName.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    
    return filtered;
  }, [tableRows, activeFilters, searchQuery]);

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

  const toggleRow = (rowId: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return next;
    });
  };

  const toggleRowSelection = (rowId: string) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return next;
    });
  };

  const toggleAllSelection = () => {
    if (selectedRows.size === paginatedData.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(paginatedData.map(row => row.id)));
    }
  };

  const handleExport = () => {
    // TODO: Implement export functionality
    console.log('Export selected:', Array.from(selectedRows));
  };

  const handleBulkDelete = () => {
    if (onDelete) {
      onDelete(Array.from(selectedRows));
      setSelectedRows(new Set());
    }
  };

  // Monthly column names
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Table columns configuration - Fixed expand column & premium design
  const columns: TableColumn<CompanyTableRow>[] = [
    // Expand button - centered, proper size
    {
      key: 'expand',
      label: '',
      width: '48px',
      align: 'center' as const,
      className: 'px-3',
      format: (_, row) => (
        <ExpandButton 
          isExpanded={expandedRows.has(row.id)}
          onClick={() => toggleRow(row.id)}
        />
      )
    },
    // Company Name - PROMINENT, sticky, with icon
    {
      key: 'companyName',
      label: 'Company',
      sortable: true,
      align: 'left' as const,
      width: '220px',
      className: 'sticky left-0 z-10 font-semibold company-name-sticky',
      format: (value, row) => (
        <div className="flex items-center gap-3 py-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
            {value.charAt(0).toUpperCase()}
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {value}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {row.carrierName}
            </span>
          </div>
        </div>
      )
    },
    // Monthly columns - COMPACT & VISUAL with enhanced styling
    ...monthNames.map((month, index) => ({
      key: `monthly_breakdown.${month.toLowerCase()}`,
      label: month,
      sortable: true,
      align: 'center' as const,
      width: '90px',
      className: cn(
        'px-2',
        index % 3 === 0 && 'border-l-2 border-slate-300 dark:border-slate-600'
      ),
      format: (value: any, row: CompanyTableRow) => {
        const monthlyData = row.monthly_breakdown || {};
        const monthValue = monthlyData[month.toLowerCase() as keyof typeof monthlyData] || 0;
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
    // Total YTD - BOLD & PROMINENT
    {
      key: 'commission',
      label: 'Total YTD',
      sortable: true,
      align: 'right' as const,
      width: '160px',
      className: 'px-4 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-500/20 dark:to-indigo-500/20 border-l-2 border-blue-300 dark:border-blue-500',
      format: (value, row) => (
        <div className="flex flex-col items-end py-1">
          <span className="text-lg font-extrabold bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-300 dark:to-indigo-300 bg-clip-text text-transparent tabular-nums">
            {formatTableCurrency(value)}
          </span>
          <span className="text-xs font-semibold text-blue-600 dark:text-blue-300 mt-0.5">
            ${Math.round(value / 12).toLocaleString()} avg/mo
          </span>
        </div>
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
              placeholder="Search companies or carriers..."
            />
          </div>
          <button className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-2">
            <Filter className="w-4 h-4" />
            Filters
          </button>
        </div>
        <button className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-2">
          <Download className="w-4 h-4" />
          Export
        </button>
      </div>

      {/* Navigation Context Badge */}
      {navigationContext && navigationContext.source === 'carrier' && (
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="relative"
          >
            <div className="context-badge">
              <Users className="w-4 h-4" />
              <span>Linked to {navigationContext.sourceId}</span>
              <button onClick={() => window.history.back()}>
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        </AnimatePresence>
      )}

      {/* Table Container */}
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 overflow-visible"
      >
        <div className="overflow-x-auto overflow-y-visible">
          <table className="w-full premium-table">
            <TableHeader
              columns={columns}
              sortConfig={sortConfig}
              onSort={handleSort}
              selectable
              allSelected={selectedRows.size === paginatedData.length && paginatedData.length > 0}
              onSelectAll={toggleAllSelection}
            />
            
            {loading ? (
              <LoadingSkeleton rows={pageSize} columns={columns.length + 1} />
            ) : paginatedData.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={columns.length + 1}>
                    <EmptyState
                      icon={<Building2 className="w-12 h-12 text-slate-400" />}
                      title="No companies found"
                      description="Try adjusting your filters or search terms"
                    />
                  </td>
                </tr>
              </tbody>
            ) : (
              <tbody>
                {paginatedData.map((row, index) => {
                  const isHighlighted = navigationContext?.targetId === row.id;
                  return (
                    <React.Fragment key={row.id}>
                      <TableRow
                        data={row}
                        columns={columns}
                        index={index}
                        isExpanded={expandedRows.has(row.id)}
                        isSelected={selectedRows.has(row.id)}
                        onToggleExpand={() => toggleRow(row.id)}
                        onToggleSelect={() => toggleRowSelection(row.id)}
                        selectable
                        expandable
                        className={cn(
                          isHighlighted && "highlight-pulse"
                        )}
                      />
                    
                    {/* ⚡ Expandable Row with proper overflow */}
                    <ExpandableRow
                      isExpanded={expandedRows.has(row.id)}
                      colSpan={columns.length + 1}
                    >
                      <ExpandedCompanyContent
                        company={row}
                        onEdit={onEdit ? () => onEdit(row) : undefined}
                        onMerge={onMerge ? () => onMerge(row) : undefined}
                        onViewInCarrier={onViewInCarrier ? () => onViewInCarrier(row) : undefined}
                      />
                    </ExpandableRow>
                  </React.Fragment>
                  );
                })}
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

      {/* Bulk Actions Bar */}
      <BulkActionsBar
        selectedCount={selectedRows.size}
        onDelete={onDelete ? handleBulkDelete : undefined}
        onExport={handleExport}
        onClearSelection={() => setSelectedRows(new Set())}
      />
    </div>
  );
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function getPeakMonth(breakdown?: any): string {
  if (!breakdown) return 'N/A';
  
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthKeys = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  
  let maxValue = 0;
  let maxIndex = 0;
  
  monthKeys.forEach((key, index) => {
    if (breakdown[key] > maxValue) {
      maxValue = breakdown[key];
      maxIndex = index;
    }
  });
  
  return months[maxIndex];
}

function getPeakAmount(breakdown?: any): number {
  if (!breakdown) return 0;
  
  const monthKeys = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  let maxValue = 0;
  
  monthKeys.forEach(key => {
    if (breakdown[key] > maxValue) {
      maxValue = breakdown[key];
    }
  });
  
  return maxValue;
}

function getAverageMonthly(breakdown?: any): number {
  if (!breakdown) return 0;
  
  const monthKeys = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  let total = 0;
  let count = 0;
  
  monthKeys.forEach(key => {
    if (breakdown[key] > 0) {
      total += breakdown[key];
      count++;
    }
  });
  
  return count > 0 ? total / count : 0;
}

function formatDate(dateString?: string): string {
  if (!dateString) return 'N/A';
  
  const date = new Date(dateString);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - date.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}
