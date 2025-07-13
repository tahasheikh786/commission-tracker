'use client'
import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { X, Plus, GripVertical } from 'lucide-react'
import { STANDARD_FIELDS } from '@/constants/fields'

import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

function fuzzyMatch(a: string, b: string) {
  return (
    a.toLowerCase().replace(/[^a-z]/g, '') === b.toLowerCase().replace(/[^a-z]/g, '') ||
    a.toLowerCase().includes(b.toLowerCase()) ||
    b.toLowerCase().includes(a.toLowerCase())
  )
}

type FieldConf = { field: string, label: string }

function DraggableRow({
  id,
  children,
}: {
  id: string
  children: (params: {
    attributes: any
    listeners: any
    isDragging: boolean
  }) => React.ReactNode
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })
  return (
    <tr
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        background: isDragging ? '#f0f6ff' : undefined,
      }}
    >
      {children({ attributes, listeners, isDragging })}
    </tr>
  )
}

export default function FieldMapper({
  company,
  columns,
  onSave,
  onSkip,
  initialFields = STANDARD_FIELDS,
}: {
  company: { id: string, name: string }
  columns: string[]
  onSave: (mapping: Record<string, string>, fields: FieldConf[]) => void
  onSkip: () => void
  initialFields?: FieldConf[]
}) {
  const [fields, setFields] = useState<FieldConf[]>(initialFields)
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [customFieldName, setCustomFieldName] = useState('')

  // DnD-kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  // GET mapping: parse backend rows to our {mapping, fields}
  useEffect(() => {
    fetch(`http://localhost:8000/companies/${company.id}/mapping/`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          const newMapping: Record<string, string> = {}
          const newFields: FieldConf[] = []
          data.forEach((row: any) => {
            newMapping[row.field_key] = row.column_name
            if (!newFields.some(f => f.field === row.field_key)) {
              // <---- CHANGE IS HERE
              const std = STANDARD_FIELDS.find(sf => sf.field === row.field_key)
              newFields.push({ field: row.field_key, label: std?.label || row.field_key })
            }
          })
          setMapping(newMapping)
          setFields(newFields.length ? newFields : initialFields)
        } else {
          // Try fuzzy map as before
          const map: Record<string, string> = {}
          for (const f of fields) {
            const found = columns.find(col => fuzzyMatch(col, f.label))
            if (found) map[f.field] = found
          }
          setMapping(map)
        }
      })
    // eslint-disable-next-line
  }, [company.id, columns])


  function setFieldMap(field: string, col: string) {
    setMapping(m => ({ ...m, [field]: col }))
  }

  function handleRenameField(idx: number, newLabel: string) {
    setFields(fields => fields.map((f, i) => i === idx ? { ...f, label: newLabel } : f))
  }

  function handleAddCustomField() {
    const field = 'custom_' + Math.random().toString(36).substring(2, 10)
    if (!customFieldName.trim()) return
    setFields(fields => [...fields, { field, label: customFieldName.trim() }])
    setCustomFieldName('')
  }

  function handleDeleteField(idx: number) {
    setFields(fields => fields.filter((_, i) => i !== idx))
    setMapping(mapping => {
      const updated = { ...mapping }
      delete updated[fields[idx].field]
      return updated
    })
  }

  async function handleSave() {
    setSaving(true)
    await fetch(`http://localhost:8000/companies/${company.id}/mapping/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mapping),
    })
    setSaving(false)
    toast.success("Mapping saved!")
    onSave(mapping, fields)
  }

  // DnD: handle reorder
  function handleDragEnd(event: any) {
    const { active, over } = event
    if (active.id !== over?.id) {
      const oldIndex = fields.findIndex(f => f.field === active.id)
      const newIndex = fields.findIndex(f => f.field === over.id)
      setFields(arrayMove(fields, oldIndex, newIndex))
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-2xl p-8 mb-8 border max-w-3xl mx-auto">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">Map Extracted Columns</h2>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={fields.map(f => f.field)}
          strategy={verticalListSortingStrategy}
        >
          <table className="w-full mb-6">
            <thead>
              <tr>
                <th className="w-8"></th>
                <th className="py-2 px-4 text-left">Field name</th>
                <th className="py-2 px-4 text-left">Extracted column</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {fields.map((f, i) => (
                <DraggableRow key={f.field} id={f.field}>
                  {({ attributes, listeners, isDragging }) => (
                    <>
                      <td className="py-2 px-2 cursor-grab select-none" {...attributes} {...listeners}>
                        <GripVertical size={20} className="text-gray-400" />
                      </td>
                      <td className="py-2 px-4 flex items-center gap-2">
                        <input
                          className="border-b border-gray-300 bg-transparent px-1 focus:outline-none font-medium text-gray-800 w-full"
                          value={f.label}
                          onChange={e => handleRenameField(i, e.target.value)}
                          aria-label="Edit field label"
                        />
                        <button
                          onClick={() => handleDeleteField(i)}
                          className="ml-1 p-1 text-red-500 hover:bg-red-100 rounded"
                          title="Delete field"
                          aria-label="Remove field"
                        >
                          <X size={16} />
                        </button>
                      </td>
                      <td className="py-2 px-4">
                        <select
                          className="border rounded px-2 py-1 w-full"
                          value={mapping[f.field] || ""}
                          onChange={e => setFieldMap(f.field, e.target.value)}
                        >
                          <option value="">-</option>
                          {columns.map(col => (
                            <option key={col} value={col}>{col}</option>
                          ))}
                        </select>
                      </td>
                      <td></td>
                    </>
                  )}
                </DraggableRow>
              ))}
            </tbody>
          </table>
        </SortableContext>
      </DndContext>
      <div className="flex items-center gap-2 mb-5">
        <input
          className="border rounded px-2 py-1 flex-1"
          placeholder="New field name"
          value={customFieldName}
          onChange={e => setCustomFieldName(e.target.value)}
        />
        <button
          type="button"
          className="inline-flex items-center gap-2 px-4 py-2 rounded bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-bold shadow hover:scale-105 transition"
          onClick={handleAddCustomField}
        >
          <Plus size={18} /> Add field
        </button>
      </div>
      <div className="flex gap-4 mt-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2 rounded bg-gradient-to-br from-blue-600 to-indigo-500 text-white font-semibold shadow hover:scale-105 transition"
        >
          Save Mapping
        </button>
        {onSkip && (
          <button
            type="button"
            onClick={onSkip}
            className="ml-2 px-5 py-2 rounded bg-gray-300 text-gray-700 font-semibold shadow hover:bg-gray-400 transition"
          >
            Skip and Use Extracted Table
          </button>
        )}
      </div>

    </div>
  )
}
