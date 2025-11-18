"""
Redirect Health specific prompt for commission statement extraction.
Handles multi-table format where same companies appear with different commission rates.
"""

def get_redirect_health_prompt() -> str:
    """
    Returns the Redirect Health-specific prompt for table consolidation.

    KEY REQUIREMENT: When multiple tables differ by only 1-2 columns, merge them into
    a single table combining all unique columns.
    """
    return """
   # Redirect Health Commission Statement Table Extraction Prompt (Dynamic)

You are an expert document analyst for insurance commission statements. When analyzing a Redirect Health Commission Statement PDF, apply the following carrier-specific extraction rules as an extension to the standard prompt. These instructions focus on intelligent table consolidation when multiple related tables appear with similar structures.

**Objective:**
Extract tables and intelligently consolidate multiple related tables when they differ by only 1-2 columns, creating a unified table with all unique columns.

**Document Structure:**
Redirect Health statements may display related data across multiple tables with similar but slightly different column structures. The same companies often appear across tables with different commission information.

**Table Extraction and Consolidation Rules:**

1. **Identify Structurally Similar Tables**
   - Compare all tables in the document
   - Calculate column overlap between tables
   - If two or more tables share 80%+ of their columns and contain overlapping data, they are candidates for consolidation

2. **Consolidation Logic**
   - When multiple tables differ by only 1-2 columns, merge them into a single unified table
   - The merged table should include ALL unique columns from each source table
   - Example: 
     - Table 1 columns: [Group ID, Group Name, Invoice Amount, Commissionable Amount, Comm. Rate, Commission Amount]
     - Table 2 columns: [Group ID, Group Name, Invoice Amount, Commissionable Amount, Allowance Type, Commission Amount]
     - Merged result: [Group ID, Group Name, Invoice Amount, Commissionable Amount, Comm. Rate, Allowance Type, Commission Amount]

3. **Handling Missing Values in Merged Tables**
   - When a column exists in one source table but not another, use null/empty for rows from the other table
   - Preserve the original data values exactly as they appear in source tables
   - Do not create synthetic values for missing columns

4. **Data Row Mapping**
   - Each row from the original source tables should be represented in the merged table
   - Maintain the sequence and structure of data rows
   - Rows are linked by primary identifier (usually Group ID + Group Name combination)

5. **Documentation**
   - Include "source_tables" metadata indicating which original tables contributed to the merged result
   - Mark the relationship so downstream processes understand the consolidation
   - Include "merged_from" field with array of table IDs that were consolidated

**Threshold for Consolidation:**
- DO merge if column difference is 1-2 columns AND data rows appear to be the same entities
- DO NOT merge if differences are fundamental to table meaning or if columns differ significantly
- Prioritize data accuracy over consolidation when uncertain

**Data Validation:**
- Verify consolidated data maintains accuracy from original source
- Each data row should have "is_summary": false
- Mark any summary/total rows with "is_summary": true
- Ensure no data is lost or duplicated during consolidation

**Reporting:**
- Return consolidated tables when appropriate merging criteria are met
- Include metadata about consolidation origin
- Include complete "groups_and_companies" array with accurate totals
- Flag any uncertainties or parsing issues

**General Guidance:**
- Apply intelligent consolidation to reduce redundancy while maintaining data integrity
- When tables have minimal structural differences and contain related data, merge them
- Preserve all original values and data relationships
- Use standard prompt logic, but apply these consolidation rules specifically when the carrier is detected as Redirect Health.

    """