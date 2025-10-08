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
  Shield
} from 'lucide-react';
import EnhancedProgressLoader from '../../components/ui/EnhancedProgressLoader';
import toast from 'react-hot-toast';
import axios from 'axios';
import { WebSocketService, ProgressUpdate } from '../../services/websocketService';

interface BeautifulUploadZoneProps {
  onParsed: (result: {
    tables: any[],
    upload_id?: string,
    extraction_id?: string,
    file_name: string,
    file: File,
    quality_summary?: any,
    extraction_config?: any,
    format_learning?: any,
    gcs_url?: string,
    gcs_key?: string,
    extracted_carrier?: string,
    extracted_date?: string,
    document_metadata?: any
  }) => void;
  disabled?: boolean;
  companyId: string;
  selectedStatementDate?: any;
  extractionMethod?: string;
  onExtractionMethodChange?: (method: string) => void;
}


export default function BeautifulUploadZone({
  onParsed,
  disabled = false,
  companyId,
  selectedStatementDate,
  extractionMethod,
  onExtractionMethodChange
}: BeautifulUploadZoneProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [currentStage, setCurrentStage] = useState('');
  const [stageProgress, setStageProgress] = useState(0);
  const [stageMessage, setStageMessage] = useState('');
  const [estimatedTime, setEstimatedTime] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadId, setUploadId] = useState<string | null>(null);
  const wsServiceRef = useRef<WebSocketService | null>(null);

  // FIXED: Proper click handler implementation
  const handleUploadClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (disabled || isUploading) return;
    
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.xlsx,.xls,.xlsm,.xlsb';
    input.multiple = false;
    
    input.onchange = (event) => {
      const files = (event.target as HTMLInputElement).files;
      if (files && files.length > 0) {
        handleFileUpload([files[0]]);
      }
    };
    
    input.click();
  }, [disabled, isUploading]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      handleFileUpload(acceptedFiles);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.ms-excel.sheet.macroEnabled.12': ['.xlsm'],
      'application/vnd.ms-excel.sheet.binary.macroEnabled.12': ['.xlsb']
    },
    multiple: false,
    disabled: disabled || isUploading,
    noClick: true, // CRITICAL: Disable default click, handle manually
    noKeyboard: true
  });

  // ENHANCED: Real-time WebSocket integration
  const initializeWebSocket = useCallback(async (uploadId: string) => {
    try {
      console.log('Initializing WebSocket for upload_id:', uploadId);
      wsServiceRef.current = new WebSocketService({
        uploadId,
        onProgress: (progressData: ProgressUpdate) => {
          console.log('WebSocket progress update received:', progressData);
          setCurrentStage(progressData.progress?.stage || '');
          setStageProgress(progressData.progress?.progress_percentage || 0);
          setStageMessage(progressData.progress?.message || '');
          setEstimatedTime(progressData.progress?.stage_details?.estimated_duration || '');
        },
        onError: (errorData: ProgressUpdate) => {
          console.log('WebSocket error received:', errorData);
          setError(getCommissionSpecificErrorMessage(errorData.error?.message || 'Unknown error', uploadedFile?.name || ''));
          setIsUploading(false);
        },
        onCompletion: (result: ProgressUpdate) => {
          console.log('WebSocket completion received:', result);
          console.log('WebSocket completion result.tables:', result.result?.tables);
          setIsUploading(false);
          if (result.result) {
            // Use UUID from backend response, not the temporary uploadId
            const backendUploadId = (result.result as any).upload_id || (result.result as any).extraction_id || uploadId;
            
            // Update local uploadId state with the UUID from backend
            if (backendUploadId !== uploadId) {
              setUploadId(backendUploadId);
            }
            
            onParsed({
              tables: result.result.tables || [],
              upload_id: backendUploadId,
              extraction_id: (result.result as any).extraction_id, // Add extraction_id (UUID)
              file_name: uploadedFile?.name || '',
              file: uploadedFile!,
              quality_summary: result.result.quality_summary,
              extraction_config: result.result.metadata,
              gcs_url: result.result.gcs_url, // Add GCS URL for PDF preview
              gcs_key: result.result.gcs_key, // Add GCS key as backup
              extracted_carrier: (result.result as any).extracted_carrier,
              extracted_date: (result.result as any).extracted_date,
              document_metadata: (result.result as any).document_metadata
            });
          }
        },
        onConnectionEstablished: () => {
          console.log('🎉 WebSocket connection established for upload_id:', uploadId);
          console.log('WebSocket connection details:', {
            uploadId,
            connectionStatus: wsServiceRef.current?.getConnectionStatus(),
            timestamp: new Date().toISOString()
          });
        }
      });

      await wsServiceRef.current.connect();
      console.log('WebSocket connection successful for upload_id:', uploadId);
      
      // Test the connection to verify it's working
      const connectionTest = await wsServiceRef.current.testConnection();
      console.log('WebSocket connection test result:', connectionTest);
    } catch (error) {
      console.error('WebSocket connection failed for upload_id:', uploadId, error);
      // Continue without WebSocket
    }
  }, [uploadedFile, onParsed]);

  // ENHANCED: Commission-specific error handling
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

    try {
      // Generate upload ID
      const newUploadId = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      setUploadId(newUploadId);

      // Initialize WebSocket connection
      await initializeWebSocket(newUploadId);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('company_id', companyId);
      formData.append('extraction_method', 'mistral');
      formData.append('upload_id', newUploadId);
      
      if (selectedStatementDate) {
        formData.append('statement_date', selectedStatementDate);
      }

      // Start upload with progress tracking
      const response = await axios.post('/api/extract-tables-smart/', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        withCredentials: true,  // CRITICAL FIX: Ensure cookies are sent
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress(progress);
          }
        },
      });

      // If WebSocket is not working, handle response directly
      // Check if WebSocket connection is actually established
      const wsConnected = wsServiceRef.current && wsServiceRef.current.getConnectionStatus().isConnected;
      
      console.log('WebSocket connection status:', {
        wsServiceExists: !!wsServiceRef.current,
        wsConnected,
        connectionStatus: wsServiceRef.current?.getConnectionStatus()
      });
      
      if (!wsConnected) {
        console.log('WebSocket not connected, handling response directly');
        setIsUploading(false);
        if (response.data.success) {
          console.log('BeautifulUploadZone: API response data:', response.data);
          console.log('BeautifulUploadZone: Tables from API:', response.data.tables);
          
          // Use UUID from backend response
          const backendUploadId = response.data.upload_id || response.data.extraction_id || newUploadId;
          
          // Update local uploadId state with the UUID from backend
          if (backendUploadId !== newUploadId) {
            setUploadId(backendUploadId);
          }
          
          onParsed({
            tables: response.data.tables || [],
            upload_id: backendUploadId,
            extraction_id: response.data.extraction_id, // Add extraction_id (UUID)
            file_name: response.data.file_name || file.name,
            file: file,
            quality_summary: response.data.quality_summary,
            extraction_config: response.data.metadata,
            gcs_url: response.data.gcs_url, // Add GCS URL for PDF preview
            gcs_key: response.data.gcs_key, // Add GCS key as backup
            extracted_carrier: response.data.extracted_carrier,
            extracted_date: response.data.extracted_date,
            document_metadata: response.data.document_metadata
          });
        } else {
          setError(getCommissionSpecificErrorMessage(response.data.error || 'Processing failed', file.name));
        }
      } else {
        console.log('WebSocket connected, waiting for progress updates');
        // WebSocket is connected, let it handle the progress updates
        // Don't set isUploading to false here - let WebSocket handle completion
        
        // Add a fallback timeout in case WebSocket doesn't send completion
        setTimeout(() => {
          if (isUploading) {
            console.log('WebSocket timeout - falling back to direct response handling');
            setIsUploading(false);
            if (response.data.success) {
              // Use UUID from backend response
              const backendUploadId = response.data.upload_id || response.data.extraction_id || newUploadId;
              
              // Update local uploadId state with the UUID from backend
              if (backendUploadId !== newUploadId) {
                setUploadId(backendUploadId);
              }
              
              onParsed({
                tables: response.data.tables || [],
                upload_id: backendUploadId,
                extraction_id: response.data.extraction_id, // Add extraction_id (UUID)
                file_name: response.data.file_name || file.name,
                file: file,
                quality_summary: response.data.quality_summary,
                extraction_config: response.data.metadata,
                gcs_url: response.data.gcs_url, // Add GCS URL for PDF preview
                gcs_key: response.data.gcs_key, // Add GCS key as backup
                extracted_carrier: response.data.extracted_carrier,
                extracted_date: response.data.extracted_date,
                document_metadata: response.data.document_metadata
              });
            }
          }
        }, 30000); // 30 second timeout
      }

    } catch (error: any) {
      setIsUploading(false);
      
      // Disconnect websocket if connected
      if (wsServiceRef.current) {
        wsServiceRef.current.disconnect();
      }
      
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
    if (wsServiceRef.current) {
      wsServiceRef.current.disconnect();
    }
    
    // Cancel the extraction on the backend if we have an upload ID
    if (uploadId) {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/cancel-extraction/${uploadId}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
            'Content-Type': 'application/json',
          },
        });
        
        if (response.ok) {
          toast.success('Extraction cancelled successfully');
        } else {
          console.warn('Failed to cancel extraction on backend:', response.statusText);
        }
      } catch (error) {
        console.error('Error cancelling extraction:', error);
        // Don't show error toast for cancellation failures as user is already cancelling
      }
    }
    
    setIsUploading(false);
    setUploadProgress(0);
    setCurrentStage('');
    setStageProgress(0);
    setError(null);
    setUploadedFile(null);
  };

  const handleRetry = () => {
    if (uploadedFile) {
      handleFileUpload([uploadedFile]);
    }
  };

  // Cleanup WebSocket on unmount
  useEffect(() => {
    return () => {
      if (wsServiceRef.current) {
        wsServiceRef.current.disconnect();
      }
    };
  }, []);

  // ENHANCED: Show loader instead of upload zone when processing
  if (isUploading) {
    return (
      <div className="w-full">
        <EnhancedProgressLoader
          isVisible={true}
          progress={stageProgress}
          stage={currentStage}
          message={stageMessage}
          estimatedTime={estimatedTime}
          fileName={uploadedFile?.name}
          onCancel={handleCancel}
          onRetry={error ? handleRetry : undefined}
          error={error}
        />
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto">

      {/* FIXED: Upload Zone with proper click handling */}
      <div
        {...getRootProps()}
        onClick={handleUploadClick} // CRITICAL: Manual click handler
        className={`
          relative border-2 border-dashed rounded-2xl p-12 text-center transition-all duration-300 cursor-pointer
          ${isDragActive 
            ? 'border-blue-400 bg-blue-50 scale-[1.02]' 
            : 'border-gray-300 bg-gray-50 hover:border-blue-300 hover:bg-blue-25'
          }
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        <input {...getInputProps()} />
        
        <AnimatePresence mode="wait">
          {isDragActive ? (
            <motion.div
              key="drag-active"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-4"
            >
              <div className="w-16 h-16 mx-auto bg-blue-500 rounded-full flex items-center justify-center">
                <Upload className="w-8 h-8 text-white animate-bounce" />
              </div>
              <p className="text-xl font-semibold text-blue-600">Drop your commission files here!</p>
            </motion.div>
          ) : (
            <motion.div
              key="default"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-6"
            >
              <div className="w-20 h-20 mx-auto bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                <FileSpreadsheet className="w-10 h-10 text-white" />
              </div>
              
              <div>
                <h3 className="text-2xl font-bold text-gray-800 mb-2">
                  Upload Commission Statements
                </h3>
                <p className="text-gray-600 text-lg">
                  Drag & drop your files here or click to browse
                </p>
              </div>

              <motion.button
                type="button"
                className="px-8 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg font-semibold hover:shadow-lg transition-all duration-200"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                disabled={disabled}
              >
                Select Files
              </motion.button>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-500">
                <div className="flex items-center justify-center gap-2">
                  <Shield className="w-4 h-4" />
                  <span>Secure Processing</span>
                </div>
                <div className="flex items-center justify-center gap-2">
                  <FileText className="w-4 h-4" />
                  <span>PDF & Excel Supported</span>
                </div>
                <div className="flex items-center justify-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  <span>AI-Powered Extraction</span>
                </div>
              </div>

              <div className="text-xs text-gray-400 space-y-1">
                <p><strong>Supported formats:</strong> PDF, XLSX, XLS, XLSM, XLSB</p>
                <p><strong>Max file size:</strong> 50MB per file</p>
                <p><strong>Supported carriers:</strong> Aetna, BCBS, Cigna, Humana, UHC</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Error Display */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg"
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-red-800 font-medium mb-1">Upload Error</p>
              <p className="text-red-700 text-sm">{error}</p>
              <button
                onClick={handleRetry}
                className="mt-2 px-3 py-1 bg-red-100 text-red-700 rounded text-sm hover:bg-red-200 transition-colors"
              >
                Try Again
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}