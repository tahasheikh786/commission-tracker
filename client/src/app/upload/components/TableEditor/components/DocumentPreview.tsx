import React, { useState } from 'react';
import { Download, ZoomIn, ZoomOut, FileText, ExternalLink, AlertCircle } from 'lucide-react';

interface DocumentPreviewProps {
  uploaded: any;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
}

export default function DocumentPreview({ uploaded, zoom, onZoomIn, onZoomOut }: DocumentPreviewProps) {
  const [pdfError, setPdfError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  // Use the GCS URL from the extraction response
  const pdfUrl = uploaded?.gcs_url || uploaded?.pdf_url || uploaded?.file_url;
  
  // Debug logging
  console.log('📄 DocumentPreview - uploaded data:', {
    has_gcs_url: !!uploaded?.gcs_url,
    gcs_url: uploaded?.gcs_url,
    uploaded_keys: uploaded ? Object.keys(uploaded) : []
  });
  
  // Check file type
  const fileName = uploaded?.file_name || uploaded?.fileName || 'document';
  const isPdf = fileName.toLowerCase().endsWith('.pdf');
  const isExcel = fileName.toLowerCase().match(/\.(xlsx?|xlsm|xlsb)$/);

  const handleDownload = () => {
    if (pdfUrl) {
      const a = document.createElement('a');
      a.href = pdfUrl;
      a.download = fileName;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.click();
    }
  };

  const handlePdfError = () => {
    console.error('PDF Preview Error: Failed to load PDF');
    setPdfError(true);
    setIsLoading(false);
  };

  const handlePdfLoad = () => {
    console.log('PDF loaded successfully');
    setIsLoading(false);
    setPdfError(false);
  };

  return (
    <div className="flex-1 flex flex-col bg-gray-50">
      
      {/* Controls Header */}
      <div className="flex items-center justify-between p-4 bg-white border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <FileText className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700 truncate max-w-48">
              {fileName}
            </span>
          </div>
          
          {isPdf && (
            <div className="flex items-center space-x-2">
              <button
                onClick={onZoomOut}
                className="p-1.5 rounded-md hover:bg-gray-100 text-gray-600"
                title="Zoom Out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              
              <span className="text-xs text-gray-500 px-2">
                {Math.round(zoom * 100)}%
              </span>
              
              <button
                onClick={onZoomIn}
                className="p-1.5 rounded-md hover:bg-gray-100 text-gray-600"
                title="Zoom In"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center space-x-2">
          {pdfUrl && (
            <button
              onClick={handleDownload}
              className="flex items-center space-x-1 px-3 py-1.5 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-md transition-colors"
              title="Download"
            >
              <Download className="w-4 h-4" />
              <span>Download</span>
            </button>
          )}
          
          {pdfUrl && (
            <button
              onClick={() => window.open(pdfUrl, '_blank')}
              className="flex items-center space-x-1 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
              title="Open in new tab"
            >
              <ExternalLink className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Document Content */}
      <div className="flex-1 overflow-auto bg-gray-100 p-4">
        {isPdf && pdfUrl ? (
          pdfError ? (
            // Error Fallback UI
            <div className="flex flex-col items-center justify-center h-full bg-white rounded-lg shadow-sm p-8">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
                <AlertCircle className="w-8 h-8 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-800 mb-2">PDF Preview Unavailable</h3>
              <p className="text-gray-600 mb-6 text-center max-w-md">
                Unable to display the PDF preview. You can still download or open it in a new tab.
              </p>
              <div className="flex items-center space-x-3">
                <button
                  onClick={handleDownload}
                  className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span>Download PDF</span>
                </button>
                <button
                  onClick={() => window.open(pdfUrl, '_blank')}
                  className="flex items-center space-x-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Open in New Tab</span>
                </button>
              </div>
            </div>
          ) : (
            // PDF Display with object/embed approach
            <div className="w-full h-full min-h-[600px] bg-white rounded-lg shadow-sm overflow-hidden">
              {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-white z-10">
                  <div className="text-center">
                    <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                    <p className="text-sm text-gray-600">Loading PDF...</p>
                  </div>
                </div>
              )}
              <object
                data={`${pdfUrl}#view=FitH&toolbar=1&navpanes=0`}
                type="application/pdf"
                className="w-full h-full border-0"
                style={{ 
                  minHeight: '600px',
                  transform: `scale(${zoom})`,
                  transformOrigin: 'top left',
                  width: zoom !== 1 ? `${100 / zoom}%` : '100%',
                  height: zoom !== 1 ? `${100 / zoom}%` : '100%',
                }}
                onLoad={handlePdfLoad}
                onError={handlePdfError}
              >
                <embed
                  src={`${pdfUrl}#view=FitH&toolbar=1&navpanes=0`}
                  type="application/pdf"
                  className="w-full h-full border-0"
                  style={{ 
                    minHeight: '600px',
                    transform: `scale(${zoom})`,
                    transformOrigin: 'top left'
                  }}
                  onLoad={handlePdfLoad}
                  onError={handlePdfError}
                />
                <div className="flex flex-col items-center justify-center h-full p-8">
                  <FileText className="w-12 h-12 text-gray-400 mb-4" />
                  <p className="text-gray-600 mb-4">Your browser does not support inline PDF viewing</p>
                  <button
                    onClick={handleDownload}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Download PDF
                  </button>
                </div>
              </object>
            </div>
          )
        ) : isExcel ? (
          <div className="bg-white rounded-lg p-8 text-center shadow-sm">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <FileText className="w-8 h-8 text-green-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Excel Document</h3>
            <p className="text-gray-600 mb-4">
              {fileName}
            </p>
            <p className="text-sm text-gray-500 mb-4">
              Excel files are processed for table extraction. The extracted data is shown on the right panel.
            </p>
            {pdfUrl && (
              <button
                onClick={handleDownload}
                className="inline-flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>Download Original</span>
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-lg p-8 text-center shadow-sm">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <FileText className="w-8 h-8 text-gray-500" />
            </div>
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Document Preview</h3>
            <p className="text-gray-600 mb-4">
              Preview not available for this file type
            </p>
            <p className="text-sm text-gray-500">
              The extracted data is available in the right panel
            </p>
          </div>
        )}
      </div>
    </div>
  );
}