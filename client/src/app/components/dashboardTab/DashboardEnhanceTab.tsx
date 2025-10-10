'use client'
import React, { useState, useCallback, useMemo } from "react";
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { TrendingUp, Building2, DollarSign, Upload, FileText, Shield, Sparkles, Users, Clock, CheckCircle, XCircle } from "lucide-react";
import CarrierUploadZone from "../CarrierUploadZone";
import { useDashboardStats, useCarriers, useEarnedCommissionStats } from "../../hooks/useDashboard";
import StatCard from "./StatCard";
import CarriersModal from "./CarriersModal";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, ComposedChart } from 'recharts';

interface DashboardEnhanceTabProps {
  showAnalytics?: boolean;
}

// Static data outside component to prevent re-creation
const STATIC_LINE_CHART_DATA = [
  { name: 'Jan', total: 100, approved: 60, pending: 30, cancelled: 10 },
  { name: 'Feb', total: 85, approved: 50, pending: 25, cancelled: 10 },
  { name: 'Mar', total: 120, approved: 80, pending: 30, cancelled: 10 },
  { name: 'Apr', total: 95, approved: 70, pending: 20, cancelled: 5 },
  { name: 'May', total: 110, approved: 75, pending: 25, cancelled: 10 },
  { name: 'Jun', total: 90, approved: 60, pending: 20, cancelled: 10 },
  { name: 'Jul', total: 105, approved: 70, pending: 25, cancelled: 10 },
  { name: 'Aug', total: 130, approved: 90, pending: 30, cancelled: 10 },
  { name: 'Sep', total: 115, approved: 80, pending: 25, cancelled: 10 },
  { name: 'Oct', total: 100, approved: 70, pending: 20, cancelled: 10 },
  { name: 'Nov', total: 95, approved: 65, pending: 20, cancelled: 10 },
  { name: 'Dec', total: 140, approved: 100, pending: 30, cancelled: 10 },
];

const STATIC_PIE_CHART_DATA = [
  { name: 'Approved', value: 400, color: '#3B82F6' },
  { name: 'Pending', value: 300, color: '#8B5CF6' },
  { name: 'Rejected', value: 200, color: '#EF4444' },
];

