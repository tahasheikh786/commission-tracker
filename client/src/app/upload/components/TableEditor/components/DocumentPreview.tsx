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
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  
  // Fetch signed URL for PDF preview
  React.useEffect(() => {
    const fetchPdfUrl = async () => {
      // Check for gcs_key, file_name, or gcs_url
      const gcsKey = uploaded?.gcs_key || uploaded?.file_name;
      const existingUrl = uploaded?.gcs_url;
      
      console.log('📄 DocumentPreview - Attempting to load PDF:', { 
        gcsKey, 
        existingUrl, 
        hasUploadedData: !!uploaded 
      });
      
      if (!gcsKey && !existingUrl) {
        console.warn('📄 No GCS key or URL found');
        setIsLoading(false);
        setPdfError(true);
        return;
      }

      try {
        // If we already have a signed GCS URL, try using it directly via proxy
        if (existingUrl && existingUrl.includes('storage.googleapis.com')) {
          console.log('📄 Using existing GCS URL via proxy');
          // Use the GCS key to get a fresh signed URL via backend
          const baseUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/api$/, '');
          const response = await fetch(`${baseUrl}/api/pdf-preview/?gcs_key=${encodeURIComponent(gcsKey)}`);
          
          if (response.ok) {
            const data = await response.json();
            const signedUrl = data.url;

            // Step 2: Fetch the PDF as a blob to avoid CORS issues
            const pdfResponse = await fetch(signedUrl);
            if (pdfResponse.ok) {
              const pdfBlob = await pdfResponse.blob();
              
              // Step 3: Create a local object URL from the blob
              const objectUrl = URL.createObjectURL(pdfBlob);
              console.log('✅ PDF loaded successfully via blob URL');
              setPdfUrl(objectUrl);
              setIsLoading(false);
              setPdfError(false);
              return;
            }
          }
        }
        
        // Fallback: Use gcs_key to get signed URL from backend
        if (gcsKey) {
          console.log('📄 Fetching signed URL from backend for:', gcsKey);
          const baseUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/api$/, '');
          const response = await fetch(`${baseUrl}/api/pdf-preview/?gcs_key=${encodeURIComponent(gcsKey)}`);
          
          if (response.ok) {
            const data = await response.json();
            const signedUrl = data.url;

            // Fetch the PDF as a blob to avoid CORS issues
            const pdfResponse = await fetch(signedUrl);
            if (pdfResponse.ok) {
              const pdfBlob = await pdfResponse.blob();
              
              // Create a local object URL from the blob
              const objectUrl = URL.createObjectURL(pdfBlob);
              console.log('✅ PDF loaded successfully via blob URL');
              setPdfUrl(objectUrl);
              setIsLoading(false);
              setPdfError(false);
              return;
            } else {
              throw new Error('Failed to fetch PDF from signed URL');
            }
          } else {
            throw new Error('Failed to get signed URL from backend');
          }
        }
        
        throw new Error('No valid PDF source found');
      } catch (err) {
        console.error('❌ Error fetching PDF:', err);
        setPdfError(true);
        setIsLoading(false);
      }
    };

    fetchPdfUrl();

    // Cleanup: revoke object URL when component unmounts
    return () => {
      if (pdfUrl && pdfUrl.startsWith('blob:')) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [uploaded?.gcs_key, uploaded?.file_name, uploaded?.gcs_url]);
  
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
    <div className="flex-1 flex flex-col bg-gray-50 dark:bg-slate-900">
      
      {/* Controls Header */}
      <div className="flex items-center justify-between p-4 bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 flex-shrink-0">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <FileText className="w-4 h-4 text-gray-500 dark:text-slate-400" />
            <span className="text-sm font-medium text-gray-700 dark:text-slate-300 truncate max-w-48">
              {fileName}
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {isPdf && (
            <div className="flex items-center space-x-2">
              <button
                onClick={onZoomOut}
                className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-600 dark:text-slate-400 cursor-pointer"
                title="Zoom Out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              
              <span className="text-xs text-gray-500 dark:text-slate-400 px-2">
                {Math.round(zoom * 100)}%
              </span>
              
              <button
                onClick={onZoomIn}
                className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-600 dark:text-slate-400 cursor-pointer"
                title="Zoom In"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
            </div>
          )}
          {pdfUrl && (
            <button
              onClick={handleDownload}
              className="flex items-center space-x-1 px-3 py-1.5 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors cursor-pointer"
              title="Download"
            >
              <Download className="w-4 h-4" />
              <span>Download</span>
            </button>
          )}
          
          {pdfUrl && (
            <button
              onClick={() => window.open(pdfUrl, '_blank')}
              className="flex items-center space-x-1 px-3 py-1.5 text-sm text-gray-600 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-md transition-colors cursor-pointer"
              title="Open in new tab"
            >
              <ExternalLink className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Document Content */}
      <div className="flex-1 overflow-auto bg-gray-100 dark:bg-slate-800 p-4">
        {isPdf && pdfUrl ? (
          pdfError ? (
            // Error Fallback UI
            <div className="flex flex-col items-center justify-center h-full bg-white dark:bg-slate-800 rounded-lg shadow-sm p-8">
              <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4">
                <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-2">PDF Preview Unavailable</h3>
              <p className="text-gray-600 dark:text-slate-400 mb-6 text-center max-w-md">
                Unable to display the PDF preview. You can still download or open it in a new tab.
              </p>
              <div className="flex items-center space-x-3">
                <button
                  onClick={handleDownload}
                  className="flex items-center space-x-2 px-4 py-2 bg-blue-600 dark:bg-blue-700 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-800 transition-colors cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Download PDF</span>
                </button>
                <button
                  onClick={() => window.open(pdfUrl, '_blank')}
                  className="flex items-center space-x-2 px-4 py-2 bg-gray-600 dark:bg-slate-700 text-white rounded-lg hover:bg-gray-700 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Open in New Tab</span>
                </button>
              </div>
            </div>
          ) : (
            // PDF Display with object/embed approach
            <div className="w-full h-full min-h-[600px] bg-white dark:bg-slate-800 rounded-lg shadow-sm overflow-hidden">
              {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-white dark:bg-slate-800 z-10">
                  <div className="text-center">
                    <div className="w-12 h-12 border-4 border-blue-600 dark:border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                    <p className="text-sm text-gray-600 dark:text-slate-400">Loading PDF...</p>
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
                  <FileText className="w-12 h-12 text-gray-400 dark:text-slate-500 mb-4" />
                  <p className="text-gray-600 dark:text-slate-400 mb-4">Your browser does not support inline PDF viewing</p>
                  <button
                    onClick={handleDownload}
                    className="px-4 py-2 bg-blue-600 dark:bg-blue-700 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-800 transition-colors cursor-pointer"
                  >
                    Download PDF
                  </button>
                </div>
              </object>
            </div>
          )
        ) : isExcel ? (
          <div className="bg-white dark:bg-slate-800 rounded-lg p-8 text-center shadow-sm">
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <FileText className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-2">Excel Document</h3>
            <p className="text-gray-600 dark:text-slate-400 mb-4">
              {fileName}
            </p>
            <p className="text-sm text-gray-500 dark:text-slate-400 mb-4">
              Excel files are processed for table extraction. The extracted data is shown on the right panel.
            </p>
            {pdfUrl && (
              <button
                onClick={handleDownload}
                className="inline-flex items-center space-x-2 px-4 py-2 bg-green-600 dark:bg-green-700 text-white rounded-lg hover:bg-green-700 dark:hover:bg-green-800 transition-colors cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Download Original</span>
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-800 rounded-lg p-8 text-center shadow-sm">
            <div className="w-16 h-16 bg-gray-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
              <FileText className="w-8 h-8 text-gray-500 dark:text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-2">Document Preview</h3>
            <p className="text-gray-600 dark:text-slate-400 mb-4">
              Preview not available for this file type
            </p>
            <p className="text-sm text-gray-500 dark:text-slate-400">
              The extracted data is available in the right panel
            </p>
          </div>
        )}
      </div>
    </div>
  );
}