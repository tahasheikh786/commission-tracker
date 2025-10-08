import { TableData, RightFormatRow, FormatValidationResults } from '../types'

type TableControlsProps = {
  currentTable: TableData
  currentTableIdx: number
  rightFormatRow: RightFormatRow
  formatValidationResults: FormatValidationResults
  selectedRows: Set<number>
  onSetFormatRow: () => void
  onFixRowFormatWithGPT: () => void
  onClearAll: () => void
  onDeleteSelectedRows: () => void
  onAutoDetectSummaryRows: () => void
  onLearnSummaryRowPattern: () => void
  onDeleteSummaryRows: () => void
  onDeleteTable: () => void
  onUpdateTableName: (name: string) => void
}

export default function TableControls({
  currentTable,
  currentTableIdx,
  rightFormatRow,
  formatValidationResults,
  selectedRows,
  onSetFormatRow,
  onFixRowFormatWithGPT,
  onClearAll,
  onDeleteSelectedRows,
  onAutoDetectSummaryRows,
  onLearnSummaryRowPattern,
  onDeleteSummaryRows,
  onDeleteTable,
  onUpdateTableName
}: TableControlsProps) {
  // This component is now minimal - most controls moved to context menus
  return null
}
