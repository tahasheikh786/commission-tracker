"""
UNIFIED CARRIER EXTRACTION RULES - SINGLE SOURCE OF TRUTH

This is the SINGLE SOURCE OF TRUTH for carrier extraction requirements.
All prompts reference this module to ensure consistency across the extraction pipeline.

CRITICAL: This prevents the issue where carrier extraction rules were defined 5+ times
with inconsistencies between prompts.py, enhanced_prompts.py, and other modules.
"""


class CarrierExtractionRules:
    """
    Definitive carrier extraction rules used by all prompts and extraction pipelines.
    
    This centralizes:
    - Logo + top/bottom weightage requirements
    - Character-level precision rules
    - Forbidden actions (no abbreviations, no modifications)
    - Confidence scoring methodology
    """
    
    @staticmethod
    def get_critical_requirements() -> str:
        """
        CRITICAL carrier extraction requirements.
        Applied to ALL extraction pipelines to ensure consistent carrier names.
        
        Returns:
            Comprehensive extraction instructions for Claude
        """
        return """
## CARRIER EXTRACTION - CRITICAL REQUIREMENTS ⚠️

### Definition
Extract the insurance company (carrier) that ISSUED this commission statement.
This is the company PROVIDING the insurance coverage (NOT the broker/agent receiving payment).

### Where to Look (Priority Order) 🎯

**1. HEADER LOGO AREA (Top 20% of first page) - HIGHEST PRIORITY**
   - Company logos and branding
   - Document letterhead
   - Title area with company name
   - Large, prominent text at top of document
   - **WEIGHT: 0.95-0.98 confidence if found here**

**2. FOOTER BRANDING (Bottom 15% of pages) - SECONDARY PRIORITY**
   - Company logo/name in footer
   - "Prepared by:" company designation
   - Copyright statements with company name
   - Footer text across multiple pages
   - **WEIGHT: 0.90-0.95 confidence if found here**

**3. DOCUMENT TITLE - TERTIARY PRIORITY**
   - Main heading of document
   - "Commission Statement from [Carrier]" format
   - Document type with carrier identification
   - **WEIGHT: 0.85-0.90 confidence if found here**

**4. BODY TEXT - FALLBACK ONLY**
   - Carrier mentioned in document body
   - "This statement is from..." references
   - **WEIGHT: 0.70-0.85 confidence if found here**

### Extraction Rules - CHARACTER-LEVEL PRECISION ✅

**✅ DO THIS:**
1. Extract EXACTLY as written, character-for-character
2. Preserve spacing, capitalization, punctuation PRECISELY
3. Stop at natural text boundaries (whitespace, punctuation, visual separation)
4. Verify EACH character against source image
5. Use the MOST PROMINENT occurrence (header/logo trumps body text)

**❌ NEVER DO THIS (CRITICAL - THESE CAUSE DUPLICATE CARRIERS):**
1. ❌ Add abbreviations (e.g., don't add "(ABSF)" unless visible in source)
2. ❌ Remove text or condense spacing
3. ❌ Add legal entity designations (e.g., don't add "LLC" unless shown)
4. ❌ Standardize or normalize names (keep "UnitedHealthcare" not "United Healthcare")
5. ❌ Add clarifying notes or context
6. ❌ Infer full name from abbreviations
7. ❌ Extract from table data columns (columns show CLIENT names, not carrier)
8. ❌ Use current date or default carrier name
9. ❌ Modify capitalization or spacing for consistency
10. ❌ Add punctuation that isn't visible

### Verification Checklist (MANDATORY BEFORE RETURNING) ✓

Before returning carrier name, answer these questions:

**Q1: Is every character I extracted present in the source image?**
   - Answer: YES/NO
   - If NO → RE-EXTRACT from source

**Q2: Did I add ANY characters not visible?**
   - Answer: YES/NO  
   - If YES → REMOVE added characters, RE-EXTRACT

**Q3: Does spacing/capitalization match exactly?**
   - Answer: YES/NO
   - If NO → RE-EXTRACT with exact spacing/caps

**Q4: Did I extract from header/logo area (not table data)?**
   - Answer: YES/NO
   - If NO → Search header/logo area first

**If ANY answer is wrong → RE-EXTRACT from source following rules above**

### Confidence Scoring Methodology 📊

Calculate confidence based on:

**Location Weight (Primary Factor):**
- Header logo (top 20%): +0.15 points (most reliable)
- Footer logo (bottom 15%): +0.10 points
- Document title: +0.10 points
- Body text: +0.05 points

**Clarity Weight:**
- Crystal clear text, no OCR artifacts: +0.10 points
- Slightly unclear (minor OCR artifacts): +0.05 points
- Ambiguous or degraded text: +0.00 points

**Uniqueness Weight:**
- Only one carrier mentioned: +0.05 points
- Multiple carriers mentioned: +0.00 points

**Prominence Weight:**
- Large, prominent branding: +0.05 points
- Small or secondary mention: +0.00 points

**Formula:**
```
Base: 0.80
+ Location Weight (0.00-0.15)
+ Clarity Weight (0.00-0.10)
+ Uniqueness Weight (0.00-0.05)
+ Prominence Weight (0.00-0.05)
= Raw Score

Final Score = min(Raw Score, 0.98)  # Cap at 0.98, never claim 100% certainty
```

**Examples:**
- Logo in header, crystal clear, only carrier: 0.80 + 0.15 + 0.10 + 0.05 + 0.05 = 1.15 → **Capped at 0.98**
- Logo in header, slightly unclear: 0.80 + 0.15 + 0.05 = 1.00 → **Capped at 0.95**
- In document title, multiple carriers: 0.80 + 0.10 + 0.00 = 0.90 → **0.90**
- Body text only, clear: 0.80 + 0.05 + 0.10 = 0.95 → **0.85** (reduce for non-prominent location)

### Extraction Examples 📋

**Example 1 - Correct Extraction:**
```
Document shows: "Allied Benefit Systems" (in header logo, top-left, clear branding)
✅ Extract: "Allied Benefit Systems"
✅ Confidence: 0.98 (header logo + crystal clear + only carrier)
✅ Evidence: "Header logo and company letterhead, top-left of page 1"
```

**Example 2 - WRONG (abbreviation added):**
```
Document shows: "Allied Benefit Systems" (in header)
❌ Extract: "Allied Benefit Systems (ABSF)"
❌ Problem: Added abbreviation NOT visible in source
❌ This creates a DUPLICATE carrier entry in database
```

**Example 3 - WRONG (spacing modified):**
```
Document shows: "UnitedHealthcare" (one word, in logo)
❌ Extract: "United Healthcare" (two words)
❌ Problem: Modified spacing → creates duplicate entry
✅ Correct: "UnitedHealthcare" (exactly as shown)
```

**Example 4 - WRONG (extracted from table):**
```
Document header: "Allied Benefit Systems"
Table column: Lists client companies like "ABC Corp", "XYZ Inc"
❌ Extract: "ABC Corp" (from table)
❌ Problem: Extracted client name, NOT carrier
✅ Correct: "Allied Benefit Systems" (from header)
```

**Example 5 - Handling Discrepancies:**
```
Document header: "UnitedHealthcare" (in logo)
Document footer: "United Healthcare" (in copyright text)
✅ Extract: "UnitedHealthcare" (use header, highest priority)
✅ Confidence: 0.98
✅ Evidence: "Header logo - UnitedHealthcare (note: footer shows 'United Healthcare' with different spacing)"
```

### Output Format 📤

Return in this exact format:

```json
{
  "carrier_name": "Exact text as shown in source",
  "carrier_confidence": 0.95,
  "evidence": "Header logo area, page 1, top 20%, prominent branding",
  "location": "header_logo",
  "confidence_calculation": "base_0.80 + location_0.15 + clarity_0.10 = 0.98 (capped)"
}
```

### Critical Reminder 🔴

**WHY THIS MATTERS:**
- Inconsistent carrier names create DUPLICATE database entries
- "Allied Benefit Systems" ≠ "Allied Benefit Systems (ABSF)"
- Database treats these as TWO different carriers
- Breaks reporting, analytics, and automated approval systems
- Character-level precision is MANDATORY, not optional

**THIS IS THE #1 CAUSE OF DATA QUALITY ISSUES IN PRODUCTION**
"""

    @staticmethod
    def get_confidence_guidelines() -> str:
        """
        Detailed confidence scoring guidelines for carrier extraction.
        
        Returns:
            Step-by-step confidence calculation methodology
        """
        return """
## CARRIER CONFIDENCE SCORING - DETAILED METHODOLOGY

### Confidence Score Ranges

**0.95-0.98: EXCELLENT**
- Logo clearly visible in header/footer
- Crystal clear text, no ambiguity
- Only one carrier mentioned
- Prominent, large branding

**0.90-0.94: VERY GOOD**
- Logo visible but slightly unclear
- OR carrier in document title (clear)
- Minimal OCR artifacts
- Unambiguous identification

**0.85-0.89: GOOD**
- Carrier name in document title but not logo
- OR logo with moderate OCR artifacts
- OR multiple carriers mentioned but clear which is issuer

**0.80-0.84: ACCEPTABLE**
- Carrier inferred from document structure
- Not explicit branding but clear context
- OR body text mention with supporting evidence

**0.70-0.79: UNCERTAIN**
- Carrier in body text only
- OR ambiguous between multiple carriers
- OR significant OCR issues affecting readability

**< 0.70: LOW CONFIDENCE**
- Uncertain identification
- Conflicting information
- Poor image quality
- Should flag for manual review

### Step-by-Step Calculation

**Step 1: Start with base score**
```
confidence = 0.80
```

**Step 2: Add location weight**
```
if location == "header_logo":
    confidence += 0.15
elif location == "footer_logo":
    confidence += 0.10
elif location == "document_title":
    confidence += 0.10
elif location == "body_text":
    confidence += 0.05
```

**Step 3: Add clarity weight**
```
if text_clarity == "crystal_clear":
    confidence += 0.10
elif text_clarity == "slightly_unclear":
    confidence += 0.05
elif text_clarity == "ambiguous":
    confidence += 0.00
```

**Step 4: Add uniqueness weight**
```
if only_carrier_mentioned:
    confidence += 0.05
else:
    confidence += 0.00
```

**Step 5: Cap at maximum**
```
confidence = min(confidence, 0.98)  # Never claim 100% certainty
```

**Step 6: Document calculation**
Include calculation in evidence field:
```
"confidence_calculation": "base_0.80 + header_0.15 + clear_0.10 + unique_0.05 = 1.10 capped at 0.98"
```

### Special Cases

**Multiple Page Consistency:**
If carrier name appears on multiple pages consistently:
- Add +0.02 bonus (consistency across pages)

**Carrier-Specific Formatting:**
If document has carrier-specific template/formatting:
- Add +0.03 bonus (template indicates genuine carrier document)

**Watermarks/Security Features:**
If carrier logo appears as watermark or security feature:
- Add +0.03 bonus (security features indicate authenticity)

**Maximum After Bonuses:**
Still cap at 0.98, never exceed

### Example Calculations

**Example A: Best Case**
```
Location: header_logo (+0.15)
Clarity: crystal_clear (+0.10)
Uniqueness: only_carrier (+0.05)
Consistency: multi_page (+0.02)
Template: carrier_specific (+0.03)

Score: 0.80 + 0.15 + 0.10 + 0.05 + 0.02 + 0.03 = 1.15
Final: min(1.15, 0.98) = 0.98 ✅
```

**Example B: Good Case**
```
Location: document_title (+0.10)
Clarity: crystal_clear (+0.10)
Uniqueness: only_carrier (+0.05)

Score: 0.80 + 0.10 + 0.10 + 0.05 = 1.05
Final: min(1.05, 0.98) = 0.98 ✅
```

**Example C: Acceptable Case**
```
Location: document_title (+0.10)
Clarity: slightly_unclear (+0.05)
Uniqueness: multiple_carriers (+0.00)

Score: 0.80 + 0.10 + 0.05 + 0.00 = 0.95
Final: 0.95 ✅
```

**Example D: Uncertain Case**
```
Location: body_text (+0.05)
Clarity: ambiguous (+0.00)
Uniqueness: multiple_carriers (+0.00)

Score: 0.80 + 0.05 + 0.00 + 0.00 = 0.85
Final: 0.85 ⚠️ (Flag for review)
```

### Confidence Thresholds for Actions

**0.95+ → Auto-accept**: High confidence, proceed with extraction
**0.85-0.94 → Review recommended**: Good confidence, but manual spot-check advised
**0.70-0.84 → Manual review required**: Uncertain, needs human verification
**< 0.70 → Reject/escalate**: Too uncertain, flag for manual processing

"""

    @staticmethod
    def get_xml_format() -> str:
        """
        Get the carrier extraction rules in XML format (for Claude-specific prompts).
        
        Some prompts use XML structure per Anthropic best practices.
        This provides the same rules in XML format for those prompts.
        
        Returns:
            XML-formatted carrier extraction rules
        """
        return """
<carrier_name_extraction>
  <objective>
    Identify the insurance carrier (company) that issued this commission statement
  </objective>
  
  <search_locations priority="sequential">
    <location priority="1">
      <name>Header Logo Area</name>
      <description>Top 20% of first page - look for company logos and branding</description>
      <visual_cues>Large text, distinctive branding, company letterhead</visual_cues>
      <confidence_weight>0.95-0.98</confidence_weight>
    </location>
    
    <location priority="2">
      <name>Footer Branding</name>
      <description>Bottom 15% of any page - footer logos and company names</description>
      <confidence_weight>0.90-0.95</confidence_weight>
    </location>
    
    <location priority="3">
      <name>Document Title/Header</name>
      <description>Main heading or title of document</description>
      <confidence_weight>0.85-0.90</confidence_weight>
    </location>
  </search_locations>
  
  <extraction_protocol>
    <critical_rule id="exact_text">
      Extract the carrier name EXACTLY as it appears character-for-character.
      This is CRITICAL for preventing duplicate carrier entries.
    </critical_rule>
    
    <step number="1">
      <action>Visually locate the carrier name in priority order above</action>
    </step>
    
    <step number="2">
      <action>Read the text character-by-character as displayed</action>
      <examples>
        <correct>
          Document shows: "Allied Benefit Systems"
          Extract: "Allied Benefit Systems"
        </correct>
        <incorrect>
          Document shows: "Allied Benefit Systems"  
          Extract: "Allied Benefit Systems (ABSF)" ❌ WRONG - abbreviation added
        </incorrect>
        <incorrect>
          Document shows: "UnitedHealthcare"
          Extract: "United Healthcare" ❌ WRONG - spacing modified
        </incorrect>
      </examples>
    </step>
    
    <step number="3">
      <action>Stop extraction at natural text boundary</action>
      <boundaries>
        - End of line
        - Whitespace/line break
        - Period or other sentence-ending punctuation
        - Visual separation from other text
      </boundaries>
    </step>
    
    <step number="4">
      <action>Verify extraction against source</action>
      <verification_questions>
        Q1: Is every character I extracted present in the source image? (Yes/No)
        Q2: Did I add ANY characters not visible in the source? (Yes/No)  
        Q3: Does the spacing and capitalization match exactly? (Yes/No)
        
        If ANY answer is wrong → Re-extract from source
      </verification_questions>
    </step>
  </extraction_protocol>
  
  <forbidden_actions>
    <do_not>Add abbreviations in parentheses (e.g., "(ABSF)", "(UHC)")</do_not>
    <do_not>Add legal entity designations unless visible (e.g., "LLC", "Inc.")</do_not>
    <do_not>Standardize or normalize carrier names</do_not>
    <do_not>Add clarifying text or context</do_not>
    <do_not>Infer full name from abbreviation</do_not>
    <do_not>Extract carrier name from table data columns</do_not>
    <do_not>Modify spacing or capitalization</do_not>
    <do_not>Use current date or default carrier</do_not>
  </forbidden_actions>
  
  <confidence_scoring>
    <formula>
      Base: 0.80
      + Location Weight (0.00-0.15)
      + Clarity Weight (0.00-0.10)
      + Uniqueness Weight (0.00-0.05)
      = Final Score (capped at 0.98)
    </formula>
    
    <location_weights>
      <header_logo>0.15</header_logo>
      <footer_logo>0.10</footer_logo>
      <document_title>0.10</document_title>
      <body_text>0.05</body_text>
    </location_weights>
    
    <clarity_weights>
      <crystal_clear>0.10</crystal_clear>
      <slightly_unclear>0.05</slightly_unclear>
      <ambiguous>0.00</ambiguous>
    </clarity_weights>
  </confidence_scoring>
  
  <output_format>
    {
      "carrier_name": "Exact text as shown",
      "carrier_confidence": 0.95,
      "evidence": "Found in header logo area, page 1, top-left",
      "confidence_calculation": "base_0.80 + header_0.15 = 0.95"
    }
  </output_format>
</carrier_name_extraction>
"""

