'use client'
import { useState, useEffect, useRef } from 'react'
import toast from 'react-hot-toast'
import { X, Plus, GripVertical, Calendar, ArrowLeft, Save, SkipForward, Brain, CheckCircle, AlertCircle, ChevronLeft, FileText, Sparkles, Database, Upload, Settings, MapPin, ArrowRight } from 'lucide-react'
import SpinnerLoader from '../ui/SpinnerLoader'
import ProgressBar from '../../upload/components/ProgressBar'
import { CompactThemeToggle } from '../ui/CompactThemeToggle'

// Datos de ejemplo para el demo
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

interface FieldMapperDemoProps {
  onClose?: () => void;
  onSaveAndContinue?: () => void;
}

export default function FieldMapperDemo({ onClose, onSaveAndContinue }: FieldMapperDemoProps) {
  const [databaseFields, setDatabaseFields] = useState(sampleDatabaseFields)
  const [loadingFields, setLoadingFields] = useState(false)
  const [fields, setFields] = useState(sampleDatabaseFields)
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
  const [availablePlanTypes, setAvailablePlanTypes] = useState(samplePlanTypes)
  const [loadingPlanTypes, setLoadingPlanTypes] = useState(false)
  const [learnedMapping, setLearnedMapping] = useState<Record<string, string> | null>(null)
  const [mappingSource, setMappingSource] = useState<'manual' | 'learned'>('learned')
  const [showSpinnerLoader, setShowSpinnerLoader] = useState(false)
  const [mappingAutoApplied, setMappingAutoApplied] = useState(true)
  
  // Step management for demo flow
  const steps = [
    { key: 'upload', label: 'Upload', icon: Upload, description: 'Document uploaded' },
    { key: 'process', label: 'Process', icon: Settings, description: 'Table editing' },
    { key: 'mapping', label: 'Mapping', icon: MapPin, description: 'Field mapping' }
  ] as const
  
  const currentStep = 'mapping'
  const completedSteps = new Set(['upload', 'process'])
  
  const handleSaveAndContinue = () => {
    setShowSpinnerLoader(true)
    
    // El SpinnerLoader maneja su propia duración y auto-cierre
    // No necesitamos setTimeout aquí, el loader se cerrará automáticamente
  }
  
  const mappingAppliedRef = useRef(false)

  // Simulate loading database fields
  useEffect(() => {
    setLoadingFields(true)
    const timer = setTimeout(() => {
      setDatabaseFields(sampleDatabaseFields)
      setLoadingFields(false)
    }, 1000)
    return () => clearTimeout(timer)
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

  function setFieldMap(field: string, col: string) {
    setMapping(prevMapping => {
      const newMapping = { ...prevMapping, [field]: col }
      return newMapping
    })
    setMappingSource('manual')
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
      toast.error('Please enter a field name')
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

  function handleSave() {
    setSaving(true)
    setShowSpinnerLoader(true)
    
    // Simulate save process
    setTimeout(() => {
      setSaving(false)
      setShowSpinnerLoader(false)
      toast.success('Field mapping saved successfully!')
    }, 2000)
  }

  function handleSkip() {
    toast.success('Field mapping skipped')
  }

  function handleApplyLearnedMapping() {
    const learnedMapping = {
      'agent_name': 'Agent Name',
      'policy_number': 'Policy Number',
      'premium_amount': 'Premium',
      'commission_rate': 'Commission Rate',
      'commission_amount': 'Commission Amount',
      'statement_date': 'Date'
    }
    
    setMapping(learnedMapping)
    setMappingSource('learned')
    toast.success('Learned mapping applied successfully!')
  }

  function handlePlanTypeChange(planKey: string, checked: boolean) {
    if (checked) {
      setPlanTypes(prev => [...prev, planKey])
    } else {
      setPlanTypes(prev => prev.filter(p => p !== planKey))
    }
  }

  const mappedFields = fields.filter(f => mapping[f.field])
  const unmappedFields = fields.filter(f => !mapping[f.field])
  const unmappedColumns = sampleColumns.filter(col => !Object.values(mapping).includes(col))

  return (
    <div className="fixed inset-0 bg-white dark:bg-slate-900 z-50 flex flex-col">
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
          <span className="text-sm text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 shadow-sm">
            commission_statement_demo.pdf
          </span>
          <div className="flex items-center gap-2 bg-emerald-100 dark:bg-emerald-900/30 px-4 py-2 rounded-lg border border-emerald-200 dark:border-emerald-800">
            <Calendar className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span className="text-sm text-emerald-800 dark:text-emerald-300 font-medium">
              Statement Date: 2024-01-20
            </span>
          </div>
          
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

      {/* Main Content */}
      <div className="flex-1 flex flex-row gap-4 p-4 bg-slate-50 dark:bg-slate-900 min-h-0 overflow-hidden max-h-full">
        {/* Left Panel - Database Fields */}
        <div className="w-1/3 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col min-h-0">
          <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shadow-sm flex-shrink-0">
            <div className="flex items-center justify-between h-12 px-3 bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-blue-500 rounded flex items-center justify-center">
                  <Database className="w-3 h-3 text-white" />
                </div>
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                  Database Fields
                </span>
              </div>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-3">
              {fields.map((field, index) => (
                <div
                  key={field.field}
                  className={`p-3 rounded-lg border-2 transition-all ${
                    mapping[field.field]
                      ? 'border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-slate-800 dark:text-slate-200">
                        {field.label}
                      </div>
                      <div className="text-sm text-slate-500 dark:text-slate-400">
                        {field.field}
                      </div>
                    </div>
                    {mapping[field.field] && (
                      <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                    )}
                  </div>
                  {mapping[field.field] && (
                    <div className="mt-2 text-sm text-green-700 dark:text-green-400">
                      → {mapping[field.field]}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Center Panel - Mapping Interface */}
        <div className="w-1/3 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col min-h-0">
          <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shadow-sm flex-shrink-0">
            <div className="flex items-center justify-between h-12 px-3 bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-purple-500 rounded flex items-center justify-center">
                  <GripVertical className="w-3 h-3 text-white" />
                </div>
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                  Field Mapping
                </span>
              </div>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-4">
              {mappedFields.map((field) => (
                <div key={field.field} className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-blue-800 dark:text-blue-200">
                      {field.label}
                    </span>
                    <button
                      onClick={() => setFieldMap(field.field, '')}
                      className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 text-sm cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                  <select
                    value={mapping[field.field] || ''}
                    onChange={(e) => setFieldMap(field.field, e.target.value)}
                    className="w-full p-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 cursor-pointer"
                  >
                    <option value="">Select column...</option>
                    {sampleColumns.map((col) => (
                      <option key={col} value={col}>
                        {col}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              
              {unmappedFields.length > 0 && (
                <div className="p-4 bg-slate-50 dark:bg-slate-700/30 rounded-lg border border-slate-200 dark:border-slate-700">
                  <h4 className="font-medium text-slate-800 dark:text-slate-200 mb-3">
                    Unmapped Fields
                  </h4>
                  <div className="space-y-2">
                    {unmappedFields.map((field) => (
                      <div key={field.field} className="flex items-center justify-between p-2 bg-white dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700">
                        <span className="text-sm text-slate-500 dark:text-slate-400">
                          {field.label}
                        </span>
                        <button
                          onClick={() => setFieldMap(field.field, sampleColumns[0])}
                          className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm cursor-pointer"
                        >
                          Map
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Panel - Extracted Columns */}
        <div className="w-1/3 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col min-h-0">
          <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shadow-sm flex-shrink-0">
            <div className="flex items-center justify-between h-12 px-3 bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-green-500 rounded flex items-center justify-center">
                  <FileText className="w-3 h-3 text-white" />
                </div>
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                  Extracted Columns
                </span>
              </div>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-3">
              {sampleColumns.map((column, index) => {
                const isMapped = Object.values(mapping).includes(column)
                return (
                  <div
                    key={column}
                    className={`p-3 rounded-lg border-2 transition-all ${
                      isMapped
                        ? 'border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {column}
                      </span>
                      {isMapped && (
                        <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Plan Types Section */}
      <div className="border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/30 p-4">
        <h4 className="font-semibold text-slate-800 dark:text-slate-200 mb-3">
          Plan Types
        </h4>
        <div className="flex flex-wrap gap-3">
          {availablePlanTypes.map((planType) => (
            <label key={planType.plan_key} className="flex items-center space-x-3 p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700">
              <input
                type="checkbox"
                checked={planTypes.includes(planType.plan_key)}
                onChange={(e) => handlePlanTypeChange(planType.plan_key, e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 cursor-pointer"
              />
              <div>
                <div className="font-medium text-slate-800 dark:text-slate-200">
                  {planType.display_name}
                </div>
                <div className="text-sm text-slate-500 dark:text-slate-400">
                  {planType.description}
                </div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Footer Actions */}
      <div className="bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 px-4 py-3 shadow-lg flex-shrink-0">
        <div className="flex items-center justify-between">
          {/* Left side - Info */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-500 dark:text-slate-400">
              Step {steps.findIndex(s => s.key === currentStep) + 1} of {steps.length}: {steps.find(s => s.key === currentStep)?.label}
            </span>
            <div className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
              <Calendar className="w-3 h-3" />
              <span>Date: 2024-01-20</span>
            </div>
          </div>


          {/* Right side - Buttons */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleApplyLearnedMapping}
              className="px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 flex items-center gap-2 font-medium cursor-pointer transition-all duration-300 ease-in-out transform hover:scale-[1.02] active:scale-[0.98] hover:shadow-lg"
            >
              <Sparkles className="w-4 h-4" />
              Apply Learned Mapping
            </button>
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

      {/* Spinner Loader */}
      <SpinnerLoader 
        isVisible={showSpinnerLoader} 
        onCancel={() => {
          setShowSpinnerLoader(false);
          toast.success('Demo saved successfully!')
          // Si hay callback, ejecutarlo
          if (onSaveAndContinue) {
            onSaveAndContinue()
          }
        }}
        duration={1500}
      />
    </div>
  )
}
