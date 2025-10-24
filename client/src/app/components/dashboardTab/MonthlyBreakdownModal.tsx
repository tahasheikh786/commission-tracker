'use client'
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';
import { glassBackdropVariants, sidePanelVariants, monthlyBarVariants } from './animations';

interface CommissionData {
  client_name: string;
  carrier_name?: string;
  commission_earned: number;
  invoice_total: number;
  statement_count: number;
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
}

interface MonthlyBreakdownModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: CommissionData | null;
}

const MONTHS = [
  { month: 'Jan', key: 'jan' },
  { month: 'Feb', key: 'feb' },
  { month: 'Mar', key: 'mar' },
  { month: 'Apr', key: 'apr' },
  { month: 'May', key: 'may' },
  { month: 'Jun', key: 'jun' },
  { month: 'Jul', key: 'jul' },
  { month: 'Aug', key: 'aug' },
  { month: 'Sep', key: 'sep' },
  { month: 'Oct', key: 'oct' },
  { month: 'Nov', key: 'nov' },
  { month: 'Dec', key: 'dec' }
] as const;

export const MonthlyBreakdownModal: React.FC<MonthlyBreakdownModalProps> = ({
  isOpen,
  onClose,
  data
}) => {
  if (!data) return null;

  // Calculate max value for scaling bars
  const monthlyValues = MONTHS.map(({ key }) => 
    data.monthly_breakdown?.[key as keyof typeof data.monthly_breakdown] || 0
  );
  const maxValue = Math.max(...monthlyValues.filter(v => v > 0));

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Glassmorphic Backdrop */}
          <motion.div
            variants={glassBackdropVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-md"
          />
          
          {/* Side Panel */}
          <motion.div
            variants={sidePanelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="glass-panel h-full flex flex-col overflow-hidden">
              {/* Header */}
              <div className="glass-header p-6 flex-shrink-0">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">
                      Monthly Breakdown
                    </h2>
                    <p className="text-slate-600 dark:text-slate-400">
                      {data.client_name}
                    </p>
                    <p className="text-sm text-slate-500">
                      {data.carrier_name}
                    </p>
                  </div>
                  
                  <button
                    onClick={onClose}
                    className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <X className="w-5 h-5 text-slate-500" />
                  </button>
                </div>
              </div>
              
              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                {/* Monthly Bars */}
                <div className="space-y-3 mb-8">
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">
                    Commission by Month
                  </h3>
                  
                  {MONTHS.map(({ month, key }, idx) => {
                    const value = data.monthly_breakdown?.[key as keyof typeof data.monthly_breakdown];
                    const hasValue = value && value > 0;
                    const widthPercent = hasValue ? (value / maxValue) * 100 : 0;
                    
                    return (
                      <motion.div
                        key={month}
                        custom={idx}
                        variants={monthlyBarVariants}
                        initial="hidden"
                        animate="visible"
                        className="relative"
                      >
                        <div className="flex items-center gap-3 mb-1">
                          <span className="text-sm font-medium text-slate-700 dark:text-slate-300 w-12">
                            {month}
                          </span>
                          <div className="flex-1">
                            {hasValue ? (
                              <div
                                className="month-bar relative group"
                                style={{ width: `${widthPercent}%`, minWidth: '80px' }}
                              >
                                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-white font-semibold text-sm">
                                  {formatCurrency(value)}
                                </div>
                                
                                {/* Tooltip on hover */}
                                <div className="tooltip-premium opacity-0 group-hover:opacity-100 transition-opacity absolute left-full ml-2 top-1/2 -translate-y-1/2 pointer-events-none whitespace-nowrap">
                                  {month}: {formatCurrency(value)}
                                </div>
                              </div>
                            ) : (
                              <div className="month-bar-empty w-full relative">
                                <span className="text-slate-400 text-sm absolute left-3 top-1/2 -translate-y-1/2">
                                  No commission
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
                
                {/* Summary Cards */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 }}
                  className="grid grid-cols-3 gap-4"
                >
                  <div className="glass-card-premium stat-card-premium">
                    <div className="text-xs text-slate-600 dark:text-slate-400 mb-2">
                      Total Commission
                    </div>
                    <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                      {formatCurrency(data.commission_earned)}
                    </div>
                  </div>
                  
                  <div className="glass-card-premium stat-card-premium">
                    <div className="text-xs text-slate-600 dark:text-slate-400 mb-2">
                      Total Invoice
                    </div>
                    <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(data.invoice_total)}
                    </div>
                  </div>
                  
                  <div className="glass-card-premium stat-card-premium">
                    <div className="text-xs text-slate-600 dark:text-slate-400 mb-2">
                      Statements
                    </div>
                    <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                      {data.statement_count}
                    </div>
                  </div>
                </motion.div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

