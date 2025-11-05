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

export default function CarrierPerformance({ data }: CarrierPerformanceProps) {
  // Memoize data with stable dependencies - MUST be called before any returns
  const chartData = useMemo(() => {
    if (!data || !data.carriers || data.carriers.length === 0) {
      return {
        carriers: [],
        amounts: [],
        percentages: [],
        growth: []
      };
    }
    return {
      carriers: data.carriers,
      amounts: data.amounts,
      percentages: data.percentages,
      growth: data.growth
    };
  }, [data]);

  // Memoize formatted values with stable dependencies - MUST be called before any returns
  const formattedValues = useMemo(() => {
    if (chartData.carriers.length === 0) {
      return [];
    }
    return chartData.carriers.map((carrier, idx) => {
      const amount = chartData.amounts[idx] || 0;
      const percentage = chartData.percentages[idx] || 0;
      const growth = chartData.growth[idx] || 0;
      
      // FIXED: Ensure all values are properly normalized
      return {
        carrier,
        amount: (amount / 1000).toFixed(1),
        percentage: parseFloat(percentage.toFixed(1)),
        growth: parseFloat(growth.toFixed(1)),
        growthSign: growth > 0 ? '+' : '',
        hasGrowth: growth !== 0  // Indicate if we have actual growth data
      };
    });
  }, [chartData.carriers, chartData.amounts, chartData.percentages, chartData.growth]);

  // Check if we have actual data - NOW after all hooks have been called
  if (!data || !data.carriers || data.carriers.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Top Performing Carriers</h3>
            <p className="text-sm text-slate-500">Commission by carrier</p>
          </div>
        </div>
        <div className="h-48 flex items-center justify-center text-slate-500">
          <div className="text-center">
            <Building2 className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No carrier data available</p>
            <p className="text-sm">Upload statements to see carrier performance</p>
          </div>
        </div>
      </div>
    );
  }

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
              {item.hasGrowth ? (
                <span className={`text-sm font-medium ${
                  item.growth > 0 
                    ? 'text-emerald-600' 
                    : 'text-red-600'
                }`}>
                  {item.growthSign}{item.growth}%
                </span>
              ) : (
                <span className="text-sm font-medium text-slate-400">
                  N/A
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
