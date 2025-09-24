'use client'
import { Pencil } from 'lucide-react'
import FieldMapper from './FieldMapper'
import HierarchicalFieldMapper from './HierarchicalFieldMapper'
import ExtractedTables from './ExtractedTable'
import Loader from './Loader'
import { useState } from 'react'

type FieldConfig = { field: string, label: string }
type Company = { id: string, name: string } | null

interface FieldMapperSectionProps {
  company: Company
  uploaded: any
  editedTables: any[]
  finalTables: any[]
  fieldConfig: FieldConfig[]
  databaseFields: FieldConfig[]
  mapping: Record<string, string> | null
  planTypes: string[]
  selectedStatementDate: any
  savingMapping: boolean
  fetchingMapping: boolean
  mappingAutoApplied?: boolean
  onSave: (map: Record<string, string>, fieldConf: FieldConfig[], selectedPlanTypes: string[], tableNames?: string[], selectedStatementDate?: any) => Promise<void>
  onSkip: () => void
  onTablesChange: (newTables: any[]) => void
  onGoToTableEditor: () => void
  onReset: () => void
}

export default function FieldMapperSection({
  company,
  uploaded,
  editedTables,
  finalTables,
  fieldConfig,
  databaseFields,
  mapping,
  planTypes,
  selectedStatementDate,
  savingMapping,
  fetchingMapping,
  mappingAutoApplied = false,
  onSave,
  onSkip,
  onTablesChange,
  onGoToTableEditor,
  onReset
}: FieldMapperSectionProps) {
  const [currentMapping, setCurrentMapping] = useState<Record<string, string>>({})
  const tablesToUse = editedTables.length > 0 ? editedTables : uploaded.tables.length > 0 ? uploaded.tables : finalTables

  return (
    <>
      {savingMapping && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-8 shadow-2xl">
            <div className="flex flex-col items-center">
              <div className="w-12 h-12 border-2 border-slate-200 border-t-blue-500 rounded-full animate-spin mb-4"></div>
              <p className="text-lg font-semibold text-slate-800 mb-2">Saving Field Mapping</p>
              <p className="text-slate-600 text-center">Please wait while we save your mapping and prepare the dashboard...</p>
            </div>
          </div>
        </div>
      )}
      
      <div className="w-full">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 max-w-none">
          <h1 className="text-2xl font-bold text-slate-800 mb-6 text-center">
            {fetchingMapping ? 'Loading Field Mapping...' : `Map Fields for ${company?.name || 'Unknown Company'}`}
          </h1>
          
          {/* Single Column Layout */}
          <div className="space-y-8">
            {/* Loading State */}
            {fetchingMapping && (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <div className="w-12 h-12 border-2 border-slate-200 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-slate-600 font-medium">Loading saved field mapping...</p>
                </div>
              </div>
            )}
            
            {/* Field Mapper Section */}
            {!fetchingMapping && (
              <div>
                <div className="mb-6">
                  <div className="flex items-center gap-4 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg text-white text-sm font-bold">
                      <span>1</span>
                    </div>
                    <span className="text-xl font-bold text-slate-800">
                      Map Your Data Fields
                    </span>
                  </div>
                  <p className="text-slate-600 text-sm pl-14">
                    Match each required field to the correct column in your uploaded table. Helps us standardize your commission statement.
                  </p>
                </div>
                {tablesToUse[0]?.header && tablesToUse[0].header.length > 0 && company && (
                  <>
                    {/* Check if this is a hierarchical document */}
                    {tablesToUse.some((table: any) => table.structure_type === 'hierarchical') ? (
                      <HierarchicalFieldMapper
                        hierarchicalData={tablesToUse.find((table: any) => table.structure_type === 'hierarchical')?.original_data}
                        onSave={async (hierarchicalMapping) => {
                          // For hierarchical documents, we use the auto-mapped data
                          const standardFields = [
                            { field: 'company_name', label: 'Company Name' },
                            { field: 'commission_earned', label: 'Commission Earned' },
                            { field: 'invoice_total', label: 'Invoice Total' },
                            { field: 'customer_id', label: 'Customer ID' },
                            { field: 'section_type', label: 'Section Type' }
                          ]
                          await onSave(hierarchicalMapping, standardFields, planTypes, undefined, selectedStatementDate)
                        }}
                        onSkip={onSkip}
                        isLoading={savingMapping}
                      />
                    ) : (
                      <FieldMapper
                        company={company}
                        columns={tablesToUse[0].header}
                        initialPlanTypes={planTypes}
                        tableData={tablesToUse}
                        isLoading={savingMapping}
                        selectedStatementDate={selectedStatementDate}
                        onSave={onSave}
                        onSkip={onSkip}
                        onGoToTableEditor={onGoToTableEditor}
                        initialFields={fieldConfig.length > 0 ? fieldConfig : databaseFields}
                        initialMapping={mapping}
                        mappingAutoApplied={mappingAutoApplied}
                      />
                    )}
                  </>
                )}
              </div>
            )}

            {/* Extracted Tables Section */}
            <div>
              <div className="mb-6">
                <div className="flex items-center gap-4 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg text-white text-sm font-bold">
                    <span>2</span>
                  </div>
                  <span className="text-xl font-bold text-slate-800">
                    Extracted Table Preview
                  </span>
                </div>
                <p className="text-slate-600 text-sm pl-14">
                  Review the extracted data from your uploaded PDF. You can edit, delete, or modify the data as needed.
                </p>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <ExtractedTables 
                  tables={tablesToUse} 
                  onTablesChange={onTablesChange} 
                />
              </div>
            </div>
          </div>

          <div className="flex justify-center gap-4 mt-8">
            <button 
              onClick={onGoToTableEditor} 
              className="px-6 py-3 rounded-lg bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-2 font-semibold shadow-lg hover:shadow-xl transition-all duration-200"
            >
              <Pencil className="w-4 h-4" />
              Back to Table Editor
            </button>
            <button onClick={onReset} className="px-6 py-3 rounded-lg bg-slate-200 text-slate-700 hover:bg-slate-300 font-semibold shadow-lg hover:shadow-xl transition-all duration-200">
              Start Over
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
