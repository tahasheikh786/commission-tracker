'use client';

import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Chart } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { 
  TrendingUp, 
  Calendar, 
  Download,
  Maximize2,
  Info,
  BarChart3
} from 'lucide-react';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface CommissionChartProps {
  data?: {
    labels: string[];
    commission: number[];
    growth: number[];
    projections?: number[];
  };
}

export default function CommissionChart({ data }: CommissionChartProps) {
  const [chartType, setChartType] = useState<'bar' | 'line' | 'combo'>('combo');
  const [timeRange, setTimeRange] = useState('12M');

  // Use real data only - no fallback to demo data
  const chartData = useMemo(() => data, [data]);

  // Check if we have meaningful growth data (at least one non-zero value)
  const hasGrowthData = useMemo(() => {
    if (!chartData || !chartData.growth) return false;
    return chartData.growth.some(val => val !== 0);
  }, [chartData]);

  // Calculate dynamic Y-axis range for growth rate based on actual data
  const growthYAxisRange = useMemo(() => {
    if (!chartData || !hasGrowthData || !chartData.growth) return { min: -10, max: 10 };
    
    const nonZeroGrowth = chartData.growth.filter(val => val !== 0);
    if (nonZeroGrowth.length === 0) return { min: -10, max: 10 };
    
    const maxGrowth = Math.max(...nonZeroGrowth);
    const minGrowth = Math.min(...nonZeroGrowth);
    
    // Add 20% padding to the range
    const padding = Math.max(Math.abs(maxGrowth), Math.abs(minGrowth)) * 0.2;
    return {
      min: Math.floor(minGrowth - padding),
      max: Math.ceil(maxGrowth + padding)
    };
  }, [hasGrowthData, chartData]);

  // ADD DATA VALIDATION
  if (!chartData || !chartData.commission || chartData.commission.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
        <h3 className="text-lg font-semibold mb-2 text-slate-900 dark:text-white">Commission Trends</h3>
        <div className="h-64 flex items-center justify-center text-slate-500">
          <div className="text-center">
            <BarChart3 className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No commission data available</p>
            <p className="text-sm">Upload statements to see trends</p>
          </div>
        </div>
      </div>
    );
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      legend: {
        display: true,
        position: 'top' as const,
        labels: {
          usePointStyle: true,
          padding: 15,
          font: {
            size: 12
          }
        }
      },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        titleColor: 'white',
        bodyColor: 'white',
        padding: 12,
        cornerRadius: 8,
        displayColors: true,
        callbacks: {
          label: function(context: any) {
            let label = context.dataset.label || '';
            if (label) {
              label += ': ';
            }
            if (context.parsed.y !== null) {
              if (context.datasetIndex === 0) {
                label += new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency: 'USD',
                  minimumFractionDigits: 0
                }).format(context.parsed.y);
              } else {
                label += context.parsed.y + '%';
              }
            }
            return label;
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
          font: {
            size: 11
          }
        }
      },
      y: {
        type: 'linear' as const,
        display: true,
        position: 'left' as const,
        grid: {
          color: 'rgba(0, 0, 0, 0.05)'
        },
        ticks: {
          font: {
            size: 11
          },
          callback: function(value: any) {
            return '$' + value.toLocaleString();
          }
        }
      },
      y1: {
        type: 'linear' as const,
        display: hasGrowthData,
        position: 'right' as const,
        min: growthYAxisRange.min,
        max: growthYAxisRange.max,
        grid: {
          drawOnChartArea: false
        },
        ticks: {
          font: {
            size: 11
          },
          callback: function(value: any) {
            return value + '%';
          }
        }
      }
    }
  };

  const comboData = {
    labels: chartData.labels,
    datasets: [
      {
        type: 'bar' as const,
        label: 'Commission Amount',
        data: chartData.commission,
        backgroundColor: 'rgba(59, 130, 246, 0.8)',
        borderColor: 'rgba(59, 130, 246, 1)',
        borderWidth: 0,
        borderRadius: 6,
        yAxisID: 'y'
      },
      // Only include growth rate dataset if we have meaningful data
      ...(hasGrowthData ? [{
        type: 'line' as const,
        label: 'Growth Rate',
        data: chartData.growth,
        borderColor: 'rgb(16, 185, 129)',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        yAxisID: 'y1',
        pointBackgroundColor: 'rgb(16, 185, 129)',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6
      }] : [])
    ]
  };

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            Commission Trends
            <button className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded">
              <Info className="w-4 h-4 text-slate-400" />
            </button>
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Monthly commission amounts and growth rate
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Time Range Selector */}
          <div className="flex bg-slate-100 dark:bg-slate-700 rounded-lg p-1">
            {['3M', '6M', '12M', 'YTD'].map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-3 py-1 text-xs font-medium rounded transition-all duration-200 ${
                  timeRange === range
                    ? 'bg-white dark:bg-slate-600 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                {range}
              </button>
            ))}
          </div>
          
          {/* Chart Type Toggle */}
          <button className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
            <Maximize2 className="w-4 h-4" />
          </button>
          
          {/* Download */}
          <button className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Chart */}
      <div className="h-80">
        <Chart type='bar' data={comboData} options={options} />
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
        <div>
          <div className="text-sm text-slate-500 dark:text-slate-400">Total YTD</div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">
            ${(chartData.commission.reduce((a, b) => a + b, 0) / 1000).toFixed(1)}K
          </div>
        </div>
        <div>
          <div className="text-sm text-slate-500 dark:text-slate-400">Average Monthly</div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">
            ${(chartData.commission.reduce((a, b) => a + b, 0) / chartData.commission.length / 1000).toFixed(1)}K
          </div>
        </div>
        <div>
          <div className="text-sm text-slate-500 dark:text-slate-400">Best Month</div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">
            {chartData.labels[chartData.commission.indexOf(Math.max(...chartData.commission))]}
          </div>
        </div>
      </div>
    </div>
  );
}
