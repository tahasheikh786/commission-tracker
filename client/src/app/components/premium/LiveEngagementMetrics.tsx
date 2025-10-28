'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import CountUp from 'react-countup';
import { Users, FileText, Database, Zap } from 'lucide-react';

interface MetricCardProps {
  icon: React.ReactNode;
  value: number | string;
  label: string;
  color: 'green' | 'blue' | 'purple' | 'orange';
  pulse?: boolean;
}

const MetricCard = ({ icon, value, label, color, pulse }: MetricCardProps) => {
  const colorMap = {
    green: {
      bg: 'bg-green-50 dark:bg-green-900/20',
      border: 'border-green-200 dark:border-green-700',
      icon: 'text-green-600 dark:text-green-400',
      text: 'text-green-700 dark:text-green-300',
      pulse: 'bg-green-600'
    },
    blue: {
      bg: 'bg-blue-50 dark:bg-blue-900/20',
      border: 'border-blue-200 dark:border-blue-700',
      icon: 'text-blue-600 dark:text-blue-400',
      text: 'text-blue-700 dark:text-blue-300',
      pulse: 'bg-blue-600'
    },
    purple: {
      bg: 'bg-purple-50 dark:bg-purple-900/20',
      border: 'border-purple-200 dark:border-purple-700',
      icon: 'text-purple-600 dark:text-purple-400',
      text: 'text-purple-700 dark:text-purple-300',
      pulse: 'bg-purple-600'
    },
    orange: {
      bg: 'bg-orange-50 dark:bg-orange-900/20',
      border: 'border-orange-200 dark:border-orange-700',
      icon: 'text-orange-600 dark:text-orange-400',
      text: 'text-orange-700 dark:text-orange-300',
      pulse: 'bg-orange-600'
    }
  };

  const colors = colorMap[color];
  const numValue = typeof value === 'string' ? parseInt(value.replace(/[^0-9]/g, '')) : value;

  return (
    <motion.div
      className={`relative ${colors.bg} ${colors.border} border rounded-xl p-4 backdrop-blur-sm`}
      whileHover={{ y: -2, scale: 1.02 }}
      transition={{ duration: 0.2 }}
    >
      {pulse && (
        <div className="absolute top-3 right-3">
          <span className="flex h-3 w-3">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${colors.pulse} opacity-75`} />
            <span className={`relative inline-flex rounded-full h-3 w-3 ${colors.pulse}`} />
          </span>
        </div>
      )}

      <div className={`${colors.icon} mb-2`}>
        {icon}
      </div>

      <div className={`text-2xl font-bold ${colors.text} mb-1`}>
        {typeof value === 'number' ? (
          <CountUp end={numValue} duration={1} separator="," />
        ) : (
          value
        )}
      </div>

      <div className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
        {label}
      </div>
    </motion.div>
  );
};

const formatCompactNumber = (num: number): string => {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
};

export default function LiveEngagementMetrics() {
  const [metrics, setMetrics] = useState({
    usersOnline: 2147,
    filesUploaded: 23891,
    rowsExtracted: 24700000,
    processingNow: 47
  });

  // Simulate real-time updates
  useEffect(() => {
    const interval = setInterval(() => {
      setMetrics(prev => ({
        usersOnline: Math.max(1800, prev.usersOnline + Math.floor(Math.random() * 5 - 2)),
        filesUploaded: prev.filesUploaded + Math.floor(Math.random() * 3),
        rowsExtracted: prev.rowsExtracted + Math.floor(Math.random() * 1000),
        processingNow: Math.max(30, prev.processingNow + Math.floor(Math.random() * 5 - 2))
      }));
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  return (
    <motion.div
      className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12"
      initial={{ y: 30, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.5 }}
    >
      {/* Users Online */}
      <MetricCard
        icon={<Users className="w-5 h-5" />}
        value={metrics.usersOnline}
        label="Active Users"
        color="green"
        pulse
      />

      {/* Files Uploaded Today */}
      <MetricCard
        icon={<FileText className="w-5 h-5" />}
        value={formatCompactNumber(metrics.filesUploaded)}
        label="Files Today"
        color="blue"
      />

      {/* Rows Extracted */}
      <MetricCard
        icon={<Database className="w-5 h-5" />}
        value={formatCompactNumber(metrics.rowsExtracted)}
        label="Rows Extracted"
        color="purple"
      />

      {/* Processing Now */}
      <MetricCard
        icon={<Zap className="w-5 h-5" />}
        value={metrics.processingNow}
        label="Processing Now"
        color="orange"
        pulse
      />
    </motion.div>
  );
}

