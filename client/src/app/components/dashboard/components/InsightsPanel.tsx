'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { 
  Lightbulb, 
  TrendingUp, 
  AlertCircle, 
  Target,
  Zap,
  X,
  ChevronRight,
  Info
} from 'lucide-react';

interface Insight {
  id: string;
  type: 'growth' | 'alert' | 'opportunity' | 'achievement' | 'info';
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  dismissible?: boolean;
}

interface InsightsPanelProps {
  insights?: Insight[];
}

function getInsightIcon(type: Insight['type']) {
  switch (type) {
    case 'growth':
      return <TrendingUp className="w-4 h-4" />;
    case 'alert':
      return <AlertCircle className="w-4 h-4" />;
    case 'opportunity':
      return <Target className="w-4 h-4" />;
    case 'achievement':
      return <Zap className="w-4 h-4" />;
    case 'info':
    default:
      return <Info className="w-4 h-4" />;
  }
}

function getInsightColor(type: Insight['type']) {
  switch (type) {
    case 'growth':
      return 'text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30';
    case 'alert':
      return 'text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30';
    case 'opportunity':
      return 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30';
    case 'achievement':
      return 'text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/30';
    case 'info':
    default:
      return 'text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-900/30';
  }
}

export default function InsightsPanel({ insights }: InsightsPanelProps) {
  const router = useRouter();
  const defaultInsights: Insight[] = [
    {
      id: '1',
      type: 'growth',
      title: 'Your commission grew 18.2% this year',
      description: 'Outperforming industry average by 8.5%',
      dismissible: true
    },
    {
      id: '2',
      type: 'achievement',
      title: 'Top performer: Allied Benefit Systems',
      description: 'Contributing 55.1% of total commission',
      action: {
        label: 'View Details',
        onClick: () => router.push('/?tab=earned-commission-carriers')
      }
    },
    {
      id: '3',
      type: 'alert',
      title: '1 statement pending approval',
      description: 'Submitted 3 days ago',
      action: {
        label: 'Review Now',
        onClick: () => router.push('/pending')
      }
    },
    {
      id: '4',
      type: 'opportunity',
      title: 'Avg commission rate increased to 11.1%',
      description: 'Up from 10.6% last year',
      dismissible: true
    }
  ];

  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const activeInsights = (insights || defaultInsights).filter(
    insight => !dismissedIds.has(insight.id)
  );

  const handleDismiss = (id: string) => {
    setDismissedIds(prev => new Set([...prev, id]));
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, delay: 0.5 }}
      className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6 h-full flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <Lightbulb className="w-5 h-5" />
          Key Insights
        </h3>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          AI-Powered Analysis
        </span>
      </div>

      {/* Insights List */}
      <div className="flex-1 space-y-3 overflow-y-auto">
        <AnimatePresence>
          {activeInsights.map((insight, index) => (
            <motion.div
              key={insight.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -100 }}
              transition={{ delay: index * 0.05 }}
              className="relative group"
            >
              <div 
                className={`p-4 rounded-lg border transition-all duration-200 ${
                  expandedId === insight.id 
                    ? 'border-blue-200 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-900/10' 
                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                } cursor-pointer`}
                onClick={() => setExpandedId(expandedId === insight.id ? null : insight.id)}
              >
                {/* Main Content */}
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    getInsightColor(insight.type)
                  }`}>
                    {getInsightIcon(insight.type)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100 pr-6">
                      {insight.title}
                    </p>
                    
                    <AnimatePresence>
                      {(expandedId === insight.id || !insight.description) && insight.description && (
                        <motion.p
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="text-xs text-slate-600 dark:text-slate-400 mt-1"
                        >
                          {insight.description}
                        </motion.p>
                      )}
                    </AnimatePresence>

                    {insight.action && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          insight.action?.onClick();
                        }}
                        className="mt-2 text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                      >
                        {insight.action.label}
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  {/* Dismiss Button */}
                  {insight.dismissible && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDismiss(insight.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded"
                    >
                      <X className="w-3 h-3 text-slate-400" />
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Footer Stats */}
      <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 grid grid-cols-3 gap-4 text-center">
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">Growth</p>
          <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">+18.2%</p>
        </div>
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">Alerts</p>
          <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">1</p>
        </div>
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">Opportunities</p>
          <p className="text-sm font-semibold text-blue-600 dark:text-blue-400">3</p>
        </div>
      </div>
    </motion.div>
  );
}
