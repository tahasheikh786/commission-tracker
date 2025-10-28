'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity } from 'lucide-react';

interface ActivityItem {
  id: number;
  user: string;
  action: string;
  file: string;
  time: string;
  avatar: string;
}

export default function ActivityFeed() {
  const [activities, setActivities] = useState<ActivityItem[]>([
    { id: 1, user: 'Sarah M.', action: 'uploaded', file: 'Aetna Statement', time: '2 min ago', avatar: '🟢' },
    { id: 2, user: 'John D.', action: 'processed', file: 'BCBS Commission', time: '5 min ago', avatar: '🔵' },
    { id: 3, user: 'Emma R.', action: 'extracted', file: 'Humana Report', time: '8 min ago', avatar: '🟣' },
  ]);

  // Simulate new activity every 10 seconds
  useEffect(() => {
    const names = ['Alex T.', 'Maria G.', 'David L.', 'Sophie K.', 'James W.'];
    const actions = ['uploaded', 'processed', 'extracted', 'reviewed'];
    const files = ['Aetna Statement', 'BCBS Commission', 'Cigna Report', 'Humana Statement', 'UHC Document'];
    const avatars = ['🟢', '🔵', '🟣', '🟠', '🔴'];

    const interval = setInterval(() => {
      const newActivity: ActivityItem = {
        id: Date.now(),
        user: names[Math.floor(Math.random() * names.length)],
        action: actions[Math.floor(Math.random() * actions.length)],
        file: files[Math.floor(Math.random() * files.length)],
        time: 'just now',
        avatar: avatars[Math.floor(Math.random() * avatars.length)]
      };

      setActivities(prev => [newActivity, ...prev.slice(0, 4)]);
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  return (
    <motion.div
      className="fixed right-8 top-32 w-80 bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl p-6 z-40"
      initial={{ x: 400, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ delay: 0.8, type: "spring" }}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Activity className="w-5 h-5 text-blue-500" />
          Live Activity
        </h3>
        <span className="flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
        </span>
      </div>

      <div className="space-y-3 max-h-96 overflow-y-auto">
        <AnimatePresence>
          {activities.map((activity, index) => (
            <motion.div
              key={activity.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ delay: index * 0.1 }}
              className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              <div className="text-2xl">{activity.avatar}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-900 dark:text-white font-medium truncate">
                  <span className="font-bold">{activity.user}</span> {activity.action}
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-400 truncate">
                  {activity.file}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">
                  {activity.time}
                </p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

