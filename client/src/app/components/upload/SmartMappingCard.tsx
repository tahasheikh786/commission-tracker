/**
 * Smart Mapping Card Component
 * 
 * Intelligent field mapping card with confidence scores, editable mappings,
 * and sample data preview.
 */

"use client";

import React, { useState } from 'react';
import { FieldMapping } from '@/app/services/aiIntelligentMappingService';

interface SmartMappingCardProps {
  mapping: FieldMapping;
  onUpdate?: (extractedField: string, newMapping: string) => void;
  editable?: boolean;
  sampleValues?: string[];
  databaseFields?: Array<{ id: string; display_name: string; description?: string }>;
}

export default function SmartMappingCard({
  mapping,
  onUpdate,
  editable = false,
  sampleValues,
  databaseFields = []
}: SmartMappingCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [selectedField, setSelectedField] = useState(mapping.mapped_to);

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 90) return 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800';
    if (confidence >= 70) return 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-300 dark:border-yellow-800';
    return 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800';
  };

  const getConfidenceLevel = (score: number) => {
    if (score >= 90) return 'high';
    if (score >= 70) return 'medium';
    return 'low';
  };

  const handleSave = () => {
    if (onUpdate && selectedField) {
      onUpdate(mapping.extracted_field, selectedField);
      setIsEditing(false);
    }
  };

  const handleCancel = () => {
    setSelectedField(mapping.mapped_to);
    setIsEditing(false);
  };

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md transition-shadow">
      {/* Source Field */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-gray-800 dark:text-white truncate">
            {mapping.extracted_field}
          </h4>
          <p className="text-sm text-gray-600 dark:text-gray-400">Source field from document</p>
        </div>

        {/* Confidence Badge */}
        <span
          className={`
            px-2 py-1 rounded-full text-xs font-medium border ml-3 flex-shrink-0
            ${getConfidenceColor(mapping.confidence * 100)}
          `}
        >
          {Math.round(mapping.confidence * 100)}% match
        </span>
      </div>

      {/* Mapping Arrow */}
      <div className="flex items-center my-3">
        <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700"></div>
        <svg
          className="w-4 h-4 text-gray-400 dark:text-gray-600 mx-2"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
        </svg>
        <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700"></div>
      </div>

      {/* Target Field */}
      <div className="space-y-2">
        {editable && isEditing ? (
          <DatabaseFieldSelector
            value={selectedField}
            onChange={setSelectedField}
            onSave={handleSave}
            onCancel={handleCancel}
            databaseFields={databaseFields}
          />
        ) : (
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-blue-800 dark:text-blue-300 truncate">
                {mapping.mapped_to || 'Not mapped'}
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">Database field</p>
            </div>

            {editable && (
              <button
                onClick={() => setIsEditing(true)}
                className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-sm font-medium ml-3 flex-shrink-0"
              >
                Edit
              </button>
            )}
          </div>
        )}
      </div>

      {/* Sample Data Preview */}
      {(sampleValues || mapping.alternatives) && (
        <div className="mt-3 p-2 bg-gray-50 dark:bg-gray-900 rounded text-xs">
          {sampleValues && (
            <div>
              <span className="text-gray-600 dark:text-gray-400">Sample: </span>
              <span className="font-mono text-gray-800 dark:text-gray-200">
                {sampleValues.slice(0, 2).join(', ')}
              </span>
              {sampleValues.length > 2 && <span className="text-gray-500">...</span>}
            </div>
          )}
        </div>
      )}

      {/* Reasoning (collapsible) */}
      {mapping.reasoning && (
        <details className="mt-3">
          <summary className="text-sm text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-800 dark:hover:text-gray-200">
            View reasoning
          </summary>
          <p className="text-sm text-gray-700 dark:text-gray-300 mt-2 pl-4 border-l-2 border-gray-200 dark:border-gray-700">
            {mapping.reasoning}
          </p>
        </details>
      )}
    </div>
  );
}

// Database Field Selector Component
interface DatabaseFieldSelectorProps {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  databaseFields: Array<{ id: string; display_name: string; description?: string }>;
}

function DatabaseFieldSelector({
  value,
  onChange,
  onSave,
  onCancel,
  databaseFields
}: DatabaseFieldSelectorProps) {
  return (
    <div className="space-y-2">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      >
        <option value="">Select a field...</option>
        {databaseFields.map((field) => (
          <option key={field.id} value={field.display_name}>
            {field.display_name}
            {field.description && ` - ${field.description}`}
          </option>
        ))}
      </select>

      <div className="flex items-center space-x-2">
        <button
          onClick={onSave}
          disabled={!value}
          className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          Save
        </button>
        <button
          onClick={onCancel}
          className="flex-1 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-md text-sm font-medium border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// Mapping Section Component
interface MappingSectionProps {
  title: string;
  subtitle: string;
  mappings: FieldMapping[];
  isExpanded?: boolean;
  onToggle?: () => void;
  variant?: 'success' | 'warning' | 'info';
  editable?: boolean;
  onMappingChange?: (extractedField: string, newMapping: string) => void;
  databaseFields?: Array<{ id: string; display_name: string; description?: string }>;
}

export function MappingSection({
  title,
  subtitle,
  mappings,
  isExpanded = true,
  onToggle,
  variant = 'info',
  editable = false,
  onMappingChange,
  databaseFields = []
}: MappingSectionProps) {
  const variantColors = {
    success: 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800',
    warning: 'bg-yellow-50 dark:bg-yellow-900/10 border-yellow-200 dark:border-yellow-800',
    info: 'bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800'
  };

  return (
    <div className={`border rounded-lg overflow-hidden ${variantColors[variant]}`}>
      <button
        onClick={onToggle}
        className="w-full p-4 flex items-center justify-between hover:bg-opacity-80 transition-colors"
      >
        <div className="text-left">
          <h3 className="font-semibold text-gray-900 dark:text-white">{title}</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{subtitle}</p>
        </div>
        {onToggle && (
          <svg
            className={`w-5 h-5 text-gray-600 dark:text-gray-400 transform transition-transform ${
              isExpanded ? 'rotate-180' : ''
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>

      {isExpanded && mappings.length > 0 && (
        <div className="p-4 pt-0 space-y-3">
          {mappings.map((mapping) => (
            <SmartMappingCard
              key={mapping.extracted_field}
              mapping={mapping}
              editable={editable}
              onUpdate={onMappingChange}
              databaseFields={databaseFields}
            />
          ))}
        </div>
      )}

      {isExpanded && mappings.length === 0 && (
        <div className="p-4 pt-0 text-center text-gray-500 dark:text-gray-400">
          No mappings in this category
        </div>
      )}
    </div>
  );
}

