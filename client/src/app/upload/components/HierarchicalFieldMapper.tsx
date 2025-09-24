import React, { useState, useEffect } from 'react'
import Card from '@/app/components/ui/Card'
import Button from '@/app/components/ui/Button'
import { CheckCircle,Info } from 'lucide-react'

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
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg text-white text-sm font-bold">
            <CheckCircle size={20} />
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-800">
              Hierarchical Document Detected
            </h3>
            <p className="text-slate-600 mt-1">
              We detected a hierarchical commission statement structure. The system has automatically extracted customer data from header patterns.
            </p>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-6">
          <div className="flex items-start gap-4">
            <Info className="w-6 h-6 text-blue-600 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="font-semibold text-blue-800 mb-3">How Hierarchical Extraction Works</h4>
              <ul className="text-sm text-blue-700 space-y-2">
                <li className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  Company names are extracted from &quot;Customer Name:&quot; headers
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  Commission amounts are calculated from &quot;Paid Amount&quot; columns
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  Invoice totals are summed from premium and fee columns
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  Customer blocks are automatically grouped by section (New Business/Renewal)
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-slate-50 rounded-lg p-4">
            <h4 className="font-semibold text-slate-800 mb-4">Extraction Summary</h4>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-slate-600">Total Customers:</span>
                <span className="font-semibold text-slate-800">{customerBlocks.length}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-600">Total Commission:</span>
                <span className="font-semibold text-emerald-600">
                  ${hierarchicalData?.extraction_summary?.total_commission?.toFixed(2) || '0.00'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-600">Sections Found:</span>
                <span className="font-semibold text-slate-800">
                  {hierarchicalData?.extraction_summary?.sections_found?.join(', ') || 'None'}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-slate-50 rounded-lg p-4">
            <h4 className="font-semibold text-slate-800 mb-4">Field Mapping</h4>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-slate-600">Company Name:</span>
                <span className="text-emerald-600 font-semibold">Auto-mapped</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-600">Commission Earned:</span>
                <span className="text-emerald-600 font-semibold">Auto-mapped</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-600">Invoice Total:</span>
                <span className="text-emerald-600 font-semibold">Auto-mapped</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {processedData.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h4 className="font-semibold text-slate-800 mb-6">Extracted Customer Data</h4>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-bold text-slate-800">Customer</th>
                  <th className="px-4 py-3 text-left text-sm font-bold text-slate-800">Commission</th>
                  <th className="px-4 py-3 text-left text-sm font-bold text-slate-800">Invoice Total</th>
                  <th className="px-4 py-3 text-left text-sm font-bold text-slate-800">Section</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {processedData.slice(0, 5).map((customer: any, index: number) => (
                  <tr key={index} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-sm text-slate-900 font-medium">
                      {customer.company_name}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-900">
                      ${customer.commission_earned?.toFixed(2) || '0.00'}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-900">
                      ${customer.invoice_total?.toFixed(2) || '0.00'}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-900">
                      {customer.section_type}
                    </td>
                  </tr>
                ))}
                {processedData.length > 5 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-3 text-sm text-slate-500 text-center">
                      ... and {processedData.length - 5} more customers
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-4">
        <button
          onClick={onSkip}
          disabled={isLoading}
          className="px-6 py-3 rounded-lg bg-slate-200 text-slate-700 hover:bg-slate-300 font-semibold shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Skip
        </button>
        <button
          onClick={handleSave}
          disabled={!isValid || isLoading}
          className="px-6 py-3 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              Processing...
            </div>
          ) : (
            'Use Hierarchical Data'
          )}
        </button>
      </div>
    </div>
  )
}
