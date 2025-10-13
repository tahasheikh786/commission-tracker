'use client'

import React, { useState, useEffect, useRef } from 'react';
import { Download, ZoomIn, ZoomOut, FileText, ExternalLink, AlertCircle, RefreshCw } from 'lucide-react';

interface DocumentPreviewProps {
  uploaded: any;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
}

export default function DocumentPreview({ uploaded, zoom, onZoomIn, onZoomOut }: DocumentPreviewProps) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const mountedRef = useRef(true);
  const currentBlobUrlRef = useRef<string | null>(null);

  // Extract file information
  const fileName = uploaded?.file_name || uploaded?.fileName || 'document.pdf';
  const isPdf = fileName.toLowerCase().endsWith('.pdf');

  // Fetch PDF from backend proxy
  useEffect(() => {
    mountedRef.current = true;

    const fetchPdf = async () => {
      const gcsKey = uploaded?.gcs_key || uploaded?.file_name;
      
      if (!gcsKey) {
        console.warn('No GCS key found');
        setIsLoading(false);
        setError(true);
        return;
      }

      try {
        setIsLoading(true);
        setError(false);

        console.log('🔄 Fetching PDF from GCS:', gcsKey);
        
        // Use backend proxy to fetch PDF (avoids CORS)
        const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
        const proxyUrl = `${backendUrl}/api/pdf-proxy?gcs_key=${encodeURIComponent(gcsKey)}`;
        console.log('📡 Proxy URL:', proxyUrl);
        
        const response = await fetch(proxyUrl, {
          method: 'GET',
          headers: {
            'Cache-Control': 'no-cache',
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const blob = await response.blob();
        
        if (!mountedRef.current) return;

        // Cleanup old blob URL before creating new one
        if (currentBlobUrlRef.current) {
          URL.revokeObjectURL(currentBlobUrlRef.current);
        }

        // Create blob URL for iframe
        const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
        currentBlobUrlRef.current = url;
        
        console.log('✅ PDF loaded successfully, blob URL:', url);
        setPdfUrl(url);
        setIsLoading(false);
        setError(false);
        setRetryCount(0);

      } catch (err) {
        console.error('❌ PDF load error:', err);
        
        if (!mountedRef.current) return;

        // Retry logic (up to 2 retries)
        if (retryCount < 2) {
          console.log(`🔄 Retrying... (${retryCount + 1}/2)`);
          setTimeout(() => {
            if (mountedRef.current) {
              setRetryCount(retryCount + 1);
            }
          }, 1000 * (retryCount + 1));
          return;
        }

        setError(true);
        setIsLoading(false);
      }
    };

    if (uploaded && (uploaded.gcs_key || uploaded.file_name)) {
      fetchPdf();
    } else {
      setIsLoading(false);
      setError(true);
    }

    return () => {
      mountedRef.current = false;
      // Cleanup blob URL using ref
      if (currentBlobUrlRef.current) {
        URL.revokeObjectURL(currentBlobUrlRef.current);
        currentBlobUrlRef.current = null;
      }
    };
  }, [uploaded?.gcs_key, uploaded?.file_name, retryCount]);

  // Manual retry handler
  const handleRetry = () => {
    setRetryCount(0);
    setError(false);
    setIsLoading(true);
    // Trigger refetch by incrementing retry
    setTimeout(() => setRetryCount(prev => prev + 1), 100);
  };

  const handleDownload = () => {
    if (pdfUrl) {
      const a = document.createElement('a');
      a.href = pdfUrl;
      a.download = fileName;
      a.click();
    }
  };

  if (!isPdf) {
    return (
      <div className="w-2/5 flex flex-col bg-gray-50 rounded-lg border border-gray-200">
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center">
            <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 font-medium">Document Preview</p>
            <p className="text-sm text-gray-500 mt-2">Preview not available for this file type</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-2/5 flex flex-col bg-white rounded-lg border border-gray-200 shadow-sm h-full">
      {/* Header Controls */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-gray-600" />
          <span className="text-sm font-medium text-gray-700 truncate max-w-[200px]">
            {fileName}
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Zoom Controls */}
          <button
            onClick={onZoomOut}
            className="p-1.5 hover:bg-gray-200 rounded transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4 text-gray-600" />
          </button>
          <span className="text-xs text-gray-600 min-w-[45px] text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={onZoomIn}
            className="p-1.5 hover:bg-gray-200 rounded transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4 text-gray-600" />
          </button>

          <div className="w-px h-4 bg-gray-300 mx-1" />
          
          {/* Download Button */}
          {pdfUrl && (
            <>
              <button
                onClick={handleDownload}
                className="p-1.5 hover:bg-gray-200 rounded transition-colors"
                title="Download"
              >
                <Download className="w-4 h-4 text-gray-600" />
              </button>
              <button
                onClick={() => window.open(pdfUrl, '_blank')}
                className="p-1.5 hover:bg-gray-200 rounded transition-colors"
                title="Open in new tab"
              >
                <ExternalLink className="w-4 h-4 text-gray-600" />
              </button>
            </>
          )}
          
          {/* Retry Button */}
          {error && (
            <button
              onClick={handleRetry}
              className="p-1.5 hover:bg-orange-100 rounded transition-colors"
              title="Retry"
            >
              <RefreshCw className="w-4 h-4 text-orange-600" />
            </button>
          )}
        </div>
      </div>
      
      {/* PDF Content */}
      <div className="flex-1 bg-gray-100 p-4 relative overflow-hidden">
        {isLoading && (
          <div className="absolute inset-4 flex items-center justify-center bg-white z-50 rounded">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-gray-600">Loading PDF...</p>
              {retryCount > 0 && (
                <p className="text-xs text-orange-600 mt-1">Retry {retryCount}/2</p>
              )}
            </div>
          </div>
        )}
        
        {error && !isLoading && (
          <div className="absolute inset-4 flex items-center justify-center bg-white rounded">
            <div className="text-center p-8">
              <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-800 mb-2">Preview Unavailable</h3>
              <p className="text-sm text-gray-600 mb-4">Unable to load PDF preview</p>
              <button
                onClick={handleRetry}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Retry Loading
              </button>
            </div>
          </div>
        )}
        
        {pdfUrl && !isLoading && !error && (
          <iframe
            ref={iframeRef}
            src={`${pdfUrl}#view=FitH&toolbar=0&navpanes=0`}
            className="absolute inset-4 rounded bg-white"
            style={{
              border: 'none',
              width: 'calc(100% - 2rem)',
              height: 'calc(100% - 2rem)',
            }}
            title="PDF Preview"
            onLoad={() => {
              console.log('✅ PDF iframe loaded successfully');
              setIsLoading(false);
              setError(false);
            }}
            onError={() => {
              console.error('❌ PDF iframe error');
              setError(true);
              setIsLoading(false);
            }}
            // 🔥 CHROME 2024 CRITICAL ATTRIBUTES - Optimized for blob URLs:
            sandbox="allow-same-origin allow-scripts allow-modals allow-forms allow-popups allow-presentation"
            referrerPolicy="no-referrer-when-downgrade"
            allow="fullscreen"
            loading="eager"
            name="pdf-preview-frame"
          />
        )}
      </div>
    </div>
  );
}
