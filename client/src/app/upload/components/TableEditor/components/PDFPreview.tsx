import { Download, ZoomIn, ZoomOut, FileText } from 'lucide-react'
import { getPdfUrl } from '../utils'

type PDFPreviewProps = {
  uploaded: any
  zoom: number
  onZoomIn: () => void
  onZoomOut: () => void
}

export default function PDFPreview({ uploaded, zoom, onZoomIn, onZoomOut }: PDFPreviewProps) {
  const pdfDisplayUrl = getPdfUrl(uploaded)

  const handleDownload = () => {
    if (pdfDisplayUrl) {
      const a = document.createElement('a');
      a.href = pdfDisplayUrl;
      a.download = uploaded?.file_name || 'statement.pdf';
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.click();
    }
  };

  return (
    <div className="w-2/5 min-w-0 flex flex-col rounded-2xl shadow-xl bg-white border border-blue-100 overflow-hidden">
      <div className="sticky top-0 z-10 bg-white/90 px-4 py-3 border-b font-semibold text-blue-700 flex items-center justify-between">
        <span className="flex items-center gap-2">
          <FileText size={16} />
          Original PDF
        </span>
        <div className="flex items-center gap-2">
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
          <button
            onClick={handleDownload}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
          >
            <Download size={14} />
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 min-w-0 overflow-auto bg-gray-50">
        {pdfDisplayUrl ? (
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
        ) : (
          <div className="text-gray-400 text-sm flex items-center justify-center h-full">No PDF file found.</div>
        )}
      </div>
    </div>
  )
}
