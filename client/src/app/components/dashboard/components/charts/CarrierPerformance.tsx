'use client';

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { Building2, TrendingUp, Award, ExternalLink } from 'lucide-react';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

interface CarrierPerformanceProps {
  data?: {
    carriers: string[];
    amounts: number[];
    percentages: number[];
    growth: number[];
  };
}

const defaultData = {
  carriers: ['Allied Benefit Systems', 'Adrem Administrators, LLC'],
  amounts: [64116, 12850],
  percentages: [83.3, 16.7],
  growth: [20.9, 15.9]
};

export default function CarrierPerformance({ data }: CarrierPerformanceProps) {
  // Memoize data with stable dependencies
  const chartData = useMemo(() => {
    if (!data) return defaultData;
    return {
      carriers: data.carriers || defaultData.carriers,
      amounts: data.amounts || defaultData.amounts,
      percentages: data.percentages || defaultData.percentages,
      growth: data.growth || defaultData.growth
    };
  }, [data]);

  // Memoize formatted values with stable dependencies
  const formattedValues = useMemo(() => {
    return chartData.carriers.map((carrier, idx) => {
      const amount = chartData.amounts[idx] || 0;
      const percentage = chartData.percentages[idx] || 0;
      const growth = chartData.growth[idx] || 0;
      
      return {
        carrier,
        amount: (amount / 1000).toFixed(1),
        percentage: percentage.toFixed(1),
        growth: growth.toFixed(1),
        growthSign: growth > 0 ? '+' : ''
      };
    });
  }, [chartData.carriers, chartData.amounts, chartData.percentages, chartData.growth]);

  const options = {
    indexAxis: 'y' as const,
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
            const amount = new Intl.NumberFormat('en-US', {
              style: 'currency',
              currency: 'USD',
              minimumFractionDigits: 0
            }).format(context.parsed.x);
            const percentage = chartData.percentages[context.dataIndex];
            const growth = chartData.growth[context.dataIndex];
            return [
              `Amount: ${amount}`,
              `Share: ${percentage}%`,
              `Growth: ${growth > 0 ? '+' : ''}${growth}%`
            ];
          }
        }
      }
    },
    scales: {
      x: {
        grid: {
          display: false
        },
        ticks: {
          callback: function(value: any) {
            return '$' + (value / 1000) + 'K';
          }
        }
      },
      y: {
        grid: {
          display: false
        },
        ticks: {
          font: {
            size: 12
          }
        }
      }
    }
  };

  const barData = {
    labels: chartData.carriers,
    datasets: [
      {
        data: chartData.amounts,
        backgroundColor: [
          'rgba(59, 130, 246, 0.8)',
          'rgba(147, 51, 234, 0.8)'
        ],
        borderColor: [
          'rgba(59, 130, 246, 1)',
          'rgba(147, 51, 234, 1)'
        ],
        borderWidth: 0,
        borderRadius: 6,
        barThickness: 40
      }
    ]
  };

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Top Performing Carriers</h3>
          <p className="text-sm text-slate-500">Commission by carrier</p>
        </div>
        <button className="text-sm text-blue-600 hover:text-blue-700">
          View All →
        </button>
      </div>

      {/* Chart */}
      <div className="h-48 mb-4">
        <Bar data={barData} options={options} />
      </div>

      {/* Use memoized formatted values */}
      <div className="space-y-4">
        {formattedValues.map((item, index) => (
          <div key={item.carrier} className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                {index === 0 && <Award className="w-5 h-5 text-yellow-500" />}
                {index === 1 && <Building2 className="w-5 h-5 text-blue-500" />}
                <span className="font-medium">{item.carrier}</span>
              </div>
              <span className="text-sm text-slate-500">
                {item.percentage}% of total
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold">
                ${item.amount}K
              </span>
              <span className={`text-sm font-medium ${
                parseFloat(item.growth) > 0 
                  ? 'text-emerald-600' 
                  : 'text-red-600'
              }`}>
                {item.growthSign}{item.growth}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
