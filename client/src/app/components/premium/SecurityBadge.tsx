'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Shield } from 'lucide-react';

export default function SecurityBadge() {
  return (
    <motion.div
      className="w-full h-full"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 1.2 }}
    >
      <div className="h-full bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-2xl p-8 border border-green-200 dark:border-green-700 flex flex-col justify-center">
        <div className="flex flex-col items-center gap-6 text-center">
          <div className="flex-shrink-0">
            <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center">
              <Shield className="w-10 h-10 text-white" />
            </div>
          </div>

          <div className="flex-1">
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">
              Bank-Level Security
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
              Your data is encrypted with 256-bit AES encryption. We&apos;re SOC 2 Type II certified and GDPR compliant.
            </p>
          </div>

          <div className="flex gap-6">
            <div className="text-center">
              <div className="text-4xl font-bold text-green-600 dark:text-green-400">99.9%</div>
              <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">Uptime</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-blue-600 dark:text-blue-400">24/7</div>
              <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">Support</div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

