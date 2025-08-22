export interface ExcelTable {
  header: string[]
  rows: string[][]
  name: string
  id: string
  extractor: string
  metadata: {
    extraction_method: string
    confidence: number
    quality_score: number
    sheet_name: string
    table_type: string
    row_count: number
    column_count: number
    quality_metrics: {
      overall_score: number
      completeness: number
      consistency: number
      accuracy: number
      structure_quality: number
      data_quality: number
      confidence_level: string
      is_valid: boolean
    }
    validation_warnings: string[]
    financial_metadata: {
      has_financial_data: boolean
    }
  }
}

export interface ExcelExtractionResponse {
  status: string
  success: boolean
  message: string
  job_id: string
  file_name: string
  tables: ExcelTable[]
  table_headers: string[]
  table_data: string[][]
  processing_time_seconds: number
  extraction_time_seconds: number
  extraction_metrics: {
    total_text_elements: number
    extraction_time: number
    table_confidence: number
    model_used: string
  }
  document_info: {
    file_type: string
    total_tables: number
    total_sheets: number
    sheets_with_tables: number
  }
  quality_summary: {
    total_tables: number
    valid_tables: number
    average_quality_score: number
    overall_confidence: string
    issues_found: string[]
    recommendations: string[]
  }
  quality_metrics: {
    table_confidence: number
    text_elements_extracted: number
    table_rows_extracted: number
    extraction_completeness: string
    data_quality: string
  }
  warnings: string[]
  errors: string[]
  metadata: {
    file_path: string
    total_sheets: number
    processed_sheets: number
    extraction_timestamp: string
    service_version: string
  }
  upload_id: string
  extraction_id: string
  company_id: string
  s3_url?: string
  file_type: string
  extraction_method: string
  timestamp: string
}

export interface ExcelSheetInfo {
  name: string
  rows: number
  columns: number
  has_data: boolean
  sample_data: any[]
  error?: string
}

export interface ExcelSheetInfoResponse {
  success: boolean
  file_name: string
  total_sheets: number
  sheets: ExcelSheetInfo[]
}

class ExcelExtractionService {
  private baseUrl: string

  constructor() {
    this.baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
  }

  /**
   * Extract tables from Excel file
   */
  async extractTablesFromExcel(
    file: File,
    companyId: string,
    sheetNames?: string[],
    maxTablesPerSheet: number = 10,
    enableQualityChecks: boolean = true
  ): Promise<ExcelExtractionResponse> {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('company_id', companyId)
    formData.append('max_tables_per_sheet', maxTablesPerSheet.toString())
    formData.append('enable_quality_checks', enableQualityChecks.toString())
    
    if (sheetNames && sheetNames.length > 0) {
      formData.append('sheet_names', sheetNames.join(','))
    }

    const response = await fetch(`${this.baseUrl}/extract-tables-excel/`, {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.detail || `HTTP error! status: ${response.status}`)
    }

    return response.json()
  }

  /**
   * Extract tables from Excel file bytes (for direct processing)
   */
  async extractTablesFromExcelBytes(
    file: File,
    companyId: string,
    sheetNames?: string[],
    maxTablesPerSheet: number = 10,
    enableQualityChecks: boolean = true
  ): Promise<ExcelExtractionResponse> {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('company_id', companyId)
    formData.append('max_tables_per_sheet', maxTablesPerSheet.toString())
    formData.append('enable_quality_checks', enableQualityChecks.toString())
    
    if (sheetNames && sheetNames.length > 0) {
      formData.append('sheet_names', sheetNames.join(','))
    }

    const response = await fetch(`${this.baseUrl}/extract-tables-excel-bytes/`, {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.detail || `HTTP error! status: ${response.status}`)
    }

    return response.json()
  }

  /**
   * Extract tables from Excel file stored in S3
   */
  async extractTablesFromExcelS3(
    companyId: string,
    fileName: string,
    sheetNames?: string[],
    maxTablesPerSheet: number = 10,
    enableQualityChecks: boolean = true
  ): Promise<ExcelExtractionResponse> {
    const formData = new FormData()
    formData.append('company_id', companyId)
    formData.append('file_name', fileName)
    formData.append('max_tables_per_sheet', maxTablesPerSheet.toString())
    formData.append('enable_quality_checks', enableQualityChecks.toString())
    
    if (sheetNames && sheetNames.length > 0) {
      formData.append('sheet_names', sheetNames.join(','))
    }

    const response = await fetch(`${this.baseUrl}/extract-tables-excel-s3/`, {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.detail || `HTTP error! status: ${response.status}`)
    }

    return response.json()
  }

  /**
   * Get information about sheets in an Excel file
   */
  async getExcelSheetInfo(companyId: string, fileName: string): Promise<ExcelSheetInfoResponse> {
    const params = new URLSearchParams({
      file_name: fileName,
    })

    const response = await fetch(`${this.baseUrl}/excel-sheet-info/${companyId}?${params}`, {
      method: 'GET',
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.detail || `HTTP error! status: ${response.status}`)
    }

    return response.json()
  }

  /**
   * Validate Excel file before extraction
   */
  validateExcelFile(file: File): { isValid: boolean; error?: string } {
    const allowedExtensions = ['.xlsx', '.xls', '.xlsm', '.xlsb']
    const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'))
    
    if (!allowedExtensions.includes(fileExtension)) {
      return {
        isValid: false,
        error: `Unsupported file type. Allowed formats: ${allowedExtensions.join(', ')}`
      }
    }

    const maxSize = 50 * 1024 * 1024 // 50MB
    if (file.size > maxSize) {
      return {
        isValid: false,
        error: 'File too large. Maximum size is 50MB.'
      }
    }

    return { isValid: true }
  }

  /**
   * Get extraction progress (placeholder for future implementation)
   */
  async getExtractionProgress(jobId: string): Promise<{ status: string; progress: number }> {
    // This could be implemented if we add progress tracking
    return { status: 'completed', progress: 100 }
  }

  /**
   * Cancel extraction (placeholder for future implementation)
   */
  async cancelExtraction(jobId: string): Promise<boolean> {
    // This could be implemented if we add cancellation support
    return true
  }
}

// Export singleton instance
export const excelExtractionService = new ExcelExtractionService()
export default excelExtractionService
