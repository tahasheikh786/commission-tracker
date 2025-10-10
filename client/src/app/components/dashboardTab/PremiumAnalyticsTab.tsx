'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  TrendingUp, DollarSign, Building2, Calendar, 
  ArrowUpRight, ArrowDownRight, Filter, Download,
  Sparkles, BarChart3, PieChart, LineChart, Target,
  Award, CheckCircle, AlertTriangle, ChevronRight,
  TrendingDown, FileText, AlertCircle,
  ExternalLink, ChevronDown, Settings
} from 'lucide-react';
import { 
  useEarnedCommissionStats,
  useDashboardStats,
  useAvailableYears,
  useAllCommissionData,
  useCarriersWithCommission
} from '../../hooks/useDashboard';
import { 
  identifyTopPerformingCarriers,
  extractMonthlyData,
  calculateCommissionGrowth,
  formatCurrency as utilFormatCurrency,
  formatPercentage,
  generateYearComparison
} from '../../utils/analyticsUtils';
import { generateInsights, Insight } from '../../utils/insightsEngine';

// Chart.js imports for premium interactive charts
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface HeroMetricCardProps {
  title: string;
  value: string | number;
  change: number;
  period: string;
  icon: React.ElementType;
  gradient: string;
  primary?: boolean;
  loading?: boolean;
}

