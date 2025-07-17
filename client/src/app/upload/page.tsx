'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import CompanySelect from './components/CompanySelect'
import UploadZone from './components/UploadZone'
import ExtractedTables from './components/ExtractedTable'
import DashboardTable from './components/DashboardTable'
import FieldMapper from './components/FieldMapper'
import { Toaster, toast } from 'react-hot-toast'
import { STANDARD_FIELDS } from '@/constants/fields'
import Modal from '@/app/components/Modal'

export default function UploadPage() {
  const [company, setCompany] = useState<{ id: string, name: string } | null>(null)
  const [uploaded, setUploaded] = useState<any>(null)
  const [mapping, setMapping] = useState<Record<string, string> | null>(null)
  const [fieldConfig, setFieldConfig] = useState<{ field: string, label: string }[]>(STANDARD_FIELDS)
  const [finalTables, setFinalTables] = useState<any[]>([])
  const [fetchingMapping, setFetchingMapping] = useState(false)
  const [showFieldMapper, setShowFieldMapper] = useState(false)
  const [skipped, setSkipped] = useState(false)
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [planTypes, setPlanTypes] = useState<string[]>([])


  const fetchMappingRef = useRef(false)
  const router = useRouter()
  function getLabelFromStandardFields(fieldKey: string) {
    return (STANDARD_FIELDS.find(f => f.field === fieldKey)?.label) || fieldKey;
  }

  function handleReset() {
    setCompany(null)
    setUploaded(null)
    setMapping(null)
    setFinalTables([])
    setFieldConfig(STANDARD_FIELDS)
    fetchMappingRef.current = false
    setShowFieldMapper(false)
    setSkipped(false)
    setShowRejectModal(false)
    setRejectReason('')
  }

  // Must match UploadZone's onParsed prop!
  function handleUploadResult({ tables, upload_id, file_name, file, plan_types, field_config }: any) {
    setUploaded({ tables, upload_id, file_name, file })
    setMapping(null)
    setFinalTables([])
    setFieldConfig(field_config || STANDARD_FIELDS)
    fetchMappingRef.current = false
    setShowFieldMapper(false)
    setSkipped(false)
    setShowRejectModal(false)
    setRejectReason('')
    if (plan_types) setPlanTypes(plan_types)
  }

  // NEW: Handle table name changes from ExtractedTables
  function handleExtractedTablesChange(newTables: any[]) {
    setUploaded((prev: any) => prev ? { ...prev, tables: newTables } : prev)
  }

  function applyMapping(
    tables: any[],
    mapping: Record<string, string>,
    fieldConfigOverride: { field: string, label: string }[]
  ) {
    const mappedRows = []
    for (const table of tables) {
      for (const row of table.rows) {
        const obj: any = {}
        for (const dashField in mapping) {
          const colName = mapping[dashField]
          const idx = table.header.findIndex((h: string) => h === colName)
          obj[dashField] = (idx !== -1) ? row[idx] : ''
        }
        mappedRows.push(obj)
      }
    }
    const dashboardHeader = fieldConfigOverride.map(f => f.field)
    const dashboardRows = mappedRows.map(obj => dashboardHeader.map(f => obj[f] || ""))
    // Preserve table names if present
    setFinalTables([{ header: dashboardHeader, rows: dashboardRows, name: tables[0]?.name || '' }])
  }

  async function handleApprove() {
    if (!uploaded?.upload_id) return
    setSubmitting(true)
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/review/approve/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          upload_id: uploaded.upload_id,
          final_data: finalTables,
          field_config: fieldConfig,
          plan_types: planTypes,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        toast.error(err?.detail || "Approve failed!")
        setSubmitting(false)
        return
      }
      toast.success("Submission approved!")
      setTimeout(() => router.push('/review'), 1200)
    } catch (err) {
      toast.error("Network error!")
      setSubmitting(false)
    }
  }

  function handleReject() {
    setShowRejectModal(true)
    setRejectReason('')
  }

  async function handleRejectSubmit() {
    if (!uploaded?.upload_id) return
    setSubmitting(true)
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/review/reject/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          upload_id: uploaded.upload_id,
          final_data: finalTables, // <- include this!
          rejection_reason: rejectReason,
          field_config: fieldConfig,
          plan_types: planTypes,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        toast.error(err?.detail || "Reject failed!")
        setSubmitting(false)
        return
      }
      toast.success("Submission rejected!")
      setTimeout(() => router.push('/review'), 1200)
    } catch (err) {
      toast.error("Network error!")
      setSubmitting(false)
    }
  }

  // 1. Company select & upload zone
  if (!company || !uploaded) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-gray-100 to-blue-50 flex items-center justify-center px-4">
        <div className="w-full max-w-6xl mx-auto shadow-2xl bg-white/80 rounded-3xl p-14 border">
          <h1 className="text-4xl font-extrabold mb-8 text-gray-800 text-center tracking-tight">
            <span className="bg-gradient-to-r from-blue-600 to-indigo-500 text-transparent bg-clip-text">
              Commission Statement Upload
            </span>
          </h1>
          <div className="flex flex-col md:flex-row gap-12 mb-6">
            <div className="flex-1 min-w-[250px]">
              <CompanySelect value={company?.id} onChange={c => { setCompany(c) }} />
            </div>
            <div className="flex-1 min-w-[320px]">
              <UploadZone
                onParsed={handleUploadResult}
                disabled={!company}
                companyId={company?.id || ''}
              />
            </div>
          </div>
          <div className="text-center text-sm text-gray-500 mt-2">
            Please select a carrier and upload a PDF commission statement.
          </div>
          <Toaster position="top-center" />
        </div>
      </main>
    )
  }

  // 2. If mapping exists, auto-apply; else, show FieldMapper (skip if skipped)
  if ((!mapping || showFieldMapper) && uploaded?.tables?.length && company && !skipped) {
    if (!fetchMappingRef.current && !fetchingMapping && !showFieldMapper) {
      fetchMappingRef.current = true
      setFetchingMapping(true)
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/companies/${company.id}/mapping/`)
        .then(r => r.json())
        .then(map => {
          let mappingObj = null
          let fieldsArr = fieldConfig
          let loadedPlanTypes = null
          let loadedTableNames = null
          if (map && typeof map === 'object') {
            if (map.mapping) {
              mappingObj = map.mapping
              fieldsArr = map.field_config || fieldConfig
              if (map.plan_types) loadedPlanTypes = map.plan_types
              if (map.table_names) loadedTableNames = map.table_names
            } else if (Array.isArray(map)) {
              mappingObj = {}
              fieldsArr = []
              map.forEach((row: any) => {
                mappingObj[row.field_key] = row.column_name
                if (!fieldsArr.some(f => f.field === row.field_key))
                  fieldsArr.push({
                    field: row.field_key,
                    label: getLabelFromStandardFields(row.field_key) // Use pretty label!
                  })
              })
              if (!fieldsArr.length) fieldsArr = fieldConfig
            }
          }
          if (mappingObj && Object.keys(mappingObj).length) {
            setMapping(mappingObj)
            setFieldConfig(fieldsArr)
            applyMapping(uploaded.tables, mappingObj, fieldsArr)
            if (loadedPlanTypes) setPlanTypes(loadedPlanTypes)
            // Optionally set table names if needed
          }
          setFetchingMapping(false)
        })
        .catch(() => setFetchingMapping(false))
    }

    if (fetchingMapping && !showFieldMapper) {
      return (
        <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-100 to-blue-50">
          <div className="text-lg font-semibold text-blue-700 animate-pulse">Loading saved mapping...</div>
        </main>
      )
    }

    return (
      <main className="min-h-screen bg-gradient-to-br from-gray-100 to-blue-50 flex items-center justify-center px-4">
        <div className="w-full mx-auto shadow-2xl bg-white/90 rounded-3xl p-10 border">
          <h1 className="text-3xl font-bold mb-8 text-gray-800 text-center tracking-tight">
            <span className="bg-gradient-to-r from-blue-600 to-indigo-500 text-transparent bg-clip-text">
              Map Fields for {company.name}
            </span>
          </h1>
          <div className="grid grid-cols-10 gap-0 relative w-full min-h-[650px]">
            {/* LEFT: Field Mapper (3/10 columns) */}
            <div className="col-span-3 flex flex-col items-stretch justify-center px-4 py-6 min-w-[320px] max-w-[500px]">
              <div className="mb-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-600 to-indigo-400 flex items-center justify-center shadow text-white text-xl font-bold">
                    <span>1</span>
                  </div>
                  <span className="text-xl font-semibold text-gray-800 tracking-tight">
                    Map Your Data Fields
                  </span>
                </div>
                <p className="text-gray-500 text-sm pl-1">
                  Match each required field to the correct column in your uploaded table.<br />
                  This helps us standardize your commission statement.
                </p>
              </div>
              <FieldMapper
                company={company}
                columns={uploaded.tables[0].header}
                initialPlanTypes={planTypes}
                onSave={async (map, fieldConf, selectedPlanTypes) => {
                  setMapping(map)
                  setFieldConfig(fieldConf)
                  setPlanTypes(selectedPlanTypes)
                  // Compose MappingConfig object
                  const config = {
                    mapping: map,
                    plan_types: selectedPlanTypes,
                    table_names: uploaded.tables.map((t: any) => t.name || ''),
                    field_config: fieldConf,
                  }
                  await fetch(`${process.env.NEXT_PUBLIC_API_URL}/companies/${company.id}/mapping/`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(config),
                  })
                  applyMapping(uploaded.tables, map, fieldConf)
                  setShowFieldMapper(false)
                }}
                onSkip={() => {
                  // Preserve table names if present
                  setFinalTables(uploaded.tables.map((t: any) => ({ ...t })))
                  setFieldConfig(fieldConfig)
                  setShowFieldMapper(false)
                  setMapping(null)
                  setSkipped(true)
                }}
                initialFields={fieldConfig}
                initialMapping={mapping}
              />
            </div>
            {/* Divider */}
            <div className="hidden md:block absolute left-[30%] top-0 h-full w-0.5 bg-gradient-to-b from-blue-100 to-purple-200 opacity-60 rounded-full shadow pointer-events-none" />
            {/* RIGHT: Table (7/10 columns) */}
            <div className="col-span-7 flex flex-col items-stretch px-6 py-6 min-w-0">
              <h2 className="font-semibold text-gray-700 mb-2">Extracted Table Preview</h2>
              <ExtractedTables tables={uploaded.tables} onTablesChange={handleExtractedTablesChange} />
            </div>
          </div>
          <div className="flex justify-center mt-8">
            <button onClick={handleReset} className="px-4 py-2 rounded bg-gray-300 text-gray-700 hover:bg-gray-400">
              Start Over
            </button>
          </div>
          <Toaster position="top-center" />
        </div>
      </main>
    )
  }

  // 3. Show mapped/standardized table views **or** skipped/raw extracted table view + Approve/Reject buttons
  if ((mapping && !showFieldMapper) || skipped) {

    return (
      <>
        {submitting && (
          <div className="fixed inset-0 bg-black bg-opacity-20 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 flex flex-col items-center shadow-lg">
              <svg className="animate-spin h-8 w-8 text-blue-600 mb-3" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
              <div className="text-blue-700 font-bold text-lg">Submitting...</div>
            </div>
          </div>
        )}
        <main className="min-h-screen bg-gradient-to-br from-gray-100 to-blue-50 flex items-center justify-center px-4">
          <div className="w-full max-w-[1800px] md:w-[92vw] mx-auto shadow-2xl bg-white/90 rounded-3xl p-10 border">
            <h1 className="text-4xl font-extrabold mb-8 text-gray-800 text-center tracking-tight">
              <span className="bg-gradient-to-r from-blue-600 to-indigo-500 text-transparent bg-clip-text">
                Commission Statement Upload
              </span>
            </h1>
            <div className="flex justify-center mb-4">
              <button
                onClick={handleReset}
                className="px-4 py-2 rounded bg-blue-600 text-white font-semibold shadow hover:bg-blue-700 transition"
              >
                Upload Another PDF
              </button>
            </div>
            <DashboardTable
              tables={finalTables}
              fieldConfig={fieldConfig}
              onEditMapping={() => setShowFieldMapper(true)}
              company={company}
              fileName={uploaded?.file_name || "uploaded.pdf"}
              fileUrl={uploaded?.file?.url || null}
              readOnly={false}
              onTableChange={setFinalTables}
              planTypes={planTypes}
            />

            <div className="flex justify-center gap-6 mt-8">
              <button
                className="bg-green-600 text-white px-6 py-2 rounded-xl font-semibold shadow hover:bg-green-700 transition text-lg"
                onClick={handleApprove}
              >
                Approve
              </button>
              <button
                className="bg-red-600 text-white px-6 py-2 rounded-xl font-semibold shadow hover:bg-red-700 transition text-lg"
                onClick={handleReject}
              >
                Reject
              </button>
            </div>
            {showRejectModal && (
              <Modal onClose={() => setShowRejectModal(false)}>
                <div>
                  <div className="mb-2 font-bold text-lg text-gray-800">Reject Submission</div>
                  <input
                    className="border rounded px-2 py-1 w-full mb-3"
                    placeholder="Enter rejection reason"
                    value={rejectReason}
                    onChange={e => setRejectReason(e.target.value)}
                  />
                  <div className="flex gap-3 mt-4">
                    <button
                      className="bg-red-600 text-white px-4 py-2 rounded font-semibold"
                      disabled={!rejectReason.trim()}
                      onClick={handleRejectSubmit}
                    >Submit</button>
                    <button
                      className="bg-gray-300 text-gray-800 px-4 py-2 rounded"
                      onClick={() => setShowRejectModal(false)}
                    >Cancel</button>
                  </div>
                </div>
              </Modal>
            )}
            <Toaster position="top-center" />
          </div>
        </main>
      </>

    )
  }

  // fallback: shouldn't ever get here
  return null
}
