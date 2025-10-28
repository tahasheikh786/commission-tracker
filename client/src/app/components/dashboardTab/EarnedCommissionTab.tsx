'use client'
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  ChevronDown,
 
  ArrowLeft,
  ArrowRight
} from 'lucide-react';
import EditCommissionModal from './EditCommissionModal';
import MergeConfirmationModal from './MergeConfirmationModal';
import { formatCurrency, formatCurrencyCompact } from '../../utils/formatters';
import { 
  useCarriersWithCommission, 
  useAvailableYears
} from '../../hooks/useDashboard';
import { useSubmission } from '@/context/SubmissionContext';
import { useEnvironment } from '@/context/EnvironmentContext';

// ============================================
// TYPE DEFINITIONS
// ============================================

// Loading Skeleton Components
const CarrierCardSkeleton: React.FC = () => (
  <div className="glass-card-premium rounded-xl p-6 border border-slate-200/50 dark:border-slate-700/50 animate-pulse">
    <div className="flex items-center gap-3 mb-4">
      <div className="w-12 h-12 bg-slate-200 dark:bg-slate-700 rounded-full" />
      <div className="flex-1">
        <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded w-3/4 mb-2" />
        <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/2" />
      </div>
    </div>
    <div className="mb-3">
      <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded w-32 mb-2" />
      <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-24" />
    </div>
    <div className="flex items-center justify-between text-xs">
      <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-20" />
      <div className="w-4 h-4 bg-slate-200 dark:bg-slate-700 rounded" />
    </div>
  </div>
);

const CompanyCardSkeleton: React.FC = () => (
  <div className="expandable-company-card bg-white dark:bg-slate-800 rounded-xl shadow-sm p-4 border border-slate-200/50 dark:border-slate-700/50 animate-pulse">
    <div className="mb-3">
      <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded w-3/4 mb-2" />
      <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/2" />
    </div>
    <div className="grid grid-cols-2 gap-3 mb-3">
      <div>
        <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-16 mb-1" />
        <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded" />
      </div>
      <div>
        <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-20 mb-1" />
        <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded" />
      </div>
    </div>
    <div className="h-12 bg-slate-200 dark:bg-slate-700 rounded" />
  </div>
);

const TimelineSkeleton: React.FC = () => (
  <div className="h-full flex flex-col bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl p-4">
    <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded w-32 mb-4 animate-pulse" />
    <div className="grid grid-cols-2 gap-3 mb-6">
      <div className="h-20 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
      <div className="h-20 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
    </div>
    <div className="space-y-2">
      {[...Array(12)].map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-10 h-4 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
          <div className="flex-1 h-10 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
        </div>
      ))}
    </div>
  </div>
);

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

// ============================================
// SPARKLINE COMPONENTS
// ============================================

const MicroSparkline: React.FC<{ data: number[] }> = ({ data }) => {
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
    <svg className="micro-sparkline w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
};

