import React from 'react';

interface LoaderProps {
  message?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'spinner' | 'dots' | 'pulse' | 'bars';
  color?: 'primary' | 'secondary' | 'success' | 'warning' | 'destructive';
}

export default function Loader({ 
  message = 'Loading...', 
  className = '', 
  size = 'md',
  variant = 'spinner',
  color = 'primary'
}: LoaderProps) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12'
  };

  const colorClasses = {
    primary: 'text-primary',
    secondary: 'text-secondary',
    success: 'text-success',
    warning: 'text-warning',
    destructive: 'text-destructive'
  };

  const renderSpinner = () => (
    <svg className={`animate-spin ${sizeClasses[size]} ${colorClasses[color]} mb-3`} viewBox="0 0 24 24">
      <circle 
        className="opacity-25" 
        cx="12" 
        cy="12" 
        r="10" 
        stroke="currentColor" 
        strokeWidth="4" 
        fill="none" 
      />
      <path 
        className="opacity-75" 
        fill="currentColor" 
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" 
      />
    </svg>
  );

  const renderDots = () => (
    <div className={`flex space-x-1 mb-3 ${colorClasses[color]}`}>
      <div className={`${sizeClasses[size]} bg-current rounded-full animate-bounce`} style={{ animationDelay: '0ms' }}></div>
      <div className={`${sizeClasses[size]} bg-current rounded-full animate-bounce`} style={{ animationDelay: '150ms' }}></div>
      <div className={`${sizeClasses[size]} bg-current rounded-full animate-bounce`} style={{ animationDelay: '300ms' }}></div>
    </div>
  );

  const renderPulse = () => (
    <div className={`${sizeClasses[size]} ${colorClasses[color]} mb-3 animate-pulse bg-current rounded-full`}></div>
  );

  const renderBars = () => (
    <div className={`flex space-x-1 mb-3 ${colorClasses[color]}`}>
      <div className={`${sizeClasses[size === 'sm' ? 'sm' : 'md']} bg-current animate-pulse`} style={{ animationDelay: '0ms', width: '3px' }}></div>
      <div className={`${sizeClasses[size === 'sm' ? 'sm' : 'md']} bg-current animate-pulse`} style={{ animationDelay: '150ms', width: '3px' }}></div>
      <div className={`${sizeClasses[size === 'sm' ? 'sm' : 'md']} bg-current animate-pulse`} style={{ animationDelay: '300ms', width: '3px' }}></div>
      <div className={`${sizeClasses[size === 'sm' ? 'sm' : 'md']} bg-current animate-pulse`} style={{ animationDelay: '450ms', width: '3px' }}></div>
    </div>
  );

  const renderLoader = () => {
    switch (variant) {
      case 'dots':
        return renderDots();
      case 'pulse':
        return renderPulse();
      case 'bars':
        return renderBars();
      default:
        return renderSpinner();
    }
  };

  return (
    <div className={`flex flex-col items-center justify-center w-full py-12 ${className}`}>
      {renderLoader()}
      <span className={`${colorClasses[color]} font-semibold text-lg animate-pulse`}>
        {message}
      </span>
    </div>
  );
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