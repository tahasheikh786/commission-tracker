'use client'
import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { X, Plus, GripVertical } from 'lucide-react'
import Loader from './Loader';

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
}: {
  company: { id: string, name: string }
  columns: string[]
  onSave: (mapping: Record<string, string>, fields: FieldConf[], planTypes: string[], tableNames?: string[]) => void
  onSkip: () => void
  initialFields?: FieldConf[]
  initialMapping?: Record<string, string> | null
  initialPlanTypes?: string[]
  tableNames?: string[]
  tableData?: any[] // Add table data prop
  isLoading?: boolean // Add loading prop type
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
    if (initialMapping && Object.keys(initialMapping).length > 0) {
      console.log('initialMapping changed, updating mapping state:', initialMapping)
      setMapping(initialMapping)
      setMappingSource('manual')
    }
  }, [initialMapping])

  // Add effect to handle initialFields changes
  useEffect(() => {
    if (initialFields && initialFields.length > 0) {
      console.log('initialFields changed, updating fields state:', initialFields)
      setFields(initialFields)
    }
  }, [initialFields])

  console.log('FieldMapper Debug:', {
    initialFields,
    initialMapping,
    fields,
    databaseFields,
    columns,
    loadingFields,
    apiUrl: process.env.NEXT_PUBLIC_API_URL
  })

  console.log('FieldMapper Render Debug:', {
    initialMapping,
    currentMapping: mapping,
    mappingSource,
    fieldsCount: fields.length,
    columnsCount: columns.length
  })

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
  }, []) // Remove dependencies to prevent re-running and auto-populating fields

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

  // Fetch learned mappings for this company
  useEffect(() => {
    async function fetchLearnedMappings() {
      if (!company?.id || !columns || columns.length === 0) return
      
      try {
        // Analyze table structure for format matching
        const tableStructure = {
          column_count: columns.length,
          typical_row_count: tableData.length > 0 ? tableData[0]?.rows?.length || 0 : 0,
          has_header_row: true
        }
        
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/companies/${company.id}/find-format-match/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            headers: columns,
            table_structure: tableStructure
          })
        })
        
        if (response.ok) {
          const result = await response.json()
          if (result.found_match && result.learned_format?.field_mapping) {
            setLearnedMapping(result.learned_format.field_mapping)
            
            // If no initial mapping is provided, use the learned mapping
            if (!initialMapping || Object.keys(initialMapping).length === 0) {
              setMapping(result.learned_format.field_mapping)
              setMappingSource('learned')
              toast.success('Field mappings auto-populated from learned format!')
            }
          }
        }
      } catch (error) {
        console.error('Error fetching learned mappings:', error)
        // Don't show error toast as this is not critical
      }
    }

    fetchLearnedMappings()
  }, [company?.id, columns, tableData, initialMapping])

  // Ensure fields are always populated from database fields if available
  useEffect(() => {
    if (databaseFields.length > 0 && fields.length === 0) {
      console.log('Force setting fields from database fields:', databaseFields)
      setFields(databaseFields)
    }
  }, [databaseFields, fields.length])

  useEffect(() => {
    if (initialMapping && Object.keys(initialMapping).length > 0) {
      console.log('Setting mapping from initialMapping:', initialMapping)
      setMapping(initialMapping)
      setMappingSource('manual')
    } else if (learnedMapping && Object.keys(learnedMapping).length > 0 && mappingSource === 'learned') {
      // Keep the learned mapping if it was already set
      console.log('Setting mapping from learnedMapping:', learnedMapping)
      setMapping(learnedMapping)
    } else {
      // Temporarily disable fuzzy matching to debug the issue
      console.log('Skipping fuzzy matching for debugging')
      /*
      // Fuzzy match: try to auto-map by label or field name
      const map: Record<string, string> = {}
      const usedColumns = new Set<string>() // Track used columns to prevent duplicates
      
      console.log('Fuzzy matching with columns:', columns)
      console.log('Fields to match:', fields)
      
      for (const f of fields) {
        // Skip if field is missing required properties
        if (!f.field || !f.label) continue;
        
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
      }
      */
    }
  }, [initialMapping, learnedMapping, mappingSource]) // Remove columns and fields from dependencies to avoid unnecessary re-runs

  function setFieldMap(field: string, col: string) {
    console.log(`Setting field "${field}" to column "${col}"`)
    console.log('Current mapping before update:', mapping)
    setMapping(m => {
      const newMapping = { ...m, [field]: col }
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
      // Call onSave directly without making a separate API call here
      // The parent component (page.tsx) will handle the API call
      console.log('🎯 Calling onSave with:', { mapping, fields, planTypes })
      onSave(mapping, fields, planTypes)
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
    <div className="relative">
      {(saving || isLoading) && <Loader message="Saving mapping and transitioning to dashboard..." />}

      {/* Header */}
      <div className="mb-6 bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-800">Field Mapping</h2>
            <p className="text-gray-600 text-sm mt-1">
              Map your extracted columns to the correct database fields.
            </p>
          </div>
          
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

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={fields.map(f => f.field)}
            strategy={verticalListSortingStrategy}
          >
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
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
                          <p className="text-sm">Add database fields below to start mapping your extracted columns.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    fields.map((f, i) => (
                      <DraggableRow key={f.field} id={f.field}>
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
                                key={`select-${f.field}-${i}`}
                                className="border border-gray-300 rounded-md px-3 py-2 w-full min-w-[140px] text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                value={mapping[f.field] || ""}
                                onChange={e => setFieldMap(f.field, e.target.value)}
                              >
                                <option value="">Select column...</option>
                                {allDropdownColumns.map(col => (
                                  <option key={col} value={col}>{col}</option>
                                ))}
                              </select>
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
        )}
      </div>

      {/* Add Database Field */}
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

      {/* Action Buttons */}
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
  )
}
