'use client'

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText,
  Search,
  Database,
  DollarSign,
  CheckCircle2,
  X,
  RefreshCw,
  Clock,
  AlertCircle,
  TrendingUp,
  Shield,
  Zap,
  Brain
} from 'lucide-react';

interface ProgressStage {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  estimatedDuration: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
}

interface EnhancedProgressLoaderProps {
  isVisible: boolean;
  progress: number;
  stage: string;
  message: string;
  estimatedTime?: string;
  fileName?: string;
  onCancel?: () => void;
  onRetry?: () => void;
  error?: string | null;
}

const EXTRACTION_STAGES: ProgressStage[] = [
  {
    id: 'document_processing',
    name: 'Document Processing',
    description: 'Analyzing document structure and format',
    icon: FileText,
    estimatedDuration: '5-10 seconds',
    status: 'pending'
  },
  {
    id: 'metadata_extraction',
    name: 'Metadata Extraction',
    description: 'Extracting carrier name and statement date with GPT-4',
    icon: Brain,
    estimatedDuration: '3-5 seconds',
    status: 'pending'
  },
  {
    id: 'table_detection',
    name: 'Table Detection',
    description: 'AI-powered table and data structure identification',
    icon: Search,
    estimatedDuration: '10-15 seconds',
    status: 'pending'
  },
  {
    id: 'data_extraction',
    name: 'Data Extraction',
    description: 'Extracting text and financial data from tables',
    icon: Database,
    estimatedDuration: '15-20 seconds',
    status: 'pending'
  },
  {
    id: 'financial_processing',
    name: 'Financial Processing',
    description: 'Processing commission calculations and financial data',
    icon: DollarSign,
    estimatedDuration: '8-12 seconds',
    status: 'pending'
  },
  {
    id: 'quality_assurance',
    name: 'Quality Assurance',
    description: 'Validating extraction accuracy and completeness',
    icon: CheckCircle2,
    estimatedDuration: '3-5 seconds',
    status: 'pending'
  }
];

