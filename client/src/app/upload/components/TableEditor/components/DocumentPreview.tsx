import { Download, ZoomIn, ZoomOut, FileText, Table } from 'lucide-react'
import { getPdfUrl } from '../utils'

type DocumentPreviewProps = {
  uploaded: any
  zoom: number
  onZoomIn: () => void
  onZoomOut: () => void
}

export default function DocumentPreview({ uploaded, zoom, onZoomIn, onZoomOut }: DocumentPreviewProps) {
  const pdfDisplayUrl = getPdfUrl(uploaded)
  
  // Check if file is Excel
  const isExcel = uploaded?.file_name?.toLowerCase().endsWith('.xlsx') || 
                 uploaded?.file_name?.toLowerCase().endsWith('.xls') ||
                 uploaded?.file_name?.toLowerCase().endsWith('.xlsm') ||
                 uploaded?.file_name?.toLowerCase().endsWith('.xlsb')
  
  // Check if file is PDF
  const isPdf = uploaded?.file_name?.toLowerCase().endsWith('.pdf')

  const handleDownload = () => {
    if (pdfDisplayUrl) {
      const a = document.createElement('a');
      a.href = pdfDisplayUrl;
      a.download = uploaded?.file_name || 'document';
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.click();
    }
  };

  const getDocumentIcon = () => {
    if (isExcel) return <Table size={16} />
    if (isPdf) return <FileText size={16} />
    return <FileText size={16} />
  }

  const getDocumentType = () => {
    if (isExcel) return 'Excel Document'
    if (isPdf) return 'Original PDF'
    return 'Original Document'
  }

  const renderExcelPreview = () => (
    <div className="w-full h-full flex flex-col items-center justify-center min-h-0 min-w-0 p-4">
      <div className="w-full h-full flex flex-col items-center justify-center bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
        <Table className="w-16 h-16 text-gray-400 mb-4" />
        <div className="text-center">
          <h3 className="text-lg font-medium text-gray-700 mb-2">Excel Document</h3>
          <p className="text-sm text-gray-500 mb-4">
            {uploaded?.file_name || 'document.xlsx'}
          </p>
          <p className="text-xs text-gray-400 max-w-xs">
            Excel files are processed for table extraction. The original file contains multiple sheets with structured data.
          </p>
        </div>
        <button
          onClick={handleDownload}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm flex items-center gap-2"
        >
          <Download size={14} />
          Download Excel File
        </button>
      </div>
    </div>
  )

  const renderPdfPreview = () => (
    <div className="w-full h-full flex flex-col items-center justify-center min-h-0 min-w-0 p-4">
      <div className="w-full h-full overflow-auto">
        <embed
          src={pdfDisplayUrl}
          type="application/pdf"
          width="100%"
          height="100%"
          className="w-full h-full"
          style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}
          aria-label="PDF preview"
        />
      </div>
      <div className="text-xs text-gray-500 mt-2 px-2 text-center bg-white/80 rounded p-2">
        If the PDF is blank, <b>your browser may block cross-origin (CORS) PDF previews</b>.<br />
        <a href={pdfDisplayUrl} className="underline" target="_blank" rel="noopener noreferrer">Open PDF in a new tab</a> to view.
      </div>
    </div>
  )

  return (
    <div className="w-2/5 min-w-0 flex flex-col rounded-2xl shadow-xl bg-white border border-blue-100 overflow-hidden">
      <div className="sticky top-0 z-10 bg-white/90 px-4 py-3 border-b font-semibold text-blue-700 flex items-center justify-between">
        <span className="flex items-center gap-2">
          {getDocumentIcon()}
          {getDocumentType()}
        </span>
        <div className="flex items-center gap-2">
          {isPdf && (
            <>
              <button
                onClick={onZoomOut}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
              >
                <ZoomOut size={14} />
              </button>
              <span className="text-xs text-gray-500 min-w-[3rem] text-center">{Math.round(zoom * 100)}%</span>
              <button
                onClick={onZoomIn}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
              >
                <ZoomIn size={14} />
              </button>
            </>
          )}
          <button
            onClick={handleDownload}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
          >
            <Download size={14} />
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 min-w-0 overflow-auto bg-gray-50">
        {isExcel ? (
          renderExcelPreview()
        ) : isPdf && pdfDisplayUrl ? (
          renderPdfPreview()
        ) : (
          <div className="text-gray-400 text-sm flex items-center justify-center h-full">
            {isPdf ? 'No PDF file found.' : 'Document preview not available.'}
          </div>
        )}
      </div>
    </div>
  )
}
