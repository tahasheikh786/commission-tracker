'use client'
import { useState, useEffect } from 'react'
import { Calendar, X, Check, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'

interface ExtractedDate {
  date_value: string
  label: string
  confidence: number
  date_type: string
  context: string
  page_number: number
  bbox: number[]
}

interface DateSelectionModalProps {
  isOpen: boolean
  onClose: () => void
  onDateSelect: (selectedDate: string, dateType: string) => void
  extractedDates: ExtractedDate[]
  fileName: string
  loading?: boolean
}

export default function DateSelectionModal({
  isOpen,
  onClose,
  onDateSelect,
  extractedDates,
  fileName,
  loading = false
}: DateSelectionModalProps) {
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [selectedDateType, setSelectedDateType] = useState<string>('')
  const [fallbackDate, setFallbackDate] = useState<string>('')
  const [showFallback, setShowFallback] = useState(false)

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setSelectedDate('')
      setSelectedDateType('')
      setFallbackDate('')
      // Automatically show fallback if no dates are found
      setShowFallback(extractedDates.length === 0)
    }
  }, [isOpen, extractedDates.length])

  const handleDateSelect = (date: string, dateType: string) => {
    setSelectedDate(date)
    setSelectedDateType(dateType)
    setShowFallback(false)
  }

  const handleFallbackSelect = () => {
    if (!fallbackDate) {
      toast.error('Please select a date')
      return
    }
    onDateSelect(fallbackDate, 'statement_date')
    onClose()
  }

  const handleConfirm = () => {
    if (!selectedDate) {
      toast.error('Please select a date')
      return
    }
    onDateSelect(selectedDate, selectedDateType)
    onClose()
  }

  const handleSkip = () => {
    onClose()
  }

  const getDateTypeLabel = (dateType: string) => {
    const labels: Record<string, string> = {
      'statement_date': 'Statement Date',
      'payment_date': 'Payment Date',
      'billing_date': 'Billing Date',
      'effective_date': 'Effective Date',
      'report_date': 'Report Date'
    }
    return labels[dateType] || dateType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())
  }

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-600 bg-green-100'
    if (confidence >= 0.6) return 'text-yellow-600 bg-yellow-100'
    return 'text-red-600 bg-red-100'
  }

  const getConfidenceLabel = (confidence: number) => {
    if (confidence >= 0.8) return 'High'
    if (confidence >= 0.6) return 'Medium'
    return 'Low'
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      
      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-purple-50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Calendar className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Select Statement Date</h2>
              <p className="text-sm text-gray-600">{fileName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-3 text-gray-600">Extracting dates...</span>
            </div>
          ) : extractedDates.length === 0 ? (
            <div className="text-center py-8">
              <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No dates found</h3>
              <p className="text-gray-600 mb-4">We couldn&apos;t automatically detect any dates in your document.</p>
              
              {/* Show date picker directly */}
              <div className="mt-6 p-4 bg-gray-50 rounded-lg max-w-md mx-auto">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select statement date manually:
                </label>
                <input
                  type="date"
                  value={fallbackDate}
                  onChange={(e) => setFallbackDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Found {extractedDates.length} date{extractedDates.length !== 1 ? 's' : ''}
                </h3>
                <p className="text-sm text-gray-600">
                  Select the most appropriate statement date from the options below:
                </p>
              </div>

              {/* Extracted Dates */}
              <div className="space-y-3">
                {extractedDates.map((date, index) => (
                  <div
                    key={index}
                    className={`p-4 border-2 rounded-lg cursor-pointer transition-all hover:shadow-md ${
                      selectedDate === date.date_value && selectedDateType === date.date_type
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => handleDateSelect(date.date_value, date.date_type)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-semibold text-gray-900">
                            {getDateTypeLabel(date.date_type)}
                          </span>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getConfidenceColor(date.confidence)}`}>
                            {getConfidenceLabel(date.confidence)} Confidence
                          </span>
                        </div>
                        <div className="text-lg font-bold text-blue-600 mb-1">
                          {date.date_value}
                        </div>
                        <div className="text-sm text-gray-600 mb-2">
                          <strong>Label:</strong> {date.label}
                        </div>
                        {date.context && (
                          <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded">
                            <strong>Context:</strong> {date.context}
                          </div>
                        )}
                      </div>
                      {selectedDate === date.date_value && selectedDateType === date.date_type && (
                        <div className="ml-4 p-2 bg-blue-500 rounded-full">
                          <Check className="w-4 h-4 text-white" />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Fallback Option */}
              <div className="border-t border-gray-200 pt-4">
                <button
                  onClick={() => setShowFallback(!showFallback)}
                  className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium"
                >
                  <AlertCircle className="w-4 h-4" />
                  Didn&apos;t find the correct date?
                </button>
                
                {showFallback && (
                  <div className="mt-3 p-4 bg-gray-50 rounded-lg">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Select date manually:
                    </label>
                    <input
                      type="date"
                      value={fallbackDate}
                      onChange={(e) => setFallbackDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">
          <button
            onClick={handleSkip}
            className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
          >
            Skip for now
          </button>
          
          <div className="flex gap-3">
            {showFallback && fallbackDate && (
              <button
                onClick={handleFallbackSelect}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                Use Selected Date
              </button>
            )}
            
            {selectedDate && extractedDates.length > 0 && (
              <button
                onClick={handleConfirm}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Confirm Selection
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
