'use client'
import { useState, useEffect } from 'react'
import { Toaster, toast } from 'react-hot-toast'

type QualityMetrics = {
  overall_score: number
  completeness: number
  consistency: number
  accuracy: number
  structure_quality: number
  data_quality: number
  confidence_level: string
  is_valid: boolean
}

type TableDetail = {
  table_index: number
  header: string[]
  row_count: number
  column_count: number
  quality_metrics: QualityMetrics
  issues: string[]
  recommendations: string[]
}

type QualityReport = {
  summary: {
    total_tables: number
    total_rows: number
    total_columns: number
    average_quality_score: number
  }
  table_details: TableDetail[]
  common_issues: Array<{
    issue: string
    count: number
    percentage: number
  }>
  data_patterns: Record<string, any>
  recommendations: string[]
}

type QualityReportProps = {
  uploadId: string
  onClose: () => void
}

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

function MetricCard({ title, value, subtitle, color = 'blue' }: { 
  title: string, 
  value: string | number, 
  subtitle?: string,
  color?: 'blue' | 'green' | 'yellow' | 'red' | 'purple'
}) {
  const colorClasses = {
    blue: 'bg-blue-50 border-blue-200 text-blue-800',
    green: 'bg-green-50 border-green-200 text-green-800',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    red: 'bg-red-50 border-red-200 text-red-800',
    purple: 'bg-purple-50 border-purple-200 text-purple-800'
  }

  return (
    <div className={`p-4 rounded-lg border ${colorClasses[color]}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm font-medium">{title}</div>
      {subtitle && <div className="text-xs opacity-75">{subtitle}</div>}
    </div>
  )
}

function QualityChart({ metrics }: { metrics: QualityMetrics }) {
  const chartData = [
    { label: 'Completeness', value: metrics.completeness, color: 'bg-blue-500' },
    { label: 'Consistency', value: metrics.consistency, color: 'bg-green-500' },
    { label: 'Accuracy', value: metrics.accuracy, color: 'bg-yellow-500' },
    { label: 'Structure', value: metrics.structure_quality, color: 'bg-purple-500' },
    { label: 'Data Quality', value: metrics.data_quality, color: 'bg-indigo-500' }
  ]

  return (
    <div className="space-y-2">
      {chartData.map((item, idx) => (
        <div key={idx} className="flex items-center">
          <div className="w-20 text-xs font-medium text-gray-600">{item.label}</div>
          <div className="flex-1 ml-2">
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className={`h-2 rounded-full ${item.color} transition-all duration-300`}
                style={{ width: `${item.value * 100}%` }}
              />
            </div>
          </div>
          <div className="w-12 text-xs text-gray-500 text-right">
            {(item.value * 100).toFixed(0)}%
          </div>
        </div>
      ))}
    </div>
  )
}

export default function QualityReport({ uploadId, onClose }: QualityReportProps) {
  const [report, setReport] = useState<QualityReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchReport = async () => {
      try {
        setLoading(true)
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/advanced/quality-report/${uploadId}`)
        
        if (!response.ok) {
          throw new Error('Failed to fetch quality report')
        }
        
        const data = await response.json()
        setReport(data.detailed_quality_report)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
        toast.error('Failed to load quality report')
      } finally {
        setLoading(false)
      }
    }

    fetchReport()
  }, [uploadId])

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 max-w-md mx-4">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-3 text-lg">Loading quality report...</span>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 max-w-md mx-4">
          <div className="text-center">
            <div className="text-red-500 text-4xl mb-4">⚠️</div>
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Error Loading Report</h3>
            <p className="text-gray-600 mb-4">{error}</p>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!report) {
    return null
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-6xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 p-6 rounded-t-xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-800">Quality Analysis Report</h2>
              <p className="text-gray-600">Detailed analysis of extracted table quality</p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl"
            >
              ×
            </button>
          </div>
        </div>

        <div className="p-6 space-y-8">
          {/* Summary Metrics */}
          <div>
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Summary</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <MetricCard
                title="Total Tables"
                value={report.summary.total_tables}
                color="blue"
              />
              <MetricCard
                title="Total Rows"
                value={report.summary.total_rows}
                color="green"
              />
              <MetricCard
                title="Total Columns"
                value={report.summary.total_columns}
                color="purple"
              />
              <MetricCard
                title="Avg Quality"
                value={`${(report.summary.average_quality_score * 100).toFixed(1)}%`}
                color={report.summary.average_quality_score > 0.8 ? 'green' : report.summary.average_quality_score > 0.6 ? 'yellow' : 'red'}
              />
            </div>
          </div>

          {/* Common Issues */}
          {report.common_issues.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Common Issues</h3>
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                {report.common_issues.map((issue, idx) => (
                  <div key={idx} className="flex items-center justify-between py-2 border-b border-red-100 last:border-b-0">
                    <div className="flex items-center">
                      <span className="text-red-500 mr-2">⚠</span>
                      <span className="text-red-800">{issue.issue}</span>
                    </div>
                    <div className="text-sm text-red-600">
                      {issue.count} tables ({issue.percentage.toFixed(1)}%)
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommendations */}
          {report.recommendations.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Recommendations</h3>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                {report.recommendations.map((rec, idx) => (
                  <div key={idx} className="flex items-start py-2 border-b border-blue-100 last:border-b-0">
                    <span className="text-blue-500 mr-2 mt-1">💡</span>
                    <span className="text-blue-800">{rec}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Table Details */}
          <div>
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Table Details</h3>
            <div className="space-y-4">
              {report.table_details.map((table, idx) => (
                <div key={idx} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h4 className="font-semibold text-gray-800">Table {table.table_index + 1}</h4>
                      <p className="text-sm text-gray-600">
                        {table.row_count} rows × {table.column_count} columns
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <QualityIndicator 
                        score={table.quality_metrics.overall_score} 
                        level={table.quality_metrics.confidence_level} 
                      />
                      <span className="text-sm text-gray-500">
                        Score: {(table.quality_metrics.overall_score * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  {/* Quality Chart */}
                  <div className="mb-4">
                    <h5 className="text-sm font-medium text-gray-700 mb-2">Quality Metrics</h5>
                    <QualityChart metrics={table.quality_metrics} />
                  </div>

                  {/* Table Header */}
                  <div className="mb-4">
                    <h5 className="text-sm font-medium text-gray-700 mb-2">Headers</h5>
                    <div className="flex flex-wrap gap-2">
                      {table.header.map((header, hIdx) => (
                        <span key={hIdx} className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-sm">
                          {header}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Issues and Recommendations */}
                  {(table.issues.length > 0 || table.recommendations.length > 0) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {table.issues.length > 0 && (
                        <div>
                          <h5 className="text-sm font-medium text-red-700 mb-2">Issues</h5>
                          <ul className="text-sm text-red-600 space-y-1">
                            {table.issues.map((issue, iIdx) => (
                              <li key={iIdx} className="flex items-start">
                                <span className="text-red-500 mr-2">•</span>
                                {issue}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {table.recommendations.length > 0 && (
                        <div>
                          <h5 className="text-sm font-medium text-blue-700 mb-2">Recommendations</h5>
                          <ul className="text-sm text-blue-600 space-y-1">
                            {table.recommendations.map((rec, rIdx) => (
                              <li key={rIdx} className="flex items-start">
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
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
} 