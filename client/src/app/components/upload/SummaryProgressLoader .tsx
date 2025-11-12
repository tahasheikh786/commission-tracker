/** 
 * Premium SaaS Summary Loader - 3-COLUMN REDESIGN 2025
 * 
 * Features:
 * - Three-column layout: Steps (300px) | PDF Preview (flexible) | Key Info (350px)
 * - Left: Compact progress steps + file metadata
 * - Center: Full-height PDF document preview only
 * - Right: Structured key-value data cards for quick scanning
 * - No long text summaries - only scannable information
 * - Real-time WebSocket updates
 * - Mobile-responsive with stacked layout
 */

'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2,
  Circle,
  FileText,
  Brain,
  Clock,
  TrendingUp,
  Zap,
  Building2,
  Sparkles,
  Layers
} from 'lucide-react';

// Animated Background Component with Premium Gradient Orbs
const AnimatedBackground: React.FC = () => {
  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Base Gradient Layer */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950" />
      
      {/* Animated Gradient Orbs */}
      <div className="absolute inset-0">
        {/* Orb 1 - Blue */}
        <div 
          className="absolute w-[600px] h-[600px] rounded-full opacity-30 blur-3xl"
          style={{
            top: '10%',
            left: '10%',
            background: 'linear-gradient(to right, rgb(96, 165, 250), rgb(59, 130, 246))',
            animation: 'float-1 20s ease-in-out infinite'
          }}
        />
        
        {/* Orb 2 - Purple */}
        <div 
          className="absolute w-[500px] h-[500px] rounded-full opacity-30 blur-3xl"
          style={{
            top: '60%',
            right: '10%',
            background: 'linear-gradient(to right, rgb(192, 132, 252), rgb(168, 85, 247))',
            animation: 'float-2 25s ease-in-out infinite'
          }}
        />
        
        {/* Orb 3 - Emerald */}
        <div 
          className="absolute w-[450px] h-[450px] rounded-full opacity-20 blur-3xl"
          style={{
            bottom: '10%',
            left: '30%',
            background: 'linear-gradient(to right, rgb(52, 211, 153), rgb(20, 184, 166))',
            animation: 'float-3 30s ease-in-out infinite'
          }}
        />
      </div>
      
      {/* Mesh Gradient Overlay */}
      <div 
        className="absolute inset-0 opacity-50"
        style={{
          background: `
            radial-gradient(circle at 20% 50%, rgba(59, 130, 246, 0.15) 0%, transparent 50%),
            radial-gradient(circle at 80% 80%, rgba(168, 85, 247, 0.15) 0%, transparent 50%),
            radial-gradient(circle at 40% 90%, rgba(16, 185, 129, 0.1) 0%, transparent 50%)
          `,
          animation: 'mesh-move 15s ease-in-out infinite'
        }}
      />
      
      {/* Noise Texture Overlay for Premium Feel */}
      <div 
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 400 400\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' /%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\' /%3E%3C/svg%3E")'
        }}
      />
    </div>
  );
};

// Compact Info Item for key-value display (3-column layout)
interface InfoItemProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  highlight?: boolean;
  badge?: string;
}

