import React from 'react';

interface LoaderProps {
  message?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'spinner' | 'dots' | 'pulse' | 'bars';
  color?: 'primary' | 'secondary' | 'success' | 'warning' | 'destructive';
}

export default function Loader({ 
  message = "Loading...", 
  className = '', 
  size = 'md',
  variant = 'spinner',
  color = 'primary'
}: LoaderProps) {
  console.log('🚀 Loader component rendered with message:', message)
  
  return (
    <div className={`flex items-center justify-center py-12 ${className}`}>
      <div className="flex items-center space-x-3">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
        <span className="text-gray-600">{message}</span>
      </div>
    </div>
  )
}

// Specialized loader components for different use cases
export function TableLoader({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center py-8 ${className}`}>
      <Loader 
        message="Loading data..." 
        size="md" 
        variant="dots" 
        color="primary" 
      />
    </div>
  );
}

export function CardLoader({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center py-6 ${className}`}>
      <Loader 
        message="Loading..." 
        size="sm" 
        variant="spinner" 
        color="primary" 
      />
    </div>
  );
}

export function ButtonLoader({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      <div className="animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent"></div>
      <span>Loading...</span>
    </div>
  );
}

export function SkeletonLoader({ className = '', lines = 3 }: { className?: string; lines?: number }) {
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div 
          key={i} 
          className="h-4 bg-muted rounded animate-pulse"
          style={{ animationDelay: `${i * 100}ms` }}
        ></div>
      ))}
    </div>
  );
} 