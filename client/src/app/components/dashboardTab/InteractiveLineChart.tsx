'use client'
import React, { useState, useEffect } from 'react';
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
        initial={{ opacity: 0, scale: 0.9, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm px-4 py-3 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700"
      >
        <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
          {payload[0].payload.month} 2025
        </p>
        <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
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
    <g>
      <circle
        cx={cx}
        cy={cy}
        r={4}
        fill="#fff"
        stroke="#8b5cf6"
        strokeWidth={2}
        className="transition-all duration-200 hover:r-6"
      />
    </g>
  );
};

export const InteractiveLineChart: React.FC<InteractiveLineChartProps> = ({ data }) => {
  const [isReady, setIsReady] = useState(false);
  
  // ⚡ Ensure chart only renders when component is mounted and data is ready
  useEffect(() => {
    const timer = setTimeout(() => setIsReady(true), 100);
    return () => clearTimeout(timer);
  }, []);

  // Check if there's any data
  const hasData = data && data.some((d) => d.value > 0);
  
  // Calculate max value for Y-axis domain
  const maxValue = hasData ? Math.max(...data.map((d) => d.value)) : 0;
  const yAxisDomain = [0, maxValue * 1.15];  // ⚡ 15% padding above max value

  if (!hasData) {
    return (
      <div className="flex items-center justify-center h-full min-h-[240px] text-slate-400">
        <div className="text-center">
          <p className="text-sm font-medium">No commission data available</p>
          <p className="text-xs mt-1 text-slate-400">Data will appear once commissions are recorded</p>
        </div>
      </div>
    );
  }

  if (!isReady) {
    // ⚡ Show loading skeleton while chart prepares
    return (
      <div className="flex items-center justify-center h-full min-h-[240px]">
        <div className="animate-pulse">
          <div className="h-4 w-32 bg-slate-200 dark:bg-slate-700 rounded mb-2"></div>
          <div className="h-3 w-24 bg-slate-200 dark:bg-slate-700 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <ResponsiveContainer 
      width="100%" 
      height={250}  // ⚡ CRITICAL: Explicit height
      minHeight={240}
      debounce={50}  // ⚡ Debounce resize events for smoother performance
    >
      <AreaChart
        data={data}
        margin={{ top: 15, right: 15, left: -10, bottom: 5 }}  // ⚡ Adjusted margins
      >
        <defs>
          {/* Line Gradient */}
          <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#8b5cf6" />
            <stop offset="50%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#3b82f6" />
          </linearGradient>
          
          {/* Area Gradient */}
          <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.3} />
            <stop offset="50%" stopColor="#6366f1" stopOpacity={0.15} />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        
        {/* Grid Lines */}
        <CartesianGrid 
          strokeDasharray="3 3" 
          stroke="currentColor" 
          opacity={0.1}
          vertical={false}
        />
        
        {/* X Axis */}
        <XAxis
          dataKey="month"
          stroke="currentColor"
          opacity={0.6}
          tick={{ fontSize: 11, fontWeight: 500 }}
          axisLine={{ stroke: 'currentColor', strokeWidth: 1, opacity: 0.2 }}
          tickLine={false}
          dy={8}
        />
        
        {/* Y Axis */}
        <YAxis
          stroke="currentColor"
          opacity={0.6}
          tick={{ fontSize: 11, fontWeight: 500 }}
          tickFormatter={(value) => formatCurrencyCompact(value)}
          axisLine={{ stroke: 'currentColor', strokeWidth: 1, opacity: 0.2 }}
          tickLine={false}
          domain={yAxisDomain}
          dx={-5}
        />
        
        {/* Tooltip */}
        <Tooltip 
          content={<CustomTooltip />}
          cursor={{
            stroke: '#8b5cf6',
            strokeWidth: 2,
            strokeDasharray: '5 5',
            opacity: 0.5
          }}
        />
        
        {/* Area Fill */}
        <Area
          type="monotone"
          dataKey="value"
          stroke="url(#lineGradient)"
          fill="url(#areaGradient)"
          strokeWidth={3}
          dot={<CustomDot />}
          activeDot={{ 
            r: 6, 
            strokeWidth: 3, 
            stroke: '#fff',
            fill: '#8b5cf6'
          }}
          animationDuration={1200}
          animationEasing="ease-in-out"
          isAnimationActive={true}
          animationBegin={200}  // ⚡ Delay animation start slightly
        />
      </AreaChart>
    </ResponsiveContainer>
  );
};

