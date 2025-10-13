/**
 * Editable Cell Component
 * Inline editable table cell with click-to-edit functionality
 */

'use client';

import React, { memo, useCallback, useRef, useEffect } from 'react';

interface EditableCellProps {
  value: string;
  isEditing: boolean;
  onStartEdit: () => void;
  onSave: (value: string) => void;
  onCancel: () => void;
  className?: string;
}

const EditableCell = memo(function EditableCell({
  value,
  isEditing,
  onStartEdit,
  onSave,
  onCancel,
  className = ''
}: EditableCellProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [editValue, setEditValue] = React.useState(value);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Update edit value when value prop changes
  useEffect(() => {
    if (!isEditing) {
      setEditValue(value);
    }
  }, [value, isEditing]);

  const handleSave = useCallback(() => {
    onSave(editValue);
  }, [editValue, onSave]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      onCancel();
    }
  }, [handleSave, onCancel]);

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className={`w-full px-2 py-1 border-2 border-blue-400 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${className}`}
      />
    );
  }

  return (
    <div
      onClick={onStartEdit}
      className={`cursor-pointer hover:bg-blue-50 rounded px-2 py-1 transition-colors truncate ${className}`}
      title={value}
    >
      {value || <span className="text-gray-400 italic">Empty</span>}
    </div>
  );
});

export default EditableCell;

