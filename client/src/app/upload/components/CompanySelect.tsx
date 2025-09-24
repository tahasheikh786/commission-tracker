import React, { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import Select from 'react-select'
import Loader from './Loader';

type Company = { id: string; name: string }
type Option = { value: string; label: string }

export default function CompanySelect({
  value,
  onChange
}: {
  value?: string
  onChange: (company: Company | null) => void
}) {
  const [companies, setCompanies] = useState<Company[]>([])
  const [newCompany, setNewCompany] = useState('')
  const [loading, setLoading] = useState(true)
  const [addLoading, setAddLoading] = useState(false)
  const [isClient, setIsClient] = useState(false)

  // Fix hydration issue by ensuring client-side only rendering
  useEffect(() => {
    setIsClient(true)
  }, [])

  useEffect(() => {
    setLoading(true)
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/companies/`)
      .then(r => r.json())
      .then((data) => {
        // Sort companies alphabetically by name
        const sortedCompanies = data.sort((a: Company, b: Company) => 
          a.name.localeCompare(b.name)
        );
        setCompanies(sortedCompanies);
      })
      .catch(() => toast.error("Failed to load companies"))
      .finally(() => setLoading(false))
  }, [])

  // Transform to react-select options
  const options: Option[] = companies.map(c => ({
    value: c.id,
    label: c.name
  }))

  const selectedCompany = companies.find(c => c.id === value) || null

  async function handleAdd() {
    if (!newCompany.trim()) return
    if (companies.some(c => c.name.toLowerCase() === newCompany.trim().toLowerCase())) {
      toast.error('Carrier already exists!')
      return
    }
    setAddLoading(true)
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/companies/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCompany })
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data?.detail || "Failed to add carrier")
        return;
      }

      if (data.id) {
        const newEntry = { id: data.id, name: newCompany }
        setCompanies([...companies, newEntry])
        onChange(newEntry)
        setNewCompany('')
        toast.success('Carrier added!')
      } else {
        toast.error('Failed to add carrier')
      }
    } catch (err) {
      toast.error("Network error, please try again.")
    } finally {
      setAddLoading(false)
    }
  }

  function handleSelect(option: Option | null) {
    if (option) {
      const selected = companies.find(c => c.id === option.value)
      if (selected) onChange(selected)
    } else {
      onChange(null)
    }
  }

  // Don't render until client-side to prevent hydration mismatch
  if (!isClient) {
    return (
      <div className="my-8">
        <label className="block mb-3 font-semibold text-slate-800 text-lg">
          Select or Add Carrier
        </label>
        <div className="relative">
          <div className="w-full px-4 py-3 rounded-lg bg-slate-100 text-slate-500 border border-slate-200">
            Loading carriers...
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="my-8">
      <label className="block mb-3 font-semibold text-slate-800 text-lg">
        Select or Add Carrier
      </label>

      <div className="relative">
        <Select
          isClearable
          isSearchable
          placeholder="Select carrier..."
          options={options}
          value={selectedCompany ? { value: selectedCompany.id, label: selectedCompany.name } : null}
          onChange={handleSelect}
          isDisabled={!!selectedCompany || loading}
          className="react-select-container"
          classNamePrefix="react-select"
          menuPlacement="auto"
          maxMenuHeight={160}
          instanceId="company-select" // Add consistent instance ID
          styles={{
            container: base => ({ ...base, width: '100%', marginBottom: 16 }),
            menu: base => ({ ...base, zIndex: 50 }),
            control: (base, state) => ({
              ...base,
              minHeight: '48px',
              border: state.isFocused ? '2px solid #3b82f6' : '1px solid #e2e8f0',
              borderRadius: '8px',
              boxShadow: state.isFocused ? '0 0 0 3px rgba(59, 130, 246, 0.1)' : 'none',
              '&:hover': {
                border: '1px solid #cbd5e1'
              }
            }),
            placeholder: base => ({
              ...base,
              color: '#64748b'
            }),
            singleValue: base => ({
              ...base,
              color: '#1e293b'
            }),
            option: (base, state) => ({
              ...base,
              backgroundColor: state.isSelected ? '#3b82f6' : state.isFocused ? '#f1f5f9' : 'white',
              color: state.isSelected ? 'white' : '#1e293b',
              '&:hover': {
                backgroundColor: state.isSelected ? '#3b82f6' : '#f1f5f9'
              }
            })
          }}
        />
        {loading && (
          <div className="absolute top-0 left-0 right-0 bottom-0 flex items-center justify-center bg-white/70 z-10 rounded-lg">
            <Loader message="Loading carriers..." className="py-4" />
          </div>
        )}
      </div>

      <div className="text-sm text-slate-600 mb-4">
        {selectedCompany ? (
          <button
            onClick={() => onChange(null)}
            className="text-blue-600 hover:text-blue-700 underline font-medium transition-colors"
          >
            Clear selection to add/select another Carrier
          </button>
        ) : (
          <span>Type and add a new Carrier if not found in the list.</span>
        )}
      </div>

      <div className="flex items-center gap-3 mt-6">
        <input
          type="text"
          placeholder="New carrier name"
          value={newCompany}
          onChange={e => setNewCompany(e.target.value)}
          className="w-full px-4 py-3 rounded-lg border border-slate-200 bg-white text-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 disabled:opacity-50 disabled:bg-slate-50"
          disabled={!!selectedCompany || addLoading || loading}
        />
        <button
          className="px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg font-semibold shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          onClick={handleAdd}
          disabled={!newCompany.trim() || !!selectedCompany || addLoading || loading}
        >
          {addLoading ? (
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              Adding...
            </div>
          ) : (
            'Add'
          )}
        </button>
      </div>
    </div>
  )
}
