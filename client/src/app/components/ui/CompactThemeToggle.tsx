'use client'

import { Moon, Sun, Monitor } from 'lucide-react'
import { useTheme } from '@/context/ThemeContext'
import { useState, useEffect } from 'react'

export function CompactThemeToggle() {
  const { theme, setTheme, actualTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div className="w-10 h-10 rounded-lg loading-skeleton-shimmer" />
    )
  }

  const getIcon = () => {
    if (theme === 'system') {
      return <Monitor className="h-4 w-4" />
    }
    return actualTheme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />
  }

  const getNextTheme = () => {
    if (theme === 'light') return 'dark'
    if (theme === 'dark') return 'system'
    return 'light'
  }

  const handleClick = () => {
    setTheme(getNextTheme())
  }

  return (
    <button
      onClick={handleClick}
      className="
        flex items-center justify-center w-10 h-10 rounded-lg
        bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600
        text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-600
        transition-all duration-200 hover:scale-105 focus:outline-none
        shadow-sm hover:shadow-md cursor-pointer
      "
      aria-label={`Switch to ${getNextTheme()} theme`}
      title={`Current: ${theme === 'system' ? 'System' : actualTheme === 'dark' ? 'Dark' : 'Light'} - Click to switch`}
    >
      {getIcon()}
    </button>
  )
}
