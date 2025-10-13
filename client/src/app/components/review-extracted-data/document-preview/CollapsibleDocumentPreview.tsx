/**
 * Collapsible Document Preview Component
 * Modern PDF viewer with Chrome 2024 compatibility fixes
 * Includes enhanced iframe attributes, load handlers, and error recovery
 */

'use client';

import React, { useRef, useCallback, useEffect } from 'react';
import { Download, ZoomIn, ZoomOut, FileText, ExternalLink, AlertCircle, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { DocumentPreviewProps } from '../types';
import { useDocumentPreview } from '../hooks';

export default function CollapsibleDocumentPreview({
  uploaded,
  isCollapsed,
  onToggleCollapse
}: DocumentPreviewProps) {
  const {
    pdfUrl,
    isLoading,
    error,
    retryCount,
    zoom,
    retry,
    download,
    zoomIn,
    zoomOut
  } = useDocumentPreview(uploaded);

  const iframeRef = useRef<HTMLIFrameElement>(null);

  // CRITICAL: Chrome-specific iframe load handler
  const handleIframeLoad = useCallback(() => {
    console.log('✅ PDF iframe loaded successfully');
    
    // CRITICAL: Chrome workaround - force refresh iframe content if blank
    setTimeout(() => {
      if (iframeRef.current && pdfUrl) {
        try {
          const iframeDoc = iframeRef.current.contentDocument || iframeRef.current.contentWindow?.document;
          
          // If iframe is blank, try to reload
          if (iframeDoc && iframeDoc.body && iframeDoc.body.children.length === 0) {
            console.log('🔄 Iframe blank, attempting reload...');
            iframeRef.current.src = '';
            setTimeout(() => {
              if (iframeRef.current && pdfUrl) {
                iframeRef.current.src = pdfUrl;
              }
            }, 100);
          }
        } catch (e) {
          // Ignore cross-origin errors
          console.log('ℹ️ Cannot access iframe content (expected for blob URLs)');
        }
      }
    }, 1000);
  }, [pdfUrl]);

  const handleIframeError = useCallback((e: any) => {
    console.error('❌ PDF iframe error:', e);
    console.log('🔄 Attempting to retry PDF load...');
    retry();
  }, [retry]);

  // Extract file information
  const fileName = uploaded?.file_name || uploaded?.fileName || 'document.pdf';
  const isPdf = fileName.toLowerCase().endsWith('.pdf');

  if (!isPdf) {
    return (
      <div className={`flex flex-col bg-gray-50 rounded-lg border border-gray-200 transition-all duration-300 ease-in-out ${
        isCollapsed ? 'w-0 opacity-0 overflow-hidden' : 'w-[35%]'
      }`}>
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
    <div className="relative h-full flex items-stretch" style={{ width: isCollapsed ? '0' : '35%', transition: 'width 300ms ease-in-out' }}>
      {/* Collapse/Expand Toggle Button - Always Visible */}
      <button
        onClick={onToggleCollapse}
        className={`absolute top-1/2 transform -translate-y-1/2 z-50 w-6 h-12 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-lg transition-all duration-200 flex items-center justify-center ${
          isCollapsed ? 'right-0 rounded-l-none rounded-r-lg' : '-right-3 rounded-r-lg'
        }`}
        title={isCollapsed ? 'Show Preview' : 'Hide Preview'}
      >
        {isCollapsed ? (
          <ChevronRight className="w-4 h-4" />
        ) : (
          <ChevronLeft className="w-4 h-4" />
        )}
      </button>

      {/* PDF Preview Container */}
      <div className={`flex flex-col bg-white rounded-lg border border-gray-200 shadow-sm h-full transition-opacity duration-300 ease-in-out w-full ${
        isCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}>
        {!isCollapsed && (
        <>
          {/* Header Controls */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <FileText className="w-4 h-4 text-gray-600 flex-shrink-0" />
              <span className="text-sm font-medium text-gray-700 truncate">
                {fileName}
              </span>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Zoom Controls */}
              <button
                onClick={zoomOut}
                className="p-1.5 hover:bg-gray-200 rounded transition-colors"
                title="Zoom Out"
              >
                <ZoomOut className="w-4 h-4 text-gray-600" />
              </button>
              <span className="text-xs text-gray-600 min-w-[45px] text-center">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={zoomIn}
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
                    onClick={download}
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
                  onClick={retry}
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
                    onClick={retry}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Retry Loading
                  </button>
                </div>
              </div>
            )}

            {pdfUrl && !isLoading && !error && (
              <div className="h-full w-full overflow-auto">
                {/* CRITICAL: iframe with Chrome-specific attributes */}
                <iframe
                  ref={iframeRef}
                  src={pdfUrl}
                  className="block w-full h-full bg-white"
                  style={{ 
                    transform: `scale(${zoom})`,
                    transformOrigin: 'top left',
                    width: `${100 / zoom}%`,
                    height: `${100 / zoom}%`,
                    minHeight: '100%',
                    border: 'none'
                  }}
                  title="PDF Preview"
                  onLoad={handleIframeLoad}
                  onError={handleIframeError}
                  // 🔥 CHROME 2024 CRITICAL ATTRIBUTES - Optimized for blob URLs:
                  sandbox="allow-same-origin allow-scripts allow-modals allow-forms allow-popups allow-presentation"
                  referrerPolicy="no-referrer-when-downgrade"
                  allow="fullscreen"
                  loading="eager"
                  name="pdf-preview-frame"
                />
              </div>
            )}
          </div>
        </>
      )}
      </div>
    </div>
  );
}

