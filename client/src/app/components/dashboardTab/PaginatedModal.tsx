'use client'
import React, { useState, useEffect, useMemo } from 'react';
import { X, Search, ArrowLeft, ArrowRight } from 'lucide-react';
import { getPaginationBounds } from '../../utils/formatters';

interface PaginatedModalProps<T> {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  icon: React.ReactNode;
  items: T[];
  searchPlaceholder: string;
  filterFunction: (item: T, query: string) => boolean;
  sortFunction?: (a: T, b: T) => number;
  renderItem: (item: T, index: number) => React.ReactNode;
  emptyMessage?: string;
  itemsPerPage?: number;
}

export function PaginatedModal<T>({
  isOpen,
  onClose,
  title,
  icon,
  items,
  searchPlaceholder,
  filterFunction,
  sortFunction,
  renderItem,
  emptyMessage = 'No items found',
  itemsPerPage = 10
}: PaginatedModalProps<T>) {
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  // Filter and sort items
  const filteredItems = useMemo(() => {
    const filtered = items.filter(item => filterFunction(item, searchQuery));
    return sortFunction ? filtered.sort(sortFunction) : filtered;
  }, [items, searchQuery, filterFunction, sortFunction]);

  // Pagination
  const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
  const paginatedItems = filteredItems.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Reset page when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  if (!isOpen) return null;

  const { start, end } = getPaginationBounds(currentPage, itemsPerPage, filteredItems.length);

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" 
      onClick={onClose}
    >
      <div 
        className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-3xl w-full mx-4 max-h-[80vh] overflow-hidden" 
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
              {icon}
              {title}
            </h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              <X size={20} className="text-slate-500 dark:text-slate-400" />
            </button>
          </div>
          
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 dark:text-slate-500" size={16} />
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-lg border border-slate-200 dark:border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
            />
          </div>
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(80vh-200px)]">
          {paginatedItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500 dark:text-slate-400">
              {icon}
              <p className="text-lg font-medium mt-4">{emptyMessage}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {paginatedItems.map((item, index) => renderItem(item, index))}
            </div>
          )}
        </div>

        {/* Modal Footer with Pagination */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/30">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Showing {start} - {end} of {filteredItems.length}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="p-2 rounded-lg border border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ArrowLeft size={16} className="text-slate-600 dark:text-slate-400" />
              </button>
              <span className="text-sm text-slate-600 dark:text-slate-400 px-3">
                Page {currentPage} of {totalPages || 1}
              </span>
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages || totalPages === 0}
                className="p-2 rounded-lg border border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ArrowRight size={16} className="text-slate-600 dark:text-slate-400" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

