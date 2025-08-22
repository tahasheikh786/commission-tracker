import React, { useState, useEffect } from 'react'
import { Card } from '@/app/components/ui/Card'
import { Button } from '@/app/components/ui/Button'
import { Input } from '@/app/components/ui/Input'
import { CheckCircle, AlertCircle, Info } from 'lucide-react'

interface HierarchicalFieldMapperProps {
  hierarchicalData: any
  onSave: (mapping: Record<string, string>) => void
  onSkip: () => void
  isLoading?: boolean
}

export default function HierarchicalFieldMapper({
  hierarchicalData,
  onSave,
  onSkip,
  isLoading = false
}: HierarchicalFieldMapperProps) {
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [isValid, setIsValid] = useState(false)

  useEffect(() => {
    // Auto-map fields for hierarchical data
    const autoMapping: Record<string, string> = {
      'Company Name': 'company_name',
      'Commission Earned': 'commission_earned', 
      'Invoice Total': 'invoice_total',
      'Customer ID': 'customer_id',
      'Section Type': 'section_type'
    }
    setMapping(autoMapping)
    setIsValid(true)
  }, [hierarchicalData])

  const handleSave = () => {
    if (isValid) {
      onSave(mapping)
    }
  }

  const customerBlocks = hierarchicalData?.customer_blocks || []
  const processedData = hierarchicalData?.processed_data || []

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-600 to-emerald-400 flex items-center justify-center shadow text-white text-sm font-bold">
            <CheckCircle size={16} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-800">
              Hierarchical Document Detected
            </h3>
            <p className="text-sm text-gray-600">
              We detected a hierarchical commission statement structure. The system has automatically extracted customer data from header patterns.
            </p>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="font-medium text-blue-800 mb-2">How Hierarchical Extraction Works</h4>
              <ul className="text-sm text-blue-700 space-y-1">
                <li>• Company names are extracted from "Customer Name:" headers</li>
                <li>• Commission amounts are calculated from "Paid Amount" columns</li>
                <li>• Invoice totals are summed from premium and fee columns</li>
                <li>• Customer blocks are automatically grouped by section (New Business/Renewal)</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="font-medium text-gray-800 mb-3">Extraction Summary</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Total Customers:</span>
                <span className="font-medium">{customerBlocks.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Total Commission:</span>
                <span className="font-medium">
                  ${hierarchicalData?.extraction_summary?.total_commission?.toFixed(2) || '0.00'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Sections Found:</span>
                <span className="font-medium">
                  {hierarchicalData?.extraction_summary?.sections_found?.join(', ') || 'None'}
                </span>
              </div>
            </div>
          </div>

          <div>
            <h4 className="font-medium text-gray-800 mb-3">Field Mapping</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Company Name:</span>
                <span className="text-green-600 font-medium">Auto-mapped</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Commission Earned:</span>
                <span className="text-green-600 font-medium">Auto-mapped</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Invoice Total:</span>
                <span className="text-green-600 font-medium">Auto-mapped</span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {processedData.length > 0 && (
        <Card className="p-6">
          <h4 className="font-medium text-gray-800 mb-4">Extracted Customer Data</h4>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Customer</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Commission</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Invoice Total</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Section</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {processedData.slice(0, 5).map((customer: any, index: number) => (
                  <tr key={index}>
                    <td className="px-4 py-2 text-sm text-gray-900">
                      {customer.company_name}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-900">
                      ${customer.commission_earned?.toFixed(2) || '0.00'}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-900">
                      ${customer.invoice_total?.toFixed(2) || '0.00'}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-900">
                      {customer.section_type}
                    </td>
                  </tr>
                ))}
                {processedData.length > 5 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-2 text-sm text-gray-500 text-center">
                      ... and {processedData.length - 5} more customers
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="flex justify-end gap-3">
        <Button
          variant="outline"
          onClick={onSkip}
          disabled={isLoading}
        >
          Skip
        </Button>
        <Button
          onClick={handleSave}
          disabled={!isValid || isLoading}
          className="bg-green-600 hover:bg-green-700"
        >
          {isLoading ? 'Processing...' : 'Use Hierarchical Data'}
        </Button>
      </div>
    </div>
  )
}
