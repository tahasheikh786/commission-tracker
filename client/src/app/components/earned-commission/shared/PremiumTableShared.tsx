'use client'
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronUp, ChevronDown, ChevronRight, Search, X, Filter, Download, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { 
  tableRowVariants, 
  expandedRowVariants, 
  sortIconVariants,
  tableSkeletonVariants,
  checkboxVariants,
  bulkActionsVariants,
  dropdownContentVariants,
  premiumRowVariants
} from '../../dashboardTab/animations';

// ============================================
// TYPES & INTERFACES
// ============================================

export interface TableColumn<T> {
  key: keyof T | string;
  label: string;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  format?: (value: any, row: T) => React.ReactNode;
  width?: string;
  className?: string;
}

export interface SortConfig {
  key: string;
  direction: 'asc' | 'desc';
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

export const formatTableCurrency = (value: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
};

export const getCommissionRateColor = (rate: number): string => {
  if (rate >= 15) return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
  if (rate >= 10) return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
  if (rate >= 5) return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
  return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
};

export function sortTableData<T>(data: T[], key: string, direction: 'asc' | 'desc'): T[] {
  return [...data].sort((a, b) => {
    const aValue = getNestedValue(a, key);
    const bValue = getNestedValue(b, key);
    
    if (aValue === null || aValue === undefined) return 1;
    if (bValue === null || bValue === undefined) return -1;
    
    if (aValue < bValue) return direction === 'asc' ? -1 : 1;
    if (aValue > bValue) return direction === 'asc' ? 1 : -1;
    return 0;
  });
}

function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

export function filterTableData<T>(data: T[], filters: Record<string, any>): T[] {
  return data.filter(item => {
    return Object.entries(filters).every(([key, value]) => {
      if (!value || (Array.isArray(value) && value.length === 0)) return true;
      
      const itemValue = getNestedValue(item, key);
      
      if (Array.isArray(value)) {
        return value.includes(itemValue);
      }
      
      if (typeof value === 'string') {
        return String(itemValue).toLowerCase().includes(value.toLowerCase());
      }
      
      return itemValue === value;
    });
  });
}

// ============================================
// TABLE HEADER COMPONENT
// ============================================

interface TableHeaderProps<T> {
  columns: TableColumn<T>[];
  sortConfig: SortConfig;
  onSort: (key: string) => void;
  selectable?: boolean;
  allSelected?: boolean;
  onSelectAll?: () => void;
}

export function TableHeader<T>({
  columns,
  sortConfig,
  onSort,
  selectable,
  allSelected,
  onSelectAll
}: TableHeaderProps<T>) {
  return (
    <thead className="bg-gradient-to-r from-slate-100 via-slate-50 to-slate-100 dark:from-slate-800 dark:via-slate-900 dark:to-slate-800 border-b-2 border-slate-300 dark:border-slate-600 sticky top-0 z-20">
      <tr>
        {selectable && (
          <th className="w-12 px-4 py-4 text-center bg-white dark:bg-slate-900">
            <motion.div
              className="w-5 h-5 mx-auto rounded border-2 border-slate-300 dark:border-slate-600 flex items-center justify-center cursor-pointer hover:border-blue-500 transition-colors"
              onClick={onSelectAll}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
            >
              {allSelected && (
                <Check className="w-3 h-3 text-blue-500" />
              )}
            </motion.div>
          </th>
        )}
        {columns.map((column) => (
          <th
            key={String(column.key)}
            style={{ width: column.width }}
            className={cn(
              "px-4 py-4 font-bold text-xs uppercase tracking-wider",
              "transition-all duration-200",
              column.align === 'center' && 'text-center',
              column.align === 'right' && 'text-right',
              column.align === 'left' && 'text-left',
              !column.align && 'text-left',
              column.sortable && 'cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-600 dark:hover:text-blue-400',
              column.className
            )}
            onClick={() => column.sortable && onSort(String(column.key))}
          >
            <div className={cn(
              "flex items-center gap-2",
              column.align === 'center' && 'justify-center',
              column.align === 'right' && 'justify-end',
              column.align === 'left' && 'justify-start',
              !column.align && 'justify-start'
            )}>
              <span className="text-slate-800 dark:text-slate-200 font-extrabold">{column.label}</span>
              {column.sortable && sortConfig.key === column.key && (
                <motion.div
                  variants={sortIconVariants}
                  initial="initial"
                  animate="animate"
                  className="text-blue-600 dark:text-blue-400"
                >
                  {sortConfig.direction === 'asc' ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </motion.div>
              )}
            </div>
          </th>
        ))}
      </tr>
    </thead>
  );
}

// ============================================
// TABLE ROW COMPONENT
// ============================================

interface TableRowProps<T> {
  data: T;
  columns: TableColumn<T>[];
  index: number;
  isExpanded?: boolean;
  isSelected?: boolean;
  onToggleExpand?: () => void;
  onToggleSelect?: () => void;
  selectable?: boolean;
  expandable?: boolean;
  className?: string;
}

export function TableRow<T extends { id: string }>({ 
  data, 
  columns, 
  index,
  isExpanded,
  isSelected,
  onToggleExpand,
  onToggleSelect,
  selectable,
  expandable,
  className
}: TableRowProps<T>) {
  return (
    <motion.tr
      id={`table-row-${data.id}`}
      variants={tableRowVariants}
      initial="hidden"
      animate="visible"
      custom={index}
      className={cn(
        "border-b border-slate-200/80 dark:border-slate-600/50",
        "hover:bg-gradient-to-r hover:from-blue-50/50 hover:via-transparent hover:to-blue-50/50 dark:hover:from-blue-500/20 dark:hover:via-blue-600/10 dark:hover:to-blue-500/20",
        "transition-all duration-200",
        index % 2 === 0 && "bg-white dark:bg-slate-800",
        index % 2 === 1 && "bg-slate-50/50 dark:bg-slate-700/40",
        isExpanded && "bg-gradient-to-r from-blue-100/40 via-blue-50/40 to-blue-100/40 dark:from-blue-500/30 dark:via-blue-600/20 dark:to-blue-500/30 shadow-inner",
        isSelected && "bg-blue-100/60 dark:bg-blue-500/30",
        className
      )}
    >
      {selectable && (
        <td className="w-12 px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
          <motion.div
            className="w-5 h-5 mx-auto rounded border-2 border-slate-300 dark:border-slate-600 flex items-center justify-center cursor-pointer hover:border-blue-500 transition-colors"
            onClick={onToggleSelect}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
          >
            {isSelected && (
              <Check className="w-3 h-3 text-blue-500" />
            )}
          </motion.div>
        </td>
      )}
      {columns.map((column) => {
        const value = getNestedValue(data, String(column.key));
        const content = column.format ? column.format(value, data) : value;
        
        return (
          <td
            key={String(column.key)}
            className={cn(
              "px-4 py-3",
              column.align === 'center' && 'text-center',
              column.align === 'right' && 'text-right',
              column.align === 'left' && 'text-left',
              !column.align && 'text-left',
              column.className
            )}
          >
            {content}
          </td>
        );
      })}
    </motion.tr>
  );
}

// ============================================
// EXPANDABLE ROW COMPONENT
// ============================================

interface ExpandableRowProps {
  isExpanded: boolean;
  colSpan: number;
  children: React.ReactNode;
}

export function ExpandableRow({ isExpanded, colSpan, children }: ExpandableRowProps) {
  return (
    <AnimatePresence initial={false} mode="wait">
      {isExpanded && (
        <motion.tr
          key="expanded-content"
          initial="collapsed"
          animate="expanded"
          exit="collapsed"
          variants={expandedRowVariants}
          style={{ 
            position: 'relative',
            overflow: 'visible',  // ⚡ CRITICAL FIX
            display: 'table-row'   // ⚡ Ensure table-row display is maintained
          }}
        >
          <td 
            colSpan={colSpan} 
            className="p-0"
            style={{ 
              overflow: 'visible',  // ⚡ CRITICAL FIX - allow content to overflow
              position: 'relative',
              verticalAlign: 'top'
            }}
          >
            <motion.div
              variants={dropdownContentVariants}
              initial="collapsed"
              animate="expanded"
              className="w-full"
              style={{ 
                overflow: 'visible',
                minHeight: '200px'  // ⚡ Prevent layout shift during render
              }}
            >
              {children}
            </motion.div>
          </td>
        </motion.tr>
      )}
    </AnimatePresence>
  );
}

// ============================================
// EXPAND BUTTON COMPONENT
// ============================================

interface ExpandButtonProps {
  isExpanded: boolean;
  onClick: () => void;
}

export function ExpandButton({ isExpanded, onClick }: ExpandButtonProps) {
  return (
    <motion.button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.95 }}
      className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors duration-200"
      aria-expanded={isExpanded}
      aria-label={isExpanded ? "Collapse row" : "Expand row"}
    >
      <motion.div
        animate={{ rotate: isExpanded ? 90 : 0 }}  // ⚡ Smooth rotation
        transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
      >
        <ChevronRight className="w-5 h-5" />
      </motion.div>
    </motion.button>
  );
}

