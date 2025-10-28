'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Shield } from 'lucide-react';

export default function SecurityBadge() {
  return (
    <motion.div
      className="mt-16 max-w-4xl mx-auto"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 1.2 }}
    >
      <div className="bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-900/20 dark:to-blue-900/20 rounded-2xl p-8 border border-green-200 dark:border-green-700">
        <div className="flex flex-col md:flex-row items-center gap-6">
          <div className="flex-shrink-0">
            <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center">
              <Shield className="w-8 h-8 text-white" />
            </div>
          </div>

          <div className="flex-1 text-center md:text-left">
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
              Bank-Level Security
            </h3>
            <p className="text-slate-600 dark:text-slate-400">
              Your data is encrypted with 256-bit AES encryption. We&apos;re SOC 2 Type II certified and GDPR compliant.
            </p>
          </div>

          <div className="flex gap-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600 dark:text-green-400">99.9%</div>
              <div className="text-xs text-slate-600 dark:text-slate-400">Uptime</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">24/7</div>
              <div className="text-xs text-slate-600 dark:text-slate-400">Support</div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

