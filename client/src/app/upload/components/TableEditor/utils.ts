import { TableData, DataType, FormatValidationResult } from './types'

/**
 * Simplified PDF URL function that constructs a proxy URL to stream the PDF
 * Uses the backend proxy endpoint to avoid CORS issues
 * In development, uses relative URLs to leverage Next.js proxy
 */
export function getPdfUrl(uploaded: any): string | null {
  if (!uploaded?.gcs_key && !uploaded?.file_name) {
    return null
  }

  const gcsKey = uploaded.gcs_key || uploaded.file_name
  
  // In development (localhost), use relative URL to leverage Next.js proxy
  // In production, use the full API URL
  const isDevelopment = typeof window !== 'undefined' && (
    window.location.hostname === 'localhost' || 
    window.location.hostname === '127.0.0.1'
  )
  
  if (isDevelopment) {
    // Use relative URL to avoid CORS issues in development
    return `/api/pdf-proxy/?gcs_key=${encodeURIComponent(gcsKey)}`
  } else {
    // In production, use the full API URL
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || ''
    return `${apiUrl}/pdf-proxy/?gcs_key=${encodeURIComponent(gcsKey)}`
  }
}

export const detectDataType = (value: string): DataType => {
  if (!value || value.trim() === '') return 'empty'
  
  const trimmed = value.trim()
  
  // Check for currency (starts with $ or contains currency symbols)
  if (/^\$[\d,]+\.?\d*$/.test(trimmed) || /^\(\$[\d,]+\.?\d*\)$/.test(trimmed) || 
      /[\$€£¥₹]/.test(trimmed)) {
    return 'currency'
  }
  
  // Check for percentage
  if (/^\d+\.?\d*%$/.test(trimmed)) {
    return 'percentage'
  }
  
  // Check for date (MM/DD/YYYY or DD/MM/YYYY patterns)
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed) || 
      /^\d{4}-\d{1,2}-\d{1,2}$/.test(trimmed) ||
      /^\d{1,2}-\d{1,2}-\d{4}$/.test(trimmed)) {
    return 'date'
  }
  
  // Check for number (including negative numbers and decimals)
  if (/^-?\d+\.?\d*$/.test(trimmed) || /^\(\d+\.?\d*\)$/.test(trimmed)) {
    return 'number'
  }
  
  // Default to text
  return 'text'
}

export const validateRowFormat = (referenceRow: string[], targetRow: string[]): FormatValidationResult => {
  const issues: string[] = []
  
  // Ensure both rows have the same number of columns
  const maxCols = Math.max(referenceRow.length, targetRow.length)
  
  for (let i = 0; i < maxCols; i++) {
    const refValue = referenceRow[i] || ''
    const targetValue = targetRow[i] || ''
    
    // Skip empty cells in reference row
    if (refValue.trim() === '') continue
    
    const refDataType = detectDataType(refValue)
    const targetDataType = detectDataType(targetValue)
    
    // If target cell is empty, it's valid (no need to auto-fill)
    if (targetDataType === 'empty') continue
    
    // Check if data types match
    if (refDataType !== targetDataType) {
      issues.push(`Column ${i + 1}: Expected ${refDataType}, got ${targetDataType} (${targetValue})`)
    }
  }
  
  return {
    isValid: issues.length === 0,
    issues
  }
}

export const correctCellValue = (currentValue: string, expectedType: string, referenceValue: string): string => {
  const trimmed = currentValue.trim()
  
  switch (expectedType) {
    case 'text':
      return currentValue
      
    case 'number':
      const numericMatch = trimmed.match(/-?\d+(\.\d+)?/)
      if (numericMatch) {
        return numericMatch[0]
      }
      if (trimmed.includes('$')) {
        const currencyMatch = trimmed.match(/\$?([\d,]+\.?\d*)/)
        if (currencyMatch) {
          return currencyMatch[1].replace(/,/g, '')
        }
      }
      return '0'
      
    case 'currency':
      if (trimmed.includes('$')) {
        return trimmed
      }
      const numericValue = trimmed.replace(/[^\d.-]/g, '')
      if (numericValue) {
        return `$${numericValue}`
      }
      return '$0.00'
      
    case 'percentage':
      if (trimmed.includes('%')) {
        return trimmed
      }
      const percentValue = trimmed.replace(/[^\d.-]/g, '')
      if (percentValue) {
        return `${percentValue}%`
      }
      return '0%'
      
    case 'date':
      if (trimmed.includes('/')) {
        return trimmed
      }
      const dateMatch = trimmed.match(/(\d{1,2}\/\d{1,2}\/\d{4})/)
      if (dateMatch) {
        return dateMatch[1]
      }
      return '01/01/2024'
      
    default:
      return currentValue
  }
}

