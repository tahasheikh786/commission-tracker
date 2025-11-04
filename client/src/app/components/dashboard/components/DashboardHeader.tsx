'use client';

import React, { useState } from 'react';
import { 
  Calendar, 
  RefreshCw, 
  ChevronDown,
  Download
} from 'lucide-react';
import { useEnvironment } from '@/context/EnvironmentContext';

interface DashboardHeaderProps {
  selectedYear: number;
  onYearChange: (year: number) => void;
  dateRange: { start: Date; end: Date };
  onDateRangeChange: (range: { start: Date; end: Date }) => void;
  onRefresh: () => void;
}

export default function DashboardHeader({
  selectedYear,
  onYearChange,
  dateRange,
  onDateRangeChange,
  onRefresh
}: DashboardHeaderProps) {
  const { activeEnvironment } = useEnvironment();
  const [showYearDropdown, setShowYearDropdown] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showDateRangeDropdown, setShowDateRangeDropdown] = useState(false);
  const [selectedDateRange, setSelectedDateRange] = useState('Last 12 Months');

  const currentYear = new Date().getFullYear();
  const availableYears = Array.from({ length: 5 }, (_, i) => currentYear - i);

  const handleRefresh = () => {
    setIsRefreshing(true);
    onRefresh();
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  const dateRangeOptions = [
    { label: 'Last 12 Months', value: 'last12months' },
    { label: 'This Year', value: 'thisyear' },
    { label: 'Last Year', value: 'lastyear' },
    { label: 'Last 3 Months', value: 'last3months' },
    { label: 'Last 6 Months', value: 'last6months' }
  ];

  return (
    <header className="sticky top-0 z-40 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
      <div className="px-6 py-4">
        <div className="flex items-center justify-between">
          {/* LEFT: Page Title + Last Updated */}
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              Dashboard
            </h1>
            <span className="text-sm text-slate-500 dark:text-slate-400">
              Last updated: {new Date().toLocaleTimeString()} • Environment: {activeEnvironment?.name || 'Default'}
            </span>
          </div>

          {/* RIGHT: Filters + Actions */}
          <div className="flex items-center gap-3">
            {/* Year Selector */}
            <div className="relative">
              <select
                value={selectedYear}
                onChange={(e) => {
                  onYearChange(Number(e.target.value));
                  setShowYearDropdown(false);
                }}
                className="px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800"
              >
                {availableYears.map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>

            {/* Date Range Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowDateRangeDropdown(!showDateRangeDropdown)}
                className="px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2"
              >
                <Calendar className="w-4 h-4" />
                {selectedDateRange}
                <ChevronDown className="w-4 h-4" />
              </button>

              {showDateRangeDropdown && (
                <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 py-1 z-50">
                  {dateRangeOptions.map(option => (
                    <button
                      key={option.value}
                      onClick={() => {
                        setSelectedDateRange(option.label);
                        setShowDateRangeDropdown(false);
                        // Handle date range change logic here
                      }}
                      className={`w-full px-4 py-2 text-sm text-left hover:bg-slate-100 dark:hover:bg-slate-700 ${
                        selectedDateRange === option.label ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : ''
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Refresh Button */}
            <button
              onClick={handleRefresh}
              className={`px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 ${
                isRefreshing ? 'animate-spin' : ''
              }`}
              disabled={isRefreshing}
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            {/* Export Button */}
            <button className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
              <Download className="w-4 h-4" />
              Export
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
