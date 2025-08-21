'use client'
import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { X, Plus, GripVertical, Calendar } from 'lucide-react'
import Loader from './Loader';
import ProgressBar from './ProgressBar';

import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// NOTE: initialFields and initialMapping must be preprocessed as in EditMappingModal.
// initialMapping should be { field: column }, and initialFields should be [{ field, label }], with pretty labels from STANDARD_FIELDS if available.
function fuzzyMatch(a: string | undefined, b: string | undefined) {
  // Handle undefined or null values
  if (!a || !b) return false;
  
  const aClean = a.toLowerCase().replace(/[^a-z]/g, '')
  const bClean = b.toLowerCase().replace(/[^a-z]/g, '')
  
  // Exact match (highest priority)
  if (aClean === bClean) return true
  
  // Contains match (lower priority)
  if (aClean.includes(bClean) || bClean.includes(aClean)) {
    // Only allow contains match if the difference is small (to avoid false positives)
    const lengthDiff = Math.abs(aClean.length - bClean.length)
    return lengthDiff <= 3 // Only allow small differences
  }
  
  return false
}

type FieldConf = { field: string, label: string }

function DraggableRow({
  id,
  children,
}: {
  id: string
  children: (params: {
    attributes: any
    listeners: any
    isDragging: boolean
  }) => React.ReactNode
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })
  return (
    <tr
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        background: isDragging ? '#f0f6ff' : undefined,
      }}
    >
      {children({ attributes, listeners, isDragging })}
    </tr>
  )
}


// Plan types will be fetched from backend
type PlanType = {
  plan_key: string
  display_name: string
  description?: string
}

