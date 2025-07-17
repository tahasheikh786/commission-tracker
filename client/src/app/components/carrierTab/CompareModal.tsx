import Modal from "../Modal";
import DashboardTable from "../../upload/components/DashboardTable";
import ExtractedTable from "../../upload/components/ExtractedTable";

type Props = {
  statement: any;
  onClose: () => void;
};

export default function CompareModal({ statement, onClose }: Props) {
  // If you use supabase storage for PDF, adapt the URL as needed.
  const pdfUrl = statement?.file_name
    ? `${process.env.NEXT_PUBLIC_API_URL?.replace(/\/api$/, '')}/pdfs/${encodeURIComponent(statement.file_name)}`
    : null;

  return (
    <Modal onClose={onClose}>
     <div className="flex flex-col lg:flex-row gap-8 max-w-full lg:h-[90vh] overflow-auto mx-auto px-4">
  {/* PDF Preview */}
  <div className="flex-1 max-w-full lg:max-w-[700px]">
    <div className="font-bold mb-2 text-blue-700">Original PDF</div>
    {pdfUrl ? (
      <object
        data={pdfUrl}
        type="application/pdf"
        width="100%"
        height="480"
        className="border rounded-xl shadow"
      >
        <iframe
          src={pdfUrl}
          width="100%"
          height="480"
          title="PDF Preview"
          className="border rounded-xl"
        />
        <div className="text-sm text-gray-500">PDF preview not supported in your browser. <a href={pdfUrl} className="underline" target="_blank" rel="noopener noreferrer">Download</a></div>
      </object>
    ) : (
      <div className="text-gray-400 text-sm">No PDF file found.</div>
    )}
  </div>

  {/* Extracted Table */}
  <div className="flex-1 max-w-full lg:max-w-[700px]">
    <div className="font-bold mb-2 text-blue-600">Extracted Table(s)</div>
    {statement.raw_data && statement.raw_data.length > 0 ? (
      <ExtractedTable tables={statement.raw_data} />
    ) : (
      <div className="text-gray-500 text-center">No extracted data found.</div>
    )}
  </div>

  {/* Mapped Table */}
  {/* <div className="flex-1 max-w-full lg:max-w-[500px]">
    <div className="font-bold mb-2 text-purple-700">Mapped Table</div>
    {statement.final_data && statement.final_data.length > 0 ? (
      <DashboardTable
        tables={statement.final_data}
        fieldConfig={statement.field_config || []}
        onEditMapping={() => { }}
        readOnly
      />
    ) : (
      <div className="text-gray-500 text-center">No mapped data found.</div>
    )}
  </div> */}
</div>

    </Modal>
  );
}
