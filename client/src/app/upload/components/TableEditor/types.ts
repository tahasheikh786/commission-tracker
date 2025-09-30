export type TableData = {
  header: string[]
  headers?: string[] // For backward compatibility with mistral extraction
  rows: string[][]
  name?: string
  id?: string
  extractor?: string
  metadata?: {
    extraction_method?: string
    [key: string]: any
  }
  summaryRows?: Set<number>
}

export type TableEditorProps = {
  tables: TableData[]
  onTablesChange: (tables: TableData[]) => void
  onSave: (tables: TableData[], selectedStatementDate?: any) => void
  onUseAnotherExtraction: () => void
  onGoToFieldMapping: () => void
  onGoToPreviousExtraction?: () => void
  onClose?: () => void
  uploaded?: any
  loading?: boolean
  extractionHistory?: TableData[][]
  currentExtractionIndex?: number
  isUsingAnotherExtraction?: boolean
  hasUsedAnotherExtraction?: boolean
  onImproveExtraction?: () => void
  isImprovingExtraction?: boolean
  onStatementDateSelect?: (date: any) => void
  companyId?: string
  selectedStatementDate?: any
  disableAutoDateExtraction?: boolean
  tableEditorLearning?: any

}

export type CellEdit = {
  tableIdx: number
  rowIdx: number
  colIdx: number
  value: string
}

export type RowEdit = {
  tableIdx: number
  rowIdx: number
  values: string[]
}

export type MergeHistory = {
  tableIdx: number
  col1Idx: number
  col2Idx: number
  originalHeader: string[]
  originalRows: string[][]
  timestamp: number
}

export type FormatValidationResult = {
  isValid: boolean
  issues: string[]
}

export type FormatValidationResults = {
  [rowIdx: number]: FormatValidationResult
}

export type RightFormatRow = {
  tableIdx: number
  rowIdx: number
} | null

export type DataType = 'text' | 'number' | 'date' | 'currency' | 'percentage' | 'empty'
