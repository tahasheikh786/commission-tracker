'use client'
import Modal from '../../components/Modal'
import DashboardTable from './DashboardTable'
import ProgressBar from './ProgressBar'
import { ApprovalLoader } from '../../components/ui/FullScreenLoader'
import toast from 'react-hot-toast'

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
  approvalProgress?: { totalRows: number; processedRows: number }
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
  selectedStatementDate,
  approvalProgress = { totalRows: 0, processedRows: 0 }
}: DashboardSectionProps) {
  
  
  const calculatedProgress = approvalProgress.totalRows > 0 ? Math.round((approvalProgress.processedRows / approvalProgress.totalRows) * 100) : 0
  
  

  return (
    <>
      <ApprovalLoader 
        isVisible={submitting}
        progress={calculatedProgress}
        totalRows={approvalProgress.totalRows}
        processedRows={approvalProgress.processedRows}
        onCancel={() => {
          // Note: Approval process cannot be cancelled as it's a server-side process
          toast.error("Approval process is already in progress and cannot be cancelled");
        }}
      />
      
      <div className="h-screen flex flex-col overflow-hidden">
        {/* Progress Bar */}
        <ProgressBar currentStep="dashboard" />

        {/* Header */}
        <div className="flex-shrink-0 bg-white border-b border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-2xl font-bold text-slate-800">Review Statement Data</h2>
              <p className="text-slate-600 mt-1">
                Review the processed data and approve or reject the statement.
              </p>
            </div>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
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
        <div className="flex-shrink-0 bg-white border-t border-slate-200 p-6">
          <div className="w-[90%] mx-auto">
            <div className="flex justify-center gap-6">
              <button
                className="px-8 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105"
                onClick={() => {
                  console.log('🔘 Approve button clicked')
                  onApprove()
                }}
              >
                Approve
              </button>
              <button
                className="px-8 py-3 bg-gradient-to-r from-red-500 to-rose-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105"
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
          <div className="p-6">
            <div className="mb-4">
              <h3 className="text-xl font-bold text-slate-800 mb-2">Reject Submission</h3>
              <p className="text-slate-600 text-sm">Please provide a reason for rejecting this submission.</p>
            </div>
            <input
              className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent mb-4"
              placeholder="Enter rejection reason"
              value={rejectReason}
              onChange={e => onRejectReasonChange(e.target.value)}
            />
            <div className="flex gap-3 justify-end">
              <button
                className="px-6 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors font-medium"
                onClick={onCloseRejectModal}
              >
                Cancel
              </button>
              <button
                className="px-6 py-2 bg-gradient-to-r from-red-500 to-rose-600 text-white rounded-lg hover:shadow-lg transition-all duration-200 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!rejectReason.trim()}
                onClick={onRejectSubmit}
              >
                Submit
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
