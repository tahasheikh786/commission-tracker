'use client'

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
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
    company_id?: string
  }) => void;
  selectedStatementDate?: any;
  extractionMethod?: string;
  onExtractionMethodChange?: (method: string) => void;
  onContinue?: () => void;
  environmentId?: string | null;
}

export default function SummaryUploadZone({
  onParsed,
  selectedStatementDate,
  extractionMethod,
  onExtractionMethodChange,
  onContinue,
  environmentId
}: SummaryUploadZoneProps) {
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

  // Memoize callbacks to prevent unnecessary re-renders
  const handleExtractionComplete = useCallback((results: any) => {
    // ✅ AUTOMATIC FLOW: Close loader and proceed with results
    setIsUploading(false);
    if (results && results.success) {
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
        company_id: results.company_id
      });
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
      formData.append('extraction_method', 'smart');  // Use 'smart' to default to Claude AI
      formData.append('upload_id', newUploadId);
      formData.append('use_enhanced', 'true');  // ⭐ ENABLE enhanced 3-phase extraction for Google Gemini-quality summaries
      
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
      
      // Handle 409 conflict (duplicate file) specifically
      if (error.response?.status === 409) {
        const conflictData = error.response?.data;
        if (conflictData?.status === 'duplicate_detected') {
          const duplicateInfo = conflictData.duplicate_info;
          const uploadDate = duplicateInfo?.existing_upload_date_formatted || 'a previous date';
          
          // Set user-friendly error message
          const errorMsg = `This file was already uploaded on ${uploadDate}. Please upload a different file or check your existing uploads.`;
          setError(errorMsg);
          
          // Show toast notification
          toast.error('Duplicate File Detected', {
            duration: 5000,
            icon: '⚠️',
          });
          
          return;
        }
      }
      
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
          summaryContent={wsProgress.conversationalSummary || null}
          metadataContent={(() => {
            return `
### File Information
**Original File**: ${uploadedFile?.name || 'Unknown'}
**File Size**: ${uploadedFile ? (uploadedFile.size / 1024 / 1024).toFixed(2) + ' MB' : 'Unknown'}
**File Type**: ${uploadedFile?.type || 'Unknown'}
**Upload Date**: ${uploadDate || 'Unknown'}
**Processing Status**: ${isN8nLoading ? '🔄 In Progress' : '✅ Completed'}

### PDF Processing Details
${extractedPages ? `
**Pages Extracted**: First 3 pages (${uploadedFile?.name} had more than 3 pages)
**Extracted File**: ${extractedPages.name}
**Extraction Method**: PDF-lib automatic extraction
**Processing Type**: Partial document analysis
` : `
**Pages**: Using original file (${uploadedFile?.name} - ${totalPages || 'Unknown'} pages)
**Processing**: Full document analysis
**Processing Type**: Complete document analysis
`}

### AI Analysis Details
**Analysis Date**: ${completionDate || uploadDate || 'Unknown'}
**Processing Time**: Real-time analysis
**Data Quality**: High confidence extraction

---
*Analysis ${isN8nLoading ? 'started' : 'completed'} at ${isN8nLoading ? uploadDate : completionDate || 'Unknown'}*`;
          })()}
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
                <p className="text-red-700 dark:text-red-300 mb-4">{error}</p>
                <button
                  onClick={handleRetry}
                  className="px-4 py-2 bg-red-100 dark:bg-red-800/30 text-red-700 dark:text-red-200 rounded-lg text-sm hover:bg-red-200 dark:hover:bg-red-800/50 transition-colors"
                >
                  Try Again
                </button>
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
          
          {/* Security & Compliance Card */}
          <div className="max-w-3xl mx-auto">
            <div className="bg-gradient-to-r from-green-50 via-emerald-50 to-teal-50 dark:from-green-900/20 dark:via-emerald-900/20 dark:to-teal-900/20 rounded-2xl border-2 border-green-200 dark:border-green-700 p-6 shadow-lg">
              <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                {/* Left: Security Badge */}
                <div className="flex items-center space-x-4">
                  <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-md">
                    <Shield className="w-7 h-7 text-white" />
                  </div>
                  <div>
                    <p className="text-lg font-bold text-gray-900 dark:text-white">Bank-Level Security</p>
                    <p className="text-sm text-gray-700 dark:text-gray-300">SOC 2 Type II Certified • GDPR Compliant</p>
                  </div>
                </div>
                
                {/* Right: Stats */}
                <div className="flex items-center gap-8">
                  <div className="text-center">
                    <p className="text-3xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">99.9%</p>
                    <p className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">Uptime</p>
                  </div>
                  <div className="h-12 w-px bg-gray-300 dark:bg-gray-600"></div>
                  <div className="text-center">
                    <p className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">24/7</p>
                    <p className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">Support</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
