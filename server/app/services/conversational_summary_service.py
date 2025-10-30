"""
Conversational Summary Service
Transforms technical extraction data into natural, user-friendly summaries

Inspired by Google Gemini's natural language approach to document summarization.
"""

import logging
import asyncio
from typing import Dict, Any, Optional
from datetime import datetime
import anthropic
import os

logger = logging.getLogger(__name__)


class ConversationalSummaryService:
    """
    Generates conversational, non-technical summaries from structured extraction data.
    
    Inspired by Google Gemini's natural language approach to document summarization.
    """
    
    def __init__(self):
        """Initialize with Claude for summary generation"""
        self.client = anthropic.AsyncAnthropic(api_key=os.getenv("CLAUDE_API_KEY"))
        self.model = "claude-sonnet-4-20250514"  # Fast, high-quality model
        
    def is_available(self) -> bool:
        """Check if service is ready"""
        return bool(os.getenv("CLAUDE_API_KEY"))
    
    async def generate_conversational_summary(
        self,
        extraction_data: Dict[str, Any],
        document_context: Dict[str, Any],
        use_enhanced: bool = False
    ) -> Dict[str, Any]:
        """
        Generate a conversational summary from technical extraction data.
        
        Args:
            extraction_data: Raw extraction results (carrier, date, tables, etc.)
                           OR enhanced extraction with entities and relationships
            document_context: Additional context (file name, page count, etc.)
            use_enhanced: If True, use enhanced prompts for better quality
            
        Returns:
            Dictionary with conversational summary and metadata
        """
        try:
            logger.info("🗣️ Generating conversational summary...")
            start_time = datetime.now()
            
            # Build prompt with structured data
            prompt = self._build_summary_prompt(extraction_data, document_context, use_enhanced)
            
            # Get appropriate system prompt
            system_prompt = self._get_system_prompt(use_enhanced)
            
            # Call Claude with optimized parameters for natural language
            # Using assistant prefill to force consistent output format (Anthropic best practice)
            logger.info(f"🚀 Calling Claude API for summary generation...")
            logger.info(f"   Model: {self.model}")
            logger.info(f"   Max tokens: {1200 if use_enhanced else 1000}")
            logger.info(f"   Prompt length: {len(prompt)} chars")
            logger.info(f"   System prompt length: {len(system_prompt)} chars")
            
            response = await self.client.messages.create(
                model=self.model,
                max_tokens=1200 if use_enhanced else 1000,  # More tokens for enhanced summaries
                temperature=0.7,  # Balanced creativity for natural language
                system=system_prompt,
                messages=[
                    {"role": "user", "content": prompt},
                    {"role": "assistant", "content": "This is"}  # ← PREFILL: Forces consistent start (NO trailing space!)
                ]
            )
            
            logger.info(f"✅ Claude API call successful")
            logger.info(f"   Response content blocks: {len(response.content)}")
            
            # Extract summary from response (prepend the prefill text with space)
            raw_summary = response.content[0].text if response.content else ""
            summary_text = ("This is " + raw_summary).strip()  # Ensure no double spaces
            logger.info(f"📄 Generated summary length: {len(summary_text)} characters")
            logger.info(f"📄 Generated summary: {summary_text}")
            
            processing_time = (datetime.now() - start_time).total_seconds()
            logger.info(f"✅ Summary generated in {processing_time:.2f}s: {summary_text[:100]}...")
            
            return {
                "success": True,
                "summary": summary_text,
                "processing_time": processing_time,
                "model": self.model,
                "approach": "conversational_natural_language"
            }
            
        except Exception as e:
            logger.error(f"❌ Summary generation failed: {e}")
            logger.error(f"   Error type: {type(e).__name__}")
            logger.exception("   Full traceback:")
            logger.error(f"   Extraction data keys: {list(extraction_data.keys())}")
            # Fallback to structured format
            fallback_result = self._generate_fallback_summary(extraction_data)
            logger.warning(f"⚠️ Using fallback summary: {fallback_result.get('summary')}")
            return fallback_result
    
    def _get_system_prompt(self, use_enhanced: bool = False) -> str:
        """
        Enhanced system prompt with research-backed techniques
        
        Based on:
        - Anthropic's prompt engineering guide (XML structure)
        - Google's CoT research
        - Industry best practices for conversational AI
        
        Args:
            use_enhanced: If True, use the enhanced summarization system prompt
        """
        if use_enhanced:
            # Import enhanced prompts (FIXED PATH)
            try:
                from app.services.claude.enhanced_prompts import EnhancedClaudePrompts
                logger.info("✅ SUCCESS: Enhanced prompts imported correctly")
                return EnhancedClaudePrompts.get_intelligent_summarization_system_prompt()
            except ImportError as e:
                logger.error(f"❌ CRITICAL: Enhanced prompts import failed: {e}")
                logger.error("Enhanced prompts should be at app/services/claude/enhanced_prompts.py")
                logger.error("Falling back to standard prompt - enhanced features will be disabled")
                # Don't raise - allow graceful fallback but log the error clearly
        
        return """You are an expert financial document analyst specializing in insurance commission statements, with a talent for explaining complex documents in clear, conversational language.

<role_definition>
Your expertise: You've analyzed thousands of commission statements from carriers like Aetna, UnitedHealthcare, Cigna, and Blue Cross. You understand:
- Different commission structures (PEPM, percentage-based, tiered)
- Plan types (Medical, Dental, Vision, Life)
- Industry terminology (subscribers, groups, base/incentive compensation)
- What brokers and agents care about most

Your communication style: Like Google Gemini's document summaries - natural, conversational, and information-rich. You speak like a knowledgeable colleague explaining a document over coffee, not a robot reading fields.
</role_definition>

<quality_standards>
Your summaries must be:
1. **Accurate**: Every number, date, and name must be exact from the source data
2. **Comprehensive**: Include WHO (carrier, broker), WHAT (commission breakdown), WHEN (date, period), HOW MUCH (total, top earners), and WHY (plan types, special payments)
3. **Conversational**: Use flowing sentences, not bullet points or labels
4. **Specific**: Mention actual company names, amounts, and plan types - not generic terms
5. **Contextual**: Highlight what's notable (largest payments, unusual items, plan diversity)
6. **Concise**: 3-4 sentences maximum, but packed with information
</quality_standards>

<communication_rules>
DO:
- Start with "This is a..." or "This document shows..."
- Mention specific numbers and names (e.g., "K&K SOLOMON LOGISTICS earned $1,071.80")
- Highlight interesting patterns (e.g., "including a $550 lump sum incentive")
- Use natural transitions ("The document shows...", "Notable payments include...")
- Write how a human would explain it

DON'T:
- Use field labels (❌ "Carrier: Aetna" → ✅ "This is an Aetna statement")
- List items with bullets (❌ "• Company 1\n• Company 2" → ✅ "across 8 companies including...")
- Be vague (❌ "various companies" → ✅ "8 logistics companies")
- Skip notable details (❌ ignore largest payment → ✅ "with K&K SOLOMON as the largest contributor")
- Add unnecessary pleasantries (❌ "I hope this helps!" → ✅ end with key facts)
</communication_rules>

<output_format>
Your summary structure:
Sentence 1: Document type, carrier, broker, and date
Sentence 2: Total amount, company count, and top 1-2 contributors with amounts
Sentence 3: Plan type breakdown or notable characteristics (lump sums, incentives, PEPM structure)
(Optional 4th): Additional context if document has unique features

Keep it flowing and natural - these sentences should read as one cohesive paragraph.
</output_format>

Remember: You're not just reporting data - you're telling the story of this commission statement in a way that immediately makes sense to the user."""
    
    def _build_summary_prompt(
        self,
        extraction_data: Dict[str, Any],
        document_context: Dict[str, Any],
        use_enhanced: bool = False
    ) -> str:
        """
        Build XML-structured prompt with chain-of-thought reasoning
        
        Based on Anthropic's XML best practices and Google's CoT research
        
        Args:
            extraction_data: Extraction results
            document_context: Additional context
            use_enhanced: If True, use enhanced prompt format
        """
        
        # Check if this is enhanced extraction data
        has_enhanced_data = (
            'entities' in extraction_data or 
            'business_intelligence' in extraction_data or
            'relationships' in extraction_data
        )
        
        # DEBUG LOGGING
        logger.info(f"🔍 _build_summary_prompt called:")
        logger.info(f"   - use_enhanced: {use_enhanced}")
        logger.info(f"   - has_enhanced_data: {has_enhanced_data}")
        logger.info(f"   - extraction_data keys: {list(extraction_data.keys())}")
        
        # If we have enhanced data and should use enhanced prompts
        if has_enhanced_data and use_enhanced:
            logger.info("✅ Using ENHANCED summary prompt (with enhanced prompts module)")
            return self._build_enhanced_summary_prompt(extraction_data, document_context)
        elif use_enhanced:
            logger.warning(f"⚠️ use_enhanced=True but has_enhanced_data=False")
            logger.warning(f"   Missing keys in extraction_data. Available: {list(extraction_data.keys())}")
        else:
            logger.info("📝 Using STANDARD summary prompt (enhanced mode disabled)")
        
        # Otherwise use standard prompt
        
        # Extract and analyze data
        carrier = extraction_data.get('carrier_name') or extraction_data.get('extracted_carrier') or 'Unknown'
        date = extraction_data.get('statement_date') or extraction_data.get('extracted_date') or 'Unknown date'
        broker = extraction_data.get('broker_company') or 'Unknown'
        tables = extraction_data.get('tables', [])
        
        # ✨ ENHANCED: Get richer analysis using new helper methods
        total_amount = self._extract_total_amount(tables)
        company_count = self._count_unique_companies(tables)
        top_companies = self._get_top_companies(tables, limit=3)
        special_payments = self._identify_special_payments(tables)
        plan_types = self._extract_plan_types(tables)
        payment_period = self._extract_payment_period(tables)
        
        # Get carrier-specific context
        carrier_context = self._get_carrier_context(carrier.lower())
        carrier_type = self._get_carrier_type(carrier)
        
        # Format date naturally
        formatted_date = self._format_date_conversational(date)
        
        # ✨ BUILD XML-STRUCTURED PROMPT
        prompt = f"""<context>
You are analyzing a commission statement to create a conversational summary.

<carrier_info>
Carrier: {carrier}
Carrier Type: {carrier_type}
{carrier_context}
</carrier_info>

<document_metadata>
Statement Date: {date} ({formatted_date})
Broker/Agent: {broker}
File Name: {document_context.get('file_name', 'Unknown')}
Total Pages: {document_context.get('page_count', 'Unknown')}
Extraction Method: {document_context.get('extraction_method', 'AI')}
</document_metadata>
</context>

<data>
<commission_summary>
Total Amount: {total_amount}
Company Count: {company_count}
Payment Period: {payment_period if payment_period else 'Not specified'}
</commission_summary>

<top_earners>
{self._format_top_companies(top_companies)}
</top_earners>

<plan_breakdown>
{self._format_plan_types(plan_types)}
</plan_breakdown>

<special_items>
{self._format_special_payments(special_payments)}
</special_items>

<raw_tables>
Tables Extracted: {len(tables)}
Total Rows: {sum(len(t.get('rows', [])) for t in tables)}
</raw_tables>
</data>

<thinking>
Before writing the summary, analyze the data step-by-step:

1. **Document Identification**: What type of commission statement is this? (Standard, multi-plan, renewal, etc.)

2. **Key Financial Highlights**: 
   - What is the total amount and is it significant?
   - Who are the top 2-3 earners and what are their amounts?
   - Are there any lump sum payments or bonuses?

3. **Structure Analysis**:
   - How many companies/groups are included?
   - What plan types are represented? (Medical, Dental, Vision, etc.)
   - Is there a mix of plan types or commission structures?

4. **Notable Characteristics**:
   - What makes this statement unique or interesting?
   - Are there PEPM rates, subscriber counts, or enrollment data?
   - Any special incentives, adjustments, or withholdings?

5. **Carrier-Specific Context**:
   - Does this match the typical format for {carrier}?
   - What {carrier}-specific terminology or structure is present?

Think through these points, then craft your summary to capture the most important insights.
</thinking>

<examples>
<example_1>
<input_data>
Carrier: Aetna
Date: March 11, 2025
Broker: INNOVATIVE BPS LLC
Total: $2,620.98
Companies: 8
Top Earner: K&K SOLOMON LOGISTICS - $1,071.80 (41% of total)
Plan Types: Medical (MD Medical, CA Medical), Vision (Flat 10%), Dental (Middle Market Graded), AFA plans
Special: $550 lump sum to KAVAC LOGISTICS (California SG Medical New Business Incentive)
Payment Period: Feb 2025 subscriber activity
</input_data>
<ideal_summary>
This is an Aetna commission statement for INNOVATIVE BPS LLC dated March 11, 2025, covering February 2025 subscriber activity. The document shows $2,620.98 in net compensation across 8 companies, with K&K SOLOMON LOGISTICS as the largest contributor at $1,071.80 (41% of the total). The statement includes diverse commission structures: Medical plans with PEPM rates ($28-$40 per subscriber), Vision commissions at 10%, and a Middle Market Dental graded commission, plus a $550 California SG Medical New Business Incentive to KAVAC LOGISTICS.
</ideal_summary>
</example_1>

<example_2>
<input_data>
Carrier: UnitedHealthcare
Date: April 15, 2025
Broker: ABC Insurance Services
Total: $15,432.67
Companies: 12
Top Earners: Tech Solutions Inc ($4,230.50), Metro Health Group ($3,890.25), Retail Partners LLC ($2,100.00)
Plan Types: Medical, Dental, Vision
Enrollment: 487 total subscribers across all groups
PEPM: Ranging from $24-$52 depending on group size
Special: Q1 production bonus of $1,500
</input_data>
<ideal_summary>
This is a UnitedHealthcare commission statement for ABC Insurance Services dated April 15, 2025, detailing $15,432.67 in total commissions from 12 employer groups covering 487 subscribers. The largest payments went to Tech Solutions Inc ($4,230.50), Metro Health Group ($3,890.25), and Retail Partners LLC ($2,100.00), representing a mix of Medical, Dental, and Vision plans with PEPM rates from $24-$52. The statement includes a $1,500 Q1 production bonus in addition to the base commissions.
</ideal_summary>
</example_2>

<example_3>
<input_data>
Carrier: Cigna
Date: February 28, 2025
Broker: Premier Benefits Group
Total: $8,905.43
Companies: 6
Top Earner: Manufacturing Co ($3,250.00)
Plan Types: Medical (tiered 5% and 7%), Behavioral Health (flat 6%)
Special: First-year new business premium of 10% for one group
No withholdings: Net = Gross
</input_data>
<ideal_summary>
This is a Cigna commission statement for Premier Benefits Group dated February 28, 2025, showing $8,905.43 in gross commissions from 6 case groups with no withholdings. Manufacturing Co leads with $3,250.00, followed by a mix of Medical plans at tiered rates (5% and 7% based on group size) and Behavioral Health coverage at 6%. One group earned a first-year new business premium at 10%, reflecting Cigna's tiered commission structure.
</ideal_summary>
</example_3>
</examples>

<instructions>
Now create a conversational summary for the current document following these steps:

**Step 1 - Analyze** (internally, don't output this):
- Review the <thinking> questions above
- Identify the 2-3 most important insights
- Note what makes this statement unique or notable

**Step 2 - Structure** (internally, don't output this):
- Sentence 1: Type, carrier, broker, date (and activity period if different)
- Sentence 2: Total, company count, top earners with amounts
- Sentence 3: Plan types, structure details, or special payments
- (Optional Sentence 4): Additional unique characteristics if significant

**Step 3 - Write** (THIS IS YOUR OUTPUT):
Write a natural, flowing 3-4 sentence paragraph that:
✓ Starts with "This is a..." or "This document shows..."
✓ Includes ALL critical numbers (total, top earner amounts)
✓ Names specific companies (not "various companies")
✓ Details plan types/structure (PEPM rates, percentages, tiers)
✓ Highlights special payments or notable items
✓ Reads like a human explaining to another human
✓ Flows as one coherent paragraph, not a list

**Quality Checklist** (ensure your summary includes):
- [ ] Carrier name
- [ ] Broker name  
- [ ] Exact date (formatted naturally)
- [ ] Total commission amount
- [ ] Company count (specific number, not "various")
- [ ] Top 1-2 earners with amounts
- [ ] Plan type breakdown or commission structure
- [ ] Any special payments, bonuses, or unique items

Your summary should feel like Gemini's document summaries - comprehensive yet conversational, specific yet natural.
</instructions>

<output>
Write ONLY the conversational summary paragraph. Do not include:
- Preambles like "Here's a summary:" or "Based on the data:"
- Closing remarks like "Let me know if you need more details"
- Bullet points or structured lists
- Field labels like "Carrier:" or "Total:"

Start immediately with "This is a..." or "This document shows..." and provide the rich, flowing summary.
</output>"""

        return prompt
    
    def _get_carrier_context(self, carrier_lower: str) -> str:
        """
        Provide carrier-specific context to make summaries more accurate
        
        Different carriers have different document structures and terminology.
        This helps the AI generate more appropriate summaries.
        """
        
        # Normalize carrier name for matching
        carrier_lower = carrier_lower.strip()
        
        # UnitedHealthcare / UHC variations
        if any(name in carrier_lower for name in ['united', 'uhc', 'unitedhealthcare']):
            return """
**Carrier-Specific Context (UnitedHealthcare):**
- UHC statements typically include enrollment data (subscribers, member counts)
- Often shows commission breakdowns by plan type (Medical, Dental, Vision, etc.)
- May include PEPM (Per Employee Per Month) rates
- Group names are usually client companies with enrollment numbers
- Statement format: Usually separates base commission, overrides, and bonuses
"""
        
        # Aetna
        elif 'aetna' in carrier_lower:
            return """
**Carrier-Specific Context (Aetna):**
- Aetna statements focus on commission amounts by client company
- Typically shows Base Compensation, Incentive Compensation, and Lump Sum payments
- Format is usually straightforward with customer names and net compensation
- May include producer/broker information and location details
"""
        
        # Cigna
        elif 'cigna' in carrier_lower:
            return """
**Carrier-Specific Context (Cigna):**
- Cigna statements often include detailed breakdown by case/group
- May show medical, dental, and behavioral health separately
- Commission structure can include tiered rates based on performance
- Group information typically includes size and premium details
"""
        
        # Blue Cross Blue Shield variations
        elif any(name in carrier_lower for name in ['blue cross', 'bcbs', 'blue shield']):
            return """
**Carrier-Specific Context (Blue Cross Blue Shield):**
- BCBS statements vary by state and may include regional information
- Often shows breakdown by product line (HMO, PPO, etc.)
- May include renewal vs new business distinction
- Group information typically includes member counts and premium
"""
        
        # Humana
        elif 'humana' in carrier_lower:
            return """
**Carrier-Specific Context (Humana):**
- Humana statements often separate Medicare from commercial business
- May include member counts and PEPM details
- Commission structure can vary by product line
- Typically shows group names with enrollment and commission details
"""
        
        # Kaiser Permanente
        elif 'kaiser' in carrier_lower:
            return """
**Carrier-Specific Context (Kaiser Permanente):**
- Kaiser statements are typically regional (specific service areas)
- May include enrollment data and member months
- Commission structure often based on group size tiers
- Shows detailed breakdown by medical group
"""
        
        # Generic fallback for unknown carriers
        else:
            return f"""
**Carrier-Specific Context ({carrier_lower.title()}):**
- This is a commission statement from {carrier_lower.title()}
- Statement likely includes client/group names with corresponding commission amounts
- May show breakdown by plan type, enrollment data, or payment structure
- Focus on the key financial details and what they mean for the broker
"""
    
    def _format_date_conversational(self, date_str: str) -> str:
        """Convert date to conversational format"""
        try:
            # Try parsing common formats
            if isinstance(date_str, str):
                from dateutil import parser
                date_obj = parser.parse(date_str)
                return date_obj.strftime("%B %d, %Y")  # "March 11, 2025"
        except:
            pass
        return date_str
    
    def _extract_total_amount(self, tables: list) -> str:
        """Extract total commission amount from tables"""
        try:
            for table in tables:
                rows = table.get('rows', [])
                summary_rows = table.get('summaryRows', [])
                
                # Look for total rows
                for row_idx in summary_rows:
                    if row_idx < len(rows):
                        row = rows[row_idx]
                        for cell in row:
                            cell_str = str(cell)
                            if '$' in cell_str and ',' in cell_str:
                                # Clean and return the amount
                                return cell_str.strip()
            
            return "Not specified"
        except:
            return "Not specified"
    
    def _count_unique_companies(self, tables: list) -> int:
        """Count unique companies in commission data"""
        try:
            companies = set()
            for table in tables:
                rows = table.get('rows', [])
                headers = table.get('header', []) or table.get('headers', [])
                
                # Find company/customer column
                company_col_idx = None
                for idx, header in enumerate(headers):
                    header_lower = str(header).lower()
                    if any(keyword in header_lower for keyword in ['company', 'customer', 'client', 'name', 'group']):
                        company_col_idx = idx
                        break
                
                if company_col_idx is not None:
                    for row in rows:
                        if company_col_idx < len(row):
                            company_name = str(row[company_col_idx]).strip()
                            # Only add non-empty, non-total rows
                            if company_name and not any(keyword in company_name.lower() for keyword in ['total', 'subtotal', 'grand']):
                                companies.add(company_name)
            
            return len(companies)
        except Exception as e:
            logger.debug(f"Error counting companies: {e}")
            return 0
    
    def _generate_fallback_summary(self, extraction_data: Dict[str, Any]) -> Dict[str, Any]:
        """Fallback to structured format if AI generation fails"""
        logger.warning("🔄 Generating fallback summary...")
        
        # Try to extract from entities if available (enhanced extraction)
        entities = extraction_data.get('entities', {})
        if entities:
            carrier = entities.get('carrier', {}).get('name') or 'Unknown'
            broker = entities.get('broker', {}).get('company_name') or 'Unknown'
            doc_meta = entities.get('document_metadata', {})
            date = doc_meta.get('statement_date') or 'Unknown'
            logger.info(f"   Using entity data: carrier={carrier}, broker={broker}, date={date}")
        else:
            # Fall back to standard extraction data
            carrier = extraction_data.get('carrier_name') or extraction_data.get('extracted_carrier') or 'Unknown'
            date = extraction_data.get('statement_date') or extraction_data.get('extracted_date') or 'Unknown'
            broker = extraction_data.get('broker_company') or 'Unknown'
            logger.info(f"   Using standard data: carrier={carrier}, broker={broker}, date={date}")
        
        # Try to get document metadata from root level too
        doc_metadata = extraction_data.get('document_metadata', {})
        if doc_metadata and carrier == 'Unknown':
            carrier = doc_metadata.get('carrier_name', 'Unknown')
        if doc_metadata and broker == 'Unknown':
            broker = doc_metadata.get('broker_company', 'Unknown')
        if doc_metadata and date == 'Unknown':
            date = doc_metadata.get('statement_date', 'Unknown')
        
        summary = f"Commission statement from {carrier}, dated {date}, prepared for {broker}."
        
        logger.warning(f"   Fallback summary: {summary}")
        
        return {
            "success": True,
            "summary": summary,
            "processing_time": 0,
            "model": "fallback",
            "approach": "template_based"
        }
    
    # ============================================
    # Data Analysis Helper Methods (Research-Based)
    # ============================================
    
    def _get_top_companies(self, tables: list, limit: int = 3) -> list:
        """
        Extract top N companies by commission amount
        
        Returns list of (company_name, amount) tuples
        """
        try:
            company_amounts = []
            
            for table in tables:
                rows = table.get('rows', [])
                headers = table.get('header', []) or table.get('headers', [])
                
                # Find company and amount columns
                company_col = None
                amount_col = None
                
                for idx, header in enumerate(headers):
                    header_lower = str(header).lower()
                    if any(kw in header_lower for kw in ['company', 'customer', 'client', 'name', 'group']):
                        company_col = idx
                    if any(kw in header_lower for kw in ['total', 'net compensation', 'amount', 'commission']):
                        amount_col = idx
                
                if company_col is not None and amount_col is not None:
                    for row in rows:
                        if len(row) > max(company_col, amount_col):
                            company = str(row[company_col]).strip()
                            amount_str = str(row[amount_col]).strip()
                            
                            # Skip total rows
                            if any(kw in company.lower() for kw in ['total', 'subtotal', 'grand']):
                                continue
                            
                            # Parse amount
                            try:
                                amount = float(amount_str.replace('$', '').replace(',', ''))
                                if amount > 0:
                                    company_amounts.append((company, amount))
                            except:
                                continue
            
            # Sort by amount descending and return top N
            company_amounts.sort(key=lambda x: x[1], reverse=True)
            return company_amounts[:limit]
            
        except Exception as e:
            logger.debug(f"Error extracting top companies: {e}")
            return []
    
    def _identify_special_payments(self, tables: list) -> list:
        """
        Identify special payments like bonuses, lump sums, incentives
        
        Returns list of (description, amount) tuples
        """
        special_keywords = [
            'bonus', 'incentive', 'lump sum', 'override', 'adjustment',
            'new business', 'production', 'annual', 'quarterly'
        ]
        
        special_payments = []
        
        try:
            for table in tables:
                rows = table.get('rows', [])
                
                for row in rows:
                    row_text = ' '.join(str(cell) for cell in row).lower()
                    
                    # Check if row contains special payment keywords
                    for keyword in special_keywords:
                        if keyword in row_text:
                            # Extract amount from row
                            for cell in row:
                                cell_str = str(cell)
                                if '$' in cell_str:
                                    special_payments.append((keyword, cell_str.strip()))
                                    break
            
            return special_payments
            
        except Exception as e:
            logger.debug(f"Error identifying special payments: {e}")
            return []
    
    def _extract_plan_types(self, tables: list) -> list:
        """
        Extract plan types mentioned in the document
        
        Returns list of plan types found
        """
        plan_keywords = {
            'Medical': ['medical', 'md medical', 'health'],
            'Dental': ['dental'],
            'Vision': ['vision'],
            'Life': ['life insurance', 'life'],
            'Disability': ['disability', 'std', 'ltd'],
            'Behavioral Health': ['behavioral', 'mental health'],
            'PEPM': ['pepm', 'per employee per month']
        }
        
        found_plans = set()
        
        try:
            # Search through all table content
            for table in tables:
                rows = table.get('rows', [])
                headers = table.get('header', []) or table.get('headers', [])
                
                all_text = ' '.join(str(cell) for row in [headers] + rows for cell in row).lower()
                
                for plan_type, keywords in plan_keywords.items():
                    if any(keyword in all_text for keyword in keywords):
                        found_plans.add(plan_type)
            
            return list(found_plans)
            
        except Exception as e:
            logger.debug(f"Error extracting plan types: {e}")
            return []
    
    def _extract_payment_period(self, tables: list) -> str:
        """
        Extract the payment or activity period (e.g., "Feb 2025 Subscribers")
        
        Returns period description or empty string
        """
        months = ['january', 'february', 'march', 'april', 'may', 'june',
                  'july', 'august', 'september', 'october', 'november', 'december',
                  'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
        
        try:
            for table in tables:
                rows = table.get('rows', [])
                
                for row in rows:
                    row_text = ' '.join(str(cell) for cell in row).lower()
                    
                    # Look for patterns like "Feb 2025 Subscribers" or "January 2025"
                    if any(month in row_text for month in months):
                        if 'subscriber' in row_text or '2025' in row_text or '2024' in row_text:
                            # Extract the relevant part
                            for cell in row:
                                cell_str = str(cell)
                                if any(month in cell_str.lower() for month in months):
                                    return cell_str.strip()
            
            return ""
            
        except Exception as e:
            logger.debug(f"Error extracting payment period: {e}")
            return ""
    
    def _format_top_companies(self, top_companies: list) -> str:
        """Format top companies for display in prompt"""
        if not top_companies:
            return "No specific top earners identified"
        
        lines = []
        for idx, (company, amount) in enumerate(top_companies, 1):
            lines.append(f"{idx}. {company}: ${amount:,.2f}")
        
        return '\n'.join(lines)
    
    def _format_plan_types(self, plan_types: list) -> str:
        """Format plan types for display in prompt"""
        if not plan_types:
            return "Plan types not clearly identified"
        
        return ', '.join(plan_types)
    
    def _format_special_payments(self, special_payments: list) -> str:
        """Format special payments for display in prompt"""
        if not special_payments:
            return "No special payments or bonuses identified"
        
        lines = []
        seen = set()
        for payment_type, amount in special_payments:
            key = (payment_type, amount)
            if key not in seen:
                lines.append(f"- {payment_type.title()}: {amount}")
                seen.add(key)
        
        return '\n'.join(lines)
    
    def _get_carrier_type(self, carrier: str) -> str:
        """Determine carrier type/category"""
        carrier_lower = carrier.lower()
        
        if any(name in carrier_lower for name in ['united', 'uhc']):
            return "National carrier (enrollment-focused)"
        elif 'aetna' in carrier_lower:
            return "National carrier (commission-focused)"
        elif 'cigna' in carrier_lower:
            return "National carrier (tiered structure)"
        elif any(name in carrier_lower for name in ['blue cross', 'bcbs']):
            return "Regional carrier (state-specific)"
        else:
            return "Insurance carrier"
    
    def _build_enhanced_summary_prompt(
        self,
        extraction_data: Dict[str, Any],
        document_context: Dict[str, Any]
    ) -> str:
        """
        Build enhanced summary prompt using semantic extraction data.
        
        This uses the three-phase extraction data:
        - Entities (carriers, brokers, agents, groups)
        - Relationships (entity connections)
        - Business Intelligence (patterns, insights)
        """
        import json
        
        logger.info("🎯 Building enhanced summary prompt...")
        
        # Extract components
        entities = extraction_data.get('entities', {})
        relationships = extraction_data.get('relationships', {})
        business_intel = extraction_data.get('business_intelligence', {})
        
        logger.info(f"   - Entities: {list(entities.keys())}")
        logger.info(f"   - Relationships: {list(relationships.keys())}")
        logger.info(f"   - Business Intelligence: {list(business_intel.keys())}")
        
        # Build enhanced data structure for prompt
        enhanced_data = {
            'carrier': entities.get('carrier', {}),
            'broker': entities.get('broker', {}),
            'document_metadata': entities.get('document_metadata', {}),
            'writing_agents': entities.get('writing_agents', []),
            'groups_and_companies': entities.get('groups_and_companies', []),
            'business_intelligence': business_intel,
            'relationships': relationships
        }
        
        # Format for prompt
        extraction_json = json.dumps(enhanced_data, indent=2)
        relationship_json = json.dumps(relationships, indent=2)
        
        # Try to use enhanced prompt (FIXED PATH)
        try:
            from app.services.claude.enhanced_prompts import EnhancedClaudePrompts
            logger.info("✅ SUCCESS: Enhanced prompts module imported")
            logger.info("🚀 Using EnhancedClaudePrompts.get_intelligent_summarization_prompt()")
            return EnhancedClaudePrompts.get_intelligent_summarization_prompt(
                extraction_json,
                relationship_json
            )
        except ImportError as e:
            logger.error(f"❌ CRITICAL: Enhanced prompts import failed: {e}")
            logger.error(f"   ImportError details: {type(e).__name__}: {str(e)}")
            logger.warning("   Falling back to standard enhanced prompt format")
            # Fallback to standard prompt with enhanced data
            return self._build_standard_enhanced_prompt(enhanced_data, document_context)
        except Exception as e:
            logger.error(f"❌ CRITICAL: Unexpected error in enhanced prompt generation: {e}")
            logger.error(f"   Error type: {type(e).__name__}")
            logger.exception("   Full traceback:")
            logger.warning("   Falling back to standard enhanced prompt format")
            return self._build_standard_enhanced_prompt(enhanced_data, document_context)
    
    def _build_standard_enhanced_prompt(
        self,
        enhanced_data: Dict[str, Any],
        document_context: Dict[str, Any]
    ) -> str:
        """
        Build standard prompt format with enhanced data.
        Fallback when enhanced prompts module is not available.
        """
        import json
        
        carrier = enhanced_data.get('carrier', {}).get('name', 'Unknown')
        broker = enhanced_data.get('broker', {}).get('company_name', 'Unknown')
        doc_meta = enhanced_data.get('document_metadata', {})
        business_intel = enhanced_data.get('business_intelligence', {})
        
        prompt = f"""<context>
You are analyzing a commission statement to create a comprehensive, conversational summary.

<document_info>
Carrier: {carrier}
Broker: {broker}
Statement Date: {doc_meta.get('statement_date', 'Unknown')}
Payment Type: {doc_meta.get('payment_type', 'Unknown')}
</document_info>

<business_intelligence>
Total Commission: {business_intel.get('total_commission_amount', 'Not specified')}
Number of Groups: {business_intel.get('number_of_groups', 0)}
Top Contributors: {json.dumps(business_intel.get('top_contributors', []), indent=2)}
Commission Structures: {', '.join(business_intel.get('commission_structures', []))}
Patterns: {json.dumps(business_intel.get('patterns_detected', []), indent=2)}
</business_intelligence>

<writing_agents>
{json.dumps(enhanced_data.get('writing_agents', []), indent=2)}
</writing_agents>
</context>

<instructions>
Create a comprehensive, conversational summary (3-4 sentences) that:

1. Starts with document type, carrier, broker, and date
2. Includes total commission, number of groups, and top 2-3 contributors with amounts
3. Mentions commission structures, agent details, and payment type
4. Highlights any notable patterns or special features

Write in natural, flowing prose - NO bullet points or field labels.
Be specific with names and amounts - avoid generic terms.
Make it information-rich but conversational.

Start immediately with "This is..." or "This document..."
</instructions>"""
        
        return prompt

