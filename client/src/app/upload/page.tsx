'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Clock } from 'lucide-react'
import CompanySelect from './components/CompanySelect'
import AdvancedUploadZone from './components/AdvancedUploadZone'
import ExtractedTables from './components/ExtractedTable'
import TableEditor from './components/TableEditor'
import DashboardTable from './components/DashboardTable'
import FieldMapper from './components/FieldMapper'
import PendingFiles from '../components/PendingFiles'
import FormatLearningInfo from './components/FormatLearningInfo'
import { useProgressTracking } from '../hooks/useProgressTracking'

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

  // Pending functionality
  const [showPendingFiles, setShowPendingFiles] = useState(false)
  const [currentStep, setCurrentStep] = useState('upload')

  // Progress tracking hook
  const { saveProgress, loadProgress, resumeSession, markUnsaved, clearAutoSave, autoSaveProgress } = useProgressTracking({
    uploadId: uploaded?.upload_id,
    currentStep,
    autoSaveInterval: 60000, // Increase to 60 seconds to reduce API calls
    onProgressSaved: (step, data) => {
      console.log(`Progress saved for step: ${step}`, data)
    },
    onProgressLoad: (step, data) => {
      console.log(`Progress loaded for step: ${step}`, data)
    }
  })

  const fetchMappingRef = useRef(false)
  const resumeFileRef = useRef(false)
  const router = useRouter()
  
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
      fetchMappingRef: fetchMappingRef.current
    })
    
    if (uploaded?.tables?.length && company && !fetchingMapping && !mapping) {
      // Only fetch mapping once when needed
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
  }, [uploaded?.tables?.length, company, fetchingMapping, mapping, fieldConfig, databaseFields])

  // Debug state changes
  useEffect(() => {
    console.log('🔄 State changed:', {
      mapping: !!mapping,
      showFieldMapper,
      showTableEditor,
      skipped,
      finalTablesLength: finalTables.length,
      currentStep,
      dashboardCondition: (mapping && !showFieldMapper) || skipped || (finalTables.length > 0 && !showFieldMapper)
    })
  }, [mapping, showFieldMapper, showTableEditor, skipped, finalTables.length, currentStep])

  // Handle URL parameters for resuming files and check for active sessions
  const handleResumeFile = useCallback(async (fileId: string, stepParam?: string | null) => {
    // Prevent multiple simultaneous calls
    if (resumeFileRef.current) {
      console.log('🔄 Resume file already in progress, skipping...')
      return
    }
    
    resumeFileRef.current = true
    console.log('🎯 Starting resume file process for:', fileId)
    
    try {
      // First, get the upload details from the backend
      const uploadResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/pending/files/single/${fileId}`)
      if (!uploadResponse.ok) {
        throw new Error('Failed to fetch upload details')
      }
      
      const uploadData = await uploadResponse.json()
      if (!uploadData.success || !uploadData.upload) {
        throw new Error('Upload not found')
      }
      
      const upload = uploadData.upload
      
      // Set the upload data
      setUploaded({
        upload_id: fileId,
        file_name: upload.file_name,
        tables: upload.raw_data || upload.edited_tables || [],
        file: { url: upload.file_url } // If you have file URL stored
      })
      
      // Set the current step
      const currentStep = stepParam || upload.current_step || 'upload'
      setCurrentStep(currentStep)
      
      // Load progress data for the current step
      const stepData = await loadProgress(currentStep)
      
      // Restore state based on the current step
      if (currentStep === 'table_editor') {
        setEditedTables(upload.edited_tables || upload.raw_data || [])
        setShowTableEditor(true)
        setShowFieldMapper(false)
        setSkipped(false)
      } else if (currentStep === 'field_mapper') {
        setMapping(upload.field_mapping || {})
        setFieldConfig(upload.field_config || databaseFields)
        setPlanTypes(upload.plan_types || [])
        setShowFieldMapper(true)
        setShowTableEditor(false)
        setSkipped(false)
      } else if (currentStep === 'dashboard') {
        // For dashboard step, we need to restore the final processed data
        setFinalTables(upload.final_data || upload.edited_tables || upload.raw_data || [])
        setFieldConfig(upload.field_config || databaseFields)
        setPlanTypes(upload.plan_types || [])
        setMapping(upload.field_mapping || null)
        setSkipped(upload.status === 'skipped')
        setShowFieldMapper(false)
        setShowTableEditor(false)
      } else {
        // Default to upload step
        setShowTableEditor(true)
        setShowFieldMapper(false)
        setSkipped(false)
      }
      
      // Set company if available
      if (upload.company_id && !company) {
        console.log('🎯 Setting company from upload data:', {
          company_id: upload.company_id,
          company_name: upload.company_name,
          upload: upload
        })
        
        // Try to fetch company details from backend if name is not available
        if (!upload.company_name) {
          try {
            const companyResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/companies/${upload.company_id}`)
            if (companyResponse.ok) {
              const companyData = await companyResponse.json()
              if (companyData.success && companyData.company) {
                setCompany({
                  id: upload.company_id,
                  name: companyData.company.name || 'Unknown Company'
                })
                console.log('🎯 Company fetched from backend:', companyData.company)
              } else {
                setCompany({
                  id: upload.company_id,
                  name: 'Unknown Company'
                })
              }
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
  }, [company, databaseFields, loadProgress])

  // Check for active session
  const checkForActiveSession = useCallback(async () => {
    if (!company) return
    
    try {
      const sessionData = await resumeSession()
      if (sessionData && sessionData.upload_id) {
        // There's an active session, resume it
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
      // Check if there's an active session for this company
      checkForActiveSession()
    }
  }, [company, uploaded, handleResumeFile, checkForActiveSession])

  // Auto-save progress when user navigates away or closes browser
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (uploaded?.upload_id && currentStep !== 'upload') {
        // Save current progress before leaving
        const progressData = {
          current_step: currentStep,
          final_data: finalTables,
          field_config: fieldConfig,
          mapping: mapping,
          plan_types: planTypes,
          skipped: skipped,
          edited_tables: editedTables
        }
        
        // Use auto-save to avoid blocking the page unload
        autoSaveProgress(currentStep, progressData)
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      // Also save when component unmounts
      handleBeforeUnload()
    }
  }, [uploaded?.upload_id, currentStep, finalTables, fieldConfig, mapping, planTypes, skipped, editedTables, autoSaveProgress])

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

    // Only fetch if we don't already have database fields
    if (databaseFields.length === 0) {
      fetchDatabaseFields()
    }
  }, [databaseFields.length, fieldConfig.length])
  
  function getLabelFromDatabaseFields(fieldKey: string) {
    return (databaseFields.find(f => f.field === fieldKey)?.label) || fieldKey;
  }

  function handleReset() {
    setCompany(null)
    setUploaded(null)
    setMapping(null)
    setShowPendingFiles(false)
    setCurrentStep('upload')
    clearAutoSave()
    setFinalTables([])
    setFieldConfig(databaseFields)
    fetchMappingRef.current = false
    resumeFileRef.current = false
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
  }

  // Pending files handlers
  const handleDeletePendingFile = (fileId: string) => {
    // The PendingFiles component handles the deletion
    // This is just a callback for any additional cleanup
    console.log('Pending file deleted:', fileId)
  }

  // Handle upload result with quality assessment
  function handleUploadResult({ tables, upload_id, file_name, file, plan_types, field_config, quality_summary, extraction_config, format_learning }: any) {
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
    setFinalTables([])
    setFieldConfig(field_config || databaseFields)
    setFormatLearning(format_learning) // Store format learning data
    
    // Auto-populate mapping from format learning if available
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
    setShowTableEditor(true) // Show table editor first
    setSkipped(false)
    setShowRejectModal(false)
    setRejectReason('')
    if (plan_types) setPlanTypes(plan_types)
    
    // Save progress for upload step
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
        
        // Save progress for table editor step
        saveProgress('table_editor', {
          tables,
          company_id: company.id
        })
        
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
        // Update the uploaded tables with the improved results
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
        
        // Show diagnostic information if available
        if (result.diagnostic_info?.warnings?.length > 0) {
          toast(`Found ${result.diagnostic_info.warnings.length} structural issues. Check the table for details.`, { 
            id: 'improve-extraction-warnings',
            duration: 5000 
          })
        }
        
        // Show format accuracy information
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
    setShowTableEditor(false)
    setShowFieldMapper(true)
    setCurrentStep('field_mapper')
    
    // Save progress for field mapper step
    if (uploaded?.upload_id) {
      saveProgress('field_mapper', {
        current_step: 'field_mapper'
      })
    }
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
    console.log('✅ finalTables state updated with', mappedRows.length, 'tables')
    
    // Save progress for dashboard step
    if (uploaded?.upload_id) {
      saveProgress('dashboard', {
        final_data: mappedRows,
        field_config: fieldConfigOverride,
        mapping: mapping
      })
    }
    
    // Call the completion callback if provided
    if (onComplete) {
      onComplete()
    }
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
        // Save progress for completed step
        saveProgress('completed', {
          status: 'approved',
          final_data: finalTables,
          field_config: fieldConfig,
          plan_types: planTypes
        })
        
        toast.success('Statement approved successfully!')
        // Navigate to homepage with dashboard tab after a short delay
        setTimeout(() => {
          console.log('Navigating to dashboard...')
          // Use window.location.href for more reliable navigation
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
        // Save progress for completed step
        saveProgress('completed', {
          status: 'rejected',
          rejection_reason: rejectReason,
          final_data: finalTables,
          field_config: fieldConfig,
          plan_types: planTypes
        })
        
        toast.success('Statement rejected successfully!')
        // Navigate to homepage with dashboard tab after a short delay
        setTimeout(() => {
          console.log('Navigating to dashboard...')
          // Use window.location.href for more reliable navigation
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

  // Handle sending file to pending
  async function handleSendToPending() {
    if (!company || !uploaded?.upload_id) return
    
    setSubmitting(true)
    try {
      // Save current progress to pending
      await saveProgress('dashboard', {
        final_data: finalTables,
        field_config: fieldConfig,
        mapping: mapping,
        plan_types: planTypes,
        skipped: skipped
      })
      
      // Update upload status to pending
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
          
          {/* Pending Files Toggle */}
          {company && (
            <div className="mb-6 flex justify-center">
              <button
                onClick={() => setShowPendingFiles(!showPendingFiles)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 transition-colors"
              >
                <Clock className="w-4 h-4" />
                {showPendingFiles ? 'Hide' : 'Show'} Pending Files
              </button>
            </div>
          )}

          {/* Pending Files Section */}
          {showPendingFiles && company && (
            <div className="mb-8">
              <PendingFiles
                companyId={company.id}
                onResumeFile={handleResumeFile}
                onDeleteFile={handleDeletePendingFile}
              />
            </div>
          )}

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
  console.log('🎯 FieldMapper condition check:', {
    hasTables: !!uploaded?.tables?.length,
    hasFinalTables: finalTables.length > 0,
    hasCompany: !!company,
    companyName: company?.name,
    notFetching: !fetchingMapping,
    showFieldMapper,
    notSkipped: !skipped,
    uploadedTablesLength: uploaded?.tables?.length,
    finalTablesLength: finalTables.length,
    condition: (uploaded?.tables?.length || finalTables.length > 0) && company && !fetchingMapping && showFieldMapper
  })
  
  if ((uploaded?.tables?.length || finalTables.length > 0) && company && !fetchingMapping && showFieldMapper) {
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
        
        <main className="min-h-screen bg-gradient-to-br from-gray-100 to-blue-50 flex items-center justify-center px-4">
          <div className="w-full max-w-7xl mx-auto shadow-2xl bg-white/90 rounded-3xl p-8 border">
          <h1 className="text-3xl font-bold mb-6 text-gray-800 text-center tracking-tight">
            <span className="bg-gradient-to-r from-blue-600 to-indigo-500 text-transparent bg-clip-text">
              {fetchingMapping ? 'Loading Field Mapping...' : `Map Fields for ${company?.name || 'Unknown Company'}`}
            </span>
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
              {(editedTables.length > 0 ? editedTables : uploaded.tables.length > 0 ? uploaded.tables : finalTables)[0]?.header && (editedTables.length > 0 ? editedTables : uploaded.tables.length > 0 ? uploaded.tables : finalTables)[0].header.length > 0 && (
                <>
                  {console.log('🎯 Rendering FieldMapper with props:', {
                    company,
                    columns: (editedTables.length > 0 ? editedTables : uploaded.tables.length > 0 ? uploaded.tables : finalTables)[0].header,
                    initialMapping: mapping,
                    initialFields: fieldConfig,
                    initialPlanTypes: planTypes,
                    showFieldMapper,
                    mappingAutoApplied,
                    tablesSource: editedTables.length > 0 ? 'editedTables' : uploaded.tables.length > 0 ? 'uploaded.tables' : 'finalTables'
                  })}
                  <FieldMapper
                    company={company}
                    columns={(editedTables.length > 0 ? editedTables : uploaded.tables.length > 0 ? uploaded.tables : finalTables)[0].header}
                    initialPlanTypes={planTypes}
                    tableData={editedTables.length > 0 ? editedTables : uploaded.tables.length > 0 ? uploaded.tables : finalTables} // Pass table data for format learning
                    isLoading={savingMapping}
                    onSave={async (map, fieldConf, selectedPlanTypes) => {
                      console.log('🎯 FieldMapper onSave called with:', { map, fieldConf, selectedPlanTypes })
                      
                      setSavingMapping(true)
                      
                      try {
                        // Always send the current fields as field_config
                        const tablesToUse = editedTables.length > 0 ? editedTables : uploaded.tables.length > 0 ? uploaded.tables : finalTables;
                        const config = {
                          mapping: map,
                          plan_types: selectedPlanTypes,
                          table_names: tablesToUse.map((t: any) => t.name || ''),
                          field_config: fieldConf,
                          table_data: tablesToUse.length > 0 ? tablesToUse[0]?.rows || [] : [], // Send first table's rows for format learning
                          headers: tablesToUse.length > 0 ? tablesToUse[0]?.header || [] : [], // Send headers for format learning
                        }
                        
                        await fetch(`${process.env.NEXT_PUBLIC_API_URL}/companies/${company.id}/mapping/`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify(config),
                        })
                        
                        console.log('✅ Mapping saved successfully')
                        
                        // Set all states in sequence to ensure proper transition
                        setMapping(map)
                        setFieldConfig(fieldConf)
                        setPlanTypes(selectedPlanTypes)
                        setSkipped(false)
                        setCurrentStep('dashboard')
                        setShowTableEditor(false) // Ensure table editor is hidden
                        
                        // Apply the mapping to create final tables and then hide FieldMapper
                        applyMapping(editedTables.length > 0 ? editedTables : uploaded.tables.length > 0 ? uploaded.tables : finalTables, map, fieldConf, () => {
                          console.log('🎯 applyMapping callback executed, hiding FieldMapper')
                          setShowFieldMapper(false)
                          setSavingMapping(false) // Stop loading after transition is complete
                          console.log('🎯 FieldMapper hidden, transitioning to dashboard')
                        })
                        
                        console.log('🎯 All states set, transitioning to dashboard')
                        
                        // Save progress for field mapper step
                        if (uploaded?.upload_id) {
                          saveProgress('field_mapper', {
                            mapping: map,
                            field_config: fieldConf,
                            plan_types: selectedPlanTypes,
                            table_names: config.table_names
                          })
                        }
                        
                        toast.success('Field mappings saved successfully!')
                        
                      } catch (error) {
                        console.error('❌ Error saving mapping:', error)
                        toast.error('Failed to save field mappings')
                        setSavingMapping(false) // Stop loading on error
                      }
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
                      setCurrentStep('dashboard');
                      setPlanTypes(planTypes); // preserve selected plan types
                      
                      // Save progress for skipped field mapper step
                      if (uploaded?.upload_id) {
                        saveProgress('field_mapper', {
                          skipped: true,
                          field_config: extractedFieldConfig[0],
                          plan_types: planTypes,
                          table_names: tableNames,
                          final_data: processedTables
                        })
                        
                        // Also save progress for dashboard step since we're going there
                        saveProgress('dashboard', {
                          final_data: processedTables,
                          field_config: extractedFieldConfig[0],
                          skipped: true
                        })
                      }
                    }}
                    initialFields={fieldConfig}
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
      </>
    )
  }

  // 3. Show mapped/standardized table views **or** skipped/raw extracted table view + Approve/Reject buttons
  console.log('🎯 Dashboard condition check:', {
    hasMapping: !!mapping,
    showFieldMapper,
    showTableEditor,
    skipped,
    finalTablesLength: finalTables.length,
    currentStep,
    condition1: mapping && !showFieldMapper,
    condition2: skipped,
    condition3: finalTables.length > 0 && !showFieldMapper,
    dashboardCondition: (mapping && !showFieldMapper) || skipped || (finalTables.length > 0 && !showFieldMapper)
  })
  
  if ((mapping && !showFieldMapper) || skipped || (finalTables.length > 0 && !showFieldMapper)) {
    console.log('🎯 Showing dashboard view:', {
      hasMapping: !!mapping,
      showFieldMapper,
      skipped,
      finalTablesLength: finalTables.length,
      currentStep,
      dashboardCondition: (mapping && !showFieldMapper) || skipped || (finalTables.length > 0 && !showFieldMapper)
    })

    return (
      <>
        {submitting && (
          <div className="fixed inset-0 bg-black bg-opacity-20 flex items-center justify-center z-50">
            <Loader message="Submitting..." />
          </div>
        )}
        
        <main className="min-h-screen bg-gradient-to-br from-gray-100 to-blue-50 flex items-center justify-center px-4">
          <div className="w-full max-w-[1800px] md:w-[92vw] mx-auto shadow-2xl bg-white/90 rounded-3xl p-10 border">
            {/* Progress Indicator */}
            <div className="mb-8">
              <div className="flex items-center justify-center space-x-4 mb-4">
                <div className="flex items-center">
                  <div className="w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center text-sm font-bold">1</div>
                  <span className="ml-2 text-sm text-gray-600">Upload</span>
                </div>
                <div className="w-8 h-1 bg-green-500"></div>
                <div className="flex items-center">
                  <div className="w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center text-sm font-bold">2</div>
                  <span className="ml-2 text-sm text-gray-600">Table Editor</span>
                </div>
                <div className="w-8 h-1 bg-green-500"></div>
                <div className="flex items-center">
                  <div className="w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center text-sm font-bold">3</div>
                  <span className="ml-2 text-sm text-gray-600">Field Mapper</span>
                </div>
                <div className="w-8 h-1 bg-green-500"></div>
                <div className="flex items-center">
                  <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center text-sm font-bold">4</div>
                  <span className="ml-2 text-sm font-semibold text-blue-600">Review & Approve</span>
                </div>
              </div>
            </div>
            
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
                console.log('🎯 Edit Field Mapping clicked:', {
                  currentCompany: company,
                  showFieldMapper: showFieldMapper,
                  skipped: skipped,
                  uploaded: uploaded,
                  finalTables: finalTables
                })
                setShowFieldMapper(true);
                setSkipped(false);
                console.log('🎯 States set - showFieldMapper: true, skipped: false')
              }}
              company={company}
              fileName={uploaded?.file_name || "uploaded.pdf"}
              fileUrl={uploaded?.file?.url || null}
              readOnly={false}
              onTableChange={setFinalTables}
              planTypes={planTypes}
              onSendToPending={handleSendToPending}
              uploadId={uploaded?.upload_id}
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