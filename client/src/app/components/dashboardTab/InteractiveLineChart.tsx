'use client'
import React from 'react';
import { motion } from 'framer-motion';
import {
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { formatCurrency, formatCurrencyCompact } from '../../utils/formatters';

interface InteractiveLineChartProps {
  data: Array<{
    month: string;
    value: number;
  }>;
}

// Custom Glassmorphic Tooltip Component
const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ duration: 0.2 }}
        className="glass-card-premium p-4 rounded-lg border border-slate-200/50 dark:border-slate-700/50 shadow-xl"
      >
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
          {payload[0].payload.month}
        </p>
        <p className="text-lg font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
          {formatCurrency(payload[0].value)}
        </p>
      </motion.div>
    );
  }
  return null;
};

// Custom Dot Component with Gradient and Hover Effect
const CustomDot = (props: any) => {
  const { cx, cy, payload } = props;
  
  // Don't render dot if value is 0
  if (!payload.value || payload.value === 0) return null;

  return (
    <motion.g
      whileHover={{ scale: 1.5 }}
      transition={{ duration: 0.2 }}
    >
      <defs>
        <linearGradient id={`dotGradient-${cx}-${cy}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="50%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#d946ef" />
        </linearGradient>
      </defs>
      <circle
        cx={cx}
        cy={cy}
        r="6"
        fill="white"
        stroke={`url(#dotGradient-${cx}-${cy})`}
        strokeWidth="3"
        filter="drop-shadow(0 2px 4px rgba(0,0,0,0.1))"
        className="cursor-pointer"
      />
    </motion.g>
  );
};

export const InteractiveLineChart: React.FC<InteractiveLineChartProps> = ({ data }) => {
  // Check if there's any data
  const hasData = data.some((d) => d.value > 0);

  // Calculate max value for Y-axis domain
  const maxValue = Math.max(...data.map((d) => d.value));
  const yAxisDomain = [0, maxValue * 1.1];

  if (!hasData) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="flex items-center justify-center h-full"
      >
        <div className="glass-card-premium p-8 rounded-xl text-center">
          <div className="text-slate-400 dark:text-slate-500 text-lg font-medium">
            No commission data available
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="w-full h-full"
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
        >
          <defs>
            {/* Line Gradient */}
            <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#3b82f6" />
              <stop offset="50%" stopColor="#8b5cf6" />
              <stop offset="100%" stopColor="#d946ef" />
            </linearGradient>
            
            {/* Area Gradient */}
            <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.05} />
            </linearGradient>
          </defs>

          {/* Grid Lines */}
          <CartesianGrid
            strokeDasharray="5 5"
            className="opacity-50"
            stroke="currentColor"
            style={{
              color: 'rgb(148 163 184 / 0.5)', // slate-400 with opacity
            }}
          />

          {/* X Axis */}
          <XAxis
            dataKey="month"
            tick={{ 
              fill: 'currentColor',
              fontSize: 12,
              fontWeight: 500,
            }}
            className="text-slate-600 dark:text-slate-400"
            axisLine={{ stroke: 'currentColor', strokeWidth: 1 }}
            tickLine={{ stroke: 'currentColor', strokeWidth: 1 }}
          />

          {/* Y Axis */}
          <YAxis
            domain={yAxisDomain}
            tick={{ 
              fill: 'currentColor',
              fontSize: 12,
              fontWeight: 500,
            }}
            className="text-slate-600 dark:text-slate-400"
            tickFormatter={(value) => formatCurrencyCompact(value)}
            axisLine={{ stroke: 'currentColor', strokeWidth: 1 }}
            tickLine={{ stroke: 'currentColor', strokeWidth: 1 }}
          />

          {/* Tooltip */}
          <Tooltip
            content={<CustomTooltip />}
            cursor={{
              stroke: '#8b5cf6',
              strokeWidth: 2,
              strokeDasharray: '5 5',
            }}
          />

          {/* Area Fill */}
          <Area
            type="monotone"
            dataKey="value"
            stroke="none"
            fill="url(#areaGradient)"
            animationDuration={1200}
            animationEasing="ease-in-out"
          />

          {/* Line */}
          <Line
            type="monotone"
            dataKey="value"
            stroke="url(#lineGradient)"
            strokeWidth={3}
            dot={<CustomDot />}
            activeDot={{ r: 8 }}
            animationDuration={1500}
            animationEasing="ease-in-out"
          />
        </AreaChart>
      </ResponsiveContainer>
    </motion.div>
  );
};

