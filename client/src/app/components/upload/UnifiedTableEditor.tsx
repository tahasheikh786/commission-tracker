/**
 * Unified Table Editor Component
 * 
 * Two-view layout:
 * - Field Mapping View: Left = PDF Preview, Right = AI Field Mapper Table
 * - Table Review View: Left = PDF Preview, Right = Editable Table
 */

"use client";

import React, { useState, useMemo, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { FieldMapping, PlanTypeDetection, getEnhancedExtractionAnalysis, saveUserCorrections } from '@/app/services/aiIntelligentMappingService';
import { useTheme } from '@/context/ThemeContext';
import ActionBar, { MappingStats, ViewMode } from './ActionBar';
import { ExtractedDataTable } from '../review-extracted-data';
import PDFViewer from './PDFViewer';
import AIFieldMapperTable from './AIFieldMapperTable';
import '../review-extracted-data/styles.css';
import PremiumProgressLoader, { UploadStep } from './PremiumProgressLoader';
import { ArrowRight, Map, FileText, Table2, Moon, Sun } from 'lucide-react';

export interface ExtractedData {
  tables: any[];
  planType?: string;
  planTypeConfidence?: number;
  carrierName?: string;
  statementDate?: string;
  gcs_url?: string;
  file_name?: string;
  extracted_carrier?: string;
  extracted_date?: string;
  upload_id?: string;
  company_id?: string;
  carrier_id?: string;
  document_metadata?: {
    carrier_name?: string;
    carrier_confidence?: number;
    statement_date?: string;
    date_confidence?: number;
    broker_company?: string;
    document_type?: string;
  };
  ai_intelligence?: {
    enabled: boolean;
    field_mapping: {
      ai_enabled: boolean;
      mappings: FieldMapping[];
      unmapped_fields: string[];
      confidence: number;
      statistics?: any;
      learned_format_used?: boolean;
    };
    plan_type_detection: {
      ai_enabled: boolean;
      detected_plan_types: PlanTypeDetection[];
      confidence: number;
      multi_plan_document?: boolean;
      statistics?: any;
    };
    overall_confidence: number;
  };
  format_learning?: {
    found_match: boolean;
    match_score: number;
    learned_format: any;
    suggested_mapping?: Record<string, string>;
    table_editor_settings?: any;
    auto_delete_tables?: number[];
    auto_delete_rows?: number[];
    can_automate?: boolean;
    automation_reason?: string;
    current_total_amount?: number;
    learned_total_amount?: number;
    total_validation?: any;
  };
}

interface UnifiedTableEditorProps {
  extractedData: ExtractedData;
  uploadData?: any;
  databaseFields: Array<{ id: string; display_name: string; description?: string }>;
  onDataUpdate: (data: any) => void;
  onSubmit: (finalData: any) => Promise<void>;
  selectedStatementDate?: any;
}

export default function UnifiedTableEditor({
  extractedData,
  uploadData,
  databaseFields,
  onDataUpdate,
  onSubmit,
  selectedStatementDate
}: UnifiedTableEditorProps) {
  const { theme, setTheme, actualTheme } = useTheme();
  const [viewMode, setViewMode] = useState<ViewMode>('field_mapping');  // Start with field_mapping instead of table_review
  const [userMappings, setUserMappings] = useState<Record<string, string>>({});
  const [acceptedMappings, setAcceptedMappings] = useState<Array<{field: string, mapsTo: string, confidence: number, sample: string}>>([]);
  const [skippedFields, setSkippedFields] = useState<Array<{field: string, mapsTo: string, confidence: number, sample: string}>>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Normalize tables: ensure summaryRows is a Set and apply format learning deletions
  const [tables, setTables] = useState(() => {
    let initialTables = extractedData.tables || [];
    
    // Apply format learning table deletions if available
    if (extractedData.format_learning?.auto_delete_tables) {
      const tablesToDelete = extractedData.format_learning.auto_delete_tables;
      console.log("📋 Applying format learning table deletions:", tablesToDelete);
      initialTables = initialTables.filter((_, index) => !tablesToDelete.includes(index));
    }
    
    // Apply format learning row deletions if available
    if (extractedData.format_learning?.auto_delete_rows) {
      const rowsToDelete = extractedData.format_learning.auto_delete_rows;
      console.log("📋 Applying format learning row deletions:", rowsToDelete);
      initialTables = initialTables.map(table => ({
        ...table,
        rows: table.rows?.filter((_: any, index: number) => !rowsToDelete.includes(index)) || []
      }));
    }
    
    return initialTables.map(table => ({
      ...table,
      summaryRows: table.summaryRows instanceof Set 
        ? table.summaryRows 
        : new Set(Array.isArray(table.summaryRows) ? table.summaryRows : [])
    }));
  });
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [approvalStep, setApprovalStep] = useState(0);
  const [approvalProgress, setApprovalProgress] = useState(0);
  const [isPreviewCollapsed, setIsPreviewCollapsed] = useState(false);
  const [isExtractingWithGPT, setIsExtractingWithGPT] = useState(false);
  const [currentTableIdx, setCurrentTableIdx] = useState(0);
  const [showSummaryRows, setShowSummaryRows] = useState(true);
  const [isLoadingAIMapping, setIsLoadingAIMapping] = useState(false);
  const [aiMappingStep, setAiMappingStep] = useState(0);
  const [aiMappingProgress, setAiMappingProgress] = useState(0);
  const [aiIntelligence, setAiIntelligence] = useState(extractedData.ai_intelligence);
  
  // AI Mapping Results state for new flow
  const [aiMappingResults, setAIMappingResults] = useState<any>(null);
  const [editedStatementFields, setEditedStatementFields] = useState<Record<string, string>>({});
  const [databaseFieldSelections, setDatabaseFieldSelections] = useState<Record<string, string>>({});
  const [aiMapperState, setAiMapperState] = useState<{
    rowStatuses: Record<string, 'pending' | 'approved' | 'skipped'>;
    editedStatementFields: Record<string, string>;
    duplicateFields: string[];
  }>({ rowStatuses: {}, editedStatementFields: {}, duplicateFields: [] });

  // CRITICAL FIX: Sync acceptedMappings and skippedFields from AI mapper state changes
  useEffect(() => {
    if (!aiMappingResults?.mappings) return;

    const newAcceptedMappings: Array<{field: string, mapsTo: string, confidence: number, sample: string}> = [];
    const newSkippedFields: Array<{field: string, mapsTo: string, confidence: number, sample: string}> = [];

    aiMappingResults.mappings.forEach((mapping: any) => {
      const status = aiMapperState.rowStatuses[mapping.extracted_field];
      
      if (status === 'approved') {
        newAcceptedMappings.push({
          field: mapping.extracted_field,
          mapsTo: mapping.mapped_to,
          confidence: mapping.confidence,
          sample: ''
        });
      } else if (status === 'skipped') {
        newSkippedFields.push({
          field: mapping.extracted_field,
          mapsTo: mapping.mapped_to,
          confidence: mapping.confidence,
          sample: ''
        });
      }
    });

    setAcceptedMappings(newAcceptedMappings);
    setSkippedFields(newSkippedFields);

    console.log('✅ Updated acceptedMappings:', newAcceptedMappings.length, 'fields');
    console.log('✅ Updated skippedFields:', newSkippedFields.length, 'fields');
  }, [aiMapperState.rowStatuses, aiMappingResults]);
  
  // ===== EDITABLE METADATA STATE =====
  const [editedCarrierName, setEditedCarrierName] = useState(
    extractedData?.carrierName || extractedData?.extracted_carrier || ''
  );
  const [editedPlanType, setEditedPlanType] = useState(
    extractedData?.ai_intelligence?.plan_type_detection?.detected_plan_types?.[0]?.plan_type || ''
  );
  const [editedStatementDate, setEditedStatementDate] = useState(
    extractedData?.statementDate || extractedData?.extracted_date || ''
  );
  const [isEditingMetadata, setIsEditingMetadata] = useState(false);

  // Get AI mappings from state (updated after "Continue to Field Mapping" is clicked)
  const aiMappings = aiIntelligence?.field_mapping?.mappings || [];

  // Initialize AI mapping results from extraction data
  useEffect(() => {
    if (!aiMappingResults) {
      // Check for format learning suggested mappings first
      if (extractedData?.format_learning?.suggested_mapping && extractedData?.format_learning?.found_match) {
        // Convert format learning suggested mappings to AI mapping format
        const suggestedMappings = extractedData.format_learning.suggested_mapping;
        const mappings = Object.entries(suggestedMappings).map(([field, dbField]) => ({
          statement_field: field,
          database_field: dbField as string,
          confidence_score: extractedData.format_learning?.match_score || 0.9,
          sample_value: '',  // Will be populated from table data
          is_from_learned_format: true
        }));
        
        setAIMappingResults({
          ai_enabled: true,
          mappings: mappings,
          unmapped_fields: [],
          confidence: extractedData.format_learning?.match_score || 0.9,
          learned_format_used: true
        });
      } else if (extractedData?.ai_intelligence?.field_mapping) {
        // Fall back to AI intelligence mappings
        setAIMappingResults(extractedData.ai_intelligence.field_mapping);
      }
    }
  }, [extractedData]);

  // AI field mapping now happens during extraction, not when viewing the field mapping screen
  // This prevents duplicate API calls and loading states


  // Define approval process steps
  const APPROVAL_STEPS: UploadStep[] = [
    {
      id: 'saving_tables',
      order: 1,
      title: 'Saving Table Data',
      description: 'Storing your edited table data...',
      estimatedDuration: 2000
    },
    {
      id: 'learning_format',
      order: 2,
      title: 'Learning Format',
      description: 'Learning format patterns for future uploads...',
      estimatedDuration: 1500
    },
    {
      id: 'saving_mappings',
      order: 3,
      title: 'Saving Field Mappings',
      description: 'Storing your field mapping configuration...',
      estimatedDuration: 1500
    },
    {
      id: 'processing_commission',
      order: 4,
      title: 'Processing Commission Data',
      description: 'Calculating commission amounts...',
      estimatedDuration: 3000
    },
    {
      id: 'finalizing',
      order: 5,
      title: 'Finalizing',
      description: 'Completing the approval process...',
      estimatedDuration: 1000
    }
  ];
  
  // Define AI Field Mapping steps
  const AI_MAPPING_STEPS: UploadStep[] = [
    {
      id: 'analyzing_table',
      order: 1,
      title: 'Analyzing Table Structure',
      description: 'Understanding your edited table data...',
      estimatedDuration: 1000
    },
    {
      id: 'checking_learned_formats',
      order: 2,
      title: 'Checking Learned Formats',
      description: 'Looking for previously saved mappings...',
      estimatedDuration: 1500
    },
    {
      id: 'generating_mappings',
      order: 3,
      title: 'AI Field Mapping',
      description: 'Generating intelligent field suggestions...',
      estimatedDuration: 3000
    },
    {
      id: 'finalizing_mappings',
      order: 4,
      title: 'Finalizing',
      description: 'Preparing field mapping suggestions...',
      estimatedDuration: 500
    }
  ];
  
  
  // Calculate mapping statistics
  const mappingStats: MappingStats = useMemo(() => {
    const allMappings = [...aiMappings];
    const total = allMappings.length;
    
    // Get list of accepted field names (check case-insensitively)
    const acceptedFieldNames = new Set(
      acceptedMappings.map(m => m.field.toLowerCase())
    );
    const userMappedFieldNames = new Set(
      Object.keys(userMappings).map(k => k.toLowerCase())
    );
    // Get list of skipped field names (check case-insensitively)
    const skippedFieldNames = new Set(
      skippedFields.map(m => m.field.toLowerCase())
    );
    
    // Count mappings by status, considering user acceptances and skipped fields
    let mapped = 0;
    let needsReview = 0;
    let unmapped = 0;
    
    allMappings.forEach(mapping => {
      const fieldNameLower = mapping.extracted_field.toLowerCase();
      const isAccepted = acceptedFieldNames.has(fieldNameLower) || 
                        userMappedFieldNames.has(fieldNameLower);
      const isSkipped = skippedFieldNames.has(fieldNameLower);
      
      // Skip counting skipped fields in the statistics
      if (isSkipped) {
        return;
      }
      
      if (isAccepted || mapping.confidence >= 0.8) {
        mapped++;
      } else if (mapping.confidence >= 0.6) {
        needsReview++;
      } else {
        unmapped++;
      }
    });

    

    const stats = { mapped, needsReview, unmapped, total };
    
    // Debug logging for mapping stats
    console.log('📊 Mapping Stats Calculated:', stats);
    console.log('  - aiMappings:', aiMappings.length);
    console.log('  - acceptedMappings:', acceptedMappings.length);
    console.log('  - skippedFields:', skippedFields.length);
    console.log('  - userMappings:', Object.keys(userMappings).length);
    
    return stats;
  }, [aiMappings, userMappings, acceptedMappings, skippedFields]);

  const handleModeTransition = async (newMode: ViewMode) => {
    if (isTransitioning) return;
    
    // Simple mode transition without AI field mapping (AI mapping happens during extraction)
    setIsTransitioning(true);
    await new Promise(resolve => setTimeout(resolve, 150));
    setViewMode(newMode);
    await new Promise(resolve => setTimeout(resolve, 300));
    setIsTransitioning(false);
  };

  const handleFinalSubmission = async () => {
    setIsSubmitting(true);
    setApprovalStep(0);
    setApprovalProgress(0);

    try {
      // Debug logging to see what data we have
      
      const upload_id = uploadData?.upload_id || uploadData?.id || extractedData?.upload_id;
      const company_id = uploadData?.company_id || extractedData?.company_id;
      const carrier_id = extractedData?.carrier_id || uploadData?.carrier_id;
      
      
      if (!upload_id) {
        throw new Error('Upload ID is missing');
      }
      
      if (!carrier_id && !company_id) {
        throw new Error('Company ID or Carrier ID is required. Please check the extraction response.');
      }

      // Use the provided selectedStatementDate or parse from editedStatementDate or extractedData
      
      let statementDateObj = selectedStatementDate;
      
      // If not provided as prop, try to parse from editedStatementDate (user manually edited) or extractedData
      if (!statementDateObj) {
        // No selectedStatementDate prop provided, parsing from editedStatementDate or extractedData
        const statementDateStr = editedStatementDate || extractedData?.statementDate || extractedData?.extracted_date || '';
        const dateParts = statementDateStr.split('/');
        statementDateObj = dateParts.length === 3 ? {
          month: parseInt(dateParts[0]),
          day: parseInt(dateParts[1]),
          year: parseInt(dateParts[2]),
          date: statementDateStr
        } : null;
      }
      
      // Ensure the statement date object has the correct structure
      if (statementDateObj && statementDateObj.date) {
        const dateStr = statementDateObj.date;
        const dateParts = dateStr.split('/');
        if (dateParts.length === 3) {
          statementDateObj = {
            month: parseInt(dateParts[0]),
            day: parseInt(dateParts[1]),
            year: parseInt(dateParts[2]),
            date: dateStr,
            ...statementDateObj // Keep any other properties like confidence, source
          };
        }
      }
      
      // Final statementDateObj determined

      // Merge AI mappings with user mappings (including accepted mappings)
      const finalMappings = { ...userMappings };
      
      // Add accepted mappings
      acceptedMappings.forEach(mapping => {
        if (!finalMappings[mapping.field]) {
          finalMappings[mapping.field] = mapping.mapsTo;
        }
      });

   

      // STEP 1: Save Table Data
      setApprovalStep(0);
      setApprovalProgress(20);
      
      // CRITICAL FIX: Create a snapshot of current tables to ensure deleted rows are excluded
      // Create a snapshot of current tables to ensure deleted rows are excluded
      
      // CRITICAL: Use current tables state, NOT extractedData.tables!
      // extractedData.tables contains the ORIGINAL unedited data
      const currentTablesSnapshot = tables.map(table => ({
        name: table.name || 'Unnamed Table',
        header: table.header || table.headers || [],
        rows: table.rows || [], // This will NOT include deleted rows
        summaryRows: Array.from(table.summaryRows || []), // Convert Set to Array
        extractor: table.extractor || 'manual',
        metadata: table.metadata || {}
      }));
      
      // Verification: Ensure we're not accidentally using original data
      if (extractedData.tables && extractedData.tables[0]?.rows?.length !== currentTablesSnapshot[0]?.rows?.length) {
        // Row count mismatch detected between original and edited data
      }
      
      // Tables snapshot created
      
      // CRITICAL FIX: Convert field mappings to field_config format for format learning
      // This ensures field mappings are saved to format learning for future auto-approval
      const fieldConfigForLearning = Object.entries(finalMappings).map(([field, mapping]) => ({
        field: field,           // Source field from extracted data
        mapping: mapping        // Target field in database
      }));
      
      // Log the exact payload being sent to backend (use edited values)
      const saveTablesPayload = {
        upload_id: upload_id,
        tables: currentTablesSnapshot,
        company_id: carrier_id || company_id,
        selected_statement_date: statementDateObj,
        extracted_carrier: editedCarrierName || extractedData?.carrierName || extractedData?.extracted_carrier,
        extracted_date: editedStatementDate || extractedData?.extracted_date,
        field_config: fieldConfigForLearning  // CRITICAL: Include field_config for format learning
      };
      
      // Sending save-tables request with field mappings
      console.log('🔍 Save-tables payload includes field_config:', fieldConfigForLearning.length, 'mappings');
      
      const saveTablesResponse = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/table-editor/save-tables/`,
        saveTablesPayload,
        { withCredentials: true }
      );
      
      // Save-tables response received

      // ✅ CRITICAL: Get updated carrier_id from response (use edited value)
      const updatedCarrierId = saveTablesResponse.data?.carrier_id || carrier_id || company_id;
      const updatedCarrierName = saveTablesResponse.data?.carrier_name || editedCarrierName || extractedData?.carrierName || extractedData?.extracted_carrier;
      
      setApprovalProgress(40);

      // STEP 2: Learn Format Patterns
      setApprovalStep(1);
      
      try {
        // CRITICAL FIX: Use the same snapshot to ensure format learning uses edited data
        await axios.post(
          `${process.env.NEXT_PUBLIC_API_URL}/api/table-editor/learn-format-patterns`,
          {
            upload_id: upload_id,
            tables: currentTablesSnapshot,
            company_id: updatedCarrierId, // Use updated carrier_id from save response
            selected_statement_date: statementDateObj,
            extracted_carrier: updatedCarrierName, // Already uses edited value
            extracted_date: editedStatementDate || extractedData?.extracted_date
          },
          { withCredentials: true }
        );
      } catch (learningError) {
        console.warn('⚠️ Format learning failed, continuing...', learningError);
        // Continue even if format learning fails
      }
      
      setApprovalProgress(60);

      // STEP 3: Save Field Mappings
      setApprovalStep(2);
      
      // Convert mappings to field config format for database fields
      const fieldConfig = Object.entries(finalMappings).map(([extractedField, mappedTo]) => ({
        display_name: mappedTo,
        source_field: extractedField
      }));

      // Get plan types from AI intelligence state (use edited value if available)
      const planTypes = editedPlanType 
        ? [editedPlanType] 
        : (aiIntelligence?.plan_type_detection?.detected_plan_types?.map(
            (pt: any) => pt.plan_type
          ) || []);

      // CRITICAL FIX: Use the snapshot for consistency and the selected table index
      const selectedTable = currentTablesSnapshot[currentTableIdx] || currentTablesSnapshot[0] || {};
      const tableData = selectedTable.rows || [];
      const headers = selectedTable.header || [];

      // Build the payload matching backend MappingConfig schema
      const mappingPayload = {
        mapping: finalMappings,  // Direct field-to-field mappings
        plan_types: planTypes,
        field_config: databaseFields.map(field => ({
          display_name: field.display_name,
          description: field.description || ''
        })),
        table_data: tableData,
        headers: headers,
        selected_statement_date: statementDateObj
      };


      await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/companies/${updatedCarrierId}/mapping/?upload_id=${upload_id}`, // Use updated carrier_id
        mappingPayload,
        { withCredentials: true }
      );

      // Save user corrections for AI learning
      try {
        // Build original mappings from AI suggestions
        const originalMappings: Record<string, string> = {};
        const correctedMappings: Record<string, string> = {};
        
        // Get AI mappings from aiMappingResults
        if (aiMappingResults?.mappings) {
          aiMappingResults.mappings.forEach((mapping: FieldMapping) => {
            originalMappings[mapping.extracted_field] = mapping.mapped_to_column;
            // Include user edits and selections
            const editedField = editedStatementFields[mapping.extracted_field] || mapping.extracted_field;
            const selectedDbField = databaseFieldSelections[mapping.extracted_field] || mapping.mapped_to_column;
            correctedMappings[editedField] = selectedDbField;
          });
        }
        
        // Also include any manual mappings not from AI
        Object.entries(finalMappings).forEach(([field, mappedTo]) => {
          if (!correctedMappings[field]) {
            correctedMappings[field] = mappedTo as string;
          }
        });
        
        // Get auth token
        const token = localStorage.getItem('token') || '';
        
        // Save corrections for AI learning
        await saveUserCorrections(
          upload_id,
          updatedCarrierId,
          originalMappings,
          correctedMappings,
          headers,
          token
        );
        
        // AI learning data saved successfully
      } catch (learningError) {
        // AI learning save failed, continuing
        // Continue even if AI learning fails
      }

      setApprovalProgress(80);

      // STEP 4: Process Commission Data (Final Approval)
      setApprovalStep(3);
      
      // CRITICAL FIX: Filter out summary tables to prevent duplicate calculations
      // Summary tables contain aggregated data that would cause double-counting
      const summaryTableTypes = ['summary_table', 'total_summary', 'vendor_total', 'grand_total', 'summary'];
      
      const commissionTables = currentTablesSnapshot.filter(table => {
        const tableType = (table.metadata?.table_type || (table as any).table_type || '').toLowerCase();
        
        // Skip summary tables
        if (summaryTableTypes.includes(tableType)) {
          console.log(`🔍 Skipping summary table: ${table.name} (type: ${tableType})`);
          return false;
        }
        
        // Also skip tables where ALL rows are summary rows
        const summaryRowsArray = Array.from(table.summaryRows || []);
        if (table.rows && summaryRowsArray.length > 0 && summaryRowsArray.length === table.rows.length) {
          console.log(`🔍 Skipping table ${table.name} - all ${table.rows.length} rows are summary rows`);
          return false;
        }
        
        return true;
      });
      
      console.log(`🔍 Filtered ${currentTablesSnapshot.length} tables down to ${commissionTables.length} commission tables for approval`);
      
      // Use filtered commission tables for final data
      const finalData = commissionTables.map(table => {
        const tableHeaders = table.header;
        const tableRows = table.rows;
        
        // Convert each row from array to dictionary with header names as keys
        const transformedRows = tableRows.map((row: any[]) => {
          const rowDict: Record<string, any> = {};
          tableHeaders.forEach((header: string, index: number) => {
            rowDict[header] = row[index] || '';
          });
          return rowDict;
        });
        
        return {
          name: table.name,
          header: tableHeaders,
          rows: transformedRows,  // Now an array of dictionaries, WITHOUT deleted rows
          summaryRows: table.summaryRows  // CRITICAL: Include summary rows for backend filtering
        };
      });
      
      // Final data for approval prepared

      // planTypes already defined above in Step 3

      await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/review/approve/`,
        {
          upload_id: upload_id,
          final_data: finalData,
          field_config: fieldConfig,
          plan_types: planTypes,
          selected_statement_date: statementDateObj
        },
        { withCredentials: true }
      );

      
      // STEP 5: Finalizing
      setApprovalStep(4);
      setApprovalProgress(100);
      
      // Show success message
      toast.success('Statement approved successfully! 🎉');
      
      // Wait a moment to show completion
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Redirect to carriers tab and open the specific carrier
      const carrierName = editedCarrierName || extractedData?.extracted_carrier || extractedData?.carrierName || extractedData?.document_metadata?.carrier_name;
      
      if (carrierName) {
        // Redirect to carriers tab with the specific carrier opened (using 'carrier' param for consistency with UploadPageContent)
        window.location.href = `/?tab=carriers&carrier=${encodeURIComponent(carrierName)}`;
      } else {
        // Final fallback: redirect to carriers tab
        window.location.href = '/?tab=carriers';
      }

    } catch (error: any) {
      console.error('❌ Submission error:', error);
      
      // Show specific error message
      const errorMessage = error?.response?.data?.detail || 
                          error?.response?.data?.message || 
                          error?.message || 
                          'Failed to approve statement';
      
      toast.error(`Error: ${errorMessage}`);
      setIsSubmitting(false);
    }
  };

  const handleTablesChange = (updatedTables: any[]) => {
    // Normalize tables to ensure summaryRows is a Set
    const normalizedTables = updatedTables.map(table => ({
      ...table,
      summaryRows: table.summaryRows instanceof Set 
        ? table.summaryRows 
        : new Set(Array.isArray(table.summaryRows) ? table.summaryRows : [])
    }));
    
    // Tables updated with normalized data
    
    setTables(normalizedTables);
    onDataUpdate({ ...extractedData, tables: normalizedTables });
  };

  // Handle GPT extraction
  const handleExtractWithGPT = async () => {
    setIsExtractingWithGPT(true);
    
    try {
      const upload_id = uploadData?.upload_id || uploadData?.id || extractedData?.upload_id;
      const company_id = uploadData?.company_id || extractedData?.company_id || extractedData?.carrier_id;
      
      if (!upload_id || !company_id) {
        throw new Error('Missing upload_id or company_id');
      }

      
      // Call the GPT extraction endpoint
      const formData = new FormData();
      formData.append('upload_id', upload_id);
      formData.append('company_id', company_id);
      
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/extract-tables-gpt/`,
        formData,
        { 
          withCredentials: true,
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        }
      );

      if (response.data.success) {
        
        // Update tables with the new extraction
        const newTables = (response.data.tables || []).map((table: any) => ({
          ...table,
          summaryRows: table.summaryRows instanceof Set 
            ? table.summaryRows 
            : new Set(Array.isArray(table.summaryRows) ? table.summaryRows : [])
        }));
        const newDocumentMetadata = response.data.document_metadata || {};
        
        // Update local state
        setTables(newTables);
        
        // Update parent with new extraction data including document_metadata
        const updatedExtractedData = { 
          ...extractedData, 
          tables: newTables,
          extraction_method: 'gpt4o_vision_enhanced',
          document_metadata: newDocumentMetadata,
          carrierName: newDocumentMetadata.carrier_name || extractedData.carrierName,
          statementDate: newDocumentMetadata.statement_date || extractedData.statementDate,
        };
        
        // Update edited metadata state with new values
        if (newDocumentMetadata.carrier_name) {
          setEditedCarrierName(newDocumentMetadata.carrier_name);
        }
        if (newDocumentMetadata.statement_date) {
          setEditedStatementDate(newDocumentMetadata.statement_date);
        }
        
        onDataUpdate(updatedExtractedData);
        
        toast.success(`GPT extraction completed! Extracted ${newTables.length} table(s) with metadata`);
      } else {
        throw new Error(response.data.error || 'GPT extraction failed');
      }
    } catch (error: any) {
      console.error('❌ GPT extraction error:', error);
      const errorMessage = error?.response?.data?.detail || 
                          error?.response?.data?.message || 
                          error?.message || 
                          'Failed to extract with GPT';
      toast.error(`Error: ${errorMessage}`);
    } finally {
      setIsExtractingWithGPT(false);
    }
  };

  // Handle table switching in field mapping mode
  const handleTableSwitch = async (newIndex: number) => {
    if (newIndex === currentTableIdx || newIndex < 0 || newIndex >= tables.length) {
      return;
    }

    // Update the current table index
    setCurrentTableIdx(newIndex);
    
    // Clear accepted mappings when switching tables as they're table-specific
    setAcceptedMappings([]);
    setUserMappings({});
    
    toast.success(`Switched to Table ${newIndex + 1}. Please review and accept field mappings for this table.`);
    
    // Note: If backend AI re-mapping is needed, add API call here
    // For now, we just switch the visible table and user can manually map fields
  };

  return (
    <div className="h-screen bg-gray-50 dark:bg-slate-900 flex flex-col overflow-x-hidden">
      {/* Premium Progress Loader - Shows during submission OR AI mapping */}
      <PremiumProgressLoader
        currentStep={isLoadingAIMapping ? aiMappingStep : approvalStep}
        steps={isLoadingAIMapping ? AI_MAPPING_STEPS : APPROVAL_STEPS}
        progress={isLoadingAIMapping ? aiMappingProgress : approvalProgress}
        isVisible={isSubmitting || isLoadingAIMapping}
      />
        
        {/* Premium Header */}
      <div className="bg-white dark:bg-slate-800 shadow-sm border-b border-gray-200 dark:border-slate-700 px-6 py-4 flex-shrink-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-3">
              {viewMode === 'table_review' ? (
                <>
                  <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                  <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <h1 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Review Extracted Data</h1>
                    <p className="text-xs text-gray-500 dark:text-slate-400">Verify and edit table contents</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                  <Map className="w-5 h-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <h1 className="text-lg font-semibold text-gray-900 dark:text-slate-100">AI Field Mapping</h1>
                    <p className="text-xs text-gray-500 dark:text-slate-400">Review intelligent field suggestions</p>
                  </div>
                </>
              )}
            </div>
            
            {/* Progress Indicator */}
            <div className="flex items-center space-x-2 ml-4 px-3 py-1.5 bg-gray-100 dark:bg-slate-700 rounded-full">
              <div className={`w-2 h-2 rounded-full ${viewMode === 'table_review' ? 'bg-blue-600 animate-pulse' : 'bg-green-600'}`} />
              <span className="text-sm font-medium text-gray-700 dark:text-slate-300">
                Step {viewMode === 'field_mapping' ? '1' : '2'} of 2
              </span>
            </div>

            {/* Plan Type Detection - Compact */}
            {viewMode === 'field_mapping' && aiIntelligence?.plan_type_detection && (
              <div className="ml-4 px-2 py-1">
                <div className="flex items-center space-x-2">
                  <svg className="w-5 h-5 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                  </svg>
                  <div>
                    <span className="text-xs text-purple-600 dark:text-purple-400 font-semibold block">Plan Type</span>
                    <span className="text-sm font-bold text-gray-900 dark:text-slate-100">
                      {aiIntelligence?.plan_type_detection?.detected_plan_types?.[0]?.plan_type || 'Unknown'}
                    </span>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ml-2 ${
                    (aiIntelligence?.plan_type_detection?.confidence ?? 0) >= 0.8 ? 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400' :
                    (aiIntelligence?.plan_type_detection?.confidence ?? 0) >= 0.6 ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300' :
                    'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'
                  }`}>
                    {Math.round((aiIntelligence?.plan_type_detection?.confidence ?? 0) * 100)}%
                  </span>
                </div>
              </div>
            )}
          </div>
          
          {/* Metadata Display - Professional Cards with Borders and Backgrounds */}
          <div className="flex items-center space-x-3">
            {/* Carrier Name - Editable */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-700 rounded-lg px-3 py-2">
              <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 block uppercase tracking-wide mb-1">Carrier</span>
              {isEditingMetadata ? (
                <input
                  type="text"
                  value={editedCarrierName}
                  onChange={(e) => setEditedCarrierName(e.target.value)}
                  className="text-sm font-bold text-gray-900 dark:text-slate-100 bg-white dark:bg-slate-800 border border-blue-300 dark:border-blue-600 rounded px-2 py-1 w-40"
                  placeholder="Enter carrier name"
                />
              ) : (
                <span className="text-sm font-bold text-blue-900 dark:text-blue-100 block">
                  {editedCarrierName || 'Unknown'}
                </span>
              )}
            </div>
            
            {/* Broker - Display Only */}
            <div className="bg-purple-50 dark:bg-purple-900/20 border-2 border-purple-200 dark:border-purple-700 rounded-lg px-3 py-2">
              <span className="text-xs font-semibold text-purple-600 dark:text-purple-400 block uppercase tracking-wide mb-1">Broker</span>
              <span className="text-sm font-bold text-purple-900 dark:text-purple-100 block">
                {extractedData?.document_metadata?.broker_company || 'Not detected'}
              </span>
            </div>
            
            {/* Plan Type - Editable */}
            <div className="bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-700 rounded-lg px-3 py-2">
              <span className="text-xs font-semibold text-green-600 dark:text-green-400 block uppercase tracking-wide mb-1">Plan Type</span>
              {isEditingMetadata ? (
                <input
                  type="text"
                  value={editedPlanType}
                  onChange={(e) => setEditedPlanType(e.target.value)}
                  className="text-sm font-bold text-gray-900 dark:text-slate-100 bg-white dark:bg-slate-800 border border-green-300 dark:border-green-600 rounded px-2 py-1 w-40"
                  placeholder="Enter plan type"
                />
              ) : (
                <span className="text-sm font-bold text-green-900 dark:text-green-100 block">
                  {editedPlanType || 'Not detected'}
                </span>
              )}
            </div>
            
            {/* Statement Date - Editable with Datepicker */}
            <div className="bg-orange-50 dark:bg-orange-900/20 border-2 border-orange-200 dark:border-orange-700 rounded-lg px-3 py-2">
              <span className="text-xs font-semibold text-orange-600 dark:text-orange-400 block uppercase tracking-wide mb-1">Statement Date</span>
              {isEditingMetadata ? (
                <input
                  type="date"
                  value={editedStatementDate ? (() => {
                    // Convert MM/DD/YYYY to YYYY-MM-DD for date input
                    const parts = editedStatementDate.split('/');
                    if (parts.length === 3) {
                      return `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
                    }
                    return '';
                  })() : ''}
                  onChange={(e) => {
                    // Convert YYYY-MM-DD to MM/DD/YYYY
                    const dateValue = e.target.value;
                    if (dateValue) {
                      const [year, month, day] = dateValue.split('-');
                      setEditedStatementDate(`${month}/${day}/${year}`);
                    } else {
                      setEditedStatementDate('');
                    }
                  }}
                  className="text-sm font-bold text-gray-900 dark:text-slate-100 bg-white dark:bg-slate-800 border border-orange-300 dark:border-orange-600 rounded px-2 py-1 w-36"
                />
              ) : (
                <span className="text-sm font-bold text-orange-900 dark:text-orange-100 block">
                  {editedStatementDate || 'Not detected'}
                </span>
              )}
            </div>
            
            {/* Edit/Save Button */}
            <button
              onClick={() => {
                if (isEditingMetadata) {
                  // Save changes
                  toast.success('Metadata updated! These values will be used throughout the workflow and saved in format learning.', {
                    duration: 4000
                  });
                }
                setIsEditingMetadata(!isEditingMetadata);
              }}
              className={`px-4 py-2.5 rounded-lg shadow-md hover:shadow-lg transition-all font-semibold text-sm ${
                isEditingMetadata 
                  ? 'bg-green-500 dark:bg-green-600 text-white border border-green-600 dark:border-green-700' 
                  : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-300 border border-gray-300 dark:border-slate-600'
              }`}
              title={isEditingMetadata ? 'Save changes' : 'Edit carrier, plan type, or date'}
            >
              {isEditingMetadata ? '✓ Save' : '✏️ Edit'}
            </button>
            
            {viewMode === 'field_mapping' && (
              <div className="px-2 py-1">
                <span className="text-xs font-medium text-green-600 dark:text-green-400 block uppercase tracking-wide mb-0.5">Accepted</span>
                <span className="text-base font-bold text-green-900 dark:text-green-100">
                  {acceptedMappings.length} fields
                </span>
              </div>
            )}
            
            {/* Theme Toggle Button */}
            <button
              onClick={() => setTheme(actualTheme === 'dark' ? 'light' : 'dark')}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              aria-label={`Switch to ${actualTheme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {actualTheme === 'dark' ? <Sun className="w-5 h-5 text-slate-500 dark:text-slate-400" /> : <Moon className="w-5 h-5 text-slate-500 dark:text-slate-400" />}
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area - Premium 2-Column Layout */}
      <div className="flex-1 flex overflow-x-hidden overflow-y-auto min-w-0">
        
        {/* Left Panel - PDF Viewer (Always visible) */}
        <div className={`${isPreviewCollapsed ? 'w-0' : 'w-[30%]'} flex-shrink-0 transition-all duration-300`}>
          <PDFViewer
            fileUrl={extractedData?.gcs_url || extractedData?.file_name || ''}
            isCollapsed={isPreviewCollapsed}
            onToggleCollapse={() => setIsPreviewCollapsed(!isPreviewCollapsed)}
          />
        </div>



        {/* Right Panel - Conditional Content based on viewMode */}
        <div className="flex-1 w-[70%] min-w-0 overflow-x-hidden">
          {viewMode === 'field_mapping' ? (
            // Show AI Field Mapper in field mapping mode
            <AIFieldMapperTable
              mappingResults={aiMappingResults}
              onReviewTable={() => setViewMode('table_review')}
              tableData={tables?.[currentTableIdx]?.rows}
              tableHeaders={tables?.[currentTableIdx]?.header || tables?.[currentTableIdx]?.headers}
              isLoading={isLoadingAIMapping}
              databaseFields={databaseFields}
              onStateChange={setAiMapperState}
            />
          ) : (
            // Show ExtractedDataTable in review mode
              <div className={`h-full w-full transition-opacity duration-500 ${
                isTransitioning ? 'opacity-0' : 'opacity-100'
              }`}>
                {tables && tables.length > 0 && tables[currentTableIdx] && (
                  <ExtractedDataTable
                    table={tables[currentTableIdx]}
                    onTableChange={(updatedTable) => {
                      const updatedTables = [...tables];
                      updatedTables[currentTableIdx] = updatedTable;
                      handleTablesChange(updatedTables);
                    }}
                    showSummaryRows={showSummaryRows}
                    onToggleSummaryRows={() => setShowSummaryRows(!showSummaryRows)}
                  />
                )}
                {tables && tables.length === 0 && (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <div className="text-gray-500 text-lg">No tables available</div>
                    </div>
                  </div>
                )}
              </div>
          )}
        </div>
      </div>

      {/* Action Bar - Context Sensitive */}
      <ActionBar
        viewMode={viewMode}
        mappingStats={mappingStats}
        onModeChange={handleModeTransition}
        onFinalSubmit={handleFinalSubmission}
        isSubmitting={isSubmitting}
        canProceed={
          // Allow submission if:
          // 1. No fields need review, OR
          // 2. All non-skipped AI mappings have been explicitly accepted by the user
          mappingStats.needsReview === 0 || 
          acceptedMappings.length >= (aiMappings.length - skippedFields.length)
        }
        isTransitioning={isTransitioning}
        carrierName={editedCarrierName}
        statementDate={editedStatementDate}
      />
    </div>
  );
}
