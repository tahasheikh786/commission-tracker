import React, { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Plus, Search, Building2, Check } from 'lucide-react'
import Spinner from '../../components/ui/Spinner'

type Company = { id: string; name: string }

export default function CompanySelect({
  value,
  onChange
}: {
  value?: string
  onChange: (company: Company | null) => void
}) {
  const [companies, setCompanies] = useState<Company[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)
  const [addLoading, setAddLoading] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/companies/`)
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

  // Filter companies based on search term - show all if search is empty
  // Also exclude the currently selected company from the list
  const filteredCompanies = (searchTerm.trim() === '' 
    ? companies 
    : companies.filter(company =>
        company.name.toLowerCase().includes(searchTerm.toLowerCase())
      )).filter(company => company.id !== value)

  // Check if search term matches any existing company
  const exactMatch = searchTerm.trim() !== '' ? companies.find(c => 
    c.name.toLowerCase() === searchTerm.toLowerCase()
  ) : null

  const selectedCompany = companies.find(c => c.id === value) || null

  async function handleCreateCompany() {
    if (!searchTerm.trim()) {
      toast.error('Please enter a carrier name')
      return
    }
    
    setAddLoading(true)
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/companies/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: searchTerm.trim() })
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data?.detail || "Failed to add carrier")
        return;
      }

      if (data.id) {
        const newEntry = { id: data.id, name: searchTerm.trim() }
        setCompanies([...companies, newEntry])
        onChange(newEntry)
        setSearchTerm('')
        setShowDropdown(false)
        toast.success('Carrier created successfully!')
      } else {
        toast.error('Failed to create carrier')
      }
    } catch (err) {
      toast.error("Network error, please try again.")
    } finally {
      setAddLoading(false)
    }
  }

  function handleSelectCompany(company: Company) {
    onChange(company)
    setSearchTerm('')
    // Close dropdown after selection
    setShowDropdown(false)
  }

  function handleClearSelection() {
    onChange(null)
    setSearchTerm('')
    setShowDropdown(false)
  }

  // Show loading state while fetching data
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-4 w-full">
        {/* Search Input with Loading State */}
        <div className="relative w-80">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none z-10">
            <Search className="h-5 w-5 text-muted-foreground" />
          </div>
          <input
            type="text"
            placeholder="Loading carriers..."
            disabled
            className="w-full pl-12 pr-4 py-3 text-base bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg cursor-not-allowed opacity-60"
          />
          <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
            <Spinner size="md" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center gap-4 w-full">
      {/* Search Input with Integrated Selected Company */}
      <div className="relative w-80">
        {/* Selected Company - Full Selector Shape */}
        {selectedCompany && (
          <div className="absolute inset-0 z-20">
            <div className="w-full h-full bg-slate-100/50 dark:bg-slate-700/50 border border-blue-500/30 dark:border-blue-400/30 rounded-lg flex items-center justify-between px-4 py-3 hover:bg-slate-200/70 dark:hover:bg-slate-600/70 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-100/50 dark:bg-blue-900/30 border border-blue-300/50 dark:border-blue-700/50 rounded-lg flex items-center justify-center">
                  <Building2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <div className="font-medium text-slate-800 dark:text-slate-200">{selectedCompany.name}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">Selected carrier</div>
                </div>
              </div>
              <button
                onClick={handleClearSelection}
                className="p-1 hover:text-red-400 cursor-pointer transition-colors duration-200 group"
              >
                <svg className="w-4 h-4 text-slate-500 dark:text-slate-400 group-hover:text-red-400 group-hover:scale-110 transition-all duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}
        
        {/* Search Icon - Only show when no company selected */}
        {!selectedCompany && (
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none z-10">
            <Search className="h-5 w-5 text-slate-500 dark:text-slate-400" />
          </div>
        )}
        
        {/* Input - Only show when no company selected */}
        {!selectedCompany && (
          <input
            type="text"
            placeholder="Search or create carrier..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value)
              setShowDropdown(true)
            }}
            onFocus={() => setShowDropdown(true)}
            onBlur={(e) => {
              // Only hide if the focus is moving outside the component
              const currentTarget = e.currentTarget
              const relatedTarget = e.relatedTarget as Node | null
              
              // Check if the related target is within the dropdown
              if (relatedTarget && currentTarget.contains(relatedTarget)) {
                return
              }
              
              // Delay hiding dropdown to allow clicking on options
              setTimeout(() => setShowDropdown(false), 150)
            }}
            className="w-full py-3 text-base border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 placeholder-slate-400 dark:placeholder-slate-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 pl-12 pr-4"
          />
        )}
        
        {/* Invisible input when company is selected - for accessibility */}
        {selectedCompany && (
          <input
            type="text"
            className="w-full py-3 text-base border border-slate-200 dark:border-slate-600 rounded-lg bg-transparent opacity-0 pointer-events-none"
            tabIndex={-1}
            readOnly
          />
        )}
        
        {/* Floating Dropdown */}
        {showDropdown && (
          <div className={`absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg overflow-y-auto z-50 custom-scrollbar ${selectedCompany ? 'max-h-40' : 'max-h-60'}`}>
            {/* Existing Companies */}
            {filteredCompanies.length > 0 && (
              <div className="p-2">
                <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide px-3 py-2">
                  {searchTerm.trim() === '' ? 'All Carriers' : 'Existing Carriers'}
                </div>
                {filteredCompanies.map((company) => (
                  <button
                    key={company.id}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleSelectCompany(company)}
                    className={`w-full flex items-center gap-3 px-3 py-3 text-left rounded-lg transition-colors cursor-pointer ${
                      selectedCompany?.id === company.id 
                        ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800' 
                        : 'hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    <Building2 className={`h-4 w-4 ${selectedCompany?.id === company.id ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'}`} />
                    <span className={`${selectedCompany?.id === company.id ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-slate-800 dark:text-slate-200'}`}>
                      {company.name}
                    </span>
                    {selectedCompany?.id === company.id && (
                      <div className="ml-auto">
                        <Check className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* Create New Option - Only show if there's a search term */}
            {searchTerm.trim() && !exactMatch && (
              <div className="border-t border-slate-200 dark:border-slate-700 p-2">
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={handleCreateCompany}
                  disabled={addLoading}
                  className="w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors group cursor-pointer disabled:cursor-not-allowed"
                >
                  <div className="w-8 h-8 bg-gradient-to-r from-primary to-primary/80 rounded-lg flex items-center justify-center">
                    {addLoading ? (
                      <Spinner size="md" variant="white" />
                    ) : (
                      <Plus className="h-4 w-4 text-primary-foreground" />
                    )}
                  </div>
                  <div>
                    <div className="font-medium text-slate-800 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400">
                      Create "{searchTerm.trim()}"
                    </div>
                    <div className="text-sm text-slate-500 dark:text-slate-400">Add new carrier</div>
                  </div>
                </button>
              </div>
            )}

            {/* Exact Match Found */}
            {exactMatch && (
              <div className="border-t border-slate-200 dark:border-slate-700 p-2">
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSelectCompany(exactMatch)}
                  className="w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors group cursor-pointer"
                >
                  <div className="w-8 h-8 bg-gradient-to-r from-success to-success/80 rounded-lg flex items-center justify-center">
                    <Check className="h-4 w-4 text-success-foreground" />
                  </div>
                  <div>
                    <div className="font-medium text-slate-800 dark:text-slate-200 group-hover:text-green-600 dark:group-hover:text-green-400">
                      Select "{exactMatch.name}"
                    </div>
                    <div className="text-sm text-slate-500 dark:text-slate-400">Existing carrier</div>
                  </div>
                </button>
              </div>
            )}

            {/* No Results */}
            {searchTerm.trim() && filteredCompanies.length === 0 && !exactMatch && (
              <div className="p-4">
                <div className="text-center text-slate-500 dark:text-slate-400">
                  <Building2 className="h-8 w-8 mx-auto mb-2 text-slate-400 dark:text-slate-500" />
                  <p>No carriers found</p>
                  <p className="text-sm">Type to create a new one</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
