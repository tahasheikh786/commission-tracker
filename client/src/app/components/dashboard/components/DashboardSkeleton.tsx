'use client';

import React from 'react';
import { motion } from 'framer-motion';

function SkeletonBox({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-slate-200 dark:bg-slate-700 rounded-lg ${className}`} />
  );
}

export default function DashboardSkeleton() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      {/* Header Skeleton */}
      <div className="sticky top-0 z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200 dark:border-slate-700">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <SkeletonBox className="w-32 h-8" />
              <SkeletonBox className="w-20 h-6 rounded-full" />
              <SkeletonBox className="w-40 h-10 rounded-lg" />
            </div>
            <div className="flex items-center gap-3">
              <SkeletonBox className="w-32 h-10 rounded-lg" />
              <SkeletonBox className="w-10 h-10 rounded-lg" />
              <SkeletonBox className="w-10 h-10 rounded-lg" />
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 lg:px-8 pb-12">
        {/* Page Title Skeleton */}
        <div className="mb-8 mt-6">
          <SkeletonBox className="w-72 h-8 mb-2" />
          <SkeletonBox className="w-48 h-4" />
        </div>

        {/* KPI Cards Skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
          {[...Array(6)].map((_, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6"
            >
              <div className="flex items-start justify-between mb-4">
                <SkeletonBox className="w-10 h-10 rounded-lg" />
                <SkeletonBox className="w-16 h-6 rounded-full" />
              </div>
              <SkeletonBox className="w-20 h-8 mb-2" />
              <SkeletonBox className="w-24 h-4 mb-2" />
              <SkeletonBox className="w-full h-12" />
            </motion.div>
          ))}
        </div>

        {/* Quick Actions Skeleton */}
        <div className="mb-8">
          <SkeletonBox className="w-32 h-6 mb-4" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {[...Array(6)].map((_, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="bg-white dark:bg-slate-800 rounded-xl shadow-md p-6"
              >
                <SkeletonBox className="w-12 h-12 rounded-lg mb-4" />
                <SkeletonBox className="w-20 h-5 mb-2" />
                <SkeletonBox className="w-full h-4" />
              </motion.div>
            ))}
          </div>
        </div>

        {/* Main Charts Section Skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Commission Chart */}
          <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <SkeletonBox className="w-40 h-6 mb-2" />
                <SkeletonBox className="w-64 h-4" />
              </div>
              <div className="flex items-center gap-2">
                <SkeletonBox className="w-32 h-8 rounded-lg" />
                <SkeletonBox className="w-10 h-8 rounded-lg" />
              </div>
            </div>
            <SkeletonBox className="w-full h-80" />
          </div>

          {/* Carrier Performance */}
          <div className="lg:col-span-1 bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6">
            <SkeletonBox className="w-48 h-6 mb-6" />
            <SkeletonBox className="w-full h-48 mb-4" />
            <div className="space-y-3">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                  <SkeletonBox className="w-full h-12" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Secondary Row Skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6">
              <SkeletonBox className="w-40 h-6 mb-6" />
              <SkeletonBox className="w-full h-48 mb-4" />
              <div className="space-y-2">
                {[...Array(4)].map((_, j) => (
                  <SkeletonBox key={j} className="w-full h-8" />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Navigation Cards Skeleton */}
        <div className="mt-8">
          <div className="flex items-center justify-between mb-6">
            <SkeletonBox className="w-48 h-6" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[...Array(4)].map((_, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6"
              >
                <SkeletonBox className="w-16 h-16 rounded-2xl mb-4" />
                <SkeletonBox className="w-32 h-6 mb-2" />
                <SkeletonBox className="w-full h-4 mb-4" />
                <SkeletonBox className="w-24 h-4" />
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
