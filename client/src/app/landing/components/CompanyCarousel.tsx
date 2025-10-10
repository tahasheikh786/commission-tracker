'use client';

import React from 'react';
import { motion } from 'framer-motion';

const companies = [
  { name: 'Premier Insurance Group', logo: 'PIG' },
  { name: 'Metro Financial Services', logo: 'MFS' },
  { name: 'Capital Wealth Management', logo: 'CWM' },
  { name: 'Elite Financial Partners', logo: 'EFP' },
  { name: 'Global Investment Corp', logo: 'GIC' },
  { name: 'Premier Advisors LLC', logo: 'PAL' },
  { name: 'Strategic Financial Group', logo: 'SFG' },
  { name: 'Wealth Management Inc', logo: 'WMI' }
];

export default function CompanyCarousel() {
  return (
    <div className="w-full max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 py-8 sm:py-12 lg:py-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <p className="text-slate-600 dark:text-slate-400 text-base sm:text-lg 2xl:text-lg mb-6 sm:mb-8">
            Trusted by leading financial institutions
          </p>
        </motion.div>

        {/* Carousel Container */}
        <div className="relative overflow-hidden">
          <motion.div
            className="flex gap-8 items-center"
            animate={{
              x: [0, -100 * companies.length]
            }}
            transition={{
              x: {
                repeat: Infinity,
                repeatType: "loop",
                duration: 20,
                ease: "linear",
              },
            }}
          >
            {/* First set of companies */}
            {companies.map((company, index) => (
              <motion.div
                key={`first-${index}`}
                className="flex-shrink-0 flex items-center justify-center px-4 sm:px-6 lg:px-8"
                whileHover={{ scale: 1.05 }}
                transition={{ duration: 0.2 }}
              >
                <span className="text-lg sm:text-xl lg:text-2xl 2xl:text-2xl font-light text-slate-600 dark:text-slate-400 tracking-wide whitespace-nowrap">
                  {company.name}
                </span>
              </motion.div>
            ))}
            
            {/* Duplicate set for seamless loop */}
            {companies.map((company, index) => (
              <motion.div
                key={`second-${index}`}
                className="flex-shrink-0 flex items-center justify-center px-4 sm:px-6 lg:px-8"
                whileHover={{ scale: 1.05 }}
                transition={{ duration: 0.2 }}
              >
                <span className="text-lg sm:text-xl lg:text-2xl 2xl:text-2xl font-light text-slate-600 dark:text-slate-400 tracking-wide whitespace-nowrap">
                  {company.name}
                </span>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>
  );
}
