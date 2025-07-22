'use client'
import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import FieldMapper from '@/app/upload/components/FieldMapper'

type FieldConfig = { field: string, label: string }

export default function EditMappingModal({ 
  company, 
  onClose, 
  onSave 
}: { 
  company: { id: string, name: string }, 
  onClose: () => void, 
  onSave: (mapping: Record<string, string>, fields: FieldConfig[], planTypes: string[]) => void 
}) {
  const [fieldConfig, setFieldConfig] = useState<FieldConfig[]>([])
  const [databaseFields, setDatabaseFields] = useState<FieldConfig[]>([])
  const [loadingFields, setLoadingFields] = useState(true)
  const [mapping, setMapping] = useState<Record<string, string> | null>(null)
  const [planTypes, setPlanTypes] = useState<string[]>([])

  function getLabelFromDatabaseFields(fieldKey: string) {
    return (databaseFields.find(f => f.field === fieldKey)?.label) || fieldKey;
  }

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
  }, [fieldConfig.length])

  // Fetch existing mapping
  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/companies/${company.id}/mapping/`)
      .then(r => r.json())
      .then(mappingObj => {
        if (mappingObj && mappingObj.mapping) {
          setMapping(mappingObj.mapping)
          setFieldConfig(mappingObj.field_config || databaseFields)
          if (mappingObj.plan_types) setPlanTypes(mappingObj.plan_types)
        } else {
          setFieldConfig(databaseFields)
        }
      })
      .catch(() => setFieldConfig(databaseFields))
  }, [company.id, databaseFields])

  if (loadingFields) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading database fields...</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-8 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800">Edit Field Mapping for {company.name}</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
          >
            ×
          </button>
        </div>
        
        <FieldMapper
          company={company}
          columns={[]} // Will be populated when mapping is loaded
          onSave={(map, fieldConf, selectedPlanTypes) => {
            onSave(map, fieldConf, selectedPlanTypes)
            onClose()
          }}
          onSkip={onClose}
          initialFields={fieldConfig}
          initialMapping={mapping}
          initialPlanTypes={planTypes}
        />
      </div>
    </div>
  )
}
