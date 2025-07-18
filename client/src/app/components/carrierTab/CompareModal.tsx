import Modal from "../Modal";
import ExtractedTable from "../../upload/components/ExtractedTable";

// Helper to get S3 URL if file_name is an S3 key
function getPdfUrl(statement: any) {
  if (!statement?.file_name) return null;
  if (statement.file_name.startsWith("statements/")) {
    // S3 direct URL (public bucket) or via backend proxy/redirect
    return `${process.env.NEXT_PUBLIC_API_URL?.replace(/\/api$/, '')}/pdfs/${encodeURIComponent(statement.file_name)}`;
  }
  // fallback to old local storage
  return `${process.env.NEXT_PUBLIC_API_URL?.replace(/\/api$/, '')}/pdfs/${encodeURIComponent(statement.file_name)}`;
}

type Props = {
  statement: any;
  onClose: () => void;
};

export default function CompareModal({ statement, onClose }: Props) {
  const pdfUrl = getPdfUrl(statement);

  return (
    <Modal onClose={onClose}>
      <div className="flex flex-col lg:flex-row gap-6 w-full h-full max-h-full min-h-0 min-w-0">
        {/* PDF Preview */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          <div className="font-bold mb-2 text-blue-700">Original PDF</div>
          <div className="flex-1 min-h-0 min-w-0 rounded-xl border shadow overflow-hidden bg-gray-50">
            {pdfUrl ? (
              <div className="w-full h-full min-h-0 min-w-0 flex flex-col">
                {/* Try <embed> first for best browser support */}
                <embed
                  src={pdfUrl}
                  type="application/pdf"
                  width="100%"
                  height="100%"
                  className="w-full h-full min-h-0 min-w-0 flex-1"
                  style={{ minHeight: 0, minWidth: 0, flex: 1 }}
                />
                {/* Fallback to <object> if <embed> fails */}
                <object
                  data={pdfUrl}
                  type="application/pdf"
                  width="100%"
                  height="100%"
                  className="w-full h-full min-h-0 min-w-0 flex-1"
                  style={{ minHeight: 0, minWidth: 0, flex: 1 }}
                >
                  {/* Fallback to <iframe> if <object> fails */}
                  <iframe
                    src={pdfUrl}
                    width="100%"
                    height="100%"
                    title="PDF Preview"
                    className="w-full h-full min-h-0 min-w-0 border-none flex-1"
                    style={{ minHeight: 0, minWidth: 0, flex: 1 }}
                  />
                  <div className="text-sm text-gray-500">PDF preview not supported in your browser. <a href={pdfUrl} className="underline" target="_blank" rel="noopener noreferrer">Download</a></div>
                </object>
                <div className="text-xs text-gray-500 mt-2">
                  If the PDF is blank, <b>your browser may block cross-origin (CORS) PDF previews for presigned URLs</b>.<br />
                  <a href={pdfUrl} className="underline" target="_blank" rel="noopener noreferrer">Open PDF in a new tab</a> to view or download.
                </div>
              </div>
            ) : (
              <div className="text-gray-400 text-sm flex items-center justify-center h-full">No PDF file found.</div>
            )}
          </div>
        </div>

        {/* Extracted Table */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          <div className="font-bold mb-2 text-blue-600">Extracted Table(s)</div>
          <div className="flex-1 min-h-0 min-w-0 overflow-auto rounded-xl border shadow bg-white">
            {statement.raw_data && statement.raw_data.length > 0 ? (
              <ExtractedTable tables={statement.raw_data} />
            ) : (
              <div className="text-gray-500 text-center flex items-center justify-center h-full">No extracted data found.</div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
