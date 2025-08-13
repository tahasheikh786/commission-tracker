'use client'
import TableEditor from './TableEditor/TableEditor'
import { TableEditorProps } from './TableEditor/types'

export default function TableEditorWrapper(props: TableEditorProps) {
  return <TableEditor {...props} />
}
