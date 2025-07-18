'use client'
import { useDropzone } from 'react-dropzone'
import toast from 'react-hot-toast'
import { useCallback, useState } from 'react'
import clsx from 'clsx'
import Loader from './Loader';

type TableData = {
  header: string[]
  rows: string[][]
}

function Spinner() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30 transition-all">
      <div className="flex flex-col items-center">
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-500 shadow-lg" />
        <div className="mt-6 text-xl font-semibold text-blue-800 animate-pulse">
          Extracting tables, please wait…
        </div>
      </div>
    </div>
  )
}

// Simple table preview
function TablePreview({ tables }: { tables: TableData[] }) {
  if (!tables.length) return null
  return (
    <div className="mt-8 space-y-8">
      {tables.map((table, idx) => (
        <div key={idx} className="bg-white border shadow rounded-xl p-4 overflow-x-auto">
          <div className="mb-2 font-bold text-lg text-blue-700">Extracted Table {idx + 1}</div>
          <table className="min-w-full">
            <thead>
              <tr>
                {table.header.map((h, i) => (
                  <th key={i} className="border-b px-3 py-2 bg-blue-50 font-semibold text-gray-700">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.slice(0, 10).map((row, ridx) => (
                <tr key={ridx}>
                  {row.map((cell, cidx) => (
                    <td key={cidx} className="px-3 py-1 border-b text-gray-800">{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {table.rows.length > 10 && (
            <div className="text-xs text-gray-400 mt-1">
              Showing first 10 of {table.rows.length} rows...
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ***** ACCEPT companyId prop! *****
export default function UploadZone({
  onParsed,
  disabled,
  companyId,
}: {
  onParsed: (result: { tables: TableData[], upload_id?: string, file_name: string, file: File }) => void,
  disabled?: boolean,
  companyId: string
}) {
  const [tables, setTables] = useState<TableData[]>([])
  const [loading, setLoading] = useState(false)

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    setTables([])
    setLoading(false)
    if (!acceptedFiles || acceptedFiles.length === 0) return

    const file = acceptedFiles[0]
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File too large (max 5MB)")
      return
    }
    if (file.type !== "application/pdf") {
      toast.error("Only PDF files are supported")
      return
    }

    setLoading(true)
    const formData = new FormData()
    formData.append('file', file)
    formData.append('company_id', companyId)

    try {
      toast.loading('Extracting tables...', { id: 'extracting' })
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/extract-tables/`, {
        method: 'POST',
        body: formData,
      })
      toast.dismiss('extracting')
      setLoading(false)
      if (!res.ok) {
        toast.error("Failed to extract tables")
        return
      }
      const json = await res.json()
      setTables(json.tables || [])
      if (onParsed) onParsed({
        tables: json.tables || [],
        upload_id: json.upload_id,
        file_name: file.name,
        file,
      })
      toast.success('Tables extracted!')
    } catch (e) {
      setLoading(false)
      toast.dismiss('extracting')
      toast.error("Failed to extract tables: " + (e as any)?.message)
    }
  }, [onParsed, companyId])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
    disabled,
  })

  return (
    <div className="relative">
      {loading && <Loader message="Extracting tables, please wait…" />}

      <div
        {...getRootProps()}
        className={clsx(
          "border-4 border-dashed rounded-2xl p-10 bg-gradient-to-br from-blue-400 via-indigo-400 to-purple-400 shadow-2xl flex flex-col items-center justify-center text-white cursor-pointer transition-transform duration-300 group",
          "hover:scale-105 hover:shadow-3xl",
          isDragActive && "border-blue-600 bg-blue-100 text-blue-800",
          disabled && "opacity-60 pointer-events-none"
        )}
        style={{ minHeight: 240 }}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center space-y-5">
          <div className="text-6xl drop-shadow-lg group-hover:animate-bounce transition-all">☁️</div>
          <div className="text-2xl font-bold tracking-wide">Drop your PDF here</div>
          <div className="text-base opacity-80 font-medium">Only PDF files, up to <span className="font-semibold">5MB</span></div>
          <div className="text-sm opacity-70 italic">
            Or click to select a file
          </div>
        </div>
      </div>

      <TablePreview tables={tables} />
    </div>
  )
}
