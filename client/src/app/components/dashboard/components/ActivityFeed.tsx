'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  CheckCircle, 
  Upload, 
  DollarSign, 
  AlertCircle, 
  FileText,
  Clock,
  ArrowRight
} from 'lucide-react';

interface Activity {
  id: string;
  type: 'approved' | 'uploaded' | 'calculated' | 'pending' | 'processed';
  title: string;
  description: string;
  timestamp: Date;
  status?: 'success' | 'warning' | 'info';
}

interface ActivityFeedProps {
  activities?: Activity[];
}

function getActivityIcon(type: Activity['type']) {
  switch (type) {
    case 'approved':
      return <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />;
    case 'uploaded':
      return <Upload className="w-4 h-4 text-blue-600 dark:text-blue-400" />;
    case 'calculated':
      return <DollarSign className="w-4 h-4 text-purple-600 dark:text-purple-400" />;
    case 'pending':
      return <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />;
    case 'processed':
      return <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />;
    default:
      return <AlertCircle className="w-4 h-4 text-slate-600 dark:text-slate-400" />;
  }
}

function getRelativeTime(date: Date): string {
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (diffInSeconds < 60) return 'just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)} days ago`;
  
  return date.toLocaleDateString();
}

export default function ActivityFeed({ activities }: ActivityFeedProps) {
  const recentActivities = activities || [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.4 }}
      className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6 h-full flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <Clock className="w-5 h-5" />
          Recent Activity
        </h3>
        <button className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
          View All
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      {/* Activity List */}
      <div className="flex-1 space-y-3 overflow-y-auto">
        {recentActivities.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-slate-500">
            <div className="text-center">
              <Clock className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No recent activity</p>
              <p className="text-sm">Activity will appear here as you upload statements</p>
            </div>
          </div>
        ) : (
          <AnimatePresence>
            {recentActivities.map((activity, index) => (
              <motion.div
                key={activity.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ delay: index * 0.05 }}
                className="group relative flex gap-3 p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer"
              >
                {/* Icon */}
                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                  activity.status === 'success' ? 'bg-emerald-100 dark:bg-emerald-900/30' :
                  activity.status === 'warning' ? 'bg-amber-100 dark:bg-amber-900/30' :
                  'bg-blue-100 dark:bg-blue-900/30'
                }`}>
                  {getActivityIcon(activity.type)}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                    {activity.title}
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400 truncate">
                    {activity.description}
                  </p>
                </div>

                {/* Timestamp */}
                <div className="flex-shrink-0 text-xs text-slate-500 dark:text-slate-400">
                  {getRelativeTime(activity.timestamp)}
                </div>

                {/* New indicator for recent items */}
                {index === 0 && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute top-3 right-3 w-2 h-2 bg-blue-500 rounded-full"
                  />
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Footer */}
      <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500 dark:text-slate-400">
            Last updated: {new Date().toLocaleTimeString()}
          </span>
          <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            Live
          </span>
        </div>
      </div>
    </motion.div>
  );
}
