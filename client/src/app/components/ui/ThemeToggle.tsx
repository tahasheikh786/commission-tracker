'use client'

import { Moon, Sun, Monitor, ChevronDown } from 'lucide-react'
import { useTheme } from '@/context/ThemeContext'
import { useState, useEffect, useRef } from 'react'

export function ThemeToggle() {
  const { theme, setTheme, actualTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false)
      }
    }

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showDropdown])

  if (!mounted) {
    return (
      <div className="w-32 h-10 rounded-lg loading-skeleton-shimmer" />
    )
  }

  const getIcon = () => {
    if (theme === 'system') {
      return <Monitor className="h-4 w-4" />
    }
    return actualTheme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />
  }

  const getLabel = () => {
    if (theme === 'system') return 'System'
    return actualTheme === 'dark' ? 'Dark' : 'Light'
  }

  const themeOptions = [
    { value: 'light', label: 'Light', icon: Sun, description: 'Light mode' },
    { value: 'dark', label: 'Dark', icon: Moon, description: 'Dark mode' },
    { value: 'system', label: 'System', icon: Monitor, description: 'Follow system' }
  ]

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={(e) => {
          e.stopPropagation()
          setShowDropdown(!showDropdown)
        }}
        className="
          flex items-center gap-2 px-3 py-2 rounded-lg w-full
          bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700
          text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700
          transition-all duration-200 focus:outline-none focus:ring-2
          focus:ring-blue-500 focus:ring-offset-2
          shadow-sm hover:shadow-md cursor-pointer cursor-pointer
        "
        aria-label="Select theme"
        aria-expanded={showDropdown}
      >
        {getIcon()}
        <span className="text-sm font-medium">{getLabel()}</span>
        <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${showDropdown ? 'rotate-180' : ''}`} />
      </button>

      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-[60] animate-in fade-in-0 zoom-in-95 duration-200">
          <div className="p-1">
            {themeOptions.map((option) => {
              const Icon = option.icon
              const isSelected = theme === option.value
              
              return (
                <button
                  key={option.value}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setTheme(option.value as 'light' | 'dark' | 'system')
                    setShowDropdown(false)
                  }}
                  className={`
                    w-full flex items-center gap-3 px-3 py-2 text-left rounded-lg transition-all duration-200 cursor-pointer
                    ${isSelected 
                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' 
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }
                  `}
                >
                  <Icon className="h-4 w-4" />
                  <div className="flex-1">
                    <div className="font-medium text-sm">{option.label}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{option.description}</div>
                  </div>
                  {isSelected && (
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export function ThemeToggleWithLabel() {
  const { theme, setTheme, actualTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false)
      }
    }

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showDropdown])

  if (!mounted) {
    return (
      <div className="flex items-center space-x-3">
        <div className="w-32 h-10 rounded-lg loading-skeleton-shimmer" />
      </div>
    )
  }

  const getLabel = () => {
    if (theme === 'system') return 'System'
    return actualTheme === 'dark' ? 'Dark' : 'Light'
  }

  const getIcon = () => {
    if (theme === 'system') {
      return <Monitor className="h-4 w-4" />
    }
    return actualTheme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />
  }

  const themeOptions = [
    { value: 'light', label: 'Light', icon: Sun, description: 'Light mode' },
    { value: 'dark', label: 'Dark', icon: Moon, description: 'Dark mode' },
    { value: 'system', label: 'System', icon: Monitor, description: 'Follow system' }
  ]

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={(e) => {
          e.stopPropagation()
          setShowDropdown(!showDropdown)
        }}
        className="
          flex items-center gap-2 px-4 py-2 rounded-lg w-full
          bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700
          text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700
          transition-all duration-200 hover:scale-105 focus:outline-none focus:ring-2
          focus:ring-blue-500 focus:ring-offset-2
          shadow-sm hover:shadow-md cursor-pointer
        "
        aria-label="Select theme"
        aria-expanded={showDropdown}
      >
        {getIcon()}
        <span className="text-sm font-medium">{getLabel()}</span>
        <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${showDropdown ? 'rotate-180' : ''}`} />
      </button>

      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-[60] animate-in fade-in-0 zoom-in-95 duration-200">
          <div className="p-1">
            {themeOptions.map((option) => {
              const Icon = option.icon
              const isSelected = theme === option.value
              
              return (
                <button
                  key={option.value}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setTheme(option.value as 'light' | 'dark' | 'system')
                    setShowDropdown(false)
                  }}
                  className={`
                    w-full flex items-center gap-3 px-3 py-2 text-left rounded-lg transition-all duration-200 cursor-pointer
                    ${isSelected 
                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' 
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }
                  `}
                >
                  <Icon className="h-4 w-4" />
                  <div className="flex-1">
                    <div className="font-medium text-sm">{option.label}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{option.description}</div>
                  </div>
                  {isSelected && (
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
