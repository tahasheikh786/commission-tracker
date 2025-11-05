/**
 * AI Field Mapper Row Component - REDESIGNED
 * 
 * Premium table row with custom dropdowns, proper spacing, and polished interactions
 */

import React, { useState, useEffect } from 'react';
import { FieldMapping } from '@/app/services/aiIntelligentMappingService';
import CustomDropdown from '@/app/components/ui/CustomDropdown';
import { CheckCircle2, XCircle, Sparkles, Pencil } from 'lucide-react';

interface AIFieldMapperRowProps {
  mapping: FieldMapping;
  index: number;
  status: 'pending' | 'approved' | 'skipped';
  onApprove: (fieldId: string) => void;
  onSkip: (fieldId: string) => void;
  onRevert?: (fieldId: string) => void;
  onEditStatement: (fieldId: string, value: string) => void;
  onDatabaseFieldChange: (fieldId: string, dbFieldId: string) => void;
  editedValue?: string;
  selectedDatabaseField?: string;
  sampleData?: string;
  databaseFields?: Array<{ id: string; display_name: string; description?: string }>;
  statementFields?: string[];
}

export default function AIFieldMapperRow({ 
  mapping, 
  index, 
  status, 
  onApprove, 
  onSkip, 
  onRevert,
  onEditStatement, 
  onDatabaseFieldChange,
  editedValue,
  selectedDatabaseField,
  sampleData,
  databaseFields = [],
  statementFields = [] 
}: AIFieldMapperRowProps) {
  // State for inline statement field editing
  const [isEditingStatementField, setIsEditingStatementField] = useState(false);
  const [statementFieldValue, setStatementFieldValue] = useState(editedValue || mapping.extracted_field);

  // Update state when editedValue prop changes
  useEffect(() => {
    if (editedValue !== undefined) {
      setStatementFieldValue(editedValue);
    }
  }, [editedValue]);

  const handleStatementFieldBlur = () => {
    setIsEditingStatementField(false);
    if (statementFieldValue !== mapping.extracted_field) {
      onEditStatement(mapping.extracted_field, statementFieldValue);
    }
  };

  // CRITICAL FIX: Compute the correct database field value with intelligent resolution
  const computeDbFieldValue = React.useCallback(() => {
   
    
    // Priority 1: Use selectedDatabaseField (from parent state)
    if (selectedDatabaseField) {
      return String(selectedDatabaseField);
    }
    
    // Priority 2: Use mapping.database_field_id if it exists in options
    if (mapping.database_field_id && databaseFields.length > 0) {
      const dbFieldIdStr = String(mapping.database_field_id);
      const existsById = databaseFields.find(f => 
        f && f.id && String(f.id) === dbFieldIdStr
      );
      if (existsById) {
        return dbFieldIdStr;
      }
    }
    
    // Priority 3: Match by display name
    if (mapping.mapped_to && databaseFields.length > 0) {
      const matchByName = databaseFields.find(f => 
        f && f.display_name && 
        f.display_name.toLowerCase() === mapping.mapped_to.toLowerCase()
      );
      if (matchByName) {
        return String(matchByName.id);
      }
      
      // Fuzzy match as last resort
      const fuzzyMatch = databaseFields.find(f => 
        f && f.display_name && mapping.mapped_to && (
          f.display_name.toLowerCase().includes(mapping.mapped_to.toLowerCase()) ||
          mapping.mapped_to.toLowerCase().includes(f.display_name.toLowerCase())
        )
      );
      if (fuzzyMatch) {
        return String(fuzzyMatch.id);
      }
    }
    
    return '';
  }, [selectedDatabaseField, mapping.database_field_id, mapping.mapped_to, databaseFields]);
  
  // State that recomputes when dependencies change
  const [dbFieldValue, setDbFieldValue] = useState(() => computeDbFieldValue());
  
  // CRITICAL: Update when any dependency changes (especially when databaseFields loads)
  useEffect(() => {
    const newValue = computeDbFieldValue();
    if (newValue !== dbFieldValue) {
      setDbFieldValue(newValue);
      
      // IMPORTANT: Notify parent of the auto-selected value
      if (newValue && !selectedDatabaseField) {
        onDatabaseFieldChange(mapping.extracted_field, newValue);
      }
    }
  }, [selectedDatabaseField, mapping.database_field_id, mapping.mapped_to, databaseFields, computeDbFieldValue, dbFieldValue, onDatabaseFieldChange, mapping.extracted_field]);

  // Premium animations based on status
  const rowClassName = `
    transition-all duration-300 ease-in-out
    border-b border-slate-100 dark:border-slate-800
    ${status === 'approved' ? 'bg-green-50/50 dark:bg-green-900/10' : ''}
    ${status === 'skipped' ? 'bg-slate-100/50 dark:bg-slate-800/30 opacity-70' : ''}
    ${status === 'pending' ? 'hover:bg-slate-50/50 dark:hover:bg-slate-800/30' : ''}
  `;

  // Confidence color coding
  const confidenceColor = mapping.confidence >= 0.8 
    ? { text: 'text-green-600 dark:text-green-400', bg: 'bg-green-500' }
    : mapping.confidence >= 0.5 
    ? { text: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-500' }
    : { text: 'text-red-600 dark:text-red-400', bg: 'bg-red-500' };

  // Build database field options
  const databaseOptions = React.useMemo(() => {
    if (databaseFields.length > 0) {
      // Filter out invalid fields and map to options
      const options = databaseFields
        .filter(field => field && field.id && field.display_name)
        .map(field => ({
          id: String(field.id),
          label: field.display_name,
          description: field.description || ''
        }));
  
      return options;
    }
    
    // Fallback to AI-generated options when no databaseFields provided
    return [
      {
        id: mapping.database_field_id || mapping.mapped_to_column || '',
        label: mapping.mapped_to,
        confidence: mapping.confidence
      },
      ...(mapping.alternatives?.map(alt => ({
        id: alt.field,
        label: alt.field,
        confidence: alt.confidence
      })) || [])
    ];
  }, [databaseFields, mapping, dbFieldValue]);

  return (
    <tr 
      className={rowClassName}
      style={{ 
        animation: `fadeInUp 0.4s ease-out ${index * 0.05}s both`
      }}
    >
      {/* Statement Field Column - Inline Editable */}
      <td className="px-4 py-3 relative z-10">
        <div className="flex items-center gap-2 min-w-[180px]">
          {isEditingStatementField ? (
            <input
              type="text"
              value={statementFieldValue}
              onChange={(e) => setStatementFieldValue(e.target.value)}
              onBlur={handleStatementFieldBlur}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleStatementFieldBlur();
                if (e.key === 'Escape') {
                  setStatementFieldValue(editedValue || mapping.extracted_field);
                  setIsEditingStatementField(false);
                }
              }}
              autoFocus
              disabled={status === 'skipped'}
              className="
                flex-1 px-2 py-1.5 
                border border-blue-500 dark:border-blue-400
                rounded-md
                text-sm text-slate-900 dark:text-white
                bg-white dark:bg-slate-700
                focus:outline-none focus:ring-2 focus:ring-blue-500
                disabled:opacity-50 disabled:cursor-not-allowed
              "
            />
          ) : (
            <div 
              onClick={() => !status || status === 'pending' ? setIsEditingStatementField(true) : null}
              className={`
                flex-1 flex items-center gap-2 px-2 py-1.5 rounded-md
                text-sm text-slate-900 dark:text-white
                ${(status === 'pending' || !status) ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50' : 'cursor-default'}
                ${status === 'skipped' ? 'opacity-50' : ''}
              `}
            >
              <span className="flex-1">{statementFieldValue}</span>
              {(status === 'pending' || !status) && (
                <Pencil className="w-3 h-3 text-gray-400 dark:text-gray-500" />
              )}
            </div>
          )}
        </div>
      </td>

      {/* Database Field Column */}
      <td className="px-4 py-3 relative z-10">
        <CustomDropdown
          value={dbFieldValue}
          onChange={(value) => {
            setDbFieldValue(value);
            onDatabaseFieldChange(mapping.extracted_field, value);
          }}
          options={databaseOptions}
          placeholder="Select database field..."
          searchable={databaseOptions.length > 5}
          disabled={status === 'skipped'}
          showConfidence={databaseFields.length === 0}
          className="min-w-[200px]"
        />
      </td>

      {/* Confidence Column */}
      <td className="px-4 py-3 relative">
        <div className="flex items-center gap-2">
          {/* AI Indicator */}
          <Sparkles className={`w-3.5 h-3.5 ${confidenceColor.text}`} />
          
          {/* Progress Bar */}
          <div className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden max-w-[80px]">
            <div 
              className={`h-full ${confidenceColor.bg} transition-all duration-500 ease-out`}
              style={{ width: `${mapping.confidence * 100}%` }}
            />
          </div>
          
          {/* Percentage */}
          <span className={`text-xs font-semibold ${confidenceColor.text} tabular-nums min-w-[36px]`}>
            {(mapping.confidence * 100).toFixed(0)}%
          </span>
        </div>
      </td>

      {/* Sample Data Column */}
      <td className="px-4 py-3 relative">
        <div className="max-w-[160px]">
          {sampleData ? (
            <div 
              className="text-sm text-slate-700 dark:text-slate-300 font-mono truncate bg-slate-50 dark:bg-slate-900 px-2 py-1 rounded border border-slate-200 dark:border-slate-700"
              title={sampleData}
            >
              {sampleData}
            </div>
          ) : (
            <span className="text-xs text-slate-400 dark:text-slate-500 italic">No sample</span>
          )}
        </div>
      </td>

      {/* Actions Column */}
      <td className="px-4 py-3 relative">
        <div className="flex items-center gap-2">
          {status === 'approved' ? (
            <>
              <button
                disabled
                className="
                  flex items-center gap-1.5 px-3 py-1.5
                  bg-green-100 dark:bg-green-900/30
                  text-green-700 dark:text-green-300
                  rounded-lg font-medium text-sm
                  transition-all duration-200
                  border border-green-200 dark:border-green-800
                "
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Approved
              </button>
              <button
                onClick={() => onRevert ? onRevert(mapping.extracted_field) : null}
                className="
                  flex items-center gap-1.5 px-2.5 py-1.5
                  text-sm text-gray-600 dark:text-gray-400
                  hover:text-gray-800 dark:hover:text-gray-200
                  hover:bg-gray-100 dark:hover:bg-gray-700
                  rounded-md transition-colors
                "
                title="Undo mapping"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                </svg>
                <span>Undo</span>
              </button>
            </>
          ) : status === 'skipped' ? (
            <>
              <button
                disabled
                className="
                  flex items-center gap-1.5 px-3 py-1.5
                  bg-slate-100 dark:bg-slate-800
                  text-slate-600 dark:text-slate-400
                  rounded-lg font-medium text-sm
                  border border-slate-200 dark:border-slate-700
                "
              >
                <XCircle className="w-3.5 h-3.5" />
                Skipped
              </button>
              <button
                onClick={() => onRevert ? onRevert(mapping.extracted_field) : null}
                className="
                  flex items-center gap-1.5 px-2.5 py-1.5
                  text-sm text-gray-600 dark:text-gray-400
                  hover:text-gray-800 dark:hover:text-gray-200
                  hover:bg-gray-100 dark:hover:bg-gray-700
                  rounded-md transition-colors
                "
                title="Undo skip"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                </svg>
                <span>Undo</span>
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => onApprove(mapping.extracted_field)}
                disabled={!dbFieldValue}
                className={`
                  px-3 py-1.5 rounded-lg font-medium text-sm
                  transition-all duration-200
                  hover:shadow-md hover:scale-105
                  active:scale-95
                  flex items-center gap-1.5
                  ${!dbFieldValue 
                    ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed' 
                    : 'bg-green-600 hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700 text-white'
                  }
                `}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Accept
              </button>
              <button
                onClick={() => onSkip(mapping.extracted_field)}
                className="
                  px-3 py-1.5 rounded-lg font-medium text-sm
                  bg-white dark:bg-slate-700
                  border border-slate-300 dark:border-slate-600
                  text-slate-700 dark:text-slate-300
                  hover:bg-slate-50 dark:hover:bg-slate-600
                  transition-all duration-200
                  hover:border-slate-400 dark:hover:border-slate-500
                "
              >
                Skip
              </button>
            </>
          )}
        </div>
      </td>

      {/* Status Column */}
      <td className="px-4 py-3 text-center relative">
        {status === 'approved' && (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800">
            <CheckCircle2 className="w-3 h-3" />
            Approved
          </span>
        )}
        {status === 'skipped' && (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
            <XCircle className="w-3 h-3" />
            Skipped
          </span>
        )}
        {status === 'pending' && (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 animate-pulse-glow-soft">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            Pending
          </span>
        )}
      </td>
    </tr>
  );
}
