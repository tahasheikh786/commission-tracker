'use client'

import React from 'react'
import { cn } from '@/lib/utils'

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  variant?: 'default' | 'white' | 'muted'
}

const sizeClasses = {
  sm: 'w-3 h-3 border-1',
  md: 'w-4 h-4 border-2',
  lg: 'w-6 h-6 border-2',
  xl: 'w-8 h-8 border-3'
}

const variantClasses = {
  default: 'border-transparent border-t-blue-600 border-r-purple-600',
  white: 'border-transparent border-t-white border-r-white/80',
  muted: 'border-transparent border-t-muted-foreground border-r-muted-foreground/60'
}

export default function Spinner({ 
  size = 'md', 
  className = '',
  variant = 'default'
}: SpinnerProps) {
  return (
    <div 
      className={cn(
        'rounded-full animate-spin',
        sizeClasses[size],
        variantClasses[variant],
        className
      )}
    />
  )
}

// Export individual size components for convenience
export const SpinnerSm = (props: Omit<SpinnerProps, 'size'>) => <Spinner {...props} size="sm" />
export const SpinnerMd = (props: Omit<SpinnerProps, 'size'>) => <Spinner {...props} size="md" />
export const SpinnerLg = (props: Omit<SpinnerProps, 'size'>) => <Spinner {...props} size="lg" />
export const SpinnerXl = (props: Omit<SpinnerProps, 'size'>) => <Spinner {...props} size="xl" />
