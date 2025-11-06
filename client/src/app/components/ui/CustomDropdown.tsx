/**
 * Premium Custom Dropdown Component
 * 
 * Fully styled dropdown with search, keyboard navigation, and animations
 */

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, Check } from 'lucide-react';

interface DropdownOption {
  id: string;
  label: string;
  description?: string;
  confidence?: number;
}

interface CustomDropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: DropdownOption[];
  placeholder?: string;
  searchable?: boolean;
  disabled?: boolean;
  className?: string;
  label?: string;
  error?: string;
  showConfidence?: boolean;
}

export default function CustomDropdown({
  value,
  onChange,
  options,
  placeholder = 'Select an option...',
  searchable = false,
  disabled = false,
  className = '',
  label,
  error,
  showConfidence = false
}: CustomDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0, openUpward: false });
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Update dropdown position when opened or on scroll/resize
  useEffect(() => {
    const updatePosition = () => {
      if (!triggerRef.current) return;
      
      const rect = triggerRef.current.getBoundingClientRect();
      const dropdownHeight = 280; // max-h-[280px]
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      const spaceBelow = viewportHeight - rect.bottom;
      const spaceAbove = rect.top;
      
      // Decide whether to open upward or downward
      const shouldOpenUpward = spaceBelow < dropdownHeight && spaceAbove > spaceBelow;
      
      // Calculate vertical position
      let topPosition: number;
      if (shouldOpenUpward) {
        // Open upward - position above the trigger
        topPosition = Math.max(10, rect.top - dropdownHeight - 4);
      } else {
        // Open downward - position below the trigger
        topPosition = rect.bottom + 4;
        // Make sure it doesn't go off bottom of screen
        if (topPosition + dropdownHeight > viewportHeight - 10) {
          topPosition = Math.max(10, viewportHeight - dropdownHeight - 10);
        }
      }
      
      // Calculate horizontal position - align with trigger button
      let leftPosition = rect.left;
      const dropdownWidth = rect.width;
      
      // Ensure dropdown doesn't go off-screen horizontally
      if (leftPosition + dropdownWidth > viewportWidth - 10) {
        leftPosition = Math.max(10, viewportWidth - dropdownWidth - 10);
      }
      if (leftPosition < 10) {
        leftPosition = 10;
      }
      
      const position = {
        top: topPosition,
        left: leftPosition,
        width: rect.width,
        openUpward: shouldOpenUpward
      };
      
      
      
      setDropdownPosition(position);
    };

    if (isOpen) {
      // Update immediately
      updatePosition();
      // Update again after a frame to ensure DOM is ready
      requestAnimationFrame(() => {
        requestAnimationFrame(updatePosition);
      });
      
      // Listen for scroll and resize
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
    }

    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isOpen]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current && 
        !menuRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      // Focus search input when dropdown opens
      if (searchable && searchInputRef.current) {
        setTimeout(() => searchInputRef.current?.focus(), 50);
      }
    }

    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, searchable]);

  // Filter options based on search
  const filteredOptions = searchable && searchQuery
    ? options.filter(opt => 
        opt.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        opt.description?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : options;

  // Get selected option
  const selectedOption = options.find(opt => opt.id === value);
  
 

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev => 
          prev < filteredOptions.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => prev > 0 ? prev - 1 : prev);
        break;
      case 'Enter':
        e.preventDefault();
        if (filteredOptions[highlightedIndex]) {
          onChange(filteredOptions[highlightedIndex].id);
          setIsOpen(false);
          setSearchQuery('');
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setSearchQuery('');
        break;
    }
  };

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {label && (
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
          {label}
        </label>
      )}
      
      {/* Dropdown Trigger */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className={`
          w-full px-3.5 py-2.5 
          bg-white dark:bg-slate-800 
          border rounded-lg
          text-left text-sm
          transition-all duration-200
          flex items-center justify-between gap-2
          ${disabled 
            ? 'opacity-50 cursor-not-allowed bg-slate-50 dark:bg-slate-900' 
            : 'cursor-pointer hover:border-blue-400 dark:hover:border-blue-500'
          }
          ${isOpen 
            ? 'border-blue-500 dark:border-blue-400 ring-2 ring-blue-100 dark:ring-blue-900/30' 
            : 'border-slate-300 dark:border-slate-600'
          }
          ${error ? 'border-red-400 dark:border-red-500' : ''}
        `}
      >
        <span className={`truncate ${!selectedOption ? 'text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-white'}`}>
          {selectedOption?.label || placeholder}
        </span>
        <ChevronDown 
          className={`w-4 h-4 text-slate-400 transition-transform duration-200 flex-shrink-0 ${
            isOpen ? (dropdownPosition.openUpward ? 'rotate-0' : 'rotate-180') : ''
          }`} 
        />
      </button>

      {error && (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}

      {/* Dropdown Menu - Rendered via Portal to avoid z-index/overflow issues */}
      {isOpen && createPortal(
        <div 
          ref={menuRef}
          className={`
            fixed
            bg-white dark:bg-slate-800
            border border-slate-200 dark:border-slate-700
            rounded-lg shadow-2xl
            max-h-[280px] overflow-hidden
            ${dropdownPosition.openUpward ? 'animate-fadeInScaleUp' : 'animate-fadeInScale'}
          `}
          style={{ 
            top: `${dropdownPosition.top}px`,
            left: `${dropdownPosition.left}px`,
            width: `${dropdownPosition.width}px`,
            zIndex: 99999,
            transformOrigin: dropdownPosition.openUpward ? 'bottom' : 'top'
          }}
        >
          {/* Search Input */}
          {searchable && (
            <div className="p-2 border-b border-slate-200 dark:border-slate-700">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setHighlightedIndex(0);
                  }}
                  placeholder="Search..."
                  className="
                    w-full pl-9 pr-3 py-2
                    bg-slate-50 dark:bg-slate-900
                    border border-slate-200 dark:border-slate-700
                    rounded-md text-sm
                    focus:outline-none focus:ring-2 focus:ring-blue-500
                    text-slate-900 dark:text-white
                    placeholder:text-slate-400 dark:placeholder:text-slate-500
                  "
                />
              </div>
            </div>
          )}

          {/* Options List */}
          <div className="overflow-y-auto max-h-[220px] custom-scrollbar">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                No options found
              </div>
            ) : (
              filteredOptions.map((option, index) => {
                const isSelected = option.id === value;
                const isHighlighted = index === highlightedIndex;
                
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      onChange(option.id);
                      setIsOpen(false);
                      setSearchQuery('');
                    }}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={`
                      w-full px-3 py-2.5 text-left text-sm
                      flex items-center justify-between gap-2
                      transition-colors duration-150
                      ${isSelected 
                        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300' 
                        : isHighlighted
                        ? 'bg-slate-100 dark:bg-slate-700/50'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-700/30'
                      }
                      ${index === 0 ? '' : 'border-t border-slate-100 dark:border-slate-700/50'}
                    `}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-slate-900 dark:text-white truncate">
                        {option.label}
                      </div>
                      {option.description && (
                        <div className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                          {option.description}
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {showConfidence && option.confidence !== undefined && (
                        <span className={`
                          text-xs font-semibold px-1.5 py-0.5 rounded
                          ${option.confidence >= 0.8 
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                            : option.confidence >= 0.5
                            ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                            : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                          }
                        `}>
                          {(option.confidence * 100).toFixed(0)}%
                        </span>
                      )}
                      {isSelected && (
                        <Check className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