// ============================================
// TABLE SEARCH COMPONENT
// ============================================

interface TableSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function TableSearch({ value, onChange, placeholder = "Search..." }: TableSearchProps) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-10 pr-10 py-2 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-800 dark:text-white"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

// ============================================
// TABLE PAGINATION COMPONENT
// ============================================

interface TablePaginationProps {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

export function TablePagination({
  currentPage,
  totalPages,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange
}: TablePaginationProps) {
  const pageSizes = [10, 25, 50, 100];
  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700">
      <div className="flex items-center gap-4">
        <span className="text-sm text-slate-600 dark:text-slate-400">
          Showing {startItem} to {endItem} of {totalItems} results
        </span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="text-sm border border-slate-200 dark:border-slate-700 rounded px-2 py-1 dark:bg-slate-700"
        >
          {pageSizes.map(size => (
            <option key={size} value={size}>{size} per page</option>
          ))}
        </select>
      </div>
      
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="px-3 py-1 text-sm border border-slate-200 dark:border-slate-700 rounded hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Previous
        </button>
        
        {[...Array(Math.min(5, totalPages))].map((_, i) => {
          const page = i + 1;
          return (
            <button
              key={page}
              onClick={() => onPageChange(page)}
              className={cn(
                "px-3 py-1 text-sm border rounded",
                currentPage === page
                  ? "bg-blue-500 text-white border-blue-500"
                  : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700"
              )}
            >
              {page}
            </button>
          );
        })}
        
        {totalPages > 5 && <span className="text-slate-500">...</span>}
        
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="px-3 py-1 text-sm border border-slate-200 dark:border-slate-700 rounded hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  );
}

// ============================================
// BULK ACTIONS BAR COMPONENT
// ============================================

interface BulkActionsBarProps {
  selectedCount: number;
  onDelete?: () => void;
  onExport?: () => void;
  onClearSelection: () => void;
  customActions?: React.ReactNode;
}

export function BulkActionsBar({ 
  selectedCount, 
  onDelete, 
  onExport,
  onClearSelection,
  customActions 
}: BulkActionsBarProps) {
  return (
    <AnimatePresence>
      {selectedCount > 0 && (
        <motion.div
          variants={bulkActionsVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-white dark:bg-slate-800 shadow-lg rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-3 flex items-center gap-4 z-50"
        >
          <span className="text-sm font-medium">
            {selectedCount} item{selectedCount > 1 ? 's' : ''} selected
          </span>
          
          <div className="flex items-center gap-2">
            {customActions}
            
            {onExport && (
              <button
                onClick={onExport}
                className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Export
              </button>
            )}
            
            {onDelete && (
              <button
                onClick={onDelete}
                className="px-3 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
              >
                Delete
              </button>
            )}
            
            <button
              onClick={onClearSelection}
              className="px-3 py-1 text-sm border border-slate-200 dark:border-slate-700 rounded hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              Clear
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ============================================
// EMPTY STATE COMPONENT
// ============================================

interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}

export function EmptyState({ 
  title = "No data found", 
  description = "Try adjusting your filters or search terms",
  icon,
  action 
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      {icon && (
        <div className="mb-4 p-4 bg-slate-100 dark:bg-slate-800 rounded-full">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">{title}</h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 text-center max-w-md mb-6">
        {description}
      </p>
      {action}
    </div>
  );
}

// ============================================
// LOADING SKELETON COMPONENT
// ============================================

interface LoadingSkeletonProps {
  rows?: number;
  columns?: number;
}

export function LoadingSkeleton({ rows = 5, columns = 6 }: LoadingSkeletonProps) {
  return (
    <tbody>
      {[...Array(rows)].map((_, rowIndex) => (
        <tr key={rowIndex} className="border-b border-slate-200 dark:border-slate-700">
          {[...Array(columns)].map((_, colIndex) => (
            <td key={colIndex} className="px-4 py-3">
              <motion.div
                variants={tableSkeletonVariants}
                initial="initial"
                animate="animate"
                className="h-4 bg-gradient-to-r from-slate-200 via-slate-300 to-slate-200 dark:from-slate-700 dark:via-slate-600 dark:to-slate-700 rounded"
                style={{
                  backgroundSize: '200% 100%',
                  width: colIndex === 0 ? '80%' : colIndex === columns - 1 ? '60px' : '100%'
                }}
              />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

// ============================================
// COMMISSION RATE BADGE COMPONENT
// ============================================

interface CommissionRateBadgeProps {
  rate: number;
}

export function CommissionRateBadge({ rate }: CommissionRateBadgeProps) {
  const colorClass = getCommissionRateColor(rate);
  
  return (
    <span className={cn(
      "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
      colorClass
    )}>
      {rate.toFixed(1)}%
    </span>
  );
}

// ============================================
// FILTER CHIP COMPONENT
// ============================================

interface FilterChipProps {
  label: string;
  count?: number;
  onRemove: () => void;
}

export function FilterChip({ label, count, onRemove }: FilterChipProps) {
  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.8, opacity: 0 }}
      className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-sm"
    >
      <span>{label}</span>
      {count !== undefined && (
        <span className="text-xs opacity-70">({count})</span>
      )}
      <button
        onClick={onRemove}
        className="ml-1 hover:bg-blue-200 dark:hover:bg-blue-800 rounded-full p-0.5"
      >
        <X className="w-3 h-3" />
      </button>
    </motion.div>
  );
}
