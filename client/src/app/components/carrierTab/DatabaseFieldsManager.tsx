'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { Plus, Edit, Trash2, Save, X, Eye, EyeOff } from 'lucide-react'
import toast from 'react-hot-toast'

type DatabaseField = {
  id: string
  field_key: string
  display_name: string
  description?: string
  is_active: boolean
  created_at: string
  updated_at: string
}

type DatabaseFieldCreate = {
  field_key: string
  display_name: string
  description?: string
  is_active: boolean
}

type DatabaseFieldUpdate = {
  field_key?: string
  display_name?: string
  description?: string
  is_active?: boolean
}

export default function DatabaseFieldsManager() {
  const [fields, setFields] = useState<DatabaseField[]>([])
  const [loading, setLoading] = useState(true)
  const [showInactive, setShowInactive] = useState(false)
  const [editingField, setEditingField] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<DatabaseFieldUpdate>({})
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [createForm, setCreateForm] = useState<DatabaseFieldCreate>({
    field_key: '',
    display_name: '',
    description: '',
    is_active: true
  })

  // Fetch database fields
  const fetchFields = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/database-fields/?active_only=${!showInactive}`)
      if (!response.ok) throw new Error('Failed to fetch fields')
      const data = await response.json()
      setFields(data)
    } catch (error) {
      toast.error('Failed to load database fields')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }, [showInactive])

  useEffect(() => {
    fetchFields()
  }, [fetchFields])

  // Initialize default fields
  const initializeFields = async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/database-fields/initialize/`, {
        method: 'POST'
      })
      if (!response.ok) throw new Error('Failed to initialize fields')
      toast.success('Default database fields initialized!')
      fetchFields()
    } catch (error) {
      toast.error('Failed to initialize fields')
      console.error(error)
    }
  }

  // Create field
  const createField = async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/database-fields/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm)
      })
      if (!response.ok) throw new Error('Failed to create field')
      toast.success('Field created successfully!')
      setShowCreateForm(false)
      setCreateForm({ field_key: '', display_name: '', description: '', is_active: true })
      fetchFields()
    } catch (error) {
      toast.error('Failed to create field')
      console.error(error)
    }
  }

  // Update field
  const updateField = async (fieldId: string) => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/database-fields/${fieldId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm)
      })
      if (!response.ok) throw new Error('Failed to update field')
      toast.success('Field updated successfully!')
      setEditingField(null)
      setEditForm({})
      fetchFields()
    } catch (error) {
      toast.error('Failed to update field')
      console.error(error)
    }
  }

  // Delete field
  const deleteField = async (fieldId: string) => {
    if (!confirm('Are you sure you want to delete this field?')) return
    
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/database-fields/${fieldId}`, {
        method: 'DELETE'
      })
      if (!response.ok) throw new Error('Failed to delete field')
      toast.success('Field deleted successfully!')
      fetchFields()
    } catch (error) {
      toast.error('Failed to delete field')
      console.error(error)
    }
  }

  // Start editing
  const startEdit = (field: DatabaseField) => {
    setEditingField(field.id)
    setEditForm({
      field_key: field.field_key,
      display_name: field.display_name,
      description: field.description,
      is_active: field.is_active
    })
  }

  // Cancel editing
  const cancelEdit = () => {
    setEditingField(null)
    setEditForm({})
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-7xl mx-auto p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Database Fields</h1>
          <p className="text-gray-600 mt-2">Manage the database fields used for field mapping</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowInactive(!showInactive)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition"
          >
            {showInactive ? <EyeOff size={16} /> : <Eye size={16} />}
            {showInactive ? 'Hide Inactive' : 'Show Inactive'}
          </button>
          <button
            onClick={initializeFields}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
          >
            Initialize Default Fields
          </button>
          <button
            onClick={() => setShowCreateForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            <Plus size={16} />
            Add Field
          </button>
        </div>
      </div>

      {/* Create Form Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Create New Field</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Field Key</label>
                <input
                  type="text"
                  value={createForm.field_key}
                  onChange={(e) => setCreateForm({ ...createForm, field_key: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., group_id"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
                <input
                  type="text"
                  value={createForm.display_name}
                  onChange={(e) => setCreateForm({ ...createForm, display_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., Group Id"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={3}
                  placeholder="Optional description"
                />
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="create-active"
                  checked={createForm.is_active}
                  onChange={(e) => setCreateForm({ ...createForm, is_active: e.target.checked })}
                  className="mr-2"
                />
                <label htmlFor="create-active" className="text-sm text-gray-700">Active</label>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={createField}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
              >
                Create
              </button>
              <button
                onClick={() => setShowCreateForm(false)}
                className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fields Table */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Field Key</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Display Name</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Description</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Status</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {fields.map((field) => (
                <tr key={field.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    {editingField === field.id ? (
                      <input
                        type="text"
                        value={editForm.field_key || ''}
                        onChange={(e) => setEditForm({ ...editForm, field_key: e.target.value })}
                        className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                      />
                    ) : (
                      <code className="text-sm bg-gray-100 px-2 py-1 rounded">{field.field_key}</code>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {editingField === field.id ? (
                      <input
                        type="text"
                        value={editForm.display_name || ''}
                        onChange={(e) => setEditForm({ ...editForm, display_name: e.target.value })}
                        className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                      />
                    ) : (
                      <span className="font-medium">{field.display_name}</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {editingField === field.id ? (
                      <textarea
                        value={editForm.description || ''}
                        onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                        className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                        rows={2}
                      />
                    ) : (
                      <span className="text-gray-600 text-sm">{field.description || '-'}</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {editingField === field.id ? (
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          checked={editForm.is_active ?? field.is_active}
                          onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })}
                          className="mr-2"
                        />
                        <span className="text-sm">Active</span>
                      </div>
                    ) : (
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        field.is_active 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {field.is_active ? 'Active' : 'Inactive'}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {editingField === field.id ? (
                      <div className="flex gap-2">
                        <button
                          onClick={() => updateField(field.id)}
                          className="p-1 text-green-600 hover:bg-green-100 rounded"
                          title="Save"
                        >
                          <Save size={16} />
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="p-1 text-gray-600 hover:bg-gray-100 rounded"
                          title="Cancel"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          onClick={() => startEdit(field)}
                          className="p-1 text-blue-600 hover:bg-blue-100 rounded"
                          title="Edit"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={() => deleteField(field.id)}
                          className="p-1 text-red-600 hover:bg-red-100 rounded"
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {fields.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500">No database fields found.</p>
            <button
              onClick={initializeFields}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              Initialize Default Fields
            </button>
          </div>
        )}
      </div>
    </div>
  )
} 