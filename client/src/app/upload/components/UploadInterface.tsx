'use client'
import { useState } from 'react'
import { Sparkles, Clock, Building2, FileText, Calendar } from 'lucide-react'
import CompanySelect from './CompanySelect'
import AdvancedUploadZone from './AdvancedUploadZone'
import PendingFiles from '../../components/PendingFiles'

type Company = { id: string, name: string } | null

interface UploadInterfaceProps {
  company: Company
  setCompany: (company: Company) => void
  onUploadResult: (result: any) => void
  onReset: () => void
  onResumeFile?: (fileId: string, stepParam?: string | null) => void
  onDeleteFile?: (fileId: string) => void
  selectedStatementDate?: any // Add selected statement date prop
}

export default function UploadInterface({ 
  company, 
  setCompany, 
  onUploadResult, 
  onReset,
  onResumeFile,
  onDeleteFile,
  selectedStatementDate // Add selected statement date prop
}: UploadInterfaceProps) {
  const [showPendingFiles, setShowPendingFiles] = useState(false)

  return (
    <div className="w-full space-y-8">
      {/* Enhanced Header */}
      <div className="text-center space-y-4">
        <div className="flex items-center justify-center gap-3">
          <Sparkles className="text-sky-500" size={24} />
          <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-800 via-slate-700 to-slate-600 bg-clip-text text-transparent">
            Commission Statement Upload
          </h1>
          <Sparkles className="text-blue-500" size={24} />
        </div>
        <p className="text-lg text-slate-600 max-w-3xl mx-auto leading-relaxed">
          Upload and process commission statements with AI-powered extraction and quality assessment
        </p>
        
        {/* Date Display */}
        {selectedStatementDate && (
          <div className="flex items-center justify-center gap-2 bg-green-100 px-4 py-2 rounded-full border border-green-200 max-w-md mx-auto">
            <Calendar className="w-5 h-5 text-green-600" />
            <span className="text-sm text-green-700 font-medium">
              Statement Date: {selectedStatementDate.date}
            </span>
          </div>
        )}
      </div>

      <div className="bg-white/90 backdrop-blur-xl rounded-3xl border border-white/50 shadow-2xl p-8">
        {/* Enhanced Pending Files Toggle */}
        {company && (
          <div className="mb-8 flex justify-center">
            <button
              onClick={() => setShowPendingFiles(!showPendingFiles)}
              className="inline-flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-orange-500 to-amber-600 text-white rounded-2xl hover:shadow-lg transition-all duration-200 hover:scale-105 font-semibold"
            >
              <Clock className="w-5 h-5" />
              {showPendingFiles ? 'Hide' : 'Show'} Pending Files
            </button>
          </div>
        )}

        {/* Enhanced Pending Files Section */}
        {showPendingFiles && company && (
          <div className="mb-8 bg-gradient-to-r from-orange-50 to-amber-50 rounded-2xl p-6 border border-orange-200/50">
            <PendingFiles
              companyId={company.id}
              onResumeFile={onResumeFile || (() => {})}
              onDeleteFile={onDeleteFile || (() => {})}
            />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          {/* Enhanced Left Column - Carrier Selection */}
          <div className="space-y-6">
            <div className="bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 rounded-3xl p-8 border border-blue-200/50 shadow-lg">
              <h2 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg">
                  <Building2 className="text-white" size={20} />
                </div>
                <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
                  Select or Add Carrier
                </span>
              </h2>
              <CompanySelect value={company?.id} onChange={setCompany} />
            </div>
            
            <div className="bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 rounded-3xl p-8 border border-emerald-200/50 shadow-lg">
              <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center shadow-lg">
                  <FileText className="text-white" size={20} />
                </div>
                <span className="bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 bg-clip-text text-transparent">
                  Upload Requirements
                </span>
              </h3>
              <ul className="space-y-4 text-sm text-slate-600">
                <li className="flex items-center gap-3">
                  <div className="w-3 h-3 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full shadow-sm"></div>
                  <span className="font-medium">PDF commission statements only</span>
                </li>
                <li className="flex items-center gap-3">
                  <div className="w-3 h-3 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full shadow-sm"></div>
                  <span className="font-medium">Maximum file size: 10MB</span>
                </li>
                <li className="flex items-center gap-3">
                  <div className="w-3 h-3 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full shadow-sm"></div>
                  <span className="font-medium">Automatic quality assessment</span>
                </li>
                <li className="flex items-center gap-3">
                  <div className="w-3 h-3 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full shadow-sm"></div>
                  <span className="font-medium">AI-powered data extraction</span>
                </li>
              </ul>
            </div>
          </div>
          
          {/* Enhanced Right Column - Upload Zone */}
          <div className="flex flex-col h-full">
            <AdvancedUploadZone
              onParsed={onUploadResult}
              disabled={!company}
              companyId={company?.id || ''}
              selectedStatementDate={selectedStatementDate}
            />
          </div>
        </div>
        
        <div className="text-center mt-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100/80 rounded-xl text-slate-600 font-medium">
            <Sparkles className="text-sky-500" size={16} />
            AI-powered extraction with quality assessment and validation
          </div>
        </div>
      </div>
    </div>
  )
}