export const correctRowFormat = (referenceRow: string[], targetRow: string[]): string[] | null => {
  const correctedRow = [...targetRow]
  let hasChanges = false
  
  const maxCols = Math.max(referenceRow.length, targetRow.length)
  
  for (let i = 0; i < maxCols; i++) {
    const refValue = referenceRow[i] || ''
    const targetValue = targetRow[i] || ''
    
    if (refValue.trim() === '') continue
    
    const refDataType = detectDataType(refValue)
    const targetDataType = detectDataType(targetValue)
    
    if (targetDataType === 'empty') continue
    
    if (refDataType !== targetDataType) {
      const correctedValue = correctCellValue(targetValue, refDataType, refValue)
      if (correctedValue !== targetValue) {
        correctedRow[i] = correctedValue
        hasChanges = true
      }
    }
  }
  
  return hasChanges ? correctedRow : null
}

export const cleanColumnNames = (headers: string[]) => {
  return headers.map(header => {
    if (header.includes('.')) {
      const parts = header.split('.')
      if (parts.length === 2 && parts[0].trim() === parts[1].trim()) {
        return parts[0].trim()
      }
    }
    return header
  })
}

export const isSummaryRow = (table: TableData, rowIdx: number) => {
  return table?.summaryRows?.has(rowIdx) || false
}

export const calculateRowSimilarity = (row1: string[], row2: string[]): number => {
  if (row1.length !== row2.length) return 0
  
  let matchingCells = 0
  const totalCells = row1.length
  
  for (let i = 0; i < row1.length; i++) {
    const cell1 = (row1[i] || '').trim().toLowerCase()
    const cell2 = (row2[i] || '').trim().toLowerCase()
    
    if (cell1 === cell2 && cell1 !== '') {
      matchingCells++
    } else if (cell1 === '' && cell2 === '') {
      matchingCells++
    }
  }
  
  return totalCells > 0 ? matchingCells / totalCells : 0
}

export const findSimilarRows = (table: TableData, targetRow: string[], targetRowIdx: number): number[] => {
  const similarRows: number[] = []
  
  // Summary row keywords and patterns
  const summaryKeywords = ['total', 'subtotal', 'summary', 'group', 'grand', 'sum', 'count', 'amount', 'balance', 'net', 'final', 'overall', 'combined', 'aggregate']
  
  // Get the first few cells of the target row (most important for summary row detection)
  const targetFirstCells = targetRow.slice(0, 3).map(cell => (cell || '').trim().toLowerCase())
  
  // Check if this looks like a summary row
  const isTargetSummaryRow = targetFirstCells.some(cell => 
    summaryKeywords.some(keyword => cell.includes(keyword))
  )
  
  if (isTargetSummaryRow) {
    // For summary rows, look for similar patterns in other rows
    table.rows.forEach((row, rowIdx) => {
      if (rowIdx === targetRowIdx) return
      
      const rowFirstCells = row.slice(0, 3).map(cell => (cell || '').trim().toLowerCase())
      
      // Check if this row also has summary keywords
      const isRowSummaryRow = rowFirstCells.some(cell => 
        summaryKeywords.some(keyword => cell.includes(keyword))
      )
      
      if (isRowSummaryRow) {
        // Check for specific patterns
        let isSimilar = false
        
        // Pattern 1: "Total for Group:" pattern
        if (targetFirstCells[0].includes('total for group') && rowFirstCells[0].includes('total for group')) {
          isSimilar = true
        }
        
        // Pattern 2: "Total:" pattern
        else if (targetFirstCells[0].includes('total:') && rowFirstCells[0].includes('total:')) {
          isSimilar = true
        }
        
        // Pattern 3: "Subtotal:" pattern
        else if (targetFirstCells[0].includes('subtotal') && rowFirstCells[0].includes('subtotal')) {
          isSimilar = true
        }
        
        // Pattern 4: "Summary:" pattern
        else if (targetFirstCells[0].includes('summary') && rowFirstCells[0].includes('summary')) {
          isSimilar = true
        }
        
        // Pattern 5: Check if both rows start with the same summary keyword
        else {
          const targetKeyword = summaryKeywords.find(keyword => targetFirstCells[0].includes(keyword))
          const rowKeyword = summaryKeywords.find(keyword => rowFirstCells[0].includes(keyword))
          
          if (targetKeyword && rowKeyword && targetKeyword === rowKeyword) {
            isSimilar = true
          }
        }
        
        if (isSimilar) {
          similarRows.push(rowIdx)
        }
      }
    })
  } else {
    // For regular rows, use the original similarity calculation
    const similarityThreshold = 0.7
    
    table.rows.forEach((row, rowIdx) => {
      if (rowIdx === targetRowIdx) return
      
      const similarity = calculateRowSimilarity(targetRow, row)
      if (similarity >= similarityThreshold) {
        similarRows.push(rowIdx)
      }
    })
  }
  
  return similarRows
}

