'use client'

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import {
  Upload,
  FileText,
  FileSpreadsheet,
  X,
  CheckCircle,
  AlertCircle,
  Shield,
  Building2,
  ArrowRight,
  Sparkles,
  Zap
} from 'lucide-react';
import SummaryProgressLoader from './upload/SummaryProgressLoader ';
import { useProgressWebSocket } from '../hooks/useProgressWebSocket';
import toast from 'react-hot-toast';
import axios from 'axios';

// Premium UI Components
import PremiumUploadHero from './premium/PremiumUploadHero';
import PremiumUploadZone from './premium/PremiumUploadZone';

interface SummaryUploadZoneProps {
  onParsed: (result: {
    tables: any[],
    upload_id?: string,
    file_name: string,
    file: File,
    quality_summary?: any,
    extraction_config?: any,
    format_learning?: any,
    gcs_url?: string,
    gcs_key?: string,
    extracted_carrier?: string,
    extracted_date?: string,
    document_metadata?: any,
    ai_intelligence?: any,
    carrier_id?: string,
    company_id?: string,
    can_automate?: boolean,
    plan_types?: string[],
    extraction_id?: string,
    conversational_summary?: string | null,
    structured_summary?: any,
    summary_data?: any,
    extracted_total?: number,
    extracted_invoice_total?: number
  }) => void;
  selectedStatementDate?: any;
  extractionMethod?: string;
  onExtractionMethodChange?: (method: string) => void;
  onContinue?: () => void;
  environmentId?: string | null;
}

