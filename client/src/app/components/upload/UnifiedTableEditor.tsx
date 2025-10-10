/**
 * Unified Table Editor Component
 * 
 * Two-phase layout with smooth transitions:
 * - Phase 1 (table_review): Left = PDF Preview, Right = Editable Table
 * - Phase 2 (field_mapping): Left = Compact Table, Right = AI Field Mapping
 */

"use client";

import React, { useState, useMemo } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { FieldMapping, PlanTypeDetection } from '@/app/services/aiIntelligentMappingService';
import ActionBar, { MappingStats, ViewMode } from './ActionBar';
import AIIntelligentMappingDisplay from '../AIIntelligentMappingDisplay';
import DocumentPreview from '../../upload/components/TableEditor/components/DocumentPreview';
import IntelligentTableDisplay from '../../upload/components/TableEditor/components/IntelligentTableDisplay';
import EditableTableView from './EditableTableView';
import PremiumProgressLoader, { UploadStep } from './PremiumProgressLoader';
import { ArrowRight, Map, FileText, Table2 } from 'lucide-react';

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
}

interface UnifiedTableEditorProps {
  extractedData: ExtractedData;
  uploadData?: any;
  databaseFields: Array<{ id: string; display_name: string; description?: string }>;
  onDataUpdate: (data: any) => void;
  onSubmit: (finalData: any) => Promise<void>;
}