function InfoItem({ icon, label, value, highlight, badge }: InfoItemProps) {
  return (
    <div className={`p-3 rounded-lg border ${
      highlight 
        ? 'bg-gradient-to-br from-emerald-50 to-green-50 border-emerald-300 shadow-sm' 
        : 'bg-gray-50 border-gray-200'
    }`}>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">{label}</span>
        {badge && (
          <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">
            {badge}
          </span>
        )}
      </div>
      <p className={`text-sm font-semibold ml-6 ${
        highlight ? 'text-emerald-900' : 'text-gray-900'
      }`}>
        {value}
      </p>
    </div>
  );
}

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
    description: 'Extracting tables and payment details',
    estimatedDuration: 7000
  },
  {
    id: 'plan_detection',
    order: 4,
    title: 'Understanding Structure',
    description: 'Identifying document format and layout',
    estimatedDuration: 2000
  },
  {
    id: 'ai_field_mapping',
    order: 5,
    title: 'Mapping Fields',
    description: 'Intelligently mapping data fields',
    estimatedDuration: 3000
  },
  {
    id: 'preparing_results',
    order: 6,
    title: 'Finalizing Data',
    description: 'Preparing your commission data',
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

interface SummaryData {
  extractedCarrier?: string;
  extractedDate?: string;
  brokerCompany?: string;
  companyCount?: number;
  totalAmount?: number;
  brokerId?: string;
  brokerIdConfidence?: number;
  paymentType?: string;
  topContributors?: Array<{ name: string; amount: string }>;
  commissionStructure?: string;
  censusCount?: string;
  billingPeriods?: string;
}

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
  onCancel,
  summaryContent,
  metadataContent
}: SummaryProgressLoaderProps) {
  
  const [summaryData, setSummaryData] = useState<SummaryData>({});
  
  // Parse metadata content as it arrives
  useEffect(() => {
    if (metadataContent) {
      try {
        const parsed = JSON.parse(metadataContent);
        setSummaryData(prev => ({
          ...prev,
          extractedCarrier: parsed.carriername || parsed.carrier_name,
          extractedDate: parsed.statementdate || parsed.statement_date,
          brokerCompany: parsed.brokercompany || parsed.broker_company,
        }));
      } catch (e) {
        console.error('Failed to parse metadata', e);
      }
    }
  }, [metadataContent]);

  // Parse summary content for additional data
  useEffect(() => {
    if (summaryContent) {
      try {
        const parsed = JSON.parse(summaryContent);
        setSummaryData(prev => ({
          ...prev,
          // Core fields from structured_data (prioritize if present)
          extractedCarrier: parsed.carrier_name || prev.extractedCarrier,
          extractedDate: parsed.statement_date || prev.extractedDate,
          brokerCompany: parsed.broker_company || prev.brokerCompany,
          // Additional fields
          companyCount: parsed.company_count || parsed.companyCount,
          totalAmount: parsed.total_amount ? parseFloat(parsed.total_amount) : parsed.totalAmount,
          brokerId: parsed.broker_id || parsed.brokerId,
          brokerIdConfidence: parsed.broker_id_confidence || parsed.brokerIdConfidence,
          paymentType: parsed.payment_type || parsed.paymentType,
          topContributors: parsed.top_contributors || parsed.topContributors,
          commissionStructure: parsed.commission_structure || parsed.commissionStructure,
          censusCount: parsed.census_count || parsed.censusCount,
          billingPeriods: parsed.billing_periods || parsed.billingPeriods,
        }));
      } catch (e) {
        // If not JSON, ignore
        console.debug('Summary content is not JSON, skipping parse');
      }
    }
  }, [summaryContent]);

  if (!isVisible) return null;
  
  // Animation variants
  const pulseAnimation = {
    scale: [1, 1.2, 1],
    opacity: [0.3, 0.5, 0.3],
  };

  const completionAnimation = {
    initial: { scale: 0.8, opacity: 0 },
    animate: { scale: 1, opacity: 1 },
    transition: { 
      type: "spring",
      stiffness: 200,
      damping: 15
    }
  };
  
  return (
    <div className="fixed inset-0 z-50 overflow-auto flex items-center justify-center">
      
      {/* Animated Background Layers */}
      <AnimatedBackground />
      
      {/* Three-Column Layout Container - Vertically Centered */}
      <div className="w-full p-4 md:p-8 relative z-10">
        
        <div className="max-w-[1600px] mx-auto">
          
          {/* Three-Column Grid - Steps | PDF | Key Info - 70% Height */}
          <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr_350px] gap-4 h-[70vh]">
            
            {/* ============== COLUMN 1: STEPS (Left) ============== */}
            <div className="space-y-3 overflow-y-auto pr-2">
              
              {/* Compact Progress Steps */}
              <div className="glass-card-premium rounded-xl shadow-sm p-3">
                <h3 className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-2">
                  <Clock className="w-3 h-3" />
                  Extraction Progress
                </h3>
                
                <div className="space-y-2">
                  {UPLOAD_STEPS.map((step, index) => {
                    const isCompleted = index < currentStep - 1;
                    const isCurrent = index === currentStep - 1;
                    
                    return (
                      <div key={step.id} className="flex items-center gap-2">
                        {/* Compact icon */}
                        <div className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${
                          isCompleted ? 'bg-green-500' : isCurrent ? 'bg-blue-500 animate-pulse' : 'bg-gray-200'
                        }`}>
                          {isCompleted ? (
                            <CheckCircle2 className="w-3 h-3 text-white" />
                          ) : (
                            <div className="w-1.5 h-1.5 bg-white rounded-full" />
                          )}
                        </div>
                        
                        {/* Step text */}
                        <p className={`text-xs font-medium ${
                          isCurrent ? 'text-gray-900' : 'text-gray-500'
                        }`}>
                          {step.title}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
              
              {/* File Metadata Card */}
              {uploadedFile && (
                <div className="glass-card-premium rounded-xl shadow-sm p-3">
                  <h3 className="text-xs font-semibold text-gray-700 mb-1 flex items-center gap-2">
                    <FileText className="w-3 h-3" />
                    Document
                  </h3>
                  <p className="text-xs text-gray-900 font-medium truncate">{uploadedFile.name}</p>
                  <p className="text-[10px] text-gray-500 mt-1">
                    {(uploadedFile.size / (1024 * 1024)).toFixed(1)} MB
                  </p>
                </div>
              )}
            </div>
            
            {/* ============== COLUMN 2: PDF PREVIEW (Center) ============== */}
            <div className="glass-card-premium rounded-2xl shadow-xl overflow-hidden flex flex-col">
              {pdfUrl ? (
                <>
                  {/* Header with file name */}
                  <div className="px-4 py-2 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-gray-600" />
                      <p className="text-xs font-medium text-gray-700 truncate max-w-[400px]">
                        {uploadedFile?.name || 'Document Preview'}
                      </p>
                    </div>
                    <a
                      href={pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                    >
                      Open Full Screen
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  </div>
                  
                  {/* PDF iframe - full height */}
                  <div className="flex-1 relative bg-gray-100">
                    <iframe
                      src={pdfUrl}
                      className="absolute inset-0 w-full h-full"
                      title="Document Preview"
                      style={{ border: 'none' }}
                    />
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center bg-gray-50">
                  <div className="text-center">
                    <FileText className="w-16 h-16 text-gray-300 mx-auto mb-3" />
                    <p className="text-sm text-gray-500">Preparing document preview...</p>
                    <div className="mt-3 flex justify-center">
                      <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-500 border-t-transparent" />
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            {/* ============== COLUMN 3: KEY INFORMATION (Right) ============== */}
            <div className="glass-card-premium rounded-2xl shadow-xl overflow-hidden flex flex-col">
              
              {/* Header */}
              <div className="px-4 py-3 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
                <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-blue-600" />
                  Document Intelligence
                </h3>
              </div>
              
              {/* Scrollable key-value pairs */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                
                {/* Broker ID */}
                {summaryData.brokerId && (
                  <InfoItem
                    icon={<Zap className="w-4 h-4 text-amber-500" />}
                    label="Broker ID"
                    value={summaryData.brokerId}
                    badge={summaryData.brokerIdConfidence && summaryData.brokerIdConfidence > 0.9 ? "High Confidence" : undefined}
                  />
                )}
                
                {/* Total Amount - HIGHLIGHTED */}
                {summaryData.totalAmount !== undefined && (
                  <InfoItem
                    icon={<TrendingUp className="w-4 h-4 text-emerald-600" />}
                    label="Total Commission"
                    value={`$${summaryData.totalAmount.toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    })}`}
                    highlight={true}
                  />
                )}
                
                {/* Carrier */}
                {summaryData.extractedCarrier && (
                  <InfoItem
                    icon={<Building2 className="w-4 h-4 text-blue-600" />}
                    label="Carrier"
                    value={summaryData.extractedCarrier}
                  />
                )}
                
                {/* Broker Company */}
                {summaryData.brokerCompany && (
                  <InfoItem
                    icon={<Building2 className="w-4 h-4 text-purple-600" />}
                    label="Broker"
                    value={summaryData.brokerCompany}
                  />
                )}
                
                {/* Statement Date */}
                {summaryData.extractedDate && (
                  <InfoItem
                    icon={<Clock className="w-4 h-4 text-green-600" />}
                    label="Statement Date"
                    value={new Date(summaryData.extractedDate).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  />
                )}
                
                {/* Payment Type */}
                {summaryData.paymentType && (
                  <InfoItem
                    icon={<Zap className="w-4 h-4 text-indigo-600" />}
                    label="Payment Type"
                    value={summaryData.paymentType}
                  />
                )}
                
                {/* Company Count */}
                {summaryData.companyCount !== undefined && (
                  <InfoItem
                    icon={<Layers className="w-4 h-4 text-orange-600" />}
                    label="Companies"
                    value={summaryData.companyCount.toString()}
                  />
                )}
                
                {/* Top Contributors (if available) */}
                {summaryData.topContributors && summaryData.topContributors.length > 0 && (
                  <div className="pt-2 border-t border-gray-100">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="w-4 h-4 text-gray-600" />
                      <p className="text-xs font-semibold text-gray-700">Top Contributors</p>
                    </div>
                    <div className="space-y-1.5 ml-6">
                      {summaryData.topContributors.slice(0, 3).map((contributor, idx) => (
                        <div key={idx} className="flex justify-between text-[11px]">
                          <span className="text-gray-700 truncate">{contributor.name}</span>
                          <span className="font-semibold text-gray-900">${contributor.amount}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Commission Structure */}
                {summaryData.commissionStructure && (
                  <InfoItem
                    icon={<Layers className="w-4 h-4 text-cyan-600" />}
                    label="Commission Structure"
                    value={summaryData.commissionStructure}
                  />
                )}
                
                {/* Census Count */}
                {summaryData.censusCount && (
                  <InfoItem
                    icon={<FileText className="w-4 h-4 text-slate-600" />}
                    label="Census Count"
                    value={summaryData.censusCount}
                  />
                )}
                
                {/* Billing Periods */}
                {summaryData.billingPeriods && (
                  <InfoItem
                    icon={<Clock className="w-4 h-4 text-teal-600" />}
                    label="Billing Periods"
                    value={summaryData.billingPeriods}
                  />
                )}
                
              </div>
            </div>
          </div>
          
        </div>
        
      </div>
      
    </div>
  );
}

