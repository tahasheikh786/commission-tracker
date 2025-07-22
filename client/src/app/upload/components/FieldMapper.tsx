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
function fuzzyMatch(a: string, b: string) {
  return (
    a.toLowerCase().replace(/[^a-z]/g, '') === b.toLowerCase().replace(/[^a-z]/g, '') ||
    a.toLowerCase().includes(b.toLowerCase()) ||
    b.toLowerCase().includes(a.toLowerCase())
  )
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


const PLAN_TYPES = [
  { value: 'medical', label: 'Medical' },
  { value: 'dental', label: 'Dental' },
  { value: 'vision', label: 'Vision' },
  { value: 'life', label: 'Life' },
  { value: 'disability', label: 'Disability' },
  { value: 'other', label: 'Other' },
]

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
}: {
  company: { id: string, name: string }
  columns: string[]
  onSave: (mapping: Record<string, string>, fields: FieldConf[], planTypes: string[], tableNames?: string[]) => void
  onSkip: () => void
  initialFields?: FieldConf[]
  initialMapping?: Record<string, string> | null
  initialPlanTypes?: string[]
  tableNames?: string[]
}) {
  // State for database fields from backend
  const [databaseFields, setDatabaseFields] = useState<FieldConf[]>([])
  const [loadingFields, setLoadingFields] = useState(true)
  const [fields, setFields] = useState<FieldConf[]>(initialFields)
  const [mapping, setMapping] = useState<Record<string, string>>(initialMapping || {})
  const [saving, setSaving] = useState(false)
  const [newFieldName, setNewFieldName] = useState('')
  const [newFieldKey, setNewFieldKey] = useState('')
  const [planTypes, setPlanTypes] = useState<string[]>(initialPlanTypes)


  console.log(initialFields, fields, "FIELDS")

  // DnD-kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  // For dropdowns: fallback to mapped carrier fields if columns empty
  const allDropdownColumns = columns && columns.length > 0
    ? columns
    : Array.from(new Set(Object.values(mapping).filter(Boolean)))

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
          setFields(fieldsFromBackend)

          // Use backend fields if no initial fields provided
          if (!initialFields || initialFields.length === 0) {
            setFields(fieldsFromBackend)
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
  }, [initialFields])

  // Sync mapping and fields if props change
  useEffect(() => {
    if (initialFields && initialFields.length > 0) {
      setFields(initialFields)
    }
  }, [initialFields])

  useEffect(() => {
    if (initialMapping) {
      setMapping(initialMapping)
    } else {
      // Fuzzy match: try to auto-map by label or field name
      const map: Record<string, string> = {}
      for (const f of fields) {
        let found = columns.find(col => fuzzyMatch(col, f.label))
        if (!found) {
          found = columns.find(col => fuzzyMatch(col, f.field))
        }
        if (found) map[f.field] = found
      }
      setMapping(map)
    }
  }, [initialMapping, columns, fields])

  function setFieldMap(field: string, col: string) {
    setMapping(m => ({ ...m, [field]: col }))
  }

  async function handleAddDatabaseField() {
    if (!newFieldName.trim() || !newFieldKey.trim()) {
      toast.error('Please enter both field key and display name')
      return
    }

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/database-fields/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          field_key: newFieldKey.trim(),
          display_name: newFieldName.trim(),
          description: '',
          is_active: true
        }),
      })

      if (response.ok) {
        const newField = await response.json()
        const fieldConf = {
          field: newField.field_key,
          label: newField.display_name
        }

        // Add to both database fields and current fields
        setDatabaseFields(prev => [...prev, fieldConf])
        setFields(prev => [...prev, fieldConf])

        setNewFieldName('')
        setNewFieldKey('')
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
    setSaving(true)
    // Compose MappingConfig object
    const config = {
      mapping,
      plan_types: planTypes,
      table_names: tableNames,
      field_config: fields,
    }
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/companies/${company.id}/mapping/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      toast.success("Mapping saved!")
      onSave(mapping, fields, planTypes, tableNames)
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
      {saving && <Loader message="Saving mapping..." />}

      {/* Header */}

      {/* Plan Type Selection */}
      <div className="mb-6 bg-white rounded-lg border border-gray-200 p-6">
        <label className="block text-lg font-semibold text-gray-800 mb-3">Plan Types</label>
        <div className="flex flex-wrap gap-3">
          {PLAN_TYPES.map(pt => (
            <label key={pt.value} className={
              `inline-flex items-center px-4 py-2 rounded-lg border border-gray-300 bg-white shadow-sm cursor-pointer transition-all hover:shadow-md ${planTypes.includes(pt.value) ? 'ring-2 ring-blue-400 bg-blue-50' : ''}`
            }>
              <input
                type="checkbox"
                className="form-checkbox accent-blue-600 mr-2 h-4 w-4"
                checked={planTypes.includes(pt.value)}
                onChange={() => handlePlanTypeChange(pt.value)}
              />
              <span className="text-sm font-medium text-gray-800">{pt.label}</span>
            </label>
          ))}
        </div>
        <div className="text-sm text-gray-500 mt-2">Select all plan types included in this statement. You can select multiple.</div>
      </div>

      {/* Field Mapping Table */}
      <div className="mb-6 bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200 bg-gray-50">
          <h3 className="text-lg font-semibold text-gray-800">Database Field Mapping</h3>
          <p className="text-gray-600 text-sm mt-1">Drag to reorder and map extracted columns to database fields</p>
        </div>

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
              <div className="max-h-[480px] overflow-y-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="w-12 py-3 px-4"></th>
                      <th className="w-1/3 py-3 px-4 text-left text-sm font-semibold text-gray-900">Database Field</th>
                      <th className="w-2/3 py-3 px-4 text-left text-sm font-semibold text-gray-900">Extracted Column</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {fields.map((f, i) => (
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
                    ))}
                  </tbody>

                </table>
              </div>
            </div>
          </SortableContext>
        </DndContext>
      </div>

      {/* Add Database Field */}
      <div className="mb-6 bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-3">Add Database Field</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Field Key</label>
            <input
              className="border border-gray-300 rounded-md px-3 py-2 w-full text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g., group_id"
              value={newFieldKey}
              onChange={e => setNewFieldKey(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
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
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2 rounded-md bg-blue-600 text-white font-semibold shadow hover:bg-blue-700 transition"
        >
          {saving ? "Saving..." : "Save Mapping"}
        </button>
        {onSkip && (
          <button
            type="button"
            onClick={onSkip}
            className="px-6 py-2 rounded-md bg-gray-300 text-gray-700 font-semibold shadow hover:bg-gray-400 transition"
          >
            Skip and Use Extracted Table
          </button>
        )}
      </div>
    </div>
  )
}