export const detectSummaryRowsLocally = (table: TableData): number[] => {
  const detectedRows: number[] = []
  
  // Summary row patterns and keywords
  const summaryPatterns = [
    /^total for group:?\s*[a-z\s]+$/i,
    /^total:?\s*[a-z\s]*$/i,
    /^subtotal:?\s*[a-z\s]*$/i,
    /^summary:?\s*[a-z\s]*$/i,
    /^grand total:?\s*[a-z\s]*$/i,
    /^group total:?\s*[a-z\s]*$/i,
    /^[a-z\s]+\s+total$/i,
    /^total\s+[a-z\s]+$/i
  ]
  
  const summaryKeywords = ['total', 'subtotal', 'summary', 'group', 'grand', 'sum', 'count', 'amount', 'balance', 'net', 'final', 'overall', 'combined', 'aggregate']
  
  table.rows.forEach((row, rowIdx) => {
    if (!row || row.length === 0) return
    
    // Check first few columns for summary patterns
    const firstCell = (row[0] || '').trim()
    const secondCell = (row[1] || '').trim()
    
    // Strategy 1: Check for exact pattern matches
    for (const pattern of summaryPatterns) {
      if (pattern.test(firstCell)) {
        detectedRows.push(rowIdx)
        break
      }
    }
    
    // Strategy 2: Check for summary keywords in first column
    if (!detectedRows.includes(rowIdx)) {
      const firstCellLower = firstCell.toLowerCase()
      if (summaryKeywords.some(keyword => firstCellLower.includes(keyword))) {
        // Additional check: if it's a summary row, it should have some numeric values in later columns
        const hasNumericValues = row.slice(2, 6).some(cell => {
          const cellValue = (cell || '').trim()
          return /^\$?[\d,]+\.?\d*$/.test(cellValue) || /^\d+$/.test(cellValue)
        })
        
        if (hasNumericValues) {
          detectedRows.push(rowIdx)
        }
      }
    }
    
    // Strategy 3: Check for "Total for Group:" pattern specifically
    if (!detectedRows.includes(rowIdx) && firstCell.toLowerCase().includes('total for group')) {
      detectedRows.push(rowIdx)
    }
    
    // Strategy 4: Check for rows that have summary characteristics
    if (!detectedRows.includes(rowIdx)) {
      const rowText = row.join(' ').toLowerCase()
      
      // Check if row contains summary keywords and has numeric totals
      const hasSummaryKeywords = summaryKeywords.some(keyword => rowText.includes(keyword))
      const hasNumericTotals = row.some(cell => {
        const cellValue = (cell || '').trim()
        return /^\$?[\d,]+\.?\d*$/.test(cellValue) || /^\d+$/.test(cellValue)
      })
      
      if (hasSummaryKeywords && hasNumericTotals) {
        detectedRows.push(rowIdx)
      }
    }
  })
  
  return detectedRows
}

export const getCurrentExtractionMethod = (tables: TableData[]) => {
  if (tables.length === 0) return null
  
  const extractors = tables.map(table => {
    const extractor = table.extractor || 
                     table.metadata?.extraction_method || 
                     table.metadata?.extractor
    
    if (extractor) return extractor
    
    if (table.name?.toLowerCase().includes('docling')) return 'docling'
    
    return null
  }).filter(Boolean)
  
  if (extractors.length === 0) {
    const hasDoclingCharacteristics = tables.some(table => 
      table.header && Array.isArray(table.header) && table.header.some(header => 
        header && typeof header === 'string' && (
          header.toLowerCase().includes('client') || 
          header.toLowerCase().includes('agent') ||
          header.toLowerCase().includes('policy') ||
          header.toLowerCase().includes('commission')
        )
      )
    )
    return hasDoclingCharacteristics ? 'docling' : null
  }
  return extractors[0]
}

export const isGoogleDocAIExtraction = (tables: TableData[]) => {
  const method = getCurrentExtractionMethod(tables)
  return method === 'google_docai' || method === 'google_docai_form_parser' || method === 'google_docai_layout_parser'
}
