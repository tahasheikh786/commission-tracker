'use client'
import { useState, useEffect, useRef } from 'react'
import toast from 'react-hot-toast'
import { X, Plus, GripVertical, Calendar, ChevronLeft, Save, ArrowRight, Info } from 'lucide-react'
import SpinnerLoader from '../ui/SpinnerLoader'
import ProgressBar from '../../upload/components/ProgressBar'
import { CompactThemeToggle } from '../ui/CompactThemeToggle'

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

// Demo data
const sampleColumns = [
  "Agent Name", "Policy Number", "Premium", "Commission Rate", "Commission Amount", "Date"
]

const sampleDatabaseFields = [
  { field: 'agent_name', label: 'Agent Name' },
  { field: 'policy_number', label: 'Policy Number' },
  { field: 'premium_amount', label: 'Premium Amount' },
  { field: 'commission_rate', label: 'Commission Rate' },
  { field: 'commission_amount', label: 'Commission Amount' },
  { field: 'statement_date', label: 'Statement Date' },
  { field: 'carrier_name', label: 'Carrier Name' },
  { field: 'product_type', label: 'Product Type' },
  { field: 'agent_id', label: 'Agent ID' },
  { field: 'client_name', label: 'Client Name' }
]

const samplePlanTypes = [
  { plan_key: 'life_insurance', display_name: 'Life Insurance', description: 'Life insurance products' },
  { plan_key: 'health_insurance', display_name: 'Health Insurance', description: 'Health insurance products' },
  { plan_key: 'auto_insurance', display_name: 'Auto Insurance', description: 'Auto insurance products' },
  { plan_key: 'home_insurance', display_name: 'Home Insurance', description: 'Home insurance products' }
]

const sampleCompany = {
  id: 'demo-company-123',
  name: 'Demo Insurance Company'
}

const sampleTableData = [
  { agent_name: 'John Smith', policy_number: 'POL-001', premium_amount: '$1,200.00', commission_rate: '15%', commission_amount: '$180.00', statement_date: '2024-01-15' },
  { agent_name: 'Maria Garcia', policy_number: 'POL-002', premium_amount: '$2,500.00', commission_rate: '12%', commission_amount: '$300.00', statement_date: '2024-01-16' },
  { agent_name: 'Robert Johnson', policy_number: 'POL-003', premium_amount: '$800.00', commission_rate: '18%', commission_amount: '$144.00', statement_date: '2024-01-17' }
]

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

interface FieldMapperDemoProps {
  onClose?: () => void;
  onSaveAndContinue?: () => void;
}