const ResponsiveSparkline: React.FC<{ data: { month: string; value: number }[] }> = ({ data }) => {
  if (!data || data.length === 0) return null;

  const max = Math.max(...data.map(d => d.value));
  const min = Math.min(...data.map(d => d.value));
  const range = max - min || 1;

  const points = data
    .map((item, index) => {
      const x = (index / (data.length - 1)) * 100;
      const y = 100 - ((item.value - min) / range) * 80; // Leave 20% padding
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg className="responsive-sparkline w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
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
  );
};

// ============================================
// PREMIUM HOVER-REVEAL CARRIER CARD
// ============================================

interface CarrierCardProps {
  carrier: CarrierGroup;
  onClick: () => void;
}

const CarrierCard: React.FC<CarrierCardProps> = ({ carrier, onClick }) => {
  const [isHovered, setIsHovered] = useState(false);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <motion.div
      role="button"
      tabIndex={0}
      aria-label={`View details for ${carrier.carrierName}`}
      onKeyPress={handleKeyPress}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setIsHovered(true)}
      onBlur={() => setIsHovered(false)}
      whileHover={{ 
        y: -8,
        scale: 1.02,
        transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }
      }}
      className="carrier-card-premium group relative cursor-pointer"
    >
      {/* Background Gradient Overlay - Intensifies on Hover */}
      <motion.div
        className="absolute inset-0 rounded-2xl bg-gradient-to-br from-blue-500/5 via-purple-500/5 to-pink-500/5 dark:from-blue-500/10 dark:via-purple-500/10 dark:to-pink-500/10"
        animate={{
          opacity: isHovered ? 1 : 0.3
        }}
        transition={{ duration: 0.5, ease: "easeInOut" }}
      />

      {/* Main Card Content Container */}
      <div className="relative p-6 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden transition-all duration-300">
        
        {/* Decorative Corner Element */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-bl-full transform translate-x-16 -translate-y-16" />

        {/* INITIAL STATE - Always Visible */}
        <div className="relative z-10">
          {/* Carrier Avatar/Icon */}
          <div className="flex items-center justify-between mb-4">
            <motion.div
              animate={{
                scale: isHovered ? 0.9 : 1,
              }}
              transition={{ duration: 0.4, ease: "easeInOut" }}
              className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white font-bold text-lg shadow-lg"
            >
              {carrier.carrierName.substring(0, 2).toUpperCase()}
            </motion.div>

            {/* Small Badge - Company Count (Always Visible) */}
            <motion.div
              animate={{
                opacity: isHovered ? 0 : 1,
                y: isHovered ? -10 : 0
              }}
              transition={{ duration: 0.4, ease: "easeInOut" }}
              className="text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-3 py-1 rounded-full"
            >
              {carrier.companyCount} companies
            </motion.div>
          </div>

          {/* Carrier Name - Large and Prominent */}
          <motion.h3
            animate={{
              fontSize: isHovered ? '1.25rem' : '1.5rem',
              marginBottom: isHovered ? '1rem' : '0.5rem',
              textAlign: isHovered ? 'center' : 'left'
            }}
            transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="font-bold text-slate-900 dark:text-white truncate"
          >
            {carrier.carrierName}
          </motion.h3>

          {/* Hover Hint Text - Fades Out on Hover */}
          <motion.p
            animate={{
              opacity: isHovered ? 0 : 0.6,
              height: isHovered ? 0 : 'auto'
            }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="text-sm text-slate-500 dark:text-slate-400 overflow-hidden"
          >
            <motion.span
              animate={{
                opacity: [0.6, 1, 0.6]
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            >
              Hover to view details
            </motion.span>
          </motion.p>
        </div>

        {/* HOVER STATE - Details Reveal */}
        <AnimatePresence>
          {isHovered && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.5, delay: 0.1, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="relative z-20 mt-4"
            >
              {/* Two-Column Layout for Balanced Information Display */}
              <div className="grid grid-cols-2 gap-4">
                
                {/* LEFT COLUMN */}
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5, delay: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
                  className="space-y-3"
                >
                  {/* Total Commission */}
                  <div>
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wide">
                      Total Commission
                    </div>
                    <div className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                      {formatCurrencyCompact(carrier.totalCommission)}
                    </div>
                  </div>

                  {/* Company Count - Detailed */}
                  <div>
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wide">
                      Companies
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-xl font-bold text-slate-900 dark:text-white">
                        {carrier.companyCount}
                      </span>
                      <span className="text-sm text-slate-500 dark:text-slate-400">
                        active
                      </span>
                    </div>
                  </div>
                </motion.div>

                {/* RIGHT COLUMN */}
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5, delay: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
                  className="space-y-3"
                >
                  {/* Statements Count */}
                  <div>
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wide">
                      Statements
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-xl font-bold text-slate-900 dark:text-white">
                        {carrier.statementCount}
                      </span>
                      <span className="text-sm text-slate-500 dark:text-slate-400">
                        total
                      </span>
                    </div>
                  </div>

                  {/* Average per Company */}
                  <div>
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wide">
                      Avg per Company
                    </div>
                    <div className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">
                      {formatCurrencyCompact(carrier.totalCommission / carrier.companyCount)}
                    </div>
                  </div>
                </motion.div>
              </div>

              {/* Action Button - Appears on Hover */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
                className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700"
              >
                <div className="flex items-center justify-between text-sm">
                  <span className="text-blue-600 dark:text-blue-400 font-medium">
                    View Details
                  </span>
                  <ChevronRight className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

// ============================================
// PREMIUM HOVER-REVEAL COMPANY CARD
// ============================================

interface CompanyCardProps {
  company: CommissionData;
  onClick: () => void;
}

const CompanyCard: React.FC<CompanyCardProps> = ({ company, onClick }) => {
  const [isHovered, setIsHovered] = useState(false);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <motion.div
      role="button"
      tabIndex={0}
      aria-label={`View details for ${company.client_name}`}
      onKeyPress={handleKeyPress}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setIsHovered(true)}
      onBlur={() => setIsHovered(false)}
      whileHover={{ 
        y: -6,
        scale: 1.01,
        transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }
      }}
      className="company-card-premium group relative cursor-pointer"
    >
      {/* Background with Subtle Gradient */}
      <motion.div
        className="absolute inset-0 rounded-xl bg-gradient-to-br from-emerald-500/5 via-blue-500/5 to-purple-500/5 dark:from-emerald-500/10 dark:via-blue-500/10 dark:to-purple-500/10"
        animate={{
          opacity: isHovered ? 1 : 0.3
        }}
        transition={{ duration: 0.5, ease: "easeInOut" }}
      />

      {/* Main Card Content */}
      <div className="relative p-5 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden transition-all duration-300">
        
        {/* Decorative Element */}
        <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-blue-500/5 to-purple-500/5 rounded-bl-full transform translate-x-12 -translate-y-12" />

        {/* INITIAL STATE - Company Name Only */}
        <div className="relative z-10">
          
          {/* Company Name - Prominent Display */}
          <motion.h4
            animate={{
              fontSize: isHovered ? '1.125rem' : '1.25rem',
              marginBottom: isHovered ? '0.75rem' : '0.5rem',
              textAlign: isHovered ? 'center' : 'left'
            }}
            transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="font-bold text-slate-900 dark:text-white line-clamp-2 min-h-[3rem]"
          >
            {company.client_name}
          </motion.h4>

          {/* Year Badge - Small, Always Visible */}
          <motion.div
            animate={{
              opacity: isHovered ? 0 : 1,
              height: isHovered ? 0 : 'auto'
            }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 overflow-hidden"
          >
            <span className="bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded">
              {company.statement_year || '2025'}
            </span>
            <span className="text-slate-400">•</span>
            <motion.span
              animate={{
                opacity: [0.6, 1, 0.6]
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            >
              Hover for details
            </motion.span>
          </motion.div>
        </div>

        {/* HOVER STATE - Details Reveal */}
        <AnimatePresence>
          {isHovered && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 15 }}
              transition={{ duration: 0.5, delay: 0.1, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="relative z-20 mt-3"
            >
              {/* Metadata Row */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4, delay: 0.15, ease: "easeInOut" }}
                className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-3"
              >
                <span className="bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded">
                  {company.statement_year || '2025'}
                </span>
                <span>•</span>
                <span>{company.statement_count} statements</span>
              </motion.div>

              {/* Two-Column Stats Layout */}
              <div className="grid grid-cols-2 gap-3">
                
                {/* LEFT: Commission */}
                <motion.div
                  initial={{ opacity: 0, x: -15 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5, delay: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
                >
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wide">
                    Commission
                  </div>
                  <div className="text-xl font-bold text-blue-600 dark:text-blue-400">
                    {formatCurrencyCompact(company.commission_earned)}
                  </div>
                </motion.div>

                {/* RIGHT: Invoice Total */}
                <motion.div
                  initial={{ opacity: 0, x: 15 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5, delay: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
                >
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wide">
                    Invoice Total
                  </div>
                  <div className="text-lg font-semibold text-slate-700 dark:text-slate-300">
                    {formatCurrencyCompact(company.invoice_total)}
                  </div>
                </motion.div>
              </div>

              {/* Commission Rate Indicator */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
                className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Commission Rate
                    </div>
                    <div className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                      {((company.commission_earned / company.invoice_total) * 100).toFixed(1)}%
                    </div>
                  </div>
                  
                  <div className="text-blue-600 dark:text-blue-400 flex items-center gap-1 text-sm font-medium">
                    <span>View Breakdown</span>
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

// ============================================
// EXPANDABLE COMPANY CARD
// ============================================

interface ExpandableCompanyCardProps {
  company: CommissionData;
  isExpanded: boolean;
  onToggleExpand: (companyId: string) => void;
  onSelect: (company: CommissionData) => void;
}

const ExpandableCompanyCard: React.FC<ExpandableCompanyCardProps> = ({
  company,
  isExpanded, 
  onToggleExpand, 
  onSelect
}) => {
  const monthlyData = Object.entries(company.monthly_breakdown || {}).map(([month, value]) => ({
    month: month.charAt(0).toUpperCase() + month.slice(1),
    value: value as number
  }));

  const maxValue = Math.max(...monthlyData.map(m => m.value));

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{
        layout: { duration: 0.3, ease: [0.4, 0, 0.2, 1] },
        opacity: { duration: 0.2 }
      }}
      className="expandable-company-card bg-white dark:bg-slate-800 rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden border border-slate-200/50 dark:border-slate-700/50"
    >
      {/* Collapsed View - Always Visible */}
      <div
        onClick={() => onToggleExpand(company.id)}
        className="p-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
      >
        {/* Top Row: Company Name and Year/Statements Badge */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <h3 className="font-semibold text-slate-900 dark:text-white text-base truncate flex-1">
            {company.client_name}
          </h3>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="px-2.5 py-1 bg-blue-50 dark:bg-blue-900/30 rounded-md">
              <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
                {company.statement_year || '2025'}
              </span>
            </div>
            <motion.div
              animate={{ rotate: isExpanded ? 180 : 0 }}
              transition={{ duration: 0.3 }}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <ChevronDown className="w-5 h-5" />
            </motion.div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">Commission</div>
            <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
              {formatCurrency(company.commission_earned)}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">Invoice Total</div>
            <div className="text-lg font-bold text-slate-700 dark:text-slate-300">
              {formatCurrency(company.invoice_total)}
            </div>
          </div>
        </div>
      </div>

      {/* Expanded View - Smooth Height Animation */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            className="border-t border-slate-200 dark:border-slate-700 overflow-hidden"
          >
            <div className="p-4 bg-slate-50 dark:bg-slate-900/50">
              <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                Monthly Breakdown
              </h4>

              {/* Horizontal Monthly Timeline */}
              <div className="space-y-2">
                {monthlyData.map((item, index) => {
                  const widthPercent = maxValue > 0 ? (item.value / maxValue) * 100 : 0;
                  const hasValue = item.value > 0;

                  return (
                    <motion.div
                      key={item.month}
                      initial={{ scaleX: 0, opacity: 0 }}
                      animate={{ scaleX: 1, opacity: 1 }}
                      transition={{
                        delay: index * 0.03,
                        duration: 0.4,
                        ease: [0.34, 1.56, 0.64, 1]
                      }}
                      className="flex items-center gap-2"
                    >
                      <div className="w-12 text-xs font-medium text-slate-600 dark:text-slate-400">
                        {item.month}
                      </div>

                      <div className="flex-1 relative h-8">
                        {hasValue ? (
                          <div
                            className="month-bar-inline h-full rounded-md bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-end pr-2 cursor-pointer hover:scale-y-110 transition-transform"
                            style={{ width: `${widthPercent}%` }}
                          >
                            <span className="text-white text-xs font-semibold">
                              {formatCurrency(item.value)}
                            </span>
                          </div>
                        ) : (
                          <div className="h-full rounded-md border-2 border-dashed border-slate-300 dark:border-slate-600 flex items-center justify-center">
                            <span className="text-xs text-slate-400">—</span>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(company);
                  }}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  View Full Details
                </button>
                <button className="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium transition-colors">
                  Export
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// ============================================
// TIMELINE INSIGHT PANEL
// ============================================

interface TimelineInsightPanelProps {
  selectedCarrier: CarrierGroup | null;
  selectedCompany: CommissionData | null;
  compareMode: boolean;
  selectedCompaniesForCompare: Set<string>;
  allCompanies: CommissionData[];
}

const TimelineInsightPanel: React.FC<TimelineInsightPanelProps> = React.memo(({
  selectedCarrier,
  selectedCompany,
  compareMode,
  selectedCompaniesForCompare,
  allCompanies
}) => {
  const getDisplayData = () => {
    if (compareMode && selectedCompaniesForCompare.size > 0) {
      return Array.from(selectedCompaniesForCompare)
        .map(companyId => allCompanies.find(c => c.id === companyId))
        .filter(Boolean) as CommissionData[];
    } else if (selectedCompany) {
      return [selectedCompany];
    } else if (selectedCarrier) {
      return selectedCarrier.companies;
    }
    return [];
  };

  const displayData = getDisplayData();

  const SingleTimeline: React.FC<{ data: CommissionData }> = ({ data }) => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthKeys = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

    const monthlyValues = monthKeys.map((key, index) => ({
      month: months[index],
      value: data.monthly_breakdown?.[key as keyof typeof data.monthly_breakdown] || 0
    }));

    const maxValue = Math.max(...monthlyValues.map(m => m.value));
    const totalCommission = monthlyValues.reduce((sum, m) => sum + m.value, 0);
    const avgMonthly = totalCommission / 12;
    const peakMonth = monthlyValues.reduce((max, m) => m.value > max.value ? m : max, monthlyValues[0]);

    return (
      <div className="space-y-6">
        {/* Quick Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 p-3 rounded-lg">
            <div className="text-xs text-blue-600 dark:text-blue-400 mb-1">Peak Month</div>
            <div className="text-lg font-bold text-blue-900 dark:text-blue-100">
              {peakMonth.month}
            </div>
            <div className="text-xs text-blue-600 dark:text-blue-400">
              {formatCurrency(peakMonth.value)}
            </div>
          </div>

          <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 p-3 rounded-lg">
            <div className="text-xs text-purple-600 dark:text-purple-400 mb-1">Avg Monthly</div>
            <div className="text-lg font-bold text-purple-900 dark:text-purple-100">
              {formatCurrency(avgMonthly)}
            </div>
          </div>
        </div>

        {/* Vertical Monthly Bars */}
        <div>
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
            Monthly Performance
          </h3>
          <div className="space-y-2">
            {monthlyValues.map((item, index) => {
              const heightPercent = maxValue > 0 ? (item.value / maxValue) * 100 : 0;
              const hasValue = item.value > 0;

              return (
                <motion.div
                  key={item.month}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{
                    delay: index * 0.04,
                    duration: 0.3
                  }}
                  className="group relative"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 text-xs font-medium text-slate-600 dark:text-slate-400">
                      {item.month}
                    </div>

                    <div className="flex-1 flex items-center gap-2">
                      {hasValue ? (
                        <>
                          <motion.div
                            initial={{ scaleX: 0 }}
                            animate={{ scaleX: 1 }}
                            transition={{
                              delay: index * 0.04,
                              duration: 0.5,
                              ease: [0.34, 1.56, 0.64, 1]
                            }}
                            className="h-10 rounded-lg bg-gradient-to-r from-blue-500 via-purple-500 to-purple-600 shadow-sm hover:shadow-md transition-shadow cursor-pointer origin-left"
                            style={{ width: `${heightPercent}%` }}
                          />

                          <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 min-w-[80px] text-right">
                            {formatCurrency(item.value)}
                          </div>
                        </>
                      ) : (
                        <div className="flex-1 h-10 rounded-lg border-2 border-dashed border-slate-200 dark:border-slate-700 flex items-center justify-center">
                          <span className="text-xs text-slate-400">No data</span>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const AggregatedTimeline: React.FC<{ companies: CommissionData[] }> = ({ companies }) => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthKeys = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

    const aggregatedValues = monthKeys.map((key, index) => {
      const value = companies.reduce((sum, company) => {
        return sum + (company.monthly_breakdown?.[key as keyof typeof company.monthly_breakdown] || 0);
      }, 0);
      return { month: months[index], value };
    });

    const maxValue = Math.max(...aggregatedValues.map(m => m.value));
    const totalCommission = aggregatedValues.reduce((sum, m) => sum + m.value, 0);

    return (
      <div className="space-y-6">
        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900/20 dark:to-emerald-800/20 p-4 rounded-lg">
          <div className="text-xs text-emerald-600 dark:text-emerald-400 mb-1">Total Commission</div>
          <div className="text-2xl font-bold text-emerald-900 dark:text-emerald-100">
            {formatCurrency(totalCommission)}
          </div>
          <div className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
            Across {companies.length} {companies.length === 1 ? 'company' : 'companies'}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
            Aggregated Monthly Performance
          </h3>
          <div className="space-y-2">
            {aggregatedValues.map((item, index) => {
              const heightPercent = maxValue > 0 ? (item.value / maxValue) * 100 : 0;
              const hasValue = item.value > 0;

              return (
                <motion.div
                  key={item.month}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{
                    delay: index * 0.04,
                    duration: 0.3
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 text-xs font-medium text-slate-600 dark:text-slate-400">
                      {item.month}
                    </div>

                    <div className="flex-1 flex items-center gap-2">
                      {hasValue ? (
                        <>
                          <motion.div
                            initial={{ scaleX: 0 }}
                            animate={{ scaleX: 1 }}
                            transition={{
                              delay: index * 0.04,
                              duration: 0.5,
                              ease: [0.34, 1.56, 0.64, 1]
                            }}
                            className="h-10 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 shadow-sm hover:shadow-md transition-shadow cursor-pointer origin-left"
                            style={{ width: `${heightPercent}%` }}
                          />

                          <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 min-w-[80px] text-right">
                            {formatCurrency(item.value)}
                          </div>
                        </>
                      ) : (
                        <div className="flex-1 h-10 rounded-lg border-2 border-dashed border-slate-200 dark:border-slate-700 flex items-center justify-center">
                          <span className="text-xs text-slate-400">No data</span>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-l border-slate-200/50 dark:border-slate-700/50">
      {/* Header */}
      <div className="p-4 border-b border-slate-200/50 dark:border-slate-700/50">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
          Timeline Insights
        </h2>
        <p className="text-xs text-slate-500">
          {compareMode && selectedCompaniesForCompare.size > 0 && `Comparing ${selectedCompaniesForCompare.size} companies`}
          {!compareMode && selectedCompany && 'Company monthly breakdown'}
          {!compareMode && selectedCarrier && !selectedCompany && 'Carrier monthly trends'}
          {!compareMode && !selectedCarrier && !selectedCompany && 'Select an item to view details'}
        </p>
      </div>

      {/* Scrollable Timeline Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
        {displayData.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-400">
            <div className="text-center">
              <BarChart3 className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Select a carrier or company</p>
            </div>
          </div>
        ) : displayData.length === 1 ? (
          <SingleTimeline data={displayData[0]} />
        ) : (
          <AggregatedTimeline companies={displayData} />
        )}
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // Only re-render if these specific props change
  return (
    prevProps.selectedCarrier?.carrierName === nextProps.selectedCarrier?.carrierName &&
    prevProps.selectedCompany?.id === nextProps.selectedCompany?.id &&
    prevProps.compareMode === nextProps.compareMode &&
    prevProps.selectedCompaniesForCompare.size === nextProps.selectedCompaniesForCompare.size
  );
});

TimelineInsightPanel.displayName = 'TimelineInsightPanel';

// ============================================
// INTERACTIVE CONTEXT PANE
// ============================================

interface OverviewModeProps {
  carriers: CarrierGroup[];
  onSelectCarrier: (carrier: CarrierGroup) => void;
  viewAllData: boolean;
  onSetViewAllData: (value: boolean) => void;
  selectedYear: number | null;
  onYearChange: (year: number | null) => void;
  availableYears: number[];
}

const OverviewMode: React.FC<OverviewModeProps> = ({ 
  carriers, 
  onSelectCarrier,
  viewAllData,
  onSetViewAllData,
  selectedYear,
  onYearChange,
  availableYears
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<'commission' | 'companies' | 'alpha'>('commission');
  const ITEMS_PER_PAGE = 15;

  // Filter and sort carriers
  const filteredAndSortedCarriers = useMemo(() => {
    const filtered = carriers.filter(carrier =>
      carrier.carrierName.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const sorted = [...filtered];
    switch (sortMode) {
      case 'commission':
        sorted.sort((a, b) => b.totalCommission - a.totalCommission);
        break;
      case 'companies':
        sorted.sort((a, b) => b.companyCount - a.companyCount);
        break;
      case 'alpha':
        sorted.sort((a, b) => a.carrierName.localeCompare(b.carrierName));
        break;
    }
    return sorted;
  }, [carriers, searchQuery, sortMode]);

  const paginatedCarriers = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return filteredAndSortedCarriers.slice(startIndex, endIndex);
  }, [filteredAndSortedCarriers, currentPage]);

  const totalPages = Math.ceil(filteredAndSortedCarriers.length / ITEMS_PER_PAGE);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, sortMode]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.4 }}
      className="p-6 space-y-6"
    >
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
          Commission Explorer
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          Select a carrier to explore commission details
        </p>
      </div>

      {/* Search and Filter Controls */}
      <div className="flex items-center gap-4 mb-6">
        {/* Search Bar */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search carriers..."
            className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          />
        </div>

        {/* Sort Buttons */}
        <div className="flex gap-2 p-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
          <button
            onClick={() => setSortMode('commission')}
            className={`px-3 py-2 text-sm font-medium rounded transition-all ${
              sortMode === 'commission'
                ? 'bg-blue-500 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
            title="Sort by commission"
          >
            💰 Commission
          </button>
          <button
            onClick={() => setSortMode('companies')}
            className={`px-3 py-2 text-sm font-medium rounded transition-all ${
              sortMode === 'companies'
                ? 'bg-blue-500 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
            title="Sort by companies"
          >
            🏢 Companies
          </button>
          <button
            onClick={() => setSortMode('alpha')}
            className={`px-3 py-2 text-sm font-medium rounded transition-all ${
              sortMode === 'alpha'
                ? 'bg-blue-500 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
            title="Sort alphabetically"
          >
            🔤 A-Z
          </button>
        </div>

        {/* Year Selector */}
        {availableYears && availableYears.length > 0 && (
          <select
            value={selectedYear || ''}
            onChange={(e) => {
              const year = e.target.value ? parseInt(e.target.value) : null;
              onYearChange(year);
            }}
            className="px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          >
            <option value="">All Years</option>
            {availableYears.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        )}

        {/* My Data / All Data Toggle */}
        <div className="flex gap-0 p-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              console.log('🖱️ My Data button clicked');
              onSetViewAllData(false);
            }}
            className={`px-4 py-2 text-sm font-medium rounded transition-all ${
              !viewAllData
                ? 'bg-blue-500 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            My Data
          </button>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              console.log('🖱️ All Data button clicked');
              onSetViewAllData(true);
            }}
            className={`px-4 py-2 text-sm font-medium rounded transition-all ${
              viewAllData
                ? 'bg-blue-500 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            All Data
          </button>
        </div>
      </div>

      {/* Empty State */}
      {filteredAndSortedCarriers.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-20 px-4"
        >
          <div className="w-24 h-24 bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900/20 dark:to-purple-900/20 rounded-full flex items-center justify-center mb-6">
            <BarChart3 className="w-12 h-12 text-blue-600 dark:text-blue-400" />
          </div>
          <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">
            No Commission Data Available
          </h3>
          <p className="text-slate-600 dark:text-slate-400 text-center max-w-md mb-6">
            {searchQuery ? (
              <>No carriers found matching &ldquo;<strong>{searchQuery}</strong>&rdquo;. Try adjusting your search or filters.</>
            ) : viewAllData ? (
              <>There&apos;s no commission data available across all users yet. Upload statements to get started.</>
            ) : (
              <>You haven&apos;t uploaded any commission statements yet. Upload your first statement to start tracking your earnings.</>
            )}
          </p>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="px-6 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors shadow-lg hover:shadow-xl"
            >
              Clear Search
            </button>
          )}
        </motion.div>
      ) : (
        <>
          <div className="carrier-cards-grid">
            {paginatedCarriers.map((carrier, index) => (
              <CarrierCard
                key={carrier.carrierName}
                carrier={carrier}
                onClick={() => onSelectCarrier(carrier)}
              />
            ))}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6 px-4 py-3 bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-slate-200/50 dark:border-slate-700/50 rounded-lg">
          <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
            Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, filteredAndSortedCarriers.length)} of {filteredAndSortedCarriers.length} carriers
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-800/50 hover:bg-white dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Previous
            </button>

            <div className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300">
              Page {currentPage} of {totalPages}
            </div>

            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-800/50 hover:bg-white dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              Next
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
        </>
      )}
    </motion.div>
  );
};

interface CarrierDetailModeProps {
  carrier: CarrierGroup;
  expandedCompanyIds: Set<string>;
  onToggleExpand: (companyId: string) => void;
  onSelectCompany: (company: CommissionData) => void;
  onBack: () => void;
}

const CarrierDetailMode: React.FC<CarrierDetailModeProps> = ({
  carrier,
  expandedCompanyIds,
  onToggleExpand,
  onSelectCompany,
  onBack
}) => {
  const [companyPage, setCompanyPage] = useState(1);
  const [companySearch, setCompanySearch] = useState('');
  const COMPANIES_PER_PAGE = 15;

  const filteredCompanies = useMemo(() => {
    return carrier.companies.filter(company => 
      company.client_name.toLowerCase().includes(companySearch.toLowerCase())
    );
  }, [carrier.companies, companySearch]);

  const paginatedCompanies = useMemo(() => {
    const startIndex = (companyPage - 1) * COMPANIES_PER_PAGE;
    const endIndex = startIndex + COMPANIES_PER_PAGE;
    return filteredCompanies.slice(startIndex, endIndex);
  }, [filteredCompanies, companyPage]);

  const companyTotalPages = Math.ceil(filteredCompanies.length / COMPANIES_PER_PAGE);

  // Reset to page 1 when search changes
  useEffect(() => {
    setCompanyPage(1);
  }, [companySearch]);

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.4 }}
      className="p-6 space-y-6"
    >
      {/* Back Button and Breadcrumb */}
      <div className="flex items-center gap-3">
          <button
            onClick={onBack}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-800/50 hover:bg-white dark:hover:bg-slate-800 transition-colors text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          >
          <ArrowLeft className="w-4 h-4" />
          Back to All Carriers
          </button>

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <span 
            className="cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors"
            onClick={onBack}
          >
            All Carriers
          </span>
          <ChevronRight className="w-4 h-4" />
          <span className="text-slate-900 dark:text-white font-medium">
            {carrier.carrierName}
          </span>
        </div>
        </div>

      {/* Carrier Header */}
      <div className="glass-card-premium p-6 rounded-xl">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-2xl shadow-lg">
            {carrier.carrierName.charAt(0)}
            </div>
            <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
              {carrier.carrierName}
            </h2>
            <p className="text-slate-600 dark:text-slate-400">
              {carrier.companyCount} companies • {carrier.statementCount} statements
              </p>
            </div>
          </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
            <div className="text-sm text-blue-600 dark:text-blue-400 mb-1">Total Commission</div>
            <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">
              {formatCurrency(carrier.totalCommission)}
            </div>
          </div>
          <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg">
            <div className="text-sm text-purple-600 dark:text-purple-400 mb-1">Total Invoice</div>
            <div className="text-2xl font-bold text-purple-900 dark:text-purple-100">
              {formatCurrency(carrier.totalInvoice)}
            </div>
          </div>
          <div className="bg-emerald-50 dark:bg-emerald-900/20 p-4 rounded-lg">
            <div className="text-sm text-emerald-600 dark:text-emerald-400 mb-1">Avg per Company</div>
            <div className="text-2xl font-bold text-emerald-900 dark:text-emerald-100">
              {formatCurrency(carrier.totalCommission / carrier.companyCount)}
            </div>
          </div>
        </div>
        </div>

      {/* Company Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
          value={companySearch}
          onChange={(e) => setCompanySearch(e.target.value)}
          placeholder="Search companies..."
          className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          />
        </div>

      {/* Company Cards Grid */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2 items-start">
        {paginatedCompanies.map((company) => (
          <ExpandableCompanyCard
            key={company.id}
            company={company}
            isExpanded={expandedCompanyIds.has(company.id)}
            onToggleExpand={onToggleExpand}
            onSelect={onSelectCompany}
          />
        ))}
      </div>

      {/* Company Pagination */}
      {companyTotalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-slate-200/50 dark:border-slate-700/50 rounded-lg">
          <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
            Showing {(companyPage - 1) * COMPANIES_PER_PAGE + 1} - {Math.min(companyPage * COMPANIES_PER_PAGE, filteredCompanies.length)} of {filteredCompanies.length} companies
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCompanyPage(prev => Math.max(1, prev - 1))}
              disabled={companyPage === 1}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-800/50 hover:bg-white dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Previous
            </button>

            <div className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300">
              Page {companyPage} of {companyTotalPages}
                      </div>

                    <button
              onClick={() => setCompanyPage(prev => Math.min(companyTotalPages, prev + 1))}
              disabled={companyPage === companyTotalPages}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-800/50 hover:bg-white dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              Next
              <ArrowRight className="w-4 h-4" />
                    </button>
                        </div>
                      </div>
      )}
    </motion.div>
  );
};

interface CompanyDetailModeProps {
  company: CommissionData;
  carrier: CarrierGroup | null;
  onBack: () => void;
}

const CompanyDetailMode: React.FC<CompanyDetailModeProps> = ({ company, carrier, onBack }) => {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthKeys = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

  const monthlyData = monthKeys.map((key, index) => ({
    month: months[index],
    value: company.monthly_breakdown?.[key as keyof typeof company.monthly_breakdown] || 0
  }));

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.4 }}
      className="p-6 space-y-6"
    >
      {/* Breadcrumb */}
      <div className="breadcrumb-premium">
        <button onClick={onBack} className="breadcrumb-item">
          <ChevronLeft className="w-4 h-4" />
          <span>{carrier?.carrierName || 'Back'}</span>
        </button>
        <ChevronRight className="w-4 h-4 breadcrumb-chevron" />
        <span className="breadcrumb-item cursor-default bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
          {company.client_name}
        </span>
      </div>

      {/* Company Details */}
      <div className="glass-card-premium p-6 rounded-xl">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">
          {company.client_name}
        </h2>

        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
            <div className="text-sm text-blue-600 dark:text-blue-400 mb-1">Commission Earned</div>
            <div className="text-xl font-bold text-blue-900 dark:text-blue-100">
              {formatCurrency(company.commission_earned)}
            </div>
          </div>
          <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg">
            <div className="text-sm text-purple-600 dark:text-purple-400 mb-1">Invoice Total</div>
            <div className="text-xl font-bold text-purple-900 dark:text-purple-100">
              {formatCurrency(company.invoice_total)}
            </div>
          </div>
          <div className="bg-emerald-50 dark:bg-emerald-900/20 p-4 rounded-lg">
            <div className="text-sm text-emerald-600 dark:text-emerald-400 mb-1">Statements</div>
            <div className="text-xl font-bold text-emerald-900 dark:text-emerald-100">
              {company.statement_count}
            </div>
          </div>
          <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-lg">
            <div className="text-sm text-orange-600 dark:text-orange-400 mb-1">Year</div>
            <div className="text-xl font-bold text-orange-900 dark:text-orange-100">
              {company.statement_year || 'N/A'}
            </div>
          </div>
        </div>

        <div className="h-64 mb-6">
          <ResponsiveSparkline data={monthlyData} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          {monthlyData.map((item, index) => (
            <div
              key={item.month}
              className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg"
            >
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {item.month}
              </span>
              <span className="text-sm font-bold text-slate-900 dark:text-white">
                {item.value > 0 ? formatCurrency(item.value) : '—'}
          </span>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

interface EarnedCommissionTabProps {
  environmentId?: string | null;
}

export default function EarnedCommissionTab({ environmentId }: EarnedCommissionTabProps) {
  const { refreshTrigger } = useSubmission();
  const { loading: environmentsLoading } = useEnvironment();

  // Three-pane state
  const [selectedCarrier, setSelectedCarrier] = useState<CarrierGroup | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<CommissionData | null>(null);
  const [timelinePanelWidth, setTimelinePanelWidth] = useState(350);
  const [expandedCompanyIds, setExpandedCompanyIds] = useState<Set<string>>(new Set());
  const [compareMode, setCompareMode] = useState(false);
  const [selectedCompaniesForCompare, setSelectedCompaniesForCompare] = useState<Set<string>>(new Set());

  // Existing state
  const [selectedYear, setSelectedYear] = useState<number | null>(2025);
  const [viewAllData, setViewAllData] = useState(false);

  // Edit modals (keep for compatibility)
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

  // Resizing state
  const [isResizing, setIsResizing] = useState<'timeline' | null>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  // Fetch data based on viewAllData state
  const [commissionData, setCommissionData] = useState<any[]>([]);
  const [commissionStats, setCommissionStats] = useState<any>(null);
  const [dataLoading, setDataLoading] = useState(true);
  
  const { carriers, loading: carriersLoading, refetch: refetchCarriers } = useCarriersWithCommission();
  const { years: availableYears, loading: yearsLoading, refetch: refetchYears } = useAvailableYears();

  // Determine view mode for API calls
  const viewMode = viewAllData ? 'all_data' : 'my_data';

  // Fetch data based on viewAllData and selectedYear
  const fetchCommissionData = useCallback(async () => {
    setDataLoading(true);
    try {
      console.log('🔄 Fetching commission data:', { viewAllData, selectedYear, environmentId, viewMode });
      
      // Build params with new view_mode parameter
      const params = new URLSearchParams();
      params.append('view_mode', viewMode);
      if (selectedYear) params.append('year', selectedYear.toString());
      // CRITICAL FIX: Only pass environment_id in "My Data" mode
      // In "All Data" mode, we want to see ALL data across ALL environments
      if (viewMode === 'my_data' && environmentId) {
        params.append('environment_id', environmentId);
      }
      const queryString = params.toString();
      
      // Fetch stats using unified endpoint
      const statsResponse = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/earned-commission/stats?${queryString}`,
        { credentials: 'include' }
      );
      
      if (!statsResponse.ok) {
        if (statsResponse.status === 401) {
          console.log('⚠️ Unauthorized - user needs to login');
          setCommissionData([]);
          setCommissionStats(null);
          return;
        }
        throw new Error(`Stats fetch failed: ${statsResponse.status}`);
      }
      
      const stats = await statsResponse.json();
      setCommissionStats(stats);
      
      // Fetch data using unified endpoint
      const dataResponse = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/dashboard/earned-commissions?${queryString}`,
        { credentials: 'include' }
      );
      
      if (!dataResponse.ok) {
        if (dataResponse.status === 401) {
          console.log('⚠️ Unauthorized - user needs to login');
          setCommissionData([]);
          return;
        }
        throw new Error(`Data fetch failed: ${dataResponse.status}`);
      }
      
      const data = await dataResponse.json();
      
      // Ensure data is always an array
      if (Array.isArray(data)) {
        setCommissionData(data);
      } else {
        console.warn('⚠️ API returned non-array data:', typeof data, data);
        setCommissionData([]);
      }
      
      console.log('✅ Data fetched successfully:', { 
        viewMode, 
        dataCount: Array.isArray(data) ? data.length : 0,
        statsCount: stats?.total_carriers || 0
      });
    } catch (error) {
      console.error('❌ Error fetching commission data:', error);
      setCommissionData([]);
      setCommissionStats(null);
    } finally {
      setDataLoading(false);
    }
  }, [viewMode, selectedYear, environmentId]);

  // CRITICAL FIX: Wait for environments to load before fetching data
  // This prevents multiple redundant API calls during initial page load
  useEffect(() => {
    if (!environmentsLoading) {
      fetchCommissionData();
    }
  }, [fetchCommissionData, environmentsLoading]);

  // Refresh when refreshTrigger changes
  useEffect(() => {
    if (refreshTrigger) {
      fetchCommissionData();
      refetchCarriers();
      refetchYears();
    }
  }, [refreshTrigger, fetchCommissionData, refetchCarriers, refetchYears]);

  const allData = commissionData;
  const allDataLoading = dataLoading;
  const overallStats = commissionStats;
  const statsLoading = dataLoading;

  // Transform data into carrier groups
  const carrierGroups = useMemo(() => {
    // Ensure filteredData is always an array
    const rawData = allData || [];
    
    // Validate that rawData is an array
    if (!Array.isArray(rawData)) {
      console.error('❌ Expected array but got:', typeof rawData, rawData);
      return [];
    }
    
    const filteredData = rawData;
    console.log('🔄 Recalculating carrier groups with data count:', filteredData.length);
    console.log('🔍 Using data source:', viewAllData ? 'GLOBAL DATA' : 'USER DATA');
    
    // Return empty array if no data
    if (filteredData.length === 0) {
      console.log('⚠️ No data available for carrier groups');
      return [];
    }
    
    try {
      const groups = filteredData.reduce((groups, item: CommissionData) => {
        if (!item || typeof item !== 'object') {
          console.warn('⚠️ Invalid item in data:', item);
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
        // Use approved_statement_count from the first company (it's the same for all companies in the carrier)
        // This represents the actual number of statement files uploaded for the carrier
        const totalStatementCount = typedCompanies[0]?.approved_statement_count || 0;
        
        return {
          carrierName,
          companies: typedCompanies,
          totalCommission: typedCompanies.reduce((sum: number, company: CommissionData) => sum + (company.commission_earned || 0), 0),
          totalInvoice: typedCompanies.reduce((sum: number, company: CommissionData) => sum + (company.invoice_total || 0), 0),
          companyCount: uniqueCompanies.size,
          statementCount: totalStatementCount,
        };
      }).sort((a, b) => b.totalCommission - a.totalCommission);
      
      console.log('✅ Carrier groups calculated:', result.length, 'carriers');
      return result;
    } catch (error) {
      console.error('❌ Error calculating carrier groups:', error);
      return [];
    }
  }, [allData, viewAllData]);

  // Get all companies flattened
  const getAllCompanies = useCallback(() => {
    return carrierGroups.flatMap(c => c.companies);
  }, [carrierGroups]);

  // Handle carrier selection
  const handleCarrierSelect = useCallback((carrier: CarrierGroup) => {
    setSelectedCarrier(carrier);
    setSelectedCompany(null);
  }, []);

  // Handle company selection
  const handleCompanySelect = useCallback((company: CommissionData) => {
    setSelectedCompany(company);
  }, []);

  // Handle toggle expand
  const handleToggleExpand = useCallback((companyId: string) => {
    setExpandedCompanyIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(companyId)) {
        newSet.delete(companyId);
      } else {
        newSet.add(companyId);
      }
      return newSet;
    });
  }, []);

  // Handle toggle compare
  const handleToggleCompare = useCallback((value: boolean | Set<string>) => {
    if (typeof value === 'boolean') {
      setCompareMode(value);
      if (!value) {
        setSelectedCompaniesForCompare(new Set());
      }
    } else {
      setSelectedCompaniesForCompare(value);
    }
  }, []);

  // Handle resizing
  const handleResizeStart = (e: React.MouseEvent, pane: 'timeline') => {
    setIsResizing(pane);
    startXRef.current = e.clientX;
    startWidthRef.current = timelinePanelWidth;
    e.preventDefault();
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const delta = startXRef.current - e.clientX;
      const newWidth = Math.max(250, Math.min(600, startWidthRef.current + delta));
      setTimelinePanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(null);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isResizing]);

  // Handle edit/merge (keep for compatibility)
  const handleEditCommission = (data: CommissionData) => {
    setEditingData(data);
    setEditModalOpen(true);
  };

  const handleSaveCommission = async (updatedData: Partial<CommissionData>) => {
    setEditLoading(true);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/earned-commission/${updatedData.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: updatedData.client_name,
          invoice_total: updatedData.invoice_total,
          commission_earned: updatedData.commission_earned,
        }),
      });

      if (!response.ok) throw new Error('Failed to update commission data');
      const result = await response.json();

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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_id: mergeData.sourceId,
          target_id: mergeData.existingRecord.id,
        }),
      });

      if (!response.ok) throw new Error('Failed to merge commission records');
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
    setEditModalOpen(true);
  };

  const clearFilters = () => {
    setSelectedYear(2025);
  };

  const hasActiveFilters = selectedYear !== 2025;

  const isLoading = allDataLoading || carriersLoading;

  // Show timeline only when there's something selected
  const showTimeline = selectedCarrier !== null || selectedCompany !== null;

  return (
    <div className="commission-explorer-container flex h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 relative">
      {/* Main Content - Full Width */}
      <main className="interactive-context-pane flex-1 overflow-y-auto relative">
        {isLoading ? (
          <div className="p-6">
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              {[...Array(9)].map((_, i) => (
                <CarrierCardSkeleton key={i} />
              ))}
      </div>
        </div>
        ) : (
          <AnimatePresence mode="wait">
            {!selectedCarrier && !selectedCompany && (
              <OverviewMode
                carriers={carrierGroups}
                onSelectCarrier={handleCarrierSelect}
                viewAllData={viewAllData}
                onSetViewAllData={(value) => {
                  console.log('⚙️ onSetViewAllData called with value:', value);
                  console.log('⚙️ Current viewAllData state before:', viewAllData);
                  setViewAllData(value);
                  console.log('⚙️ State set to:', value);
                  // Data will be automatically refetched by the useEffect watching viewAllData
                }}
                selectedYear={selectedYear}
                onYearChange={(year) => {
                  console.log('⚙️ Year changed to:', year);
                  setSelectedYear(year);
                  setSelectedCarrier(null);
                  setSelectedCompany(null);
                  // Data will be automatically refetched by the useEffect watching selectedYear
                }}
                availableYears={availableYears || []}
              />
            )}

            {selectedCarrier && !selectedCompany && (
              <CarrierDetailMode
                carrier={selectedCarrier}
                expandedCompanyIds={expandedCompanyIds}
                onToggleExpand={handleToggleExpand}
                onSelectCompany={handleCompanySelect}
                onBack={() => {
                  setSelectedCarrier(null);
                  setSelectedCompany(null);
                }}
              />
            )}

            {selectedCompany && (
              <CompanyDetailMode
                company={selectedCompany}
                carrier={selectedCarrier}
                onBack={() => setSelectedCompany(null)}
              />
            )}
          </AnimatePresence>
        )}
      </main>

      {/* PANE 3: Timeline Insight Panel - Only show when carrier/company selected */}
                        <AnimatePresence>
        {showTimeline && (
          <>
            {/* Resizer for timeline */}
            <div
              className="resize-handle"
              onMouseDown={(e) => handleResizeStart(e, 'timeline')}
            />

            <motion.aside
              initial={{ x: timelinePanelWidth, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: timelinePanelWidth, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
              className="timeline-insight-panel"
              style={{ width: `${timelinePanelWidth}px` }}
            >
              {isLoading ? (
                <TimelineSkeleton />
              ) : (
                <TimelineInsightPanel
                  selectedCarrier={selectedCarrier}
                  selectedCompany={selectedCompany}
                  compareMode={compareMode}
                  selectedCompaniesForCompare={selectedCompaniesForCompare}
                  allCompanies={getAllCompanies()}
                />
              )}
            </motion.aside>
            </>
          )}
      </AnimatePresence>

      {/* Modals (Keep for compatibility) */}
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
