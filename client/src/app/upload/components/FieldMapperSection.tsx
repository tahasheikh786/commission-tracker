'use client'
import { Pencil } from 'lucide-react'
import FieldMapper from './FieldMapper'
import ExtractedTables from './ExtractedTable'
import Loader from './Loader'

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
  onSave,
  onSkip,
  onTablesChange,
  onGoToTableEditor,
  onReset
}: FieldMapperSectionProps) {
  console.log('🎯 FieldMapperSection: Received selectedStatementDate:', selectedStatementDate)
  const tablesToUse = editedTables.length > 0 ? editedTables : uploaded.tables.length > 0 ? uploaded.tables : finalTables

  return (
    <>
      {savingMapping && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 shadow-xl">
            <div className="flex flex-col items-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
              <p className="text-lg font-semibold text-gray-800 mb-2">Saving Field Mapping</p>
              <p className="text-gray-600 text-center">Please wait while we save your mapping and prepare the dashboard...</p>
            </div>
          </div>
        </div>
      )}
      
      <div className="w-full">
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 max-w-none">
          <h1 className="text-xl font-semibold text-gray-900 mb-4 text-center">
            {fetchingMapping ? 'Loading Field Mapping...' : `Map Fields for ${company?.name || 'Unknown Company'}`}
          </h1>
          
          {/* Single Column Layout */}
          <div className="space-y-8">
            {/* Loading State */}
            {fetchingMapping && (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                  <p className="text-gray-600">Loading saved field mapping...</p>
                </div>
              </div>
            )}
            
            {/* Field Mapper Section */}
            {!fetchingMapping && (
              <div>
                <div className="mb-4">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-indigo-400 flex items-center justify-center shadow text-white text-sm font-bold">
                      <span>1</span>
                    </div>
                    <span className="text-xl font-semibold text-gray-800 tracking-tight">
                      Map Your Data Fields
                    </span>
                  </div>
                  <p className="text-gray-500 text-sm pl-1">
                    Match each required field to the correct column in your uploaded table. Helps us standardize your commission statement.
                  </p>
                </div>
                {tablesToUse[0]?.header && tablesToUse[0].header.length > 0 && company && (
                  <>
                    <FieldMapper
                      company={company}
                      columns={tablesToUse[0].header}
                      initialPlanTypes={planTypes}
                      tableData={tablesToUse}
                      isLoading={savingMapping}
                      selectedStatementDate={selectedStatementDate}
                      onSave={onSave}
                      onSkip={onSkip}
                      initialFields={fieldConfig.length > 0 ? fieldConfig : databaseFields}
                      initialMapping={mapping}
                    />
                  </>
                )}
              </div>
            )}

            {/* Extracted Tables Section */}
            <div>
              <div className="mb-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-600 to-emerald-400 flex items-center justify-center shadow text-white text-sm font-bold">
                    <span>2</span>
                  </div>
                  <span className="text-xl font-semibold text-gray-800 tracking-tight">
                    Extracted Table Preview
                  </span>
                </div>
                <p className="text-gray-500 text-sm pl-1">
                  Review the extracted data from your uploaded PDF. You can edit, delete, or modify the data as needed.
                </p>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
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
              className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-2"
            >
              <Pencil className="w-4 h-4" />
              Back to Table Editor
            </button>
            <button onClick={onReset} className="px-4 py-2 rounded bg-gray-300 text-gray-700 hover:bg-gray-400">
              Start Over
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
