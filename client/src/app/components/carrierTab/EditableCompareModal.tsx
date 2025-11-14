"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { X, FileText, Map, Save, Loader2, CheckCircle } from 'lucide-react';
import dynamic from 'next/dynamic';
import axios from 'axios';
import toast from 'react-hot-toast';

// Dynamically import components to avoid SSR issues
const PDFViewer = dynamic(() => import('../upload/PDFViewer'), { 
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-full">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
  </div>
});

const ExtractedDataTable = dynamic(() => import('../review-extracted-data/table/ExtractedDataTable'), { ssr: false });
const AIFieldMapperTable = dynamic(() => import('../upload/AIFieldMapperTable'), { ssr: false });

// Types
interface Statement {
  id: string;
  file_name: string;
  uploaded_at: string;
  status: string;
  carrier_id?: string;  // Insurance carrier ID
  selected_statement_date?: any;
  raw_data?: any;
  edited_tables?: any;
  final_data?: any;
  gcs_key?: string;
  gcs_url?: string;
  automated_approval?: boolean;
  automation_timestamp?: string;
  total_amount_match?: boolean | null;
  extracted_total?: number;  // Earned commission total extracted from document
  extracted_invoice_total?: number;  // Invoice total calculated from table data
  // ✅ FIX: Correct property name to match API response (field_mapping with underscore)
  field_mapping?: Record<string, string> | null;  // Field mappings from format learning
  field_config?: Array<Record<string, any>> | null;  // Field config for fallback reconstruction
}

interface Props {
  statement: Statement;
  onClose: () => void;
  onComplete: () => void;
}

type ViewMode = 'table_review' | 'field_mapping';