export default function UnifiedTableEditor({
  extractedData,
  uploadData,
  databaseFields,
  onDataUpdate,
  onSubmit
}: UnifiedTableEditorProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('table_review');
  const [userMappings, setUserMappings] = useState<Record<string, string>>({});
  const [acceptedMappings, setAcceptedMappings] = useState<Array<{field: string, mapsTo: string, confidence: number, sample: string}>>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [tables, setTables] = useState(extractedData.tables || []);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [newlyAddedField, setNewlyAddedField] = useState<string | null>(null);
  const [approvalStep, setApprovalStep] = useState(0);
  const [approvalProgress, setApprovalProgress] = useState(0);

  // Get AI mappings from extracted data
  const aiMappings = extractedData.ai_intelligence?.field_mapping?.mappings || [];

  // Auto-accept high-confidence learned format mappings
  React.useEffect(() => {
    const fieldMapping = extractedData.ai_intelligence?.field_mapping;
    
    // Only auto-accept if:
    // 1. AI field mapping is enabled
    // 2. A learned format was used
    // 3. Overall confidence is >= 0.85
    // 4. acceptedMappings is still empty (first load)
    if (
      fieldMapping?.ai_enabled &&
      fieldMapping?.learned_format_used &&
      fieldMapping?.confidence >= 0.85 &&
      acceptedMappings.length === 0
    ) {
      const tableHeaders = tables?.[0]?.header || tables?.[0]?.headers || [];
      
      // Auto-accept all high-confidence mappings from learned format
      const autoAcceptedMappings = aiMappings
        .filter(mapping => mapping.confidence >= 0.85)
        .map(mapping => {
          const colIndex = tableHeaders.findIndex((h: string) => 
            h.toLowerCase() === mapping.extracted_field.toLowerCase()
          );
          const sampleData = colIndex >= 0 && tables?.[0]?.rows?.[0] 
            ? tables[0].rows[0][colIndex] 
            : 'N/A';

          return {
            field: mapping.extracted_field,
            mapsTo: mapping.mapped_to,
            confidence: mapping.confidence,
            sample: sampleData
          };
        });

      if (autoAcceptedMappings.length > 0) {
        console.log(`🎯 Auto-accepting ${autoAcceptedMappings.length} high-confidence learned mappings`);
        setAcceptedMappings(autoAcceptedMappings);
        
        // Also populate user mappings
        const mappingsUpdate: Record<string, string> = {};
        autoAcceptedMappings.forEach(mapping => {
          mappingsUpdate[mapping.field] = mapping.mapsTo;
        });
        setUserMappings(mappingsUpdate);
        
        // Show success toast
        toast.success(`Auto-accepted ${autoAcceptedMappings.length} field mappings from learned format!`, {
          duration: 3000,
          icon: '✨'
        });
      }
    }
  }, [extractedData.ai_intelligence, aiMappings, tables]);

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
    
    // Count mappings by status, considering user acceptances
    let mapped = 0;
    let needsReview = 0;
    let unmapped = 0;
    
    allMappings.forEach(mapping => {
      const fieldNameLower = mapping.extracted_field.toLowerCase();
      const isAccepted = acceptedFieldNames.has(fieldNameLower) || 
                        userMappedFieldNames.has(fieldNameLower);
      
      if (isAccepted || mapping.confidence >= 0.8) {
        mapped++;
      } else if (mapping.confidence >= 0.6) {
        needsReview++;
      } else {
        unmapped++;
      }
    });

    // Debug logging
    console.log('📊 Mapping Stats Debug:', {
      total,
      mapped,
      needsReview,
      unmapped,
      acceptedCount: acceptedMappings.length,
      userMappingsCount: Object.keys(userMappings).length,
      aiMappingsFields: allMappings.map(m => m.extracted_field),
      acceptedFields: acceptedMappings.map(m => m.field),
      userMappedFields: Object.keys(userMappings)
    });

    return { mapped, needsReview, unmapped, total };
  }, [aiMappings, userMappings, acceptedMappings]);

  const handleModeTransition = async (newMode: ViewMode) => {
    if (isTransitioning) return;
    
    setIsTransitioning(true);
    
    // Small delay for exit animation
    await new Promise(resolve => setTimeout(resolve, 150));
    
    setViewMode(newMode);
    
    // Small delay for enter animation
    await new Promise(resolve => setTimeout(resolve, 150));
    
    setIsTransitioning(false);
  };

  const handleFinalSubmission = async () => {
    setIsSubmitting(true);
    setApprovalStep(0);
    setApprovalProgress(0);

    try {
      // Debug logging to see what data we have
      console.log('📦 Debug - uploadData:', uploadData);
      console.log('📦 Debug - extractedData:', extractedData);
      
      const upload_id = uploadData?.upload_id || uploadData?.id || extractedData?.upload_id;
      const company_id = uploadData?.company_id || extractedData?.company_id;
      const carrier_id = extractedData?.carrier_id || uploadData?.carrier_id;
      
      console.log('🔍 Extracted values:', { upload_id, company_id, carrier_id });
      
      if (!upload_id) {
        throw new Error('Upload ID is missing');
      }
      
      if (!carrier_id && !company_id) {
        console.error('❌ Missing IDs - uploadData:', uploadData);
        console.error('❌ Missing IDs - extractedData:', extractedData);
        throw new Error('Company ID or Carrier ID is required. Please check the extraction response.');
      }

      // Parse statement date
      const statementDateStr = extractedData?.statementDate || extractedData?.extracted_date || '';
      const dateParts = statementDateStr.split('/');
      const statementDateObj = dateParts.length === 3 ? {
        month: parseInt(dateParts[0]),
        day: parseInt(dateParts[1]),
        year: parseInt(dateParts[2]),
        date: statementDateStr
      } : null;

      // Merge AI mappings with user mappings (including accepted mappings)
      const finalMappings = { ...userMappings };
      
      // Add accepted mappings
      acceptedMappings.forEach(mapping => {
        if (!finalMappings[mapping.field]) {
          finalMappings[mapping.field] = mapping.mapsTo;
        }
      });

      console.log('🚀 Starting approval process...');
      console.log('Upload ID:', upload_id);
      console.log('Company ID:', company_id);
      console.log('Carrier ID:', carrier_id);
      console.log('Using company_id for API:', carrier_id || company_id);
      console.log('Statement Date Object:', statementDateObj);
      console.log('Final Mappings:', finalMappings);

      // STEP 1: Save Table Data
      setApprovalStep(0);
      setApprovalProgress(20);
      console.log('📊 Step 1: Saving table data...');
      
      const saveTablesResponse = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/table-editor/save-tables/`,
        {
          upload_id: upload_id,
          tables: tables.map(table => ({
            name: table.name || 'Unnamed Table',
            header: table.header || table.headers || [],
            rows: table.rows || [],
            summaryRows: Array.from(table.summaryRows || []), // Convert Set to Array
            extractor: table.extractor || 'manual',
            metadata: table.metadata || {}
          })),
          company_id: carrier_id || company_id, // Use carrier_id as primary
          selected_statement_date: statementDateObj,
          extracted_carrier: extractedData?.carrierName || extractedData?.extracted_carrier,
          extracted_date: extractedData?.extracted_date
        },
        { withCredentials: true }
      );

      // ✅ CRITICAL: Get updated carrier_id from response
      const updatedCarrierId = saveTablesResponse.data?.carrier_id || carrier_id || company_id;
      const updatedCarrierName = saveTablesResponse.data?.carrier_name || extractedData?.carrierName || extractedData?.extracted_carrier;
      
      console.log('✅ Step 1 completed: Tables saved');
      console.log('Updated Carrier ID:', updatedCarrierId);
      console.log('Updated Carrier Name:', updatedCarrierName);
      setApprovalProgress(40);

      // STEP 2: Learn Format Patterns
      setApprovalStep(1);
      console.log('🧠 Step 2: Learning format patterns...');
      
      try {
        await axios.post(
          `${process.env.NEXT_PUBLIC_API_URL}/api/table-editor/learn-format-patterns`,
          {
            upload_id: upload_id,
            tables: tables.map(table => ({
              name: table.name || 'Unnamed Table',
              header: table.header || table.headers || [],
              rows: table.rows || [],
              summaryRows: Array.from(table.summaryRows || [])
            })),
            company_id: updatedCarrierId, // Use updated carrier_id from save response
            selected_statement_date: statementDateObj,
            extracted_carrier: updatedCarrierName,
            extracted_date: extractedData?.extracted_date
          },
          { withCredentials: true }
        );
        console.log('✅ Step 2 completed: Format patterns learned');
      } catch (learningError) {
        console.warn('⚠️ Format learning failed, continuing...', learningError);
        // Continue even if format learning fails
      }
      
      setApprovalProgress(60);

      // STEP 3: Save Field Mappings
      setApprovalStep(2);
      console.log('🗺️ Step 3: Saving field mappings...');
      
      // Convert mappings to field config format for database fields
      const fieldConfig = Object.entries(finalMappings).map(([extractedField, mappedTo]) => ({
        display_name: mappedTo,
        source_field: extractedField
      }));

      // Get plan types from AI intelligence
      const planTypes = extractedData?.ai_intelligence?.plan_type_detection?.detected_plan_types?.map(
        (pt: any) => pt.plan_type
      ) || [];

      // Get table data for format learning
      const firstTable = tables[0] || {};
      const tableData = firstTable.rows || [];
      const headers = firstTable.header || firstTable.headers || [];

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

      console.log('📤 Mapping payload:', mappingPayload);

      await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/companies/${updatedCarrierId}/mapping/?upload_id=${upload_id}`, // Use updated carrier_id
        mappingPayload,
        { withCredentials: true }
      );

      console.log('✅ Step 3 completed: Field mappings saved');
      setApprovalProgress(80);

      // STEP 4: Process Commission Data (Final Approval)
      setApprovalStep(3);
      console.log('💰 Step 4: Processing commission data...');
      
      // Prepare final data for approval
      // Transform rows from arrays to dictionaries for backend processing
      const finalData = tables.map(table => {
        const tableHeaders = table.header || table.headers || [];
        const tableRows = table.rows || [];
        
        // Convert each row from array to dictionary with header names as keys
        const transformedRows = tableRows.map((row: any[]) => {
          const rowDict: Record<string, any> = {};
          tableHeaders.forEach((header: string, index: number) => {
            rowDict[header] = row[index] || '';
          });
          return rowDict;
        });
        
        return {
          name: table.name || 'Unnamed Table',
          header: tableHeaders,
          rows: transformedRows  // Now an array of dictionaries
        };
      });
      
      console.log('📦 Transformed final data sample:', finalData[0]?.rows[0]);

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

      console.log('✅ Step 4 completed: Commission data processed');
      
      // STEP 5: Finalizing
      setApprovalStep(4);
      setApprovalProgress(100);
      console.log('🎉 Step 5: Finalizing...');
      
      // Show success message
      toast.success('Statement approved successfully! 🎉');
      
      // Wait a moment to show completion
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Redirect to dashboard
      console.log('✅ All steps completed! Redirecting to dashboard...');
      window.location.href = '/?tab=dashboard';

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

  const handleMappingChange = (extractedField: string, newMapping: string) => {
    setUserMappings(prev => ({
      ...prev,
      [extractedField]: newMapping
    }));
  };

  const handleTablesChange = (updatedTables: any[]) => {
    setTables(updatedTables);
    onDataUpdate({ ...extractedData, tables: updatedTables });
  };

  // Handle accepting a single mapping
  const handleAcceptMapping = (mapping: FieldMapping) => {
    const tableHeaders = tables?.[0]?.header || tables?.[0]?.headers || [];
    const colIndex = tableHeaders.findIndex((h: string) => 
      h.toLowerCase() === mapping.extracted_field.toLowerCase()
    );
    const sampleData = colIndex >= 0 && tables?.[0]?.rows?.[0] 
      ? tables[0].rows[0][colIndex] 
      : 'N/A';

    // Check if already accepted
    if (acceptedMappings.some(m => m.field === mapping.extracted_field)) {
      return; // Already accepted
    }

    const newMapping = {
      field: mapping.extracted_field,
      mapsTo: mapping.mapped_to,
      confidence: mapping.confidence,
      sample: sampleData
    };

    setAcceptedMappings(prev => [...prev, newMapping]);
    setNewlyAddedField(mapping.extracted_field);
    
    // Clear animation after 1 second
    setTimeout(() => setNewlyAddedField(null), 1000);
    
    // Also update user mappings
    handleMappingChange(mapping.extracted_field, mapping.mapped_to);
  };

  // Handle accepting all high confidence mappings
  const handleAcceptAllMappings = () => {
    const highConfidenceMappings = aiMappings.filter(m => m.confidence >= 0.8);
    const tableHeaders = tables?.[0]?.header || tables?.[0]?.headers || [];
    
    const newMappings = highConfidenceMappings
      .filter(mapping => !acceptedMappings.some(m => m.field === mapping.extracted_field))
      .map(mapping => {
        const colIndex = tableHeaders.findIndex((h: string) => 
          h.toLowerCase() === mapping.extracted_field.toLowerCase()
        );
        const sampleData = colIndex >= 0 && tables?.[0]?.rows?.[0] 
          ? tables[0].rows[0][colIndex] 
          : 'N/A';

        return {
          field: mapping.extracted_field,
          mapsTo: mapping.mapped_to,
          confidence: mapping.confidence,
          sample: sampleData
        };
      });

    setAcceptedMappings(prev => [...prev, ...newMappings]);
    
    // Animate each one sequentially
    newMappings.forEach((mapping, index) => {
      setTimeout(() => {
        setNewlyAddedField(mapping.field);
        setTimeout(() => setNewlyAddedField(null), 800);
      }, index * 150);
    });

    // Update user mappings for all
    const mappingsUpdate: Record<string, string> = {};
    newMappings.forEach(mapping => {
      mappingsUpdate[mapping.field] = mapping.mapsTo;
    });
    setUserMappings(prev => ({ ...prev, ...mappingsUpdate }));
  };

  // Handle custom mapping selection
  const handleCustomMapping = (extractedField: string, selectedHeader: string) => {
    const tableHeaders = tables?.[0]?.header || tables?.[0]?.headers || [];
    const colIndex = tableHeaders.findIndex((h: string) => 
      h.toLowerCase() === selectedHeader.toLowerCase()
    );
    const sampleData = colIndex >= 0 && tables?.[0]?.rows?.[0] 
      ? tables[0].rows[0][colIndex] 
      : 'N/A';

    // Find if already accepted and update it
    const existingIndex = acceptedMappings.findIndex(m => m.field === extractedField);
    if (existingIndex >= 0) {
      const updated = [...acceptedMappings];
      updated[existingIndex] = {
        ...updated[existingIndex],
        mapsTo: selectedHeader,
        sample: sampleData
      };
      setAcceptedMappings(updated);
    } else {
      // Add new mapping
      setAcceptedMappings(prev => [...prev, {
        field: extractedField,
        mapsTo: selectedHeader,
        confidence: 1.0, // User selected, so 100%
        sample: sampleData
      }]);
      setNewlyAddedField(extractedField);
      setTimeout(() => setNewlyAddedField(null), 1000);
    }

    handleMappingChange(extractedField, selectedHeader);
  };

  // Handle removing an accepted mapping
  const handleRemoveMapping = (fieldName: string) => {
    setAcceptedMappings(prev => prev.filter(m => m.field !== fieldName));
    
    // Also remove from user mappings
    setUserMappings(prev => {
      const updated = { ...prev };
      delete updated[fieldName];
      return updated;
    });
  };

  return (
    <>
      {/* Premium Progress Loader - Shows during submission */}
      <PremiumProgressLoader
        currentStep={approvalStep}
        steps={APPROVAL_STEPS}
        progress={approvalProgress}
        isVisible={isSubmitting}
      />

      <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
        
        {/* Premium Header */}
      <div className="bg-white shadow-sm border-b border-gray-200 px-6 py-4 flex-shrink-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-3">
              {viewMode === 'table_review' ? (
                <>
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <FileText className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h1 className="text-lg font-semibold text-gray-900">Review Extracted Data</h1>
                    <p className="text-xs text-gray-500">Verify and edit table contents</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                  <Map className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <h1 className="text-lg font-semibold text-gray-900">AI Field Mapping</h1>
                    <p className="text-xs text-gray-500">Review intelligent field suggestions</p>
                  </div>
                </>
              )}
            </div>
            
            {/* Progress Indicator */}
            <div className="flex items-center space-x-2 ml-4 px-3 py-1.5 bg-gray-100 rounded-full">
              <div className={`w-2 h-2 rounded-full ${viewMode === 'table_review' ? 'bg-blue-600 animate-pulse' : 'bg-green-600'}`} />
              <span className="text-sm font-medium text-gray-700">
                Step {viewMode === 'table_review' ? '1' : '2'} of 2
              </span>
            </div>

            {/* Plan Type Detection - Compact */}
            {viewMode === 'field_mapping' && extractedData.ai_intelligence?.plan_type_detection && (
              <div className="ml-4 px-4 py-2 bg-gradient-to-r from-purple-50 to-pink-50 border-2 border-purple-200 rounded-lg">
                <div className="flex items-center space-x-2">
                  <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                  </svg>
                  <div>
                    <span className="text-xs text-purple-600 font-semibold block">Plan Type</span>
                    <span className="text-sm font-bold text-gray-900">
                      {extractedData.ai_intelligence.plan_type_detection.detected_plan_types[0]?.plan_type || 'Unknown'}
                    </span>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ml-2 ${
                    extractedData.ai_intelligence.plan_type_detection.confidence >= 0.8 ? 'bg-green-100 text-green-800' :
                    extractedData.ai_intelligence.plan_type_detection.confidence >= 0.6 ? 'bg-yellow-100 text-yellow-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {Math.round(extractedData.ai_intelligence.plan_type_detection.confidence * 100)}%
                  </span>
                </div>
              </div>
            )}
          </div>
          
          {/* Metadata Display */}
          <div className="flex items-center space-x-4">
            <div className="px-3 py-1.5 bg-gray-100 rounded-lg">
              <span className="text-xs text-gray-500 block">Carrier</span>
              <span className="text-sm font-semibold text-gray-900">
                {extractedData?.carrierName || extractedData?.extracted_carrier || 'Unknown'}
              </span>
            </div>
            <div className="px-3 py-1.5 bg-gray-100 rounded-lg">
              <span className="text-xs text-gray-500 block">Date</span>
              <span className="text-sm font-semibold text-gray-900">
                {extractedData?.statementDate || extractedData?.extracted_date || 'Unknown'}
              </span>
            </div>
            {viewMode === 'field_mapping' && (
              <div className="px-3 py-1.5 bg-green-100 rounded-lg">
                <span className="text-xs text-green-600 block">Accepted</span>
                <span className="text-sm font-semibold text-green-700">
                  {acceptedMappings.length} fields
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area - Premium 2-Column Layout */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Panel - Document/Data Preview */}
        <div className={`bg-white border-r-2 border-gray-200 flex flex-col transition-all duration-700 ease-in-out ${
          viewMode === 'table_review' ? 'w-[35%]' : 'w-[35%]'
        } ${isTransitioning ? 'opacity-50' : 'opacity-100'}`}>

          {/* Left Panel Content */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {viewMode === 'table_review' ? (
              // Show PDF Preview in table review mode
              <div className={`flex-1 flex flex-col transition-opacity duration-500 ${
                isTransitioning ? 'opacity-0' : 'opacity-100'
              }`}>
                <DocumentPreview
                  uploaded={uploadData || extractedData}
                  zoom={zoom}
                  onZoomIn={() => setZoom(prev => Math.min(prev + 0.1, 2))}
                  onZoomOut={() => setZoom(prev => Math.max(prev - 0.1, 0.5))}
                />
              </div>
            ) : (
              // Show Table + Field Mapping Suggestions in field mapping mode
              <div className={`h-full overflow-auto p-4 space-y-4 transition-opacity duration-500 ${
                isTransitioning ? 'opacity-0' : 'opacity-100'
              }`}>
                {/* Extracted Table Preview */}
                <div className="bg-gray-50 rounded-lg p-3">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Extracted Table Preview</h4>
                  <div className="text-xs text-gray-600">
                    {tables?.[0]?.headers?.length || tables?.[0]?.header?.length || 0} columns × {tables?.[0]?.rows?.length || 0} rows
                  </div>
                </div>
                
                {/* Compact Table Display */}
                {tables?.[0] && (
                  <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                    <div className="overflow-x-auto max-h-64">
                      <table className="min-w-full text-xs">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            {(tables[0].headers || tables[0].header || []).map((header: string, idx: number) => (
                              <th key={idx} className="px-3 py-2 text-left font-medium text-gray-700 border-b">
                                {header}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(tables[0].rows || []).slice(0, 4).map((row: string[], rowIdx: number) => (
                            <tr key={rowIdx} className="hover:bg-gray-50">
                              {row.map((cell: string, cellIdx: number) => (
                                <td key={cellIdx} className="px-3 py-2 border-b border-gray-100 text-gray-600">
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {(tables[0].rows?.length || 0) > 4 && (
                      <div className="p-2 bg-gray-50 text-xs text-gray-500 text-center border-t">
                        Showing 4 of {tables[0].rows?.length} rows
                      </div>
                    )}
                  </div>
                )}

                {/* Field Mapping Suggestions - Will pass handlers */}
                {extractedData.ai_intelligence && (
                  <AIIntelligentMappingDisplay
                    aiIntelligence={extractedData.ai_intelligence}
                    tableHeaders={tables?.[0]?.header || tables?.[0]?.headers || []}
                    acceptedFields={acceptedMappings.map(m => m.field)}
                    onAcceptMapping={handleAcceptMapping}
                    onAcceptAllMappings={handleAcceptAllMappings}
                    onCustomMapping={handleCustomMapping}
                    onReviewMappings={() => console.log('Review mappings')}
                  />
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Table Data/Field Mapping */}
        <div className={`w-[65%] bg-gray-50 flex flex-col transition-all duration-700 ease-in-out ${
          isTransitioning ? 'opacity-50' : 'opacity-100'
        }`}>
          
          {/* Right Panel Header */}
          <div className="px-6 py-4 border-b-2 border-gray-200 bg-white flex-shrink-0">
            <div className="flex items-center space-x-2">
              {viewMode === 'table_review' ? (
                <>
                  <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                    <Table2 className="w-4 h-4 text-green-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">Extracted Table Data</h3>
                    <p className="text-xs text-gray-500">Review and edit extracted values</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                    <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">Accepted Field Mappings</h3>
                    <p className="text-xs text-gray-500">Fields you've confirmed for database import</p>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Right Panel Content */}
          <div className="flex-1 overflow-hidden">
            {viewMode === 'table_review' ? (
              // Show editable table in review mode
              <div className={`h-full overflow-auto transition-opacity duration-500 ${
                isTransitioning ? 'opacity-0' : 'opacity-100'
              }`}>
                <EditableTableView
                  tables={tables}
                  onTablesChange={handleTablesChange}
                  carrierName={extractedData?.carrierName || extractedData?.extracted_carrier}
                  statementDate={extractedData?.statementDate || extractedData?.extracted_date}
                />
              </div>
            ) : (
              // Show Accepted Mappings Table in mapping mode
              <div className={`h-full flex flex-col transition-opacity duration-500 ${
                isTransitioning ? 'opacity-0' : 'opacity-100'
              }`}>
                {acceptedMappings.length === 0 ? (
                  // Empty State
                  <div className="flex-1 flex items-center justify-center p-8">
                    <div className="text-center max-w-md">
                      <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                        </svg>
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">No Fields Accepted Yet</h3>
                      <p className="text-sm text-gray-600 mb-4">
                        Click the <span className="inline-flex items-center mx-1 px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium">✓ Accept</span> button on field mappings in the left panel to add them here
                      </p>
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-left">
                        <p className="text-xs text-blue-800 font-medium mb-1">💡 Tip</p>
                        <p className="text-xs text-blue-700">
                          You can also click "Accept All High Confidence" to quickly accept all mappings with 85%+ confidence
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  // Accepted Mappings Table
                  <div className="flex-1 overflow-auto p-4">
                    <div className="bg-white rounded-xl border-2 border-green-200 overflow-hidden shadow-sm">
                      <div className="overflow-auto max-h-full">
                        <table className="min-w-full">
                          <thead className="bg-gradient-to-r from-green-50 to-emerald-50 sticky top-0 z-10">
                            <tr className="border-b-2 border-green-200">
                              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Extracted Field</th>
                              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Maps To</th>
                              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Confidence</th>
                              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Sample Data</th>
                              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 w-20">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {acceptedMappings.map((mapping, idx) => (
                              <tr 
                                key={mapping.field}
                                className={`transition-all duration-500 ${
                                  newlyAddedField === mapping.field 
                                    ? 'bg-green-100 animate-pulse' 
                                    : 'bg-white hover:bg-green-50'
                                }`}
                                style={{
                                  animation: newlyAddedField === mapping.field 
                                    ? 'slideIn 0.5s ease-out' 
                                    : undefined
                                }}
                              >
                                <td className="px-4 py-3">
                                  <div className="flex items-center space-x-2">
                                    <svg className="w-4 h-4 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span className="font-mono text-sm font-medium text-blue-600">{mapping.field}</span>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-900 font-medium">{mapping.mapsTo}</td>
                                <td className="px-4 py-3">
                                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                                    mapping.confidence >= 0.8 ? 'bg-green-100 text-green-800' :
                                    mapping.confidence >= 0.6 ? 'bg-yellow-100 text-yellow-800' :
                                    'bg-red-100 text-red-800'
                                  }`}>
                                    {Math.round(mapping.confidence * 100)}%
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-600 font-mono max-w-xs truncate" title={mapping.sample}>
                                  {mapping.sample || <span className="text-gray-400">N/A</span>}
                                </td>
                                <td className="px-4 py-3">
                                  <button
                                    onClick={() => {
                                      handleRemoveMapping(mapping.field);
                                      toast.success(`Removed: ${mapping.field}`);
                                    }}
                                    className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition-all hover:scale-110 active:scale-95"
                                    title="Remove mapping"
                                    type="button"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="bg-gradient-to-r from-green-50 to-emerald-50 px-4 py-3 border-t-2 border-green-200">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-700 font-medium">
                            <span className="text-green-600 font-bold">{acceptedMappings.length}</span> field{acceptedMappings.length !== 1 ? 's' : ''} accepted
                          </span>
                          <span className="text-gray-600 text-xs">
                            {aiMappings.length - acceptedMappings.length} remaining
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
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
          // 2. All AI mappings have been explicitly accepted by the user
          mappingStats.needsReview === 0 || 
          acceptedMappings.length >= aiMappings.length
        }
        isTransitioning={isTransitioning}
      />
    </div>
    </>
  );
}
