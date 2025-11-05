/**
 * AI Field Mapper Table Component
 * 
 * Interactive table for reviewing and editing AI-suggested field mappings
 * with confidence scores, alternatives, and user controls.
 */

import React, { useState, useEffect } from 'react';
import { AIFieldMappingResponse, FieldMapping } from '@/app/services/aiIntelligentMappingService';
import AIFieldMapperRow from './AIFieldMapperRow';

interface AIFieldMapperTableProps {
  mappingResults: AIFieldMappingResponse | null;
  onReviewTable: () => void;
  tableData?: any[];
  tableHeaders?: string[];
  isLoading?: boolean;
  databaseFields?: Array<{ id: string; display_name: string; description?: string }>;
  onStateChange?: (state: {
    rowStatuses: Record<string, 'pending' | 'approved' | 'skipped'>;
    editedStatementFields: Record<string, string>;
    duplicateFields: string[];
  }) => void;
}

export default function AIFieldMapperTable({ mappingResults, onReviewTable, tableData, tableHeaders, isLoading, databaseFields = [], onStateChange }: AIFieldMapperTableProps) {
 
  
  // State for each row's status
  const [rowStatuses, setRowStatuses] = useState<Record<string, 'pending' | 'approved' | 'skipped'>>({});
  
  // State for edited statement fields (user corrections)
  const [editedStatementFields, setEditedStatementFields] = useState<Record<string, string>>({});
  
  // State for database field selections - Initialize with AI mappings
  const [databaseFieldSelections, setDatabaseFieldSelections] = useState<Record<string, string>>(() => {
    const initialSelections: Record<string, string> = {};
    if (mappingResults?.mappings) {
      mappingResults.mappings.forEach(mapping => {
        initialSelections[mapping.extracted_field] = mapping.database_field_id || '';
      });
    }
    return initialSelections;
  });

  // Update database field selections when mappingResults changes
  useEffect(() => {
    if (mappingResults?.mappings) {
      const newSelections: Record<string, string> = {};
      mappingResults.mappings.forEach(mapping => {
        // Only set if not already manually selected by user
        if (!databaseFieldSelections[mapping.extracted_field]) {
          newSelections[mapping.extracted_field] = mapping.database_field_id || '';
        } else {
          newSelections[mapping.extracted_field] = databaseFieldSelections[mapping.extracted_field];
        }
      });
      setDatabaseFieldSelections(newSelections);
    }
  }, [mappingResults]);
  
  // Check for duplicate statement fields and notify parent
  const checkAndNotifyStateChange = (updates: Partial<{
    rowStatuses: Record<string, 'pending' | 'approved' | 'skipped'>;
    editedStatementFields: Record<string, string>;
  }>) => {
    if (!onStateChange) return;
    
    const currentRowStatuses = updates.rowStatuses || rowStatuses;
    const currentEditedFields = updates.editedStatementFields || editedStatementFields;
    
    // Check for duplicates in statement fields
    const statementFieldValues: string[] = [];
    const duplicates: string[] = [];
    
    mappingResults?.mappings?.forEach(mapping => {
      const fieldValue = currentEditedFields[mapping.extracted_field] || mapping.extracted_field;
      if (statementFieldValues.includes(fieldValue)) {
        duplicates.push(fieldValue);
      } else {
        statementFieldValues.push(fieldValue);
      }
    });
    
    onStateChange({
      rowStatuses: currentRowStatuses,
      editedStatementFields: currentEditedFields,
      duplicateFields: duplicates
    });
  };

  const handleApprove = (fieldId: string) => {
    setRowStatuses(prev => {
      const updated = { ...prev, [fieldId]: 'approved' as const };
      checkAndNotifyStateChange({ rowStatuses: updated });
      return updated;
    });
  };

  const handleSkip = (fieldId: string) => {
    setRowStatuses(prev => {
      const updated = { ...prev, [fieldId]: 'skipped' as const };
      checkAndNotifyStateChange({ rowStatuses: updated });
      return updated;
    });
  };

  const handleStatementFieldEdit = (fieldId: string, newValue: string) => {
    setEditedStatementFields(prev => {
      const updated = { ...prev, [fieldId]: newValue };
      checkAndNotifyStateChange({ editedStatementFields: updated });
      return updated;
    });
  };

  const handleDatabaseFieldChange = (fieldId: string, dbFieldId: string) => {
        
    setDatabaseFieldSelections(prev => {
      const updated = {
        ...prev,
        [fieldId]: dbFieldId
      };
      return updated;
    });
  };

  const handleRevert = (fieldId: string) => {
    // Reset field to pending state
    setRowStatuses(prev => {
      const newStatuses = { ...prev };
      delete newStatuses[fieldId];
      return newStatuses;
    });

    // Reset any edited values
    setEditedStatementFields(prev => {
      const newEdited = { ...prev };
      delete newEdited[fieldId];
      return newEdited;
    });

    // Reset database field selection to AI-suggested value
    const originalMapping = mappingResults?.mappings.find(m => m.extracted_field === fieldId);
    if (originalMapping) {
      setDatabaseFieldSelections(prev => ({
        ...prev,
        [fieldId]: originalMapping.database_field_id || ''
      }));
    }

    // Notify parent of state change
    checkAndNotifyStateChange({});
  };

  return (
    <div className="h-full flex flex-col animate-fadeIn relative" style={{ overflow: 'visible' }}>
      {/* Header */}
      <div className="p-6 border-b border-slate-200 dark:border-slate-700">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
          AI Field Mapping
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
          Review and approve AI-suggested field mappings
        </p>
      </div>

      {/* Table Container - overflow-x for horizontal scroll, overflow-y-visible for dropdowns */}
      <div className="flex-1 custom-scrollbar" style={{ overflowX: 'auto', overflowY: 'visible' }}>
        {isLoading ? (
          // Loading State
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-20 h-20 border-4 border-blue-600 dark:border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-slate-100 mb-3">🤖 AI Field Mapping</h3>
              <p className="text-base text-gray-700 dark:text-slate-300 font-medium mb-2">Generating intelligent field mappings...</p>
              <p className="text-sm text-gray-600 dark:text-slate-400">Analyzing table data and learning from previous mappings</p>
            </div>
          </div>
        ) : !mappingResults || !mappingResults.mappings || mappingResults.mappings.length === 0 ? (
          // Empty State
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-md">
              <div className="w-20 h-20 bg-gray-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-10 h-10 text-gray-400 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-2">No Field Mappings Available</h3>
              <p className="text-sm text-gray-600 dark:text-slate-400 mb-4">
                AI field mapping suggestions will appear here once generated. You can also proceed to manually map fields in the review table.
              </p>
              <button
                onClick={onReviewTable}
                className="btn-secondary px-6 py-2"
              >
                Proceed to Table Review →
              </button>
            </div>
          </div>
        ) : (
          // Mappings Table
          <table className="premium-data-table w-full" style={{ position: 'relative', zIndex: 1 }}>
            <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900 border-b-2 border-slate-200 dark:border-slate-700">
              <tr>
                <th className="text-left px-4 py-3.5 font-semibold text-slate-700 dark:text-slate-200 text-sm">
                  Statement Field
                  <span className="block text-xs font-normal text-slate-500 dark:text-slate-400 mt-0.5">
                    Extracted column name
                  </span>
                </th>
                <th className="text-left px-4 py-3.5 font-semibold text-slate-700 dark:text-slate-200 text-sm">
                  Database Field
                  <span className="block text-xs font-normal text-slate-500 dark:text-slate-400 mt-0.5">
                    Target schema field
                  </span>
                </th>
                <th className="text-left px-4 py-3.5 font-semibold text-slate-700 dark:text-slate-200 text-sm">
                  Confidence
                  <span className="block text-xs font-normal text-slate-500 dark:text-slate-400 mt-0.5">
                    AI match score
                  </span>
                </th>
                <th className="text-left px-4 py-3.5 font-semibold text-slate-700 dark:text-slate-200 text-sm">
                  Sample Data
                  <span className="block text-xs font-normal text-slate-500 dark:text-slate-400 mt-0.5">
                    Preview values
                  </span>
                </th>
                <th className="text-center px-4 py-3.5 font-semibold text-slate-700 dark:text-slate-200 text-sm">
                  Actions
                  <span className="block text-xs font-normal text-slate-500 dark:text-slate-400 mt-0.5">
                    Accept or skip
                  </span>
                </th>
                <th className="text-center px-4 py-3.5 font-semibold text-slate-700 dark:text-slate-200 text-sm">
                  Status
                  <span className="block text-xs font-normal text-slate-500 dark:text-slate-400 mt-0.5">
                    Current state
                  </span>
                </th>
              </tr>
            </thead>
            <tbody style={{ position: 'relative', zIndex: 1 }}>
            {mappingResults?.mappings?.map((mapping: FieldMapping, index: number) => {
              // Get sample data for this field
              let sampleData = '';
              if (tableHeaders && tableData && tableData.length > 0) {
                const colIndex = tableHeaders.findIndex(h => h === mapping.extracted_field);
                if (colIndex >= 0) {
                  // Get first non-empty value from the column
                  for (let i = 0; i < Math.min(3, tableData.length); i++) {
                    const value = tableData[i]?.[colIndex];
                    if (value && value.toString().trim()) {
                      sampleData = value.toString();
                      break;
                    }
                  }
                }
              }
              
              return (
                <AIFieldMapperRow
                  key={mapping.extracted_field}
                  mapping={mapping}
                  index={index}
                  status={rowStatuses[mapping.extracted_field] || 'pending'}
                  onApprove={handleApprove}
                  onSkip={handleSkip}
                  onRevert={handleRevert}
                  onEditStatement={handleStatementFieldEdit}
                  onDatabaseFieldChange={handleDatabaseFieldChange}
                  editedValue={editedStatementFields[mapping.extracted_field]}
                  selectedDatabaseField={databaseFieldSelections[mapping.extracted_field]}
                  databaseFields={databaseFields}
                  statementFields={tableHeaders}
                  sampleData={sampleData}
                />
              );
            })}
            </tbody>
          </table>
        )}
      </div>

      {/* Bottom Action Bar */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        <div className="space-y-3">
          {/* Accept All Button */}
          {mappingResults?.mappings && mappingResults.mappings.length > 0 && (
            <button
              onClick={() => {
                const allApproved: Record<string, 'approved'> = {};
                mappingResults.mappings.forEach(mapping => {
                  allApproved[mapping.extracted_field] = 'approved';
                });
                setRowStatuses(allApproved);
                checkAndNotifyStateChange({ rowStatuses: allApproved });
              }}
              className="
                w-full px-4 py-2.5 
                bg-slate-100 dark:bg-slate-700 
                hover:bg-slate-200 dark:hover:bg-slate-600
                text-slate-700 dark:text-slate-200
                rounded-lg font-medium text-sm
                transition-all duration-200
                flex items-center justify-center gap-2
                border border-slate-200 dark:border-slate-600
                hover:border-slate-300 dark:hover:border-slate-500
              "
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Accept All AI Mappings
            </button>
          )}
          
          {/* Review Table Button - IMPROVED */}
          <button
            onClick={onReviewTable}
            disabled={
              !mappingResults?.mappings || 
              mappingResults.mappings.length === 0 ||
              !mappingResults.mappings.every(mapping => 
                rowStatuses[mapping.extracted_field] === 'approved' || 
                rowStatuses[mapping.extracted_field] === 'skipped'
              ) ||
              (() => {
                const fieldValues = new Set<string>();
                for (const mapping of mappingResults.mappings) {
                  const fieldValue = editedStatementFields[mapping.extracted_field] || mapping.extracted_field;
                  if (fieldValues.has(fieldValue)) return true;
                  fieldValues.add(fieldValue);
                }
                return false;
              })()
            }
            className={`
              w-full px-4 py-2.5 rounded-lg font-semibold text-sm
              transition-all duration-200
              flex items-center justify-center gap-2
              ${(!mappingResults?.mappings || 
                mappingResults.mappings.length === 0 ||
                !mappingResults.mappings.every(mapping => 
                  rowStatuses[mapping.extracted_field] === 'approved' || 
                  rowStatuses[mapping.extracted_field] === 'skipped'
                ) ||
                (() => {
                  const fieldValues = new Set<string>();
                  for (const mapping of mappingResults.mappings) {
                    const fieldValue = editedStatementFields[mapping.extracted_field] || mapping.extracted_field;
                    if (fieldValues.has(fieldValue)) return true;
                    fieldValues.add(fieldValue);
                  }
                  return false;
                })())
                  ? 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 text-white hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]'
              }
            `}
          >
            Review Extracted Table
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </button>
          
          {/* Error/Info Messages */}
          {(() => {
            const duplicates = new Set<string>();
            const seen = new Set<string>();
            mappingResults?.mappings?.forEach(mapping => {
              const fieldValue = editedStatementFields[mapping.extracted_field] || mapping.extracted_field;
              if (seen.has(fieldValue)) duplicates.add(fieldValue);
              seen.add(fieldValue);
            });
            
            if (duplicates.size > 0) {
              return (
                <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <svg className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <p className="text-xs text-red-700 dark:text-red-300">
                    <strong>Duplicate fields detected:</strong> {Array.from(duplicates).join(', ')}
                  </p>
                </div>
              );
            }
            
            if (mappingResults?.mappings && !mappingResults.mappings.every(mapping => 
              rowStatuses[mapping.extracted_field] === 'approved' || 
              rowStatuses[mapping.extracted_field] === 'skipped'
            )) {
              return (
                <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <svg className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    Please accept or skip all fields before proceeding
                  </p>
                </div>
              );
            }
            
            return null;
          })()}
        </div>
      </div>
    </div>
  );
}
