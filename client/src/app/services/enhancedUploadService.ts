/**
 * Enhanced Upload Service for AI-powered extraction and mapping
 * Provides methods for intelligent document processing with field mapping and plan type detection
 */

import axios from 'axios';

// Types for enhanced upload responses
export interface AIFieldMapping {
  extractedField: string;
  mappedTo: string | null;
  confidence: number;
  requiresReview: boolean;
  sampleValues?: string[];
}

export interface AIPlanTypeDetection {
  planType: string;
  confidence: number;
  keywords: string[];
}

export interface AIIntelligence {
  enabled: boolean;
  field_mapping: {
    ai_enabled: boolean;
    mappings?: AIFieldMapping[];
    unmapped_fields?: string[];
    confidence?: number;
    statistics?: any;
  };
  plan_type_detection: {
    ai_enabled: boolean;
    detected_plan_types?: AIPlanTypeDetection[];
    confidence?: number;
    multi_plan_document?: boolean;
    statistics?: any;
  };
  overall_confidence: number;
}

export interface ExtractionResult {
  success: boolean;
  upload_id: string;
  extraction_id?: string;
  tables: any[];
  file_name: string;
  extracted_carrier?: string;
  extracted_date?: string;
  document_metadata?: any;
  quality_summary?: any;
  extraction_config?: any;
  format_learning?: any;
  gcs_url?: string;
  gcs_key?: string;
  ai_intelligence?: AIIntelligence;
}

/**
 * Generate unique request ID for tracking
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Enhanced Upload Service class for AI-powered document processing
 */
export class EnhancedUploadService {
  private static baseURL = process.env.NEXT_PUBLIC_API_URL || '';

  /**
   * Extract document with AI mapping and plan type detection
   * @param file - The file to upload
   * @param companyId - Company ID for the upload
   * @param enableAIMapping - Whether to enable AI field mapping (default: true)
   * @param statementDate - Optional statement date
   * @param uploadId - Optional pre-generated upload ID for WebSocket tracking
   * @returns Promise with extraction results including AI intelligence
   */
  static async extractWithAIMapping(
    file: File,
    companyId: string,
    enableAIMapping: boolean = true,
    statementDate?: string,
    uploadId?: string
  ): Promise<ExtractionResult> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('company_id', companyId);
    formData.append('extraction_method', 'mistral');
    formData.append('enable_ai_mapping', enableAIMapping.toString());
    
    if (uploadId) {
      formData.append('upload_id', uploadId);
    }
    
    if (statementDate) {
      formData.append('statement_date', statementDate);
    }

    try {
      const response = await axios.post<ExtractionResult>(
        `${this.baseURL}/api/extract-tables-smart/`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
            'X-Request-ID': generateRequestId()
          },
          withCredentials: true,
          timeout: 300000, // 5 minute timeout for large files
        }
      );

      return response.data;
    } catch (error: any) {
      console.error('Enhanced upload error:', error);
      throw error;
    }
  }

  /**
   * Update field mapping after user review
   * @param uploadId - The upload ID
   * @param mappingId - The mapping ID to update
   * @param newMapping - The new mapping configuration
   * @returns Promise with update result
   */
  static async updateFieldMapping(
    uploadId: string,
    mappingId: string,
    newMapping: Partial<AIFieldMapping>
  ): Promise<any> {
    try {
      const response = await axios.patch(
        `${this.baseURL}/api/ai/save-user-corrections`,
        {
          upload_id: uploadId,
          user_corrections: {
            [mappingId]: newMapping
          }
        },
        {
          headers: {
            'Content-Type': 'application/json'
          },
          withCredentials: true
        }
      );

      return response.data;
    } catch (error: any) {
      console.error('Field mapping update error:', error);
      throw error;
    }
  }

  /**
   * Get intelligent field mapping suggestions
   * @param headers - Array of extracted headers
   * @param carrierName - Optional carrier name for context
   * @param tableSampleData - Optional sample table data
   * @returns Promise with mapping suggestions
   */
  static async getFieldMappingSuggestions(
    headers: string[],
    carrierName?: string,
    tableSampleData?: any[]
  ): Promise<any> {
    try {
      const response = await axios.post(
        `${this.baseURL}/api/ai/map-fields`,
        {
          extracted_headers: headers,
          carrier_name: carrierName,
          table_sample_data: tableSampleData?.slice(0, 5),
          document_context: {
            carrier_name: carrierName,
            document_type: 'commission_statement'
          }
        },
        {
          headers: {
            'Content-Type': 'application/json'
          },
          withCredentials: true
        }
      );

      return response.data;
    } catch (error: any) {
      console.error('Field mapping suggestion error:', error);
      throw error;
    }
  }

  /**
   * Detect plan types from document
   * @param documentMetadata - Document metadata
   * @param tableHeaders - Array of table headers
   * @param tableSampleData - Sample table data
   * @param carrierName - Optional carrier name
   * @returns Promise with plan type detection results
   */
  static async detectPlanTypes(
    documentMetadata: any,
    tableHeaders: string[],
    tableSampleData?: any[],
    carrierName?: string
  ): Promise<any> {
    try {
      const response = await axios.post(
        `${this.baseURL}/api/ai/detect-plan-types`,
        {
          document_metadata: documentMetadata,
          table_headers: tableHeaders,
          table_sample_data: tableSampleData?.slice(0, 5),
          extracted_carrier: carrierName
        },
        {
          headers: {
            'Content-Type': 'application/json'
          },
          withCredentials: true
        }
      );

      return response.data;
    } catch (error: any) {
      console.error('Plan type detection error:', error);
      throw error;
    }
  }

  /**
   * Save user corrections for continuous learning
   * @param uploadId - The upload ID
   * @param corrections - User corrections object
   * @returns Promise with save result
   */
  static async saveUserCorrections(
    uploadId: string,
    corrections: {
      field_mappings?: Record<string, any>;
      plan_types?: any[];
    }
  ): Promise<any> {
    try {
      const response = await axios.post(
        `${this.baseURL}/api/ai/save-user-corrections`,
        {
          upload_id: uploadId,
          user_corrections: corrections
        },
        {
          headers: {
            'Content-Type': 'application/json'
          },
          withCredentials: true
        }
      );

      return response.data;
    } catch (error: any) {
      console.error('Save user corrections error:', error);
      throw error;
    }
  }

  /**
   * Get combined AI analysis (field mapping + plan type detection)
   * @param headers - Array of extracted headers
   * @param documentMetadata - Document metadata
   * @param tableSampleData - Sample table data
   * @param carrierName - Optional carrier name
   * @returns Promise with combined AI analysis
   */
  static async getCombinedAIAnalysis(
    headers: string[],
    documentMetadata: any,
    tableSampleData?: any[],
    carrierName?: string
  ): Promise<any> {
    try {
      const response = await axios.post(
        `${this.baseURL}/api/ai/analyze-combined`,
        {
          extracted_headers: headers,
          document_metadata: documentMetadata,
          table_sample_data: tableSampleData?.slice(0, 5),
          extracted_carrier: carrierName,
          document_context: {
            carrier_name: carrierName,
            document_type: 'commission_statement'
          }
        },
        {
          headers: {
            'Content-Type': 'application/json'
          },
          withCredentials: true
        }
      );

      return response.data;
    } catch (error: any) {
      console.error('Combined AI analysis error:', error);
      throw error;
    }
  }
}

export default EnhancedUploadService;

