"use client";

import { useState, useEffect, useRef } from 'react';
import { useEnvironment } from '@/context/EnvironmentContext';
import { Plus, ChevronDown, Layers, Settings, Trash2, RefreshCw, X } from 'lucide-react';

interface EnvironmentSelectorProps {
  collapsed: boolean;
}

export default function EnvironmentSelector({ collapsed }: EnvironmentSelectorProps) {
  const { 
    environments, 
    activeEnvironment, 
    setActiveEnvironment, 
    createEnvironment,
    deleteEnvironment,
    resetEnvironment,
    loading
  } = useEnvironment();

  const [showDropdown, setShowDropdown] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showManageModal, setShowManageModal] = useState(false);
  const [newEnvironmentName, setNewEnvironmentName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCreateEnvironment = async () => {
    if (!newEnvironmentName.trim()) {
      setError('Environment name is required');
      return;
    }

    setCreating(true);
    setError('');
    try {
      const newEnv = await createEnvironment(newEnvironmentName.trim());
      setActiveEnvironment(newEnv);
      setShowCreateModal(false);
      setNewEnvironmentName('');
    } catch (err: any) {
      setError(err.message || 'Failed to create environment');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteEnvironment = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"? This will permanently delete all uploads, commissions, and data in this environment.`)) {
      return;
    }

    try {
      await deleteEnvironment(id);
      setShowManageModal(false);
    } catch (err: any) {
      alert(err.message || 'Failed to delete environment');
    }
  };

  const handleResetEnvironment = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to reset "${name}"? This will delete all data but keep the environment for re-use.`)) {
      return;
    }

    try {
      const result = await resetEnvironment(id);
      alert(`Environment reset successfully. Deleted: ${result.deleted_counts.uploads} uploads, ${result.deleted_counts.commissions} commissions.`);
      setShowManageModal(false);
    } catch (err: any) {
      alert(err.message || 'Failed to reset environment');
    }
  };

  if (loading) {
    return (
      <div className="px-3 py-2">
        <div className="h-10 bg-slate-200 dark:bg-slate-700 rounded-lg animate-pulse"></div>
      </div>
    );
  }

  return (
    <>
      <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-700" ref={dropdownRef}>
        <div className="relative">
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors group"
          >
            <div className="w-7 h-7 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm">
              <Layers size={14} className="text-white" />
            </div>
            <div className={`flex-1 text-left transition-all duration-300 min-w-0 ${
              collapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'
            }`}>
              <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Environment</div>
              <div className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">
                {activeEnvironment?.name || 'No Environment'}
              </div>
            </div>
            <ChevronDown 
              size={14} 
              className={`text-slate-400 transition-all duration-300 flex-shrink-0 ${
                collapsed ? 'opacity-0 w-0' : 'opacity-100'
              } ${showDropdown ? 'rotate-180' : ''}`}
            />
          </button>

          {/* Dropdown Menu */}
          {showDropdown && !collapsed && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 z-50 max-h-80 overflow-y-auto">
              <div className="p-2">
                <div className="text-xs text-slate-500 dark:text-slate-400 px-3 py-2 font-semibold">
                  YOUR ENVIRONMENTS
                </div>
                {environments.map((env) => (
                  <button
                    key={env.id}
                    onClick={() => {
                      setActiveEnvironment(env);
                      setShowDropdown(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-md transition-colors ${
                      activeEnvironment?.id === env.id
                        ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                        : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Layers size={14} />
                      <span className="text-sm font-medium truncate">{env.name}</span>
                      {activeEnvironment?.id === env.id && (
                        <span className="ml-auto text-xs bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded">Active</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>

              <div className="border-t border-slate-200 dark:border-slate-700 p-2">
                <button
                  onClick={() => {
                    setShowCreateModal(true);
                    setShowDropdown(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-md transition-colors"
                >
                  <Plus size={16} />
                  Create New Environment
                </button>
                {environments.length > 0 && (
                  <button
                    onClick={() => {
                      setShowManageModal(true);
                      setShowDropdown(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md transition-colors mt-1"
                  >
                    <Settings size={16} />
                    Manage Environments
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create Environment Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-md w-full mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Create Environment</h3>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setError('');
                  setNewEnvironmentName('');
                }}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X size={20} />
              </button>
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              Create your own private environments to organize uploads and data for different carriers, states, or projects. Your environments are only visible to you.
            </p>

            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Environment Name
              </label>
              <input
                type="text"
                value={newEnvironmentName}
                onChange={(e) => {
                  setNewEnvironmentName(e.target.value);
                  setError('');
                }}
                placeholder="e.g., California Carriers, Q4 2024, etc."
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
                autoFocus
              />
              {error && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setError('');
                  setNewEnvironmentName('');
                }}
                className="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                disabled={creating}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateEnvironment}
                disabled={creating}
                className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manage Environments Modal */}
      {showManageModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-2xl w-full mx-4 p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Manage Your Environments</h3>
              <button
                onClick={() => setShowManageModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-3">
              {environments.map((env) => (
                <div
                  key={env.id}
                  className="flex items-center justify-between p-4 border border-slate-200 dark:border-slate-700 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg flex items-center justify-center">
                      <Layers size={18} className="text-white" />
                    </div>
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-white">{env.name}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        Created {new Date(env.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleResetEnvironment(env.id, env.name)}
                      className="p-2 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/30 rounded-lg transition-colors"
                      title="Reset environment (delete all data)"
                    >
                      <RefreshCw size={16} />
                    </button>
                    <button
                      onClick={() => handleDeleteEnvironment(env.id, env.name)}
                      className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                      title="Delete environment"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

