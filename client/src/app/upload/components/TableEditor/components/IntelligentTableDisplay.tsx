import React from 'react'
import { CheckCircle, AlertTriangle, Info, Building2, Calendar, User, FileText } from 'lucide-react'

type IntelligentTableDisplayProps = {
  extractionResult: any
}

type DocumentMetadata = {
  carrier_name?: string
  carrier_confidence?: number
  carrier_evidence?: string
  statement_date?: string
  date_confidence?: number
  date_evidence?: string
  broker_company?: string
  document_type?: string
}

type ExtractionQuality = {
  metadata_completeness?: number
  table_completeness?: number
  business_logic_consistency?: number
  extraction_anomalies?: string[]
  overall_confidence?: number
  requires_human_review?: boolean
}

const IntelligentTableDisplay: React.FC<IntelligentTableDisplayProps> = ({ extractionResult }) => {
  // Safely extract properties with defaults
  const document_metadata = extractionResult?.document_metadata || {}
  const tables = extractionResult?.tables || []
  const extraction_quality = extractionResult?.extraction_quality || {}
  const extraction_intelligence = extractionResult?.extraction_intelligence

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-600 bg-green-50'
    if (confidence >= 0.6) return 'text-yellow-600 bg-yellow-50'
    return 'text-red-600 bg-red-50'
  }

  const getConfidenceIcon = (confidence: number) => {
    if (confidence >= 0.8) return <CheckCircle size={16} className="text-green-500" />
    if (confidence >= 0.6) return <AlertTriangle size={16} className="text-yellow-500" />
    return <AlertTriangle size={16} className="text-red-500" />
  }

  const formatConfidence = (confidence: number) => {
    return `${Math.round(confidence * 100)}%`
  }

  return (
    <div className="space-y-6">
      {/* Document Intelligence Section */}
      <DocumentMetadataSection 
        metadata={document_metadata}
        confidence={extraction_quality?.metadata_completeness}
        carrierName={extractionResult?.carrierName}
        statementDate={extractionResult?.statementDate}
      />
      
      {/* Table Data Section */}
      <TableDataSection 
        tables={tables}
        businessLogic={extraction_quality?.business_logic_consistency}
      />
      
      {/* Quality Intelligence Indicators */}
      {extraction_quality && Object.keys(extraction_quality).length > 0 && (
        <ExtractionQualityIndicators 
          quality={extraction_quality}
          anomalies={extractionResult.extraction_anomalies}
          intelligence={extraction_intelligence}
        />
      )}
    </div>
  )
}

