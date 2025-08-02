'use client'
import { useDropzone } from 'react-dropzone'
import toast from 'react-hot-toast'
import { useCallback, useState } from 'react'
import clsx from 'clsx'
import Loader from './Loader'

type TableData = {
  header: string[]
  rows: string[][]
  metadata?: {
    quality_metrics?: {
      overall_score: number
      completeness: number
      consistency: number
      accuracy: number
      structure_quality: number
      data_quality: number
      confidence_level: string
      is_valid: boolean
    }
    validation_warnings?: string[]
  }
}

type ExtractionConfig = {
  dpi: number
  header_similarity_threshold: number
  min_quality_score: number
  description: string
}

type QualitySummary = {
  total_tables: number
  valid_tables: number
  average_quality_score: number
  overall_confidence: string
  issues_found: string[]
  recommendations: string[]
}



function Spinner() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30 transition-all">
      <div className="flex flex-col items-center">
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-500 shadow-lg" />
        <div className="mt-6 text-xl font-semibold text-blue-800 animate-pulse">
          Advanced extraction in progress…
        </div>
      </div>
    </div>
  )
}

// Quality indicator component
function QualityIndicator({ score, level }: { score: number, level: string }) {
  const getColor = (level: string) => {
    switch (level) {
      case 'VERY_HIGH': return 'text-green-600 bg-green-100'
      case 'HIGH': return 'text-green-600 bg-green-100'
      case 'MEDIUM_HIGH': return 'text-yellow-600 bg-yellow-100'
      case 'MEDIUM': return 'text-yellow-600 bg-yellow-100'
      case 'MEDIUM_LOW': return 'text-orange-600 bg-orange-100'
      case 'LOW': return 'text-red-600 bg-red-100'
      default: return 'text-gray-600 bg-gray-100'
    }
  }

  return (
    <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getColor(level)}`}>
      <div className={`w-2 h-2 rounded-full mr-1 ${level.includes('HIGH') ? 'bg-green-500' : level.includes('MEDIUM') ? 'bg-yellow-500' : 'bg-red-500'}`} />
      {level.replace('_', ' ')}
    </div>
  )
}

// Enhanced table preview with quality metrics
function AdvancedTablePreview({ tables, qualitySummary }: { tables: TableData[], qualitySummary?: QualitySummary }) {
  if (!tables.length) return null

  return (
    <div className="mt-8 space-y-8">
      {/* Quality Summary */}
      {qualitySummary && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 shadow rounded-xl p-6">
          <h3 className="text-lg font-semibold text-blue-800 mb-4">Extraction Quality Summary</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{qualitySummary.total_tables}</div>
              <div className="text-sm text-gray-600">Total Tables</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{qualitySummary.valid_tables}</div>
              <div className="text-sm text-gray-600">Valid Tables</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">{(qualitySummary.average_quality_score * 100).toFixed(1)}%</div>
              <div className="text-sm text-gray-600">Avg Quality</div>
            </div>
            <div className="text-center">
              <QualityIndicator score={qualitySummary.average_quality_score} level={qualitySummary.overall_confidence} />
              <div className="text-sm text-gray-600 mt-1">Confidence</div>
            </div>
          </div>
          
          {/* Issues and Recommendations */}
          {(qualitySummary.issues_found.length > 0 || qualitySummary.recommendations.length > 0) && (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              {qualitySummary.issues_found.length > 0 && (
                <div>
                  <h4 className="font-semibold text-red-700 mb-2">Issues Found:</h4>
                  <ul className="text-sm text-red-600 space-y-1">
                    {qualitySummary.issues_found.map((issue, idx) => (
                      <li key={idx} className="flex items-start">
                        <span className="text-red-500 mr-2">•</span>
                        {issue}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {qualitySummary.recommendations.length > 0 && (
                <div>
                  <h4 className="font-semibold text-blue-700 mb-2">Recommendations:</h4>
                  <ul className="text-sm text-blue-600 space-y-1">
                    {qualitySummary.recommendations.map((rec, idx) => (
                      <li key={idx} className="flex items-start">
                        <span className="text-blue-500 mr-2">•</span>
                        {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tables */}
      {tables.map((table, idx) => (
        <div key={idx} className="bg-white border shadow rounded-xl p-4 overflow-x-auto">
          <div className="flex items-center justify-between mb-4">
            <div className="font-bold text-lg text-blue-700">Extracted Table {idx + 1}</div>
            {table.metadata?.quality_metrics && (
              <div className="flex items-center gap-2">
                <QualityIndicator 
                  score={table.metadata.quality_metrics.overall_score} 
                  level={table.metadata.quality_metrics.confidence_level} 
                />
                <span className="text-sm text-gray-500">
                  Score: {(table.metadata.quality_metrics.overall_score * 100).toFixed(1)}%
                </span>
              </div>
            )}
          </div>
          
          {/* Quality Metrics Details */}
          {table.metadata?.quality_metrics && (
            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
                <div>
                  <div className="font-semibold text-gray-700">Completeness</div>
                  <div className="text-blue-600">{(table.metadata.quality_metrics.completeness * 100).toFixed(1)}%</div>
                </div>
                <div>
                  <div className="font-semibold text-gray-700">Consistency</div>
                  <div className="text-blue-600">{(table.metadata.quality_metrics.consistency * 100).toFixed(1)}%</div>
                </div>
                <div>
                  <div className="font-semibold text-gray-700">Accuracy</div>
                  <div className="text-blue-600">{(table.metadata.quality_metrics.accuracy * 100).toFixed(1)}%</div>
                </div>
                <div>
                  <div className="font-semibold text-gray-700">Structure</div>
                  <div className="text-blue-600">{(table.metadata.quality_metrics.structure_quality * 100).toFixed(1)}%</div>
                </div>
                <div>
                  <div className="font-semibold text-gray-700">Data Quality</div>
                  <div className="text-blue-600">{(table.metadata.quality_metrics.data_quality * 100).toFixed(1)}%</div>
                </div>
              </div>
            </div>
          )}

          {/* Validation Warnings */}
          {table.metadata?.validation_warnings && table.metadata.validation_warnings.length > 0 && (
            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <h4 className="font-semibold text-yellow-800 mb-2">Validation Warnings:</h4>
              <ul className="text-sm text-yellow-700 space-y-1">
                {table.metadata.validation_warnings.map((warning, wIdx) => (
                  <li key={wIdx} className="flex items-start">
                    <span className="text-yellow-500 mr-2">⚠</span>
                    {warning}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Table Content */}
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

export default function AdvancedUploadZone({
  onParsed,
  disabled,
  companyId,
}: {
  onParsed: (result: { 
    tables: TableData[], 
    upload_id?: string, 
    file_name: string, 
    file: File,
    quality_summary?: QualitySummary,
    extraction_config?: any
  }) => void,
  disabled?: boolean,
  companyId: string
}) {
  const [tables, setTables] = useState<TableData[]>([])
  const [loading, setLoading] = useState(false)
  const [qualitySummary, setQualitySummary] = useState<QualitySummary | null>(null)

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    setTables([])
    setQualitySummary(null)
    setLoading(false)
    if (!acceptedFiles || acceptedFiles.length === 0) return

    const file = acceptedFiles[0]
    if (file.size > 10 * 1024 * 1024) { // Increased to 10MB for advanced processing
      toast.error("File too large (max 10MB)")
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
      toast.loading('AI-powered extraction in progress...', { id: 'extracting' })
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/extract-tables/`, {
        method: 'POST',
        body: formData,
      })
      toast.dismiss('extracting')
      setLoading(false)
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        toast.error(errorData.detail || "Failed to extract tables")
        return
      }
      
      const json = await res.json()
      setTables(json.tables || [])
      setQualitySummary(json.quality_summary || null)
      
      if (onParsed) onParsed({
        tables: json.tables || [],
        upload_id: json.upload_id,
        file_name: json.s3_key || file.name, // Use S3 key if available, fallback to original filename
        file,
        quality_summary: json.quality_summary,
        extraction_config: json.extraction_config
      })
      
      toast.success('Extraction completed successfully!')
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
      {loading && <Loader message="AI-powered extraction in progress…" />}

      {/* Upload Zone */}
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
          <div className="text-6xl drop-shadow-lg group-hover:animate-bounce transition-all">🚀</div>
          <div className="text-2xl font-bold tracking-wide">AI-Powered PDF Processing</div>
          <div className="text-base opacity-80 font-medium">Drop your commission statement PDF here</div>
          <div className="text-sm opacity-70 italic">
            Up to <span className="font-semibold">10MB</span> • Automatic quality assessment
          </div>
        </div>
      </div>

      <AdvancedTablePreview tables={tables} qualitySummary={qualitySummary || undefined} />
    </div>
  )
} 