function HeroMetricCard({ 
  title, 
  value, 
  change, 
  period, 
  icon: Icon, 
  gradient, 
  primary = false,
  loading = false
}: HeroMetricCardProps) {
  return (
    <div 
      className={`
        group relative overflow-hidden rounded-2xl border transition-all duration-300 hover:scale-[1.02] hover:shadow-xl
        ${primary 
          ? 'bg-white dark:bg-slate-800 border-emerald-200 dark:border-emerald-800 shadow-lg shadow-emerald-500/20' 
          : 'bg-white/80 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 backdrop-blur-sm hover:bg-white dark:hover:bg-slate-800'
        }
      `}
      role="article"
      aria-label={`${title}: ${loading ? 'Loading' : value}`}
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-0 group-hover:opacity-5 transition-opacity duration-300`} aria-hidden="true"></div>
      
      <div className="relative p-4 md:p-6">
        <div className="flex items-start justify-between mb-3 md:mb-4">
          <div 
            className={`w-10 h-10 md:w-12 md:h-12 rounded-xl bg-gradient-to-r ${gradient} flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300`}
            aria-hidden="true"
          >
            <Icon className="w-5 h-5 md:w-6 md:h-6 text-white" />
          </div>
          <div className="flex items-center gap-1 text-sm" role="status">
            {change > 0 ? (
              <ArrowUpRight className="w-4 h-4 text-emerald-500" aria-hidden="true" />
            ) : change < 0 ? (
              <ArrowDownRight className="w-4 h-4 text-red-500" aria-hidden="true" />
            ) : null}
            <span className={change > 0 ? "text-emerald-600 font-medium" : change < 0 ? "text-red-600 font-medium" : "text-slate-600 font-medium"}>
              {change !== 0 && `${Math.abs(change).toFixed(1)}%`}
            </span>
          </div>
        </div>
        
        <div>
          {loading ? (
            <div className="w-24 md:w-32 h-8 md:h-9 bg-slate-200 dark:bg-slate-600 rounded animate-pulse mb-1"></div>
          ) : (
            <p className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white mb-1">{value}</p>
          )}
          <p className="text-xs md:text-sm text-slate-600 dark:text-slate-400">{title}</p>
          <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">{period}</p>
        </div>
      </div>
    </div>
  );
}

function SmartInsightsPanel({ 
  insights,
  onNavigate
}: { 
  insights: Insight[];
  onNavigate: (tab: string) => void;
}) {
  if (insights.length === 0) {
    return (
      <div className="mb-8 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
        <p className="text-slate-600 dark:text-slate-400">Upload statements to generate intelligent insights...</p>
      </div>
    );
  }

  return (
    <div className="mb-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-white" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">AI-Powered Insights</h2>
        <span className="text-xs bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 px-2 py-1 rounded-full font-medium">Live Analysis</span>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {insights.slice(0, 6).map((insight, index) => (
          <InsightCard key={index} insight={insight} onNavigate={onNavigate} />
        ))}
      </div>
    </div>
  );
}

function InsightCard({ insight, onNavigate }: { insight: Insight; onNavigate: (tab: string) => void }) {
  const colorClasses = {
    achievement: 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20',
    opportunity: 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20',
    alert: 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20',
    warning: 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20'
  };

  const iconColors = {
    achievement: 'text-blue-600 dark:text-blue-400',
    opportunity: 'text-emerald-600 dark:text-emerald-400',
    alert: 'text-amber-600 dark:text-amber-400',
    warning: 'text-red-600 dark:text-red-400'
  };

  const icons = {
    achievement: Award,
    opportunity: Target,
    alert: AlertTriangle,
    warning: AlertCircle
  };

  const Icon = icons[insight.type];

  return (
    <div 
      className={`p-4 rounded-xl border ${colorClasses[insight.type]} group hover:shadow-md transition-all duration-200 cursor-pointer`}
      onClick={() => insight.clickAction && onNavigate(insight.clickAction)}
    >
      <div className="flex items-start gap-3">
        <div className={`mt-1 ${iconColors[insight.type]}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-slate-900 dark:text-white text-sm">{insight.title}</h3>
            {insight.metric && (
              <span className={`text-xs font-bold ${iconColors[insight.type]}`}>
                {insight.metric}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 mb-3 leading-relaxed">{insight.message}</p>
          <button className={`text-xs font-medium ${iconColors[insight.type]} hover:underline`}>
            {insight.action} →
          </button>
        </div>
      </div>
    </div>
  );
}

function MonthlyTrendsChart({ data, loading }: { data: any[]; loading: boolean }) {
  const monthlyData = useMemo(() => extractMonthlyData(data), [data]);
  
  const chartData = useMemo(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const commissionByMonth = monthlyData.map(d => d.commission);
    
    return {
      labels: months,
      datasets: [
        {
          label: 'Commission Earned',
          data: commissionByMonth,
          borderColor: 'rgb(16, 185, 129)',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          borderWidth: 3,
          fill: true,
          tension: 0.4,
          pointBackgroundColor: 'rgb(16, 185, 129)',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          pointRadius: 6,
          pointHoverRadius: 8,
          pointHoverBackgroundColor: 'rgb(16, 185, 129)',
          pointHoverBorderColor: '#fff',
          pointHoverBorderWidth: 3,
        }
      ]
    };
  }, [monthlyData]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      legend: { 
        display: false 
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleColor: 'white',
        bodyColor: 'white',
        borderColor: 'rgba(16, 185, 129, 1)',
        borderWidth: 1,
        padding: 12,
        displayColors: false,
        callbacks: {
          label: (context: any) => `Commission: ${utilFormatCurrency(context.raw, true)}`
        }
      }
    },
    scales: {
      x: {
        grid: { 
          display: false,
          drawBorder: false
        },
        ticks: { 
          color: '#6B7280',
          font: {
            size: 12,
            weight: 500
          }
        }
      },
      y: {
        grid: { 
          color: 'rgba(241, 245, 249, 0.5)',
          drawBorder: false
        },
        ticks: { 
          color: '#6B7280',
          callback: (value: any) => utilFormatCurrency(value, true),
          font: {
            size: 11
          }
        }
      }
    }
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
        <div className="h-80 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-slate-200 dark:border-slate-600 border-t-emerald-500 rounded-full animate-spin"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 hover:shadow-lg transition-all duration-300">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shadow-lg">
            <LineChart className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Commission Trends</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">Monthly performance overview</p>
          </div>
        </div>
        <button className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center space-x-1 transition-colors">
          <span>View Details</span>
          <ExternalLink className="w-4 h-4" />
        </button>
      </div>

      <div className="h-80">
        <Line data={chartData} options={chartOptions} />
      </div>
    </div>
  );
}

