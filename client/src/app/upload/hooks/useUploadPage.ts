'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'react-hot-toast'
import { useProgressTracking } from '../../hooks/useProgressTracking'

type FieldConfig = { field: string, label: string }
type Company = { id: string, name: string } | null

export function useUploadPage() {
  const [company, setCompany] = useState<Company>(null)
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
  const [mappingAutoApplied, setMappingAutoApplied] = useState(false)
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [savingMapping, setSavingMapping] = useState(false)
  const [planTypes, setPlanTypes] = useState<string[]>([])
  const [editedTables, setEditedTables] = useState<any[]>([])
  const [originalFile, setOriginalFile] = useState<File | null>(null)
  const [formatLearning, setFormatLearning] = useState<any>(null)
  
  // Extraction history management
  const [extractionHistory, setExtractionHistory] = useState<any[][]>([])
  const [currentExtractionIndex, setCurrentExtractionIndex] = useState(0)
  
  // Loading state for another extraction method
  const [isUsingAnotherExtraction, setIsUsingAnotherExtraction] = useState(false)
  
  // Track if another extraction method has been used
  const [hasUsedAnotherExtraction, setHasUsedAnotherExtraction] = useState(false)

  // GPT-4o Vision improvement functionality
  const [isImprovingExtraction, setIsImprovingExtraction] = useState(false)

  // Date extraction state
  const [selectedStatementDate, setSelectedStatementDate] = useState<any>(null)

  // Progress tracking hook
  const { saveProgress, loadProgress, resumeSession, markUnsaved, clearAutoSave, autoSaveProgress } = useProgressTracking({
    uploadId: uploaded?.upload_id,
    currentStep: showTableEditor ? 'table_editor' : showFieldMapper ? 'field_mapper' : finalTables.length > 0 ? 'dashboard' : 'upload',
    autoSaveInterval: 60000,
    onProgressSaved: (step, data) => {
      console.log(`Progress saved for step: ${step}`, data)
    },
    onProgressLoad: (step, data) => {
      console.log(`Progress loaded for step: ${step}`, data)
      // Load selected statement date from progress data
      if (data.selected_statement_date && !selectedStatementDate) {
        console.log('🎯 Loading selected statement date from progress:', data.selected_statement_date)
        setSelectedStatementDate(data.selected_statement_date)
      }
    }
  })

  const fetchMappingRef = useRef(false)
  const resumeFileRef = useRef(false)
  const router = useRouter()
  
  // Handler for statement date selection
  const handleStatementDateSelect = useCallback((dateInfo: any) => {
    setSelectedStatementDate(dateInfo)
    
    // Save the selected date to progress
    if (uploaded?.upload_id) {
      saveProgress('table_editor', {
        selected_statement_date: dateInfo
      })
    }
  }, [uploaded?.upload_id])

  // Helper function to get label from database fields
  const getLabelFromDatabaseFields = useCallback((fieldKey: string) => {
    return (databaseFields.find(f => f.field === fieldKey)?.label) || fieldKey;
  }, [databaseFields]);

  // Reset fetchMappingRef when upload changes
  useEffect(() => {
    fetchMappingRef.current = false
  }, [uploaded?.upload_id])

  // Fetch saved mapping for the company when tables are available
  useEffect(() => {
    console.log('🔍 Mapping fetch effect triggered:', {
      hasTables: !!uploaded?.tables?.length,
      hasCompany: !!company,
      notFetching: !fetchingMapping,
      noMapping: !mapping,
      fetchMappingRef: fetchMappingRef.current,
      selectedStatementDate: selectedStatementDate
    })
    
    if (uploaded?.tables?.length && company && !fetchingMapping && !mapping) {
      if (!fetchMappingRef.current) {
        console.log('🚀 Fetching mapping for company:', company.id)
        fetchMappingRef.current = true
        setFetchingMapping(true)
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/companies/${company.id}/mapping/`)
          .then(r => r.json())
          .then(map => {
            console.log('📥 Received mapping response:', map)
            let mappingObj: Record<string, string> | null = null
            let fieldsArr = fieldConfig
            let loadedPlanTypes: string[] | null = null
            let loadedTableNames: string[] | null = null
            if (map && typeof map === 'object') {
              if (map.mapping) {
                mappingObj = map.mapping
                if (Array.isArray(map.field_config) && map.field_config.length > 0) {
                  fieldsArr = map.field_config
                } else if (mappingObj) {
                  fieldsArr = Object.keys(mappingObj).map(field => ({
                    field,
                    label: getLabelFromDatabaseFields(field)
                  }))
                } else {
                  fieldsArr = []
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
                      label: getLabelFromDatabaseFields(row.field_key)
                    })
                })
                if (!fieldsArr.length) fieldsArr = []
              }
            }
            if (mappingObj && Object.keys(mappingObj).length) {
              console.log('✅ Found saved mapping:', mappingObj)
              setMapping(mappingObj)
              setFieldConfig(fieldsArr)
              if (loadedPlanTypes) setPlanTypes(loadedPlanTypes)
              console.log('✅ Mapping loaded, will show in FieldMapper')
            } else {
              console.log('❌ No mapping found or mapping is empty')
            }
            setFetchingMapping(false)
          })
          .catch((error) => {
            console.error('❌ Error fetching mapping:', error)
            setFetchingMapping(false)
          })
      }
    }
  }, [uploaded?.tables?.length, company, fetchingMapping, mapping, fieldConfig, databaseFields, getLabelFromDatabaseFields])

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
          
          if (fieldConfig.length === 0) {
            setFieldConfig([])
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

    if (databaseFields.length === 0) {
      fetchDatabaseFields()
    }
  }, [databaseFields.length, fieldConfig.length])

  // Handle URL parameters for resuming files and check for active sessions
  const handleResumeFile = useCallback(async (fileId: string, stepParam?: string | null) => {
    if (resumeFileRef.current) {
      console.log('🔄 Resume file already in progress, skipping...')
      return
    }
    
    resumeFileRef.current = true
    console.log('🎯 Starting resume file process for:', fileId)
    
    try {
      const uploadResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/pending/files/single/${fileId}`)
      if (!uploadResponse.ok) {
        throw new Error('Failed to fetch upload details')
      }
      
      const uploadData = await uploadResponse.json()
      if (!uploadData.success || !uploadData.upload) {
        throw new Error('Upload not found')
      }
      
      const upload = uploadData.upload
      
      setUploaded({
        upload_id: fileId,
        file_name: upload.file_name,
        tables: upload.raw_data || upload.edited_tables || [],
        file: { url: upload.file_url }
      })
      
      const currentStep = stepParam || upload.current_step || 'upload'
      
      // Load selected statement date if available
      console.log('🎯 handleResumeFile: Checking for selected_statement_date in upload:', upload.selected_statement_date)
      if (upload.selected_statement_date) {
        setSelectedStatementDate(upload.selected_statement_date)
        console.log('🎯 Loaded selected statement date:', upload.selected_statement_date)
      } else {
        console.log('🎯 handleResumeFile: No selected_statement_date found in upload data')
      }
      
      if (currentStep === 'table_editor') {
        setEditedTables(upload.edited_tables || upload.raw_data || [])
        setShowTableEditor(true)
        setShowFieldMapper(false)
        setSkipped(false)
      } else if (currentStep === 'field_mapper') {
        setMapping(upload.field_mapping || null)
        setFieldConfig(upload.field_config || [])
        setPlanTypes(upload.plan_types || [])
        setShowFieldMapper(true)
        setShowTableEditor(false)
        setSkipped(false)
      } else if (currentStep === 'dashboard') {
        setFinalTables(upload.final_data || upload.edited_tables || upload.raw_data || [])
        setFieldConfig(upload.field_config || [])
        setPlanTypes(upload.plan_types || [])
        setMapping(upload.field_mapping || null)
        setSkipped(upload.status === 'skipped')
        setShowFieldMapper(false)
        setShowTableEditor(false)
      } else {
        setShowTableEditor(true)
        setShowFieldMapper(false)
        setSkipped(false)
      }
      
      if (upload.company_id && !company) {
        console.log('🎯 Setting company from upload data:', {
          company_id: upload.company_id,
          company_name: upload.company_name,
          upload: upload
        })
        
        if (!upload.company_name) {
          try {
            const companyResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/companies/${upload.company_id}`)
            if (companyResponse.ok) {
              const companyData = await companyResponse.json()
              setCompany({
                id: upload.company_id,
                name: companyData.name || 'Unknown Company'
              })
              console.log('🎯 Company fetched from backend:', companyData)
            } else {
              setCompany({
                id: upload.company_id,
                name: 'Unknown Company'
              })
            }
          } catch (error) {
            console.error('Error fetching company details:', error)
            setCompany({
              id: upload.company_id,
              name: 'Unknown Company'
            })
          }
        } else {
          setCompany({
            id: upload.company_id,
            name: upload.company_name
          })
        }
      }
      
      toast.success('File resumed successfully')
    } catch (error) {
      console.error('Error resuming file:', error)
      toast.error('Failed to resume file')
    } finally {
      resumeFileRef.current = false
      console.log('🎯 Resume file process completed')
    }
  }, [company, loadProgress])

  // Check for active session
  const checkForActiveSession = useCallback(async () => {
    if (!company) return
    
    try {
      const sessionData = await resumeSession()
      if (sessionData && sessionData.upload_id) {
        handleResumeFile(sessionData.upload_id, null)
      }
    } catch (error) {
      console.log('No active session found')
    }
  }, [company, handleResumeFile, resumeSession])

  // Check for resume parameter and active session
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const resumeFileId = urlParams.get('resume')
    const stepParam = urlParams.get('step')
    
    if (resumeFileId && !uploaded) {
      handleResumeFile(resumeFileId, stepParam)
    } else if (!uploaded && company) {
      checkForActiveSession()
    }
  }, [company, uploaded, handleResumeFile, checkForActiveSession])

  // Load selected statement date when FieldMapper is shown
  useEffect(() => {
    if (showFieldMapper && uploaded?.upload_id && !selectedStatementDate) {
      console.log('🎯 FieldMapper shown, loading selected statement date from progress')
      loadProgress('table_editor').then((data) => {
        if (data && data.selected_statement_date) {
          console.log('🎯 Loaded selected statement date from progress:', data.selected_statement_date)
          setSelectedStatementDate(data.selected_statement_date)
        }
      })
    }
  }, [showFieldMapper, uploaded?.upload_id, selectedStatementDate])

  // Auto-save progress when user navigates away or closes browser
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (uploaded?.upload_id && (showTableEditor || showFieldMapper || finalTables.length > 0)) {
        const currentStep = showTableEditor ? 'table_editor' : showFieldMapper ? 'field_mapper' : 'dashboard'
        const progressData = {
          current_step: currentStep,
          final_data: finalTables,
          field_config: fieldConfig,
          mapping: mapping,
          plan_types: planTypes,
          skipped: skipped,
          edited_tables: editedTables,
          selected_statement_date: selectedStatementDate
        }
        
        autoSaveProgress(currentStep, progressData)
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      handleBeforeUnload()
    }
  }, [uploaded?.upload_id, showTableEditor, showFieldMapper, finalTables, fieldConfig, mapping, planTypes, skipped, editedTables, selectedStatementDate, autoSaveProgress])

  function handleReset() {
    setCompany(null)
    setUploaded(null)
    setMapping(null)
    setShowFieldMapper(false)
    setShowTableEditor(false)
    setSkipped(false)
    setMappingAutoApplied(false)
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
    setFormatLearning(null)
    setFinalTables([])
    setFieldConfig([])
    fetchMappingRef.current = false
    resumeFileRef.current = false
    clearAutoSave()
  }

  // Handle upload result with quality assessment
  function handleUploadResult({ tables, upload_id, file_name, file, plan_types, field_config, quality_summary, extraction_config, format_learning }: any) {
    if (file && !originalFile) {
      setOriginalFile(file)
    }
    
    if (extractionHistory.length === 0) {
      setExtractionHistory([tables])
      setCurrentExtractionIndex(0)
    } else {
      setExtractionHistory(prev => [...prev, tables])
      setCurrentExtractionIndex(prev => prev + 1)
    }
    
    setUploaded({ tables, upload_id, file_name, file })
    setFinalTables([])
    setFieldConfig(field_config || [])
    setFormatLearning(format_learning)
    
    if (format_learning?.suggested_mapping && Object.keys(format_learning.suggested_mapping).length > 0) {
      setMapping(format_learning.suggested_mapping)
      setMappingAutoApplied(true)
      toast.success('Field mappings auto-populated from learned format!')
    } else {
      setMapping(null)
      setMappingAutoApplied(false)
    }
    
    fetchMappingRef.current = false
    setShowFieldMapper(false)
    setShowTableEditor(true)
    setSkipped(false)
    setShowRejectModal(false)
    setRejectReason('')
    if (plan_types) setPlanTypes(plan_types)
    
    if (upload_id) {
      saveProgress('upload', {
        tables,
        file_name,
        plan_types,
        field_config,
        quality_summary,
        extraction_config,
        format_learning
      })
    }
  }

  // Handle table name changes from ExtractedTables
  async function handleExtractedTablesChange(newTables: any[]) {
    setUploaded((prev: any) => prev ? { ...prev, tables: newTables } : prev)
    
    if (company?.id && newTables.length > 0) {
      try {
        const tablesWithSummaryRows = [...newTables]
        
        for (let tableIdx = 0; tableIdx < newTables.length; tableIdx++) {
          const table = newTables[tableIdx]
          
          const response = await fetch('/api/summary-rows/detect-summary-rows/', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              company_id: company.id,
              table_data: {
                header: table.header,
                rows: table.rows
              }
            })
          })

          if (response.ok) {
            const result = await response.json()
            if (result.detected_summary_rows.length > 0) {
              if (!tablesWithSummaryRows[tableIdx].summaryRows) {
                tablesWithSummaryRows[tableIdx].summaryRows = new Set()
              }
              
              result.detected_summary_rows.forEach((rowIdx: number) => {
                tablesWithSummaryRows[tableIdx].summaryRows!.add(rowIdx)
              })
              
              console.log(`Auto-detected ${result.detected_summary_rows.length} summary rows in table ${tableIdx + 1}`)
            }
          }
        }
        
        setUploaded((prev: any) => prev ? { ...prev, tables: tablesWithSummaryRows } : prev)
        
      } catch (error) {
        console.error('Error auto-detecting summary rows:', error)
      }
    }
  }

  // Table Editor handlers
  async function handleSaveEditedTables(tables: any[], selectedDate?: any): Promise<boolean> {
    // Use the passed selectedDate parameter if available, otherwise use the state
    const dateToSave = selectedDate || selectedStatementDate
    
    if (!company || !uploaded?.upload_id) return false
    
    try {
      const requestBody = {
        upload_id: uploaded.upload_id,
        company_id: company.id,
        tables: tables,
        selected_statement_date: dateToSave
      }
      
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/table-editor/save-tables/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })
      
      if (response.ok) {
        console.log('🎯 useUploadPage: Save successful, setting editedTables')
        setEditedTables(tables)
        
        const progressData = {
          tables,
          company_id: company.id,
          selected_statement_date: dateToSave
        }
        saveProgress('table_editor', progressData)
        
        toast.success('Tables and statement date saved successfully!')
        return true
      } else {
        const error = await response.json()
        console.error('🎯 useUploadPage: Save failed:', error)
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
      toast.loading('Improving extraction with GPT-4o Vision and LLM format enforcement...', { id: 'improve-extraction' })

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
        setUploaded({
          ...uploaded,
          tables: result.tables || uploaded.tables,
          enhancement_metadata: {
            method: 'gpt4o_vision_with_llm_formatting',
            timestamp: result.enhancement_timestamp,
            diagnostic_info: result.diagnostic_info,
            overall_notes: result.overall_notes,
            processing_time: result.extraction_time_seconds,
            format_accuracy: result.format_accuracy
          }
        })
        
        const formatAccuracy = result.format_accuracy || '≥90%'
        toast.success(`Extraction improved with LLM format enforcement! ${result.tables?.length || 0} tables enhanced with ${formatAccuracy} accuracy.`, { id: 'improve-extraction' })
        
        if (result.diagnostic_info?.warnings?.length > 0) {
          toast(`Found ${result.diagnostic_info.warnings.length} structural issues. Check the table for details.`, { 
            id: 'improve-extraction-warnings',
            duration: 5000 
          })
        }
        
        if (result.format_accuracy) {
          toast(`Data formatted to match LLM specifications with ${result.format_accuracy} accuracy.`, { 
            id: 'improve-extraction-format',
            duration: 7000 
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
    console.log('🎯 useUploadPage: handleGoToFieldMapping called')
    console.log('🎯 useUploadPage: Current selectedStatementDate:', selectedStatementDate)
    setShowTableEditor(false)
    setShowFieldMapper(true)
    
    if (uploaded?.upload_id) {
      saveProgress('field_mapper', {
        current_step: 'field_mapper',
        selected_statement_date: selectedStatementDate
      })
    }
    console.log('🎯 useUploadPage: Field mapper state set to true')
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
    fieldConfigOverride: FieldConfig[],
    onComplete?: () => void
  ) {
    console.log('applyMapping called with:', { tables, mapping, fieldConfigOverride })
    
    const mappedRows = []
    const dashboardHeader = fieldConfigOverride.map(f => f.field)
    
    for (const table of tables) {
      console.log('Processing table:', table)
      const tableRows = []
      for (const row of table.rows) {
        console.log('Processing row:', row, 'Type:', typeof row, 'Is Array:', Array.isArray(row))
        
        if (!Array.isArray(row)) {
          console.error('Row is not an array:', row)
          continue
        }
        
        // Create an object with field names as keys instead of an array
        const mappedRow: Record<string, string> = {}
        for (const field of dashboardHeader) {
          const column = mapping[field]
          if (column) {
            const colIndex = table.header.indexOf(column)
            if (colIndex !== -1 && row[colIndex] !== undefined) {
              mappedRow[field] = row[colIndex]
            } else {
              mappedRow[field] = ''
            }
          } else {
            mappedRow[field] = ''
          }
        }
        tableRows.push(mappedRow)
      }
      mappedRows.push({
        ...table,
        header: dashboardHeader,
        rows: tableRows,
        field_config: fieldConfigOverride,
      })
    }
    
    console.log('Final mapped rows:', mappedRows)
    setFinalTables(mappedRows)
    console.log('✅ finalTables state updated with', mappedRows.length, 'tables')
    
    if (uploaded?.upload_id) {
      saveProgress('dashboard', {
        final_data: mappedRows,
        field_config: fieldConfigOverride,
        mapping: mapping
      })
    }
    
    if (onComplete) {
      onComplete()
    }
  }

  async function handleApprove() {
    console.log('🎯 useUploadPage: handleApprove called')
    console.log('🎯 useUploadPage: selectedStatementDate in approve:', selectedStatementDate)
    
    if (!company || !uploaded?.upload_id) return
    
    setSubmitting(true)
    try {
      const requestBody = {
        upload_id: uploaded.upload_id,
        final_data: finalTables,
        field_config: fieldConfig,
        plan_types: planTypes,
        selected_statement_date: selectedStatementDate,
      }
      console.log('🎯 useUploadPage: Approve request body:', requestBody)
      
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/review/approve/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })
      
      if (response.ok) {
        saveProgress('completed', {
          status: 'approved',
          final_data: finalTables,
          field_config: fieldConfig,
          plan_types: planTypes,
          selected_statement_date: selectedStatementDate
        })
        
        toast.success('Statement approved successfully!')
        setTimeout(() => {
          console.log('Navigating to dashboard...')
          window.location.href = '/?tab=dashboard'
        }, 1000)
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
      console.log('🎯 useUploadPage: handleRejectSubmit called with selectedStatementDate:', selectedStatementDate);
      
      const requestBody = {
        upload_id: uploaded.upload_id,
        final_data: finalTables,
        rejection_reason: rejectReason,
        field_config: fieldConfig,
        plan_types: planTypes,
        selected_statement_date: selectedStatementDate,
      };
      
      console.log('🎯 useUploadPage: Reject request body:', requestBody);
      
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/review/reject/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })
      
      if (response.ok) {
        saveProgress('completed', {
          status: 'rejected',
          rejection_reason: rejectReason,
          final_data: finalTables,
          field_config: fieldConfig,
          plan_types: planTypes,
          selected_statement_date: selectedStatementDate
        })
        
        toast.success('Statement rejected successfully!')
        setTimeout(() => {
          console.log('Navigating to dashboard...')
          window.location.href = '/?tab=dashboard'
        }, 1000)
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

  async function handleSendToPending() {
    if (!company || !uploaded?.upload_id) return
    
    setSubmitting(true)
    try {
      await saveProgress('dashboard', {
        final_data: finalTables,
        field_config: fieldConfig,
        mapping: mapping,
        plan_types: planTypes,
        skipped: skipped
      })
      
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/pending/update/${uploaded.upload_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'pending',
          current_step: 'dashboard',
          final_data: finalTables,
          field_config: fieldConfig,
          field_mapping: mapping,
          plan_types: planTypes
        }),
      })
      
      if (response.ok) {
        toast.success('File sent to pending successfully!')
        router.push('/?tab=dashboard')
      } else {
        const error = await response.json()
        toast.error(error.detail || 'Failed to send file to pending')
      }
    } catch (error) {
      console.error('Error sending file to pending:', error)
      toast.error('Failed to send file to pending')
    } finally {
      setSubmitting(false)
    }
  }

  // Handle suggested mapping from format learning
  function handleUseSuggestedMapping(suggestedMapping: Record<string, string>) {
    setMapping(suggestedMapping)
    toast.success('Suggested mapping applied!')
  }

  // Field mapper save handler
  async function handleFieldMapperSave(map: Record<string, string>, fieldConf: FieldConfig[], selectedPlanTypes: string[], tableNames?: string[], selectedStatementDate?: any) {
    console.log('🎯 FieldMapper onSave called with:', { map, fieldConf, selectedPlanTypes, selectedStatementDate })
    
    setSavingMapping(true)
    
    try {
      const tablesToUse = editedTables.length > 0 ? editedTables : uploaded.tables.length > 0 ? uploaded.tables : finalTables;
      const config = {
        mapping: map,
        plan_types: selectedPlanTypes,
        table_names: tablesToUse.map((t: any) => t.name || ''),
        field_config: fieldConf,
        table_data: tablesToUse.length > 0 ? tablesToUse[0]?.rows || [] : [],
        headers: tablesToUse.length > 0 ? tablesToUse[0]?.header || [] : [],
        selected_statement_date: selectedStatementDate,
      }
      
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/companies/${company!.id}/mapping/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      
      console.log('✅ Mapping saved successfully')
      
      setMapping(map)
      setFieldConfig(fieldConf)
      setPlanTypes(selectedPlanTypes)
      setSkipped(false)
      setShowTableEditor(false)
      
      applyMapping(editedTables.length > 0 ? editedTables : uploaded.tables.length > 0 ? uploaded.tables : finalTables, map, fieldConf, () => {
        console.log('🎯 applyMapping callback executed, hiding FieldMapper')
        setShowFieldMapper(false)
        setSavingMapping(false)
        console.log('🎯 FieldMapper hidden, transitioning to dashboard')
      })
      
      console.log('🎯 All states set, transitioning to dashboard')
      
      if (uploaded?.upload_id) {
        saveProgress('field_mapper', {
          mapping: map,
          field_config: fieldConf,
          plan_types: selectedPlanTypes,
          table_names: config.table_names,
          selected_statement_date: selectedStatementDate
        })
      }
      
      toast.success('Field mappings saved successfully!')
      
    } catch (error) {
      console.error('❌ Error saving mapping:', error)
      toast.error('Failed to save field mappings')
      setSavingMapping(false)
    }
  }

  // Field mapper skip handler
  function handleFieldMapperSkip() {
    const tablesToUse = editedTables.length > 0 ? editedTables : uploaded.tables;
    const extractedHeaders = tablesToUse.map((t: any) => t.header);
    const extractedFieldConfig = tablesToUse.map((t: any) => t.header.map((col: string) => ({ field: col, label: col })));
    const tableNames = tablesToUse.map((t: any) => t.name || '');
    
    const processedTables = tablesToUse.map((t: any) => ({
      ...t,
      header: t.header || [],
      rows: t.rows || []
    }));
    
    setFinalTables(processedTables);
    setFieldConfig(extractedFieldConfig[0]);
    setShowFieldMapper(false);
    setMapping(null);
    setSkipped(true);
    setPlanTypes(planTypes);
    
    if (uploaded?.upload_id) {
      saveProgress('field_mapper', {
        skipped: true,
        field_config: extractedFieldConfig[0],
        plan_types: planTypes,
        table_names: tableNames,
        final_data: processedTables
      })
      
      saveProgress('dashboard', {
        final_data: processedTables,
        field_config: extractedFieldConfig[0],
        skipped: true
      })
    }
  }

  return {
    // State
    company,
    uploaded,
    mapping,
    fieldConfig,
    databaseFields,
    loadingFields,
    finalTables,
    fetchingMapping,
    showFieldMapper,
    showTableEditor,
    skipped,
    mappingAutoApplied,
    showRejectModal,
    rejectReason,
    submitting,
    savingMapping,
    planTypes,
    editedTables,
    originalFile,
    formatLearning,
    extractionHistory,
    currentExtractionIndex,
    isUsingAnotherExtraction,
    hasUsedAnotherExtraction,
    isImprovingExtraction,
    selectedStatementDate,

    // Actions
    setCompany,
    setUploaded,
    setMapping,
    setFieldConfig,
    setFinalTables,
    setShowFieldMapper,
    setShowTableEditor,
    setSkipped,
    setShowRejectModal,
    setRejectReason,
    setSubmitting,
    setSavingMapping,
    setPlanTypes,
    setEditedTables,
    setOriginalFile,
    setFormatLearning,
    setExtractionHistory,
    setCurrentExtractionIndex,
    setIsUsingAnotherExtraction,
    setHasUsedAnotherExtraction,
    setIsImprovingExtraction,
    setSelectedStatementDate,

    // Handlers
    handleReset,
    handleUploadResult,
    handleExtractedTablesChange,
    handleSaveEditedTables,
    handleUseAnotherExtraction,
    handleImproveExtraction,
    handleGoToFieldMapping,
    handleGoToPreviousExtraction,
    handleCloseTableEditor,
    applyMapping,
    handleApprove,
    handleReject,
    handleRejectSubmit,
    handleSendToPending,
    handleUseSuggestedMapping,
    handleFieldMapperSave,
    handleFieldMapperSkip,
    handleResumeFile,
    checkForActiveSession,
    handleStatementDateSelect,
  }
}
