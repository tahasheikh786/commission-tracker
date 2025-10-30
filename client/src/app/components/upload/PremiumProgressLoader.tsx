/**
 * Premium Progress Loader Component
 * 
 * Elegant step-by-step loader with circular progress, step indicators,
 * and estimated time remaining.
 */

"use client";

import React, { useState, useEffect } from 'react';

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
    title: 'Uploading File',
    description: 'Securing your document...',
    estimatedDuration: 2000
  },
  {
    id: 'extraction',
    order: 2,
    title: 'Extracting Metadata',
    description: 'AI is analyzing document structure...',
    estimatedDuration: 5000
  },
  {
    id: 'table_extraction',
    order: 3,
    title: 'Processing Table Data',
    description: 'Extracting commission data...',
    estimatedDuration: 7000
  },
  {
    id: 'plan_detection',
    order: 4,
    title: 'Detecting Plan Type',
    description: 'Identifying insurance plan category...',
    estimatedDuration: 2000
  },
  {
    id: 'finalizing',
    order: 5,
    title: 'Finalizing',
    description: 'Preparing your data for review...',
    estimatedDuration: 1000
  }
];

interface PremiumProgressLoaderProps {
  currentStep: number;
  steps?: UploadStep[];
  progress: number;
  estimatedTime?: string;
  isVisible?: boolean;
  conversationalSummary?: string | null;  // ← NEW: Natural language summary
}

export default function PremiumProgressLoader({
  currentStep,
  steps = UPLOAD_STEPS,
  progress,
  estimatedTime,
  isVisible = true,
  conversationalSummary  // ← NEW: Natural language summary
}: PremiumProgressLoaderProps) {
  const [animatedProgress, setAnimatedProgress] = useState(0);

  // Smooth progress animation
  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimatedProgress(progress);
    }, 100);
    return () => clearTimeout(timer);
  }, [progress]);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-black/10 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 animate-slideIn overflow-visible max-h-[90vh] overflow-y-auto">
        
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
              isActive={index === currentStep}
              isCompleted={index < currentStep}
              isNext={index === currentStep + 1}
            />
          ))}
        </div>

        {/* Conversational Summary Section */}
        {progress > 80 && (
          <div className="mt-6 border-t border-gray-200 dark:border-gray-700 pt-6">
            <div className="flex items-center mb-3">
              <svg className="w-5 h-5 mr-2 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                Document Overview
              </h3>
            </div>
            
            {conversationalSummary ? (
              <div className="conversational-summary-container">
                <div className="conversational-text">
                  <p className="text-base leading-relaxed text-gray-800 dark:text-gray-100">
                    {conversationalSummary}
                  </p>
                  <span className="inline-flex items-center text-xs text-gray-500 dark:text-gray-400 mt-3">
                    <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                    AI-generated summary
                  </span>
                </div>
              </div>
            ) : (
              <div className="thinking-animation">
                <div className="animate-pulse space-y-3">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-5/6"></div>
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3"></div>
                </div>
                <span className="text-sm text-gray-500 dark:text-gray-400 mt-2 block">
                  🤔 Analyzing document...
                </span>
              </div>
            )}
          </div>
        )}

        {/* Estimated Time */}
        {estimatedTime && (
          <div className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
            <p>Estimated time: {estimatedTime} remaining</p>
          </div>
        )}
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

