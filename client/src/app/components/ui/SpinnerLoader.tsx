'use client'
import React, { useEffect } from 'react'
import Spinner from './Spinner'

interface SpinnerLoaderProps {
  isVisible: boolean
  onCancel?: () => void
  duration?: number // Duration in milliseconds
}

export default function SpinnerLoader({ 
  isVisible, 
  onCancel, 
  duration = 1500 // Default 1.5 seconds
}: SpinnerLoaderProps) {
  
  // Auto-close after duration
  useEffect(() => {
    if (!isVisible) return

    const timer = setTimeout(() => {
      if (onCancel) {
        onCancel()
      }
    }, duration)

    return () => clearTimeout(timer)
  }, [isVisible, duration, onCancel])

  if (!isVisible) return null

  return (
    <div className="fixed inset-0 bg-black/30 dark:bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
      {/* Simple Spinner - No background panel */}
      <div className="w-16 h-16">
        <Spinner size="xl" className="w-16 h-16 border-4" />
      </div>
    </div>
  )
}
