/**
 * Premium Progress Loader Component
 * 
 * Elegant step-by-step loader with circular progress, step indicators,
 * and estimated time remaining.
 */

"use client";

import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

export interface UploadStep {
  id: string;
  order: number;
  title: string;
  description: string;
  estimatedDuration: number;
}

export const UPLOAD_STEPS: UploadStep[] = [
  {
    id: 'upload',
    order: 1,
    title: 'Uploading Document',
    description: 'Securing your file in the cloud...',
    estimatedDuration: 2000
  },
  {
    id: 'extraction',
    order: 2,
    title: 'Analyzing Document',
    description: 'AI is reading your commission statement...',
    estimatedDuration: 5000
  },
  {
    id: 'table_extraction',
    order: 3,
    title: 'Reading Commission Data',
    description: 'Extracting payment details...',
    estimatedDuration: 7000
  },
  {
    id: 'plan_detection',
    order: 4,
    title: 'Understanding Structure',
    description: 'Identifying document format...',
    estimatedDuration: 2000
  },
  {
    id: 'finalizing',
    order: 5,
    title: 'Preparing Results',
    description: 'Almost ready for your review...',
    estimatedDuration: 1000
  },
];

interface PremiumProgressLoaderProps {
  currentStep: number;
  steps?: UploadStep[];
  progress: number;
  estimatedTime?: string;
  isVisible?: boolean;
  pdfUrl?: string | null;
  onContinue?: () => void; // 🚫 PAUSE POINT: Manual continue button - remove when reverting to automatic
  summaryContent?: string; // Summary content (technical/markdown format)
  metadataContent?: string; // Metadata content
  conversationalSummary?: string | null; // ← NEW: Natural language summary
}

