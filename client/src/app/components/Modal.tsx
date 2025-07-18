'use client'
import React from 'react'

export default function Modal({ children, onClose }: { children: React.ReactNode, onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-30 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-2xl p-0 relative w-[96vw] h-[96vh] max-w-none max-h-none overflow-hidden flex flex-col">
        <button
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-800 z-10"
          onClick={onClose}
          aria-label="Close"
        >
          &times;
        </button>
        <div className="flex-1 min-h-0 min-w-0 flex flex-col">{children}</div>
      </div>
    </div>
  )
}
