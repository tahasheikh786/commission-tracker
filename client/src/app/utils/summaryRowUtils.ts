/**
 * Summary Row Utility Functions
 * 
 * Provides utilities for detecting and handling summary rows in extracted tables.
 * Summary rows are special rows that contain totals, subtotals, or aggregate information.
 */

export interface TableWithSummaryRows {
  header?: string[];
  headers?: string[];
  rows: string[][];
  summaryRows?: number[] | Set<number>;
  summary_detection?: {
    enabled: boolean;
    removed_summary_rows?: any[];
    removed_indices?: number[];
    detection_confidence?: number;
    detection_method?: string;
  };
}

/**
 * Check if a specific row is marked as a summary row
 * @param table - The table object containing summary row information
 * @param rowIndex - The index of the row to check
 * @returns true if the row is a summary row, false otherwise
 */
export function isSummaryRow(table: TableWithSummaryRows | any, rowIndex: number): boolean {
  // Check if row is marked in summaryRows array/set
  if (table.summaryRows) {
    if (Array.isArray(table.summaryRows)) {
      return table.summaryRows.includes(rowIndex);
    } else if (table.summaryRows instanceof Set) {
      return table.summaryRows.has(rowIndex);
    }
  }
  
  // Fallback: Check if row matches summary patterns
  if (!table.rows || !table.rows[rowIndex]) return false;
  
  const row = table.rows[rowIndex];
  const rowText = Array.isArray(row) ? row.join(' ').toLowerCase() : String(row).toLowerCase();
  
  // Common summary row patterns
  const summaryPatterns = [
    /^total\s+for\s+group/i,
    /^grand\s+total/i,
    /^subtotal/i,
    /^total:/i,
    /^total$/i,
    /summary$/i,
    /^sum:/i,
    /^total\s+/i,
  ];
  
  return summaryPatterns.some(pattern => pattern.test(rowText));
}

/**
 * Get all summary row indices from a table
 * @param table - The table object
 * @returns Array of row indices that are summary rows
 */
export function getSummaryRowIndices(table: TableWithSummaryRows | any): number[] {
  if (!table) return [];
  
  // Try to get from summaryRows field
  if (table.summaryRows) {
    if (Array.isArray(table.summaryRows)) {
      return table.summaryRows;
    } else if (table.summaryRows instanceof Set) {
      return Array.from(table.summaryRows);
    }
  }
  
  // Try to get from summary_detection metadata
  if (table.summary_detection?.removed_indices) {
    return table.summary_detection.removed_indices;
  }
  
  // Fallback: Detect using patterns
  const indices: number[] = [];
  if (table.rows) {
    table.rows.forEach((row: any, index: number) => {
      if (isSummaryRow(table, index)) {
        indices.push(index);
      }
    });
  }
  
  return indices;
}

/**
 * Get summary detection metadata
 * @param table - The table object
 * @returns Summary detection metadata or null if not available
 */
export function getSummaryDetectionInfo(table: TableWithSummaryRows | any): {
  enabled: boolean;
  count: number;
  confidence: number;
  method: string;
} | null {
  if (!table.summary_detection) return null;
  
  const summaryIndices = getSummaryRowIndices(table);
  
  return {
    enabled: table.summary_detection.enabled || false,
    count: summaryIndices.length,
    confidence: table.summary_detection.detection_confidence || 0,
    method: table.summary_detection.detection_method || 'unknown'
  };
}

/**
 * Convert summaryRows from array to Set for efficient lookups
 * @param table - The table object
 * @returns Table with summaryRows as a Set
 */
export function normalizeSummaryRows(table: any): any {
  if (!table) return table;
  
  if (Array.isArray(table.summaryRows)) {
    return {
      ...table,
      summaryRows: new Set(table.summaryRows)
    };
  }
  
  return table;
}

/**
 * Filter out summary rows from a table
 * @param table - The table object
 * @returns Rows array without summary rows
 */
export function getDataRowsOnly(table: TableWithSummaryRows | any): any[][] {
  if (!table || !table.rows) return [];
  
  return table.rows.filter((_: any, index: number) => !isSummaryRow(table, index));
}

/**
 * Get only summary rows from a table
 * @param table - The table object
 * @returns Array of summary rows
 */
export function getSummaryRowsOnly(table: TableWithSummaryRows | any): any[][] {
  if (!table || !table.rows) return [];
  
  return table.rows.filter((_: any, index: number) => isSummaryRow(table, index));
}