function TopCarriersChart({ carriers, loading, onNavigate }: { carriers: any[]; loading: boolean; onNavigate: (tab: string) => void }) {
  const topCarriers = useMemo(() => carriers.slice(0, 8), [carriers]);
  
  const chartData = useMemo(() => {
    return {
      labels: topCarriers.map(c => c.name || 'Unknown'),
      datasets: [
        {
          label: 'Commission ($)',
          data: topCarriers.map(c => c.totalCommission || 0),
          backgroundColor: [
            'rgba(59, 130, 246, 0.8)',
            'rgba(16, 185, 129, 0.8)',
            'rgba(139, 92, 246, 0.8)',
            'rgba(245, 158, 11, 0.8)',
            'rgba(239, 68, 68, 0.8)',
            'rgba(236, 72, 153, 0.8)',
            'rgba(34, 197, 94, 0.8)',
            'rgba(168, 85, 247, 0.8)',
          ],
          borderColor: [
            'rgba(59, 130, 246, 1)',
            'rgba(16, 185, 129, 1)',
            'rgba(139, 92, 246, 1)',
            'rgba(245, 158, 11, 1)',
            'rgba(239, 68, 68, 1)',
            'rgba(236, 72, 153, 1)',
            'rgba(34, 197, 94, 1)',
            'rgba(168, 85, 247, 1)',
          ],
          borderWidth: 2,
          borderRadius: 8,
          borderSkipped: false,
        }
      ]
    };
  }, [topCarriers]);

  const chartOptions = {
    indexAxis: 'y' as const,
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleColor: 'white',
        bodyColor: 'white',
        padding: 12,
        displayColors: false,
        callbacks: {
          label: (context: any) => `Commission: ${utilFormatCurrency(context.raw, true)}`
        }
      }
    },
    scales: {
      x: {
        grid: { 
          color: 'rgba(241, 245, 249, 0.5)',
          drawBorder: false
        },
        ticks: { 
          color: '#6B7280',
          callback: (value: any) => utilFormatCurrency(value, true),
          font: {
            size: 11
          }
        }
      },
      y: {
        grid: { 
          display: false,
          drawBorder: false
        },
        ticks: { 
          color: '#6B7280',
          font: {
            size: 12,
            weight: 500
          }
        }
      }
    }
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
        <div className="h-80 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-slate-200 dark:border-slate-600 border-t-blue-500 rounded-full animate-spin"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 hover:shadow-lg transition-all duration-300">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
            <Award className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Top Performing Carriers</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">By total commission volume</p>
          </div>
        </div>
        <button 
          onClick={() => onNavigate('carriers')}
          className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center space-x-1 transition-colors"
        >
          <span>View All</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="h-80">
        <Bar data={chartData} options={chartOptions} />
      </div>
    </div>
  );
}

