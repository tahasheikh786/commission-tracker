import React, { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import Select from 'react-select'

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

  useEffect(() => {
    setLoading(true)
    fetch('http://localhost:8000/companies/')
      .then(r => r.json())
      .then(setCompanies)
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
      toast.error('Company already exists!')
      return
    }
    setAddLoading(true)
    try {
      const res = await fetch('http://localhost:8000/companies/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCompany })
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data?.detail || "Failed to add company")
        return;
      }

      if (data.id) {
        const newEntry = { id: data.id, name: newCompany }
        setCompanies([...companies, newEntry])
        onChange(newEntry)
        setNewCompany('')
        toast.success('Company added!')
      } else {
        toast.error('Failed to add company')
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

  return (
    <div className="my-8">
      <label className="block mb-2 font-semibold text-gray-700 text-lg">
        Select or Add Company
      </label>

      <div className="relative">
        <Select
          isClearable
          isSearchable
          placeholder="Select company..."
          options={options}
          value={selectedCompany ? { value: selectedCompany.id, label: selectedCompany.name } : null}
          onChange={handleSelect}
          isDisabled={!!selectedCompany || loading}
          className="react-select-container"
          classNamePrefix="react-select"
          menuPlacement="auto"
          maxMenuHeight={160}
          styles={{
            container: base => ({ ...base, width: '100%', marginBottom: 16 }),
            menu: base => ({ ...base, zIndex: 50 })
          }}
        />
        {loading && (
          <div className="absolute top-0 left-0 right-0 bottom-0 flex items-center justify-center bg-white/70 z-10 rounded">
            {/* Simple spinner */}
            <svg className="animate-spin h-6 w-6 text-blue-500" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
            </svg>
          </div>
        )}
      </div>

      <div className="text-sm text-gray-500">
        {selectedCompany ? (
          <button
            onClick={() => onChange(null)}
            className="text-blue-700 underline hover:text-blue-900"
          >
            Clear selection to add/select another company
          </button>
        ) : (
          <span>Type and add a new company if not found in the list.</span>
        )}
      </div>

      <div className="flex items-center gap-2 mt-5">
        <input
          type="text"
          placeholder="New company name"
          value={newCompany}
          onChange={e => setNewCompany(e.target.value)}
          className="border px-4 py-2 rounded flex-1 bg-white shadow-inner text-lg"
          disabled={!!selectedCompany || addLoading || loading}
        />
        <button
          className="bg-blue-600 text-white px-6 py-2 rounded-xl font-medium shadow hover:bg-blue-700 transition disabled:opacity-50 text-lg"
          onClick={handleAdd}
          disabled={!newCompany.trim() || !!selectedCompany || addLoading || loading}
        >
          {addLoading ? 'Adding...' : 'Add'}
        </button>
      </div>
    </div>
  )
}
