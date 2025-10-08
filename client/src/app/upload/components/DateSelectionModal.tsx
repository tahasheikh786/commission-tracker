'use client'
import { useState, useEffect } from 'react'
import { Calendar, X, Check, AlertCircle, Pencil, Building2, CheckCircle } from 'lucide-react'
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
  onCloseWithoutSelection?: () => void
  extractedDates: ExtractedDate[]
  fileName: string
  loading?: boolean
  extractedCarrier?: string
  extractedDate?: string
  onCarrierUpdate?: (carrier: string) => void
  onDateUpdate?: (date: string) => void
}

export default function DateSelectionModal({
  isOpen,
  onClose,
  onDateSelect,
  onCloseWithoutSelection,
  extractedDates,
  fileName,
  loading = false,
  extractedCarrier,
  extractedDate,
  onCarrierUpdate,
  onDateUpdate
}: DateSelectionModalProps) {
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [selectedDateType, setSelectedDateType] = useState<string>('')
  const [fallbackDate, setFallbackDate] = useState<string>('')
  const [showFallback, setShowFallback] = useState(false)
  const [editingCarrier, setEditingCarrier] = useState<string>(extractedCarrier || '')
  const [editingDate, setEditingDate] = useState<string>(extractedDate || '')

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
    if (onCloseWithoutSelection) {
      onCloseWithoutSelection()
    }
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
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => {
        if (onCloseWithoutSelection) {
          onCloseWithoutSelection()
        }
        onClose()
      }} />
      
      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 bg-gradient-to-r from-blue-50 to-indigo-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center">
              <Pencil className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">Edit Extraction Details</h2>
              <p className="text-sm text-slate-600">{fileName}</p>
            </div>
          </div>
          <button
            onClick={() => {
              if (onCloseWithoutSelection) {
                onCloseWithoutSelection()
              }
              onClose()
            }}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-slate-200 border-t-blue-500 rounded-full animate-spin"></div>
              <span className="ml-3 text-slate-600 font-medium">Extracting dates...</span>
            </div>
          ) : (
            <div className="space-y-6">
              {/* AI Extracted Information */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <h3 className="text-lg font-semibold text-blue-800 mb-4 flex items-center gap-2">
                  <CheckCircle className="w-5 h-5" />
                  AI Extracted Information
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Carrier Information */}
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-blue-700">
                      <Building2 className="w-4 h-4 inline mr-1" />
                      Carrier Name
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editingCarrier}
                        onChange={(e) => setEditingCarrier(e.target.value)}
                        className="flex-1 px-3 py-2 border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                        placeholder="Enter carrier name"
                      />
                      {extractedCarrier && (
                        <span className="text-xs text-blue-600 bg-blue-100 px-2 py-1 rounded">
                          AI detected
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Date Information */}
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-blue-700">
                      <Calendar className="w-4 h-4 inline mr-1" />
                      Statement Date
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        value={editingDate}
                        onChange={(e) => setEditingDate(e.target.value)}
                        className="flex-1 px-3 py-2 border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                      />
                      {extractedDate && (
                        <span className="text-xs text-blue-600 bg-blue-100 px-2 py-1 rounded">
                          AI detected
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Alternative Date Selection */}
              {extractedDates.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-slate-800">
                    Alternative Dates Found
                  </h3>
                  <p className="text-sm text-slate-600">
                    Select from AI-detected dates or use the manual entry above:
                  </p>

                  <div className="space-y-3">
                    {extractedDates.map((date, index) => (
                      <div
                        key={index}
                        className={`p-4 border-2 rounded-xl cursor-pointer transition-all duration-200 ${
                          selectedDate === date.date_value && selectedDateType === date.date_type
                            ? 'border-blue-500 bg-blue-50 shadow-md'
                            : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                        onClick={() => {
                          setSelectedDate(date.date_value)
                          setSelectedDateType(date.date_type)
                          setEditingDate(date.date_value)
                        }}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <span className="font-semibold text-slate-800">
                                {getDateTypeLabel(date.date_type)}
                              </span>
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${getConfidenceColor(date.confidence)}`}>
                                {getConfidenceLabel(date.confidence)} Confidence
                              </span>
                            </div>
                            <div className="text-lg font-bold text-blue-600 mb-2">
                              {date.date_value}
                            </div>
                            {date.context && (
                              <div className="text-xs text-slate-500 bg-slate-100 p-2 rounded">
                                <strong>Context:</strong> {date.context}
                              </div>
                            )}
                          </div>
                          {selectedDate === date.date_value && selectedDateType === date.date_type && (
                            <div className="ml-4 p-2 bg-blue-500 rounded-full shadow-lg">
                              <Check className="w-4 h-4 text-white" />
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Manual Date Entry */}
              <div className="border-t border-slate-200 pt-4">
                <button
                  onClick={() => setShowFallback(!showFallback)}
                  className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium transition-colors"
                >
                  <AlertCircle className="w-4 h-4" />
                  Need to enter a different date?
                </button>
                
                {showFallback && (
                  <div className="mt-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
                    <label className="block text-sm font-medium text-slate-700 mb-3">
                      Enter date manually:
                    </label>
                    <input
                      type="date"
                      value={fallbackDate}
                      onChange={(e) => {
                        setFallbackDate(e.target.value)
                        setEditingDate(e.target.value)
                      }}
                      className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-slate-200 bg-slate-50">
          <button
            onClick={handleSkip}
            className="px-4 py-2 text-slate-600 hover:text-slate-800 transition-colors font-medium"
          >
            Cancel
          </button>
          
          <div className="flex gap-3">
            <button
              onClick={() => {
                // Update carrier if changed
                if (onCarrierUpdate && editingCarrier !== extractedCarrier) {
                  onCarrierUpdate(editingCarrier)
                }
                
                // Update date if changed
                if (onDateUpdate && editingDate !== extractedDate) {
                  onDateUpdate(editingDate)
                }
                
                // Use the selected date or fallback date
                const finalDate = selectedDate || fallbackDate || editingDate
                if (finalDate) {
                  onDateSelect(finalDate, selectedDateType || 'statement_date')
                }
                
                onClose()
              }}
              className="px-6 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg hover:shadow-lg transition-all duration-200 font-semibold"
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