function CarrierPerformanceMatrix({ carriers, onNavigate }: { carriers: any[]; onNavigate: (tab: string) => void }) {
  const topCarriers = useMemo(() => carriers.slice(0, 8), [carriers]);
  
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 hover:shadow-lg transition-all duration-300">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-pink-600 rounded-xl flex items-center justify-center shadow-lg">
            <BarChart3 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Carrier Performance Overview</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">Top carriers by commission earned</p>
          </div>
        </div>
        <button 
          onClick={() => onNavigate('carriers')}
          className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center space-x-1 transition-colors"
        >
          <span>View All</span>
          <ExternalLink className="w-4 h-4" />
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700">
              <th className="text-left py-3 px-4 font-semibold text-slate-600 dark:text-slate-400 text-sm">Rank</th>
              <th className="text-left py-3 px-4 font-semibold text-slate-600 dark:text-slate-400 text-sm">Carrier</th>
              <th className="text-right py-3 px-4 font-semibold text-slate-600 dark:text-slate-400 text-sm">Total Commission</th>
              <th className="text-right py-3 px-4 font-semibold text-slate-600 dark:text-slate-400 text-sm">Statements</th>
              <th className="text-right py-3 px-4 font-semibold text-slate-600 dark:text-slate-400 text-sm">Avg. per Statement</th>
            </tr>
          </thead>
          <tbody>
            {topCarriers.map((carrier, index) => {
              const avgPerStatement = carrier.statement_count > 0 
                ? (carrier.totalCommission / carrier.statement_count) 
                : 0;
              
              return (
                <tr 
                  key={carrier.id || index} 
                  className="border-b border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer group"
                  onClick={() => onNavigate('carriers')}
                >
                  <td className="py-4 px-4">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-bold text-sm shadow-md">
                      {index + 1}
                    </div>
                  </td>
                  <td className="py-4 px-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-md">
                        {(carrier.name || 'U').charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white text-sm">{carrier.name || 'Unknown Carrier'}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Active</p>
                      </div>
                    </div>
                  </td>
                  <td className="text-right py-4 px-4">
                    <p className="font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                      {utilFormatCurrency(carrier.totalCommission || 0, true)}
                    </p>
                  </td>
                  <td className="text-right py-4 px-4">
                    <p className="text-slate-900 dark:text-white font-medium text-sm">{carrier.statement_count || 0}</p>
                  </td>
                  <td className="text-right py-4 px-4">
                    <p className="text-slate-600 dark:text-slate-400 font-medium text-sm">
                      {utilFormatCurrency(avgPerStatement, true)}
                    </p>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PlanDistributionChart({ data }: { data: any[] }) {
  const planData = useMemo(() => {
    const planCounts = data.reduce((acc, item) => {
      const planType = item.plan_type || 'Other';
      acc[planType] = (acc[planType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      labels: Object.keys(planCounts),
      datasets: [{
        data: Object.values(planCounts),
        backgroundColor: [
          'rgba(99, 102, 241, 0.8)',
          'rgba(16, 185, 129, 0.8)',
          'rgba(245, 158, 11, 0.8)',
          'rgba(239, 68, 68, 0.8)',
          'rgba(168, 85, 247, 0.8)',
        ],
        borderColor: [
          'rgba(99, 102, 241, 1)',
          'rgba(16, 185, 129, 1)',
          'rgba(245, 158, 11, 1)',
          'rgba(239, 68, 68, 1)',
          'rgba(168, 85, 247, 1)',
        ],
        borderWidth: 2,
      }]
    };
  }, [data]);

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 hover:shadow-lg transition-all duration-300">
      <div className="flex items-center space-x-3 mb-6">
        <div className="w-10 h-10 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
          <PieChart className="w-5 h-5 text-white" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Plan Distribution</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400">By plan type</p>
        </div>
      </div>

      <div className="h-64 flex items-center justify-center">
        <Doughnut
          data={planData}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            cutout: '65%',
            plugins: {
              legend: {
                position: 'bottom' as const,
                labels: { 
                  padding: 15,
                  usePointStyle: true,
                  font: {
                    size: 12,
                    weight: 500
                  }
                }
              },
              tooltip: {
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                titleColor: 'white',
                bodyColor: 'white',
                padding: 12,
              }
            }
          }}
        />
      </div>
    </div>
  );
}

function YearComparisonCard({ 
  currentYear, 
  currentData, 
  previousData 
}: { 
  currentYear: number;
  currentData: any[];
  previousData: any[];
}) {
  const comparison = useMemo(() => 
    generateYearComparison(currentYear, currentData, previousData),
    [currentYear, currentData, previousData]
  );

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 hover:shadow-lg transition-all duration-300">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
            <Calendar className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Year-over-Year Comparison</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {currentYear} vs {currentYear - 1}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg">
            <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium mb-1">{currentYear}</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white">
              {utilFormatCurrency(comparison.current, true)}
            </p>
          </div>
          <div className="p-4 bg-slate-100 dark:bg-slate-700 rounded-lg">
            <p className="text-xs text-slate-600 dark:text-slate-400 font-medium mb-1">{currentYear - 1}</p>
            <p className="text-2xl font-bold text-slate-700 dark:text-slate-300">
              {utilFormatCurrency(comparison.previous, true)}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between p-4 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 rounded-lg">
          <div>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Growth</p>
            <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
              {utilFormatCurrency(comparison.growth, true)}
            </p>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-1 mb-1">
              {comparison.growthRate > 0 ? (
                <TrendingUp className="w-5 h-5 text-emerald-500" />
              ) : (
                <TrendingDown className="w-5 h-5 text-red-500" />
              )}
              <p className={`text-2xl font-bold ${comparison.growthRate > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {formatPercentage(Math.abs(comparison.growthRate))}
              </p>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-500">
              {comparison.growthRate > 0 ? 'increase' : 'decrease'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function KeyInsightsCard({ onNavigate }: { onNavigate: (tab: string) => void }) {
  return (
    <div className="bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-2xl border border-blue-200 dark:border-blue-800 p-6">
      <div className="flex items-center space-x-3 mb-4">
        <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
          <Target className="w-5 h-5 text-white" />
        </div>
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Key Insights</h3>
      </div>

      <div className="space-y-4">
        <div className="flex items-start space-x-3">
          <div className="w-2 h-2 bg-emerald-500 rounded-full mt-2 flex-shrink-0"></div>
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Top Performance</p>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">Your top carrier is performing exceptionally well this year</p>
          </div>
        </div>
        <div className="flex items-start space-x-3">
          <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Growth Trend</p>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">Commission growth shows positive momentum</p>
          </div>
        </div>
        <div className="flex items-start space-x-3">
          <div className="w-2 h-2 bg-purple-500 rounded-full mt-2 flex-shrink-0"></div>
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Processing Quality</p>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">High success rate with quick turnaround times</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickActionsCard({ onNavigate }: { onNavigate: (tab: string) => void }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
      <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Quick Actions</h3>

      <div className="space-y-3">
        <button 
          onClick={() => onNavigate('dashboard')}
          className="w-full flex items-center justify-between p-3 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/30 rounded-lg transition-colors text-left group"
        >
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
              <BarChart3 className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-semibold text-slate-900 dark:text-white">View Detailed Report</span>
          </div>
          <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300" />
        </button>

        <button 
          onClick={() => onNavigate('carriers')}
          className="w-full flex items-center justify-between p-3 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:hover:bg-emerald-900/30 rounded-lg transition-colors text-left group"
        >
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center">
              <Building2 className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-semibold text-slate-900 dark:text-white">Manage Carriers</span>
          </div>
          <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300" />
        </button>

        <button 
          className="w-full flex items-center justify-between p-3 bg-purple-50 hover:bg-purple-100 dark:bg-purple-900/20 dark:hover:bg-purple-900/30 rounded-lg transition-colors text-left group"
        >
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-pink-600 rounded-lg flex items-center justify-center">
              <Settings className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-semibold text-slate-900 dark:text-white">Analytics Settings</span>
          </div>
          <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300" />
        </button>
      </div>
    </div>
  );
}

export default function PremiumAnalyticsTab({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);

  // Fetch current year data
  const { stats: currentStats, loading: currentStatsLoading } = useEarnedCommissionStats(selectedYear);
  const { stats: dashboardStats, loading: dashboardLoading } = useDashboardStats(true);
  const { data: currentYearData, loading: currentDataLoading } = useAllCommissionData(selectedYear);
  const { carriers, loading: carriersLoading } = useCarriersWithCommission();
  const { years: availableYears, loading: yearsLoading } = useAvailableYears();
  
  // Fetch previous year data for comparison
  const { data: previousYearData } = useAllCommissionData(selectedYear - 1);

  // Calculate real metrics from data
  const realMetrics = useMemo(() => {
    const totalCommission = currentStats?.total_commission || 0;
    const previousYearTotal = previousYearData?.reduce((sum: number, d: any) => sum + (d.commission_earned || 0), 0) || 0;
    const commissionGrowth = calculateCommissionGrowth(totalCommission, previousYearTotal);
    
    const totalCarriers = dashboardStats?.total_carriers || 0;
    const totalStatements = dashboardStats?.total_statements || 0;
    const approvedStatements = dashboardStats?.approved_statements || 0;
    const rejectedStatements = dashboardStats?.rejected_statements || 0;
    const totalProcessed = approvedStatements + rejectedStatements;
    const successRate = totalProcessed > 0 ? (approvedStatements / totalProcessed) * 100 : 0;

    return {
      totalCommission,
      commissionGrowth,
      totalCarriers,
      totalStatements,
      successRate,
      pending: dashboardStats?.pending_reviews || 0,
      approved: approvedStatements,
      rejected: rejectedStatements
    };
  }, [currentStats, dashboardStats, previousYearData]);

  // Generate intelligent insights
  const intelligentInsights = useMemo(() => {
    return generateInsights({
      commissionData: currentYearData || [],
      stats: { ...currentStats, ...dashboardStats },
      carriers: carriers || [],
      previousYearData: previousYearData || [],
      pendingCount: realMetrics.pending,
      approvedCount: realMetrics.approved,
      rejectedCount: realMetrics.rejected
    });
  }, [currentYearData, currentStats, dashboardStats, carriers, previousYearData, realMetrics]);

  // Process carriers for display
  const topPerformers = useMemo(() => {
    if (!currentYearData) return [];
    return identifyTopPerformingCarriers(currentYearData, 8);
  }, [currentYearData]);

  const loading = currentStatsLoading || dashboardLoading || currentDataLoading;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      
      {/* Premium Sticky Header */}
      <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center space-x-3 md:space-x-4">
              <div className="w-10 h-10 bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                <BarChart3 className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white">Commission Analytics</h1>
                <p className="text-xs md:text-sm text-slate-600 dark:text-slate-400">Real-time insights and intelligent forecasting</p>
              </div>
              <div className="flex items-center px-2 md:px-3 py-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 rounded-full text-xs font-medium">
                <Sparkles className="w-3 h-3 mr-1" />
                AI-Powered
              </div>
            </div>
            
            {/* Premium Filter Controls */}
            <div className="flex items-center space-x-2 md:space-x-3">
              {!yearsLoading && availableYears && availableYears.length > 1 && (
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="px-3 md:px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-sm font-medium text-slate-700 dark:text-white hover:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                >
                  {availableYears.map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              )}
              
              <button className="hidden md:flex items-center space-x-2 px-3 md:px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-sm font-medium text-slate-700 dark:text-white hover:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors">
                <Filter className="w-4 h-4" />
                <span>Filters</span>
                <ChevronDown className="w-4 h-4" />
              </button>
              
              <button className="flex items-center space-x-2 px-3 md:px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors shadow-lg">
                <Download className="w-4 h-4" />
                <span className="hidden md:inline">Export</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8">
        
        {/* Hero Metrics - Using REAL DATA */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-6 md:mb-8">
          <HeroMetricCard
            title="Total Commission"
            value={utilFormatCurrency(realMetrics.totalCommission, true)}
            change={realMetrics.commissionGrowth}
            period="vs last year"
            icon={DollarSign}
            gradient="from-emerald-500 to-teal-600"
            primary={true}
            loading={loading}
          />
          <HeroMetricCard
            title="Active Carriers"
            value={realMetrics.totalCarriers}
            change={realMetrics.totalCarriers > 20 ? 8.3 : 0}
            period="this year"
            icon={Building2}
            gradient="from-blue-500 to-indigo-600"
            loading={loading}
          />
          <HeroMetricCard
            title="Total Statements"
            value={realMetrics.totalStatements}
            change={realMetrics.totalStatements > 100 ? 12.8 : 0}
            period="processed"
            icon={FileText}
            gradient="from-purple-500 to-violet-600"
            loading={loading}
          />
          <HeroMetricCard
            title="Success Rate"
            value={`${realMetrics.successRate.toFixed(1)}%`}
            change={realMetrics.successRate > 95 ? 2.1 : realMetrics.successRate < 85 ? -5.2 : 0}
            period="processing quality"
            icon={CheckCircle}
            gradient="from-green-500 to-emerald-600"
            loading={loading}
          />
        </div>

        {/* AI Insights Panel */}
        <section aria-label="AI-powered insights">
          <SmartInsightsPanel 
            insights={intelligentInsights}
            onNavigate={onNavigate}
          />
        </section>

        {/* Year-over-Year Comparison */}
        {previousYearData && previousYearData.length > 0 && (
          <div className="mb-6 md:mb-8">
            <YearComparisonCard
              currentYear={selectedYear}
              currentData={currentYearData || []}
              previousData={previousYearData}
            />
          </div>
        )}

        {/* Interactive Charts Grid - 2 Column */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8 mb-6 md:mb-8">
          {/* Commission Trends - Takes 2 columns */}
          <div className="lg:col-span-2">
            <MonthlyTrendsChart data={currentYearData || []} loading={currentDataLoading} />
          </div>
          
          {/* Top Carriers - Takes 1 column */}
          <div className="lg:col-span-1">
            <TopCarriersChart carriers={topPerformers} loading={carriersLoading} onNavigate={onNavigate} />
          </div>
        </div>

        {/* Advanced Analytics Section - 3 Column */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8 mb-6 md:mb-8">
          {/* Plan Distribution */}
          {currentYearData && currentYearData.length > 0 && (
            <PlanDistributionChart data={currentYearData} />
          )}
          
          {/* Key Insights */}
          <KeyInsightsCard onNavigate={onNavigate} />
          
          {/* Quick Actions */}
          <QuickActionsCard onNavigate={onNavigate} />
        </div>

        {/* Carrier Performance Matrix - Full Width */}
        {topPerformers && topPerformers.length > 0 && (
          <div className="mb-6 md:mb-8">
            <CarrierPerformanceMatrix carriers={topPerformers} onNavigate={onNavigate} />
          </div>
        )}
      </div>
    </div>
  );
}
