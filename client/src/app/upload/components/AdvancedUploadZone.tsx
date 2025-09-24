'use client'
import { useDropzone } from 'react-dropzone'
import toast from 'react-hot-toast'
import { useCallback, useState } from 'react'
import clsx from 'clsx'
import { Calendar, Upload } from 'lucide-react' // Added import for Calendar and Upload icons
import { ExtractionLoader } from '../../components/ui/FullScreenLoader'
import axios from 'axios'

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
    <div className="mt-6 space-y-6">
      {/* Quality Summary */}
      {qualitySummary && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-blue-800 mb-4">Extraction Quality Summary</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{qualitySummary.total_tables}</div>
              <div className="text-sm text-slate-600">Total Tables</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{qualitySummary.valid_tables}</div>
              <div className="text-sm text-slate-600">Valid Tables</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">{(qualitySummary.average_quality_score * 100).toFixed(1)}%</div>
              <div className="text-sm text-slate-600">Avg Quality</div>
            </div>
            <div className="text-center">
              <QualityIndicator score={qualitySummary.average_quality_score} level={qualitySummary.overall_confidence} />
              <div className="text-sm text-slate-600 mt-1">Confidence</div>
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
        <div key={idx} className="bg-white border border-slate-200 rounded-xl p-4 overflow-x-auto">
          <div className="flex items-center justify-between mb-4">
            <div className="font-semibold text-lg text-slate-800">Extracted Table {idx + 1}</div>
            {table.metadata?.quality_metrics && (
              <div className="flex items-center gap-2">
                <QualityIndicator 
                  score={table.metadata.quality_metrics.overall_score} 
                  level={table.metadata.quality_metrics.confidence_level} 
                />
                <span className="text-sm text-slate-500">
                  Score: {(table.metadata.quality_metrics.overall_score * 100).toFixed(1)}%
                </span>
              </div>
            )}
          </div>
          
          {/* Quality Metrics Details */}
          {table.metadata?.quality_metrics && (
            <div className="mb-4 p-3 bg-slate-50 rounded-lg">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
                <div>
                  <div className="font-medium text-slate-700">Completeness</div>
                  <div className="text-blue-600">{(table.metadata.quality_metrics.completeness * 100).toFixed(1)}%</div>
                </div>
                <div>
                  <div className="font-medium text-slate-700">Consistency</div>
                  <div className="text-blue-600">{(table.metadata.quality_metrics.consistency * 100).toFixed(1)}%</div>
                </div>
                <div>
                  <div className="font-medium text-slate-700">Accuracy</div>
                  <div className="text-blue-600">{(table.metadata.quality_metrics.accuracy * 100).toFixed(1)}%</div>
                </div>
                <div>
                  <div className="font-medium text-slate-700">Structure</div>
                  <div className="text-blue-600">{(table.metadata.quality_metrics.structure_quality * 100).toFixed(1)}%</div>
                </div>
                <div>
                  <div className="font-medium text-slate-700">Data Quality</div>
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
                  <th key={i} className="border-b border-slate-200 px-3 py-2 bg-slate-50 font-medium text-slate-700">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.slice(0, 10).map((row, ridx) => (
                <tr key={ridx} className="hover:bg-slate-50">
                  {row.map((cell, cidx) => (
                    <td key={cidx} className="px-3 py-2 border-b border-slate-100 text-slate-800">{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {table.rows.length > 10 && (
            <div className="text-xs text-slate-500 mt-2 text-center">
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
  selectedStatementDate, // Add selected statement date prop
}: {
  onParsed: (result: { 
    tables: TableData[], 
    upload_id?: string, 
    file_name: string, 
    file: File,
    quality_summary?: QualitySummary,
    extraction_config?: any,
    format_learning?: any
  }) => void,
  disabled?: boolean,
  companyId: string,
  selectedStatementDate?: any // Add selected statement date prop type
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
    if (file.size > 50 * 1024 * 1024) { // Increased to 50MB for Excel files
      toast.error("File too large (max 50MB)")
      return
    }

    // Check file type and determine extraction endpoint
    const isExcel = file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || 
                   file.type === "application/vnd.ms-excel" ||
                   file.name.toLowerCase().endsWith('.xlsx') ||
                   file.name.toLowerCase().endsWith('.xls') ||
                   file.name.toLowerCase().endsWith('.xlsm') ||
                   file.name.toLowerCase().endsWith('.xlsb')
    
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith('.pdf')

    if (!isExcel && !isPdf) {
      toast.error("Only PDF and Excel files are supported")
      return
    }

    setLoading(true)
    const formData = new FormData()
    formData.append('file', file)
    formData.append('company_id', companyId)

    const loadingMessage = isExcel ? 'Excel extraction in progress...' : 'AI-powered extraction in progress...'
    toast.loading(loadingMessage, { id: 'extracting' })
    
    // Choose endpoint based on file type
    const endpoint = isExcel ? '/extract-tables-excel/' : '/extract-tables-smart/'
    
    try {
      const res = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}${endpoint}`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })
      
      // Handle duplicate detection response
      if (res.status === 409) {
        const duplicateData = res.data
        toast.dismiss('extracting')
        
        if (duplicateData.status === 'duplicate_detected') {
          // Show duplicate detection modal/dialog
          const shouldReplace = window.confirm(
            `${duplicateData.message}\n\nDo you want to replace the existing file?`
          )
          
          if (shouldReplace) {
            // Retry upload with replace flag
            formData.append('replace_duplicate', 'true')
            const retryRes = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}${endpoint}`, formData, {
              headers: {
                'Content-Type': 'multipart/form-data',
              },
            })
            
            // Continue with normal processing
            const retryData = retryRes.data
            toast.success('File replaced successfully')
            onParsed(retryData)
            setLoading(false)
            return
          } else {
            toast.error('Upload cancelled - file already exists')
            setLoading(false)
            return
          }
        } else if (duplicateData.status === 'global_duplicate') {
          toast.error(duplicateData.message)
          setLoading(false)
          return
        }
      }
      
      // Success case - process the response
      toast.dismiss('extracting')
      setLoading(false)
      
      const json = res.data
      setTables(json.tables || [])
      setQualitySummary(json.quality_summary || null)
      
      if (onParsed) onParsed({
        tables: json.tables || [],
        upload_id: json.upload_id,
        file_name: json.s3_key || json.file_name || file.name, // Use S3 key if available, fallback to file_name, then original filename
        file,
        quality_summary: json.quality_summary,
        extraction_config: json.extraction_config,
        format_learning: json.format_learning // Add format learning data
      })
      
      const successMessage = isExcel ? 'Excel extraction completed successfully!' : 'Extraction completed successfully!'
      toast.success(successMessage)
    } catch (e: any) {
      setLoading(false)
      toast.dismiss('extracting')
      
      // Handle axios errors
      if (e.response) {
        // Server responded with error status
        const errorMessage = e.response.data?.detail || e.response.data?.message || 'Server error'
        toast.error(`Upload failed: ${errorMessage}`)
      } else if (e.request) {
        // Request was made but no response received
        toast.error('Network error: Please check your connection')
      } else {
        // Something else happened
        toast.error(`Upload failed: ${e.message}`)
      }
    }
  }, [onParsed, companyId])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "application/vnd.ms-excel": [".xls"],
      "application/vnd.ms-excel.sheet.macroEnabled.12": [".xlsm"],
      "application/vnd.ms-excel.sheet.binary.macroEnabled.12": [".xlsb"]
    },
    disabled,
  })

  return (
    <div className="relative">
      <ExtractionLoader 
        isVisible={loading} 
        progress={loading ? 50 : 0}
        onCancel={() => {
          setLoading(false);
          toast.error("Extraction cancelled");
        }}
      />

      {/* Date Display */}
      {selectedStatementDate && (
        <div className="mb-4 flex items-center justify-center gap-2 bg-green-100 px-4 py-2 rounded-full border border-green-200">
          <Calendar className="w-4 h-4 text-green-600" />
          <span className="text-sm text-green-700 font-medium">
            Statement Date: {selectedStatementDate.date}
          </span>
        </div>
      )}

      {/* Upload Zone */}
      <div
        {...getRootProps()}
        className={clsx(
          "border-2 border-dashed rounded-xl p-8 bg-white border-slate-300 flex flex-col items-center justify-center cursor-pointer transition-all duration-300 group",
          "hover:border-blue-400 hover:bg-blue-50",
          isDragActive && "border-blue-500 bg-blue-100",
          disabled && "opacity-60 pointer-events-none"
        )}
        style={{ minHeight: 200 }}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center space-y-4 text-center">
          <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300">
            <Upload className="text-white" size={24} />
          </div>
          <div>
            <div className="text-lg font-semibold text-slate-800 mb-1">
              {isDragActive ? "Drop files here" : "Upload Document"}
            </div>
            <div className="text-sm text-slate-600">
              Drag and drop your PDF or Excel file here, or click to browse
            </div>
          </div>
          <div className="text-xs text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
            Supports PDF & Excel • Up to 50MB
          </div>
        </div>
      </div>

      <AdvancedTablePreview tables={tables} qualitySummary={qualitySummary || undefined} />
    </div>
  )
} 