export default function EnhancedProgressLoader({
  isVisible,
  progress,
  stage,
  message,
  estimatedTime,
  fileName,
  onCancel,
  onRetry,
  error
}: EnhancedProgressLoaderProps) {
  const [stages, setStages] = useState<ProgressStage[]>(EXTRACTION_STAGES);
  const [startTime] = useState(Date.now());
  const [elapsedTime, setElapsedTime] = useState(0);
  const [currentStageIndex, setCurrentStageIndex] = useState(0);

  // Update elapsed time
  useEffect(() => {
    if (!isVisible) return;
    
    const timer = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(timer);
  }, [isVisible, startTime]);

  // Update stages based on current stage
  useEffect(() => {
    setStages(prev => prev.map((stageItem, index) => {
      const stageId = stageItem.id;
      const isCurrentStage = stage === stageId || stage.includes(stageItem.name.toLowerCase().replace(' ', '_'));
      
      if (error) {
        return {
          ...stageItem,
          status: isCurrentStage ? 'error' : index < currentStageIndex ? 'completed' : 'pending'
        };
      }
      
      if (isCurrentStage) {
        setCurrentStageIndex(index);
        return { ...stageItem, status: 'processing' };
      } else if (index < currentStageIndex) {
        return { ...stageItem, status: 'completed' };
      } else {
        return { ...stageItem, status: 'pending' };
      }
    }));
  }, [stage, error, currentStageIndex]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStageIcon = (stage: ProgressStage) => {
    const IconComponent = stage.icon;
    
    if (stage.status === 'completed') {
      return <CheckCircle2 className="w-6 h-6 text-green-500" />;
    } else if (stage.status === 'error') {
      return <AlertCircle className="w-6 h-6 text-red-500" />;
    } else if (stage.status === 'processing') {
      return <IconComponent className="w-6 h-6 text-blue-500 animate-pulse" />;
    } else {
      return <IconComponent className="w-6 h-6 text-gray-400" />;
    }
  };

  const getStageColor = (stage: ProgressStage) => {
    switch (stage.status) {
      case 'completed':
        return 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800';
      case 'processing':
        return 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800';
      case 'error':
        return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
      default:
        return 'bg-gray-50 dark:bg-slate-700/50 border-gray-200 dark:border-slate-600';
    }
  };

  if (!isVisible) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="p-6 border-b border-gray-100 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl">
                <Brain className="w-8 h-8 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-800 dark:text-slate-200">
                  Processing Commission Document
                </h2>
                <p className="text-gray-600 dark:text-slate-400">
                  {fileName ? `Extracting data from ${fileName}` : 'AI-powered extraction in progress'}
                </p>
              </div>
            </div>
            
            {onCancel && (
              <button
                onClick={onCancel}
                className="p-2 text-gray-400 hover:text-gray-600 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            )}
          </div>
        </div>

        {/* Progress Overview */}
        <div className="p-6 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-slate-800/50 dark:to-slate-700/50">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-gray-500 dark:text-slate-400" />
                <span className="text-sm text-gray-600 dark:text-slate-300">
                  Elapsed: {formatTime(elapsedTime)}
                </span>
              </div>
              {estimatedTime && (
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-gray-500 dark:text-slate-400" />
                  <span className="text-sm text-gray-600 dark:text-slate-300">
                    Est. remaining: {estimatedTime}
                  </span>
                </div>
              )}
            </div>
            
            <div className="text-right">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {Math.round(progress)}%
              </div>
              <div className="text-sm text-gray-500 dark:text-slate-400">Complete</div>
            </div>
          </div>

          {/* Overall Progress Bar */}
          <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-3 overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-blue-500 to-purple-600 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
          </div>

          {/* Current Message */}
          {message && !error && (
            <motion.p
              key={message}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 text-center text-gray-700 dark:text-slate-300 font-medium"
            >
              {message}
            </motion.p>
          )}
        </div>

        {/* Stage Details */}
        <div className="p-6">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-slate-200 mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-500" />
            Extraction Stages
          </h3>
          
          <div className="space-y-3">
            {stages.map((stageItem, index) => (
              <motion.div
                key={stageItem.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className={`p-4 rounded-xl border-2 transition-all duration-300 ${getStageColor(stageItem)}`}
              >
                <div className="flex items-center gap-4">
                  <div className="flex-shrink-0">
                    {getStageIcon(stageItem)}
                  </div>
                  
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="font-semibold text-gray-800 dark:text-slate-200">
                        {stageItem.name}
                      </h4>
                      <span className="text-sm text-gray-500 dark:text-slate-400">
                        {stageItem.estimatedDuration}
                      </span>
                    </div>
                    <p className="text-gray-600 dark:text-slate-300 text-sm">
                      {stageItem.description}
                    </p>
                    
                    {/* Stage Progress Bar */}
                    {stageItem.status === 'processing' && (
                      <div className="mt-2">
                        <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-1.5">
                          <motion.div
                            className="h-full bg-blue-500 rounded-full"
                            initial={{ width: 0 }}
                            animate={{ width: `${progress}%` }}
                            transition={{ duration: 0.3 }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex-shrink-0">
                    {stageItem.status === 'processing' && (
                      <Zap className="w-5 h-5 text-blue-500 animate-bounce" />
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-6 bg-red-50 dark:bg-red-900/20 border-t border-red-100 dark:border-red-800"
          >
            <div className="flex items-start gap-3">
              <AlertCircle className="w-6 h-6 text-red-500 flex-shrink-0 mt-1" />
              <div className="flex-1">
                <h4 className="font-semibold text-red-800 dark:text-red-200 mb-1">
                  Processing Error
                </h4>
                <p className="text-red-700 dark:text-red-300 text-sm mb-4">
                  {error}
                </p>
                
                {onRetry && (
                  <button
                    onClick={onRetry}
                    className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Retry Processing
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* Footer */}
        <div className="p-6 bg-gray-50 dark:bg-slate-700/50 border-t border-gray-100 dark:border-slate-600 rounded-b-2xl">
          <div className="flex items-center justify-center gap-6 text-sm text-gray-500 dark:text-slate-400">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4" />
              <span>Secure Processing</span>
            </div>
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4" />
              <span>AI-Powered</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              <span>Quality Assured</span>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}