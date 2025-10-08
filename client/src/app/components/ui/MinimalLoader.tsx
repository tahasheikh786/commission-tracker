'use client'
import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { CheckCircle, Clock, Loader2, FileText, Table, Search, Database, DollarSign, CheckCircle2, AlertCircle, Zap, Brain } from 'lucide-react'
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

interface Step {
  id: string
  label: string
  description: string
  estimatedDuration: string
  status: 'pending' | 'active' | 'completed' | 'error'
  icon: React.ElementType
}

interface MinimalLoaderProps {
  isVisible: boolean
  progress?: number
  stage?: string
  message?: string
  estimatedTime?: string
  fileName?: string
  onCancel?: () => void
  onRetry?: () => void
  error?: string | null
}

export default function MinimalLoader({ 
  isVisible, 
  progress: externalProgress,
  stage: externalStage,
  message: externalMessage,
  estimatedTime: externalEstimatedTime,
  fileName,
  onCancel,
  onRetry,
  error
}: MinimalLoaderProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [progress, setProgress] = useState(0)
  const [elapsedTime, setElapsedTime] = useState(0)
  const [estimatedTime, setEstimatedTime] = useState(0)
  const [documentPosition, setDocumentPosition] = useState(0)
  const [currentMessage, setCurrentMessage] = useState('')
  const [currentStage, setCurrentStage] = useState('')
  const [startTime, setStartTime] = useState(Date.now())
  const [currentStageIndex, setCurrentStageIndex] = useState(0)
  const [dynamicSteps, setDynamicSteps] = useState<Step[]>([])

  // Initialize dynamic steps
  useEffect(() => {
    setDynamicSteps(steps)
  }, [])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStageIcon = (step: Step) => {
    const IconComponent = step.icon;
    
    if (step.status === 'completed') {
      return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    } else if (step.status === 'error') {
      return <AlertCircle className="w-4 h-4 text-red-500" />;
    } else if (step.status === 'active') {
      return <IconComponent className="w-4 h-4 text-blue-500 animate-pulse" />;
    } else {
      return <IconComponent className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStageColor = (step: Step) => {
    switch (step.status) {
      case 'completed':
        return 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800';
      case 'active':
        return 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800';
      case 'error':
        return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
      default:
        return 'bg-gray-50 dark:bg-slate-700/50 border-gray-200 dark:border-slate-600';
    }
  };

  const steps: Step[] = [
    { 
      id: 'document_processing', 
      label: 'Document Processing', 
      description: 'Analyzing document structure and format',
      estimatedDuration: '5-10 seconds',
      status: 'pending',
      icon: FileText
    },
    { 
      id: 'metadata_extraction', 
      label: 'Metadata Extraction', 
      description: 'Extracting carrier name and statement date with GPT-4',
      estimatedDuration: '3-5 seconds',
      status: 'pending',
      icon: Brain
    },
    { 
      id: 'table_detection', 
      label: 'Table Detection', 
      description: 'AI-powered table and data structure identification',
      estimatedDuration: '10-15 seconds',
      status: 'pending',
      icon: Search
    },
    { 
      id: 'data_extraction', 
      label: 'Data Extraction', 
      description: 'Extracting text and financial data from tables',
      estimatedDuration: '15-20 seconds',
      status: 'pending',
      icon: Database
    },
    { 
      id: 'financial_processing', 
      label: 'Financial Processing', 
      description: 'Processing commission calculations and financial data',
      estimatedDuration: '8-12 seconds',
      status: 'pending',
      icon: DollarSign
    },
    { 
      id: 'quality_assurance', 
      label: 'Quality Assurance', 
      description: 'Validating extraction accuracy and completeness',
      estimatedDuration: '3-5 seconds',
      status: 'pending',
      icon: CheckCircle2
    }
  ]

  // Update elapsed time
  useEffect(() => {
    if (!isVisible) return;
    
    const timer = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(timer);
  }, [isVisible, startTime]);

  // Update stages based on current stage and error state
  useEffect(() => {
    if (externalStage) {
      setCurrentStage(externalStage)
      // Find matching step
      const stepIndex = steps.findIndex(step => step.id === externalStage)
      if (stepIndex !== -1) {
        setCurrentStep(stepIndex)
      }
    }
  }, [externalStage])

  // Update dynamic steps based on current stage and error state
  useEffect(() => {
    setDynamicSteps(prev => prev.map((step, index) => {
      const stepId = step.id;
      const isCurrentStage = externalStage === stepId || externalStage?.includes(step.label.toLowerCase().replace(' ', '_'));
      
      if (error) {
        return {
          ...step,
          status: isCurrentStage ? 'error' : index < currentStageIndex ? 'completed' : 'pending'
        };
      }
      
      if (isCurrentStage) {
        setCurrentStageIndex(index);
        return { ...step, status: 'active' };
      } else if (index < currentStageIndex) {
        return { ...step, status: 'completed' };
      } else {
        return { ...step, status: 'pending' };
      }
    }));
  }, [externalStage, error, currentStageIndex])

  // Use external data when available, otherwise simulate
  useEffect(() => {
    if (externalProgress !== undefined) {
      setProgress(externalProgress)
    }
    if (externalMessage) {
      setCurrentMessage(externalMessage)
    }
    if (externalEstimatedTime) {
      // Parse estimated time string to seconds
      const timeMatch = externalEstimatedTime.match(/(\d+)-(\d+)\s*seconds?/)
      if (timeMatch) {
        setEstimatedTime(parseInt(timeMatch[1]))
      }
    }
  }, [externalProgress, externalMessage, externalEstimatedTime])

  // Simulate loading progress when no external data
  useEffect(() => {
    if (!isVisible) {
      setCurrentStep(0)
      setProgress(0)
      setElapsedTime(0)
      setEstimatedTime(0)
      setDocumentPosition(0)
      setCurrentMessage('')
      setCurrentStage('')
      return
    }

    // Only simulate if no external data is provided
    if (externalProgress === undefined && !externalStage) {
      const startTime = Date.now()

      const stepInterval = setInterval(() => {
        setCurrentStep(prev => {
          if (prev >= steps.length - 1) {
            clearInterval(stepInterval)
            setProgress(100)
            setDocumentPosition(100)
            
            setTimeout(() => {
              if (onCancel) {
                onCancel()
              }
            }, 2000)
            
            return prev
          }
          const newStep = prev + 1
          const stepProgress = (newStep / (steps.length - 1)) * 100
          setProgress(stepProgress)
          setDocumentPosition(stepProgress)
          
          return newStep
        })
      }, 800)

      const timeInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000)
        setElapsedTime(elapsed)
        
        const remainingSteps = steps.length - currentStep - 1
        const estimated = remainingSteps * 0.8
        setEstimatedTime(Math.max(0, estimated))
      }, 1000)

      return () => {
        clearInterval(stepInterval)
        clearInterval(timeInterval)
      }
    }
  }, [isVisible, onCancel, externalProgress, externalStage])

  if (!isVisible) return null

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
              {dynamicSteps.slice().reverse().map((step, index) => {
                const isActive = step.status === 'active'
                const isCompleted = step.status === 'completed'
                const hasError = step.status === 'error'
                
                return (
                  <motion.div
                    key={step.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: (dynamicSteps.length - 1 - index) * 0.1 }}
                    className={`p-3 rounded-lg border transition-all duration-300 ${getStageColor(step)}`}
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
                              {step.label}
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
                              {step.description}
                            </div>
                          )}
                          
                          {/* Duration for active step */}
                          {isActive && (
                            <div className="text-xs text-slate-400 dark:text-slate-500">
                              {step.estimatedDuration}
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
            
            {/* No background outline - only the painted progress will be visible */}
            
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
          {/* Title and Cancel Button - Same Line */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1 min-w-0">
              <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100 mb-1">
                Processing Document
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                AI-powered extraction in progress
              </p>
            </div>
            
            {/* Cancel Button */}
            {onCancel && (
              <button
                onClick={onCancel}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:border-red-300 dark:hover:border-red-600 rounded-lg transition-all duration-200 border border-slate-200 dark:border-slate-600 cursor-pointer flex-shrink-0 ml-4"
              >
                Cancel
              </button>
            )}
          </div>


          {/* Individual Step Progress */}
          <div className="space-y-3">
            {/* Current Step with Linear Progress */}
            <div className="bg-slate-50 dark:bg-slate-700/80 rounded-lg p-4 border border-slate-200/30 dark:border-slate-600/40">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  {currentMessage || steps[currentStep]?.label || 'Processing...'}
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
               {currentStep + 1} / {steps.length}
             </div>
             
             {/* Time Information */}
             <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
               <div className="flex items-center gap-1">
                 <Clock className="w-3 h-3" />
                 <span>Elapsed: {formatTime(elapsedTime)}</span>
               </div>
               {estimatedTime > 0 && (
                 <div className="flex items-center gap-1">
                   <span>Est. remaining: {estimatedTime}s</span>
                 </div>
               )}
             </div>
           </div>

            {/* Error Display */}
            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5">⚠️</div>
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
                        🔄 Retry Processing
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

          </div>
        </motion.div>
      </motion.div>
    </>
  )
}