export default function PremiumProgressLoader({
  currentStep,
  steps = UPLOAD_STEPS,
  progress,
  estimatedTime,
  isVisible = true,
  pdfUrl,
  onContinue,
  summaryContent,
  metadataContent,
  conversationalSummary  // ← NEW: Natural language summary
}: PremiumProgressLoaderProps) {
  const [animatedProgress, setAnimatedProgress] = useState(0);
  const [countdown, setCountdown] = useState(10);
  const [isCountdownActive, setIsCountdownActive] = useState(false);

  // Check if step 5 (Finalizing) is completed for continue button
  const isStep5Completed = currentStep >= 5 || progress >= 100;
  const isCompleted = progress >= 100;
  
  // ← NEW: Debug logging for conversational summary
  useEffect(() => {
    if (conversationalSummary) {
      console.log('📝 [SummaryProgressLoader] Conversational summary received:', conversationalSummary);
    } else if (progress > 80) {
      console.log('⚠️ [SummaryProgressLoader] No conversational summary yet (progress:', progress, '%)');
    }
  }, [conversationalSummary, progress]);

  // Smooth progress animation
  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimatedProgress(progress);
    }, 100);
    return () => clearTimeout(timer);
  }, [progress]);

  // Countdown logic
  useEffect(() => {
    if (isStep5Completed && !isCountdownActive) {
      setIsCountdownActive(true);
      setCountdown(10);
    }
  }, [isStep5Completed, isCountdownActive]);

  useEffect(() => {
    if (isCountdownActive && countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown(countdown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (isCountdownActive && countdown === 0) {
      // Auto-continue when countdown reaches 0
      if (onContinue) {
        onContinue();
      }
    }
  }, [isCountdownActive, countdown, onContinue]);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 animate-fadeIn p-4 bg-black/50 backdrop-blur-sm">
      <div className="p-4 w-full sm:w-4/5 h-full mx-auto animate-slideIn overflow-visible bg-white dark:bg-transparent rounded-2xl shadow-2xl">
        <div className="grid grid-cols-5 gap-6 h-full">
          {/* Left Column - Progress Steps (1/5) */}
          <div className="flex flex-col col-span-1">
        
        {/* Main Progress Circle */}
        <div className="flex flex-col items-center mb-8 p-4">
          <div className="relative w-24 h-24 mb-4 overflow-visible">
            <CircularProgress value={animatedProgress} />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-lg font-semibold text-gray-800 dark:text-white">
                {Math.round(animatedProgress)}%
              </span>
            </div>
          </div>
          
          <h2 className="text-xl font-semibold text-gray-800 dark:text-white text-center">
            Processing Your File
          </h2>
        </div>

        {/* Step Indicators */}
        <div className="space-y-3">
          {steps.map((step, index) => (
            <StepIndicator
              key={step.id}
              step={step}
              isActive={index === currentStep && !(index === 4 && progress >= 100)}
              isCompleted={index < currentStep || (index === 4 && progress >= 100)}
              isNext={index === currentStep + 1}
            />
          ))}
        </div>

        {/* Estimated Time */}
        {estimatedTime && !isCompleted && (
          <div className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
            <p>Estimated time: {estimatedTime} remaining</p>
          </div>
        )}

        {/* Continue Button - Always visible, enabled when step 5 is completed */}
        {onContinue && (
          <div className="mt-8 flex justify-center">
            <button
              onClick={isStep5Completed ? onContinue : undefined}
              disabled={!isStep5Completed}
              className={`px-8 py-3 rounded-xl font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                isStep5Completed
                  ? 'bg-gradient-to-r from-green-500 to-blue-600 text-white hover:shadow-lg hover:scale-105 focus:ring-blue-500'
                  : 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
              }`}
            >
              <div className="flex items-center gap-2">
                {isStep5Completed ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
                {isStep5Completed 
                  ? (isCountdownActive && countdown > 0 ? `Continuing in ${countdown}s` : 'Continue')
                  : 'Processing...'
                }
              </div>
            </button>
          </div>
        )}
          </div>
          
          {/* Center Column - PDF Viewer (3/5) */}
          <div className="flex flex-col col-span-3">
            {pdfUrl ? (
              <div className="flex-1 overflow-hidden rounded-lg shadow-lg border border-gray-200 dark:border-gray-600">
                <iframe
                  src={`${pdfUrl}#toolbar=1&navpanes=0&scrollbar=1&view=FitH&statusbar=0&menubar=0&header=0&footer=0&zoom=100&pagemode=none`}
                  className="w-full h-full border-0 rounded-lg scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-gray-100 dark:scrollbar-track-gray-800"
                  title="PDF Preview"
                  style={{ 
                    minHeight: '500px',
                    filter: 'brightness(1.1) contrast(1.05)',
                    backgroundColor: '#f8fafc'
                  }}
                />
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-700 dark:to-gray-800 rounded-lg border border-gray-200 dark:border-gray-600">
                <div className="text-center">
                  <svg className="w-16 h-16 mx-auto mb-4 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-gray-500 dark:text-gray-400 font-medium">No document preview available</p>
                </div>
              </div>
            )}
          </div>
          
          {/* Right Column - Content (1/5) */}
          <div className="flex flex-col col-span-1">
            <div className="flex-1 overflow-auto rounded-lg p-2 bg-transparent max-h-[90vh]">
              <div className="prose prose-sm dark:prose-invert max-w-none overflow-x-auto overflow-y-auto">
                
                {/* Summary Section - Always visible */}
                <div className="mb-6">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-0.5 bg-blue-500"></div>
                    <span className="text-sm font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide">
                      Summary
                    </span>
                    <div className="flex-1 h-0.5 bg-gradient-to-r from-blue-500 to-transparent"></div>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 italic mb-3">
                    File summary and document overview
                  </p>
                  
                  {/* Content or Thinking Animation */}
                  {conversationalSummary ? (
                    /* ✨ Enhanced Conversational Summary with Premium Animations */
                    <div className="conversational-summary-container animate-scale-in">
                      <div className="flex items-start gap-3">
                        {/* Animated Icon */}
                        <div className="flex-shrink-0 mt-1">
                          <div className="relative">
                            {/* Pulsing background */}
                            <div className="absolute inset-0 bg-blue-500/20 rounded-full animate-ping"></div>
                            {/* Icon */}
                            <div className="relative bg-gradient-to-br from-blue-500 to-purple-600 p-2 rounded-full">
                              <svg 
                                className="w-5 h-5 text-white" 
                                fill="none" 
                                stroke="currentColor" 
                                viewBox="0 0 24 24"
                              >
                                <path 
                                  strokeLinecap="round" 
                                  strokeLinejoin="round" 
                                  strokeWidth={2} 
                                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" 
                                />
                              </svg>
                            </div>
                          </div>
                        </div>
                        
                        {/* Summary Text */}
                        <div className="flex-1 conversational-text">
                          <p className="text-sm leading-relaxed text-gray-800 dark:text-gray-100 animate-fade-in-up">
                            {conversationalSummary}
                          </p>
                          
                          {/* AI Badge */}
                          <div className="flex items-center gap-2 mt-3 animate-fade-in-up delay-200">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-blue-500/10 text-blue-400 rounded-full border border-blue-500/20">
                              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                              </svg>
                              AI-generated summary
                            </span>
                            
                            {/* Animated checkmark */}
                            <div className="flex items-center gap-1 text-green-400 text-xs">
                              <svg className="w-3.5 h-3.5 animate-scale-in" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              <span>Verified</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : summaryContent ? (
                    /* Fallback to technical/markdown summary */
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown>
                        {summaryContent}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    /* Enhanced Thinking Animation */
                    <div className="thinking-animation animate-pulse">
                      <div className="flex items-start gap-3">
                        {/* Animated thinking icon */}
                        <div className="flex-shrink-0 mt-1">
                          <div className="relative">
                            <div className="absolute inset-0 bg-blue-500/10 rounded-full animate-ping"></div>
                            <div className="relative bg-gradient-to-br from-blue-500/30 to-purple-600/30 p-2 rounded-full">
                              <svg 
                                className="w-5 h-5 text-blue-400 animate-spin" 
                                fill="none" 
                                stroke="currentColor" 
                                viewBox="0 0 24 24"
                              >
                                <path 
                                  strokeLinecap="round" 
                                  strokeLinejoin="round" 
                                  strokeWidth={2} 
                                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" 
                                />
                              </svg>
                            </div>
                          </div>
                        </div>
                        
                        {/* Skeleton text */}
                        <div className="flex-1 space-y-3">
                          <div className="h-4 bg-gray-700/50 rounded w-5/6 animate-pulse"></div>
                          <div className="h-4 bg-gray-700/50 rounded w-4/6 animate-pulse delay-100"></div>
                          <div className="h-4 bg-gray-700/50 rounded w-3/6 animate-pulse delay-200"></div>
                          
                          <div className="flex items-center gap-2 mt-2">
                            <div className="h-5 w-20 bg-blue-500/10 rounded-full animate-pulse"></div>
                            <span className="text-sm text-gray-500">Analyzing document...</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* ❌ REMOVED: FILE METADATA Section - Now included in conversational summary */}
                {/* The conversational summary now contains all relevant information */}
                {/* No need for technical metadata display */}

              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Circular Progress Component
function CircularProgress({ value }: { value: number }) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (value / 100) * circumference;

  return (
    <svg className="w-full h-full transform -rotate-90 overflow-visible" viewBox="0 0 100 100">
      {/* Background circle */}
      <circle
        cx="48"
        cy="48"
        r={radius}
        stroke="currentColor"
        strokeWidth="3"
        fill="none"
        className="text-gray-200 dark:text-gray-700"
      />
      {/* Progress circle */}
      <circle
        cx="48"
        cy="48"
        r={radius}
        stroke="currentColor"
        strokeWidth="3"
        fill="none"
        strokeDasharray={circumference}
        strokeDashoffset={strokeDashoffset}
        className="text-blue-600 dark:text-blue-400 transition-all duration-500 ease-out"
        strokeLinecap="round"
      />
    </svg>
  );
}

// Step Indicator Component
interface StepIndicatorProps {
  step: UploadStep;
  isActive: boolean;
  isCompleted: boolean;
  isNext: boolean;
}

function StepIndicator({ step, isActive, isCompleted, isNext }: StepIndicatorProps) {
  return (
    <div
      className={`
        flex items-center p-3 rounded-lg transition-all duration-500
        ${isActive ? 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-600' : ''}
        ${isCompleted ? 'bg-green-50 dark:bg-green-900/20' : ''}
      `}
    >
      {/* Icon */}
      <div
        className={`
          w-8 h-8 rounded-full flex items-center justify-center mr-3 transition-all duration-300 flex-shrink-0
          ${
            isCompleted
              ? 'bg-green-600 text-white'
              : isActive
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
          }
        `}
      >
        {isCompleted ? (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : isActive ? (
          <div className="relative">
            <div className="w-3 h-3 bg-white rounded-full"></div>
            <div className="absolute inset-0 w-3 h-3 bg-white rounded-full animate-ping"></div>
          </div>
        ) : (
          <span className="text-sm font-medium">{step.order}</span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p
          className={`
            font-medium transition-colors duration-200 truncate
            ${
              isActive
                ? 'text-blue-800 dark:text-blue-300'
                : isCompleted
                ? 'text-green-800 dark:text-green-300'
                : 'text-gray-600 dark:text-gray-400'
            }
          `}
        >
          {step.title}
        </p>
        {isActive && (
          <p className="text-sm text-blue-600 dark:text-blue-400 mt-1 animate-fadeIn truncate">
            {step.description}
          </p>
        )}
      </div>

      {/* Loading Spinner for Active Step */}
      {isActive && !isCompleted && (
        <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin flex-shrink-0 ml-2"></div>
      )}
    </div>
  );
}