export default function FieldMapperDemo({ onClose, onSaveAndContinue }: FieldMapperDemoProps) {
  // State for database fields from backend
  const [databaseFields, setDatabaseFields] = useState<FieldConf[]>(sampleDatabaseFields)
  const [loadingFields, setLoadingFields] = useState(false)
  const [fields, setFields] = useState<FieldConf[]>(sampleDatabaseFields)
  const [mapping, setMapping] = useState<Record<string, string>>({
    'agent_name': 'Agent Name',
    'policy_number': 'Policy Number',
    'premium_amount': 'Premium',
    'commission_rate': 'Commission Rate',
    'commission_amount': 'Commission Amount',
    'statement_date': 'Date'
  })
  const [saving, setSaving] = useState(false)
  const [newFieldName, setNewFieldName] = useState('')
  const [planTypes, setPlanTypes] = useState<string[]>(['life_insurance', 'health_insurance'])
  const [availablePlanTypes, setAvailablePlanTypes] = useState<PlanType[]>(samplePlanTypes)
  const [loadingPlanTypes, setLoadingPlanTypes] = useState(false)
  const [learnedMapping, setLearnedMapping] = useState<Record<string, string> | null>(null)
  const [mappingSource, setMappingSource] = useState<'manual' | 'learned'>('learned')
  const [showSpinnerLoader, setShowSpinnerLoader] = useState(false)
  const [mappingAutoApplied, setMappingAutoApplied] = useState(true)
  
  // Step management for demo flow
  const steps = [
    { key: 'upload', label: 'Upload', icon: 'Upload', description: 'Document uploaded' },
    { key: 'process', label: 'Process', icon: 'Settings', description: 'Table editing' },
    { key: 'mapping', label: 'Mapping', icon: 'MapPin', description: 'Field mapping' }
  ] as const
  
  const currentStep = 'mapping'
  const completedSteps = new Set(['upload', 'process'])
  
  const handleSaveAndContinue = () => {
    setShowSpinnerLoader(true)
    
    // El SpinnerLoader maneja su propia duración y auto-cierre
    // No necesitamos setTimeout aquí, el loader se cerrará automáticamente
  }
  
  const mappingAppliedRef = useRef(false)

  // Initialize database fields immediately
  useEffect(() => {
    setDatabaseFields(sampleDatabaseFields)
    setLoadingFields(false)
  }, [])

  // Simulate loading plan types
  useEffect(() => {
    setLoadingPlanTypes(true)
    const timer = setTimeout(() => {
      setAvailablePlanTypes(samplePlanTypes)
      setLoadingPlanTypes(false)
    }, 800)
    return () => clearTimeout(timer)
  }, [])

  // Initialize fields from database fields
  useEffect(() => {
    if (databaseFields.length > 0 && fields.length === 0) {
      setFields(databaseFields)
    }
  }, [databaseFields, fields.length])

  // Apply learned mapping
  useEffect(() => {
    if (mappingAppliedRef.current) return
    
    if (learnedMapping && Object.keys(learnedMapping).length > 0 && mappingSource === 'learned') {
      setMapping(learnedMapping)
      mappingAppliedRef.current = true
    }
  }, [learnedMapping, mappingSource])

  // DnD-kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  // For dropdowns: always use the columns prop, never fallback to mapping values
  const allDropdownColumns = sampleColumns || []

  function setFieldMap(field: string, col: string) {
    setMapping(prevMapping => {
      const newMapping = { ...prevMapping, [field]: col }
      return newMapping
    })
    setMappingSource('manual') // Mark as manually changed
  }

  function resetMapping() {
    setMapping({})
    setFields([])
    setMappingSource('manual')
  }

  function clearMapping() {
    setMapping({})
    setMappingSource('manual')
  }

  async function handleAddDatabaseField() {
    if (!newFieldName.trim()) {
      toast.error('Please enter a display name')
      return
    }

    const fieldKey = newFieldName.toLowerCase().replace(/\s+/g, '_')
    
    // Check if field already exists
    if (databaseFields.some(f => f.field === fieldKey)) {
      toast.error('Field already exists')
      return
    }

    const newField = {
      field: fieldKey,
      label: newFieldName
    }

    setDatabaseFields(prev => [...prev, newField])
    setFields(prev => [...prev, newField])
    setNewFieldName('')
    toast.success('Field added successfully')
  }

  function handlePlanTypeChange(value: string) {
    setPlanTypes((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    )
  }

  async function handleSave() {
    console.log('🎯 FieldMapperDemo handleSave called with:', { mapping, fields, planTypes })
    setSaving(true)
    setShowSpinnerLoader(true)
    
    // Simulate save process
    setTimeout(() => {
      setSaving(false)
      setShowSpinnerLoader(false)
      toast.success('Field mapping saved successfully!')
    }, 2000)
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


  return (
    <div className="fixed inset-0 bg-white dark:bg-slate-900 z-50 flex flex-col">
      {(saving || showSpinnerLoader) && <SpinnerLoader 
        isVisible={showSpinnerLoader} 
        onCancel={() => {
          setShowSpinnerLoader(false);
          toast.success('Demo saved successfully!')
          if (onSaveAndContinue) {
            onSaveAndContinue()
          }
        }}
        duration={1500}
      />}


      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4 flex-wrap">
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-all duration-200 flex items-center cursor-pointer"
              title="Regresar"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200">Field Mapping Demo</h2>
          <span className="text-sm text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 shadow-sm">
            commission_statement_demo.pdf
          </span>
          <div className="flex items-center gap-2 bg-emerald-100 dark:bg-emerald-900/30 px-4 py-2 rounded-lg border border-emerald-200 dark:border-emerald-800">
            <Calendar className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span className="text-sm text-emerald-800 dark:text-emerald-300 font-medium">
              Statement Date: 2024-01-20
            </span>
          </div>
          
          {/* Mapping Source Indicator */}
          {mappingSource !== 'manual' && (
            <div className="flex items-center gap-2">
              {mappingSource === 'learned' && (
                <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-300 rounded-lg text-sm border border-emerald-200 dark:border-emerald-800">
                  <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                  Auto-mapped from learned format
                </div>
              )}
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-3">
          {/* Progress Bar in Header */}
          <div className="scale-75">
            <ProgressBar currentStep="field_mapper" />
          </div>
          
          {/* Theme Toggle */}
          <CompactThemeToggle />
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-6 bg-slate-50 dark:bg-slate-900">
        <div className="w-[90%] mx-auto">
          {/* Plan Types and Add Database Field - Same Row */}
          <div className="mb-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Plan Type Selection */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
              <label className="block text-lg font-semibold text-slate-800 dark:text-slate-200 mb-4">Plan Types</label>
              {loadingPlanTypes ? (
                <div className="flex items-center justify-center py-4">
                  <div className="w-6 h-6 border-2 border-slate-200 dark:border-slate-600 border-t-blue-500 rounded-full animate-spin"></div>
                  <span className="ml-2 text-slate-600 dark:text-slate-400 font-medium">Loading plan types...</span>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-3">
                    {availablePlanTypes.map((pt: PlanType) => (
                      <label key={pt.plan_key} className={
                        `inline-flex items-center px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-sm cursor-pointer transition-all hover:shadow-md ${planTypes.includes(pt.plan_key) ? 'ring-2 ring-blue-400 bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800' : 'hover:border-slate-300 dark:hover:border-slate-500'}`
                      }>
                        <input
                          type="checkbox"
                          className="form-checkbox accent-blue-600 mr-3 h-4 w-4"
                          checked={planTypes.includes(pt.plan_key)}
                          onChange={() => handlePlanTypeChange(pt.plan_key)}
                        />
                        <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{pt.display_name}</span>
                      </label>
                    ))}
                  </div>
                  <div className="text-sm text-slate-500 dark:text-slate-400 mt-3">Select all plan types included in this statement. You can select multiple.</div>
                </>
              )}
            </div>

            {/* Add Database Field */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
              <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-4">Add Database Field</h3>
              <div className="relative">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Field Name</label>
                <div className="relative">
                  <input
                    className="border border-slate-200 dark:border-slate-600 rounded-lg px-4 py-3 pr-32 w-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                    placeholder="e.g., Group Id"
                    value={newFieldName}
                    onChange={e => setNewFieldName(e.target.value)}
                    onKeyPress={e => e.key === 'Enter' && handleAddDatabaseField()}
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-blue-600 text-white text-sm font-medium shadow-sm hover:bg-blue-700 transition-all duration-200 cursor-pointer"
                    onClick={handleAddDatabaseField}
                  >
                    <Plus size={14} /> Add
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Field Mapping Table */}
          <div className="mb-6 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/30">
              <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Database Field Mapping</h3>
              <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">Drag to reorder and map extracted columns to database fields</p>
            </div>

            {loadingFields ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-8 h-8 border-2 border-slate-200 dark:border-slate-600 border-t-blue-500 rounded-full animate-spin"></div>
                <span className="ml-3 text-slate-600 dark:text-slate-400 font-medium">Loading database fields...</span>
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
                        <thead className="sticky top-0 z-10">
                          <tr className="bg-slate-50 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-700">
                            <th className="w-12 p-0"></th>
                            <th className="text-left py-4 px-4 text-sm font-bold text-slate-800 dark:text-slate-200">Database Field</th>
                            <th className="text-left py-4 px-4 text-sm font-bold text-slate-800 dark:text-slate-200">Extracted Column</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                          {fields.length === 0 ? (
                            <tr>
                              <td colSpan={3} className="py-8 text-center">
                                <div className="text-gray-500 dark:text-gray-400">
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
                                      <GripVertical size={18} className="text-gray-400 dark:text-gray-500 mx-auto" />
                                    </td>
                                    <td className="w-1/3 py-3 px-4 align-middle">
                                      <div
                                        className="font-medium text-gray-800 dark:text-gray-200 truncate"
                                        title={f.label}
                                        style={{ minWidth: 120 }}
                                      >
                                        {f.label}
                                      </div>
                                    </td>
                                    <td className="w-2/3 py-3 px-4 align-middle">
                                      <select
                                        key={`select-${f.field}`}
                                        className={`border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 w-full min-w-[140px] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 ${
                                          mapping[f.field] 
                                            ? 'bg-slate-50 dark:bg-slate-600 text-slate-600 dark:text-slate-300' 
                                            : ''
                                        }`}
                                        value={mapping[f.field] || ""}
                                        onChange={e => setFieldMap(f.field, e.target.value)}
                                      >
                                        <option value="">Select column...</option>
                                        {allDropdownColumns.map(col => {
                                          // Check if this column is already mapped to another field
                                          const isMappedElsewhere = Object.entries(mapping).some(([fieldKey, mappedCol]) => 
                                            fieldKey !== f.field && mappedCol === col
                                          )
                                          
                                          return (
                                            <option 
                                              key={col} 
                                              value={col}
                                              className={isMappedElsewhere ? 'bg-slate-100 dark:bg-slate-600 text-slate-500 dark:text-slate-400' : ''}
                                            >
                                              {col}
                                            </option>
                                          )
                                        })}
                                      </select>
                                      {/* Show auto-fill indicator for Invoice Total fields */}
                                      {(f.label.toLowerCase().includes('invoice total') || 
                                        f.label.toLowerCase().includes('invoice amount') ||
                                        f.label.toLowerCase().includes('premium amount')) && 
                                        !mapping[f.field] && (
                                        <div className="mt-1 text-xs text-blue-600 bg-blue-50 dark:bg-blue-950/20 px-2 py-1 rounded">
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
          {sampleTableData && sampleTableData.length > 0 && (
            <div className="mb-6 bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Extracted Table Preview</h3>
                <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">Preview of the extracted data that will be mapped</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-700">
                      {sampleColumns.map((col, index) => (
                        <th key={index} className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {sampleTableData.slice(0, 5).map((row: any, rowIndex: number) => (
                      <tr key={rowIndex} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                        {sampleColumns.map((col: string, cellIndex: number) => (
                          <td key={cellIndex} className="py-2 px-4 text-sm text-gray-900 dark:text-gray-100">
                            {row[col.toLowerCase().replace(/\s+/g, '_')] || '-'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {sampleTableData.length > 5 && (
                <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30 text-center">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Showing first 5 rows of {sampleTableData.length} total rows
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer Actions */}
      <div className="bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 px-4 py-3 shadow-lg flex-shrink-0">
        <div className="flex items-center justify-between">
          {/* Left side - Info */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-500 dark:text-slate-400">
              Step 3 of 3: Field Mapping
            </span>
            <div className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
              <Calendar className="w-3 h-3" />
              <span>Date: 2024-01-20</span>
            </div>
          </div>

          {/* Right side - Learned Mapping Message & Save Button */}
          <div className="flex items-center gap-3">
            {/* Learned Mapping Applied Message */}
            {mappingAutoApplied && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-sm font-medium text-green-800 dark:text-green-300">Learned mapping applied</span>
                <div className="relative group">
                  <Info className="w-4 h-4 text-green-600 dark:text-green-400 cursor-help" />
                  <div className="absolute bottom-full right-0 mb-2 w-64 p-3 bg-slate-900 dark:bg-slate-700 text-white text-xs rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50">
                    <div className="font-medium mb-1">Auto-mapped from learned format</div>
                    <div>Field mappings were automatically populated from a previously saved format for this carrier. You can modify them or start fresh.</div>
                    <div className="absolute top-full right-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-slate-900 dark:border-t-slate-700"></div>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setMapping({})
                    setMappingSource('manual')
                    toast.success('Cleared auto-applied mapping. You can now map fields manually.')
                  }}
                  className="text-xs text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300 underline cursor-pointer"
                >
                  Clear
                </button>
              </div>
            )}
            
            {/* Save & Continue Button */}
            <button
              onClick={handleSaveAndContinue}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 font-medium cursor-pointer transition-all duration-200"
            >
              <Save className="w-4 h-4" />
              Save & Continue
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}