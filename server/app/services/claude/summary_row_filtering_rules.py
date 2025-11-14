"""
UNIFIED SUMMARY ROW FILTERING RULES - SINGLE SOURCE OF TRUTH

This is the SINGLE SOURCE OF TRUTH for summary row filtering requirements.
Previously this logic was duplicated in:
- enhanced_prompts.py (instructions for Claude to skip summary rows)
- semantic_extractor.py::_filter_summary_rows() (Python post-extraction filtering)

Now centralized here to ensure both Claude's extraction AND Python's post-processing
use the EXACT SAME filtering rules, preventing inconsistencies.
"""


class SummaryRowFilteringRules:
    """
    Definitive summary row detection and filtering rules.
    
    Centralizes:
    - Keywords that identify summary/total/metadata rows
    - Filtering logic for Claude prompts
    - Filtering logic for Python post-processing
    """
    
    @staticmethod
    def get_skip_keywords() -> list:
        """
        Keywords that indicate a summary/total/metadata row.
        
        These rows should be EXCLUDED from groups_and_companies extraction.
        
        Returns:
            List of lowercase keywords to check against group names/numbers
        """
        return [
            # Total/Summary rows
            'total for group',
            'total for vendor',
            'total compensation',
            'grand total',
            'subtotal',
            'total',  # General catch-all
            'summary',
            
            # Agent metadata rows
            'writing agent name',
            'writing agent number',
            'writing agent 1 name',
            'writing agent 1 number',
            'writing agent 2 name',
            'writing agent 2 number',
            'agent 2 name',
            'agent 2 number',
            'agent name:',
            'agent number:',
            'producer name:',
            'producer number:',
            
            # Empty/placeholder indicators
            '—',  # Em dash used as placeholder
            '-',  # Hyphen used as placeholder
            'n/a',
            'na',
            'none',
            'blank',
        ]
    
    @staticmethod
    def get_prompt_instructions() -> str:
        """
        Instructions for Claude to skip summary rows during extraction.
        
        This is used in prompts to tell Claude what NOT to extract.
        
        Returns:
            Detailed filtering instructions for Claude
        """
        return """
🔴 CRITICAL FILTERING RULES - EXCLUDE SUMMARY ROWS

### Purpose
When extracting `groups_and_companies`, you MUST filter out (skip) any rows that are:
- Summaries or aggregations
- Total/subtotal rows
- Agent metadata rows
- Any row that does NOT represent a single client group

### ROW TYPES TO SKIP (NOT actual groups)

**1. Summary/Total Rows - Check BOTH Group Name AND Group Number:**
   
   Skip if GROUP NAME OR GROUP NUMBER contains ANY of these:
   - "Total for Group"
   - "Total for Vendor"
   - "Total Compensation"
   - "Grand Total"
   - "Subtotal"
   - Any row that STARTS with "Total" or "Summary"
   
   **Why check BOTH fields?**
   Summary rows often have "Total for Group:" in the Group Number field
   and the actual group name in the Group Name field:
   
   Example of what TO SKIP:
   ```
   Group Number: "Total for Group:"
   Group Name: "SOAR LOGISTICS LL"
   → This is a SUBTOTAL row, NOT a data row - SKIP IT
   ```

**2. Agent Metadata Rows:**
   
   Skip if contains:
   - "Writing Agent Number:" or "Writing Agent Name:"
   - "Writing Agent 1 Number:" or "Writing Agent 1 Name:"
   - "Agent 2 Number:" or "Agent 2 Name:"
   - "Producer Name:" or "Producer Number:"
   
   These rows just label who the writing agent is, they're not actual groups.

**3. Rows Marked as Aggregations:**
   
   Skip if:
   - Row type = 'summary' or 'total'
   - Multiple entries for same group number marked as "subtotal"
   - Rows without a valid Group Number (blank, "—", or "n/a")

**4. Rows Without Valid Group Numbers:**
   
   Skip if Group Number is:
   - Empty/blank
   - "—" (em dash)
   - "-" (hyphen)
   - "n/a" or "N/A"
   - "None"
   
   Valid groups ALWAYS have a group number identifier.

### ROW TYPES TO INCLUDE (Actual client groups)

**✅ INCLUDE ONLY THESE:**
- Rows with a unique, valid Group Number (e.g., "L242393", "1653402", "12345")
- Rows with an actual Business/Client name (not a summary marker)
- Rows that show individual commission data for that specific group
- Rows that represent a SINGLE client/group (not a sum of multiple groups)

### KEY DISTINCTION

**Ask yourself for EACH row:**
- Does this row represent a SINGLE client/group? → ✅ INCLUDE
- Or does it represent a SUM of multiple clients/groups? → ❌ EXCLUDE

**Example Decision Process:**
```
Row: "L242393, PATEL LOGISTICS IN, 8/1/2025, $298.00"
Question: Single client or sum?
Answer: Single client (has unique group number, specific company name)
Action: ✅ INCLUDE

Row: "Total for Group:, PATEL LOGISTICS IN, $2,318.37"
Question: Single client or sum?
Answer: Sum (keyword "Total for Group:")
Action: ❌ EXCLUDE

Row: "Writing Agent Name:, ANAT GOLDSTEIN"
Question: Single client or sum?
Answer: Neither - this is metadata
Action: ❌ EXCLUDE
```

### VALIDATION RULE

Before including a row, verify:

**Checklist:**
1. ☐ Has valid, unique Group Number? (not blank, not "—")
2. ☐ Has actual company/client name? (not "Total", not "Summary")
3. ☐ Group Number does NOT contain summary keywords? ("total", "summary", etc.)
4. ☐ Group Name does NOT contain summary keywords?
5. ☐ Shows individual commission data? (not aggregated)
6. ☐ NOT an agent metadata row?

**If ALL checkboxes checked → INCLUDE**
**If ANY checkbox unchecked → EXCLUDE**

### EXAMPLES - What to EXCLUDE ❌

```
❌ Example 1: Subtotal Row
Group Number: "Total for Group:"
Group Name: "PRIDE DELIVERY SERVIC"
Paid Amount: "$2,318.37"
→ SKIP: "Total for Group:" in Group Number field

❌ Example 2: Grand Total Row
Group Number: "Total for Vendor:"
Group Name: "—"
Paid Amount: "$3,604.95"
→ SKIP: "Total for Vendor:" in Group Number field

❌ Example 3: Agent Metadata
Group Number: "Writing Agent Name:"
Group Name: "ANAT GOLDSTEIN"
→ SKIP: Agent metadata, not a group

❌ Example 4: Missing Group Number
Group Number: "—"
Group Name: "SOME LOGISTICS LLC"
→ SKIP: No valid group number

❌ Example 5: Generic Total Row
Group Number: "12345"
Group Name: "Total"
→ SKIP: Group Name is "Total"
```

### EXAMPLES - What to INCLUDE ✅

```
✅ Example 1: Valid Group
Group Number: "L242393"
Group Name: "PATEL LOGISTICS IN"
Billing Period: "8/1/2025"
Paid Amount: "$298.00"
→ INCLUDE: Valid group number, specific company, individual data

✅ Example 2: Valid Group
Group Number: "1653402"
Group Name: "B & B Lightning Protection"
Paid Amount: "$168.00"
→ INCLUDE: Valid group number, actual client company

✅ Example 3: Valid Group (Even with Special Characters)
Group Number: "XYZ-123"
Group Name: "ABC Corp & Associates, LLC"
Paid Amount: "$1,027.20"
→ INCLUDE: Valid group number, actual company name
```

### COMMON PITFALLS

**Pitfall 1: Company Name Contains "Total"**
```
Group Number: "98765"
Group Name: "Total Transportation Services LLC"
→ ✅ INCLUDE: Company name happens to contain "total", but it's not a summary row
           (has valid group number, not keyword phrase "Total for...")
```

**Pitfall 2: Subtotals Within Data**
```
Row 1: "L001", "Company A", "$100"     → INCLUDE
Row 2: "L002", "Company B", "$200"     → INCLUDE
Row 3: "Total for Group:", "Company A + B", "$300"  → EXCLUDE (subtotal)
Row 4: "L003", "Company C", "$150"     → INCLUDE
```

**Pitfall 3: Multiple Writing Agents**
```
Row: "Writing Agent 2 Name:", "JOHN DOE"
→ EXCLUDE: Agent metadata, not a group
```

### TESTING YOUR EXTRACTION

After extraction, count your results:
- If you have 15 groups_and_companies entries
- But document clearly shows 10 actual client companies
- You likely included 5 summary/metadata rows by mistake
- Re-check each entry against the EXCLUDE criteria above

### Why This Matters 🔴

**Impact of Including Summary Rows:**
- Inflates group count (reports 15 groups when there are only 10)
- Double-counts commission amounts (subtotal + line items)
- Breaks aggregation logic (totals calculated wrong)
- Creates invalid database entries
- Triggers data quality errors
- Requires manual cleanup

**Prevention is Critical:**
- It's better to EXCLUDE uncertain rows than to include summary rows
- If unsure, check: Does this row have a unique group number?
- If no unique identifier → EXCLUDE
- Summary rows are the #1 cause of extraction quality issues
"""

    @staticmethod
    def should_filter_row(group_name: str, group_number: str) -> bool:
        """
        Determine if a row should be filtered (excluded).
        
        This implements the filtering logic for Python post-processing.
        
        Args:
            group_name: The group/company name
            group_number: The group identifier/number
            
        Returns:
            True if row should be EXCLUDED (is a summary/metadata row)
            False if row should be INCLUDED (is an actual group)
        """
        # Convert to lowercase for case-insensitive matching
        name_lower = str(group_name).strip().lower()
        number_lower = str(group_number).strip().lower()
        
        # Skip if group name is empty
        if not name_lower:
            return True  # EXCLUDE
        
        # Get skip keywords
        skip_keywords = SummaryRowFilteringRules.get_skip_keywords()
        
        # Check if group name contains any skip keyword
        if any(keyword in name_lower for keyword in skip_keywords):
            return True  # EXCLUDE
        
        # Check if group name STARTS with "total" or "summary"
        if name_lower.startswith('total') or name_lower.startswith('summary'):
            return True  # EXCLUDE
        
        # CRITICAL: Also check group number for skip keywords
        # Summary rows often have "Total for Group:" in the group_number field
        if number_lower:
            if any(keyword in number_lower for keyword in skip_keywords):
                return True  # EXCLUDE
            
            if number_lower.startswith('total') or number_lower.startswith('summary'):
                return True  # EXCLUDE
        
        # Check if group number is missing or invalid
        if not number_lower or number_lower in ['—', '-', 'n/a', 'na', 'none', '']:
            return True  # EXCLUDE
        
        # If all checks passed, this is a legitimate group
        return False  # INCLUDE
    
    @staticmethod
    def filter_groups(groups: list) -> tuple:
        """
        Filter a list of groups to remove summary/metadata rows.
        
        Args:
            groups: List of group dictionaries with 'group_name' and 'group_number' keys
            
        Returns:
            Tuple of (filtered_groups, excluded_groups)
            - filtered_groups: List of valid groups
            - excluded_groups: List of excluded groups (for debugging)
        """
        if not groups:
            return [], []
        
        filtered_groups = []
        excluded_groups = []
        
        for group in groups:
            group_name = group.get('group_name', '')
            group_number = group.get('group_number', '')
            
            if SummaryRowFilteringRules.should_filter_row(group_name, group_number):
                excluded_groups.append({
                    'group_number': group_number,
                    'group_name': group_name,
                    'reason': 'Summary/metadata row detected'
                })
            else:
                filtered_groups.append(group)
        
        return filtered_groups, excluded_groups
    
    @staticmethod
    def get_xml_format() -> str:
        """
        Get summary row filtering rules in XML format.
        
        For prompts using XML structure per Anthropic best practices.
        
        Returns:
            XML-formatted filtering instructions
        """
        return """
<summary_row_filtering>
  <objective>
    Exclude summary, total, and metadata rows from groups_and_companies extraction
  </objective>
  
  <rows_to_exclude>
    <category name="summary_totals">
      <description>Rows that aggregate multiple groups</description>
      <keywords>
        - "Total for Group"
        - "Total for Vendor"
        - "Total Compensation"
        - "Grand Total"
        - "Subtotal"
        - Rows starting with "Total" or "Summary"
      </keywords>
      <check_fields>
        Check BOTH group_name AND group_number fields
      </check_fields>
    </category>
    
    <category name="agent_metadata">
      <description>Rows containing agent information labels</description>
      <keywords>
        - "Writing Agent Name:"
        - "Writing Agent Number:"
        - "Agent 2 Name:"
        - "Agent 2 Number:"
        - "Producer Name:"
        - "Producer Number:"
      </keywords>
    </category>
    
    <category name="invalid_identifiers">
      <description>Rows without valid group numbers</description>
      <invalid_values>
        - Empty/blank
        - "—" (em dash)
        - "-" (hyphen)
        - "n/a" or "N/A"
        - "None"
      </invalid_values>
    </category>
  </rows_to_exclude>
  
  <rows_to_include>
    <criteria>
      <requirement>Valid, unique Group Number (e.g., "L242393", "1653402")</requirement>
      <requirement>Actual business/client name (not summary marker)</requirement>
      <requirement>Individual commission data for specific group</requirement>
      <requirement>Represents SINGLE client (not sum of multiple)</requirement>
    </criteria>
  </rows_to_include>
  
  <validation_checklist>
    Before including a row, verify:
    1. Has valid, unique Group Number? (not blank, not "—")
    2. Has actual company/client name? (not "Total", not "Summary")
    3. Group Number does NOT contain summary keywords?
    4. Group Name does NOT contain summary keywords?
    5. Shows individual commission data? (not aggregated)
    6. NOT an agent metadata row?
    
    If ALL YES → INCLUDE
    If ANY NO → EXCLUDE
  </validation_checklist>
  
  <examples>
    <exclude>
      <case>Group Number: "Total for Group:", Group Name: "SOAR LOGISTICS" → Summary row</case>
      <case>Group Number: "Writing Agent Name:", Group Name: "JOHN DOE" → Metadata row</case>
      <case>Group Number: "—", Group Name: "Some Company" → Invalid identifier</case>
    </exclude>
    
    <include>
      <case>Group Number: "L242393", Group Name: "PATEL LOGISTICS IN" → Valid group</case>
      <case>Group Number: "1653402", Group Name: "B & B Lightning" → Valid group</case>
    </include>
  </examples>
</summary_row_filtering>
"""

