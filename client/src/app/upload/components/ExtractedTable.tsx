'use client'
import { useState, useRef, useEffect } from 'react'
import { Pencil, Trash2, X, Check, Download, ArrowUpDown, ArrowDown, ArrowUp, Table2 } from 'lucide-react'
import clsx from 'clsx'

type TableData = {
  header: string[]
  rows: string[][]
  name?: string
}

type ExtractedTablesProps = {
  tables: TableData[],
  onTablesChange?: (tables: TableData[]) => void,
  highlightedRow?: { tableIdx: number, rowIdx: number } | null,
  onRowHover?: (tableIdx: number, rowIdx: number | null) => void,
}

// Helper functions moved outside component
function isHeaderLikeRow(row: string[]) {
  const minStringCells = 3;
  const nonempty = row.filter(cell => cell && cell.trim());
  if (nonempty.length < minStringCells) return false;
  const allAlpha = nonempty.every(cell => /^[A-Za-z .\-:]+$/.test(cell.trim()));
  return allAlpha;
}

function fixPercent(val: string): string {
  if (!val) return val;
  return val
    .replace(/\bolo\b/g, '%')
    .replace(/\b010\b/g, '%')
    .replace(/OLO/g, '%')
    .replace(/010/g, '%');
}

function downloadCSV(table: TableData, name: string) {
  const csv = [
    table.header.join(','),
    ...table.rows.map(row => row.map(cell => '"' + (cell || '').replace(/"/g, '""') + '"').join(','))
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (name || 'table') + '.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function areHeadersExtremelySimilar(h1: string[], h2: string[]): boolean {
  if (h1.length !== h2.length) return false;
  
  // Check if headers are identical after normalization
  for (let i = 0; i < h1.length; i++) {
    if (h1[i].trim().toLowerCase() !== h2[i].trim().toLowerCase()) {
      return false;
    }
  }
  
  return true;
}

function calculateComprehensiveSimilarity(table1: TableData, table2: TableData): number {
  const scores: number[] = [];
  const weights: number[] = [];
  
  // 1. Header similarity (weight: 0.3) - using enhanced function
  const headerSimilarity = calculateHeaderSimilarityWithColumnSplitting(table1.header, table2.header);
  scores.push(headerSimilarity);
  weights.push(0.3);
  
  // 2. Column count similarity (weight: 0.2)
  const colCountSimilarity = calculateColumnCountSimilarity(table1.header, table2.header);
  scores.push(colCountSimilarity);
  weights.push(0.2);
  
  // 3. Row format similarity (weight: 0.25)
  const rowFormatSimilarity = calculateRowFormatSimilarity(table1, table2);
  scores.push(rowFormatSimilarity);
  weights.push(0.25);
  
  // 4. Data pattern similarity (weight: 0.15)
  const dataPatternSimilarity = calculateDataPatternSimilarity(table1, table2);
  scores.push(dataPatternSimilarity);
  weights.push(0.15);
  
  // 5. Table structure similarity (weight: 0.1)
  const structureSimilarity = calculateStructureSimilarity(table1, table2);
  scores.push(structureSimilarity);
  weights.push(0.1);
  
  // Calculate weighted average
  const weightedSum = scores.reduce((sum, score, index) => sum + score * weights[index], 0);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  
  return weightedSum / totalWeight;
}

function calculateHeaderSimilarity(h1: string[], h2: string[]): number {
  if (h1.length !== h2.length) return 0;
  
  let matches = 0;
  for (let i = 0; i < h1.length; i++) {
    const header1 = h1[i].trim().toLowerCase();
    const header2 = h2[i].trim().toLowerCase();
    
    if (header1 === header2) {
      matches += 1;
    } else {
      // Check for partial similarity
      const similarity = calculateStringSimilarity(header1, header2);
      if (similarity >= 0.8) {
        matches += similarity;
      }
    }
  }
  
  return matches / h1.length;
}

function calculateStringSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;
  
  if (str1 === str2) return 1;
  
  // Simple character-based similarity
  const commonChars = str1.split('').filter(char => str2.includes(char)).length;
  const totalChars = Math.max(str1.length, str2.length);
  
  return commonChars / totalChars;
}

function calculateHeaderSimilarityWithColumnSplitting(h1: string[], h2: string[]): number {
  // Check for column splitting scenarios
  if (detectColumnSplitting(h1, h2)) {
    console.log('Detected column splitting - using enhanced similarity calculation');
    return calculateSimilarityWithColumnSplitting(h1, h2);
  }
  
  // Use regular similarity calculation
  return calculateHeaderSimilarity(h1, h2);
}

function detectColumnSplitting(h1: string[], h2: string[]): boolean {
  // Technique 1: Word-level analysis
  if (detectWordLevelSplitting(h1, h2)) {
    return true;
  }
  
  // Technique 2: Phrase similarity analysis
  if (detectPhraseSimilaritySplitting(h1, h2)) {
    return true;
  }
  
  // Technique 3: Column count analysis with content similarity
  if (detectColumnCountSplitting(h1, h2)) {
    return true;
  }
  
  return false;
}

function detectWordLevelSplitting(headers1: string[], headers2: string[]): boolean {
  // Get all words from both header sets
  const words1 = new Set<string>();
  const words2 = new Set<string>();
  
  headers1.forEach(header => {
    header.split(' ').forEach(word => words1.add(word.toLowerCase()));
  });
  
  headers2.forEach(header => {
    header.split(' ').forEach(word => words2.add(word.toLowerCase()));
  });
  
  // Check for common words that might indicate splitting
  const commonWords = new Set([...words1].filter(x => words2.has(x)));
  
  // If there are many common words but different column counts, likely splitting
  if (commonWords.size >= 3 && Math.abs(headers1.length - headers2.length) >= 1) {
    // Check if the common words form meaningful phrases when combined
    for (const word1 of commonWords) {
      for (const word2 of commonWords) {
        if (word1 !== word2) {
          const combinedPhrase = `${word1} ${word2}`;
          const headers1Joined = headers1.join(' ');
          const headers2Joined = headers2.join(' ');
          
          // Check if this combined phrase exists in either header set
          if (headers1Joined.includes(combinedPhrase) || headers2Joined.includes(combinedPhrase)) {
            return true;
          }
        }
      }
    }
  }
  
  return false;
}

function detectPhraseSimilaritySplitting(headers1: string[], headers2: string[]): boolean {
  // Join headers into phrases
  const phrase1 = headers1.join(' ');
  const phrase2 = headers2.join(' ');
  
  // Calculate phrase similarity
  const phraseSimilarity = calculatePhraseSimilarity(phrase1, phrase2);
  
  // If phrases are very similar but have different word counts, likely splitting
  if (phraseSimilarity >= 0.7) {
    const words1 = phrase1.split(' ');
    const words2 = phrase2.split(' ');
    
    // Check if one has significantly more words than the other
    if (Math.abs(words1.length - words2.length) >= 2) {
      return true;
    }
  }
  
  return false;
}

function detectColumnCountSplitting(headers1: string[], headers2: string[]): boolean {
  // If column counts are very different, check for content similarity
  if (Math.abs(headers1.length - headers2.length) >= 1) {
    // Calculate content similarity
    const contentSimilarity = calculateContentSimilarity(headers1, headers2);
    
    // If content is very similar but column counts differ, likely splitting
    if (contentSimilarity >= 0.6) {
      return true;
    }
  }
  
  return false;
}

function calculateContentSimilarity(headers1: string[], headers2: string[]): number {
  if (!headers1.length || !headers2.length) return 0;
  
  // Get all words from both sets
  const allWords1 = new Set<string>();
  const allWords2 = new Set<string>();
  
  headers1.forEach(header => {
    header.split(' ').forEach(word => allWords1.add(word.toLowerCase()));
  });
  
  headers2.forEach(header => {
    header.split(' ').forEach(word => allWords2.add(word.toLowerCase()));
  });
  
  // Calculate Jaccard similarity for words
  const intersection = new Set([...allWords1].filter(x => allWords2.has(x)));
  const union = new Set([...allWords1, ...allWords2]);
  
  const wordSimilarity = intersection.size / union.size;
  
  // Also check character-level similarity
  const charSimilarity = calculateCharacterSimilarity(headers1, headers2);
  
  // Combine word and character similarity
  return (wordSimilarity * 0.7) + (charSimilarity * 0.3);
}

function calculateCharacterSimilarity(headers1: string[], headers2: string[]): number {
  // Join all headers into single strings
  const text1 = headers1.join(' ');
  const text2 = headers2.join(' ');
  
  // Calculate character-based similarity
  const chars1 = new Set(text1.toLowerCase());
  const chars2 = new Set(text2.toLowerCase());
  
  const intersection = new Set([...chars1].filter(x => chars2.has(x)));
  const union = new Set([...chars1, ...chars2]);
  
  return intersection.size / union.size;
}

function calculateSimilarityWithColumnSplitting(h1: string[], h2: string[]): number {
  // Join headers to compare as phrases
  const h1Joined = h1.join(' ');
  const h2Joined = h2.join(' ');
  
  // Calculate phrase similarity
  const phraseSimilarity = calculatePhraseSimilarity(h1Joined, h2Joined);
  
  // Also consider individual word matches
  const words1 = new Set(h1Joined.split(' '));
  const words2 = new Set(h2Joined.split(' '));
  
  const wordIntersection = new Set([...words1].filter(x => words2.has(x)));
  const wordUnion = new Set([...words1, ...words2]);
  
  const wordSimilarity = wordIntersection.size / wordUnion.size;
  
  // Combine phrase and word similarity
  const combinedSimilarity = (phraseSimilarity * 0.7) + (wordSimilarity * 0.3);
  
  console.log(`Column splitting similarity: phrase=${phraseSimilarity.toFixed(3)}, word=${wordSimilarity.toFixed(3)}, combined=${combinedSimilarity.toFixed(3)}`);
  
  return combinedSimilarity;
}

function calculatePhraseSimilarity(phrase1: string, phrase2: string): number {
  if (!phrase1 || !phrase2) return 0;
  
  if (phrase1 === phrase2) return 1;
  
  // Simple character-based similarity for phrases
  const commonChars = phrase1.split('').filter(char => phrase2.includes(char)).length;
  const totalChars = Math.max(phrase1.length, phrase2.length);
  
  return commonChars / totalChars;
}

function calculateColumnCountSimilarity(h1: string[], h2: string[]): number {
  const count1 = h1.length;
  const count2 = h2.length;
  
  if (count1 === count2) return 1;
  if (count1 === 0 || count2 === 0) return 0;
  
  const maxCount = Math.max(count1, count2);
  const minCount = Math.min(count1, count2);
  const differenceRatio = (maxCount - minCount) / maxCount;
  
  return 1 - differenceRatio;
}

function calculateRowFormatSimilarity(table1: TableData, table2: TableData): number {
  const rows1 = table1.rows;
  const rows2 = table2.rows;
  
  if (!rows1.length || !rows2.length) return 0;
  
  // Check row length consistency
  const expectedLength1 = table1.header.length;
  const expectedLength2 = table2.header.length;
  
  const lengthMatches1 = rows1.filter(row => Math.abs(row.length - expectedLength1) <= 1).length;
  const lengthMatches2 = rows2.filter(row => Math.abs(row.length - expectedLength2) <= 1).length;
  
  const formatSimilarity1 = lengthMatches1 / rows1.length;
  const formatSimilarity2 = lengthMatches2 / rows2.length;
  
  return (formatSimilarity1 + formatSimilarity2) / 2;
}

function calculateDataPatternSimilarity(table1: TableData, table2: TableData): number {
  const rows1 = table1.rows.slice(0, 3); // Sample first 3 rows
  const rows2 = table2.rows.slice(0, 3);
  
  if (!rows1.length || !rows2.length) return 0;
  
  const patterns1 = analyzeColumnPatterns(rows1);
  const patterns2 = analyzeColumnPatterns(rows2);
  
  let patternMatches = 0;
  const totalColumns = Math.min(patterns1.length, patterns2.length);
  
  for (let i = 0; i < totalColumns; i++) {
    if (patternsAreSimilar(patterns1[i], patterns2[i])) {
      patternMatches += 1;
    }
  }
  
  return patternMatches / totalColumns;
}

function analyzeColumnPatterns(rows: string[][]): Array<{hasNumbers: boolean, hasCurrency: boolean, avgLength: number}> {
  if (!rows.length) return [];
  
  const maxCols = Math.max(...rows.map(row => row.length));
  const patterns = [];
  
  for (let colIdx = 0; colIdx < maxCols; colIdx++) {
    const columnData = rows.map(row => row[colIdx] || '').filter(cell => cell.trim());
    
    if (columnData.length === 0) {
      patterns.push({ hasNumbers: false, hasCurrency: false, avgLength: 0 });
      continue;
    }
    
    const hasNumbers = columnData.some(val => /\d/.test(val));
    const hasCurrency = columnData.some(val => val.includes('$'));
    const avgLength = columnData.reduce((sum, val) => sum + val.length, 0) / columnData.length;
    
    patterns.push({ hasNumbers, hasCurrency, avgLength });
  }
  
  return patterns;
}

function patternsAreSimilar(pattern1: any, pattern2: any): boolean {
  if (!pattern1 || !pattern2) return false;
  
  const matches = [
    pattern1.hasNumbers === pattern2.hasNumbers,
    pattern1.hasCurrency === pattern2.hasCurrency,
    Math.abs(pattern1.avgLength - pattern2.avgLength) <= 5
  ];
  
  return matches.filter(Boolean).length / matches.length >= 0.7;
}

function calculateStructureSimilarity(table1: TableData, table2: TableData): number {
  // Check if both tables have similar structure characteristics
  const hasHeaders1 = table1.header && table1.header.length > 0;
  const hasHeaders2 = table2.header && table2.header.length > 0;
  const hasRows1 = table1.rows && table1.rows.length > 0;
  const hasRows2 = table2.rows && table2.rows.length > 0;
  
  let matches = 0;
  let totalChecks = 0;
  
  if (hasHeaders1 === hasHeaders2) matches += 1;
  totalChecks += 1;
  
  if (hasRows1 === hasRows2) matches += 1;
  totalChecks += 1;
  
  // Check if both have similar row counts (within 50% difference)
  if (hasRows1 && hasRows2) {
    const rowCountDiff = Math.abs(table1.rows.length - table2.rows.length);
    const maxRows = Math.max(table1.rows.length, table2.rows.length);
    if (rowCountDiff / maxRows <= 0.5) {
      matches += 1;
    }
    totalChecks += 1;
  }
  
  return matches / totalChecks;
}

function mergeTablesByHeader(tables: TableData[]): TableData[] {
  const merged: TableData[] = [];
  const processed = new Set<number>();
  
  tables.forEach((table, index) => {
    if (processed.has(index)) return;
    
    // Check if table and header exist
    if (!table || !table.header || !Array.isArray(table.header)) {
      console.warn('Skipping table with invalid header:', table);
      return;
    }
    
    // Normalize header by removing empty strings
    const normalizedHeader = table.header.filter(cell => cell.trim());
    
    // Find all tables with similar structure using comprehensive similarity
    const similarTables = [table];
    processed.add(index);
    
    for (let j = index + 1; j < tables.length; j++) {
      if (processed.has(j)) continue;
      
      // Check if other table and header exist
      if (!tables[j] || !tables[j].header || !Array.isArray(tables[j].header)) {
        continue;
      }
      
      // Use comprehensive similarity instead of just header similarity
      const similarity = calculateComprehensiveSimilarity(table, tables[j]);
      
      // More flexible threshold for merging
      if (similarity >= 0.7) {
        console.log(`Merging tables with similarity: ${similarity.toFixed(3)}`);
        similarTables.push(tables[j]);
        processed.add(j);
      }
    }
    
    // Merge all similar tables
    const mergedTable: TableData = {
      header: normalizedHeader,
      rows: [],
      name: similarTables.map(t => t.name).filter(Boolean).join(', ') || ''
    };
    
    similarTables.forEach(similarTable => {
      // Normalize rows to match the normalized header
      const normalizedRows = similarTable.rows.map(row => {
        const paddedRow = [...row];
        while (paddedRow.length < normalizedHeader.length) {
          paddedRow.push('');
        }
        return paddedRow.slice(0, normalizedHeader.length);
      });
      mergedTable.rows.push(...normalizedRows);
    });
    
    merged.push(mergedTable);
  });
  
  return merged;
}

const ROWS_OPTIONS = [10, 25, 50];

function Pagination({
  page, setPage, pageCount
}: { page: number, setPage: (n: number) => void, pageCount: number }) {
  return (
    <div className="flex justify-center mt-4 space-x-2">
      <button disabled={page <= 1}
        className="px-2 py-1 rounded border bg-white hover:bg-gray-100 disabled:opacity-40"
        onClick={() => setPage(page - 1)}
      >Prev</button>
      {Array.from({ length: pageCount }, (_, i) => (
        <button key={i}
          onClick={() => setPage(i + 1)}
          className={clsx(
            "px-2 py-1 rounded border",
            page === i + 1 ? "bg-blue-600 text-white" : "bg-white hover:bg-gray-100"
          )}
        >{i + 1}</button>
      ))}
      <button disabled={page >= pageCount}
        className="px-2 py-1 rounded border bg-white hover:bg-gray-100 disabled:opacity-40"
        onClick={() => setPage(page + 1)}
      >Next</button>
    </div>
  )
}

export default function ExtractedTables({ tables: backendTables, onTablesChange, highlightedRow, onRowHover }: ExtractedTablesProps) {
  // All hooks organized at the top - must be called before any early returns
  const [tab, setTab] = useState(0)
  const [tables, setTables] = useState(() => {
    const mergedTables = mergeTablesByHeader(backendTables);
    return mergedTables.map(table => ({
      ...table,
      rows: Array.isArray(table.rows) ? [...table.rows] : [],
      name: table.name || ''
    }));
  })
  const [editRow, setEditRow] = useState<{ t: number, r: number } | null>(null)
  const [editValues, setEditValues] = useState<string[]>([])
  const [pages, setPages] = useState(Array(tables.length).fill(1))
  const [rowsPerPages, setRowsPerPages] = useState(Array(tables.length).fill(ROWS_OPTIONS[0]))
  const [selectedRows, setSelectedRows] = useState<Array<Set<number>>>(tables.map(() => new Set<number>()))
  const [sort, setSort] = useState<{ col: number, dir: 'asc' | 'desc' } | null>(null)
  const [colWidths, setColWidths] = useState<Array<number[]>>(tables.map(t => (t.header && Array.isArray(t.header) ? t.header.map(() => 160) : [])))
  
  // Refs
  const lastCallbackRef = useRef<string>('')
  const resizingCol = useRef<{ table: number, col: number } | null>(null)

  // Update local tables when backendTables change
  useEffect(() => {
    const mergedTables = mergeTablesByHeader(backendTables).map(table => ({
      ...table,
      rows: Array.isArray(table.rows) ? [...table.rows] : [],
      name: table.name || ''
    }));
    setTables(mergedTables);
  }, [backendTables]);

  // Initialize state when tables change
  useEffect(() => {
    setSelectedRows(selRows => {
      if (tables.length === selRows.length) return selRows;
      return tables.map(() => new Set<number>());
    });
    setColWidths(widths => {
      if (tables.length === widths.length) return widths;
      return tables.map(t => (t.header && Array.isArray(t.header) ? t.header.map(() => 160) : []));
    });
    setTab(t => t >= tables.length ? 0 : t);
  }, [tables.length, tables]);

  // Call onTablesChange only when tables changes, but avoid infinite loops
  useEffect(() => {
    if (onTablesChange && tables.length > 0) {
      // Create a hash of the current tables to prevent unnecessary callbacks
      const tablesHash = JSON.stringify(tables.map(t => ({ header: t.header, rowCount: t.rows.length, name: t.name })));
      
      if (tablesHash !== lastCallbackRef.current) {
        lastCallbackRef.current = tablesHash;
        onTablesChange(tables);
      }
    }
  }, [tables, onTablesChange]);

  // Guard: If no tables or invalid tab, render nothing - AFTER all hooks
  if (!tables.length || !tables[tab] || !tables[tab].header || !Array.isArray(tables[tab].header)) return null;

  // Computed values
  const sortedRows = (() => {
    const currentTable = tables[tab];
    const rows = Array.isArray(currentTable.rows) ? currentTable.rows : [];
    
    if (!sort) return rows;
    const { col, dir } = sort;
    return [...rows].sort((a, b) => {
      const va = a[col] || '';
      const vb = b[col] || '';
      if (!isNaN(Number(va)) && !isNaN(Number(vb))) {
        return dir === 'asc' ? Number(va) - Number(vb) : Number(vb) - Number(va);
      }
      return dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    });
  })();

  const currentRowsPerPage = rowsPerPages[tab];
  const currentPage = pages[tab];
  const pageCount = Math.max(1, Math.ceil(sortedRows.length / currentRowsPerPage));
  const pagedRows = sortedRows.slice(
    (currentPage - 1) * currentRowsPerPage,
    currentPage * currentRowsPerPage
  );
  const globalIndices = Array.from({ length: pagedRows.length }, (_, i) => (currentPage - 1) * currentRowsPerPage + i);
  const totalItems = sortedRows.length;
  const showingFrom = (currentPage - 1) * currentRowsPerPage + 1;
  const showingTo = Math.min(currentPage * currentRowsPerPage, totalItems);

  // Event handlers
  function isRowSelected(idx: number) {
    return selectedRows[tab].has(idx);
  }

  function toggleRow(idx: number) {
    setSelectedRows(selRows =>
      selRows.map((s, i) => {
        if (i !== tab) return s;
        const newSet = new Set(s);
        if (newSet.has(idx)) newSet.delete(idx);
        else newSet.add(idx);
        return newSet;
      })
    )
  }

  function toggleSelectAllOnPage() {
    const selected = selectedRows[tab];
    const allSelected = globalIndices.every(idx => selected.has(idx));
    setSelectedRows(selRows =>
      selRows.map((s, i) => {
        if (i !== tab) return s;
        if (allSelected) {
          const newSet = new Set(s);
          globalIndices.forEach(idx => newSet.delete(idx));
          return newSet;
        } else {
          const newSet = new Set(s);
          globalIndices.forEach(idx => newSet.add(idx));
          return newSet;
        }
      })
    );
  }

  function deleteSelectedRowsOnPage() {
    setTables(tables =>
      tables.map((tbl, tblIdx) => {
        if (tblIdx !== tab) return tbl;
        const newRows = tbl.rows.filter((_, i) =>
          !selectedRows[tab].has(i)
        );
        return { ...tbl, rows: newRows }
      })
    );
    setSelectedRows(selRows =>
      selRows.map((s, i) => (i === tab ? new Set<number>() : s))
    );
    if (editRow?.t === tab && selectedRows[tab].has(editRow.r)) {
      setEditRow(null)
    }
  }

  function deleteRow(t: number, r: number) {
    setTables(tables =>
      tables.map((tbl, idx) =>
        idx === t ? { ...tbl, rows: tbl.rows.filter((_, i) => i !== r) } : tbl
      )
    )
    setSelectedRows(selRows =>
      selRows.map((s, i) => {
        if (i !== t) return s;
        const newSet = new Set(s);
        newSet.delete(r);
        return newSet;
      })
    );
    if (editRow?.t === t && editRow.r === r) setEditRow(null)
  }

  function startEdit(t: number, r: number) {
    setEditRow({ t, r })
    setEditValues([...tables[t].rows[r]])
  }

  function cancelEdit() {
    setEditRow(null)
    setEditValues([])
  }

  function saveEdit() {
    setTables(tables =>
      tables.map((tbl, tIdx) =>
        tIdx === editRow!.t
          ? { ...tbl, rows: tbl.rows.map((row, rIdx) => rIdx === editRow!.r ? editValues : row) }
          : tbl
      )
    )
    setEditRow(null)
    setEditValues([])
  }

  function onEditCell(i: number, v: string) {
    setEditValues(vals => vals.map((val, idx) => idx === i ? v : val))
  }

  function setPage(tabIdx: number, page: number) {
    setPages(pgs => pgs.map((p, idx) => idx === tabIdx ? page : p))
  }

  function setRowsPerPage(tabIdx: number, val: number) {
    setRowsPerPages(rpp => rpp.map((x, i) => i === tabIdx ? val : x))
    setPages(pgs => pgs.map((p, i) => (i === tabIdx ? 1 : p)));
  }

  function handleTableNameChange(idx: number, name: string) {
    setTables(tables => tables.map((t, i) => i === idx ? { ...t, name } : t));
  }

  function startResize(tableIdx: number, colIdx: number, e: React.MouseEvent) {
    resizingCol.current = { table: tableIdx, col: colIdx };
    document.body.style.cursor = 'col-resize';
    const startX = e.clientX;
    const startWidth = colWidths[tableIdx][colIdx];
    function onMove(ev: MouseEvent) {
      const delta = ev.clientX - startX;
      setColWidths(widths => widths.map((arr, t) => t === tableIdx ? arr.map((w, c) => c === colIdx ? Math.max(60, startWidth + delta) : w) : arr));
    }
    function onUp() {
      resizingCol.current = null;
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function handleSort(colIdx: number) {
    setSort(s => {
      if (!s || s.col !== colIdx) return { col: colIdx, dir: 'asc' };
      if (s.dir === 'asc') return { col: colIdx, dir: 'desc' };
      return null;
    });
  }

  return (
    <div className="w-full">
      {/* Tabs for multiple tables */}
      <div className="flex space-x-2 border-b mb-4 overflow-x-auto" role="tablist" aria-label="Extracted tables">
        {tables.map((tbl, idx) => (
          <div key={idx} className="relative flex items-center">
            <button
              className={clsx(
                "py-2 px-4 rounded-t-lg font-semibold transition-all flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-blue-400",
                tab === idx
                  ? "bg-gradient-to-br from-blue-600 to-purple-600 text-white shadow"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              )}
              onClick={() => setTab(idx)}
              role="tab"
              aria-selected={tab === idx}
              aria-controls={`table-panel-${idx}`}
              tabIndex={0}
            >
              <Table2 size={18} />
              {tbl.name ? tbl.name : `Table ${idx + 1}`}
            </button>
            {/* Delete table button OUTSIDE the tab button */}
            {tables.length > 1 && (
              <button
                className="ml-2 text-red-500 hover:bg-red-100 rounded p-1 absolute right-0 top-1/2 -translate-y-1/2"
                title="Delete this table"
                onClick={e => {
                  e.stopPropagation();
                  setTables(prevTables => {
                    const newTables = prevTables.filter((_, i) => i !== idx);
                    return newTables;
                  });
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>
        ))}
        <button
          className="ml-auto px-3 py-2 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 flex items-center gap-1 text-sm font-medium"
          onClick={() => downloadCSV(tables[tab], tables[tab].name || `table${tab + 1}`)}
          aria-label="Download as CSV"
        >
          <Download size={16} /> CSV
        </button>
      </div>
      {/* Table name input */}
      <div className="mb-2 flex items-center gap-2">
        <label className="text-sm font-medium">Table Name (optional):</label>
        <input
          type="text"
          className="border rounded px-2 py-1 text-sm shadow-sm focus:ring-2 focus:ring-blue-200"
          value={tables[tab].name || ''}
          onChange={e => handleTableNameChange(tab, e.target.value)}
          placeholder={`Table ${tab + 1}`}
          aria-label="Table name"
        />
      </div>
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2 px-2">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">Rows per page:</label>
          <select
            value={currentRowsPerPage}
            onChange={e => setRowsPerPage(tab, Number(e.target.value))}
            className="border rounded px-2 py-1 text-sm shadow-sm focus:ring-2 focus:ring-blue-200"
            aria-label="Rows per page"
          >
            {ROWS_OPTIONS.map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>
        <div className="text-sm text-gray-600">
          Showing <span className="font-semibold">{showingFrom}-{showingTo}</span> of <span className="font-semibold">{totalItems}</span> items
        </div>
        <button
          className={clsx(
            "flex items-center px-3 py-1.5 rounded bg-red-600 text-white font-medium shadow hover:bg-red-700 transition",
            (selectedRows[tab]?.size ?? 0) > 0 ? "" : "opacity-50 cursor-not-allowed"
          )}
          disabled={(selectedRows[tab]?.size ?? 0) === 0}
          onClick={deleteSelectedRowsOnPage}
          aria-label="Delete selected rows"
        >
          <Trash2 size={16} className="mr-1" />
          Delete selected
        </button>
      </div>
      <div className="rounded-xl border shadow-lg overflow-x-auto bg-white">
        <table className="min-w-full" role="table" aria-label={`Extracted table ${tab + 1}`}> 
          <thead className="bg-gradient-to-br from-blue-50 to-purple-50 sticky top-0 z-10">
            <tr>
              <th className="py-3 px-3 border-b w-8 text-center sticky left-0 bg-gradient-to-br from-blue-50 to-purple-50 z-20">
                <input
                  type="checkbox"
                  className="accent-blue-600 w-4 h-4"
                  checked={globalIndices.length > 0 && globalIndices.every(isRowSelected)}
                  onChange={toggleSelectAllOnPage}
                  aria-label="Select all"
                />
              </th>
              {tables[tab].header.map((col, i) => (
                <th
                  key={i}
                  className="py-3 px-4 text-sm font-bold border-b sticky top-0 bg-gradient-to-br from-blue-50 to-purple-50 z-10 group"
                  style={{ minWidth: colWidths[tab][i], maxWidth: 400, position: 'relative' }}
                  tabIndex={0}
                  aria-sort={sort && sort.col === i ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  <div className="flex items-center gap-1 cursor-pointer select-none" onClick={() => handleSort(i)}>
                    {fixPercent(col)}
                    {sort && sort.col === i ? (
                      sort.dir === 'asc' ? <ArrowUp size={16} /> : <ArrowDown size={16} />
                    ) : <ArrowUpDown size={14} className="opacity-40 group-hover:opacity-80" />}
                  </div>
                  {/* Column resize handle */}
                  <span
                    className="absolute right-0 top-0 h-full w-2 cursor-col-resize z-30"
                    onMouseDown={e => startResize(tab, i, e)}
                    tabIndex={-1}
                    aria-label="Resize column"
                  />
                </th>
              ))}
              <th className="py-3 px-2 border-b w-24 sticky right-0 bg-gradient-to-br from-blue-50 to-purple-50 z-20">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pagedRows.map((row, rIdx) => {
              const globalIdx = globalIndices[rIdx];
              const isEditing = editRow && editRow.t === tab && editRow.r === globalIdx;
              const headerLike = isHeaderLikeRow(row);
              const isHighlighted = highlightedRow && highlightedRow.tableIdx === tab && highlightedRow.rowIdx === globalIdx;
              if (headerLike) {
                return (
                  <tr key={globalIdx} className="bg-blue-100">
                    <th className="py-2 px-3 border-b align-top"></th>
                    {row.map((val, i) => (
                      <th key={i} className="py-2 px-4 border-b align-top font-bold text-gray-900">{val}</th>
                    ))}
                    <th className="py-2 px-2 border-b align-top"></th>
                  </tr>
                );
              }
              return (
                <tr
                  key={globalIdx}
                  className={clsx(
                    isEditing ? "bg-blue-50" : isHighlighted ? "bg-yellow-100 ring-2 ring-yellow-400" : "hover:bg-gray-50",
                    "transition-colors"
                  )}
                  tabIndex={0}
                  aria-selected={isHighlighted ? 'true' : 'false'}
                  onMouseEnter={() => onRowHover && onRowHover(tab, globalIdx)}
                  onMouseLeave={() => onRowHover && onRowHover(tab, null)}
                >
                  <td className="py-2 px-3 border-b align-top text-center sticky left-0 bg-white z-10">
                    <input
                      type="checkbox"
                      className="accent-blue-600 w-4 h-4"
                      checked={isRowSelected(globalIdx)}
                      onChange={() => toggleRow(globalIdx)}
                      aria-label={`Select row ${globalIdx + 1}`}
                    />
                  </td>
                  {row.map((val, i) => (
                    <td
                      key={i}
                      className="py-2 px-4 border-b align-top"
                      style={{ minWidth: colWidths[tab][i], maxWidth: 400 }}
                    >
                      {isEditing
                        ? (
                          <input
                            value={editValues[i]}
                            onChange={e => onEditCell(i, e.target.value)}
                            className="border rounded px-2 py-1 w-full text-sm"
                          />
                        )
                        : <span className="text-gray-800 text-sm">{fixPercent(val)}</span>
                      }
                    </td>
                  ))}
                  <td className="py-2 px-2 border-b align-top sticky right-0 bg-white z-10">
                    {!isEditing ? (
                      <div className="flex space-x-2">
                        <button className="p-1 text-blue-500 hover:bg-blue-50 rounded" onClick={() => startEdit(tab, globalIdx)} title="Edit" aria-label="Edit row">
                          <Pencil size={18} />
                        </button>
                        <button className="p-1 text-red-500 hover:bg-red-50 rounded" onClick={() => deleteRow(tab, globalIdx)} title="Delete" aria-label="Delete row">
                          <Trash2 size={18} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex space-x-2">
                        <button className="p-1 text-green-600 hover:bg-green-100 rounded" onClick={saveEdit} title="Save" aria-label="Save edit">
                          <Check size={20} />
                        </button>
                        <button className="p-1 text-gray-600 hover:bg-gray-200 rounded" onClick={cancelEdit} title="Cancel" aria-label="Cancel edit">
                          <X size={20} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <Pagination
        page={currentPage}
        setPage={pg => setPage(tab, pg)}
        pageCount={pageCount}
      />
    </div>
  )
}
