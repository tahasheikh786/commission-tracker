"use client"

import { useEffect, useState } from 'react'
import { Eye } from 'lucide-react'
import Modal from '../components/Modal'
import DashboardTable from '../upload/components/DashboardTable'

export default function ReviewPage() {
    const [submissions, setSubmissions] = useState<any[]>([])
    const [previewIdx, setPreviewIdx] = useState<number | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        async function fetchReviews() {
            setLoading(true)
            const res = await fetch('http://localhost:8000/review/all/')
            const data = await res.json()
            setSubmissions(data)
            setLoading(false)
        }
        fetchReviews()
    }, [])

    return (
        <main className="min-h-screen bg-gradient-to-br from-gray-100 to-blue-50 flex flex-col items-center px-4">
            <div className="w-full max-w-5xl mt-12 shadow-2xl bg-white/90 rounded-3xl p-10 border">
                <h1 className="text-3xl font-bold mb-8 text-gray-800 text-center">
                    <span className="bg-gradient-to-r from-blue-600 to-indigo-500 text-transparent bg-clip-text">
                        Review Uploaded Statements
                    </span>
                </h1>
                <table className="min-w-full bg-white shadow rounded-xl">
                    <thead>
                        <tr className="bg-blue-100">
                            <th className="px-4 py-3 text-left">Company Name</th>
                            <th className="px-4 py-3 text-left">File</th>
                            <th className="px-4 py-3 text-center">Preview</th>
                            <th className="px-4 py-3 text-center">Status</th>
                            <th className="px-4 py-3 text-left">Rejection Reason</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={5} className="text-gray-500 py-6 text-center">Loading...</td></tr>
                        ) : submissions.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="text-gray-500 py-6 text-center">No submissions yet.</td>
                            </tr>
                        ) : (
                            submissions.map((sub, idx) => (
                                <tr key={sub.id} className="border-t">
                                    <td className="px-4 py-2">{sub.company_name || sub.companyName || ''}</td>
                                    <td className="px-4 py-2">{sub.file_name || sub.fileName || ''}</td>
                                    <td className="px-4 py-2 text-center">
                                        <button
                                            onClick={() => setPreviewIdx(idx)}
                                            className="text-blue-600 hover:bg-blue-50 rounded p-2"
                                        >
                                            <Eye size={20} />
                                        </button>
                                    </td>
                                    <td className="px-4 py-2 text-center">
                                        <span className={
                                            sub.status === 'Approved'
                                                ? "bg-green-100 text-green-700 px-3 py-1 rounded-xl font-semibold"
                                                : "bg-red-100 text-red-700 px-3 py-1 rounded-xl font-semibold"
                                        }>
                                            {sub.status}
                                        </span>
                                    </td>
                                    <td className="px-4 py-2">{sub.rejection_reason || sub.rejectionReason || '-'}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
            {previewIdx !== null && submissions[previewIdx] && (
                <Modal onClose={() => setPreviewIdx(null)}>
                    <div className="max-w-3xl max-h-[80vh] overflow-auto">
                        <div className="mb-2 font-semibold">Table Preview</div>
                        {submissions[previewIdx].final_data && submissions[previewIdx].final_data.length > 0 ? (
                            <DashboardTable
                                tables={submissions[previewIdx].final_data}
                                fieldConfig={submissions[previewIdx].field_config || []}
                                onEditMapping={() => { }} // No mapping in preview
                                readOnly
                            />
                        ) : (
                            <div className="text-gray-500 py-8 text-center">
                                No data available for this statement.
                            </div>
                        )}
                    </div>
                </Modal>
            )}

        </main>
    )
}
