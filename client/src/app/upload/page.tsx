'use client'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil } from 'lucide-react'
import CompanySelect from './components/CompanySelect'
import AdvancedUploadZone from './components/AdvancedUploadZone'
import ExtractedTables from './components/ExtractedTable'
import TableEditor from './components/TableEditor'
import DashboardTable from './components/DashboardTable'
import FieldMapper from './components/FieldMapper'

import { toast } from 'react-hot-toast'
import Modal from '@/app/components/Modal'
import Loader from './components/Loader';

type FieldConfig = { field: string, label: string }

export default function UploadPage() {
  const [company, setCompany] = useState<{ id: string, name: string } | null>(null)
  const [uploaded, setUploaded] = useState<any>(null)
  const [mapping, setMapping] = useState<Record<string, string> | null>(null)
  const [fieldConfig, setFieldConfig] = useState<FieldConfig[]>([])
  const [databaseFields, setDatabaseFields] = useState<FieldConfig[]>([])
  const [loadingFields, setLoadingFields] = useState(false)
  const [finalTables, setFinalTables] = useState<any[]>([])
  const [fetchingMapping, setFetchingMapping] = useState(false)
  const [showFieldMapper, setShowFieldMapper] = useState(false)
  const [showTableEditor, setShowTableEditor] = useState(false)
  const [skipped, setSkipped] = useState(false)
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [planTypes, setPlanTypes] = useState<string[]>([])
  const [editedTables, setEditedTables] = useState<any[]>([])
  const [originalFile, setOriginalFile] = useState<File | null>(null)
  
  // Extraction history management
  const [extractionHistory, setExtractionHistory] = useState<any[][]>([])
  const [currentExtractionIndex, setCurrentExtractionIndex] = useState(0)
  

  
  // Loading state for another extraction method
  const [isUsingAnotherExtraction, setIsUsingAnotherExtraction] = useState(false)
  
  // Track if another extraction method has been used
  const [hasUsedAnotherExtraction, setHasUsedAnotherExtraction] = useState(false)

  // GPT-4o Vision improvement functionality
  const [isImprovingExtraction, setIsImprovingExtraction] = useState(false)

  const fetchMappingRef = useRef(false)
  const router = useRouter()
  
  // Reset fetchMappingRef when upload changes
  useEffect(() => {
    fetchMappingRef.current = false
  }, [uploaded?.upload_id])

  // Fetch database fields from backend
  useEffect(() => {
    async function fetchDatabaseFields() {
      try {
        setLoadingFields(true)
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/database-fields/?active_only=true`)
        if (response.ok) {
          const data = await response.json()
          const fieldsFromBackend = data.map((field: any) => ({
            field: field.field_key,
            label: field.display_name
          }))
          setDatabaseFields(fieldsFromBackend)
          
          // Set as default fieldConfig if not already set
          if (fieldConfig.length === 0) {
            setFieldConfig(fieldsFromBackend)
          }
        } else {
          console.error('Failed to fetch database fields')
          toast.error('Failed to load database fields')
        }
      } catch (error) {
        console.error('Error fetching database fields:', error)
        toast.error('Failed to load database fields')
      } finally {
        setLoadingFields(false)
      }
    }

    fetchDatabaseFields()
  }, [])
  
  function getLabelFromDatabaseFields(fieldKey: string) {
    return (databaseFields.find(f => f.field === fieldKey)?.label) || fieldKey;
  }

  function handleReset() {
    setCompany(null)
    setUploaded(null)
    setMapping(null)
    setFinalTables([])
    setFieldConfig(databaseFields)
    fetchMappingRef.current = false
    setShowFieldMapper(false)
    setShowTableEditor(false)
    setSkipped(false)
    setShowRejectModal(false)
    setRejectReason('')
    setSubmitting(false)
    setPlanTypes([])
    setEditedTables([])
    setOriginalFile(null)
    setExtractionHistory([])
    setCurrentExtractionIndex(0)
    setIsUsingAnotherExtraction(false)
    setHasUsedAnotherExtraction(false)
  }

  // Handle upload result with quality assessment
  function handleUploadResult({ tables, upload_id, file_name, file, plan_types, field_config, quality_summary, extraction_config }: any) {
    // Store original file for re-extraction
    if (file && !originalFile) {
      setOriginalFile(file)
    }
    
    // Add current tables to extraction history if this is a new extraction
    if (extractionHistory.length === 0) {
      // First extraction
      setExtractionHistory([tables])
      setCurrentExtractionIndex(0)
    } else {
      // Subsequent extraction - add to history
      setExtractionHistory(prev => [...prev, tables])
      setCurrentExtractionIndex(prev => prev + 1)
    }
    
    setUploaded({ tables, upload_id, file_name, file })
    setMapping(null)
    setFinalTables([])
    setFieldConfig(field_config || databaseFields)
    fetchMappingRef.current = false
    setShowFieldMapper(false)
    setShowTableEditor(true) // Show table editor first
    setSkipped(false)
    setShowRejectModal(false)
    setRejectReason('')
    if (plan_types) setPlanTypes(plan_types)
    

  }

  // NEW: Handle table name changes from ExtractedTables
  function handleExtractedTablesChange(newTables: any[]) {
    setUploaded((prev: any) => prev ? { ...prev, tables: newTables } : prev)
  }

  // Table Editor handlers
  async function handleSaveEditedTables(tables: any[]) {
    if (!company || !uploaded?.upload_id) return
    
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/table-editor/save-tables/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          upload_id: uploaded.upload_id,
          company_id: company.id,
          tables: tables
        }),
      })
      
      if (response.ok) {
        setEditedTables(tables)
        toast.success('Tables saved successfully!')
        return true
      } else {
        const error = await response.json()
        toast.error(error.detail || 'Failed to save tables')
        return false
      }
    } catch (error) {
      console.error('Error saving tables:', error)
      toast.error('Failed to save tables')
      return false
    }
  }

  async function handleUseAnotherExtraction() {
    if (!uploaded?.upload_id || !company?.id) {
      toast.error('No upload or company selected')
      return
    }

    try {
      setIsUsingAnotherExtraction(true)
      
      // Save current extraction to history before trying another method
      if (uploaded.tables && uploaded.tables.length > 0) {
        setExtractionHistory(prev => [...prev, uploaded.tables])
        setCurrentExtractionIndex(prev => prev + 1)
      }

      const formData = new FormData()
      formData.append('file', originalFile!)
      formData.append('company_id', company.id)

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/extract-tables-docling/`, {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const result = await response.json()
      
      if (result.success) {
        setUploaded({
          ...uploaded,
          tables: result.tables,
          extraction_method: 'docling'
        })
        setHasUsedAnotherExtraction(true)
        toast.success('Successfully extracted with Docling!')
      } else {
        throw new Error(result.error || 'Extraction failed')
      }
    } catch (error) {
      console.error('Error using another extraction method:', error)
      toast.error('Failed to extract with alternative method')
    } finally {
      setIsUsingAnotherExtraction(false)
    }
  }

  async function handleImproveExtraction() {
    if (!uploaded?.upload_id || !company?.id) {
      toast.error('No upload or company selected')
      return
    }

    try {
      setIsImprovingExtraction(true)
      toast.loading('Improving extraction with GPT-4o Vision...', { id: 'improve-extraction' })

      const formData = new FormData()
      formData.append('upload_id', uploaded.upload_id)
      formData.append('company_id', company.id)
      formData.append('max_pages', '5')

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/improve-extraction/improve-current-extraction/`, {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`)
      }

      const result = await response.json()
      
      if (result.success) {
        // Update the uploaded tables with the improved results
        setUploaded({
          ...uploaded,
          tables: result.improved_tables || uploaded.tables,
          enhancement_metadata: {
            method: 'gpt4o_vision',
            timestamp: result.enhancement_timestamp,
            diagnostic_info: result.diagnostic_info,
            overall_notes: result.overall_notes,
            processing_time: result.processing_time_seconds
          }
        })
        
        toast.success(`Extraction improved! ${result.improved_tables_count} tables enhanced.`, { id: 'improve-extraction' })
        
        // Show diagnostic information if available
        if (result.diagnostic_info?.warnings?.length > 0) {
          toast(`Found ${result.diagnostic_info.warnings.length} structural issues. Check the table for details.`, { 
            id: 'improve-extraction-warnings',
            duration: 5000 
          })
        }
      } else {
        throw new Error(result.error || 'Improvement failed')
      }
    } catch (error) {
      console.error('Error improving extraction:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      toast.error(`Failed to improve extraction: ${errorMessage}`, { id: 'improve-extraction' })
    } finally {
      setIsImprovingExtraction(false)
    }
  }

  function handleGoToFieldMapping() {
    setShowTableEditor(false)
    setShowFieldMapper(true)
  }

  function handleGoToPreviousExtraction() {
    if (currentExtractionIndex > 0) {
      const previousIndex = currentExtractionIndex - 1
      const previousTables = extractionHistory[previousIndex]
      
      setCurrentExtractionIndex(previousIndex)
      setUploaded((prev: any) => prev ? { ...prev, tables: previousTables } : prev)
      setEditedTables([])
      toast.success('Switched to previous extraction')
    }
  }

  function handleCloseTableEditor() {
    setShowTableEditor(false)
  }

  function applyMapping(
    tables: any[],
    mapping: Record<string, string>,
    fieldConfigOverride: FieldConfig[]
  ) {
    console.log('applyMapping called with:', { tables, mapping, fieldConfigOverride })
    
    const mappedRows = []
    const dashboardHeader = fieldConfigOverride.map(f => f.field)
    
    for (const table of tables) {
      console.log('Processing table:', table)
      const tableRows = []
      for (const row of table.rows) {
        console.log('Processing row:', row, 'Type:', typeof row, 'Is Array:', Array.isArray(row))
        
        // Ensure row is an array
        if (!Array.isArray(row)) {
          console.error('Row is not an array:', row)
          continue
        }
        
        // Create an array of values in the correct order based on fieldConfig
        const mappedRow: string[] = []
        for (const field of dashboardHeader) {
          const column = mapping[field]
          if (column) {
            const colIndex = table.header.indexOf(column)
            if (colIndex !== -1 && row[colIndex] !== undefined) {
              mappedRow.push(row[colIndex])
            } else {
              mappedRow.push('')
            }
          } else {
            mappedRow.push('')
          }
        }
        tableRows.push(mappedRow)
      }
      mappedRows.push({
        ...table,
        header: dashboardHeader, // Use field keys as header
        rows: tableRows,
        field_config: fieldConfigOverride,
      })
    }
    
    console.log('Final mapped rows:', mappedRows)
    setFinalTables(mappedRows)
  }

  async function handleApprove() {
    if (!company || !uploaded?.upload_id) return
    
    setSubmitting(true)
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/review/approve/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          upload_id: uploaded.upload_id,
          final_data: finalTables,
          field_config: fieldConfig,
          plan_types: planTypes,
        }),
      })
      
      if (response.ok) {
        toast.success('Statement approved successfully!')
        router.push('/review')
      } else {
        const error = await response.json()
        toast.error(error.detail || 'Failed to approve statement')
      }
    } catch (error) {
      console.error('Error approving statement:', error)
      toast.error('Failed to approve statement')
    } finally {
      setSubmitting(false)
    }
  }

  function handleReject() {
    setShowRejectModal(true)
  }

  async function handleRejectSubmit() {
    if (!company || !uploaded?.upload_id || !rejectReason.trim()) return
    
    setSubmitting(true)
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/review/reject/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          upload_id: uploaded.upload_id,
          final_data: finalTables,
          rejection_reason: rejectReason,
          field_config: fieldConfig,
          plan_types: planTypes,
        }),
      })
      
      if (response.ok) {
        toast.success('Statement rejected successfully!')
        router.push('/review')
      } else {
        const error = await response.json()
        toast.error(error.detail || 'Failed to reject statement')
      }
    } catch (error) {
      console.error('Error rejecting statement:', error)
      toast.error('Failed to reject statement')
    } finally {
      setSubmitting(false)
      setShowRejectModal(false)
    }
  }

  // 1. Show upload interface if no company selected or no upload yet
  if (!company || !uploaded) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-gray-100 to-blue-50 flex items-center justify-center px-4">
        <div className="w-full max-w-7xl mx-auto shadow-2xl bg-white/90 rounded-3xl p-10 border">
          <h1 className="text-4xl font-extrabold mb-8 text-gray-800 text-center tracking-tight">
            <span className="bg-gradient-to-r from-blue-600 to-indigo-500 text-transparent bg-clip-text">
              Commission Statement Upload
            </span>
          </h1>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            {/* Left Column - Carrier Selection */}
            <div className="space-y-6">
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-6 border border-blue-100">
                <h2 className="text-2xl font-bold text-gray-800 mb-4">
                  <span className="bg-gradient-to-r from-blue-600 to-indigo-600 text-transparent bg-clip-text">
                    Select or Add Carrier
                  </span>
                </h2>
                <CompanySelect value={company?.id} onChange={setCompany} />
              </div>
              
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl p-6 border border-green-100">
                <h3 className="text-lg font-semibold text-gray-800 mb-3">
                  <span className="bg-gradient-to-r from-green-600 to-emerald-600 text-transparent bg-clip-text">
                    Upload Requirements
                  </span>
                </h3>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    PDF commission statements only
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    Maximum file size: 10MB
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    Automatic quality assessment
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    AI-powered data extraction
                  </li>
                </ul>
              </div>
            </div>
            
            {/* Right Column - Upload Zone */}
            <div className="flex flex-col h-full">
              <AdvancedUploadZone
                onParsed={handleUploadResult}
                disabled={!company}
                companyId={company?.id || ''}
              />
            </div>
          </div>
          
          <div className="text-center text-sm text-gray-500 mt-6">
            AI-powered extraction with quality assessment and validation
          </div>
        </div>
      </main>
    )
  }

  if (fetchingMapping && !showFieldMapper) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-100 to-blue-50">
        <Loader message="Loading saved mapping..." />
      </main>
    )
  }

  // 2. Show Table Editor first (new step)
  if (uploaded?.tables?.length && company && showTableEditor) {
    return (
      <TableEditor
        tables={uploaded.tables}
        onTablesChange={(newTables) => {
          setUploaded((prev: any) => prev ? { ...prev, tables: newTables } : prev)
        }}
        onSave={handleSaveEditedTables}
        onUseAnotherExtraction={handleUseAnotherExtraction}
        onGoToFieldMapping={handleGoToFieldMapping}
        onGoToPreviousExtraction={handleGoToPreviousExtraction}
        onClose={handleCloseTableEditor}
        uploaded={uploaded}
        loading={submitting || isUsingAnotherExtraction}
        extractionHistory={extractionHistory}
        currentExtractionIndex={currentExtractionIndex}
        isUsingAnotherExtraction={isUsingAnotherExtraction}
        hasUsedAnotherExtraction={hasUsedAnotherExtraction}
        onImproveExtraction={handleImproveExtraction}
        isImprovingExtraction={isImprovingExtraction}
      />
    )
  }

  // 3. If mapping exists, auto-apply; else, show FieldMapper (skip if skipped)
  if (uploaded?.tables?.length && company && (showFieldMapper || (!mapping && !skipped))) {
    // Only fetch mapping once when needed
    if (!fetchMappingRef.current && !fetchingMapping && !showFieldMapper && !mapping) {
      fetchMappingRef.current = true
      setFetchingMapping(true)
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/companies/${company.id}/mapping/`)
        .then(r => r.json())
        .then(map => {
          let mappingObj: Record<string, string> | null = null
          let fieldsArr = fieldConfig
          let loadedPlanTypes: string[] | null = null
          let loadedTableNames: string[] | null = null
          if (map && typeof map === 'object') {
            if (map.mapping) {
              mappingObj = map.mapping
              // Use backend's field_config as-is if present
              if (Array.isArray(map.field_config) && map.field_config.length > 0) {
                fieldsArr = map.field_config
              } else if (mappingObj) {
                fieldsArr = Object.keys(mappingObj).map(field => ({
                  field,
                  label: getLabelFromDatabaseFields(field)
                }))
              } else {
                fieldsArr = databaseFields
              }
              if (map.plan_types) loadedPlanTypes = map.plan_types
              if (map.table_names) loadedTableNames = map.table_names
            } else if (Array.isArray(map)) {
              mappingObj = {}
              fieldsArr = []
              map.forEach((row: any) => {
                mappingObj![row.field_key] = row.column_name
                if (!fieldsArr.some(f => f.field === row.field_key))
                  fieldsArr.push({
                    field: row.field_key,
                    label: getLabelFromDatabaseFields(row.field_key) // Use pretty label!
                  })
              })
              if (!fieldsArr.length) fieldsArr = fieldConfig
            }
          }
          if (mappingObj && Object.keys(mappingObj).length) {
            setMapping(mappingObj)
            setFieldConfig(fieldsArr)
            applyMapping(uploaded.tables, mappingObj, fieldsArr)
            if (loadedPlanTypes) setPlanTypes(loadedPlanTypes)
            // Optionally set table names if needed
          }
          setFetchingMapping(false)
        })
        .catch(() => setFetchingMapping(false))
    }

    return (
      <main className="min-h-screen bg-gradient-to-br from-gray-100 to-blue-50 flex items-center justify-center px-4">
        <div className="w-full max-w-7xl mx-auto shadow-2xl bg-white/90 rounded-3xl p-8 border">
          <h1 className="text-3xl font-bold mb-6 text-gray-800 text-center tracking-tight">
            <span className="bg-gradient-to-r from-blue-600 to-indigo-500 text-transparent bg-clip-text">
              Map Fields for {company.name}
            </span>
          </h1>
          
          
          {/* Single Column Layout */}
          <div className="space-y-8">
            {/* Field Mapper Section */}
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
              {(editedTables.length > 0 ? editedTables : uploaded.tables)[0]?.header && (editedTables.length > 0 ? editedTables : uploaded.tables)[0].header.length > 0 && (
                <FieldMapper
                  company={company}
                  columns={(editedTables.length > 0 ? editedTables : uploaded.tables)[0].header}
                  initialPlanTypes={planTypes}
                  onSave={async (map, fieldConf, selectedPlanTypes) => {
                    setMapping(map)
                    setFieldConfig(fieldConf)
                    setPlanTypes(selectedPlanTypes)
                    // Always send the current fields as field_config
                    const config = {
                      mapping: map,
                      plan_types: selectedPlanTypes,
                      table_names: (editedTables.length > 0 ? editedTables : uploaded.tables).map((t: any) => t.name || ''),
                      field_config: fieldConf,
                    }
                    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/companies/${company.id}/mapping/`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(config),
                    })
                    applyMapping(editedTables.length > 0 ? editedTables : uploaded.tables, map, fieldConf)
                    setShowFieldMapper(false)
                    setSkipped(false)
                  }}
                  onSkip={() => {
                    // Set fieldConfig to match extracted table headers
                    const tablesToUse = editedTables.length > 0 ? editedTables : uploaded.tables;
                    const extractedHeaders = tablesToUse.map((t: any) => t.header);
                    const extractedFieldConfig = tablesToUse.map((t: any) => t.header.map((col: string) => ({ field: col, label: col })));
                    // Save table names and plan types per table
                    const tableNames = tablesToUse.map((t: any) => t.name || '');
                    
                    // Ensure the tables have the correct structure for DashboardTable
                    const processedTables = tablesToUse.map((t: any) => ({
                      ...t,
                      header: t.header || [],
                      rows: t.rows || []
                    }));
                    
                    setFinalTables(processedTables);
                    setFieldConfig(extractedFieldConfig[0]); // Use first table's config for DashboardTable
                    setShowFieldMapper(false);
                    setMapping(null);
                    setSkipped(true);
                    setPlanTypes(planTypes); // preserve selected plan types
                  }}
                  initialFields={fieldConfig}
                  initialMapping={mapping}
                />
              )}
            </div>

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
                  tables={editedTables.length > 0 ? editedTables : uploaded.tables} 
                  onTablesChange={handleExtractedTablesChange} 
                />
              </div>
            </div>
          </div>

          <div className="flex justify-center gap-4 mt-8">
            <button 
              onClick={() => setShowTableEditor(true)} 
              className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-2"
            >
              <Pencil className="w-4 h-4" />
              Back to Table Editor
            </button>
            <button onClick={handleReset} className="px-4 py-2 rounded bg-gray-300 text-gray-700 hover:bg-gray-400">
              Start Over
            </button>
          </div>
        </div>
      </main>
    )
  }

  // 3. Show mapped/standardized table views **or** skipped/raw extracted table view + Approve/Reject buttons
  if ((mapping && !showFieldMapper) || skipped) {

    return (
      <>
        {submitting && (
          <div className="fixed inset-0 bg-black bg-opacity-20 flex items-center justify-center z-50">
            <Loader message="Submitting..." />
          </div>
        )}
        

        
        <main className="min-h-screen bg-gradient-to-br from-gray-100 to-blue-50 flex items-center justify-center px-4">
          <div className="w-full max-w-[1800px] md:w-[92vw] mx-auto shadow-2xl bg-white/90 rounded-3xl p-10 border">
            <h1 className="text-4xl font-extrabold mb-8 text-gray-800 text-center tracking-tight">
              <span className="bg-gradient-to-r from-blue-600 to-indigo-500 text-transparent bg-clip-text">
                Commission Statement Upload
              </span>
            </h1>
            

            
            <div className="flex justify-center mb-4">
              <button
                onClick={handleReset}
                className="px-4 py-2 rounded bg-blue-600 text-white font-semibold shadow hover:bg-blue-700 transition"
              >
                Upload Another PDF
              </button>
            </div>
            <DashboardTable
              tables={finalTables}
              fieldConfig={fieldConfig}
              onEditMapping={() => {
                setShowFieldMapper(true);
                setSkipped(false);
              }}
              company={company}
              fileName={uploaded?.file_name || "uploaded.pdf"}
              fileUrl={uploaded?.file?.url || null}
              readOnly={false}
              onTableChange={setFinalTables}
              planTypes={planTypes}
            />

            <div className="flex justify-center gap-6 mt-8">
              <button
                className="bg-green-600 text-white px-6 py-2 rounded-xl font-semibold shadow hover:bg-green-700 transition text-lg"
                onClick={handleApprove}
              >
                Approve
              </button>
              <button
                className="bg-red-600 text-white px-6 py-2 rounded-xl font-semibold shadow hover:bg-red-700 transition text-lg"
                onClick={handleReject}
              >
                Reject
              </button>
            </div>
            {showRejectModal && (
              <Modal onClose={() => setShowRejectModal(false)}>
                <div>
                  <div className="mb-2 font-bold text-lg text-gray-800">Reject Submission</div>
                  <input
                    className="border rounded px-2 py-1 w-full mb-3"
                    placeholder="Enter rejection reason"
                    value={rejectReason}
                    onChange={e => setRejectReason(e.target.value)}
                  />
                  <div className="flex gap-3 mt-4">
                    <button
                      className="bg-red-600 text-white px-4 py-2 rounded font-semibold"
                      disabled={!rejectReason.trim()}
                      onClick={handleRejectSubmit}
                    >Submit</button>
                    <button
                      className="bg-gray-300 text-gray-800 px-4 py-2 rounded"
                      onClick={() => setShowRejectModal(false)}
                    >Cancel</button>
                  </div>
                </div>
              </Modal>
            )}
          </div>
        </main>
      </>

    )
  }

  // fallback: shouldn't ever get here
  return null
}
