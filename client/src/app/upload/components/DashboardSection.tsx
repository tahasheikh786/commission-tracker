'use client'
import Modal from '../../components/Modal'
import DashboardTable from './DashboardTable'
import ProgressBar from './ProgressBar'
import Loader from './Loader'

type FieldConfig = { field: string, label: string }
type Company = { id: string, name: string } | null

interface DashboardSectionProps {
  company: Company
  uploaded: any
  finalTables: any[]
  fieldConfig: FieldConfig[]
  planTypes: string[]
  submitting: boolean
  showRejectModal: boolean
  rejectReason: string
  onEditMapping: () => void
  onApprove: () => void
  onReject: () => void
  onRejectSubmit: () => void
  onRejectReasonChange: (reason: string) => void
  onCloseRejectModal: () => void
  onTableChange: (tables: any[]) => void
  onSendToPending: () => void
  selectedStatementDate?: any // Add selected statement date prop
}

export default function DashboardSection({
  company,
  uploaded,
  finalTables,
  fieldConfig,
  planTypes,
  submitting,
  showRejectModal,
  rejectReason,
  onEditMapping,
  onApprove,
  onReject,
  onRejectSubmit,
  onRejectReasonChange,
  onCloseRejectModal,
  onTableChange,
  onSendToPending,
  selectedStatementDate
}: DashboardSectionProps) {
  return (
    <>
      {submitting && (
        <div className="fixed inset-0 bg-black bg-opacity-20 flex items-center justify-center z-50">
          <Loader message="Submitting..." />
        </div>
      )}
      
      <div className="h-screen flex flex-col overflow-hidden">
        {/* Progress Bar */}
        <ProgressBar currentStep="dashboard" />

        {/* Header */}
        <div className="flex-shrink-0 bg-white border-b border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-800">Review Statement Data</h2>
              <p className="text-gray-600 text-sm mt-1">
                Review the processed data and approve or reject the statement.
              </p>
            </div>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
          <div className="w-[90%] mx-auto">
            <DashboardTable
              tables={finalTables}
              fieldConfig={fieldConfig}
              onEditMapping={onEditMapping}
              company={company}
              fileName={uploaded?.file_name || "uploaded.pdf"}
              fileUrl={uploaded?.file?.url || null}
              readOnly={false}
              onTableChange={onTableChange}
              planTypes={planTypes}
              onSendToPending={onSendToPending}
              uploadId={uploaded?.upload_id}
              selectedStatementDate={selectedStatementDate}
            />
          </div>
        </div>

        {/* Action Buttons - Fixed at bottom */}
        <div className="flex-shrink-0 bg-white border-t border-gray-200 p-6">
          <div className="w-[90%] mx-auto">
            <div className="flex justify-center gap-6">
              <button
                className="bg-green-600 text-white px-8 py-3 rounded-xl font-semibold shadow hover:bg-green-700 transition text-lg"
                onClick={onApprove}
              >
                Approve
              </button>
              <button
                className="bg-red-600 text-white px-8 py-3 rounded-xl font-semibold shadow hover:bg-red-700 transition text-lg"
                onClick={onReject}
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      </div>

      {showRejectModal && (
        <Modal onClose={onCloseRejectModal}>
          <div>
            <div className="mb-2 font-bold text-lg text-gray-800">Reject Submission</div>
            <input
              className="border rounded px-2 py-1 w-full mb-3"
              placeholder="Enter rejection reason"
              value={rejectReason}
              onChange={e => onRejectReasonChange(e.target.value)}
            />
            <div className="flex gap-3 mt-4">
              <button
                className="bg-red-600 text-white px-4 py-2 rounded font-semibold"
                disabled={!rejectReason.trim()}
                onClick={onRejectSubmit}
              >Submit</button>
              <button
                className="bg-gray-300 text-gray-800 px-4 py-2 rounded"
                onClick={onCloseRejectModal}
              >Cancel</button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