// AutomationStep component for automation UI
function AutomationStep({ icon, label, active }: { 
  icon: string; 
  label: string; 
  active: boolean 
}) {
  return (
    <div className={`flex items-center gap-3 transition-all duration-300 
                    ${active ? 'opacity-100' : 'opacity-40'}`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center 
                      text-sm font-semibold
                      ${active 
                        ? 'bg-green-500 text-white' 
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-500'}`}>
        {active ? icon : '○'}
      </div>
      <span className={`text-sm ${active 
                        ? 'text-gray-900 dark:text-white font-medium' 
                        : 'text-gray-500 dark:text-gray-400'}`}>
        {label}
      </span>
    </div>
  );
}

export default function SummaryUploadZone({
  onParsed,
  selectedStatementDate,
  extractionMethod,
  onExtractionMethodChange,
  onContinue,
  environmentId
}: SummaryUploadZoneProps) {
  const router = useRouter();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [currentStage, setCurrentStage] = useState('');
  const [stageProgress, setStageProgress] = useState(0);
  const [stageMessage, setStageMessage] = useState('');
  const [estimatedTime, setEstimatedTime] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [localPdfUrl, setLocalPdfUrl] = useState<string | null>(null);
  const [extractedPages, setExtractedPages] = useState<File | null>(null);
  const [totalPages, setTotalPages] = useState<number | null>(null);
  const [uploadDate, setUploadDate] = useState<string | null>(null);
  const [completionDate, setCompletionDate] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);
  const [n8nResponse, setN8nResponse] = useState<any>(null);
  const [isN8nLoading, setIsN8nLoading] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [automating, setAutomating] = useState(false);
  const [automationProgress, setAutomationProgress] = useState(0);
  const [automationError, setAutomationError] = useState<string | null>(null);

  // Automation function to trigger auto-approval
  async function triggerAutoApproval(params: {
    uploadId: string;
    carrierId: string;
    learnedFormat: any;
    extractedTotal: number;
    statementDate: string;
    fullResults: any; // Add this for fallback
  }) {
    try {
      setAutomating(true);
      setAutomationProgress(0);
      
      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setAutomationProgress(prev => Math.min(prev + 20, 90));
      }, 500);
      
      const apiBase = `${process.env.NEXT_PUBLIC_API_URL}/api/auto-approve`;
      const litePayload = {
        upload_id: params.uploadId,
        carrier_id: params.carrierId,
        learned_format: params.learnedFormat,
        extracted_total: params.extractedTotal,
        statement_date: params.statementDate
      };
      const fullPayload = {
        upload_id: params.uploadId,
        carrier_id: params.carrierId,
        learned_format: params.learnedFormat,
        extracted_total: params.extractedTotal,
        statement_date: params.statementDate,
        upload_metadata: params.fullResults?.upload_metadata || {},
        raw_data: params.fullResults?.tables || [],
        document_metadata: params.fullResults?.document_metadata || {},
        format_learning: params.fullResults?.format_learning || {}
      };

      let response;
      try {
        response = await axios.post(
          `${apiBase}/process-lite`,
          litePayload,
          { withCredentials: true }
        );
      } catch (liteError: any) {
        const status = liteError?.response?.status;
        const shouldFallback = status === 404 || status === 422;
        if (!shouldFallback) {
          throw liteError;
        }
        console.warn("Auto-approval lite fallback triggered:", status);
        response = await axios.post(
          `${apiBase}/process`,
          fullPayload,
          { withCredentials: true }
        );
      }
      
      clearInterval(progressInterval);
      setAutomationProgress(100);
      
      if (response.data.success) {
        const needsReview = response.data.needs_review;
        
        // Show toast
        if (needsReview) {
          toast(
            `⚠️ Statement processed automatically but totals don't match. Please review.`,
            { 
              duration: 6000,
              icon: '⚠️',
              style: {
                background: '#FEF3C7',
                color: '#92400E',
              }
            }
          );
        } else {
          toast.success(
            `Statement automatically approved! ✨`,
            { duration: 4000 }
          );
        }
        
        // Wait a moment for user to see the success
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Navigate to Carrier Statements
        const carrierName = response.data.carrier_name;
        router.push(`/?tab=carriers&carrier=${encodeURIComponent(carrierName)}`);
      }
    } catch (error: any) {
      console.error("Auto-approval failed:", error);
      setAutomationError(error.response?.data?.detail || error.message);
      toast.error(`Automation failed. Opening manual editor...`);
      
      // Wait a moment before fallback
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Fallback to manual flow
      setAutomating(false);
      const results = params.fullResults;
      
      // Create a dummy file object if uploadedFile is null
      const fileToUse = uploadedFile || new File([], results.file_name || 'statement.pdf', {
        type: 'application/pdf'
      });
      
      onParsed({
        tables: results.tables || [],
        upload_id: results.upload_id,
        file_name: results.file_name || fileToUse.name || '',
        file: fileToUse,
        quality_summary: results.quality_summary,
        extraction_config: results.extraction_config,
        gcs_url: results.gcs_url,
        gcs_key: results.gcs_key,
        extracted_carrier: results.extracted_carrier,
        extracted_date: results.extracted_date,
        document_metadata: results.document_metadata,
        ai_intelligence: results.ai_intelligence,
        carrier_id: results.carrier_id,
        company_id: results.company_id,
        format_learning: results.format_learning,
        plan_types: results.plan_types || [],
        extraction_id: results.extraction_id,
        can_automate: false,  // Force manual due to error
        conversational_summary: results.conversational_summary || null,
        structured_summary: results.structured_summary || results.summary_data || null,
        summary_data: results.summary_data || null,
        extracted_total: results.extracted_total,
        extracted_invoice_total: results.extracted_invoice_total
      });
    } finally {
      setAutomating(false);
    }
  }

  // Memoize callbacks to prevent unnecessary re-renders
  const handleExtractionComplete = useCallback((results: any) => {
    // ✅ AUTOMATIC FLOW: Close loader and proceed with results
    setIsUploading(false);
    if (results && results.success) {
      // Check for format learning and automation eligibility
      const formatLearning = results.format_learning || results.formatlearning;
      const canAutomate = formatLearning?.can_automate || formatLearning?.canAutomate;
      const documentMetadata = results.document_metadata || results.documentmetadata;
      
      // Check if we can automate
      if (canAutomate && 
          documentMetadata?.statement_date && 
          results.carrier_id &&
          formatLearning?.learned_format) {
        // AUTOMATION PATH
        console.log("🤖 Automation eligible - processing automatically...");
        
        // ✨ CURSOR FIX: Prefer extracted_total from main response over format learning
        // This ensures we use the most accurate total from document extraction
        const extractedTotal = results.extracted_total || 
                               results.extractedTotal || 
                               formatLearning.current_total_amount || 
                               0;
        
        console.log("🔍 Total amount sources:", {
          fromResults: results.extracted_total,
          fromFormatLearning: formatLearning.current_total_amount,
          using: extractedTotal
        });
        
        triggerAutoApproval({
          uploadId: results.upload_id,
          carrierId: results.carrier_id,
          learnedFormat: formatLearning.learned_format,
          extractedTotal: extractedTotal,
          statementDate: documentMetadata.statement_date,
          fullResults: results
        });
      } else {
        // MANUAL PATH
        console.log("👤 Manual review required:", formatLearning?.automation_reason);
        
        // Pass all results including format learning data
        onParsed({
          tables: results.tables || [],
          upload_id: results.upload_id,
          file_name: results.file_name || uploadedFile?.name || '',
          file: uploadedFile!,
          quality_summary: results.quality_summary,
          extraction_config: results.extraction_config,
          gcs_url: results.gcs_url,
          gcs_key: results.gcs_key,
          extracted_carrier: results.extracted_carrier,
          extracted_date: results.extracted_date,
          document_metadata: results.document_metadata,
          ai_intelligence: results.ai_intelligence,
          carrier_id: results.carrier_id,
          company_id: results.company_id,
          format_learning: formatLearning,  // Include format learning data
          can_automate: canAutomate,  // Include automation flag
          plan_types: results.plan_types || [],
          extraction_id: results.extraction_id,
          conversational_summary: results.conversational_summary || null,
          structured_summary: results.structured_summary || results.summary_data || null,
          summary_data: results.summary_data || null,
          extracted_total: results.extracted_total,
          extracted_invoice_total: results.extracted_invoice_total
        });
      }
    }
  }, [uploadedFile, onParsed]);
  
  const handleWebSocketError = useCallback((errorMsg: string) => {
    setError(errorMsg);
    setIsUploading(false);
  }, []);


  // No manual continue needed - extraction completes automatically
  
  // Use new WebSocket hook for premium progress tracking
  const { progress: wsProgress } = useProgressWebSocket({
    uploadId: uploadId || undefined,
    autoConnect: true,  // ✅ Auto-connect when uploadId changes
    onExtractionComplete: handleExtractionComplete,
    onSummarizeComplete: (metadata) => {
    
      // Store the complete metadata object, not just the summary
      setIsN8nLoading(false);
      setN8nResponse(metadata); // Store the complete metadata object (will be updated when enhanced summary arrives)
      setCompletionDate(new Date().toLocaleString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short'
      }));
      toast.success('File successfully summarized!');
    },
    onError: handleWebSocketError
  });

  // handleFileUpload is passed directly to PremiumUploadZone component

  // ✅ ORPHAN FIX: Prevent accidental page refresh during upload
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isUploading) {
        e.preventDefault();
        e.returnValue = 'Extraction in progress. Are you sure you want to leave?';
        return e.returnValue;
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isUploading]);

  // Commission-specific error handling
  const getCommissionSpecificErrorMessage = (error: string, fileName: string) => {
    const fileExt = fileName.split('.').pop()?.toLowerCase();
    
    if (error.includes('No tables found')) {
      return `No commission tables detected in ${fileName}. Please ensure your document contains commission statement tables with clear headers and data rows.`;
    }
    if (error.includes('Unsupported format')) {
      return `The file format .${fileExt} is not supported. Please upload PDF or Excel files containing commission statements from supported carriers.`;
    }
    if (error.includes('file too large')) {
      return `File size exceeds 50MB limit. Please compress your commission statement or split large files.`;
    }
    if (error.includes('corrupted') || error.includes('invalid')) {
      return `The file appears to be corrupted or invalid. Please try re-saving your commission statement and uploading again.`;
    }
    if (error.includes('carrier not supported')) {
      return `This carrier format is not yet supported. Currently supported: Aetna, Blue Cross Blue Shield, Cigna, Humana, United Healthcare.`;
    }
    
    return `Processing error: ${error}. Please check your commission statement format and try again.`;
  };

  const handleFileUpload = async (files: File[]) => {
    const file = files[0];
    if (!file) return;

    setUploadedFile(file);
    setIsUploading(true);
    setError(null);
    setUploadProgress(0);
    setCurrentStage('Initializing');
    setStageProgress(0);
    
    // Set upload date
    const uploadDateStr = new Date().toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short'
    });
    setUploadDate(uploadDateStr);
    
    // Generate local PDF URL for preview
    const localUrl = URL.createObjectURL(file);
    setLocalPdfUrl(localUrl);
    
    try {
      const newUploadId = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      setUploadId(newUploadId);

      // Small delay to allow WebSocket to connect before API call
      await new Promise(resolve => setTimeout(resolve, 500));

      // Start table extraction in parallel (full file)
      const formData = new FormData();
      formData.append('file', file); // Full file for table extraction
      formData.append('extraction_method', 'smart');  // Use 'smart' to route to GPT-5 Vision (primary) with Claude fallback
      formData.append('upload_id', newUploadId);
      formData.append('use_enhanced', 'true');  // ⭐ ENABLE GPT-5 Vision with enhanced structured outputs
      
      if (selectedStatementDate) {
        formData.append('statement_date', selectedStatementDate);
      }
      
      // Pass active environment ID to ensure upload is associated with correct environment
      if (environmentId) {
        formData.append('environment_id', environmentId);
      }

      const response = await axios.post('/api/extract-tables-smart/', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        withCredentials: true,
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress(progress);
          }
        },
      });

      // WebSocket will handle the progress updates automatically via useProgressWebSocket hook

    } catch (error: any) {
      setIsUploading(false);
      
      // ✅ Enhanced 409 duplicate handling - backend rejects duplicates immediately
      if (error.response?.status === 409) {
        const conflictData = error.response?.data;
        
        if (conflictData?.status === 'duplicate_detected') {
          const duplicateInfo = conflictData.duplicate_info;
          const uploadDate = duplicateInfo?.existing_upload_date_formatted || 'a previous date';
          
          // Set user-friendly error message
          const errorMsg = `This file was already uploaded on ${uploadDate}. Please upload a different file or check your existing uploads.`;
          setError(errorMsg);
          
          // ✅ Show prominent toast notification with enhanced styling
          toast.error('Duplicate File Detected', {
            duration: 5000,
            icon: '🔄',
          });
          
          return; // Stop here - don't proceed with upload
        }
      }
      
      // Handle other errors
      const errorMessage = error.response?.data?.error || error.message || 'Upload failed';
      setError(getCommissionSpecificErrorMessage(errorMessage, file.name));
      toast.error('Upload failed. Please try again.');
    }
  };

  const handleCancel = async () => {
    // Don't proceed if no upload ID
    if (!uploadId) {  
      return;
    }

    // Set cancelling state immediately for instant feedback
    setIsCancelling(true);

    // Show instant feedback
    toast.loading('Cancelling...', { id: 'cancel-extraction', duration: 1000 });
    
    try {
      // Call cancel API with timeout
      const response = await axios.post(
        `/api/cancel-extraction/${uploadId}`,
        {},
        {
          withCredentials: true,
          timeout: 5000  // 5 second timeout for instant response
        }
      );
      
      if (response.data.success) {
        // Immediate success feedback
        toast.dismiss('cancel-extraction');
        toast.success('✅ Cancelled successfully', { duration: 3000 });
        
        // Reset UI immediately - don't wait
        resetUploadState();
      }
      
    } catch (error: any) {
      toast.dismiss('cancel-extraction');
      
      if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        // Timeout - assume cancellation worked
        toast.success('Cancellation in progress', { duration: 3000 });
        resetUploadState();
      } else if (error.response?.status === 404) {
        // Already completed
        toast('Process already completed', { duration: 3000, icon: 'ℹ️' });
        resetUploadState();
      } else {
        toast.error(`Failed: ${error.response?.data?.detail || error.message}`);
      }
    } finally {
      setIsCancelling(false);
    }
  };

  const resetUploadState = () => {
    setIsUploading(false);
    setUploadProgress(0);
    setCurrentStage('');
    setStageProgress(0);
    setError(null);
    setUploadedFile(null);
    setExtractedPages(null);
    setTotalPages(null);
    setUploadDate(null);
    setCompletionDate(null);
    setIsResending(false);
    setN8nResponse(null);
    setUploadId(null);
    setIsCancelling(false);
    setAutomating(false);
    setAutomationProgress(0);
    setAutomationError(null);
    
    if (localPdfUrl) {
      URL.revokeObjectURL(localPdfUrl);
      setLocalPdfUrl(null);
    }
  };

  const handleRetry = () => {
    if (uploadedFile) {
      handleFileUpload([uploadedFile]);
    }
  };

  const handleReset = () => {
    setUploadedFile(null);
    setError(null);
    setUploadProgress(0);
    setCurrentStage('');
    setStageProgress(0);
    setExtractedPages(null);
    setTotalPages(null);
    setUploadDate(null);
    setCompletionDate(null);
    setIsResending(false);
    setN8nResponse(null);
    setIsCancelling(false);
    
    // Cleanup local PDF URL
    if (localPdfUrl) {
      URL.revokeObjectURL(localPdfUrl);
      setLocalPdfUrl(null);
    }
  };

  // Show custom automation UI when automating
  if (automating) {
    return (
      <div className="fixed inset-0 bg-white dark:bg-gray-900 z-50 
                      flex items-center justify-center">
        <div className="max-w-2xl w-full px-6">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-8">
            {/* Header with Robot Icon */}
            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-600 
                              rounded-2xl flex items-center justify-center">
                <svg 
                  className="w-8 h-8 text-white animate-pulse" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth="2" 
                    d="M13 10V3L4 14h7v7l9-11h-7z" 
                  />
                </svg>
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  🤖 Automating Your Upload
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                  Applying learned format and validating data...
                </p>
              </div>
            </div>
            
            {/* Progress Bar */}
            <div className="mb-6">
              <div className="flex justify-between text-sm text-gray-600 mb-2">
                <span>Progress</span>
                <span>{automationProgress}%</span>
              </div>
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-blue-500 to-purple-600 
                             transition-all duration-500"
                  style={{ width: `${automationProgress}%` }}
                />
              </div>
            </div>
            
            {/* Steps */}
            <div className="space-y-3">
              <AutomationStep 
                icon="✓" 
                label="Applying learned field mappings" 
                active={automationProgress >= 20} 
              />
              <AutomationStep 
                icon="✓" 
                label="Applying table corrections" 
                active={automationProgress >= 40} 
              />
              <AutomationStep 
                icon="✓" 
                label="Validating total amount" 
                active={automationProgress >= 60} 
              />
              <AutomationStep 
                icon="✓" 
                label="Calculating commissions" 
                active={automationProgress >= 80} 
              />
              <AutomationStep 
                icon="✓" 
                label="Finalizing approval" 
                active={automationProgress >= 100} 
              />
            </div>
            
            {/* Info */}
            <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg 
                            border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                💡 <strong>Smart Automation:</strong> This file matches a previously 
                learned format. We&apos;re applying the saved settings to speed up your workflow!
              </p>
            </div>
            
            {/* Error display */}
            {automationError && (
              <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg 
                              border border-red-200 dark:border-red-800">
                <p className="text-sm text-red-800 dark:text-red-200">
                  <strong>Error:</strong> {automationError}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // PREMIUM: Show premium loader with step-by-step progress when processing
  if (isUploading || isCancelling) {
    return (
      <div className="w-full h-full">
        <SummaryProgressLoader
          currentStep={wsProgress.currentStep}
          progress={wsProgress.percentage || stageProgress}
          estimatedTime={wsProgress.estimatedTimeRemaining || estimatedTime}
          conversationalSummary={wsProgress.conversationalSummary}
          isVisible={true}
          pdfUrl={localPdfUrl}
          onCancel={handleCancel}
          uploadedFile={uploadedFile ? { name: uploadedFile.name, size: uploadedFile.size } : null}
          summaryContent={wsProgress.summaryData ? JSON.stringify(wsProgress.summaryData) : (wsProgress.stageDetails ? JSON.stringify(wsProgress.stageDetails) : null)}
          metadataContent={wsProgress.stageDetails ? JSON.stringify(wsProgress.stageDetails) : null}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900" />
      
      {/* Grid Pattern Overlay */}
      <div 
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `
            linear-gradient(to right, #000 1px, transparent 1px),
            linear-gradient(to bottom, #000 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px'
        }}
      />

      {/* Main Content Container */}
      <div className="relative z-10 container mx-auto px-6 py-12">
        {/* Premium Hero Section */}
        <PremiumUploadHero />

        {/* Premium Upload Zone - BALANCED FOCAL POINT */}
        <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <PremiumUploadZone 
            onFileUpload={handleFileUpload}
            isUploading={isUploading}
          />
          
          {/* Inline Trust Signals - Right Below Upload */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-6 text-sm text-gray-600 dark:text-gray-300">
            <div className="flex items-center space-x-2">
              <Shield className="w-4 h-4 text-green-600" />
              <span className="font-medium">256-bit Encryption</span>
            </div>
            <div className="flex items-center space-x-2">
              <Zap className="w-4 h-4 text-blue-600" />
              <span className="font-medium">Instant Processing</span>
            </div>
            <div className="flex items-center space-x-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <span className="font-medium">99.9% Accuracy</span>
            </div>
            <div className="flex items-center space-x-2">
              <Shield className="w-4 h-4 text-purple-600" />
              <span className="font-medium">Bank-Level Security</span>
            </div>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 p-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl max-w-5xl mx-auto"
          >
            <div className="flex items-start gap-4">
              <AlertCircle className="w-6 h-6 text-red-500 flex-shrink-0 mt-1" />
              <div className="flex-1">
                <p className="text-red-800 dark:text-red-200 font-semibold mb-2 text-lg">Upload Error</p>
                <p className="text-red-700 dark:text-red-300">{error}</p>
                <p className="text-red-600 dark:text-red-400 text-sm mt-2">Please upload your file again to retry.</p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Supported Formats & Security - Below Upload */}
        <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
          {/* Supported File Formats */}
          <div className="text-center">
            <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-6">Supported File Formats</h3>
            <div className="flex items-center justify-center gap-12 flex-wrap">
              {/* PDF Format */}
              <div className="group">
                <div className="w-20 h-20 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center shadow-lg group-hover:shadow-xl transition-all duration-300 group-hover:scale-105">
                  <FileText className="w-10 h-10 text-white" />
                </div>
                <p className="text-base font-semibold text-gray-900 dark:text-white mb-1">PDF Documents</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">Commission statements in PDF</p>
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">Accepts: .pdf</p>
              </div>
              
              {/* Excel Format */}
              <div className="group">
                <div className="w-20 h-20 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center shadow-lg group-hover:shadow-xl transition-all duration-300 group-hover:scale-105">
                  <FileSpreadsheet className="w-10 h-10 text-white" />
                </div>
                <p className="text-base font-semibold text-gray-900 dark:text-white mb-1">Excel Spreadsheets</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">Commission data in Excel</p>
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">Accepts: .xlsx, .xls, .xlsm</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
