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
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-indigo-400 flex items-center justify-center shadow text-white text-sm font-bold">
            <CheckCircle size={16} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-800">
              Company Name Detection
            </h3>
            <p className="text-sm text-gray-600">
              We detected {detectedCompanies.length} company names in your document. Please review and validate them.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {validatedCompanies.map((company, index) => (
            <div key={index} className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg">
              <div className="flex-1">
                {editingIndex === index ? (
                  <Input
                    value={company}
                    onChange={(e) => handleCompanyChange(index, e.target.value)}
                    onBlur={() => setEditingIndex(null)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        setEditingIndex(null)
                      }
                    }}
                    autoFocus
                    className="text-sm"
                  />
                ) : (
                  <div 
                    className="text-sm text-gray-700 cursor-pointer hover:bg-gray-50 p-2 rounded"
                    onClick={() => setEditingIndex(index)}
                  >
                    {company || 'Click to edit company name'}
                  </div>
                )}
              </div>
              
              <div className="flex items-center gap-2">
                {getValidationIcon(index)}
                
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleValidation(index)}
                  disabled={!company || isLoading}
                >
                  Validate
                </Button>
                
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => removeCompany(index)}
                  className="text-red-600 hover:text-red-700"
                >
                  <X size={14} />
                </Button>
              </div>
              
              {validationResults[index] && (
                <div className="mt-2 text-xs">
                  {validationResults[index].is_valid ? (
                    <div className="text-green-600">
                      ✓ Valid company name (Confidence: {Math.round(validationResults[index].confidence * 100)}%)
                    </div>
                  ) : (
                    <div className="text-red-600">
                      ⚠ Issues: {validationResults[index].issues.join(', ')}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          
          <Button
            variant="outline"
            onClick={addCompany}
            className="w-full"
          >
            + Add Company Name
          </Button>
        </div>
      </Card>

      <div className="flex justify-end gap-3">
        <Button
          variant="outline"
          onClick={onSkip}
          disabled={isLoading}
        >
          Skip
        </Button>
        <Button
          onClick={handleComplete}
          disabled={isLoading || validatedCompanies.length === 0}
          className="bg-blue-600 hover:bg-blue-700"
        >
          {isLoading ? 'Processing...' : 'Continue with Company Names'}
        </Button>
      </div>
    </div>
  )
}
