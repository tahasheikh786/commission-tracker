'use client'
import { useState, useEffect, useCallback } from 'react'
import { 
  Clock, 
  FileText, 
  Play, 
  Trash2, 
  AlertCircle, 
  CheckCircle, 
  ArrowRight,
  Calendar,
} from 'lucide-react'
import { toast } from 'react-hot-toast'

interface PendingFile {
  id: string
  company_id: string
  file_name: string
  uploaded_at: string
  current_step: string
  last_updated: string
  progress_summary: string
}

interface PendingFilesProps {
  companyId: string
  onResumeFile: (fileId: string) => void
  onDeleteFile?: (fileId: string) => void
  className?: string
}

const stepIcons = {
  upload: <FileText className="w-4 h-4" />,
  table_editor: <FileText className="w-4 h-4" />,
  field_mapper: <FileText className="w-4 h-4" />,
  dashboard: <FileText className="w-4 h-4" />,
  completed: <CheckCircle className="w-4 h-4" />
}

const stepColors = {
  upload: 'bg-blue-100 text-blue-800',
  table_editor: 'bg-yellow-100 text-yellow-800',
  field_mapper: 'bg-purple-100 text-purple-800',
  dashboard: 'bg-green-100 text-green-800',
  completed: 'bg-gray-100 text-gray-800'
}

const stepLabels = {
  upload: 'Upload',
  table_editor: 'Table Editor',
  field_mapper: 'Field Mapper',
  dashboard: 'Dashboard',
  completed: 'Completed'
}

export default function PendingFiles({ 
  companyId, 
  onResumeFile, 
  onDeleteFile,
  className = "" 
}: PendingFilesProps) {
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchPendingFiles = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/pending/files/${companyId}`)
      
      if (!response.ok) {
        throw new Error('Failed to fetch pending files')
      }
      
      const data = await response.json()
      
      if (data.success) {
        setPendingFiles(data.pending_files || [])
      } else {
        throw new Error(data.message || 'Failed to fetch pending files')
      }
    } catch (err) {
      console.error('Error fetching pending files:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch pending files')
      toast.error('Failed to load pending files')
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => {
    fetchPendingFiles()
  }, [fetchPendingFiles])

  const handleDeleteFile = async (fileId: string) => {
    if (!onDeleteFile) return
    
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/pending/delete/${fileId}`, {
        method: 'DELETE'
      })
      
      if (!response.ok) {
        throw new Error('Failed to delete pending file')
      }
      
      const data = await response.json()
      
      if (data.success) {
        setPendingFiles(prev => prev.filter(file => file.id !== fileId))
        onDeleteFile(fileId)
        toast.success('Pending file deleted successfully')
      } else {
        throw new Error(data.message || 'Failed to delete pending file')
      }
    } catch (err) {
      console.error('Error deleting pending file:', err)
      toast.error('Failed to delete pending file')
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInMs = now.getTime() - date.getTime()
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60))
    const diffInDays = Math.floor(diffInHours / 24)
    
    if (diffInDays > 0) {
      return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`
    } else if (diffInHours > 0) {
      return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`
    } else {
      const diffInMinutes = Math.floor(diffInMs / (1000 * 60))
      return `${diffInMinutes} minute${diffInMinutes > 1 ? 's' : ''} ago`
    }
  }

  if (loading) {
    return (
      <div className={`bg-white rounded-lg border border-gray-200 p-6 ${className}`}>
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">Loading pending files...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={`bg-white rounded-lg border border-gray-200 p-6 ${className}`}>
        <div className="flex items-center justify-center py-8 text-red-600">
          <AlertCircle className="w-6 h-6 mr-2" />
          <span>{error}</span>
        </div>
      </div>
    )
  }

  if (pendingFiles.length === 0) {
    return (
      <div className={`bg-white rounded-lg border border-gray-200 p-6 ${className}`}>
        <div className="text-center py-8">
          <Clock className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Pending Files</h3>
          <p className="text-gray-600">All your files have been processed or you haven&apos;t started any uploads yet.</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`bg-white rounded-lg border border-gray-200 ${className}`}>
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Clock className="w-5 h-5 text-blue-600 mr-2" />
            <h2 className="text-lg font-semibold text-gray-900">Pending Files</h2>
            <span className="ml-2 bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
              {pendingFiles.length}
            </span>
          </div>
          <button
            onClick={fetchPendingFiles}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            Refresh
          </button>
        </div>
      </div>
      
      <div className="divide-y divide-gray-200">
        {pendingFiles.map((file) => (
          <div key={file.id} className="p-6 hover:bg-gray-50 transition-colors">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center mb-2">
                  <FileText className="w-5 h-5 text-gray-400 mr-2 flex-shrink-0" />
                  <h3 className="text-sm font-medium text-gray-900 truncate">
                    {file.file_name}
                  </h3>
                </div>
                
                <div className="flex items-center mb-3">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${stepColors[file.current_step as keyof typeof stepColors]}`}>
                    {stepIcons[file.current_step as keyof typeof stepIcons]}
                    <span className="ml-1">{stepLabels[file.current_step as keyof typeof stepLabels]}</span>
                  </span>
                  <span className="ml-3 text-sm text-gray-500">
                    {file.progress_summary}
                  </span>
                </div>
                
                <div className="flex items-center text-xs text-gray-500 space-x-4">
                  <div className="flex items-center">
                    <Calendar className="w-3 h-3 mr-1" />
                    <span>Uploaded {formatDate(file.uploaded_at)}</span>
                  </div>
                  <div className="flex items-center">
                    <Clock className="w-3 h-3 mr-1" />
                    <span>Updated {getTimeAgo(file.last_updated)}</span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center space-x-2 ml-4">
                <button
                  onClick={() => onResumeFile(file.id)}
                  className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                >
                  <Play className="w-4 h-4 mr-1" />
                  Resume
                </button>
                
                {onDeleteFile && (
                  <button
                    onClick={() => handleDeleteFile(file.id)}
                    className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      
      {pendingFiles.length > 0 && (
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
          <div className="flex items-center justify-between text-sm text-gray-600">
            <span>{pendingFiles.length} pending file{pendingFiles.length > 1 ? 's' : ''}</span>
            <button
              onClick={() => onResumeFile(pendingFiles[0].id)}
              className="inline-flex items-center text-blue-600 hover:text-blue-800 font-medium"
            >
              Resume Latest
              <ArrowRight className="w-4 h-4 ml-1" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
} 