export default function DashboardEnhanceTab({ showAnalytics = false }: DashboardEnhanceTabProps) {
  const router = useRouter();
  const [uploaded, setUploaded] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [carriersModalOpen, setCarriersModalOpen] = useState(false);
  
  // Get dashboard stats
  const { stats, loading: statsLoading, refetch: refetchStats } = useDashboardStats(showAnalytics);
  const { carriers, loading: carriersLoading, fetchCarriers } = useCarriers();
  const { stats: earnedStats, loading: earnedLoading, refetch: refetchEarnedCommissionStats } = useEarnedCommissionStats(undefined, showAnalytics);

  const handleUploadResult = useCallback((result: any) => {
    console.log('Upload result received:', result);
    setUploadResult(result);
    setUploaded(true);
  }, []);

  const handleReset = () => {
    setUploaded(false);
    setUploadResult(null);
  };

  const handleCardClick = (cardType: string) => {
    switch (cardType) {
      case 'total_statements':
        router.push('/statements');
        break;
      case 'total_carriers':
        fetchCarriers();
        setCarriersModalOpen(true);
        break;
      case 'total_earned_commission':
        router.push('/?tab=earned-commission');
        break;
      case 'pending_reviews':
        router.push('/statements?tab=pending');
        break;
      case 'approved_statements':
        router.push('/statements?tab=approved');
        break;
      case 'rejected_statements':
        router.push('/statements?tab=rejected');
        break;
      default:
        break;
    }
  };

  const handlePieClick = (data: any) => {
    
    if (!data || !data.name) {
      console.log('No data received');
      return;
    }
    
    // Navegar según el tipo de statement
    switch (data.name) {
      case 'Approved':
        router.push('/statements?tab=approved');
        break;
      case 'Pending':
        router.push('/statements?tab=pending');
        break;
      case 'Rejected':
        router.push('/statements?tab=rejected');
        break;
      default:
        console.log('Unknown segment:', data.name);
        break;
    }
  };

  const statCards = [
    {
      label: "Total Earned Commission",
      value: earnedStats?.total_commission ? `$${(earnedStats.total_commission / 1000).toFixed(1)}K` : '$0',
      icon: TrendingUp,
      type: 'total_earned_commission',
      disabled: false,
      color: 'green' as const,
      description: 'Total commission earned',
      gradient: 'from-emerald-500 to-teal-600'
    },
    {
      label: "Total Carriers",
      value: stats?.total_carriers || 0,
      icon: Users,
      type: 'total_carriers',
      disabled: false,
      color: 'purple' as const,
      description: 'Active carriers',
      gradient: 'from-purple-500 to-violet-600'
    },
    {
      label: "Total Statements",
      value: stats?.total_statements || 0,
      icon: FileText,
      type: 'total_statements',
      disabled: false,
      color: 'blue' as const,
      description: 'From last month',
      gradient: 'from-blue-500 to-indigo-600'
    },
    {
      label: "Pending Reviews",
      value: stats?.pending_reviews || 0,
      icon: Clock,
      type: 'pending_reviews',
      disabled: false,
      color: 'amber' as const,
      description: 'Awaiting review',
      gradient: 'from-amber-500 to-orange-600'
    }
    /*
    { 
      label: "Approved Statements", 
      value: stats?.approved_statements || 0, 
      icon: CheckCircle,
      type: 'approved_statements',
      disabled: false,
      color: 'green' as const,
      description: 'Successfully processed',
      gradient: 'from-green-500 to-emerald-600'
    },
    { 
      label: "Rejected Statements", 
      value: stats?.rejected_statements || 0, 
      icon: XCircle,
      type: 'rejected_statements',
      disabled: false,
      color: 'red' as const,
      description: 'Requires attention',
      gradient: 'from-red-500 to-rose-600'
    },*/
  ];

  // Memoize chart data to prevent re-creation
  const lineChartData = useMemo(() => STATIC_LINE_CHART_DATA, []);
  const pieChartData = useMemo(() => STATIC_PIE_CHART_DATA, []);

  // If showing analytics, render the stats grid with hierarchy
  if (showAnalytics) {
    // Separate cards by importance
    const primaryCard = statCards.find(card => card.type === 'total_earned_commission');
    const secondaryCards = statCards.filter(card => ['total_statements', 'total_carriers'].includes(card.type));
    const tertiaryCards = statCards.filter(card => ['pending_reviews', 'approved_statements', 'rejected_statements'].includes(card.type));

    return (
      <div className="w-full space-y-8">
        {/* Primary Card - Total Earned Commission (Hero Card) */}
        {primaryCard && (
          <div className="animate-scale-in">
            <div
              className="group relative bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-lg hover:shadow-xl p-8 transition-all duration-300 cursor-pointer hover:scale-[1.01] hover:-translate-y-1"
              onClick={() => handleCardClick(primaryCard.type)}
            >
              {/* Background Gradient Overlay */}
              <div className={`absolute inset-0 bg-gradient-to-br ${primaryCard.gradient} opacity-0 group-hover:opacity-10 transition-opacity duration-300 rounded-2xl`}></div>

              {/* Content */}
              <div className="relative z-10">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-4 mb-6">
                      <div className={`w-20 h-20 rounded-2xl bg-gradient-to-r ${primaryCard.gradient} flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform duration-300`}>
                        <primaryCard.icon className="text-white" size={40} />
                      </div>
                      <div>
                        <h3 className="text-3xl font-bold text-slate-800 dark:text-slate-200 group-hover:text-slate-900 dark:group-hover:text-slate-100 transition-colors">
                          {primaryCard.label}
                        </h3>
                        <p className="text-slate-500 dark:text-slate-400 text-lg mt-1">{primaryCard.description}</p>
                      </div>
                    </div>

                    <div className="text-6xl font-bold text-slate-900 dark:text-slate-100 group-hover:text-slate-900 dark:group-hover:text-slate-100 transition-colors">
                      {statsLoading || earnedLoading ? (
                        <div className="w-48 h-16 bg-slate-200 dark:bg-slate-600 rounded animate-pulse"></div>
                      ) : primaryCard.value}
                    </div>
                  </div>
                </div>
              </div>

              {/* Hover Border Effect */}
              <div className={`absolute inset-0 rounded-2xl border-2 border-transparent group-hover:border-gradient-to-r ${primaryCard.gradient} opacity-0 group-hover:opacity-20 transition-all duration-300`}></div>
            </div>
          </div>
        )}

        {/* Secondary Cards - Total Statements & Total Carriers */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {secondaryCards.map((card, i) => (
            <div
              key={card.type}
              className="animate-scale-in"
              style={{ animationDelay: `${(i + 1) * 100}ms` }}
            >
              <div
                className="group relative bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-lg p-6 transition-all duration-300 cursor-pointer hover:scale-[1.02] hover:-translate-y-1"
                onClick={() => handleCardClick(card.type)}
              >
                {/* Background Gradient Overlay */}
                <div className={`absolute inset-0 bg-gradient-to-br ${card.gradient} opacity-0 group-hover:opacity-5 transition-opacity duration-300 rounded-xl`}></div>

                {/* Content */}
                <div className="relative z-10">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="font-semibold text-xl text-slate-800 dark:text-slate-200 group-hover:text-slate-800 dark:group-hover:text-slate-200 transition-colors mb-4">
                        {card.label}
                      </div>

                      <div className="text-4xl font-bold text-slate-900 dark:text-slate-100 group-hover:text-slate-900 dark:group-hover:text-slate-100 transition-colors mb-2">
                        {statsLoading ? (
                          <div className="w-28 h-10 bg-slate-200 dark:bg-slate-600 rounded animate-pulse"></div>
                        ) : card.value}
                      </div>

                      <div className="text-sm text-slate-500 dark:text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors">
                        {card.description}
                      </div>
                    </div>

                    <div className={`w-16 h-16 rounded-xl bg-gradient-to-r ${card.gradient} flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform duration-300`}>
                      <card.icon className="text-white" size={32} />
                    </div>
                  </div>
                </div>

                {/* Hover Border Effect */}
                <div className={`absolute inset-0 rounded-xl border-2 border-transparent group-hover:border-gradient-to-r ${card.gradient} opacity-0 group-hover:opacity-20 transition-all duration-300`}></div>
              </div>
            </div>
          ))}
        </div>

        {/* Tertiary Cards - Status Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tertiaryCards.map((card, i) => (
            <div
              key={card.type}
              className="animate-scale-in"
              style={{ animationDelay: `${(i + 3) * 100}ms` }}
            >
              <StatCard
                label={card.label}
                value={card.value}
                icon={card.icon}
                onClick={() => handleCardClick(card.type)}
                disabled={card.disabled}
                loading={statsLoading || earnedLoading}
                color={card.color}
                description={card.description}
                gradient={card.gradient}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full min-h-[calc(100vh-200px)] p-6">
      <div className="h-full space-y-8">
        {/* Dashboard Cards Grid */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-6"
        >
          {statCards.map((card, i) => (
            <div
              key={card.type}
              className="animate-scale-in"
              style={{ animationDelay: `${i * 100}ms` }}
            >
              <StatCard
                label={card.label}
                value={card.value}
                icon={card.icon}
                onClick={() => handleCardClick(card.type)}
                disabled={card.disabled}
                loading={statsLoading || earnedLoading}
                color={card.color}
                description={card.description}
                gradient={card.gradient}
              />
              </div>
          ))}
          </motion.div>

        {/* Charts Section */}
          <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="grid grid-cols-1 lg:grid-cols-3 gap-6"
        >
          {/* Line Chart - 2/3 del espacio */}
          <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-lg">
            <div className="mb-6">
              <h3 className="text-xl font-bold text-slate-800 dark:text-slate-200 mb-2">
                Statements Overview
              </h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm">
                Monthly statements stacked by status (Approved, Pending, Cancelled)
              </p>
            </div>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={lineChartData}
                  key="statements-composed-chart"
                  margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                  barCategoryGap="30%"
                  maxBarSize={25}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="name"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <YAxis
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      color: 'hsl(var(--foreground))',
                      boxShadow: '0 10px 15px -3px rgba(15, 23, 42, 0.55), 0 4px 10px -2px rgba(15, 23, 42, 0.35)'
                    }}
                    labelStyle={{
                      color: 'hsl(var(--foreground))',
                      fontWeight: '600'
                    }}
                  />
                  <Bar
                    dataKey="cancelled"
                    stackId="a"
                    fill="#EF4444"
                    name="Cancelled"
                    isAnimationActive={false}
                    stroke="#EF4444"
                    strokeWidth={1}
                  />
                  <Bar
                    dataKey="pending"
                    stackId="a"
                    fill="#8B5CF6"
                    name="Pending"
                    isAnimationActive={false}
                    stroke="#8B5CF6"
                    strokeWidth={1}
                  />
                  <Bar
                    dataKey="approved"
                    stackId="a"
                    fill="#3B82F6"
                    name="Approved"
                    isAnimationActive={false}
                    stroke="#3B82F6"
                    strokeWidth={1}
                  />
                  <Line
                    type="linear"
                    dataKey="total"
                    stroke="#22C55E"
                    strokeWidth={3}
                    dot={{ fill: '#22C55E', strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 6, stroke: '#22C55E', strokeWidth: 2 }}
                    connectNulls={false}
                    isAnimationActive={false}
                    name="Total"
                  />
                </ComposedChart>
              </ResponsiveContainer>
              </div>
            </div>

          {/* Pie Chart - 1/3 del espacio */}
          <div className="lg:col-span-1 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-lg">
            <div className="mb-6">
              <h3 className="text-xl font-bold text-slate-800 dark:text-slate-200 mb-2">
                Statement Status
              </h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm">
                Distribution of statement processing status
              </p>
            </div>
            <div 
              className="h-80"
            >
              <ResponsiveContainer width="100%" height="100%">
                <PieChart 
                  key="statement-status-chart"
                >
                  <Pie
                    data={pieChartData}
                    cx="50%"
                    cy="50%"
                    labelLine={true}
                    label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                    isAnimationActive={false}
                    onMouseDown={(data, index) => {
                      console.log('Pie segment mouse down:', data, index);
                    }}
                    onMouseUp={(data, index) => {
                      console.log('Pie segment mouse up:', data, index);
                      handlePieClick(data);
                    }}
                  >
                    {pieChartData.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={entry.color}
                        style={{ cursor: 'pointer' }}
                        stroke="white"
                        strokeWidth={2}
                        className="dark:stroke-white"
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      color: 'white',
                      boxShadow: '0 10px 15px -3px rgba(15, 23, 42, 0.55), 0 4px 10px -2px rgba(15, 23, 42, 0.35)'
                    }}
                    itemStyle={{
                      color: 'hsl(var(--foreground))', // texto visible según tema
                      fontWeight: 500,
                    }}
                    labelStyle={{
                      color: 'hsl(var(--muted-foreground))', // color más suave
                      fontWeight: 600,
                    }}
                    formatter={(value: any, name: any) => [
                      `${value} statements`,
                      name
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </motion.div>

        {/* Upload Zone */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="flex-1"
        >
          {!uploaded ? (
            <CarrierUploadZone
              onParsed={handleUploadResult}
            />
          ) : (
            <div className="space-y-6">
              {/* Success Message */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-2xl p-6"
              >
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-green-500 rounded-xl">
                    <Shield className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-green-800 dark:text-green-200 mb-2">
                      File Uploaded Successfully!
                    </h3>
                    <p className="text-green-600 dark:text-green-400">
                      Your commission statement has been processed. You can now review and approve the extracted data.
                    </p>
                  </div>
                </div>
              </motion.div>

              {/* Reset Button */}
              <div className="flex justify-center">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleReset}
                  className="px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl font-semibold hover:shadow-lg transition-all duration-200 flex items-center gap-2"
                >
                  <Upload className="w-5 h-5" />
                  Upload Another File
                </motion.button>
              </div>
            </div>
          )}
        </motion.div>
      </div>

      {/* Carriers Modal */}
      <CarriersModal
        isOpen={carriersModalOpen}
        onClose={() => setCarriersModalOpen(false)}
        carriers={carriers}
        loading={carriersLoading}
      />
    </div>
  );
}
