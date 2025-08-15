'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { Plus, Edit, Trash2, Save, X, ChevronLeft, ChevronRight } from 'lucide-react'
import toast from 'react-hot-toast'

type PlanType = {
  id: string
  display_name: string
  description?: string
  is_active: boolean
  created_at: string
  updated_at: string
}

type PlanTypeCreate = {
  display_name: string
  description?: string
  is_active: boolean
}

type PlanTypeUpdate = {
  plan_key?: string
  display_name?: string
  description?: string
  is_active?: boolean
}

export default function PlanTypesManager() {
  const [planTypes, setPlanTypes] = useState<PlanType[]>([])
  const [loading, setLoading] = useState(true)
  const [editingPlanType, setEditingPlanType] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<PlanTypeUpdate>({})
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [createForm, setCreateForm] = useState<PlanTypeCreate>({
    display_name: '',
    description: '',
    is_active: true
  })
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

  const totalPages = Math.ceil(planTypes.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedPlanTypes = planTypes.slice(startIndex, endIndex)

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
  }

  // Fetch plan types
  const fetchPlanTypes = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/plan-types/?active_only=true`)
      if (!response.ok) throw new Error('Failed to fetch plan types')
      const data = await response.json()
      setPlanTypes(data)
    } catch (error) {
      toast.error('Failed to load plan types')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPlanTypes()
  }, [fetchPlanTypes])



  // Create plan type
  const createPlanType = async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/plan-types/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm)
      })
      if (!response.ok) throw new Error('Failed to create plan type')
      toast.success('Plan type created successfully!')
      setShowCreateForm(false)
      setCreateForm({ display_name: '', description: '', is_active: true })
      fetchPlanTypes()
    } catch (error) {
      toast.error('Failed to create plan type')
      console.error(error)
    }
  }

  // Update plan type
  const updatePlanType = async (planTypeId: string) => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/plan-types/${planTypeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm)
      })
      if (!response.ok) throw new Error('Failed to update plan type')
      toast.success('Plan type updated successfully!')
      setEditingPlanType(null)
      setEditForm({})
      fetchPlanTypes()
    } catch (error) {
      toast.error('Failed to update plan type')
      console.error(error)
    }
  }

  // Delete plan type
  const deletePlanType = async (planTypeId: string) => {
    if (!confirm('Are you sure you want to delete this plan type?')) return
    
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/plan-types/${planTypeId}`, {
        method: 'DELETE'
      })
      if (!response.ok) throw new Error('Failed to delete plan type')
      toast.success('Plan type deleted successfully!')
      fetchPlanTypes()
    } catch (error) {
      toast.error('Failed to delete plan type')
      console.error(error)
    }
  }

  // Start editing
  const startEdit = (planType: PlanType) => {
    setEditingPlanType(planType.id)
    setEditForm({
      display_name: planType.display_name,
      description: planType.description,
      is_active: planType.is_active
    })
  }

  // Cancel editing
  const cancelEdit = () => {
    setEditingPlanType(null)
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
          <h1 className="text-3xl font-bold text-gray-900">Plan Types</h1>
          <p className="text-gray-600 mt-2">Manage the plan types used for insurance categorization</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowCreateForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            <Plus size={16} />
            Add Plan Type
          </button>
        </div>
      </div>

      {/* Create Form Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Create New Plan Type</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
                <input
                  type="text"
                  value={createForm.display_name}
                  onChange={(e) => setCreateForm({ ...createForm, display_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., Medical"
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
                onClick={createPlanType}
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

      {/* Plan Types Table */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
                              <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Display Name</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Description</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Status</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Actions</th>
                    </tr>
                  </thead>
            <tbody className="divide-y divide-gray-200">
              {paginatedPlanTypes.map((planType) => (
                <tr key={planType.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    {editingPlanType === planType.id ? (
                      <input
                        type="text"
                        value={editForm.display_name || ''}
                        onChange={(e) => setEditForm({ ...editForm, display_name: e.target.value })}
                        className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                      />
                    ) : (
                      <span className="font-medium">{planType.display_name}</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {editingPlanType === planType.id ? (
                      <textarea
                        value={editForm.description || ''}
                        onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                        className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                        rows={2}
                      />
                    ) : (
                      <span className="text-gray-600 text-sm">{planType.description || '-'}</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {editingPlanType === planType.id ? (
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          checked={editForm.is_active ?? planType.is_active}
                          onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })}
                          className="mr-2"
                        />
                        <span className="text-sm">Active</span>
                      </div>
                    ) : (
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        planType.is_active 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {planType.is_active ? 'Active' : 'Inactive'}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {editingPlanType === planType.id ? (
                      <div className="flex gap-2">
                        <button
                          onClick={() => updatePlanType(planType.id)}
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
                          onClick={() => startEdit(planType)}
                          className="p-1 text-blue-600 hover:bg-blue-100 rounded"
                          title="Edit"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={() => deletePlanType(planType.id)}
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
        
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50">
            <div className="text-sm text-gray-700">
              Showing {startIndex + 1} to {Math.min(endIndex, planTypes.length)} of {planTypes.length} plan types
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="flex items-center gap-1 px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={16} />
                Previous
              </button>
              
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  
                  return (
                    <button
                      key={pageNum}
                      onClick={() => handlePageChange(pageNum)}
                      className={`px-3 py-2 text-sm rounded-lg transition-colors ${
                        currentPage === pageNum
                          ? 'bg-blue-600 text-white'
                          : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>
              
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="flex items-center gap-1 px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Next
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
        
        {planTypes.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500">No plan types found.</p>
            <button
              onClick={() => setShowCreateForm(true)}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              Add Your First Plan Type
            </button>
          </div>
        )}
      </div>
    </div>
  )
} 