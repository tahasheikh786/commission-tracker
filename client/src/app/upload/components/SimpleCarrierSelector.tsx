'use client'

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Plus, Building2, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import axios from 'axios';

interface Company {
  id: string;
  name: string;
}

interface SimpleCarrierSelectorProps {
  value: string | null;
  onChange: (company: { id: string; name: string } | null) => void;
  placeholder?: string;
}

export default function SimpleCarrierSelector({
  value,
  onChange,
  placeholder = "Search for a carrier..."
}: SimpleCarrierSelectorProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [filteredCompanies, setFilteredCompanies] = useState<Company[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch companies on mount
  useEffect(() => {
    fetchCompanies();
  }, []);

  // Set selected company when value changes
  useEffect(() => {
    if (value && companies.length > 0) {
      const company = companies.find(c => c.id === value);
      if (company) {
        setSelectedCompany(company);
        setSearchTerm(company.name);
      }
    } else {
      setSelectedCompany(null);
      setSearchTerm('');
    }
  }, [value, companies]);

  // Filter companies based on search term
  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredCompanies(companies);
    } else {
      const filtered = companies.filter(company =>
        company.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredCompanies(filtered);
    }
  }, [searchTerm, companies]);

  const fetchCompanies = async () => {
    try {
      setIsLoading(true);
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/companies/`, {
        withCredentials: true  // CRITICAL FIX: Ensure cookies are sent
      });
      setCompanies(response.data);
    } catch (error) {
      console.error('Error fetching companies:', error);
      toast.error('Failed to load companies');
    } finally {
      setIsLoading(false);
    }
  };

  const createCompany = async (name: string) => {
    try {
      setIsCreating(true);
      const response = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/companies/`, {
        name: name.trim()
      }, {
        withCredentials: true  // CRITICAL FIX: Ensure cookies are sent
      });

      const newCompany = response.data;
      setCompanies(prev => [...prev, newCompany]);
      setSelectedCompany(newCompany);
      setSearchTerm(newCompany.name);
      onChange(newCompany);
      setIsOpen(false);
      toast.success(`Created and selected "${newCompany.name}"`);
    } catch (error: any) {
      console.error('Error creating company:', error);
      toast.error(error.response?.data?.detail || 'Failed to create company');
    } finally {
      setIsCreating(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchTerm(value);
    setIsOpen(true);
    
    // Clear selection if search term doesn't match selected company
    if (selectedCompany && !selectedCompany.name.toLowerCase().includes(value.toLowerCase())) {
      setSelectedCompany(null);
      onChange(null);
    }
  };

  const handleCompanySelect = (company: Company) => {
    setSelectedCompany(company);
    setSearchTerm(company.name);
    onChange(company);
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && searchTerm.trim() && !selectedCompany) {
      e.preventDefault();
      createCompany(searchTerm);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const handleInputFocus = () => {
    setIsOpen(true);
  };

  const handleInputBlur = () => {
    // Delay closing to allow for clicks on dropdown items
    setTimeout(() => {
      setIsOpen(false);
    }, 150);
  };

  const showCreateOption = searchTerm.trim() && 
    !filteredCompanies.some(c => c.name.toLowerCase() === searchTerm.toLowerCase()) &&
    !selectedCompany;

  return (
    <div className="relative w-full">
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-gray-400" />
        </div>
        <input
          ref={inputRef}
          type="text"
          value={searchTerm}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-white shadow-sm hover:shadow-md focus:shadow-lg"
        />
        {selectedCompany && (
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
            <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center">
              <Check className="w-4 h-4 text-green-600" />
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={dropdownRef}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="absolute z-50 w-full mt-2 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden"
            style={{ 
              maxHeight: '400px',
              minHeight: 'auto',
              top: '100%',
              left: 0,
              right: 0
            }}
          >
            {isLoading ? (
              <div className="p-4 text-center text-gray-500">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                Loading carriers...
              </div>
            ) : filteredCompanies.length > 0 ? (
              <div className="py-1 max-h-[380px] overflow-y-auto">
                {filteredCompanies.map((company) => (
                  <motion.button
                    key={company.id}
                    onClick={() => handleCompanySelect(company)}
                    className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors duration-150 flex items-center gap-3 min-h-[52px] border-b border-gray-100 last:border-b-0"
                    whileHover={{ backgroundColor: '#f9fafb' }}
                  >
                    <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Building2 className="w-4 h-4 text-white" />
                    </div>
                    <span className="text-gray-900 font-medium flex-1 text-left leading-tight py-1">{company.name}</span>
                    {selectedCompany?.id === company.id && (
                      <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                    )}
                  </motion.button>
                ))}
              </div>
            ) : (
              <div className="p-4 text-center text-gray-500">
                No carriers found
              </div>
            )}

            {showCreateOption && (
              <motion.button
                onClick={() => createCompany(searchTerm)}
                disabled={isCreating}
                className="w-full px-4 py-3 text-left hover:bg-blue-50 transition-colors duration-150 flex items-center gap-3 border-t border-gray-100 min-h-[52px]"
                whileHover={{ backgroundColor: '#eff6ff' }}
                whileTap={{ scale: 0.98 }}
              >
                <div className="w-8 h-8 bg-gradient-to-r from-green-500 to-emerald-600 rounded-lg flex items-center justify-center flex-shrink-0">
                  {isCreating ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <Plus className="w-4 h-4 text-white" />
                  )}
                </div>
                <span className="text-blue-600 font-medium flex-1 text-left leading-tight py-1">
                  {isCreating ? 'Creating...' : `Create "${searchTerm}"`}
                </span>
              </motion.button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
