import * as pdfParse from "pdf-parse/lib/pdf-parse.js";
import * as XLSX from "xlsx"


export const parsePDF = async (buffer: Buffer) => {
  const data = await pdfParse(buffer)
  const text = data.text

  // naive extraction logic just for demo
  const lines = text.split('\n').filter(line => line.trim() !== '')

  return lines.map((line, index) => ({
    id: index + 1,
    raw: line
  }))
}



export const parseExcel = async (buffer: Buffer) => {
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const json = XLSX.utils.sheet_to_json(sheet)
  return json
}

