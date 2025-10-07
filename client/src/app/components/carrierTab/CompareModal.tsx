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
        <header className="sticky top-0 z-20 bg-white dark:bg-slate-800 shadow-lg rounded-t-2xl flex items-center justify-between px-6 py-5 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-md">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Compare Statement</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 font-medium">{statement.file_name}</p>
            </div>
          </div>
          <nav aria-label="PDF toolbar" className="flex gap-1">
            <button
              onClick={handleZoomOut}
              aria-label="Zoom out"
              className="p-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
            >
              <ZoomOut size={20} />
            </button>
            <button
              onClick={handleZoomIn}
              aria-label="Zoom in"
              className="p-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
            >
              <ZoomIn size={20} />
            </button>
            <button
              onClick={handleDownload}
              aria-label="Download PDF"
              className="p-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
            >
              <Download size={20} />
            </button>
            <a
              href={pdfUrl || '#'}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open PDF in new tab"
              className="p-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
            >
              <ExternalLink size={20} />
            </a>
          </nav>
        </header>
        {/* Card Layout */}
        <div className="flex-1 flex flex-col lg:flex-row gap-6 w-full h-full max-h-full min-h-0 min-w-0 bg-slate-50 dark:bg-slate-900 p-6 rounded-b-2xl">
          {/* PDF Card */}
          <section className="flex-1 min-w-0 min-h-0 flex flex-col rounded-xl shadow-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 overflow-hidden relative">
            <div className="sticky top-0 z-10 bg-white dark:bg-slate-800 px-6 py-4 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h3 className="font-semibold text-slate-800 dark:text-slate-200">Original PDF</h3>
              </div>
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
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-2 px-2 text-center bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
                    If the PDF is blank, <b>your browser may block cross-origin (CORS) PDF previews for presigned URLs</b>.<br />
                    <a href={pdfUrl} className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline font-medium" target="_blank" rel="noopener noreferrer">Open PDF in a new tab</a> to view or download.
                  </div>
                </div>
              ) : (
                <div className="text-slate-400 dark:text-slate-500 text-sm flex items-center justify-center h-full">No PDF file found.</div>
              )}
            </div>
          </section>
          {/* Extracted Table Card */}
          <section className="flex-1 min-w-0 min-h-0 flex flex-col rounded-xl shadow-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="sticky top-0 z-10 bg-white dark:bg-slate-800 px-6 py-4 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0V4a1 1 0 011-1h16a1 1 0 011 1v16a1 1 0 01-1 1H4a1 1 0 01-1-1z" />
                  </svg>
                </div>
                <h3 className="font-semibold text-slate-800 dark:text-slate-200">
                  {statement.edited_tables && statement.edited_tables.length > 0 ? 'Formatted Table(s)' : 'Extracted Table(s)'}
                </h3>
              </div>
            </div>
            <div className="flex-1 min-h-0 min-w-0 overflow-auto">
              {(statement.edited_tables && statement.edited_tables.length > 0) || (statement.raw_data && statement.raw_data.length > 0) ? (
                <ExtractedTable tables={statement.edited_tables || statement.raw_data} />
              ) : (
                <div className="text-center py-16">
                  <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-slate-400 dark:text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0V4a1 1 0 011-1h16a1 1 0 011 1v16a1 1 0 01-1 1H4a1 1 0 01-1-1z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">No extracted data found</h3>
                  <p className="text-slate-500 dark:text-slate-400 text-sm">This statement doesn&apos;t have any processed data yet.</p>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </Modal>
  );
}