'use client'

import { useState, useCallback } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

// ✅ CRITICAL FIX: Configure worker BEFORE any component renders
// Using CDN approach for Next.js 15 compatibility
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

interface PDFViewerProps {
  fileUrl: string
  isCollapsed: boolean
  onToggleCollapse: () => void
}

export default function PDFViewer({ fileUrl, isCollapsed, onToggleCollapse }: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number>(0)
  const [pageNumber, setPageNumber] = useState<number>(1)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [scale, setScale] = useState<number>(1.0)

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages)
    setLoading(false)
    setError(null)
    console.log(`PDF loaded successfully with ${numPages} pages`)
  }, [])

  const onDocumentLoadError = useCallback((error: Error) => {
    console.error('PDF load error:', error)
    setError(`Failed to load PDF: ${error.message}`)
    setLoading(false)
  }, [])

  const handleZoomIn = useCallback(() => {
    setScale(prev => Math.min(2.5, prev + 0.1))
  }, [])

  const handleZoomOut = useCallback(() => {
    setScale(prev => Math.max(0.5, prev - 0.1))
  }, [])

  const handleResetZoom = useCallback(() => {
    setScale(1.0)
  }, [])

  const handlePreviousPage = useCallback(() => {
    setPageNumber(prev => Math.max(1, prev - 1))
  }, [])

  const handleNextPage = useCallback(() => {
    setPageNumber(prev => Math.min(numPages, prev + 1))
  }, [numPages])

  const handleFirstPage = useCallback(() => {
    setPageNumber(1)
  }, [])

  const handleLastPage = useCallback(() => {
    setPageNumber(numPages)
  }, [numPages])

  if (isCollapsed) {
    return (
      <div className="w-12 h-full flex items-center justify-center bg-gray-100 border-r border-gray-200">
        <button
          onClick={onToggleCollapse}
          className="transform rotate-90 bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 transition-colors"
          aria-label="Show PDF Preview"
        >
          Show PDF
        </button>
      </div>
    )
  }

  return (
    <div className="w-1/2 h-full bg-gray-50 border-r border-gray-200 flex flex-col">
      {/* Header with controls */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white shadow-sm flex-wrap gap-2">
        <h3 className="text-lg font-semibold text-gray-800">Document Preview</h3>
        
        <div className="flex items-center space-x-4 flex-wrap gap-2">
          {/* Zoom controls */}
          <div className="flex items-center space-x-2 border border-gray-300 rounded px-2 py-1">
            <button
              onClick={handleZoomOut}
              className="px-2 py-1 bg-gray-200 rounded text-sm hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={scale <= 0.5}
              title="Zoom Out"
            >
              −
            </button>
            <button
              onClick={handleResetZoom}
              className="px-2 py-1 text-sm min-w-[60px] text-center hover:bg-gray-100 rounded"
              title="Reset Zoom"
            >
              {Math.round(scale * 100)}%
            </button>
            <button
              onClick={handleZoomIn}
              className="px-2 py-1 bg-gray-200 rounded text-sm hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={scale >= 2.5}
              title="Zoom In"
            >
              +
            </button>
          </div>

          {/* Page navigation */}
          {numPages > 1 && (
            <div className="flex items-center space-x-2 border border-gray-300 rounded px-2 py-1">
              <button
                disabled={pageNumber <= 1}
                onClick={handleFirstPage}
                className="px-2 py-1 bg-gray-200 rounded disabled:opacity-50 disabled:cursor-not-allowed text-sm hover:bg-gray-300"
                title="First Page"
              >
                ⟨⟨
              </button>
              <button
                disabled={pageNumber <= 1}
                onClick={handlePreviousPage}
                className="px-2 py-1 bg-gray-200 rounded disabled:opacity-50 disabled:cursor-not-allowed text-sm hover:bg-gray-300"
                title="Previous Page"
              >
                ⟨
              </button>
              <span className="text-sm min-w-[80px] text-center">
                {pageNumber} / {numPages}
              </span>
              <button
                disabled={pageNumber >= numPages}
                onClick={handleNextPage}
                className="px-2 py-1 bg-gray-200 rounded disabled:opacity-50 disabled:cursor-not-allowed text-sm hover:bg-gray-300"
                title="Next Page"
              >
                ⟩
              </button>
              <button
                disabled={pageNumber >= numPages}
                onClick={handleLastPage}
                className="px-2 py-1 bg-gray-200 rounded disabled:opacity-50 disabled:cursor-not-allowed text-sm hover:bg-gray-300"
                title="Last Page"
              >
                ⟩⟩
              </button>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center space-x-2">
            {fileUrl && (
              <button
                onClick={() => window.open(fileUrl, '_blank')}
                className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 transition-colors"
                title="Open in New Tab"
              >
                Open
              </button>
            )}
            
            <button
              onClick={onToggleCollapse}
              className="px-3 py-1 bg-gray-200 rounded text-sm hover:bg-gray-300 transition-colors"
              title="Hide PDF Preview"
            >
              Hide
            </button>
          </div>
        </div>
      </div>

      {/* PDF Content */}
      <div className="flex-1 overflow-auto p-4 bg-gray-100">
        {loading && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4 mx-auto"></div>
              <p className="text-gray-600">Loading PDF...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-red-600 max-w-md p-8">
              <div className="text-red-500 mb-4">
                <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                        d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-red-600 mb-4 font-semibold">Failed to load PDF</p>
              <p className="text-gray-600 text-sm mb-6">{error}</p>
              {fileUrl && (
                <button
                  onClick={() => window.open(fileUrl, '_blank')}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                >
                  Open in New Tab
                </button>
              )}
            </div>
          </div>
        )}

        {!loading && !error && fileUrl && (
          <div className="flex justify-center">
            <Document
              file={fileUrl}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={onDocumentLoadError}
              loading={
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                  <p className="text-gray-600">Loading document...</p>
                </div>
              }
              error={
                <div className="text-center py-8 text-red-600">
                  <p className="font-semibold mb-2">Error loading PDF</p>
                  <p className="text-sm text-gray-600">Please try opening in a new tab</p>
                </div>
              }
            >
              <Page
                pageNumber={pageNumber}
                scale={scale}
                loading={
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                    <p className="text-gray-600">Loading page {pageNumber}...</p>
                  </div>
                }
                error={
                  <div className="text-center py-8 text-red-600">
                    <p className="font-semibold mb-2">Error loading page</p>
                    <p className="text-sm text-gray-600">Try another page or open in new tab</p>
                  </div>
                }
                renderTextLayer={true}
                renderAnnotationLayer={true}
                className="shadow-lg"
              />
            </Document>
          </div>
        )}

        {!loading && !error && !fileUrl && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-gray-500">
              <svg className="w-16 h-16 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="font-medium">No PDF file available</p>
              <p className="text-sm text-gray-400 mt-2">Upload a document to preview</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
