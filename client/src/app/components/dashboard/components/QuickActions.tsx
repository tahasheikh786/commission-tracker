'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { 
  Upload, 
  BarChart3, 
  DollarSign, 
  Database,
  ArrowRight
} from 'lucide-react';

interface ActionCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  color: string;
}

function ActionCard({ icon, title, description, onClick, color }: ActionCardProps) {
  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="group relative bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-6 transition-all duration-300 hover:shadow-lg hover:border-gray-300 dark:hover:border-slate-600 cursor-pointer overflow-hidden min-h-[160px] flex flex-col text-left"
    >
      <div className="flex flex-col h-full">
        {/* Icon Container */}
        <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center mb-4`}>
          <div className="text-white">
            {icon}
          </div>
        </div>
        
        {/* Title */}
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{title}</h3>
        
        {/* Description */}
        <p className="text-sm text-gray-600 dark:text-gray-400 flex-grow">{description}</p>
        
        {/* Action indicator */}
        <div className="mt-4 flex items-center text-sm font-medium text-blue-600 dark:text-blue-400 group-hover:text-blue-700 dark:group-hover:text-blue-300">
          <span>Open</span>
          <ArrowRight className="w-4 h-4 ml-1 transition-transform group-hover:translate-x-1" />
        </div>
      </div>
    </motion.button>
  );
}

export default function QuickActions() {
  const router = useRouter();

  const actions = [
    {
      icon: <Upload className="w-7 h-7" />,
      title: 'Upload Statement',
      description: 'Process new documents',
      onClick: () => router.push('/?tab=upload'),
      color: 'from-blue-500 to-blue-600'
    },
    {
      icon: <BarChart3 className="w-7 h-7" />,
      title: 'View Analytics',
      description: 'Detailed insights',
      onClick: () => router.push('/?tab=analytics'),
      color: 'from-emerald-500 to-emerald-600'
    },
    {
      icon: <DollarSign className="w-7 h-7" />,
      title: 'Commission Reports',
      description: 'Track earnings',
      onClick: () => router.push('/?tab=earned-commission-companies'),
      color: 'from-violet-500 to-violet-600'
    },
    {
      icon: <Database className="w-7 h-7" />,
      title: 'Manage Carriers',
      description: 'Carrier settings',
      onClick: () => router.push('/?tab=carriers'),
      color: 'from-orange-500 to-orange-600'
    }
  ];

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="mb-8"
    >
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {actions.map((action, index) => (
          <motion.div
            key={action.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
          >
            <ActionCard {...action} />
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
