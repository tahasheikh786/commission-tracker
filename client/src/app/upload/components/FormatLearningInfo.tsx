import React from 'react'
import { CheckCircle, AlertCircle, Info, TrendingUp, Database } from 'lucide-react'

interface FormatLearningInfoProps {
  formatLearning: {
    found_matching_format: boolean
    match_score: number
    learned_format?: any
    validation_results?: any
    suggested_mapping?: Record<string, string>
    confidence_score: number
    suggestions?: string[]
  }
  onUseSuggestedMapping?: (mapping: Record<string, string>) => void
}

export default function FormatLearningInfo({ formatLearning, onUseSuggestedMapping }: FormatLearningInfoProps) {
  if (!formatLearning) {
    return null
  }

  const { found_matching_format, match_score, learned_format, validation_results, suggested_mapping, confidence_score, suggestions } = formatLearning

  if (!found_matching_format) {
    return (
      <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start">
          <Info className="w-5 h-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" />
          <div>
            <h3 className="text-sm font-medium text-blue-800">New Format Detected</h3>
            <p className="text-sm text-blue-700 mt-1">
              This appears to be a new format for this carrier. After you save the mapping, 
              the system will learn this format for future uploads.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const getMatchScoreColor = (score: number) => {
    if (score >= 0.9) return 'text-green-600'
    if (score >= 0.7) return 'text-yellow-600'
    return 'text-red-600'
  }

  const getMatchScoreIcon = (score: number) => {
    if (score >= 0.9) return <CheckCircle className="w-5 h-5 text-green-600" />
    if (score >= 0.7) return <AlertCircle className="w-5 h-5 text-yellow-600" />
    return <AlertCircle className="w-5 h-5 text-red-600" />
  }

  return (
    <div className="mb-6 bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-lg p-4">
      <div className="flex items-start">
        <TrendingUp className="w-5 h-5 text-green-600 mt-0.5 mr-3 flex-shrink-0" />
        <div className="flex-1">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-green-800">Format Learning Active</h3>
            <div className="flex items-center gap-2">
              {getMatchScoreIcon(match_score)}
              <span className={`text-sm font-medium ${getMatchScoreColor(match_score)}`}>
                {Math.round(match_score * 100)}% Match
              </span>
            </div>
          </div>
          
          <p className="text-sm text-green-700 mb-3">
            Found a matching format from previous uploads for this carrier. 
            The system has learned the structure and can suggest field mappings.
          </p>

          {learned_format && (
            <div className="bg-white rounded-md p-3 mb-3 border border-green-200">
              <div className="flex items-center gap-2 mb-2">
                <Database className="w-4 h-4 text-green-600" />
                <span className="text-sm font-medium text-gray-800">Learned Format Details</span>
              </div>
              <div className="grid grid-cols-2 gap-4 text-xs text-gray-600">
                <div>
                  <span className="font-medium">Confidence:</span> {confidence_score}%
                </div>
                <div>
                  <span className="font-medium">Usage Count:</span> {learned_format.usage_count || 1}
                </div>
                <div>
                  <span className="font-medium">Columns:</span> {learned_format.headers?.length || 0}
                </div>
                <div>
                  <span className="font-medium">Data Types:</span> {Object.keys(learned_format.column_types || {}).length}
                </div>
              </div>
            </div>
          )}

          {suggested_mapping && Object.keys(suggested_mapping).length > 0 && (
            <div className="bg-white rounded-md p-3 mb-3 border border-green-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-800">Suggested Field Mapping</span>
                {onUseSuggestedMapping && (
                  <button
                    onClick={() => onUseSuggestedMapping(suggested_mapping)}
                    className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700 transition"
                  >
                    Apply
                  </button>
                )}
              </div>
              <div className="text-xs text-gray-600 space-y-1">
                {Object.entries(suggested_mapping).map(([field, column]) => (
                  <div key={field} className="flex justify-between">
                    <span className="font-medium">{field}:</span>
                    <span>{column}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {validation_results && (
            <div className="bg-white rounded-md p-3 mb-3 border border-green-200">
              <span className="text-sm font-medium text-gray-800 mb-2 block">Data Validation</span>
              <div className="text-xs text-gray-600">
                <div className="flex justify-between mb-1">
                  <span>Overall Score:</span>
                  <span className={getMatchScoreColor(validation_results.overall_score || 0)}>
                    {Math.round((validation_results.overall_score || 0) * 100)}%
                  </span>
                </div>
                <div className="flex justify-between mb-1">
                  <span>Header Match:</span>
                  <span className={getMatchScoreColor(validation_results.header_match_score || 0)}>
                    {Math.round((validation_results.header_match_score || 0) * 100)}%
                  </span>
                </div>
              </div>
            </div>
          )}

          {suggestions && suggestions.length > 0 && (
            <div className="bg-white rounded-md p-3 border border-green-200">
              <span className="text-sm font-medium text-gray-800 mb-2 block">Suggestions</span>
              <ul className="text-xs text-gray-600 space-y-1">
                {suggestions.map((suggestion, index) => (
                  <li key={index} className="flex items-start">
                    <span className="text-green-600 mr-1">•</span>
                    {suggestion}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