const DocumentMetadataSection: React.FC<{ 
  metadata?: DocumentMetadata; 
  confidence?: number;
  carrierName?: string;
  statementDate?: string;
}> = ({ metadata = {}, confidence, carrierName, statementDate }) => {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center gap-2 mb-4">
        <FileText size={20} className="text-blue-600" />
        <h3 className="text-lg font-semibold text-gray-900">Document Intelligence</h3>
        {confidence !== undefined && (
          <div className={`px-2 py-1 rounded-full text-xs font-medium ${getConfidenceColor(confidence)}`}>
            {formatConfidence(confidence)} Complete
          </div>
        )}
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Carrier Information */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Building2 size={16} className="text-gray-500" />
            <span className="text-sm font-medium text-gray-700">Insurance Carrier</span>
            {metadata?.carrier_confidence !== undefined && getConfidenceIcon(metadata.carrier_confidence)}
          </div>
          <div className="pl-6">
            <p className="text-sm text-gray-900 font-medium">
              {metadata?.carrier_name || carrierName || 'Not identified'}
            </p>
            {metadata?.carrier_evidence && (
              <p className="text-xs text-gray-500 mt-1">
                Found in: {metadata.carrier_evidence}
              </p>
            )}
            {metadata?.carrier_confidence !== undefined && (
              <p className="text-xs text-gray-500">
                Confidence: {formatConfidence(metadata.carrier_confidence)}
              </p>
            )}
          </div>
        </div>

        {/* Statement Date */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-gray-500" />
            <span className="text-sm font-medium text-gray-700">Statement Date</span>
            {metadata?.date_confidence !== undefined && getConfidenceIcon(metadata.date_confidence)}
          </div>
          <div className="pl-6">
            <p className="text-sm text-gray-900 font-medium">
              {metadata?.statement_date || statementDate || 'Not identified'}
            </p>
            {metadata?.date_evidence && (
              <p className="text-xs text-gray-500 mt-1">
                Found in: {metadata.date_evidence}
              </p>
            )}
            {metadata?.date_confidence !== undefined && (
              <p className="text-xs text-gray-500">
                Confidence: {formatConfidence(metadata.date_confidence)}
              </p>
            )}
          </div>
        </div>

        {/* Broker Information */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <User size={16} className="text-gray-500" />
            <span className="text-sm font-medium text-gray-700">Broker/Agency</span>
          </div>
          <div className="pl-6">
            <p className="text-sm text-gray-900 font-medium">
              {metadata?.broker_company || 'Not identified'}
            </p>
          </div>
        </div>

        {/* Document Type */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-gray-500" />
            <span className="text-sm font-medium text-gray-700">Document Type</span>
          </div>
          <div className="pl-6">
            <p className="text-sm text-gray-900 font-medium">
              {metadata?.document_type || 'Commission Statement'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

const TableDataSection: React.FC<{ tables?: any[], businessLogic?: number }> = ({ tables = [], businessLogic }) => {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center gap-2 mb-4">
        <FileText size={20} className="text-green-600" />
        <h3 className="text-lg font-semibold text-gray-900">Table Data</h3>
        {businessLogic !== undefined && (
          <div className={`px-2 py-1 rounded-full text-xs font-medium ${getConfidenceColor(businessLogic)}`}>
            {formatConfidence(businessLogic)} Business Logic
          </div>
        )}
      </div>
      
      <div className="space-y-4">
        {tables && tables.length > 0 ? (
          tables.map((table, index) => {
            // Handle both 'headers' and 'header' property names
            const headers = table?.headers || table?.header || [];
            const rows = table?.rows || [];
            
            return (
              <div key={index} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-medium text-gray-900">
                    Table {index + 1}
                  </h4>
                  <div className="text-xs text-gray-500">
                    {headers.length || 0} columns × {rows.length || 0} rows
                  </div>
                </div>
                
                {headers && headers.length > 0 && (
                  <div className="mb-3">
                    <div className="text-xs font-medium text-gray-600 mb-1">Headers:</div>
                    <div className="flex flex-wrap gap-1">
                      {headers.map((header: string, headerIndex: number) => (
                        <span 
                          key={headerIndex}
                          className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded"
                        >
                          {header}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                
                {rows && rows.length > 0 && (
                  <div className="text-xs text-gray-500">
                    Sample data: {rows.slice(0, 2).map((row: any[]) => 
                      row.slice(0, 3).join(', ')
                    ).join(' | ')}
                    {rows.length > 2 && '...'}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="text-center py-8 text-gray-500">
            <FileText size={48} className="mx-auto mb-2 text-gray-300" />
            <p>No tables extracted</p>
          </div>
        )}
      </div>
    </div>
  )
}

const ExtractionQualityIndicators: React.FC<{ 
  quality?: ExtractionQuality, 
  anomalies?: string[], 
  intelligence?: any 
}> = ({ quality = {}, anomalies, intelligence }) => {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center gap-2 mb-4">
        <Info size={20} className="text-purple-600" />
        <h3 className="text-lg font-semibold text-gray-900">Extraction Quality</h3>
        {quality?.overall_confidence !== undefined && (
          <div className={`px-2 py-1 rounded-full text-xs font-medium ${getConfidenceColor(quality.overall_confidence)}`}>
            {formatConfidence(quality.overall_confidence)} Overall
          </div>
        )}
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        {/* Metadata Completeness */}
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900">
            {quality?.metadata_completeness ? formatConfidence(quality.metadata_completeness) : 'N/A'}
          </div>
          <div className="text-xs text-gray-500">Metadata Complete</div>
        </div>
        
        {/* Table Completeness */}
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900">
            {quality?.table_completeness ? formatConfidence(quality.table_completeness) : 'N/A'}
          </div>
          <div className="text-xs text-gray-500">Tables Complete</div>
        </div>
        
        {/* Business Logic */}
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900">
            {quality?.business_logic_consistency ? formatConfidence(quality.business_logic_consistency) : 'N/A'}
          </div>
          <div className="text-xs text-gray-500">Business Logic</div>
        </div>
      </div>
      
      {/* Human Review Flag */}
      {quality?.requires_human_review && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="text-yellow-600" />
            <span className="text-sm font-medium text-yellow-800">
              Human Review Recommended
            </span>
          </div>
          <p className="text-xs text-yellow-700 mt-1">
            Low confidence extraction detected. Please review the results for accuracy.
          </p>
        </div>
      )}
      
      {/* Anomalies */}
      {anomalies && anomalies.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={16} className="text-red-600" />
            <span className="text-sm font-medium text-red-800">
              Extraction Anomalies Detected
            </span>
          </div>
          <ul className="text-xs text-red-700 space-y-1">
            {anomalies.map((anomaly, index) => (
              <li key={index} className="flex items-start gap-2">
                <span className="text-red-500 mt-0.5">•</span>
                <span>{anomaly}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      
      {/* Intelligence Metadata */}
      {intelligence && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="text-xs text-gray-500">
            <div>Method: {intelligence?.analysis_method || 'N/A'}</div>
            <div>Version: {intelligence?.intelligence_version || 'N/A'}</div>
            {intelligence?.processing_time && (
              <div>Processing Time: {intelligence.processing_time.toFixed(2)}s</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// Helper functions (moved outside component to avoid redefinition)
const getConfidenceColor = (confidence: number) => {
  if (confidence >= 0.8) return 'text-green-600 bg-green-50'
  if (confidence >= 0.6) return 'text-yellow-600 bg-yellow-50'
  return 'text-red-600 bg-red-50'
}

const getConfidenceIcon = (confidence: number) => {
  if (confidence >= 0.8) return <CheckCircle size={16} className="text-green-500" />
  if (confidence >= 0.6) return <AlertTriangle size={16} className="text-yellow-500" />
  return <AlertTriangle size={16} className="text-red-500" />
}

const formatConfidence = (confidence: number) => {
  return `${Math.round(confidence * 100)}%`
}

export default IntelligentTableDisplay