// Remove mergeStandardAndCustomFields and just use initialFields as-is
export default function FieldMapper({
  company,
  columns,
  onSave,
  onSkip,
  initialFields = [],
  initialMapping,
  initialPlanTypes = [],
  tableNames = [],
  tableData = [], // Add table data for format learning
  isLoading = false, // Add loading prop
  selectedStatementDate, // Add selected statement date
  mappingAutoApplied = false, // Add prop to show if mapping was auto-applied
}: {
  company: { id: string, name: string }
  columns: string[]
  onSave: (mapping: Record<string, string>, fields: FieldConf[], planTypes: string[], tableNames?: string[], selectedStatementDate?: any) => void
  onSkip: () => void
  initialFields?: FieldConf[]
  initialMapping?: Record<string, string> | null
  initialPlanTypes?: string[]
  tableNames?: string[]
  tableData?: any[] // Add table data prop
  isLoading?: boolean // Add loading prop type
  selectedStatementDate?: any // Add selected statement date
  mappingAutoApplied?: boolean // Add prop to show if mapping was auto-applied
}) {
  // State for database fields from backend
  const [databaseFields, setDatabaseFields] = useState<FieldConf[]>([])
  const [loadingFields, setLoadingFields] = useState(true)
  const [fields, setFields] = useState<FieldConf[]>(initialFields)
  const [mapping, setMapping] = useState<Record<string, string>>(initialMapping || {}) // Initialize with initialMapping or empty object
  const [saving, setSaving] = useState(false)
  const [newFieldName, setNewFieldName] = useState('')
  const [planTypes, setPlanTypes] = useState<string[]>(initialPlanTypes)
  const [availablePlanTypes, setAvailablePlanTypes] = useState<PlanType[]>([])
  const [loadingPlanTypes, setLoadingPlanTypes] = useState(true)
  const [learnedMapping, setLearnedMapping] = useState<Record<string, string> | null>(null)
  const [mappingSource, setMappingSource] = useState<'manual' | 'learned' | 'fuzzy'>('manual')

  // Add effect to track mapping changes
  useEffect(() => {
    console.log('Mapping state changed:', mapping)
  }, [mapping])

  // Add effect to handle initialMapping changes
  useEffect(() => {
    console.log('🎯 FieldMapper: initialMapping changed:', initialMapping)
    if (initialMapping && Object.keys(initialMapping).length > 0) {
      // Validate that the mapping has valid field keys
      const validMapping: Record<string, string> = {}
      Object.entries(initialMapping).forEach(([key, value]) => {
        if (key && key !== 'undefined' && value) {
          validMapping[key] = value
        }
      })
      
      if (Object.keys(validMapping).length > 0) {
        console.log('🎯 FieldMapper: Setting valid mapping from initialMapping:', validMapping)
        setMapping(validMapping)
        setMappingSource('manual')
      } else {
        console.log('🎯 FieldMapper: initialMapping provided but no valid mappings found')
        setMapping({})
        setMappingSource('manual')
      }
    } else {
      console.log('🎯 FieldMapper: No initialMapping provided or empty')
    }
  }, [initialMapping])

  // Add effect to handle initialFields changes
  useEffect(() => {
    if (initialFields && initialFields.length > 0) {
      // Validate that all fields have valid field keys
      const validFields = initialFields.filter(f => f && f.field && f.field !== 'undefined')
      if (validFields.length > 0) {
        console.log('initialFields changed, updating fields state:', validFields)
        setFields(validFields)
      } else {
        console.log('initialFields provided but no valid fields found, using database fields')
        if (databaseFields.length > 0) {
          setFields(databaseFields)
        }
      }
    }
  }, [initialFields, databaseFields])





  // DnD-kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  // For dropdowns: always use the columns prop, never fallback to mapping values
  const allDropdownColumns = columns || []
  
  // Debug logs removed - issue fixed

  // Fetch database fields from backend
  useEffect(() => {
    async function fetchDatabaseFields() {
      try {
        setLoadingFields(true)
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/database-fields/?active_only=true`)
        if (response.ok) {
          const data = await response.json()
          const fieldsFromBackend = data.map((field: any) => ({
            field: field.display_name,
            label: field.display_name
          }))
          setDatabaseFields(fieldsFromBackend)
          
          // Debug logs removed - issue fixed
          
          // IMPORTANT: Only set fields if we don't already have fields AND we have initial fields
          // This prevents auto-populating with all database fields for new carriers
          if (fields.length === 0 && initialFields.length > 0) {
            // Use initialFields if provided
            setFields(initialFields)
          } else if (fields.length === 0 && initialFields.length === 0) {
            // For new carriers with no existing mapping, keep fields empty
            // Don't set fields - let them remain empty
          }
          // If fields.length > 0, don't change anything
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
  }, [fields.length, initialFields]) // Add missing dependencies

  // Fetch plan types from backend
  useEffect(() => {
    async function fetchPlanTypes() {
      try {
        setLoadingPlanTypes(true)
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/plan-types/?active_only=true`)
        if (response.ok) {
          const data = await response.json()
          setAvailablePlanTypes(data)
        } else {
          console.error('Failed to fetch plan types')
          toast.error('Failed to load plan types')
        }
      } catch (error) {
        console.error('Error fetching plan types:', error)
        toast.error('Failed to load plan types')
      } finally {
        setLoadingPlanTypes(false)
      }
    }

    fetchPlanTypes()
  }, [])

  // Use format learning data from backend (already provided in upload response)
  useEffect(() => {
    // The backend already provides format_learning data in the upload response
    // This is handled in the parent component (useUploadPage) and passed as initialMapping
    // No need to fetch learned mappings again here
    console.log('FieldMapper: Using format learning data from backend via initialMapping:', initialMapping)
    
    // If we have a learned mapping, set it as the learned mapping for potential application
    if (initialMapping && Object.keys(initialMapping).length > 0) {
      setLearnedMapping(initialMapping)
      console.log('FieldMapper: Set learned mapping from initialMapping:', initialMapping)
    }
  }, [initialMapping])

  // Ensure fields are always populated from database fields if available
  useEffect(() => {
    if (databaseFields.length > 0 && fields.length === 0 && initialFields.length === 0) {
      console.log('Force setting fields from database fields:', databaseFields)
      setFields(databaseFields)
    }
  }, [databaseFields, fields.length, initialFields])

  useEffect(() => {
    if (initialMapping && Object.keys(initialMapping).length > 0) {
      console.log('🎯 FieldMapper: Setting mapping from initialMapping:', initialMapping)
      setMapping(initialMapping)
      setMappingSource('learned') // Mark as learned since it came from backend
      return // Exit early, don't run fuzzy matching
    } else if (learnedMapping && Object.keys(learnedMapping).length > 0 && mappingSource === 'learned') {
      // Keep the learned mapping if it was already set
      console.log('🎯 FieldMapper: Setting mapping from learnedMapping:', learnedMapping)
      setMapping(learnedMapping)
      return // Exit early, don't run fuzzy matching
    } else if (columns && columns.length > 0 && fields && fields.length > 0) {
      // Enable fuzzy matching for auto-mapping only if no valid mapping exists
      console.log('🎯 FieldMapper: Running fuzzy matching with columns:', columns)
      console.log('🎯 FieldMapper: Fields to match:', fields)
      
      const map: Record<string, string> = {}
      const usedColumns = new Set<string>() // Track used columns to prevent duplicates
      
      for (const f of fields) {
        // Skip if field is missing required properties or has invalid field key
        if (!f.field || !f.label || f.field === 'undefined') continue;
        
        let found = columns.find(col => col && fuzzyMatch(col, f.label) && !usedColumns.has(col))
        if (!found) {
          found = columns.find(col => col && fuzzyMatch(col, f.field) && !usedColumns.has(col))
        }
        if (found) {
          map[f.field] = found
          usedColumns.add(found) // Mark this column as used
          console.log(`Matched field "${f.field}" to column "${found}"`)
        }
      }
      
      console.log('Final fuzzy mapping:', map)
      if (Object.keys(map).length > 0) {
        setMapping(map)
        setMappingSource('fuzzy')
        toast.success('Fields auto-mapped using fuzzy matching!')
      }
    }
  }, [initialMapping, learnedMapping, mappingSource, columns, fields]) // Add columns and fields back to dependencies

  function setFieldMap(field: string, col: string) {
    console.log(`Setting field "${field}" to column "${col}"`)
    console.log('Current mapping before update:', mapping)
    setMapping(prevMapping => {
      const newMapping = { ...prevMapping, [field]: col }
      console.log('New mapping after update:', newMapping)
      return newMapping
    })
  }

  function resetMapping() {
    console.log('Resetting mapping state')
    setMapping({})
    setFields([])
  }

  function clearMapping() {
    console.log('Clearing mapping state')
    setMapping({})
  }

  async function handleAddDatabaseField() {
    if (!newFieldName.trim()) {
      toast.error('Please enter a display name')
      return
    }

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/database-fields/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: newFieldName.trim(),
          description: '',
          is_active: true
        }),
      })

      if (response.ok) {
        const newField = await response.json()
        const fieldConf = {
          field: newField.display_name,
          label: newField.display_name
        }

        // Add to both database fields and current fields
        setDatabaseFields(prev => [...prev, fieldConf])
        setFields(prev => [...prev, fieldConf])

        setNewFieldName('')
        toast.success('Database field added successfully!')
      } else {
        const error = await response.json()
        toast.error(error.detail || 'Failed to add database field')
      }
    } catch (error) {
      console.error('Error adding database field:', error)
      toast.error('Failed to add database field')
    }
  }

  function handlePlanTypeChange(value: string) {
    setPlanTypes((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    )
  }

  async function handleSave() {
    console.log('🎯 FieldMapper handleSave called with:', { mapping, fields, planTypes, tableNames })
    setSaving(true)
    try {
      // Check if Invoice Total field is mapped
      const invoiceTotalField = fields.find(f => 
        f.label.toLowerCase().includes('invoice total') || 
        f.label.toLowerCase().includes('invoice amount') ||
        f.label.toLowerCase().includes('premium amount')
      )
      
      // If Invoice Total field exists but is not mapped, automatically fill with $0.00
      if (invoiceTotalField && !mapping[invoiceTotalField.field]) {
        console.log('🎯 Invoice Total field not mapped, will automatically fill with $0.00')
        
        // Create a new mapping that includes the Invoice Total field with a special value
        const updatedMapping = {
          ...mapping,
          [invoiceTotalField.field]: '__AUTO_FILL_ZERO__' // Special marker for backend to handle
        }
        
        console.log('🎯 Updated mapping with auto-fill for Invoice Total:', updatedMapping)
        onSave(updatedMapping, fields, planTypes, tableNames, selectedStatementDate)
      } else {
        // Normal save without auto-fill
        console.log('🎯 Calling onSave with:', { mapping, fields, planTypes, selectedStatementDate })
        onSave(mapping, fields, planTypes, tableNames, selectedStatementDate)
      }
      
      toast.success("Mapping saved and format learned!")
    } catch (error) {
      toast.error("Failed to save mapping.")
      console.error(error)
    } finally {
      setSaving(false)
    }
  }

  // DnD: handle reorder
  function handleDragEnd(event: any) {
    const { active, over } = event
    if (active.id !== over?.id) {
      const oldIndex = fields.findIndex(f => f.field === active.id)
      const newIndex = fields.findIndex(f => f.field === over.id)
      setFields(arrayMove(fields, oldIndex, newIndex))
    }
  }

  if (loadingFields) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader message="Loading database fields..." />
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {(saving || isLoading) && <Loader message="Saving mapping and transitioning to dashboard..." />}

      {/* Progress Bar */}
      <ProgressBar currentStep="field_mapper" />

      {/* Learned Mapping Notification */}
      {mappingAutoApplied && (
        <div className="flex-shrink-0 bg-green-50 border-b border-green-200 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <div>
                <p className="text-sm font-medium text-green-800">Learned Field Mapping Applied</p>
                <p className="text-xs text-green-600">Field mappings were automatically populated from a previously saved format for this carrier</p>
              </div>
            </div>
            <button
              onClick={() => {
                // Clear the auto-applied mapping and let user start fresh
                setMapping({})
                setMappingSource('manual')
                toast.success('Cleared auto-applied mapping. You can now map fields manually.')
              }}
              className="text-xs text-green-600 hover:text-green-800 underline"
            >
              Clear & Start Fresh
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-800">Field Mapping</h2>
            <p className="text-gray-600 text-sm mt-1">
              Map your extracted columns to the correct database fields.
            </p>
          </div>
          
          {/* Statement Date Indicator */}
          {selectedStatementDate && (
            <div className="flex items-center gap-2 px-3 py-2 bg-green-100 text-green-800 rounded-lg border border-green-200">
              <Calendar className="w-4 h-4 text-green-600" />
              <span className="text-sm font-medium">
                Statement Date: {selectedStatementDate.date}
              </span>
            </div>
          )}
          
          {/* Mapping Source Indicator */}
          {mappingSource !== 'manual' && (
            <div className="flex items-center gap-2">
              {mappingSource === 'learned' && (
                <div className="flex items-center gap-2 px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  Auto-mapped from learned format
                </div>
              )}
              {mappingSource === 'fuzzy' && (
                <div className="flex items-center gap-2 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
                  <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                  Auto-mapped using fuzzy matching
                </div>
              )}
            </div>
          )}
        </div>

        {/* Apply Learned Mapping Button */}
        {learnedMapping && Object.keys(learnedMapping).length > 0 && mappingSource !== 'learned' && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-800">Learned format available</p>
                <p className="text-xs text-blue-600">We found a previously saved format for this carrier</p>
              </div>
              <button
                onClick={() => {
                  setMapping(learnedMapping)
                  setMappingSource('learned')
                  toast.success('Applied learned field mappings!')
                }}
                className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition"
              >
                Apply Learned
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
        <div className="w-[90%] mx-auto">
          {/* Plan Type Selection */}
          <div className="mb-6 bg-white rounded-lg border border-gray-200 p-6">
            <label className="block text-lg font-semibold text-gray-800 mb-3">Plan Types</label>
            {loadingPlanTypes ? (
              <div className="flex items-center justify-center py-4">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                <span className="ml-2 text-gray-600">Loading plan types...</span>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap gap-3">
                  {availablePlanTypes.map((pt: PlanType) => (
                    <label key={pt.plan_key} className={
                      `inline-flex items-center px-4 py-2 rounded-lg border border-gray-300 bg-white shadow-sm cursor-pointer transition-all hover:shadow-md ${planTypes.includes(pt.plan_key) ? 'ring-2 ring-blue-400 bg-blue-50' : ''}`
                    }>
                      <input
                        type="checkbox"
                        className="form-checkbox accent-blue-600 mr-2 h-4 w-4"
                        checked={planTypes.includes(pt.plan_key)}
                        onChange={() => handlePlanTypeChange(pt.plan_key)}
                      />
                      <span className="text-sm font-medium text-gray-800">{pt.display_name}</span>
                    </label>
                  ))}
                </div>
                <div className="text-sm text-gray-500 mt-2">Select all plan types included in this statement. You can select multiple.</div>
              </>
            )}
          </div>

          {/* Add Database Field - Moved above the table */}
          <div className="mb-6 bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-3">Add Database Field</h3>
            <div className="mb-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Field Name</label>
                <input
                  className="border border-gray-300 rounded-md px-3 py-2 w-full text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., Group Id"
                  value={newFieldName}
                  onChange={e => setNewFieldName(e.target.value)}
                />
              </div>
            </div>
            <button
              type="button"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-blue-600 text-white font-medium shadow hover:bg-blue-700 transition"
              onClick={handleAddDatabaseField}
            >
              <Plus size={16} /> Add Database Field
            </button>
          </div>

          {/* Field Mapping Table */}
          <div className="mb-6 bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-200 bg-gray-50">
              <h3 className="text-lg font-semibold text-gray-800">Database Field Mapping</h3>
              <p className="text-gray-600 text-sm mt-1">Drag to reorder and map extracted columns to database fields</p>
            </div>

            {loadingFields ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <span className="ml-3 text-gray-600">Loading database fields...</span>
              </div>
            ) : (
              <>
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={fields.map(f => f.field)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="overflow-x-auto max-h-96 overflow-y-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="w-12 p-0"></th>
                            <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Database Field</th>
                            <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Extracted Column</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {fields.length === 0 ? (
                            <tr>
                              <td colSpan={3} className="py-8 text-center">
                                <div className="text-gray-500">
                                  <p className="mb-2">No database fields configured yet.</p>
                                  <p className="text-sm">Add database fields above to start mapping your extracted columns.</p>
                                </div>
                              </td>
                            </tr>
                          ) : (
                            fields.map((f, i) => (
                              <DraggableRow key={`${f.field}-${i}`} id={f.field}>
                                {({ attributes, listeners, isDragging }) => (
                                  <>
                                    <td
                                      className="w-12 p-0 align-middle text-center"
                                      {...attributes}
                                      {...listeners}
                                      style={{ verticalAlign: 'middle' }}
                                    >
                                      <GripVertical size={18} className="text-gray-400 mx-auto" />
                                    </td>
                                    <td className="w-1/3 py-3 px-4 align-middle">
                                      <div
                                        className="font-medium text-gray-800 truncate"
                                        title={f.label}
                                        style={{ minWidth: 120 }}
                                      >
                                        {f.label}
                                      </div>
                                    </td>
                                    <td className="w-2/3 py-3 px-4 align-middle">
                                      <select
                                        key={`select-${f.field}`}
                                        className="border border-gray-300 rounded-md px-3 py-2 w-full min-w-[140px] text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        value={mapping[f.field] || ""}
                                        onChange={e => setFieldMap(f.field, e.target.value)}
                                      >
                                        <option value="">Select column...</option>
                                        {allDropdownColumns.map(col => (
                                          <option key={col} value={col}>{col}</option>
                                        ))}
                                      </select>
                                      {/* Show auto-fill indicator for Invoice Total fields */}
                                      {(f.label.toLowerCase().includes('invoice total') || 
                                        f.label.toLowerCase().includes('invoice amount') ||
                                        f.label.toLowerCase().includes('premium amount')) && 
                                        !mapping[f.field] && (
                                        <div className="mt-1 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">
                                          Will auto-fill with $0.00 if not mapped
                                        </div>
                                      )}
                                    </td>
                                  </>
                                )}
                              </DraggableRow>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </SortableContext>
                </DndContext>
              </>
            )}
          </div>

          {/* Extracted Table Component */}
          {tableData && tableData.length > 0 && (
            <div className="mb-6 bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="p-4 border-b border-gray-200 bg-gray-50">
                <h3 className="text-lg font-semibold text-gray-800">Extracted Table Preview</h3>
                <p className="text-gray-600 text-sm mt-1">Preview of the extracted data that will be mapped</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      {columns.map((col, index) => (
                        <th key={index} className="text-left py-3 px-4 text-sm font-medium text-gray-700">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {tableData[0]?.rows?.slice(0, 5).map((row: any, rowIndex: number) => (
                      <tr key={rowIndex} className="hover:bg-gray-50">
                        {Array.isArray(row) ? (
                          // Handle array format (legacy)
                          row.map((cell: any, cellIndex: number) => (
                            <td key={cellIndex} className="py-2 px-4 text-sm text-gray-900">
                              {cell || '-'}
                            </td>
                          ))
                        ) : (
                          // Handle object format (new)
                          columns.map((col: string, cellIndex: number) => (
                            <td key={cellIndex} className="py-2 px-4 text-sm text-gray-900">
                              {(row as Record<string, string>)[col] || '-'}
                            </td>
                          ))
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {tableData[0]?.rows?.length > 5 && (
                <div className="p-4 border-t border-gray-200 bg-gray-50 text-center">
                  <p className="text-sm text-gray-600">
                    Showing first 5 rows of {tableData[0]?.rows?.length} total rows
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons - Fixed at bottom */}
      <div className="flex-shrink-0 bg-white border-t border-gray-200 p-6">
        <div className="w-[90%] mx-auto">
          <div className="flex gap-3">
            <button
              onClick={() => {
                console.log('🎯 Save button clicked!')
                handleSave()
              }}
              disabled={saving || isLoading}
              className="px-6 py-2 rounded-md bg-blue-600 text-white font-semibold shadow hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {(saving || isLoading) ? "Saving..." : "Save Mapping"}
            </button>
            {onSkip && (
              <button
                type="button"
                onClick={onSkip}
                disabled={saving || isLoading}
                className="px-6 py-2 rounded-md bg-gray-300 text-gray-700 font-semibold shadow hover:bg-gray-400 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Skip and Use Extracted Table
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
