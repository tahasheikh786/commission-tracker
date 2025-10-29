'use client';

import React from 'react';
import { motion } from 'framer-motion';

interface Carrier {
  name: string;
  logo: string;
  color: string;
}

export default function AISupportedCarriers() {
  const carriers: Carrier[] = [
    { name: 'Aetna', logo: '🏥', color: 'from-purple-500 to-pink-500' },
    { name: 'BCBS', logo: '💙', color: 'from-blue-500 to-cyan-500' },
    { name: 'Cigna', logo: '🌟', color: 'from-orange-500 to-yellow-500' },
    { name: 'Humana', logo: '🏛️', color: 'from-green-500 to-teal-500' },
    { name: 'UHC', logo: '🛡️', color: 'from-indigo-500 to-purple-500' }
  ];

  return (
    <motion.div
      className="space-y-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 1 }}
    >
      <div>
        <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
          Supported Carriers
        </h3>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
          Automatically detects and processes statements from major carriers
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        {carriers.map((carrier, index) => (
          <motion.div
            key={carrier.name}
            className="group relative"
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              delay: 1.1 + index * 0.1,
              type: "spring",
              stiffness: 200
            }}
            whileHover={{ scale: 1.05, rotate: 2 }}
          >
            <div className={`absolute -inset-1 bg-gradient-to-r ${carrier.color} rounded-xl opacity-0 group-hover:opacity-100 blur transition-all duration-300`} />

            <div className="relative bg-white dark:bg-slate-800 rounded-xl px-4 py-3 border border-slate-200 dark:border-slate-700">
              <div className="text-2xl mb-1">{carrier.logo}</div>
              <div className="font-semibold text-sm text-slate-900 dark:text-white">
                {carrier.name}
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

