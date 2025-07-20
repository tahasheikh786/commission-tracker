import Modal from "../Modal";
import ExtractedTable from "../../upload/components/ExtractedTable";
import { useRef, useState } from "react";
import { Download, ZoomIn, ZoomOut, ExternalLink } from "lucide-react";

function getPdfUrl(statement: any) {
  if (!statement?.file_name) return null;
  const baseUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/api$/, '');
  if (statement.file_name.startsWith("statements/")) {
    return `${baseUrl}/pdfs/${encodeURIComponent(statement.file_name)}`;
  }
  return `${baseUrl}/pdfs/${encodeURIComponent(statement.file_name)}`;
}

type Props = {
  statement: any;
  onClose: () => void;
};

export default function CompareModal({ statement, onClose }: Props) {
  const pdfUrl = getPdfUrl(statement);
  const embedRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);

  const handleZoomIn = () => setZoom(z => Math.min(z + 0.2, 2));
  const handleZoomOut = () => setZoom(z => Math.max(z - 0.2, 0.5));
  const handleDownload = () => {
    if (pdfUrl) {
      const a = document.createElement('a');
      a.href = pdfUrl;
      a.download = statement.file_name || 'statement.pdf';
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.click();
    }
  };

  return (
    <Modal onClose={onClose}>
      <div className="flex flex-col h-full w-full max-h-full min-h-0 min-w-0">
        {/* Sticky Header */}
        <header className="sticky top-0 z-20 bg-gradient-to-r from-blue-50 to-purple-50 shadow-md rounded-t-2xl flex items-center justify-between px-6 py-4 border-b">
          <div className="text-xl font-bold text-blue-900 flex items-center gap-2">
            <span>Compare Statement</span>
            <span className="text-base font-normal text-gray-500">({statement.file_name})</span>
          </div>
          <nav aria-label="PDF toolbar" className="flex gap-2">
            <button
              onClick={handleZoomOut}
              aria-label="Zoom out"
              className="p-2 rounded hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <ZoomOut size={20} />
            </button>
            <button
              onClick={handleZoomIn}
              aria-label="Zoom in"
              className="p-2 rounded hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <ZoomIn size={20} />
            </button>
            <button
              onClick={handleDownload}
              aria-label="Download PDF"
              className="p-2 rounded hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <Download size={20} />
            </button>
            <a
              href={pdfUrl || '#'}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open PDF in new tab"
              className="p-2 rounded hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <ExternalLink size={20} />
            </a>
          </nav>
        </header>
        {/* Card Layout */}
        <div className="flex-1 flex flex-col lg:flex-row gap-6 w-full h-full max-h-full min-h-0 min-w-0 bg-gradient-to-br from-white via-blue-50 to-purple-50 p-6 rounded-b-2xl">
          {/* PDF Card */}
          <section className="flex-1 min-w-0 min-h-0 flex flex-col rounded-2xl shadow-xl bg-white border border-blue-100 overflow-hidden relative">
            <div className="sticky top-0 z-10 bg-white/90 px-4 py-2 border-b font-semibold text-blue-700 flex items-center gap-2">
              Original PDF
            </div>
            <div className="flex-1 min-h-0 min-w-0 flex flex-col items-center justify-center">
              {pdfUrl ? (
                <div
                  ref={embedRef}
                  className="w-full h-full flex-1 flex flex-col items-center justify-center min-h-0 min-w-0"
                  style={{ minHeight: 0, minWidth: 0 }}
                >
                  <embed
                    src={pdfUrl}
                    type="application/pdf"
                    width="100%"
                    height="100%"
                    className="w-full h-full min-h-0 min-w-0 flex-1"
                    style={{ minHeight: 0, minWidth: 0, flex: 1, transform: `scale(${zoom})`, transformOrigin: 'top left' }}
                    aria-label="PDF preview"
                  />
                  <div className="text-xs text-gray-500 mt-2 px-2 text-center">
                    If the PDF is blank, <b>your browser may block cross-origin (CORS) PDF previews for presigned URLs</b>.<br />
                    <a href={pdfUrl} className="underline" target="_blank" rel="noopener noreferrer">Open PDF in a new tab</a> to view or download.
                  </div>
                </div>
              ) : (
                <div className="text-gray-400 text-sm flex items-center justify-center h-full">No PDF file found.</div>
              )}
            </div>
          </section>
          {/* Extracted Table Card */}
          <section className="flex-1 min-w-0 min-h-0 flex flex-col rounded-2xl shadow-xl bg-white border border-purple-100 overflow-hidden">
            <div className="sticky top-0 z-10 bg-white/90 px-4 py-2 border-b font-semibold text-purple-700 flex items-center gap-2">
              Extracted Table(s)
            </div>
            <div className="flex-1 min-h-0 min-w-0 overflow-auto">
              {statement.raw_data && statement.raw_data.length > 0 ? (
                <ExtractedTable tables={statement.raw_data} />
              ) : (
                <div className="text-gray-500 text-center flex items-center justify-center h-full">No extracted data found.</div>
              )}
            </div>
          </section>
        </div>
      </div>
    </Modal>
  );
}