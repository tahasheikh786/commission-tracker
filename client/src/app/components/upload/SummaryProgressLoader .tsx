/** 
 * Premium SaaS Extraction Loader - REDESIGNED
 * 
 * Features:
 * - Side-by-side layout: Steps on left, Summary on right
 * - Generous spacing and premium typography
 * - Structured summary with visual hierarchy
 * - Real-time progress with smooth animations
 * - Mobile-responsive with elegant degradation
 */

'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2,
  Circle,
  Loader2,
  FileText,
  Brain,
  Table,
  Layers,
  MapPin,
  FileCheck,
  Sparkles,
  Clock,
  TrendingUp,
  Zap,
  AlertCircle
} from 'lucide-react';

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
    description: 'Securing your file in the cloud',
    estimatedDuration: 2000
  },
  {
    id: 'extraction',
    order: 2,
    title: 'Analyzing Document',
    description: 'AI is reading your commission statement',
    estimatedDuration: 5000
  },
  {
    id: 'table_extraction',
    order: 3,
    title: 'Reading Commission Data',
    description: 'Extracting payment details',
    estimatedDuration: 7000
  },
  {
    id: 'plan_detection',
    order: 4,
    title: 'Understanding Structure',
    description: 'Identifying document format',
    estimatedDuration: 2000
  },
  {
    id: 'ai_field_mapping',
    order: 5,
    title: 'AI Field Mapping',
    description: 'Mapping fields intelligently',
    estimatedDuration: 3000
  },
  {
    id: 'preparing_results',
    order: 6,
    title: 'Preparing Results',
    description: 'Finalizing your data',
    estimatedDuration: 2000
  }
];

interface SummaryProgressLoaderProps {
  currentStep: number;
  totalSteps?: number;
  currentStepTitle?: string;
  currentStepDescription?: string;
  progress: number;
  estimatedTime?: string | null;
  uploadedFile?: { name: string; size: number } | null;
  conversationalSummary?: string | null;
  isVisible?: boolean;
  pdfUrl?: string | null;
  onContinue?: () => void;
  onCancel?: () => void;
  summaryContent?: string | null;
  metadataContent?: string | null;
}

// Step icon mapping
const STEP_ICONS = {
  'upload': FileText,
  'extraction': Brain,
  'table_extraction': Table,
  'plan_detection': Layers,
  'ai_field_mapping': MapPin,
  'preparing_results': FileCheck
};

