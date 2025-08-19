'use client'
import TableEditor from './TableEditor'

interface TableEditorSectionProps {
  tables: any[]
  onTablesChange: (newTables: any[]) => void
  onSave: (tables: any[], selectedStatementDate?: any) => Promise<boolean>
  onUseAnotherExtraction: () => void
  onGoToFieldMapping: () => void
  onGoToPreviousExtraction: () => void
  onClose: () => void
  uploaded: any
  loading: boolean
  extractionHistory: any[][]
  currentExtractionIndex: number
  isUsingAnotherExtraction: boolean
  hasUsedAnotherExtraction: boolean
  onImproveExtraction: () => void
  isImprovingExtraction: boolean
  onStatementDateSelect: (date: any) => void
  companyId?: string
  selectedStatementDate?: any
  disableAutoDateExtraction?: boolean
  tableEditorLearning?: any
}

export default function TableEditorSection({
  tables,
  onTablesChange,
  onSave,
  onUseAnotherExtraction,
  onGoToFieldMapping,
  onGoToPreviousExtraction,
  onClose,
  uploaded,
  loading,
  extractionHistory,
  currentExtractionIndex,
  isUsingAnotherExtraction,
  hasUsedAnotherExtraction,
  onImproveExtraction,
  isImprovingExtraction,
  onStatementDateSelect,
  companyId,
  selectedStatementDate,
  disableAutoDateExtraction,
  tableEditorLearning
}: TableEditorSectionProps) {
  return (
    <TableEditor
      tables={tables}
      onTablesChange={onTablesChange}
      onSave={onSave}
      onUseAnotherExtraction={onUseAnotherExtraction}
      onGoToFieldMapping={onGoToFieldMapping}
      onGoToPreviousExtraction={onGoToPreviousExtraction}
      onClose={onClose}
      uploaded={uploaded}
      loading={loading}
      extractionHistory={extractionHistory}
      currentExtractionIndex={currentExtractionIndex}
      isUsingAnotherExtraction={isUsingAnotherExtraction}
      hasUsedAnotherExtraction={hasUsedAnotherExtraction}
      onImproveExtraction={onImproveExtraction}
      isImprovingExtraction={isImprovingExtraction}
      onStatementDateSelect={onStatementDateSelect}
      companyId={companyId}
      selectedStatementDate={selectedStatementDate}
      disableAutoDateExtraction={disableAutoDateExtraction}
      tableEditorLearning={tableEditorLearning}
    />
  )
}
