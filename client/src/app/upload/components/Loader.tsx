import React from 'react';

export default function Loader({ message = 'Loading...', className = '' }: { message?: string; className?: string }) {
  return (
    <div className={`flex flex-col items-center justify-center w-full py-12 ${className}`}>
      <svg className="animate-spin h-10 w-10 text-blue-600 mb-3" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
      </svg>
      <span className="text-blue-700 font-semibold text-lg animate-pulse">{message}</span>
    </div>
  );
} 