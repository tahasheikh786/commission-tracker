/**
 * Summary Row Detection Hook
 * Handles summary row marking and pattern detection
 */

'use client';

import { useCallback, useMemo } from 'react';
import { TableData, SummaryRowDetection } from '../types';
import { 
  autoDetectSummaryRows, 
  findSimilarRows
} from '../utils/summaryDetection';

export function useSummaryRowDetection(
  table: TableData,
  onTableChange: (table: TableData) => void
) {
  // Ensure summaryRows is always a Set and keep the reference stable between renders
  const summaryRows = useMemo(() => {
    if (!table.summaryRows) {
      return new Set<number>();
    }
    return table.summaryRows instanceof Set
      ? table.summaryRows
      : new Set(table.summaryRows);
  }, [table.summaryRows]);

  const updateSummaryRows = useCallback(
    (updater: (prev: Set<number>) => Set<number>) => {
      const updatedSummaryRows = updater(new Set(summaryRows));
      onTableChange({
        ...table,
        summaryRows: updatedSummaryRows
      });
    },
    [table, summaryRows, onTableChange]
  );

  // Mark a row (or rows) as summary rows
  const markAsSummaryRow = useCallback(
    (rowIndex: number) => {
      updateSummaryRows(prev => {
        prev.add(rowIndex);
        return prev;
      });
    },
    [updateSummaryRows]
  );

  const markSummaryRows = useCallback(
    (rowIndices: number[]) => {
      if (rowIndices.length === 0) return;
      updateSummaryRows(prev => {
        rowIndices.forEach(idx => prev.add(idx));
        return prev;
      });
    },
    [updateSummaryRows]
  );

  // Unmark summary rows
  const unmarkSummaryRow = useCallback(
    (rowIndex: number) => {
      updateSummaryRows(prev => {
        prev.delete(rowIndex);
        return prev;
      });
    },
    [updateSummaryRows]
  );

  const unmarkSummaryRows = useCallback(
    (rowIndices: number[]) => {
      if (rowIndices.length === 0) return;
      updateSummaryRows(prev => {
        rowIndices.forEach(idx => prev.delete(idx));
        return prev;
      });
    },
    [updateSummaryRows]
  );

  // Detect similar rows based on a reference row
  const detectSimilarRows = useCallback((referenceRowIndex: number) => {
    const referenceRow = table.rows[referenceRowIndex];
    if (!referenceRow) return [];
    
    return findSimilarRows(table, referenceRow, referenceRowIndex);
  }, [table]);

  // Auto-detect all summary rows in the table
  const autoDetect = useCallback(() => {
    const detectedIndices = autoDetectSummaryRows(table);
    updateSummaryRows(prev => {
      detectedIndices.forEach(idx => prev.add(idx));
      return prev;
    });
    return detectedIndices.length;
  }, [table, updateSummaryRows]);

  // Check if a row is a summary row
  const isSummary = useCallback(
    (rowIndex: number) => summaryRows.has(rowIndex),
    [summaryRows]
  );

  const detection: SummaryRowDetection = useMemo(
    () => ({
      summaryRows,
      markAsSummaryRow,
      markSummaryRows,
      unmarkSummaryRow,
      unmarkSummaryRows,
      detectSimilarRows,
      autoDetectSummaryRows: autoDetect,
      isSummaryRow: isSummary
    }),
    [
      summaryRows,
      markAsSummaryRow,
      markSummaryRows,
      unmarkSummaryRow,
      unmarkSummaryRows,
      detectSimilarRows,
      autoDetect,
      isSummary
    ]
  );

  return detection;
}