export default function EditableCompareModal({ statement, onClose, onComplete }: Props) {
  // State Management
  const [viewMode, setViewMode] = useState<ViewMode>('table_review');
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState(0);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isLoadingAI, setIsLoadingAI] = useState(false);
  
  // Data State
  const [tables, setTables] = useState<any[]>([]);
  const [currentTableIndex, setCurrentTableIndex] = useState(0);
  const [aiMappingResults, setAIMappingResults] = useState<any>(null);
  const [acceptedMappings, setAcceptedMappings] = useState<Array<{
    field: string;
    mapsTo: string;
    confidence: number;
    sample: string;
  }>>([]);
  const [skippedFields, setSkippedFields] = useState<Array<{
    field: string;
    mapsTo: string;
    confidence: number;
    sample: string;
  }>>([]);
  const [userMappings, setUserMappings] = useState<Record<string, string>>({});
  const [aiMapperState, setAiMapperState] = useState({
    rowStatuses: {} as Record<string, 'pending' | 'approved' | 'skipped'>,
    editedStatementFields: {} as Record<string, string>,
    duplicateFields: [] as string[],
    databaseFieldSelections: {} as Record<string, string>  // CRITICAL FIX: Track dropdown selections
  });

  // Database fields (fetch from API or pass as prop)
  const [databaseFields, setDatabaseFields] = useState<Array<{
    id: string;
    display_name: string;
    description?: string;
  }>>([]);

  // Metadata
  const [editedCarrierName, setEditedCarrierName] = useState(statement.selected_statement_date?.carrier_name || '');
  const [editedStatementDate, setEditedStatementDate] = useState(statement.selected_statement_date?.date || '');

 

  // Load PDF URL
  useEffect(() => {
    const fetchPdfUrl = async () => {
      if (!statement?.gcs_key && !statement?.file_name) {
        setLoading(false);
        return;
      }

      try {
        const gcsKey = statement.gcs_key || statement.file_name;
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
        const url = `${apiUrl}/api/pdf-preview?gcs_key=${encodeURIComponent(gcsKey)}`;
        
        const response = await fetch(url, { credentials: 'include' });
        
        if (response.ok) {
          const data = await response.json();
          setPdfUrl(data.url);
        } else {
          console.error('Failed to fetch PDF');
        }
      } catch (err) {
        console.error('Error fetching PDF:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchPdfUrl();
  }, [statement]);

  // Load tables and AI mappings
  useEffect(() => {
    const tableData = statement.edited_tables || statement.raw_data;
    if (Array.isArray(tableData) && tableData.length > 0) {
      console.log('🔍 EditableCompareModal: Loading tables from statement:', 
        tableData.map((t, i) => ({ 
          index: i, 
          name: t.name, 
          rowCount: t.rows?.length || 0, 
          summaryRowsType: t.summaryRows?.constructor?.name,
          summaryRowsCount: t.summaryRows instanceof Set ? t.summaryRows.size : (Array.isArray(t.summaryRows) ? t.summaryRows.length : 0),
          summaryRowsValue: t.summaryRows instanceof Set ? Array.from(t.summaryRows) : t.summaryRows
        }))
      );
      
      // CRITICAL FIX: Normalize summaryRows to ensure it's always an array
      // Backend might return {} for empty summaryRows which breaks validation
      const normalizedTables = tableData.map(table => ({
        ...table,
        summaryRows: Array.isArray(table.summaryRows) 
          ? table.summaryRows 
          : (table.summaryRows instanceof Set 
            ? Array.from(table.summaryRows) 
            : [])  // Convert {} or any non-array/Set to []
      }));
      
      console.log('✅ EditableCompareModal: Normalized summaryRows for all tables');
      setTables(normalizedTables);
      setCurrentTableIndex(0);
    }
  }, [statement]);

  // Fetch database fields
  useEffect(() => {
    const fetchDatabaseFields = async () => {
      try {
        const response = await axios.get(
          `${process.env.NEXT_PUBLIC_API_URL}/api/database-fields/?active_only=true`,
          { withCredentials: true }
        );
        // API returns array directly, not wrapped in { fields: [] }
        const fields = Array.isArray(response.data) ? response.data : [];
       
        setDatabaseFields(fields);
      } catch (error) {
        console.error('❌ Failed to fetch database fields:', error);
        toast.error('Failed to load database fields');
      }
    };

    fetchDatabaseFields();
  }, []);



  // Sync accepted/skipped mappings from AI mapper state
  useEffect(() => {
    if (!aiMappingResults?.mappings) return;

    const newAccepted: typeof acceptedMappings = [];
    const newSkipped: typeof skippedFields = [];

    aiMappingResults.mappings.forEach((mapping: any) => {
      const status = aiMapperState.rowStatuses[mapping.extracted_field];
      if (status === 'approved') {
        newAccepted.push({
          field: mapping.extracted_field,
          mapsTo: mapping.mapped_to,
          confidence: mapping.confidence,
          sample: ''
        });
      } else if (status === 'skipped') {
        newSkipped.push({
          field: mapping.extracted_field,
          mapsTo: mapping.mapped_to,
          confidence: mapping.confidence,
          sample: ''
        });
      }
    });

    setAcceptedMappings(newAccepted);
    setSkippedFields(newSkipped);
  }, [aiMapperState.rowStatuses, aiMappingResults]);

  // Handle table changes
  const handleTablesChange = (updatedTables: any[]) => {
    setTables(updatedTables);
  };

  // Fetch format learned mappings when view mode changes to field_mapping
  useEffect(() => {
    // Don't fetch if not in field mapping mode or if already loaded
    if (viewMode !== 'field_mapping') return;
    if (aiMappingResults) return;

    const loadFieldMappings = async () => {
      try {
        setIsLoadingAI(true);

        // ✅ FIX: Use correct property name from API (field_mapping with underscore)
        let formatLearnedMappings = (statement as any).field_mapping;
        
        // FALLBACK: If field_mapping is null, try to extract from field_config
        // This handles statements approved before the field_mapping save fix
        if (!formatLearnedMappings && statement.field_config && Array.isArray(statement.field_config)) {
          console.log('🔄 EditableCompareModal: field_mapping is null, extracting from field_config');
          const extractedMappings: Record<string, string> = {};
          statement.field_config.forEach((item: any) => {
            const sourceField = item.field || item.source_field;
            const targetField = item.label || item.mapping || item.display_name;
            if (sourceField && targetField) {
              extractedMappings[sourceField] = targetField;
            }
          });
          if (Object.keys(extractedMappings).length > 0) {
            formatLearnedMappings = extractedMappings;
            console.log('✅ EditableCompareModal: Reconstructed field_mapping from field_config:', formatLearnedMappings);
          }
        }
        
        console.log('🔍 EditableCompareModal: Final format learned mappings:', formatLearnedMappings);
        
        // Check if we have format learned mappings
        if (formatLearnedMappings && 
            typeof formatLearnedMappings === 'object' && 
            Object.keys(formatLearnedMappings).length > 0) {
          
          
          // Convert format learning field mappings to AI mapping format
          const mappings = Object.entries(formatLearnedMappings).map(([extractedField, mappedTo]) => ({
            extracted_field: extractedField,
            mapped_to: mappedTo as string,
            confidence: 0.95, // High confidence for format learned mappings
            reasoning: "Mapped using learned format patterns from previous approval",
            database_field_id: null, // Will be populated by AIFieldMapperTable
            mapped_to_column: (mappedTo as string).toLowerCase().replace(/ /g, '_'),
            column_name: (mappedTo as string).toLowerCase().replace(/ /g, '_'),
            requires_review: false,
            is_format_learned: true  // Add flag to indicate this is from format learning
          }));

          setAIMappingResults({
            ai_enabled: true,
            mappings: mappings,
            unmapped_fields: [],
            confidence: 0.95,
            learned_format_used: true
          });
          
          // ✅ Pre-approve all learned format mappings since they were already used
          const preApprovedStatuses: Record<string, 'approved'> = {};
          const initialDatabaseFieldSelections: Record<string, string> = {};
          
          mappings.forEach(mapping => {
            preApprovedStatuses[mapping.extracted_field] = 'approved';
            
            // CRITICAL FIX: Also build databaseFieldSelections by finding matching field IDs
            const dbField = databaseFields.find(f => 
              f.display_name.toLowerCase() === mapping.mapped_to.toLowerCase()
            );
            if (dbField) {
              initialDatabaseFieldSelections[mapping.extracted_field] = String(dbField.id);
            }
          });
          
          setAiMapperState(prev => ({
            ...prev,
            rowStatuses: preApprovedStatuses,
            databaseFieldSelections: initialDatabaseFieldSelections  // Include dropdown selections
          }));
          
          setIsLoadingAI(false);
          
          // Show toast to inform user
          console.log('✅ EditableCompareModal: Successfully loaded format learned mappings, skipping AI call');
          toast.success(
            `Loaded ${mappings.length} format learned field mappings (already approved)`,
            { duration: 3000 }
          );
          
          return; // ✅ CRITICAL: Stop here, don't call AI API
        }

        // ⚠️ No format learned mappings - should not happen for auto-approved statements
        // But provide fallback for edge cases
        console.log('⚠️ EditableCompareModal: No format learned mappings found, calling AI field mapping API');
        console.log('   - statement.field_mapping:', formatLearnedMappings);
        console.log('   - statement.field_config:', statement.field_config);
        console.log('   - statement.carrier_id:', statement.carrier_id);
        
        // Fallback: Try to get mappings from company field mappings
        const selectedTable = tables[currentTableIndex] || tables;
        if (!selectedTable) {
          setIsLoadingAI(false);
          toast.error("No table data available for field mapping");
          return;
        }

        // Call AI mapping as fallback (only if no format learned mappings)
        const response = await axios.post(
          `${process.env.NEXT_PUBLIC_API_URL}/api/ai/enhanced-extraction-analysis`,
          {
            extracted_headers: selectedTable.header,
            table_sample_data: selectedTable.rows,
            carrier_id: statement.carrier_id,
            document_context: {
              carrier_name: statement.selected_statement_date?.carrier_name,
              statement_date: statement.selected_statement_date?.date,
              filename: statement.file_name
            }
          },
          { withCredentials: true }
        );

        if (response.data.success) {
          const mappings = response.data.field_mapping?.mappings || [];
          const isLearnedFormat = response.data.field_mapping?.learned_format_used || false;
          
          setAIMappingResults({
            ai_enabled: true,
            mappings: mappings,
            unmapped_fields: response.data.field_mapping?.unmapped_fields || [],
            confidence: response.data.field_mapping?.confidence || 0.8,
            learned_format_used: isLearnedFormat
          });
          
          // ✅ If learned format was used, pre-approve all mappings
          if (isLearnedFormat && mappings.length > 0) {
            const preApprovedStatuses: Record<string, 'approved'> = {};
            mappings.forEach((mapping: any) => {
              preApprovedStatuses[mapping.extracted_field] = 'approved';
            });
            
            setAiMapperState(prev => ({
              ...prev,
              rowStatuses: preApprovedStatuses
            }));
          }
          
          toast(
            isLearnedFormat
              ? `Loaded ${mappings.length} learned field mappings (already approved)`
              : "Using AI-generated mappings (no format learned mappings found)",
            {
              duration: 4000,
              icon: isLearnedFormat ? "✅" : "⚠️"
            }
          );
        }
      } catch (error) {
        console.error("Failed to load field mappings:", error);
        toast.error("Failed to load field mappings");
      } finally {
        setIsLoadingAI(false);
      }
    };

    loadFieldMappings();
  }, [viewMode, tables, currentTableIndex, statement, aiMappingResults]);

  // Handle view mode change
  const handleViewModeChange = (newMode: ViewMode) => {
    setViewMode(newMode);
    
    if (newMode === 'field_mapping') {
      toast('Loading field mappings...');
    }
  };

  // Handle Save & Recalculate
  const handleSaveAndRecalculate = async () => {
    console.log('🚀 ==================== SAVE & RECALCULATE STARTED ====================');
    console.log('📊 Current aiMapperState:', aiMapperState);
    console.log('📊 databaseFieldSelections:', aiMapperState.databaseFieldSelections);
    console.log('📊 databaseFields available:', databaseFields.length);
    
    setIsSaving(true);
    setSaveProgress(0);

    try {
      // Get carrier ID from statement (use carrier_id directly, not from selected_statement_date)
      const carrierId = statement.carrier_id || statement.selected_statement_date?.carrier_id;
      
      if (!carrierId) {
        toast.error('No carrier ID found for this statement');
        setIsSaving(false);
        return;
      }


      // Step 1: Prepare field mappings FIRST (needed for format learning)
      // CRITICAL FIX: Build from aiMappingResults and current row statuses to capture ALL changes
      console.log('🔍 Building final mappings:');
      console.log('  - userMappings:', userMappings);
      console.log('  - acceptedMappings:', acceptedMappings);
      console.log('  - aiMapperState.rowStatuses:', aiMapperState.rowStatuses);
      console.log('  - aiMapperState.editedStatementFields:', aiMapperState.editedStatementFields);
      console.log('  - aiMapperState.databaseFieldSelections:', aiMapperState.databaseFieldSelections);
      console.log('  - aiMappingResults:', aiMappingResults);
      
      // CRITICAL FIX: Build finalMappings from CURRENT state including dropdown changes
      console.log('╔═══════════════════════════════════════════════════════════════');
      console.log('║ 🔧 EDITABLE COMPARE MODAL: Building Final Mappings');
      console.log('╠═══════════════════════════════════════════════════════════════');
      console.log('║ Source 1 - User Manual Mappings:', Object.keys(userMappings).length, userMappings);
      console.log('║ Source 2 - AI Mapper State:');
      console.log('║   - databaseFieldSelections:', Object.keys(aiMapperState.databaseFieldSelections || {}).length);
      console.log('║   - Database fields available:', databaseFields.length);
      
      const finalMappings: Record<string, string> = {};
      
      // STEP 1: Start with approved AI mappings (base)
      if (aiMappingResults?.mappings) {
        aiMappingResults.mappings.forEach((mapping: any) => {
          const status = aiMapperState.rowStatuses[mapping.extracted_field];
          if (status === 'approved') {
            finalMappings[mapping.extracted_field] = mapping.mapped_to;
            console.log(`║ ✓ AI Base: "${mapping.extracted_field}" → "${mapping.mapped_to}"`);
          }
        });
      }
      
      // STEP 2: Override with user dropdown selections (user changed AI mapping via dropdown)
      if (aiMapperState.databaseFieldSelections) {
        Object.entries(aiMapperState.databaseFieldSelections).forEach(([field, dbFieldId]) => {
          // Only include if the field is approved
          const status = aiMapperState.rowStatuses[field];
          if (status === 'approved') {
            const dbField = databaseFields.find(f => String(f.id) === String(dbFieldId));
            if (dbField) {
              const previousValue = finalMappings[field];
              finalMappings[field] = dbField.display_name;
              console.log(`║ 🔄 User Dropdown: "${field}" → "${dbField.display_name}" (was: "${previousValue}")`);
            }
          }
        });
      }
      
      // STEP 3: Override with user manual mappings (highest priority)
      Object.entries(userMappings).forEach(([field, mapping]) => {
        const previousValue = finalMappings[field];
        finalMappings[field] = mapping;
        console.log(`║ 🎯 User Manual: "${field}" → "${mapping}" (was: "${previousValue || 'unmapped'}")`);
      });
      
      console.log('╠═══════════════════════════════════════════════════════════════');
      console.log('║ ✅ Final mappings to save:', Object.keys(finalMappings).length, 'fields');
      console.log('╚═══════════════════════════════════════════════════════════════');

      // CRITICAL FIX: Create field_config in the correct format for ALL endpoints
      // Format: {field: source_field, mapping: target_field} - consistent across all APIs
      // This ensures format learning, calculations, and display all use the same mapping
      const fieldConfigForLearning = Object.entries(finalMappings).map(([field, mapping]) => ({
        field: field,           // Source field from extracted data (e.g., "Company Name")
        mapping: mapping        // Target field in database (e.g., "Client Name")
      }));
      
      // ✅ Use the same format for all endpoints to ensure consistency
      // Previously used {field, label} format which caused confusion
      const fieldConfig = Object.entries(finalMappings).map(([extractedField, mappedTo]) => ({
        field: extractedField,  // Source field from table header
        mapping: mappedTo       // Target database field name - CHANGED from 'label' to 'mapping'
      }));
      
      console.log('📋 ==================== FIELD CONFIGS TO BE SAVED ====================');
      console.log('📋 fieldConfigForLearning (for save-tables & learn-format-patterns):');
      fieldConfigForLearning.forEach((config, idx) => {
        console.log(`   ${idx + 1}. ${config.field} → ${config.mapping}`);
      });
      console.log('📋 fieldConfig (for approve endpoint):');
      fieldConfig.forEach((config, idx) => {
        console.log(`   ${idx + 1}. ${config.field} → ${config.mapping}`);
      });
      console.log('=' .repeat(70));
      
      // Step 2: Save Tables (20%) - NOW includes field_config for format learning
      setSaveProgress(20);
      toast('Saving edited tables...');
      
      const saveTablesPayload = {
        upload_id: statement.id,
        tables: tables,
        company_id: carrierId,
        selected_statement_date: statement.selected_statement_date,
        extracted_carrier: editedCarrierName,
        extracted_date: editedStatementDate,
        field_config: fieldConfigForLearning  // CRITICAL: Include field_config for format learning
      };

      console.log('📤 Sending save-tables payload with', fieldConfigForLearning.length, 'field mappings');

      const saveTablesResponse = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/table-editor/save-tables`,
        saveTablesPayload,
        { withCredentials: true }
      );

      const updatedCarrierId = saveTablesResponse.data?.carrier_id || carrierId;
      
      // Step 3: Learn Format Patterns (40%)
      setSaveProgress(40);
      toast('Learning format patterns...');
      
      // CRITICAL FIX: Include field_config so format learning saves user's field mappings
      await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/table-editor/learn-format-patterns`,
        {
          upload_id: statement.id,
          tables: tables,
          company_id: updatedCarrierId,
          selected_statement_date: statement.selected_statement_date,
          extracted_carrier: editedCarrierName,
          extracted_date: editedStatementDate,
          field_config: fieldConfigForLearning  // CRITICAL: Include user's field mapping selections
        },
        { withCredentials: true }
      );
      

      // Step 4: Save Field Mappings (60%)
      setSaveProgress(60);
      toast('Saving field mappings...');

      const selectedTable = tables[currentTableIndex] || tables;
      
      const mappingPayload = {
        mapping: finalMappings,
        plantypes: [],
        fieldconfig: databaseFields.map(field => ({
          displayname: field.display_name,
          description: field.description
        })),
        tabledata: selectedTable.rows,
        headers: selectedTable.header,
        selected_statement_date: statement.selected_statement_date
      };


      await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/companies/${updatedCarrierId}/mapping?upload_id=${statement.id}`,
        mappingPayload,
        { withCredentials: true }
      );


      // Step 4: Approve and Calculate (80%)
      setSaveProgress(80);
      toast('Calculating commissions...');
      
      // CRITICAL FIX: Filter out summary tables to prevent duplicate calculations
      const summaryTableTypes = ['summary_table', 'total_summary', 'vendor_total', 'grand_total', 'summary'];
      
      const commissionTables = tables.filter(table => {
        const tableType = (table?.metadata?.table_type || (table as any).table_type || '').toLowerCase();
        
        // Skip summary tables
        if (summaryTableTypes.includes(tableType)) {
          console.log(`🔍 EditableCompareModal: Skipping summary table: ${table.name} (type: ${tableType})`);
          return false;
        }
        
        // Also skip tables where ALL rows are summary rows
        const summaryRowsArray = Array.from(table.summaryRows || []);
        if (table.rows && summaryRowsArray.length > 0 && summaryRowsArray.length === table.rows.length) {
          console.log(`🔍 EditableCompareModal: Skipping table ${table.name} - all rows are summary rows`);
          return false;
        }
        
        return true;
      });
      
      console.log(`🔍 EditableCompareModal: Filtered ${tables.length} tables down to ${commissionTables.length} commission tables`);
      
      const finalData = commissionTables.map(table => {
        const tableHeaders = table.header;
        const tableRows = table.rows;
        
        const transformedRows = tableRows.map((row: any) => {
          const rowDict: Record<string, any> = {};
          tableHeaders.forEach((header: string, index: number) => {
            rowDict[header] = row[index];
          });
          return rowDict;
        });

        // CRITICAL FIX: Convert summaryRows Set to Array for JSON serialization
        // Sets serialize as empty objects {} in JSON, which breaks backend summary row exclusion
        const summaryRowsArray = table.summaryRows 
          ? (table.summaryRows instanceof Set ? Array.from(table.summaryRows) : table.summaryRows)
          : [];

        console.log(`🔍 Table "${table.name}": summaryRows type=${table.summaryRows?.constructor?.name}, count=${summaryRowsArray.length}, values=${JSON.stringify(summaryRowsArray)}`);

        return {
          name: table.name,
          header: tableHeaders,
          rows: transformedRows,
          summaryRows: summaryRowsArray
        };
      });

      console.log(`📤 Sending ${finalData.length} tables to approve endpoint with summaryRows:`, 
        finalData.map(t => ({ name: t.name, rowCount: t.rows.length, summaryRowCount: t.summaryRows?.length || 0 })));

      // CRITICAL FIX: Include upload_metadata for backend to create DB record
      const upload_metadata = {
        company_id: statement.carrier_id,
        carrier_id: statement.carrier_id,
        file_name: statement.file_name,
        file_hash: null,  // Not available in existing statements
        file_size: null,  // Not available in existing statements
        uploaded_at: statement.uploaded_at,
        raw_data: finalData
      };

      await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/review/approve`,
        {
          upload_id: statement.id,
          final_data: finalData,
          field_config: fieldConfig,
          plan_types: [],
          selected_statement_date: statement.selected_statement_date,
          upload_metadata: upload_metadata  // NEW: Include metadata for DB record creation
        },
        { withCredentials: true }
      );


      // Step 5: Complete (100%)
      setSaveProgress(100);
      
      toast.success('✅ Statement recalculated successfully!');
      
      // Wait a moment to show completion
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Call onComplete to refresh parent
      onComplete();
      
    } catch (error: any) {
      console.error('Save and recalculate failed:', error);
      
      const errorMessage = error?.response?.data?.detail || 
                          error?.response?.data?.message || 
                          error?.message || 
                          'Failed to save and recalculate';
      
      toast.error(`Error: ${errorMessage}`);
    } finally {
      setIsSaving(false);
      setSaveProgress(0);
    }
  };

  // Current table
  const currentTable = tables[currentTableIndex];

  // Check if there are any pending mappings
  const hasPendingMappings = useMemo(() => {
    if (!aiMappingResults?.mappings) return false;
    
    const pendingFields = aiMappingResults.mappings.filter((mapping: any) => {
      const status = aiMapperState.rowStatuses[mapping.extracted_field];
      return !status || status === 'pending';
    });
    
  
    return pendingFields.length > 0;
  }, [aiMappingResults, aiMapperState.rowStatuses]);

  // Count pending mappings for tooltip
  const pendingCount = useMemo(() => {
    if (!aiMappingResults?.mappings) return 0;
    return aiMappingResults.mappings.filter((mapping: any) => {
      const status = aiMapperState.rowStatuses[mapping.extracted_field];
      return !status || status === 'pending';
    }).length;
  }, [aiMappingResults, aiMapperState.rowStatuses]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-white dark:bg-slate-800 w-full h-full overflow-hidden flex flex-col rounded-lg">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-r from-yellow-500 to-orange-600 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                Review & Remap Statement
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {statement.file_name}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* View Mode Toggle */}
            <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-700 rounded-lg p-1">
              <button
                onClick={() => handleViewModeChange('table_review')}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  viewMode === 'table_review'
                    ? 'bg-white dark:bg-slate-600 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <FileText size={16} />
                Table Review
              </button>
              <button
                onClick={() => handleViewModeChange('field_mapping')}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  viewMode === 'field_mapping'
                    ? 'bg-white dark:bg-slate-600 text-green-600 dark:text-green-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <Map size={16} />
                Field Mapping
              </button>
            </div>

            {/* Save & Recalculate Button */}
            <div className="relative group">
              <button
                onClick={handleSaveAndRecalculate}
                disabled={isSaving || hasPendingMappings}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-sm shadow-md transition-all ${
                  isSaving || hasPendingMappings
                    ? 'bg-gray-300 dark:bg-gray-600 cursor-not-allowed text-gray-500 dark:text-gray-400'
                    : 'bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:shadow-lg hover:scale-105'
                }`}
              >
                {isSaving ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Saving {saveProgress}%
                  </>
                ) : (
                  <>
                    <Save size={16} />
                    Save & Recalculate
                  </>
                )}
              </button>
              
              {/* Tooltip for pending mappings */}
              {hasPendingMappings && !isSaving && (
                <div className="absolute top-full right-0 mt-2 hidden group-hover:block z-50">
                  <div className="bg-amber-900 text-white text-xs rounded-lg py-2 px-3 shadow-lg" style={{ minWidth: '240px' }}>
                    <div className="flex items-start gap-2">
                      <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      <div className="flex-1">
                        <div className="font-medium mb-1">
                          {pendingCount} Pending {pendingCount === 1 ? 'Mapping' : 'Mappings'}
                        </div>
                        <div className="text-amber-200">
                          Please approve or skip all field mappings before saving.
                        </div>
                      </div>
                    </div>
                    {/* Tooltip arrow pointing up */}
                    <div className="absolute bottom-full right-4 w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-amber-900"></div>
                  </div>
                </div>
              )}
            </div>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="p-2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col lg:flex-row w-full min-h-0 bg-slate-50 dark:bg-slate-900">
          
          {/* PDF Viewer - 30% */}
          <div className={`${isCollapsed ? 'w-0 hidden' : 'w-full lg:w-[30%]'} min-w-0 min-h-0 flex flex-col shadow-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 overflow-hidden flex-shrink-0 transition-all duration-300`}>
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <div className="flex flex-col items-center justify-center">
                  <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
                  <p className="text-sm text-slate-600 dark:text-slate-400">Loading PDF...</p>
                </div>
              </div>
            ) : pdfUrl ? (
              <div className="h-full w-full">
                <PDFViewer
                  fileUrl={pdfUrl}
                  isCollapsed={isCollapsed}
                  onToggleCollapse={() => setIsCollapsed(!isCollapsed)}
                />
              </div>
            ) : (
              <div className="flex items-center justify-center h-full p-8">
                <div className="text-center max-w-md">
                  <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/30 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <FileText className="w-8 h-8 text-amber-600 dark:text-amber-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">
                    PDF Not Available
                  </h3>
                  <p className="text-slate-500 dark:text-slate-400 text-sm">
                    The original PDF file is not available, but you can still edit the data.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Right Panel - 70% */}
          <div className={`${isCollapsed ? 'w-full' : 'w-full lg:w-[70%]'} min-w-0 min-h-0 flex flex-col shadow-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 overflow-hidden flex-shrink-0 transition-all duration-300`}>
            
            {/* Table Review Mode */}
            {viewMode === 'table_review' && currentTable && (
              <div className="h-full w-full">
                <ExtractedDataTable
                  table={currentTable}
                  onTableChange={(updatedTable) => {
                    const updatedTables = [...tables];
                    updatedTables[currentTableIndex] = updatedTable;
                    handleTablesChange(updatedTables);
                  }}
                  showSummaryRows={true}
                  onToggleSummaryRows={() => {}}
                />
              </div>
            )}

            {/* Field Mapping Mode */}
            {viewMode === 'field_mapping' && (
              <div className="h-full w-full flex flex-col">
                {/* Format Learned Badge */}
                {aiMappingResults?.learned_format_used && (
                  <div className="p-4 bg-green-50 dark:bg-green-900/20 border-b border-green-200 dark:border-green-800">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                      <span className="text-sm font-medium text-green-800 dark:text-green-200">
                        Using Format Learned Mappings
                      </span>
                    </div>
                    <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                      These mappings were learned from your previous approval of this carrier&apos;s format.
                    </p>
                  </div>
                )}
                
                {/* Field Mapper Table */}
                <div className="flex-1 overflow-hidden">
                  <AIFieldMapperTable
                    mappingResults={aiMappingResults}
                    onReviewTable={() => setViewMode('table_review')}
                    tableData={currentTable?.rows || []}
                    tableHeaders={currentTable?.header || []}
                    isLoading={isLoadingAI}
                    databaseFields={databaseFields}
                    onStateChange={(newState) => {
                      console.log('📥 EditableCompareModal: Received state update from AIFieldMapperTable:', {
                        databaseFieldSelections: Object.keys(newState.databaseFieldSelections || {}).length,
                        rowStatuses: Object.keys(newState.rowStatuses || {}).length,
                        editedStatementFields: Object.keys(newState.editedStatementFields || {}).length,
                        selections: newState.databaseFieldSelections
                      });
                      setAiMapperState(newState);
                    }}
                    hideActionButtons={true}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Premium Progress Loader Overlay */}
        {isSaving && (
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 animate-slideIn">
              
              {/* Main Progress Circle */}
              <div className="flex flex-col items-center mb-6">
                <div className="relative w-24 h-24 mb-4">
                  {/* Circular Progress */}
                  <svg className="w-24 h-24 transform -rotate-90">
                    <circle
                      cx="48"
                      cy="48"
                      r="40"
                      stroke="currentColor"
                      strokeWidth="8"
                      fill="none"
                      className="text-slate-200 dark:text-slate-700"
                    />
                    <circle
                      cx="48"
                      cy="48"
                      r="40"
                      stroke="currentColor"
                      strokeWidth="8"
                      fill="none"
                      strokeDasharray={`${2 * Math.PI * 40}`}
                      strokeDashoffset={`${2 * Math.PI * 40 * (1 - saveProgress / 100)}`}
                      className="text-green-600 dark:text-green-400 transition-all duration-500 ease-out"
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-lg font-semibold text-slate-800 dark:text-white">
                      {Math.round(saveProgress)}%
                    </span>
                  </div>
                </div>
                
                <h2 className="text-xl font-semibold text-slate-800 dark:text-white text-center mb-2">
                  Saving & Recalculating
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 text-center">
                  {saveProgress < 30 && 'Saving edited tables...'}
                  {saveProgress >= 30 && saveProgress < 50 && 'Learning format patterns...'}
                  {saveProgress >= 50 && saveProgress < 70 && 'Saving field mappings...'}
                  {saveProgress >= 70 && saveProgress < 90 && 'Calculating commissions...'}
                  {saveProgress >= 90 && 'Finalizing changes...'}
                </p>
              </div>

              {/* Progress Steps */}
              <div className="space-y-3">
                {/* Step 1: Save Tables */}
                <div className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
                  saveProgress >= 20 ? 'bg-green-50 dark:bg-green-900/20' : 'bg-slate-50 dark:bg-slate-700'
                }`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    saveProgress >= 20 ? 'bg-green-600 text-white' : 'bg-slate-300 dark:bg-slate-600 text-slate-600 dark:text-slate-400'
                  }`}>
                    {saveProgress >= 40 ? '✓' : '1'}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-800 dark:text-white">Save Tables</p>
                    <p className="text-xs text-slate-600 dark:text-slate-400">Storing edited data</p>
                  </div>
                </div>

                {/* Step 2: Learn Patterns */}
                <div className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
                  saveProgress >= 40 ? 'bg-green-50 dark:bg-green-900/20' : 'bg-slate-50 dark:bg-slate-700'
                }`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    saveProgress >= 40 ? 'bg-green-600 text-white' : 'bg-slate-300 dark:bg-slate-600 text-slate-600 dark:text-slate-400'
                  }`}>
                    {saveProgress >= 60 ? '✓' : '2'}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-800 dark:text-white">Learn Format</p>
                    <p className="text-xs text-slate-600 dark:text-slate-400">AI pattern recognition</p>
                  </div>
                </div>

                {/* Step 3: Save Mappings */}
                <div className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
                  saveProgress >= 60 ? 'bg-green-50 dark:bg-green-900/20' : 'bg-slate-50 dark:bg-slate-700'
                }`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    saveProgress >= 60 ? 'bg-green-600 text-white' : 'bg-slate-300 dark:bg-slate-600 text-slate-600 dark:text-slate-400'
                  }`}>
                    {saveProgress >= 80 ? '✓' : '3'}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-800 dark:text-white">Save Mappings</p>
                    <p className="text-xs text-slate-600 dark:text-slate-400">Field configuration</p>
                  </div>
                </div>

                {/* Step 4: Calculate */}
                <div className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
                  saveProgress >= 80 ? 'bg-green-50 dark:bg-green-900/20' : 'bg-slate-50 dark:bg-slate-700'
                }`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    saveProgress >= 80 ? 'bg-green-600 text-white' : 'bg-slate-300 dark:bg-slate-600 text-slate-600 dark:text-slate-400'
                  }`}>
                    {saveProgress >= 100 ? '✓' : '4'}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-800 dark:text-white">Calculate</p>
                    <p className="text-xs text-slate-600 dark:text-slate-400">Commission processing</p>
                  </div>
                </div>
              </div>

              {/* Animated dots for active step */}
              {saveProgress < 100 && (
                <div className="mt-4 flex items-center justify-center gap-1">
                  <div className="w-2 h-2 bg-green-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-2 h-2 bg-green-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-2 h-2 bg-green-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
