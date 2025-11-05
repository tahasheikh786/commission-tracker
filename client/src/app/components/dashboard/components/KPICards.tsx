'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  DollarSign, 
  Building2, 
  FileText, 
  CheckCircle,
  Percent,
  Target
} from 'lucide-react';
import CountUp from 'react-countup';

interface KPICardProps {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  onClick?: () => void;
}

function KPICard({ 
  title, 
  value, 
  icon, 
  prefix = '', 
  suffix = '',
  decimals = 0,
  onClick 
}: KPICardProps) {
  const isNumericValue = typeof value === 'number';

  return (
    <motion.div
      whileHover={{ y: -1, scale: 1.02 }}
      whileTap={{ scale: 0.99 }}
      onClick={onClick}
      className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5 transition-all duration-300 hover:shadow-lg hover:border-gray-300 dark:hover:border-slate-600 cursor-pointer min-h-[120px] flex flex-col"
    >
      {/* Icon */}
      <div className="w-12 h-12 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center mb-3">
        <div className="text-blue-600 dark:text-blue-400">
          {icon}
        </div>
      </div>

      {/* Label */}
      <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">{title}</p>

      {/* Value */}
      <div className="text-3xl font-bold text-gray-900 dark:text-white">
        {prefix}
        {isNumericValue ? (
          <CountUp end={value as number} decimals={decimals} duration={2} separator="," />
        ) : value}
        {suffix}
      </div>
    </motion.div>
  );
}

interface KPICardsProps {
  data?: {
    totalCommission: { value: number; change: number; trend: 'up' | 'down' | 'neutral'; sparkline?: number[] };
    activeCarriers: { value: number; change: number; trend: 'up' | 'down' | 'neutral' };
    statementsProcessed: { value: number; change: number; trend: 'up' | 'down' | 'neutral' };
    successRate: { value: number; change: number; trend: 'up' | 'down' | 'neutral' };
    avgCommissionRate?: { value: number; change: number; trend: 'up' | 'down' | 'neutral' };
    ytdVsTarget?: { value: number; target: number; percentage: number };
  };
}

export default function KPICards({ data }: KPICardsProps) {
  const cards = [
    {
      title: 'Total Commission',
      value: data?.totalCommission?.value || 0,
      icon: <DollarSign className="w-5 h-5" />,
      prefix: '$',
      suffix: 'K',
      decimals: 1,
      onClick: () => console.log('Navigate to commission details')
    },
    {
      title: 'Active Carriers',
      value: data?.activeCarriers?.value || 0,
      icon: <Building2 className="w-5 h-5" />,
      onClick: () => console.log('Navigate to carriers')
    },
    {
      title: 'Statements Processed',
      value: data?.statementsProcessed?.value || 0,
      icon: <FileText className="w-5 h-5" />,
      onClick: () => console.log('Navigate to statements')
    },
    {
      title: 'Success Rate',
      value: data?.successRate?.value || 0,
      icon: <CheckCircle className="w-5 h-5" />,
      suffix: '%',
      onClick: () => console.log('Navigate to processing stats')
    },
    {
      title: 'Avg Commission Rate',
      value: data?.avgCommissionRate?.value || 0,
      icon: <Percent className="w-5 h-5" />,
      suffix: '%',
      decimals: 1,
      onClick: () => console.log('Navigate to rate analysis')
    },
    data?.ytdVsTarget && {
      title: 'YTD vs Target',
      value: data.ytdVsTarget.percentage,
      icon: <Target className="w-5 h-5" />,
      suffix: '%',
      decimals: 1,
      onClick: () => console.log('Navigate to targets')
    }
  ].filter(Boolean);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ staggerChildren: 0.1 }}
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 mb-8"
    >
      <AnimatePresence>
        {cards.map((card, index) => (
          card && (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <KPICard {...card} />
            </motion.div>
          )
        ))}
      </AnimatePresence>
    </motion.div>
  );
}
