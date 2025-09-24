import React, { useState, useEffect } from 'react'
import Card from '@/app/components/ui/Card'
import Button from '@/app/components/ui/Button'
import Input from '@/app/components/ui/Input'
import { CheckCircle, AlertCircle, Edit3, X } from 'lucide-react'

interface CompanyNameMappingProps {
  detectedCompanies: string[]
  onCompanyMappingChange: (index: number, companyName: string) => void
  onValidationComplete: (validatedCompanies: string[]) => void
  onSkip: () => void
  isLoading?: boolean
}

export default function CompanyNameMapping({
  detectedCompanies,
  onCompanyMappingChange,
  onValidationComplete,
  onSkip,
  isLoading = false
}: CompanyNameMappingProps) {
  const [validatedCompanies, setValidatedCompanies] = useState<string[]>([])
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [validationResults, setValidationResults] = useState<Record<number, any>>({})

  useEffect(() => {
    // Initialize with detected companies
    setValidatedCompanies(detectedCompanies)
  }, [detectedCompanies])

  const handleCompanyChange = (index: number, value: string) => {
    const updated = [...validatedCompanies]
    updated[index] = value
    setValidatedCompanies(updated)
    onCompanyMappingChange(index, value)
  }

  const handleValidation = async (index: number) => {
    try {
      const response = await fetch('/api/validate-company-name', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          company_name: validatedCompanies[index]
        })
      })
      
      if (response.ok) {
        const result = await response.json()
        setValidationResults(prev => ({
          ...prev,
          [index]: result
        }))
      }
    } catch (error) {
      console.error('Error validating company name:', error)
    }
  }

  const handleComplete = () => {
    const validCompanies = validatedCompanies.filter(company => 
      company && company.trim().length > 0
    )
    onValidationComplete(validCompanies)
  }

  const removeCompany = (index: number) => {
    const updated = validatedCompanies.filter((_, i) => i !== index)
    setValidatedCompanies(updated)
    setValidationResults(prev => {
      const newResults = { ...prev }
      delete newResults[index]
      return newResults
    })
  }

  const addCompany = () => {
    setValidatedCompanies([...validatedCompanies, ''])
  }

  const getValidationStatus = (index: number) => {
    const result = validationResults[index]
    if (!result) return 'pending'
    return result.is_valid ? 'valid' : 'invalid'
  }

  const getValidationIcon = (index: number) => {
    const status = getValidationStatus(index)
    switch (status) {
      case 'valid':
        return <CheckCircle className="w-4 h-4 text-green-500" />
      case 'invalid':
        return <AlertCircle className="w-4 h-4 text-red-500" />
      default:
        return <Edit3 className="w-4 h-4 text-gray-400" />
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
            <CheckCircle className="text-white" size={20} />
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-800">
              Company Name Detection
            </h3>
            <p className="text-slate-600 mt-1">
              We detected {detectedCompanies.length} company names in your document. Please review and validate them.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {validatedCompanies.map((company, index) => (
            <div key={index} className="p-4 border border-slate-200 rounded-xl hover:border-slate-300 transition-colors">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  {editingIndex === index ? (
                    <input
                      value={company}
                      onChange={(e) => handleCompanyChange(index, e.target.value)}
                      onBlur={() => setEditingIndex(null)}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          setEditingIndex(null)
                        }
                      }}
                      autoFocus
                      className="w-full px-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  ) : (
                    <div 
                      className="text-sm text-slate-700 cursor-pointer hover:bg-slate-50 p-3 rounded-lg transition-colors"
                      onClick={() => setEditingIndex(index)}
                    >
                      {company || 'Click to edit company name'}
                    </div>
                  )}
                </div>
                
                <div className="flex items-center gap-3">
                  {getValidationIcon(index)}
                  
                  <button
                    className="px-3 py-1.5 text-sm bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={() => handleValidation(index)}
                    disabled={!company || isLoading}
                  >
                    Validate
                  </button>
                  
                  <button
                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    onClick={() => removeCompany(index)}
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
              
              {validationResults[index] && (
                <div className="mt-3 p-3 rounded-lg text-sm">
                  {validationResults[index].is_valid ? (
                    <div className="text-emerald-700 bg-emerald-50 border border-emerald-200">
                      ✓ Valid company name (Confidence: {Math.round(validationResults[index].confidence * 100)}%)
                    </div>
                  ) : (
                    <div className="text-red-700 bg-red-50 border border-red-200">
                      ⚠ Issues: {validationResults[index].issues.join(', ')}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          
          <button
            onClick={addCompany}
            className="w-full p-4 border-2 border-dashed border-slate-300 rounded-xl text-slate-600 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-all duration-200 font-medium"
          >
            + Add Company Name
          </button>
        </div>
      </div>

      <div className="flex justify-end gap-4">
        <button
          onClick={onSkip}
          disabled={isLoading}
          className="px-6 py-3 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Skip
        </button>
        <button
          onClick={handleComplete}
          disabled={isLoading || validatedCompanies.length === 0}
          className="px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg hover:shadow-lg transition-all duration-200 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              Processing...
            </div>
          ) : (
            'Continue with Company Names'
          )}
        </button>
      </div>
    </div>
  )
}
