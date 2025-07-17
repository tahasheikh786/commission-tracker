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
  initialMapping,
}: {
  company: { id: string, name: string }
  columns: string[]
  onSave: (mapping: Record<string, string>, fields: FieldConf[]) => void
  onSkip: () => void
  initialFields?: FieldConf[]
  initialMapping?: Record<string, string> | null
}) {
  const [fields, setFields] = useState<FieldConf[]>(initialFields)
  const [mapping, setMapping] = useState<Record<string, string>>(initialMapping || {})
  const [saving, setSaving] = useState(false)
  const [customFieldName, setCustomFieldName] = useState('')

  // DnD-kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  // Sync mapping and fields if props change
  useEffect(() => {
    setFields(initialFields)
  }, [JSON.stringify(initialFields)])

  useEffect(() => {
    if (initialMapping) {
      setMapping(initialMapping)
    } else {
      // Fuzzy match: try to auto-map by label
      const map: Record<string, string> = {}
      for (const f of initialFields) {
        const found = columns.find(col => fuzzyMatch(col, f.label))
        if (found) map[f.field] = found
      }
      setMapping(map)
    }
    // eslint-disable-next-line
  }, [initialMapping, columns])

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
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/companies/${company.id}/mapping/`, {
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
    <div className="bg-white rounded-3xl shadow-2xl p-10 mb-8 border max-w-4xl mx-auto w-full min-w-[340px]">
      <h2 className="text-2xl font-bold mb-8 text-gray-800">Map Extracted Columns</h2>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={fields.map(f => f.field)}
          strategy={verticalListSortingStrategy}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] mb-6 text-base">
              <thead>
                <tr>
                  <th className="w-8"></th>
                  <th className="py-2 px-4 text-left">Database name</th>
                  <th className="py-2 px-4 text-left">Carrier Field</th>
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
                            className="border rounded-lg px-3 py-2 w-full min-w-[140px] text-base"
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
          </div>
        </SortableContext>
      </DndContext>
      <div className="flex items-center gap-3 mb-5">
        <input
          className="border rounded px-3 py-2 flex-1 text-base"
          placeholder="New field name"
          value={customFieldName}
          onChange={e => setCustomFieldName(e.target.value)}
        />
        <button
          type="button"
          className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-bold shadow hover:scale-105 transition"
          onClick={handleAddCustomField}
        >
          <Plus size={18} /> Add field
        </button>
      </div>
      <div className="flex gap-5 mt-6">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-500 text-white font-semibold shadow hover:scale-105 transition text-base"
        >
          {saving ? "Saving..." : "Save Mapping"}
        </button>
        {onSkip && (
          <button
            type="button"
            onClick={onSkip}
            className="px-6 py-2 rounded-xl bg-gray-300 text-gray-700 font-semibold shadow hover:bg-gray-400 transition text-base"
          >
            Skip and Use Extracted Table
          </button>
        )}
      </div>
    </div>
  )
}
