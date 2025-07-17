'use client'
import React from 'react'

export default function Modal({ children, onClose }: { children: React.ReactNode, onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-30 flex items-center justify-center">
    <div className="bg-white rounded-2xl shadow-2xl p-4 relative w-full max-h-[90vh] overflow-auto">
      <button
        className="absolute top-3 right-3 text-gray-400 hover:text-gray-800"
        onClick={onClose}
        aria-label="Close"
      >
        &times;
      </button>
      {children}
    </div>
  </div>
  
  )
}
