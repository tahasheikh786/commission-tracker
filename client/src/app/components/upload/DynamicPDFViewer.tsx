'use client'

import { Suspense, Component, ReactNode } from 'react'
import dynamic from 'next/dynamic'

// Dynamically import PDFViewer with no SSR to prevent server-side rendering issues
const PDFViewer = dynamic(() => import('./PDFViewer'), {
  ssr: false,
  loading: () => <PDFViewerLoader />
})

interface DynamicPDFViewerProps {
  fileUrl: string
  isCollapsed: boolean
  onToggleCollapse: () => void
}

// Enhanced loading component
function PDFViewerLoader() {
  return (
    <div className="w-1/2 h-full bg-gray-50 border-r border-gray-200 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-lg text-gray-700 font-medium">Loading PDF Viewer...</p>
        <p className="text-sm text-gray-500 mt-2">Initializing PDF.js library</p>
      </div>
    </div>
  )
}

// Error boundary component for catching PDF rendering errors
interface ErrorBoundaryProps {
  children: ReactNode
  fallback: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

class PDFErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('PDF Viewer Error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback
    }

    return this.props.children
  }
}

// Error fallback component
function PDFViewerError({ error }: { error?: Error }) {
  return (
    <div className="w-1/2 h-full bg-gray-50 border-r border-gray-200 flex items-center justify-center">
      <div className="text-center text-red-600 max-w-md p-8">
        <div className="text-red-500 mb-4">
          <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <p className="text-red-600 mb-2 font-semibold text-lg">PDF Viewer Failed to Load</p>
        <p className="text-gray-600 text-sm mb-6">
          {error ? error.message : 'An unexpected error occurred while loading the PDF viewer.'}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
        >
          Reload Page
        </button>
      </div>
    </div>
  )
}

// Main wrapper component with error boundary and suspense
export default function DynamicPDFViewer(props: DynamicPDFViewerProps) {
  return (
    <PDFErrorBoundary fallback={<PDFViewerError />}>
      <Suspense fallback={<PDFViewerLoader />}>
        <PDFViewer {...props} />
      </Suspense>
    </PDFErrorBoundary>
  )
}
