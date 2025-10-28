'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { FileText, Sheet } from 'lucide-react';

interface FormatCardProps {
  type: string;
  icon: React.ReactNode;
  description: string;
  color: string;
  supported: string[];
  index: number;
}

const FormatCard = ({ type, icon, description, color, supported, index }: FormatCardProps) => {
  return (
    <motion.div
      className="group relative"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.8 + index * 0.1 }}
      whileHover={{ y: -5, scale: 1.02 }}
    >
      {/* Gradient Border */}
      <div className={`absolute -inset-0.5 bg-gradient-to-r ${color} rounded-2xl opacity-75 group-hover:opacity-100 blur transition-all duration-300`} />

      {/* Card Content */}
      <div className="relative bg-white dark:bg-slate-800 rounded-2xl p-8">
        <div className={`inline-flex p-4 rounded-xl bg-gradient-to-br ${color} text-white mb-4`}>
          {icon}
        </div>

        <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
          {type}
        </h3>

        <p className="text-slate-600 dark:text-slate-400 mb-4">
          {description}
        </p>

        <div className="flex flex-wrap gap-2">
          {supported.map(ext => (
            <span
              key={ext}
              className="px-3 py-1 bg-slate-100 dark:bg-slate-700 rounded-lg text-sm font-mono text-slate-700 dark:text-slate-300"
            >
              {ext}
            </span>
          ))}
        </div>
      </div>
    </motion.div>
  );
};

export default function SupportedFormatsSection() {
  const formats = [
    {
      type: 'PDF',
      icon: <FileText className="w-8 h-8" />,
      description: 'Portable Document Format',
      color: 'from-red-500 to-orange-500',
      supported: ['.pdf']
    },
    {
      type: 'Excel',
      icon: <Sheet className="w-8 h-8" />,
      description: 'Microsoft Excel Workbooks',
      color: 'from-green-500 to-emerald-500',
      supported: ['.xlsx', '.xls', '.xlsm', '.xlsb']
    }
  ];

  return (
    <motion.div
      className="mt-16 space-y-8"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.7 }}
    >
      <div className="text-center">
        <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-3">
          Supported File Formats
        </h2>
        <p className="text-slate-600 dark:text-slate-400">
          We support all major document formats with AI-powered extraction
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
        {formats.map((format, index) => (
          <FormatCard key={format.type} {...format} index={index} />
        ))}
      </div>
    </motion.div>
  );
}

