'use client';

import React, { Suspense } from 'react';
import KPICards from './components/KPICards';
import CommissionChart from './components/charts/CommissionChart';
import CarrierPerformance from './components/charts/CarrierPerformance';
import TopCompaniesTable from './components/TopCompaniesTable';
import ActivityFeed from './components/ActivityFeed';
import InsightsPanel from './components/InsightsPanel';
import NavigationCards from './components/NavigationCards';
import DashboardSkeleton from './components/DashboardSkeleton';
import { useEnvironment } from '@/context/EnvironmentContext';
import { useDashboardData } from './hooks/useDashboardData';

export default function DashboardOverview({ environmentId }: { environmentId: string | null }) {
  const { activeEnvironment } = useEnvironment();

  const { data, isLoading, error, refetch } = useDashboardData({
    environmentId: environmentId || activeEnvironment?.id || null,
    year: new Date().getFullYear(),
    dateRange: {
      start: new Date(new Date().getFullYear(), 0, 1),
      end: new Date()
    }
  });

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-red-500 mb-4">Error loading dashboard data</p>
          <button 
            onClick={() => refetch()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-container bg-gray-50 dark:bg-slate-900">
      {/* Main Content Container */}
      <div className="w-full max-w-[1600px] mx-auto px-6 py-8">
        <div className="space-y-8">
          
          {/* 1. KPI Cards Section */}
          <section>
            <Suspense fallback={<div className="animate-pulse h-32 bg-slate-200 dark:bg-slate-700 rounded-lg mb-8" />}>
              <KPICards data={data?.metrics} />
            </Suspense>
          </section>

          {/* 2. Quick Navigation Section */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Quick Navigation
            </h2>
            <Suspense fallback={<div className="animate-pulse h-48 bg-slate-200 dark:bg-slate-700 rounded-lg" />}>
              <NavigationCards />
            </Suspense>
          </section>

          {/* 3. Top Companies Table */}
          <section>
            <Suspense fallback={<div className="animate-pulse h-96 bg-slate-200 dark:bg-slate-700 rounded-lg" />}>
              <TopCompaniesTable 
                data={data?.topCompanies || []} 
                limit={10} 
              />
            </Suspense>
          </section>

          {/* 4. Performance Overview - Charts & Visualizations */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Performance Overview
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Suspense fallback={<div className="animate-pulse h-96 bg-slate-200 dark:bg-slate-700 rounded-lg" />}>
                <CommissionChart data={data?.trends} />
              </Suspense>
              <Suspense fallback={<div className="animate-pulse h-96 bg-slate-200 dark:bg-slate-700 rounded-lg" />}>
                <CarrierPerformance data={data?.carriers} />
              </Suspense>
            </div>
          </section>

          {/* 5. Activity & Insights - Side by Side */}
          <section>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Suspense fallback={<div className="animate-pulse h-80 bg-slate-200 dark:bg-slate-700 rounded-lg" />}>
                <ActivityFeed activities={data?.recentActivity} />
              </Suspense>
              <Suspense fallback={<div className="animate-pulse h-80 bg-slate-200 dark:bg-slate-700 rounded-lg" />}>
                <InsightsPanel insights={data?.insights} />
              </Suspense>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
