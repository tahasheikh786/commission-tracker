import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'react-hot-toast'

interface ProgressData {
  [key: string]: any
}

interface UseProgressTrackingProps {
  uploadId: string
  currentStep: string
  autoSaveInterval?: number // in milliseconds
  onProgressSaved?: (step: string, data: any) => void
  onProgressLoad?: (step: string, data: any) => void
}

export function useProgressTracking({
  uploadId,
  currentStep,
  autoSaveInterval = 30000, // 30 seconds default
  onProgressSaved,
  onProgressLoad
}: UseProgressTrackingProps) {
  const [isSaving, setIsSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const sessionId = useRef<string>(`session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`)

  // Save progress to backend
  const saveProgress = useCallback(async (step: string, data: ProgressData) => {
    if (!uploadId) return false

    try {
      setIsSaving(true)
      
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/pending/save-progress/${uploadId}?step=${encodeURIComponent(step)}&session_id=${encodeURIComponent(sessionId.current)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data
        })
      })

      if (!response.ok) {
        throw new Error('Failed to save progress')
      }

      const result = await response.json()
      
      if (result.success) {
        setLastSaved(new Date())
        setHasUnsavedChanges(false)
        onProgressSaved?.(step, data)
        return true
      } else {
        throw new Error(result.message || 'Failed to save progress')
      }
    } catch (error) {
      console.error('Error saving progress:', error)
      toast.error('Failed to save progress')
      return false
    } finally {
      setIsSaving(false)
    }
  }, [uploadId, onProgressSaved])

  // Auto-save progress
  const autoSaveProgress = useCallback(async (step: string, data: ProgressData) => {
    if (!uploadId) return false

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/pending/auto-save/${uploadId}?step=${encodeURIComponent(step)}&session_id=${encodeURIComponent(sessionId.current)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data
        })
      })

      if (!response.ok) {
        throw new Error('Failed to auto-save progress')
      }

      const result = await response.json()
      
      if (result.success) {
        setLastSaved(new Date())
        setHasUnsavedChanges(false)
        return true
      } else {
        throw new Error(result.message || 'Failed to auto-save progress')
      }
    } catch (error) {
      console.error('Error auto-saving progress:', error)
      return false
    }
  }, [uploadId])

  // Load progress from backend
  const loadProgress = useCallback(async (step: string) => {
    if (!uploadId) return null

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/pending/progress/${uploadId}/${step}`)
      
      if (!response.ok) {
        throw new Error('Failed to load progress')
      }

      const result = await response.json()
      
      if (result.success && result.progress_data) {
        onProgressLoad?.(step, result.progress_data)
        return result.progress_data
      }
      
      return null
    } catch (error) {
      console.error('Error loading progress:', error)
      return null
    }
  }, [uploadId, onProgressLoad])

  // Resume session
  const resumeSession = useCallback(async () => {
    if (!uploadId) return null

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/pending/resume/${uploadId}`)
      
      if (!response.ok) {
        throw new Error('Failed to resume session')
      }

      const result = await response.json()
      
      if (result.success && result.session_data) {
        return result.session_data
      }
      
      return null
    } catch (error) {
      console.error('Error resuming session:', error)
      return null
    }
  }, [uploadId])

  // Schedule auto-save
  const scheduleAutoSave = useCallback((step: string, data: ProgressData) => {
    // Clear existing timeout
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current)
    }

    // Set new timeout
    autoSaveTimeoutRef.current = setTimeout(() => {
      autoSaveProgress(step, data)
    }, autoSaveInterval)
  }, [autoSaveProgress, autoSaveInterval])

  // Mark changes as unsaved
  const markUnsaved = useCallback(() => {
    setHasUnsavedChanges(true)
  }, [])

  // Clear auto-save timeout
  const clearAutoSave = useCallback(() => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current)
      autoSaveTimeoutRef.current = null
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearAutoSave()
    }
  }, [clearAutoSave])

  // Auto-save when component unmounts or page unloads
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (hasUnsavedChanges) {
        // Try to save one last time
        autoSaveProgress(currentStep, {})
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      handleBeforeUnload()
    }
  }, [hasUnsavedChanges, currentStep, autoSaveProgress])

  return {
    saveProgress,
    autoSaveProgress,
    loadProgress,
    resumeSession,
    scheduleAutoSave,
    markUnsaved,
    clearAutoSave,
    isSaving,
    lastSaved,
    hasUnsavedChanges,
    sessionId: sessionId.current
  }
}

// Hook for tracking specific step progress
export function useStepProgress(uploadId: string, step: string) {
  const [stepData, setStepData] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const loadStepProgress = useCallback(async () => {
    if (!uploadId) return

    setLoading(true)
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/pending/progress/${uploadId}/${step}`)
      
      if (response.ok) {
        const result = await response.json()
        if (result.success && result.progress_data) {
          setStepData(result.progress_data)
        }
      }
    } catch (error) {
      console.error(`Error loading ${step} progress:`, error)
    } finally {
      setLoading(false)
    }
  }, [uploadId, step])

  const saveStepProgress = useCallback(async (data: any) => {
    if (!uploadId) return false

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/pending/save-progress/${uploadId}?step=${encodeURIComponent(step)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data
        })
      })

      if (response.ok) {
        const result = await response.json()
        if (result.success) {
          setStepData(data)
          return true
        }
      }
      return false
    } catch (error) {
      console.error(`Error saving ${step} progress:`, error)
      return false
    }
  }, [uploadId, step])

  return {
    stepData,
    loading,
    loadStepProgress,
    saveStepProgress
  }
} 