'use client'

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
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
  Brain,
  CheckCircle
} from 'lucide-react'
import Spinner from './Spinner'

// CSS for pulse animation
const pulseKeyframes = `
@keyframes pulse {
  0%, 100% {
    opacity: 0.4;
    transform: scale(1);
  }
  50% {
    opacity: 0.8;
    transform: scale(1.02);
  }
}
`

interface ProgressStage {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  estimatedDuration: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
}

interface MinimalEnhancedLoaderProps {
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

export default function MinimalEnhancedLoader({
  isVisible,
  progress,
  stage,
  message,
  estimatedTime,
  fileName,
  onCancel,
  onRetry,
  error
}: MinimalEnhancedLoaderProps) {
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
      return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    } else if (stage.status === 'error') {
      return <AlertCircle className="w-4 h-4 text-red-500" />;
    } else if (stage.status === 'processing') {
      return <IconComponent className="w-4 h-4 text-blue-500 animate-pulse" />;
    } else {
      return <IconComponent className="w-4 h-4 text-gray-400" />;
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
    <>
      <style dangerouslySetInnerHTML={{ __html: pulseKeyframes }} />
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="fixed inset-0 bg-black/30 dark:bg-black/60 backdrop-blur-sm z-50 flex flex-col items-center justify-center p-4"
      >
        {/* Document Progress and Steps - Side by side */}
        <div className="flex items-center gap-8 mb-8">
          {/* Steps List - Left side */}
          <div className="w-80">
            {/* Steps */}
            <div className="space-y-2">
              {stages.slice().reverse().map((stageItem, index) => {
                const isActive = stageItem.status === 'processing'
                const isCompleted = stageItem.status === 'completed'
                const hasError = stageItem.status === 'error'
                
                return (
                  <motion.div
                    key={stageItem.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: (stages.length - 1 - index) * 0.1 }}
                    className={`p-3 rounded-lg border transition-all duration-300 ${getStageColor(stageItem)}`}
                  >
                    <div className="relative">
                      <div className="flex items-center gap-3">
                        <div className="flex-shrink-0">
                          {isCompleted ? (
                            <CheckCircle2 className="w-4 h-4 text-green-500" />
                          ) : hasError ? (
                            <AlertCircle className="w-4 h-4 text-red-500" />
                          ) : (
                            <div className="w-4 h-4 rounded-full bg-slate-300 dark:bg-slate-600" />
                          )}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className={`text-sm font-medium ${
                              hasError
                                ? 'text-red-700 dark:text-red-300'
                                : isActive 
                                ? 'text-blue-700 dark:text-blue-300' 
                                : isCompleted 
                                ? 'text-green-700 dark:text-green-300'
                                : 'text-slate-500 dark:text-slate-400'
                            }`}>
                              {stageItem.name}
                            </span>
                            
                            {/* Progress info for active step */}
                            {isActive && (
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-slate-500 dark:text-slate-400">
                                  {Math.round(progress)}%
                                </span>
                              </div>
                            )}
                          </div>
                          
                          {isActive && (
                            <div className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                              {stageItem.description}
                            </div>
                          )}
                          
                          {/* Duration for active step */}
                          {isActive && (
                            <div className="text-xs text-slate-400 dark:text-slate-500">
                              {stageItem.estimatedDuration}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {/* Spinner in bottom right corner for active step */}
                      {isActive && (
                        <div className="absolute bottom-0 right-0">
                          <Spinner size="sm" />
                        </div>
                      )}
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </div>
          
          {/* Document Icon - Right side */}
          <div className="relative w-64 h-64 sm:w-72 sm:h-72 lg:w-80 lg:h-80 flex items-center justify-center">
            {/* Background Document Icon */}
            <div className="relative w-56 h-56 sm:w-64 sm:h-64 lg:w-72 lg:h-72">
              {/* Spinner when progress is 0% */}
              {progress === 0 && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Spinner size="xl" className="w-16 h-16 border-4" />
                </div>
              )}
              
              {/* Progress Fill - Light Mode */}
              <div 
                className="absolute inset-0 transition-all duration-1000 ease-out dark:hidden"
                style={{
                  background: `linear-gradient(to top, #2563eb 0%, #9333ea 100%)`,
                  clipPath: `polygon(0% ${100 - (progress / 100) * 100}%, 100% ${100 - (progress / 100) * 100}%, 100% 100%, 0% 100%)`,
                  maskImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2'%3E%3Cpath d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'/%3E%3Cpolyline points='14,2 14,8 20,8'/%3E%3Cline x1='16' y1='13' x2='8' y2='13'/%3E%3Cline x1='16' y1='17' x2='8' y2='17'/%3E%3Cpolyline points='10,9 9,9 8,9'/%3E%3C/svg%3E")`,
                  WebkitMaskImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2'%3E%3Cpath d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'/%3E%3Cpolyline points='14,2 14,8 20,8'/%3E%3Cline x1='16' y1='13' x2='8' y2='13'/%3E%3Cline x1='16' y1='17' x2='8' y2='17'/%3E%3Cpolyline points='10,9 9,9 8,9'/%3E%3C/svg%3E")`,
                  maskSize: 'contain',
                  maskRepeat: 'no-repeat',
                  maskPosition: 'center',
                  filter: 'drop-shadow(0 0 12px rgba(37, 99, 235, 0.4)) blur(1px)'
                }}
              />
              
              {/* Progress Fill - Dark Mode */}
              <div 
                className="absolute inset-0 transition-all duration-1000 ease-out hidden dark:block"
                style={{
                  background: `linear-gradient(to top, #2563eb 0%, #9333ea 100%)`,
                  clipPath: `polygon(0% ${100 - (progress / 100) * 100}%, 100% ${100 - (progress / 100) * 100}%, 100% 100%, 0% 100%)`,
                  maskImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2'%3E%3Cpath d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'/%3E%3Cpolyline points='14,2 14,8 20,8'/%3E%3Cline x1='16' y1='13' x2='8' y2='13'/%3E%3Cline x1='16' y1='17' x2='8' y2='17'/%3E%3Cpolyline points='10,9 9,9 8,9'/%3E%3C/svg%3E")`,
                  WebkitMaskImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2'%3E%3Cpath d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'/%3E%3Cpolyline points='14,2 14,8 20,8'/%3E%3Cline x1='16' y1='13' x2='8' y2='13'/%3E%3Cline x1='16' y1='17' x2='8' y2='17'/%3E%3Cpolyline points='10,9 9,9 8,9'/%3E%3C/svg%3E")`,
                  maskSize: 'contain',
                  maskRepeat: 'no-repeat',
                  maskPosition: 'center',
                  filter: 'drop-shadow(0 0 12px rgba(37, 99, 235, 0.4)) blur(1px)'
                }}
              />
              
              {/* Animated Progress Glow Effect */}
              <div 
                className="absolute inset-0 transition-all duration-1000 ease-out"
                style={{
                  background: `radial-gradient(circle at center, rgba(37, 99, 235, 0.2) 0%, rgba(147, 51, 234, 0.1) 50%, transparent 70%)`,
                  clipPath: `polygon(0% ${100 - (progress / 100) * 100}%, 100% ${100 - (progress / 100) * 100}%, 100% 100%, 0% 100%)`,
                  maskImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2'%3E%3Cpath d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'/%3E%3Cpolyline points='14,2 14,8 20,8'/%3E%3Cline x1='16' y1='13' x2='8' y2='13'/%3E%3Cline x1='16' y1='17' x2='8' y2='17'/%3E%3Cpolyline points='10,9 9,9 8,9'/%3E%3C/svg%3E")`,
                  WebkitMaskImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2'%3E%3Cpath d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'/%3E%3Cpolyline points='14,2 14,8 20,8'/%3E%3Cline x1='16' y1='13' x2='8' y2='13'/%3E%3Cline x1='16' y1='17' x2='8' y2='17'/%3E%3Cpolyline points='10,9 9,9 8,9'/%3E%3C/svg%3E")`,
                  maskSize: 'contain',
                  maskRepeat: 'no-repeat',
                  maskPosition: 'center',
                  animation: 'pulse 2s ease-in-out infinite'
                }}
              />
            </div>
          </div>
        </div>

        {/* Details Panel - Bottom with solid background */}
        <motion.div
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="bg-white dark:bg-slate-800/90 backdrop-blur-md rounded-2xl p-6 shadow-2xl w-[608px] border border-slate-200/50 dark:border-slate-600/60"
        >
          {/* Header with Title and Cancel Button */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl">
                <Brain className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100 mb-1">
                  Processing Commission Document
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  {fileName ? `Extracting data from ${fileName}` : 'AI-powered extraction in progress'}
                </p>
              </div>
            </div>
            
            {/* Cancel Button */}
            {onCancel && (
              <button
                onClick={onCancel}
                className="p-2 text-gray-400 hover:text-gray-600 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            )}
          </div>

          {/* Progress Overview */}
          <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-slate-800/50 dark:to-slate-700/50 rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-gray-500 dark:text-slate-400" />
                  <span className="text-sm text-gray-600 dark:text-slate-300">
                    Elapsed: {formatTime(elapsedTime)}
                  </span>
                </div>
                {estimatedTime && (
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-gray-500 dark:text-slate-400" />
                    <span className="text-sm text-gray-600 dark:text-slate-300">
                      Est. remaining: {estimatedTime}
                    </span>
                  </div>
                )}
              </div>
              
              <div className="text-right">
                <div className="text-xl font-bold text-blue-600 dark:text-blue-400">
                  {Math.round(progress)}%
                </div>
                <div className="text-xs text-gray-500 dark:text-slate-400">Complete</div>
              </div>
            </div>

            {/* Overall Progress Bar */}
            <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
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
                className="mt-3 text-center text-gray-700 dark:text-slate-300 font-medium text-sm"
              >
                {message}
              </motion.p>
            )}
          </div>

          {/* Individual Step Progress */}
          <div className="space-y-3">
            {/* Current Step with Linear Progress */}
            <div className="bg-slate-50 dark:bg-slate-700/80 rounded-lg p-4 border border-slate-200/30 dark:border-slate-600/40">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  {message || stages[currentStageIndex]?.name || 'Processing...'}
                </span>
                <div className="flex items-center gap-2">
                  {progress < 100 ? (
                    <Spinner size="sm" />
                  ) : (
                    <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                  )}
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                    {Math.round(progress)}%
                  </span>
                </div>
              </div>
              
              {/* Linear Progress Bar */}
              <div className="w-full bg-slate-200 dark:bg-slate-600/80 rounded-full h-2">
                <div 
                  className="bg-gradient-to-r from-blue-600 to-purple-600 h-2 rounded-full transition-all duration-500 ease-out shadow-sm"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            {/* Step Counter and Time Info */}
            <div className="flex items-center justify-between my-4">
              <div className="text-sm text-slate-600 dark:text-slate-400">
                {currentStageIndex + 1} / {stages.length}
              </div>
              
              {/* Time Information */}
              <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>Elapsed: {formatTime(elapsedTime)}</span>
                </div>
                {estimatedTime && (
                  <div className="flex items-center gap-1">
                    <span>Est. remaining: {estimatedTime}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Error Display */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4"
              >
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-semibold text-red-800 dark:text-red-200 mb-1 text-sm">
                      Processing Error
                    </h4>
                    <p className="text-red-700 dark:text-red-300 text-sm mb-3">
                      {error}
                    </p>
                    
                    {onRetry && (
                      <button
                        onClick={onRetry}
                        className="flex items-center gap-2 px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm"
                      >
                        <RefreshCw className="w-4 h-4" />
                        Retry Processing
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-center gap-6 text-xs text-gray-500 dark:text-slate-400 mt-4 pt-4 border-t border-gray-100 dark:border-slate-600">
            <div className="flex items-center gap-2">
              <Shield className="w-3 h-3" />
              <span>Secure Processing</span>
            </div>
            <div className="flex items-center gap-2">
              <Brain className="w-3 h-3" />
              <span>AI-Powered</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-3 h-3" />
              <span>Quality Assured</span>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </>
  )
}
