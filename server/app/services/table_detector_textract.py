import boto3
import os
import tempfile
import re
from pdf2image import convert_from_path

class TextractTableExtractor:
    def __init__(self, aws_region="us-east-1"):
        self.textract = boto3.client('textract', region_name=aws_region)

    def extract_tables_from_image_bytes(self, image_bytes):
        response = self.textract.analyze_document(
            Document={'Bytes': image_bytes},
            FeatureTypes=['TABLES']
        )
        return self.extract_tables_from_textract(response)

    def extract_tables_from_textract(self, response):
        tables = []
        blocks = response['Blocks']
        block_map = {block['Id']: block for block in blocks}

        for block in blocks:
            if block['BlockType'] == 'TABLE':
                table = []
                rows = {}
                for relationship in block.get('Relationships', []):
                    if relationship['Type'] == 'CHILD':
                        for cell_id in relationship['Ids']:
                            cell = block_map.get(cell_id)
                            if not cell or cell.get('BlockType') != 'CELL':
                                continue
                            row_idx = cell['RowIndex']
                            col_idx = cell['ColumnIndex']
                            text = ''
                            for rel in cell.get('Relationships', []):
                                if rel['Type'] == 'CHILD':
                                    text = ' '.join(
                                        block_map[cid]['Text']
                                        for cid in rel['Ids']
                                        if block_map[cid]['BlockType'] == 'WORD'
                                    )
                            if row_idx not in rows:
                                rows[row_idx] = {}
                            rows[row_idx][col_idx] = text
                max_col = max((col for row in rows.values() for col in row.keys()), default=0)
                for r in sorted(rows):
                    row_data = [rows[r].get(c, '') for c in range(1, max_col + 1)]
                    table.append(row_data)
                tables.append(table)
        return tables

    def extract_tables_from_pdf(self, file_path):
        images = convert_from_path(file_path, dpi=300)
        all_tables = []
        for img in images:
            with tempfile.NamedTemporaryFile(suffix='.png', delete=True) as tmpf:
                img.save(tmpf.name, format='PNG')
                with open(tmpf.name, 'rb') as imgf:
                    img_bytes = imgf.read()
                    tables = self.extract_tables_from_image_bytes(img_bytes)
                    all_tables.extend(tables)
        # Now use improved table cleaner/merger
        return extract_and_clean_tables(all_tables)

# ==========================
# Header and Table Utilities
# ==========================

def is_number(val):
    """Return True if string is likely a number or currency."""
    if not val or not val.strip():
        return False
    return bool(re.match(r"^\s*[$-]?\s*[\d,]+(\.\d+)?\s*$", val.replace(",", "")))

def count_non_numeric(row):
    return sum(1 for cell in row if cell and not is_number(cell))

def header_likely(row):
    """Header if most cells are not numbers, some cells are long (5+ chars), and no cell contains digits."""
    if not row or not any(cell.strip() for cell in row):
        return False
    # New: If any cell contains a digit, not a header
    for cell in row:
        if any(char.isdigit() for char in cell):
            return False
    non_numeric = count_non_numeric(row)
    return (
        non_numeric >= len(row) * 0.6 and  # mostly non-numeric
        any(len(cell.strip()) > 5 for cell in row if cell.strip())
    )

def are_headers_similar(h1, h2):
    """Are these headers 'the same'? Allow small OCR variations."""
    if not h1 or not h2 or len(h1) != len(h2):
        return False
    matches = sum(
        1 for a, b in zip(h1, h2)
        if a.strip().lower() == b.strip().lower()
    )
    return matches >= len(h1) * 0.7  # 70% match

def is_summary_row(row):
    return any(
        cell and ('total' in cell.lower() or 'grand' in cell.lower())
        for cell in row
    )

def clean_table(table_dict):
    """Pad/trim rows to header length, skip summary rows."""
    header = table_dict["header"]
    rows = []
    for row in table_dict["rows"]:
        if is_summary_row(row):
            continue
        # pad or trim
        clean_row = (row + [""] * (len(header) - len(row)))[:len(header)]
        rows.append([cell.strip() for cell in clean_row])
    return {"header": header, "rows": rows}

def clean_and_merge_tables(raw_tables):
    """
    Merge tables if header repeats, or if header missing (continuation).
    Only one header, all rows under it.
    """
    merged = []
    last_header = None
    cur_rows = []
    for t in raw_tables:
        if not t or not t[0]:
            continue
        candidate_header = [cell.strip() for cell in t[0]]
        if header_likely(candidate_header):
            if last_header is not None and are_headers_similar(last_header, candidate_header):
                # Same as previous header: treat as page break, continue collecting rows
                cur_rows += t[1:]
            elif last_header is not None and not are_headers_similar(last_header, candidate_header):
                # New/different header: save last table, start new one
                if cur_rows:
                    merged.append({"header": last_header, "rows": cur_rows})
                last_header = candidate_header
                cur_rows = t[1:]
            else:
                # First table/page
                last_header = candidate_header
                cur_rows = t[1:]
        else:
            # No header detected: continuation of previous table
            if last_header is not None:
                cur_rows += t
            else:
                continue  # can't process this page
    # Save the last one
    if last_header and cur_rows:
        merged.append({"header": last_header, "rows": cur_rows})
    # Clean and return only tables with at least 1 row
    return [clean_table(m) for m in merged if m and m.get("rows")]

def extract_and_clean_tables(raw_tables):
    return clean_and_merge_tables(raw_tables)