export default function SummaryProgressLoader({
  currentStep,
  totalSteps,
  currentStepTitle = '',
  currentStepDescription = '',
  progress,
  estimatedTime = 'Calculating...',
  uploadedFile,
  conversationalSummary,
  isVisible = true,
  pdfUrl,
  onContinue,
  onCancel
}: SummaryProgressLoaderProps) {
  
  const [showSummary, setShowSummary] = useState(false);
  
  // Show summary with delay for smooth UX
  useEffect(() => {
    if (conversationalSummary) {
      const timer = setTimeout(() => setShowSummary(true), 300);
      return () => clearTimeout(timer);
    }
  }, [conversationalSummary]);

  if (!isVisible) return null;
  
  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 overflow-auto">
      
      {/* Premium Container */}
      <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 lg:p-8">
        
        <div className="w-full max-w-7xl">
          
          {/* Main Grid: Steps Left, Content Right */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
            
            {/* LEFT SIDE: Steps Progress */}
            <div className="lg:col-span-4 space-y-6">
              
              {/* Circular Progress Ring */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 p-8">
                <div className="flex flex-col items-center space-y-6">
                  
                  {/* Progress Ring - Fixed sizing with overflow protection */}
                  <div className="relative w-48 h-48 flex-shrink-0 overflow-hidden">
                    {/* Background circle */}
                    <svg className="w-full h-full transform -rotate-90" viewBox="0 0 192 192">
                      <circle
                        cx="96"
                        cy="96"
                        r="88"
                        stroke="currentColor"
                        strokeWidth="8"
                        fill="none"
                        className="text-slate-200 dark:text-slate-800"
                      />
                      {/* Progress circle */}
                      <circle
                        cx="96"
                        cy="96"
                        r="88"
                        stroke="url(#gradient)"
                        strokeWidth="8"
                        fill="none"
                        strokeDasharray={`${2 * Math.PI * 88}`}
                        strokeDashoffset={`${2 * Math.PI * 88 * (1 - Math.min(progress, 100) / 100)}`}
                        className="transition-all duration-500 ease-out"
                        strokeLinecap="round"
                      />
                      <defs>
                        <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#3b82f6" />
                          <stop offset="100%" stopColor="#8b5cf6" />
                        </linearGradient>
                      </defs>
                    </svg>
                    
                    {/* Center content */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <div className="text-5xl font-bold bg-gradient-to-br from-blue-600 to-purple-600 bg-clip-text text-transparent">
                        {Math.min(Math.round(progress), 100)}%
                      </div>
                      <div className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                        Complete
                      </div>
                    </div>
                  </div>
                  
                  {/* Current Status */}
                  <div className="text-center space-y-2">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                      {currentStepTitle || UPLOAD_STEPS[currentStep - 1]?.title}
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      {currentStepDescription || UPLOAD_STEPS[currentStep - 1]?.description}
                    </p>
                  </div>
                  
                  {/* ETA Badge */}
                  {estimatedTime && (
                    <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-full border border-blue-100 dark:border-blue-900">
                      <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                        {estimatedTime}
                      </span>
                    </div>
                  )}
                  
                </div>
              </div>
              
              {/* Step List */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 p-6">
                <div className="space-y-4">
                  {UPLOAD_STEPS.map((step, index) => {
                    const StepIcon = STEP_ICONS[step.id as keyof typeof STEP_ICONS] || Circle;
                    const isCompleted = index < currentStep - 1;
                    const isCurrent = index === currentStep - 1;
                    const isPending = index > currentStep - 1;
                    
                    return (
                      <div
                        key={step.id}
                        className={`flex items-start gap-4 transition-all duration-300 ${
                          isCurrent ? 'scale-105' : 'scale-100'
                        }`}
                      >
                        {/* Icon */}
                        <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${
                          isCompleted 
                            ? 'bg-green-500 text-white' 
                            : isCurrent 
                            ? 'bg-gradient-to-br from-blue-500 to-purple-500 text-white animate-pulse' 
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600'
                        }`}>
                          {isCompleted ? (
                            <CheckCircle2 className="w-5 h-5" />
                          ) : isCurrent ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                          ) : (
                            <StepIcon className="w-5 h-5" />
                          )}
                        </div>
                        
                        {/* Text */}
                        <div className="flex-1 min-w-0">
                          <h4 className={`text-sm font-semibold transition-colors ${
                            isCompleted || isCurrent 
                              ? 'text-slate-900 dark:text-white' 
                              : 'text-slate-500 dark:text-slate-500'
                          }`}>
                            {step.title}
                          </h4>
                          <p className={`text-xs transition-colors mt-0.5 ${
                            isCompleted || isCurrent 
                              ? 'text-slate-600 dark:text-slate-400' 
                              : 'text-slate-400 dark:text-slate-600'
                          }`}>
                            {step.description}
                          </p>
                        </div>
                        
                        {/* Status badge */}
                        {isCompleted && (
                          <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                            Done
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              
            </div>
            
            {/* RIGHT SIDE: Document Analysis Summary */}
            <div className="lg:col-span-8">
              
              <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                
                {/* Header */}
                <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-8 py-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
                        <Sparkles className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <h2 className="text-2xl font-bold text-white">
                          Document Analysis
                        </h2>
                        <p className="text-blue-100 text-sm mt-0.5">
                          AI-powered insights from your commission statement
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 px-4 py-2 bg-white/20 backdrop-blur-sm rounded-full">
                      <Zap className="w-4 h-4 text-yellow-300" />
                      <span className="text-sm font-semibold text-white">Live Analysis</span>
                    </div>
                  </div>
                </div>
                
                {/* Content Area */}
                <div className="p-8">
                  
                  <AnimatePresence mode="wait">
                    {conversationalSummary && showSummary ? (
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.4, ease: 'easeOut' }}
                        className="space-y-6"
                      >
                        
                        {/* Parse and render structured summary */}
                        {parseSummaryIntoSections(conversationalSummary).map((section, idx) => (
                          <motion.div
                            key={idx}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.1 }}
                            className="space-y-4"
                          >
                            
                            {/* Section Title */}
                            {section.title && (
                              <div className="flex items-center gap-3">
                                <div className="w-1 h-7 bg-gradient-to-b from-blue-600 to-purple-600 rounded-full" />
                                <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                                  {section.title}
                                </h3>
                              </div>
                            )}
                            
                            {/* Section Content */}
                            <div className="ml-4 space-y-3">
                              {section.items.map((item, itemIdx) => (
                                <div key={itemIdx}>
                                  {renderSummaryItem(item)}
                                </div>
                              ))}
                            </div>
                            
                          </motion.div>
                        ))}
                        
                      </motion.div>
                    ) : (
                      /* Thinking State */
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex flex-col items-center justify-center py-20 space-y-6"
                      >
                        <div className="relative">
                          <div className="w-20 h-20 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                          <Brain className="w-8 h-8 text-blue-600 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
                        </div>
                        <div className="text-center space-y-2">
                          <p className="text-xl font-semibold text-slate-900 dark:text-white">
                            Analyzing your document...
                          </p>
                          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md">
                            Our AI is reading through your commission statement and extracting key insights
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  
                </div>
                
                {/* Footer */}
                {uploadedFile && (
                  <div className="bg-slate-50 dark:bg-slate-950/50 border-t border-slate-200 dark:border-slate-800 px-8 py-4">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-3 text-slate-600 dark:text-slate-400">
                        <FileText className="w-4 h-4" />
                        <span className="font-medium">{uploadedFile.name}</span>
                      </div>
                      <div className="flex items-center gap-4 text-slate-500 dark:text-slate-500">
                        <span>{(uploadedFile.size / 1024 / 1024).toFixed(2)} MB</span>
                        <span>•</span>
                        <div className="flex items-center gap-1.5">
                          <TrendingUp className="w-4 h-4 text-green-500" />
                          <span>Processing</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                
              </div>
              
            </div>
            
          </div>
          
        </div>
        
      </div>
      
    </div>
  );
}

// ========================================
// SUMMARY PARSING FUNCTIONS
// ========================================

interface SummarySection {
  title: string;
  items: SummaryItem[];
}

interface SummaryItem {
  type: 'paragraph' | 'keyvalue' | 'highlight' | 'list';
  content: string;
  key?: string;
  value?: string;
}

function parseSummaryIntoSections(summary: string): SummarySection[] {
  const lines = summary.split('\n').filter(line => line.trim());
  const sections: SummarySection[] = [];
  let currentSection: SummarySection = { title: '', items: [] };
  
  lines.forEach(line => {
    const trimmed = line.trim();
    
    // Detect section headers (ends with : or starts with ##)
    if (trimmed.endsWith(':') || trimmed.startsWith('##')) {
      // Save previous section if it has items
      if (currentSection.items.length > 0) {
        sections.push(currentSection);
      }
      
      // Start new section
      currentSection = {
        title: trimmed.replace(/^#+\s*/, '').replace(/:$/, '').trim(),
        items: []
      };
    } else {
      // Parse line as item
      const item = parseLineAsItem(trimmed);
      currentSection.items.push(item);
    }
  });
  
  // Push last section if it has items
  if (currentSection.items.length > 0) {
    sections.push(currentSection);
  }
  
  return sections;
}

function parseLineAsItem(line: string): SummaryItem {
  // Detect key-value pairs (e.g., "Carrier: Allied Benefit Systems")
  if (line.includes(':') && line.split(':').length === 2) {
    const [key, value] = line.split(':').map(s => s.trim());
    // Only treat as key-value if key is short (< 50 chars)
    if (key.length < 50) {
      return { type: 'keyvalue', content: line, key, value };
    }
  }
  
  // Detect if line contains important data (money, percentages, dates)
  const hasHighlight = /\$[\d,]+|\d+%|\d+ (clients|statements|companies|items)|January|February|March|April|May|June|July|August|September|October|November|December/i.test(line);
  
  if (hasHighlight) {
    return { type: 'highlight', content: line };
  }
  
  return { type: 'paragraph', content: line };
}

function renderSummaryItem(item: SummaryItem) {
  switch (item.type) {
    case 'keyvalue':
      return (
        <div className="flex items-start gap-4 py-2.5 px-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-800">
          <div className="flex-shrink-0 w-44">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              {item.key}
            </span>
          </div>
          <div className="flex-1">
            <span className="text-sm text-slate-900 dark:text-white font-medium">
              {item.value}
            </span>
          </div>
        </div>
      );
      
    case 'highlight':
      return (
        <div className="py-3 px-5 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg border border-blue-100 dark:border-blue-900/30">
          <p className="text-sm leading-relaxed text-slate-900 dark:text-white font-medium">
            {highlightNumbers(item.content)}
          </p>
        </div>
      );
      
    case 'paragraph':
    default:
      return (
        <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300 pl-4">
          {item.content}
        </p>
      );
  }
}

function highlightNumbers(text: string): React.ReactNode {
  // Split by dollar amounts, percentages, and dates
  const parts = text.split(/(\$[\d,]+\.?\d*|\d+\.?\d*%|January|February|March|April|May|June|July|August|September|October|November|December\s+\d{1,2},?\s+\d{4})/gi);
  
  return (
    <>
      {parts.map((part, i) => {
        if (/\$[\d,]+\.?\d*/.test(part)) {
          return <span key={i} className="text-green-600 dark:text-green-400 font-bold">{part}</span>;
        } else if (/\d+\.?\d*%/.test(part)) {
          return <span key={i} className="text-blue-600 dark:text-blue-400 font-bold">{part}</span>;
        } else if (/January|February|March|April|May|June|July|August|September|October|November|December\s+\d{1,2},?\s+\d{4}/i.test(part)) {
          return <span key={i} className="text-indigo-600 dark:text-indigo-400 font-semibold">{part}</span>;
        }
        return part;
      })}
    </>
  );
}
