'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { 
  BarChart3, 
  Upload, 
  DollarSign, 
  Database,
  ArrowRight
} from 'lucide-react';

interface NavCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  gradient: string;
  onClick: () => void;
  stats?: {
    label: string;
    value: string;
  };
}

function NavCard({ icon, title, description, gradient, onClick }: NavCardProps) {
  return (
    <motion.div
      whileHover={{ scale: 1.02, y: -1 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="group relative bg-white dark:bg-slate-800 rounded-xl border-2 border-gray-200 dark:border-slate-700 shadow-md hover:shadow-xl hover:border-gray-300 dark:hover:border-slate-600 transition-all duration-300 cursor-pointer overflow-hidden min-h-[180px] flex flex-col"
    >
      <div className="relative p-6 flex flex-col h-full">
        {/* Icon section - top left */}
        <div className={`w-16 h-16 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center mb-4 text-white`}>
          {icon}
        </div>
        
        {/* Content section */}
        <div className="space-y-2 mb-4 flex-grow">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">{title}</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{description}</p>
        </div>
        
        {/* Open button */}
        <div className="mt-auto flex items-center text-sm font-medium text-blue-600 dark:text-blue-400 group-hover:text-blue-700 dark:group-hover:text-blue-300">
          <span>Open</span>
          <ArrowRight className="w-4 h-4 ml-1 transition-transform group-hover:translate-x-1" />
        </div>
      </div>
    </motion.div>
  );
}

export default function NavigationCards() {
  const router = useRouter();

  const navItems = [
    {
      icon: <Upload className="w-8 h-8" />,
      title: 'Upload Statement',
      description: 'Process new documents',
      gradient: 'from-blue-500 to-blue-600',
      onClick: () => router.push('/?tab=upload')
    },
    {
      icon: <BarChart3 className="w-8 h-8" />,
      title: 'View Analytics',
      description: 'Detailed insights',
      gradient: 'from-emerald-500 to-emerald-600',
      onClick: () => router.push('/?tab=analytics')
    },
    {
      icon: <DollarSign className="w-8 h-8" />,
      title: 'Commission Reports',
      description: 'Track earnings',
      gradient: 'from-violet-500 to-violet-600',
      onClick: () => router.push('/?tab=earned-commission-companies')
    },
    {
      icon: <Database className="w-8 h-8" />,
      title: 'Manage Carriers',
      description: 'Carrier settings',
      gradient: 'from-orange-500 to-orange-600',
      onClick: () => router.push('/?tab=carriers')
    }
  ];

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="mt-8"
    >

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {navItems.map((item, index) => (
          <motion.div
            key={item.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="h-full"
          >
            <NavCard {...item} />
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
