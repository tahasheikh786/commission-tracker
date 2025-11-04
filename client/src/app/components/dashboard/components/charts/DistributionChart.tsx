'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend
} from 'chart.js';
import { PieChart, Filter } from 'lucide-react';

ChartJS.register(ArcElement, Tooltip, Legend);

interface DistributionChartProps {
  data?: {
    labels: string[];
    values: number[];
    colors?: string[];
  };
}

export default function DistributionChart({ data }: DistributionChartProps) {
  const [viewType, setViewType] = useState<'planType' | 'carrier'>('planType');

  const defaultPlanTypeData = {
    labels: ['Health', 'Dental', 'Vision', 'Life', 'Other'],
    values: [45000, 25000, 15000, 8000, 2200],
    colors: [
      'rgba(59, 130, 246, 0.8)',
      'rgba(147, 51, 234, 0.8)',
      'rgba(236, 72, 153, 0.8)',
      'rgba(251, 146, 60, 0.8)',
      'rgba(163, 163, 163, 0.8)'
    ]
  };

  const defaultCarrierData = {
    labels: ['Allied Benefit', 'Adrem Admin'],
    values: [52500, 42700],
    colors: [
      'rgba(59, 130, 246, 0.8)',
      'rgba(147, 51, 234, 0.8)'
    ]
  };

  const chartData = viewType === 'planType' 
    ? (data || defaultPlanTypeData)
    : defaultCarrierData;

  const total = chartData.values.reduce((sum, val) => sum + val, 0);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        titleColor: 'white',
        bodyColor: 'white',
        padding: 12,
        cornerRadius: 8,
        callbacks: {
          label: function(context: any) {
            const value = context.parsed;
            const percentage = ((value / total) * 100).toFixed(1);
            const amount = new Intl.NumberFormat('en-US', {
              style: 'currency',
              currency: 'USD',
              minimumFractionDigits: 0
            }).format(value);
            return `${context.label}: ${amount} (${percentage}%)`;
          }
        }
      }
    },
    cutout: '65%',
    animation: {
      animateRotate: true,
      animateScale: true
    }
  };

  const doughnutData = {
    labels: chartData.labels,
    datasets: [{
      data: chartData.values,
      backgroundColor: chartData.colors || defaultPlanTypeData.colors,
      borderColor: chartData.colors?.map(color => color.replace('0.8', '1')) || defaultPlanTypeData.colors.map(color => color.replace('0.8', '1')),
      borderWidth: 0,
      hoverOffset: 4
    }]
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6 h-full"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <PieChart className="w-5 h-5" />
            Commission Distribution
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Breakdown by {viewType === 'planType' ? 'plan type' : 'carrier'}
          </p>
        </div>
        
        <button
          onClick={() => setViewType(viewType === 'planType' ? 'carrier' : 'planType')}
          className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors text-sm"
        >
          <Filter className="w-3 h-3" />
          Switch View
        </button>
      </div>

      {/* Chart */}
      <div className="relative h-48 mb-4">
        <Doughnut data={doughnutData} options={options} />
        {/* Center Total */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">
              ${(total / 1000).toFixed(1)}K
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Total</p>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="space-y-2">
        {chartData.labels.map((label, index) => {
          const percentage = ((chartData.values[index] / total) * 100).toFixed(1);
          const amount = chartData.values[index];
          
          return (
            <motion.div
              key={label}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.05 * index }}
              className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div 
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: chartData.colors?.[index] || defaultPlanTypeData.colors[index] }}
                />
                <span className="text-sm text-slate-700 dark:text-slate-300">{label}</span>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                  ${(amount / 1000).toFixed(1)}K
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{percentage}%</p>
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
