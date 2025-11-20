"""
Semantic Extraction Service - Phase 2 of Enhanced Document Intelligence

This service maps relationships between extracted entities and performs
business intelligence analysis on commission statements.

Key Capabilities:
- Entity relationship mapping (Carrier → Broker → Agents → Groups → Payments)
- Financial flow analysis
- Hierarchical structure detection
- Business pattern recognition
- Anomaly detection
- Context-aware summary row detection (LLM-driven, no hard-coded patterns)
"""

import logging
import re
from typing import Dict, Any, List, Optional
import json
from .extraction_rules import ExtractionRules
from .context_aware_extraction import ContextAwareExtractionService

logger = logging.getLogger(__name__)


class SemanticExtractionService:
    """
    Semantic entity extraction and relationship mapping service.
    
    Transforms raw extraction data into intelligent business relationships
    and patterns.
    """
    
    def __init__(self, use_context_aware_detection: bool = True):
        """
        Initialize semantic extraction service.
        
        Args:
            use_context_aware_detection: If True, use LLM-driven context-aware detection
                                          for summary rows. If False, use legacy pattern-based detection.
        """
        self.use_context_aware_detection = use_context_aware_detection
        self.context_aware_service = None
        
        # Initialize context-aware service if enabled
        if self.use_context_aware_detection:
            try:
                self.context_aware_service = ContextAwareExtractionService()
                logger.info("✅ Semantic Extraction Service initialized with context-aware detection")
            except Exception as e:
                logger.warning(f"⚠️ Failed to initialize context-aware detection: {e}. Falling back to pattern-based detection.")
                self.use_context_aware_detection = False
                logger.info("✅ Semantic Extraction Service initialized with pattern-based detection (fallback)")
        else:
            logger.info("✅ Semantic Extraction Service initialized with pattern-based detection")
    
    async def extract_entities_and_relationships(
        self,
        raw_extraction: Dict[str, Any],
        enhanced_extraction: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Phase 2: Extract entities and map relationships
        
        Args:
            raw_extraction: Standard table extraction results
            enhanced_extraction: Optional enhanced extraction with business intelligence
            
        Returns:
            Dictionary with entities, relationships, and business intelligence
        """
        try:
            logger.info("🔍 Starting semantic extraction and relationship mapping...")
            
            # Use enhanced extraction if available, otherwise use raw
            extraction_source = enhanced_extraction if enhanced_extraction else raw_extraction
            
            # ✅ NEW: Validate summary row markers FIRST
            tables = extraction_source.get('tables', [])
            if tables:
                validation = self._validate_summary_row_markers(tables)
                if validation['warnings']:
                    logger.warning(f"⚠️ Summary row validation found {len(validation['warnings'])} warnings")
                    for warning in validation['warnings']:
                        logger.warning(f"  - {warning}")
            
            # Phase 2.1: Extract and enrich entities
            entities = self._extract_entities(extraction_source, raw_extraction)
            
            # Phase 2.2: Map entity relationships
            relationships = self._map_entity_relationships(entities, extraction_source)
            
            # Phase 2.3: Extract business intelligence
            business_intel = self._extract_business_intelligence(
                entities, 
                relationships, 
                extraction_source,
                raw_extraction
            )
            
            result = {
                'success': True,
                'entities': entities,
                'relationships': relationships,
                'business_intelligence': business_intel,
                'raw_tables': raw_extraction.get('tables', [])
            }
            
            logger.info("✅ Semantic extraction completed successfully")
            return result
            
        except Exception as e:
            logger.error(f"❌ Semantic extraction failed: {e}")
            return {
                'success': False,
                'error': str(e),
                'entities': {},
                'relationships': {},
                'business_intelligence': {},
                'raw_tables': raw_extraction.get('tables', [])
            }
    
    def _extract_entities(
        self, 
        extraction_source: Dict[str, Any],
        raw_extraction: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Extract and enrich business entities from the document.
        
        Entities include:
        - Carrier (insurance company)
        - Broker/Agent (receiving commissions)
        - Writing Agents (individual agents)
        - Groups/Companies (client organizations)
        - Document metadata
        """
        entities = {}
        
        # Extract carrier information
        entities['carrier'] = self._extract_carrier_entity(extraction_source)
        
        # Extract broker/agent information
        entities['broker'] = self._extract_broker_entity(extraction_source)
        
        # Extract writing agents
        entities['writing_agents'] = self._extract_writing_agents(extraction_source)
        
        # Extract groups and companies
        entities['groups_and_companies'] = self._extract_groups_companies(extraction_source)
        
        # Extract document metadata
        entities['document_metadata'] = self._extract_document_metadata(extraction_source)
        
        return entities
    
    def _extract_carrier_entity(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Extract carrier information"""
        # Try enhanced extraction first
        if 'carrier' in data and isinstance(data['carrier'], dict):
            return data['carrier']
        
        # Fallback to standard extraction
        doc_metadata = data.get('document_metadata', {})
        carrier_name = doc_metadata.get('carrier_name', 'Unknown')
        
        return {
            'name': carrier_name,
            'confidence': doc_metadata.get('carrier_confidence', 0.8),
            'evidence': 'Document metadata'
        }
    
    def _extract_broker_entity(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Extract broker/agent information"""
        # Try enhanced extraction first
        if 'broker_agent' in data and isinstance(data['broker_agent'], dict):
            return data['broker_agent']
        
        # Fallback to standard extraction
        doc_metadata = data.get('document_metadata', {})
        broker_name = doc_metadata.get('broker_company', 'Unknown')
        
        return {
            'company_name': broker_name,
            'confidence': doc_metadata.get('broker_confidence', 0.8),
            'evidence': 'Document metadata'
        }
    
    def _extract_writing_agents(self, data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Extract individual writing agents"""
        # Try enhanced extraction first
        if 'writing_agents' in data and isinstance(data['writing_agents'], list):
            return data['writing_agents']
        
        # Try to extract from tables - LOOK FOR EMBEDDED AGENT ROWS
        agents = []
        agent_names = set()
        tables = data.get('tables', [])
        
        for table in tables:
            rows = table.get('rows', [])
            
            # Look for special "Writing Agent Name:" rows embedded in the data
            for row in rows:
                row_text = ' '.join(str(cell) for cell in row).strip()
                
                # Check if this row contains "Writing Agent Name:"
                if 'Writing Agent Name:' in row_text or 'Writing Agent 1 Name:' in row_text:
                    # Extract the agent name from the row
                    for cell in row:
                        cell_str = str(cell).strip()
                        if 'Writing Agent Name:' in cell_str or 'Writing Agent 1 Name:' in cell_str:
                            # Extract name after the colon
                            parts = cell_str.split(':')
                            if len(parts) > 1:
                                agent_name = parts[1].strip()
                                if agent_name and agent_name not in agent_names:
                                    agent_names.add(agent_name)
                                    agents.append({
                                        'agent_name': agent_name,
                                        'role': 'Writing Agent',
                                        'groups_handled': []
                                    })
        
        # If no embedded agents found, look in columns (old method)
        if not agents:
            for table in tables:
                headers = table.get('headers', []) or table.get('header', [])
                rows = table.get('rows', [])
                
                # Look for agent-related columns (but skip rate/percentage columns)
                agent_col_idx = None
                for idx, header in enumerate(headers):
                    header_lower = str(header).lower()
                    # Skip columns that are clearly rates/percentages
                    if any(kw in header_lower for kw in ['rate', '%', 'percent', 'commission rate']):
                        continue
                    if any(kw in header_lower for kw in ['agent name', 'writing agent', 'producer name']):
                        agent_col_idx = idx
                        break
                
                if agent_col_idx is not None:
                    for row in rows:
                        if agent_col_idx < len(row):
                            agent_name = str(row[agent_col_idx]).strip()
                            # Skip empty, totals, and values that look like percentages
                            if agent_name and agent_name not in ['Total', 'Subtotal'] and '%' not in agent_name:
                                if agent_name not in agent_names:
                                    agent_names.add(agent_name)
                                    agents.append({
                                        'agent_name': agent_name,
                                        'role': 'Writing Agent',
                                        'groups_handled': []
                                    })
        
        logger.info(f"📊 Extracted {len(agents)} writing agents: {[a['agent_name'] for a in agents]}")
        return agents
    
    def _extract_groups_companies(self, data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Extract group/company information with summary row filtering"""
        # Try enhanced extraction first - USE CLAUDE'S EXTRACTED GROUPS
        if 'groups_and_companies' in data and isinstance(data['groups_and_companies'], list):
            raw_groups = data['groups_and_companies']
            logger.info(f"✅ Using Claude's extracted groups/companies (before filtering): {len(raw_groups)} groups")
            
            # 🔴 CRITICAL: First check if tables have summary_rows metadata from Claude
            # If Claude already marked summary rows in the table, use that information
            tables = data.get('raw_tables') or data.get('tables', [])
            claude_marked_summary_indices = set()
            
            if tables:
                for table in tables:
                    summary_indices = table.get('summary_rows', []) or table.get('summaryRows', [])
                    if summary_indices:
                        claude_marked_summary_indices.update(summary_indices)
                        logger.info(f"📋 Claude marked {len(summary_indices)} rows as summaries in table metadata")
                
                # ✅ TRUST CLAUDE: Validate and log Claude's summary row classification
                # We no longer override Claude's intelligent detection with Python patterns
                summary_count = self._validate_and_fix_summary_markers(tables)
                if summary_count > 0:
                    logger.info(f"📋 Claude's classification: {len(claude_marked_summary_indices)} rows marked as summaries")
            
            # If Claude marked summary rows, filter groups using table-based matching
            if claude_marked_summary_indices and tables:
                filtered_groups = self._filter_groups_by_table_summary_metadata(
                    raw_groups, tables, claude_marked_summary_indices
                )
                logger.info(f"📊 After table-based filtering: {len(raw_groups)} → {len(filtered_groups)} actual groups (removed {len(raw_groups) - len(filtered_groups)} summary rows based on Claude's table metadata)")
            else:
                # Apply post-processing filter to remove any summary rows that slipped through Claude's filter
                filtered_groups = self._filter_summary_rows(raw_groups)
                logger.info(f"📊 After semantic filtering: {len(raw_groups)} → {len(filtered_groups)} actual groups (removed {len(raw_groups) - len(filtered_groups)} summary rows)")
            
            # 🔴 CRITICAL FIX: Mark filtered-out groups as summary rows in table metadata
            # This ensures downstream calculations skip these rows
            excluded_groups = [g for g in raw_groups if g not in filtered_groups]
            if excluded_groups:
                # Get tables from data (try both 'raw_tables' and 'tables' keys)
                if tables:
                    self._mark_filtered_groups_in_tables(tables, excluded_groups)
            
            return filtered_groups
        
        logger.info("⚠️ No groups_and_companies from Claude - falling back to table extraction")
        
        # Extract from tables
        groups = []
        tables = data.get('tables', [])
        
        for table in tables:
            headers = table.get('headers', []) or table.get('header', [])
            rows = table.get('rows', [])
            
            # Get summary row indices if marked in table metadata
            summary_row_indices = set(table.get('summary_rows', []) or table.get('summaryRows', []))
            if summary_row_indices:
                logger.debug(f"Table has {len(summary_row_indices)} rows marked as summary rows: {summary_row_indices}")
            
            # Find relevant columns
            group_name_idx = None
            group_no_idx = None
            amount_idx = None
            
            for idx, header in enumerate(headers):
                header_lower = str(header).lower()
                if 'group no' in header_lower or 'group number' in header_lower:
                    group_no_idx = idx
                if any(kw in header_lower for kw in ['group name', 'company', 'customer', 'client']) and 'no' not in header_lower:
                    group_name_idx = idx
                if any(kw in header_lower for kw in ['paid amount', 'commission earned', 'net compensation']):
                    amount_idx = idx
            
            if group_name_idx is not None:
                for row_idx, row in enumerate(rows):
                    # CRITICAL: Skip rows that are marked as summary rows
                    if row_idx in summary_row_indices:
                        logger.debug(f"Skipping row {row_idx} - marked as summary row")
                        continue
                    if group_name_idx < len(row):
                        group_name = str(row[group_name_idx]).strip()
                        
                        # Skip empty rows
                        if not group_name:
                            continue
                        
                        # Use unified filtering rules to check if this should be skipped
                        # Get the group number early for filtering check
                        group_no = str(row[group_no_idx]).strip() if group_no_idx is not None and group_no_idx < len(row) else ''
                        
                        # Use unified filtering logic with enhanced parameters
                        if ExtractionRules.Filtering.should_filter_row(
                            group_name, 
                            group_no,
                            paid_amount=row[amount_idx] if amount_idx is not None and amount_idx < len(row) else None
                        ):
                            logger.debug(f"Skipping summary/metadata row: {group_no} - {group_name}")
                            continue
                        
                        # Require a group number to be valid (if group_no column exists)
                        if group_no_idx is not None and not group_no:
                            continue  # Skip rows without a group number
                        
                        # Extract paid amount
                        paid_amount = None
                        if amount_idx is not None and amount_idx < len(row):
                            amount_str = str(row[amount_idx]).strip()
                            if amount_str and amount_str != '':
                                paid_amount = amount_str
                        
                        group_data = {
                            'group_name': group_name,
                            'group_number': str(row[group_no_idx]).strip() if group_no_idx and group_no_idx < len(row) else None,
                            'paid_amount': paid_amount
                        }
                        groups.append(group_data)
        
        logger.info(f"📊 Extracted {len(groups)} groups/companies")
        return groups
    
    def _mark_filtered_groups_in_tables(self, tables: List[Dict[str, Any]], excluded_groups: List[Dict[str, Any]]) -> None:
        """
        🔴 CRITICAL FIX: Mark rows corresponding to filtered-out groups as summary rows in table metadata.
        
        This ensures that when we filter groups in semantic extraction, the corresponding table rows
        are also marked as summary rows so they're excluded from commission calculations.
        
        Args:
            tables: List of table dictionaries with headers and rows
            excluded_groups: List of groups that were filtered out as summary/duplicate rows
        """
        if not tables or not excluded_groups:
            return
        
        marked_count = 0
        
        for table in tables:
            headers = table.get('headers', []) or table.get('header', [])
            rows = table.get('rows', [])
            
            if not rows:
                continue
            
            # Get existing summary row indices
            summary_row_indices = set(table.get('summaryRows', []) or table.get('summary_rows', []))
            
            # Find Group No. and Group Name column indices
            group_no_idx = None
            group_name_idx = None
            
            for idx, header in enumerate(headers):
                header_lower = str(header).lower()
                if 'group no' in header_lower or 'group number' in header_lower:
                    group_no_idx = idx
                if any(kw in header_lower for kw in ['group name', 'company', 'customer', 'client']) and 'no' not in header_lower:
                    group_name_idx = idx
            
            # Match excluded groups to table rows
            for row_idx, row in enumerate(rows):
                # Skip if already marked as summary
                if row_idx in summary_row_indices:
                    continue
                
                # Check if this row matches any excluded group
                for excluded_group in excluded_groups:
                    group_no = excluded_group.get('group_number', '').strip()
                    group_name = (excluded_group.get('group_name', '') or excluded_group.get('company_name', '')).strip()
                    
                    row_matches = False
                    
                    # Match by group number if available
                    if group_no_idx is not None and group_no_idx < len(row) and group_no:
                        row_group_no = str(row[group_no_idx]).strip()
                        if row_group_no == group_no:
                            row_matches = True
                    
                    # Match by group name if available
                    if not row_matches and group_name_idx is not None and group_name_idx < len(row) and group_name:
                        row_group_name = str(row[group_name_idx]).strip()
                        if row_group_name == group_name:
                            row_matches = True
                    
                    if row_matches:
                        summary_row_indices.add(row_idx)
                        marked_count += 1
                        logger.debug(
                            f"   ✅ Marked row {row_idx} as summary (matched excluded group: {group_no or 'N/A'} - {group_name})"
                        )
                        break  # Found match, no need to check other excluded groups
            
            # Update table metadata with marked summary rows
            table['summaryRows'] = sorted(list(summary_row_indices))
            table['summary_rows'] = sorted(list(summary_row_indices))  # Both formats for compatibility
        
        if marked_count > 0:
            logger.info(f"🔍 Marked {marked_count} table rows as summary rows based on semantic filtering")
    
    def _validate_and_fix_summary_markers(
        self,
        tables: List[Dict[str, Any]]
    ) -> int:
        """
        ✅ TRUST CLAUDE: Simply validate that summary markers exist and log stats.
        No more Python pattern matching that overrides Claude's intelligence.
        
        Args:
            tables: List of table dictionaries with rows and summary_rows metadata
            
        Returns:
            Number of summary rows marked (for logging/monitoring)
        """
        total_summary_count = 0
        total_rows = 0
        
        for table_idx, table in enumerate(tables):
            rows = table.get('rows', [])
            summary_row_indices = set(table.get('summary_rows', []) or table.get('summaryRows', []))
            
            if not rows:
                continue
            
            table_row_count = len(rows)
            table_summary_count = len(summary_row_indices)
            
            total_rows += table_row_count
            total_summary_count += table_summary_count
            
            # Calculate ratio for monitoring
            summary_ratio = table_summary_count / table_row_count if table_row_count > 0 else 0
            
            # Log stats for transparency
            logger.debug(
                f"Table {table_idx}: {table_summary_count} summary rows "
                f"out of {table_row_count} total ({summary_ratio:.1%})"
            )
            
            # ⚠️ WARNING: If summary ratio > 20%, something might be wrong
            if summary_ratio > 0.20:
                logger.warning(
                    f"⚠️ Table {table_idx}: High summary ratio ({summary_ratio:.1%}) - "
                    f"{table_summary_count}/{table_row_count} rows marked as summaries. "
                    f"Review prompt if this seems incorrect."
                )
        
        # Global monitoring
        if total_rows > 0:
            global_ratio = total_summary_count / total_rows
            logger.info(
                f"✅ Claude classified {total_summary_count} summary rows "
                f"out of {total_rows} total ({global_ratio:.1%})"
            )
            
            if global_ratio > 0.20:
                logger.warning(
                    f"⚠️ ALERT: Global summary ratio ({global_ratio:.1%}) exceeds 20% threshold. "
                    f"This may indicate over-marking. Review prompt optimization."
                )
        
        return total_summary_count
    
    def _has_valid_group_number(self, group_no: str) -> bool:
        """
        Check if group_no matches valid patterns.
        
        Valid patterns:
        - L##### (L followed by 5-6 digits): L224259, L213059
        - ##### (5-7 digit number): 1653402, 230691
        - Alphanumeric identifier (4-10 chars)
        
        Args:
            group_no: The Group Number value to validate
            
        Returns:
            True if valid group number pattern, False otherwise
        """
        if not group_no or len(group_no.strip()) < 2:
            return False
        
        group_no = group_no.strip()
        
        # Pattern 1: L##### (L followed by 5-6 digits)
        if re.match(r'^L\d{5,6}$', group_no, re.IGNORECASE):
            return True
        
        # Pattern 2: 5-7 digit number
        if re.match(r'^\d{5,7}$', group_no):
            return True
        
        # Pattern 3: Alphanumeric identifier (4-10 characters with at least one digit)
        if 4 <= len(group_no) <= 10 and re.search(r'\d', group_no):
            return True
        
        return False
    
    def _has_company_name(self, company_name: str) -> bool:
        """
        Check if company_name is a real company name (not summary marker).
        
        Args:
            company_name: The Company Name value to validate
            
        Returns:
            True if valid company name, False otherwise
        """
        if not company_name or len(company_name.strip()) < 2:
            return False
        
        company_name_lower = company_name.lower()
        
        # Reject summary keywords
        reject_patterns = [
            "total", "summary", "grand", "subtotal",
            "writing agent", "agent 2", "producer",
            "grand total", "total for"
        ]
        
        for pattern in reject_patterns:
            if pattern in company_name_lower:
                return False
        
        # Valid if it's not empty and doesn't contain summary keywords
        return True
    
    def _filter_groups_by_table_summary_metadata(
        self,
        groups: List[Dict[str, Any]],
        tables: List[Dict[str, Any]],
        summary_row_indices: set
    ) -> List[Dict[str, Any]]:
        """
        Filter groups based on table summary row metadata from Claude.
        
        ✅ Trust Claude's detection completely - no additional Python validation.
        
        Args:
            groups: List of group dictionaries from Claude's extraction
            tables: List of table dictionaries with rows and metadata
            summary_row_indices: Set of row indices marked as summary rows by Claude
            
        Returns:
            Filtered list with groups corresponding to Claude's summary rows removed
        """
        if not groups or not tables or not summary_row_indices:
            return groups
        
        # ✅ DEBUG: Log BEFORE filtering
        logger.info("="*80)
        logger.info("🔍 SEMANTIC FILTERING (trusting Claude)")
        logger.info(f"Input: {len(groups)} groups to filter")
        logger.info(f"Tables: {len(tables)} tables")
        logger.info(f"Claude marked summary row indices: {sorted(summary_row_indices)}")
        
        logger.info("\n📋 Groups to filter:")
        for idx, group in enumerate(groups):
            group_name = group.get('group_name', '') or group.get('company_name', '')
            group_no = group.get('group_number', '') or group.get('group_no', '')
            logger.info(f"  [{idx:2d}] {group_no:15s} | {group_name}")
        
        # ✅ TRUST CLAUDE: Use Claude's summary row signatures directly (no Python validation)
        validated_summary_signatures = set()
        
        for table in tables:
            rows = table.get('rows', [])
            headers = table.get('headers', []) or table.get('header', [])
            
            # Find column indices
            group_name_idx = None
            group_no_idx = None
            
            for idx, header in enumerate(headers):
                header_lower = str(header).lower()
                if 'group no' in header_lower or 'group number' in header_lower or 'group id' in header_lower:
                    group_no_idx = idx
                if 'group name' in header_lower or 'company' in header_lower or 'client name' in header_lower or 'customer' in header_lower:
                    if 'no' not in header_lower:  # Avoid matching "Group No"
                        group_name_idx = idx
            
            # Extract and VALIDATE signatures from Claude-marked summary rows
            for row_idx, row in enumerate(rows):
                if row_idx not in summary_row_indices:
                    continue  # Skip non-summary rows
                
                # Extract row data (handle both list and dict formats)
                if isinstance(row, dict):
                    row_data = row.get('data', row)
                else:
                    row_data = row
                
                # Extract identifiers from summary row
                row_group_no = ''
                row_group_name = ''
                
                if group_no_idx is not None and group_no_idx < len(row_data):
                    row_group_no = str(row_data[group_no_idx]).strip()
                
                if group_name_idx is not None and group_name_idx < len(row_data):
                    row_group_name = str(row_data[group_name_idx]).strip()
                
                # ✅ TRUST CLAUDE: Accept Claude's summary markers without question
                signature = f"{row_group_no}|{row_group_name}"
                validated_summary_signatures.add(signature)
                logger.debug(f"✅ Trusting Claude's summary classification: {signature}")
        
        logger.info(f"\n🔍 Using {len(validated_summary_signatures)} summary signatures from Claude (trusted)")
        
        if validated_summary_signatures:
            logger.info("📍 Claude's summary row signatures (will be excluded):")
            for sig in sorted(validated_summary_signatures):
                logger.info(f"     {sig}")
        
        # ✅ Filter groups using Claude's signatures
        filtered_groups = []
        excluded_count = 0
        
        for group_idx, group in enumerate(groups):
            group_name = group.get('group_name', '') or group.get('company_name', '')
            group_no = group.get('group_number', '') or group.get('group_no', '')
            
            if not group_name:
                # No group name = invalid group, exclude
                excluded_count += 1
                logger.debug(f"🔴 EXCLUDED: Group {group_idx} has no group name")
                continue
            
            # ✅ Create signature for this group
            group_signature = f"{group_no}|{group_name}"
            
            # ✅ Trust Claude: Exclude if signature is in Claude's summary list
            if group_signature in validated_summary_signatures:
                excluded_count += 1
                logger.info(f"🔴 EXCLUDED: Group {group_idx}: {group_signature} (Claude marked as summary)")
            else:
                # ✅ VALID GROUP: Include it
                filtered_groups.append(group)
                logger.debug(f"✅ INCLUDED: Group {group_idx}: {group_signature}")
        
        # ✅ DEBUG: Log AFTER filtering
        logger.info(f"\n✅ Filtered groups ({len(filtered_groups)}):")
        for idx, group in enumerate(filtered_groups):
            group_name = group.get('group_name', '') or group.get('company_name', '')
            group_no = group.get('group_number', '') or group.get('group_no', '')
            logger.info(f"  [{idx:2d}] {group_no:15s} | {group_name}")
        
        logger.info(f"\n🔴 Excluded: {excluded_count} groups")
        logger.info(f"✅ Filtering: {len(groups)} → {len(filtered_groups)} groups (excluded {excluded_count})")
        
        # ✅ NEW: Add detailed validation metrics
        logger.info(f"\n📊 Summary Row Statistics:")
        total_rows = sum(len(table.get('rows', [])) for table in tables)
        logger.info(f"  Total rows extracted: {total_rows}")
        logger.info(f"  Rows marked as summary: {len(summary_row_indices)}")
        if total_rows > 0:
            summary_ratio = len(summary_row_indices) / total_rows * 100
            logger.info(f"  Summary ratio: {summary_ratio:.1f}%")
            
            # ✅ WARNING: If summary ratio > 20%, something might be wrong
            if summary_ratio > 20:
                logger.warning(
                    f"⚠️ HIGH SUMMARY RATIO: {summary_ratio:.1f}% "
                    f"({len(summary_row_indices)}/{total_rows} rows) - review prompt or detection logic"
                )
        
        logger.info(f"  Groups before filtering: {len(groups)}")
        logger.info(f"  Groups after filtering: {len(filtered_groups)}")
        logger.info(f"  Filtering removed: {len(groups) - len(filtered_groups)} rows")
        logger.info("="*80)
        
        return filtered_groups
    
    def _validate_summary_row_markers(
        self,
        tables: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Validate that Claude's summary row markers are reasonable.
        
        This validation checks for anomalies in summary row marking that might
        indicate over-marking or incorrect classification.
        
        Args:
            tables: List of table dictionaries with rows and metadata
            
        Returns:
            Validation report with warnings if markers seem incorrect
        """
        validation = {
            'total_tables': len(tables),
            'total_rows': 0,
            'total_summary_rows': 0,
            'warnings': [],
            'table_stats': []
        }
        
        for table_idx, table in enumerate(tables):
            rows = table.get('rows', [])
            summary_rows = set(table.get('summary_rows', []) or table.get('summaryRows', []))
            
            table_total_rows = len(rows)
            table_summary_rows = len(summary_rows)
            
            validation['total_rows'] += table_total_rows
            validation['total_summary_rows'] += table_summary_rows
            
            # Calculate ratio
            summary_ratio = table_summary_rows / table_total_rows if table_total_rows > 0 else 0
            
            table_stat = {
                'table_idx': table_idx,
                'total_rows': table_total_rows,
                'summary_rows': table_summary_rows,
                'summary_ratio': summary_ratio
            }
            
            # ✅ WARNING: High summary ratio (> 20%) suggests over-marking
            if summary_ratio > 0.20:
                warning = f"Table {table_idx}: High summary ratio ({summary_ratio:.1%}) - {table_summary_rows}/{table_total_rows} rows marked as summaries"
                validation['warnings'].append(warning)
                logger.warning(warning)
            
            # ✅ WARNING: First few rows marked as summary (unusual - likely already corrected by utils.py)
            # Note: This warning should rarely trigger now due to false positive correction in utils.py
            first_few_marked = [i for i in range(min(5, table_total_rows)) if i in summary_rows]
            if first_few_marked:
                # Check if these are legitimately summary rows (empty identifiers)
                headers = table.get('headers', []) or table.get('header', [])
                rows = table.get('rows', [])
                
                # Find Group ID/Name columns
                group_id_col = None
                group_name_col = None
                for idx, header in enumerate(headers):
                    header_lower = str(header).lower()
                    if any(kw in header_lower for kw in ['group no', 'group id', 'policy no']):
                        group_id_col = idx
                    elif any(kw in header_lower for kw in ['group name', 'company', 'client name']) and 'no' not in header_lower:
                        group_name_col = idx
                
                # Verify if these are truly summary rows (empty identifiers)
                suspicious_marks = []
                for row_idx in first_few_marked:
                    if row_idx < len(rows):
                        row = rows[row_idx]
                        has_valid_id = False
                        
                        # Check if row has valid identifiers (shouldn't be summary)
                        if group_id_col is not None and group_id_col < len(row):
                            val = str(row[group_id_col]).strip()
                            if val and val not in ['', '-', 'N/A']:
                                has_valid_id = True
                        
                        if has_valid_id:
                            suspicious_marks.append(row_idx)
                
                if suspicious_marks:
                    warning = f"Table {table_idx}: First few rows {suspicious_marks} marked as summary despite having valid identifiers - may need review"
                    validation['warnings'].append(warning)
                    logger.warning(warning)
            
            validation['table_stats'].append(table_stat)
        
        # Overall ratio check
        overall_ratio = validation['total_summary_rows'] / validation['total_rows'] if validation['total_rows'] > 0 else 0
        validation['overall_summary_ratio'] = overall_ratio
        
        if overall_ratio > 0.15:
            warning = f"Overall high summary ratio ({overall_ratio:.1%}) across all tables - review marking logic"
            validation['warnings'].append(warning)
            logger.warning(warning)
        
        logger.info(f"✅ Summary row validation: {validation['total_summary_rows']}/{validation['total_rows']} ({overall_ratio:.1%}) marked as summaries")
        
        return validation
    
    # ✅ REMOVED: _validate_summary_row_signature method
    # No longer needed - we trust Claude's summary row detection completely
    
    def _filter_summary_rows(self, groups: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Filter out summary rows using either context-aware LLM detection or pattern-based detection.
        
        If context-aware detection is enabled, uses Claude's intelligent understanding of table
        structure and relationships. Otherwise, falls back to pattern-based filtering.
        
        This is a critical safety net to catch any summary rows that Claude
        might have included despite prompt instructions.
        """
        if not groups:
            return groups
        
        # Use context-aware detection if enabled and available
        if self.use_context_aware_detection and self.context_aware_service:
            try:
                return self._filter_summary_rows_context_aware(groups)
            except Exception as e:
                logger.warning(f"⚠️ Context-aware filtering failed: {e}. Falling back to pattern-based detection.")
                # Fall through to pattern-based detection
        
        # Pattern-based detection (legacy/fallback)
        return self._filter_summary_rows_pattern_based(groups)
    
    def _filter_summary_rows_context_aware(self, groups: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Context-aware summary row filtering using LLM intelligence.
        
        This method converts groups to table format, uses Claude to intelligently identify
        summary rows based on context and patterns, then filters accordingly.
        
        Args:
            groups: List of group dictionaries
            
        Returns:
            Filtered list with summary rows removed
        """
        if not groups:
            return groups
        
        logger.info(f"🧠 Using context-aware LLM detection for {len(groups)} groups")
        
        # Convert groups to table format for analysis
        table_text = self._convert_groups_to_table_text(groups)
        
        # Extract document context if available
        document_context = "Commission statement with group/company data"
        
        # Use context-aware service to classify rows
        # Use combined prompt for speed (single-pass)
        result = self.context_aware_service.extract_with_context(
            table_text=table_text,
            document_context=document_context,
            document_total=None,
            use_combined_prompt=True  # Faster for this use case
        )
        
        # Get summary row indices identified by Claude
        summary_row_indices = set(result.get('summary_rows', []))
        
        if summary_row_indices:
            logger.info(f"🔍 Context-aware detection identified {len(summary_row_indices)} summary rows: {sorted(summary_row_indices)}")
        
        # Filter out summary rows
        filtered_groups = [
            group for idx, group in enumerate(groups)
            if idx not in summary_row_indices
        ]
        
        # Log filtering results
        filtered_count = len(groups) - len(filtered_groups)
        if filtered_count > 0:
            logger.info(f"✅ Context-aware filtering: {len(groups)} → {len(filtered_groups)} groups (removed {filtered_count} summary rows)")
            
            # Log what was filtered for debugging
            for idx in sorted(summary_row_indices):
                if idx < len(groups):
                    group = groups[idx]
                    logger.debug(
                        f"   FILTERED (Context-Aware): {group.get('group_number', 'N/A')} - "
                        f"{group.get('group_name', '') or group.get('company_name', 'N/A')}"
                    )
        else:
            logger.info(f"✅ Context-aware filtering: All {len(groups)} groups passed (no summary rows detected)")
        
        # Apply duplicate detection as additional safety
        unique_filtered_groups = self._remove_duplicate_companies(filtered_groups)
        
        return unique_filtered_groups
    
    def _filter_summary_rows_pattern_based(self, groups: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Pattern-based summary row filtering (legacy method).
        
        Uses hard-coded rules and patterns to identify summary rows.
        This is the fallback when context-aware detection is not available.
        
        Args:
            groups: List of group dictionaries
            
        Returns:
            Filtered list with summary rows removed
        """
        logger.info(f"🔧 Using pattern-based detection for {len(groups)} groups")
        
        # Use unified filtering method (pattern-based)
        filtered_groups, excluded_groups = ExtractionRules.Filtering.filter_groups(groups)
        
        # Log filtering results from pattern-based filtering
        pattern_filtered_count = len(excluded_groups)
        if pattern_filtered_count > 0:
            logger.info(f"✅ Pattern-based filtering: Filtered out {pattern_filtered_count} summary/total rows from {len(groups)} total")
            # Log what was filtered for debugging
            for excluded in excluded_groups:
                logger.debug(f"   FILTERED (Pattern): {excluded.get('group_number', 'N/A')} - {excluded.get('group_name', 'N/A')} - Reason: {excluded.get('reason', 'Unknown')}")
        
        # Apply duplicate detection
        unique_filtered_groups = self._remove_duplicate_companies(filtered_groups)
        
        total_filtered = len(groups) - len(unique_filtered_groups)
        if total_filtered > 0:
            logger.info(
                f"✅ Pattern-based filtering complete: "
                f"{len(groups)} → {len(unique_filtered_groups)} groups "
                f"(removed {total_filtered} summary/duplicate rows)"
            )
        else:
            logger.info(f"✅ Pattern-based filtering: All {len(groups)} groups passed (no summary rows detected)")
        
        return unique_filtered_groups
    
    def _remove_duplicate_companies(self, groups: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Remove duplicate company names (summary rows often duplicate).
        
        Args:
            groups: List of group dictionaries
            
        Returns:
            List with duplicates removed
        """
        unique_filtered_groups = []
        seen_company_names = set()
        duplicate_count = 0
        
        for group in groups:
            company_name = group.get('company_name', '') or group.get('group_name', '')
            
            # Skip if we've already seen this exact company name
            if company_name and company_name in seen_company_names:
                logger.debug(
                    f"   FILTERED (Duplicate): {group.get('group_number', 'N/A')} - {company_name} "
                    f"(already in filtered list - likely summary row)"
                )
                duplicate_count += 1
                continue
            
            if company_name:
                seen_company_names.add(company_name)
            
            unique_filtered_groups.append(group)
        
        if duplicate_count > 0:
            logger.info(f"✅ Removed {duplicate_count} duplicate company entries")
        
        return unique_filtered_groups
    
    def _convert_groups_to_table_text(self, groups: List[Dict[str, Any]]) -> str:
        """
        Convert groups to table text format for context-aware analysis.
        
        Args:
            groups: List of group dictionaries
            
        Returns:
            Table text representation
        """
        if not groups:
            return ""
        
        # Build table with common fields
        lines = []
        
        # Header
        lines.append("Group Number | Group/Company Name | Paid Amount")
        lines.append("-" * 80)
        
        # Rows
        for group in groups:
            group_no = group.get('group_number', '') or ''
            group_name = group.get('group_name', '') or group.get('company_name', '') or ''
            paid_amount = group.get('paid_amount', '') or ''
            
            lines.append(f"{group_no} | {group_name} | {paid_amount}")
        
        return "\n".join(lines)
    
    def _extract_document_metadata(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Extract document metadata"""
        # Try enhanced extraction first
        if 'document_metadata' in data and isinstance(data['document_metadata'], dict):
            enhanced_meta = data['document_metadata']
            if 'statement_date' in enhanced_meta:
                return enhanced_meta
        
        # Fallback to standard extraction
        doc_metadata = data.get('document_metadata', {})
        return {
            'statement_date': doc_metadata.get('statement_date', 'Unknown'),
            'statement_number': doc_metadata.get('statement_number'),
            'payment_type': doc_metadata.get('payment_type'),
            'confidence': doc_metadata.get('date_confidence', 0.8)
        }
    
    def _map_entity_relationships(
        self,
        entities: Dict[str, Any],
        extraction_source: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Map relationships between extracted entities.
        
        Creates a graph of: Carrier → Broker → Agents → Groups → Payments
        """
        relationships = {
            'carrier_to_broker': {},
            'broker_to_agents': [],
            'agents_to_groups': [],
            'groups_to_payments': []
        }
        
        # Carrier → Broker relationship
        relationships['carrier_to_broker'] = {
            'carrier': entities.get('carrier', {}).get('name', 'Unknown'),
            'broker': entities.get('broker', {}).get('company_name', 'Unknown'),
            'relationship': 'issues_commission_to'
        }
        
        # Broker → Agents relationship
        writing_agents = entities.get('writing_agents', [])
        for agent in writing_agents:
            relationships['broker_to_agents'].append({
                'broker': entities.get('broker', {}).get('company_name', 'Unknown'),
                'agent': agent.get('agent_name', 'Unknown'),
                'role': agent.get('role', 'Agent'),
                'relationship': 'employs'
            })
        
        # Agents → Groups relationship (map which agent manages which groups)
        groups = entities.get('groups_and_companies', [])
        for group in groups:
            # Try to find which agent manages this group
            managing_agent = group.get('writing_agent', 'Unknown')
            
            relationships['agents_to_groups'].append({
                'agent': managing_agent,
                'group': group.get('group_name', 'Unknown'),
                'relationship': 'manages'
            })
        
        # Groups → Payments relationship
        for group in groups:
            relationships['groups_to_payments'].append({
                'group': group.get('group_name', 'Unknown'),
                'amount': group.get('paid_amount', '$0.00'),
                'relationship': 'generates_commission'
            })
        
        return relationships
    
    def _extract_business_intelligence(
        self,
        entities: Dict[str, Any],
        relationships: Dict[str, Any],
        extraction_source: Dict[str, Any],
        raw_extraction: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Extract business intelligence and patterns.
        
        Analyzes:
        - Total commission amounts
        - Top contributors
        - Commission structures
        - Payment patterns
        - Anomalies and special payments
        """
        # Check if business intelligence already extracted
        if 'business_intelligence' in extraction_source:
            return extraction_source['business_intelligence']
        
        # Calculate from raw data
        business_intel = {
            'total_commission_amount': 'Not specified',
            'number_of_groups': 0,
            'commission_structures': [],
            'top_contributors': [],
            'special_payments': [],
            'payment_period': '',
            'patterns_detected': []
        }
        
        # Extract from tables
        tables = raw_extraction.get('tables', [])
        groups = entities.get('groups_and_companies', [])
        
        # Number of groups
        business_intel['number_of_groups'] = len(groups)
        
        # Calculate total commission
        total = self._calculate_total_commission(tables)
        if total:
            business_intel['total_commission_amount'] = total
        
        # Find top contributors
        top_contributors = self._find_top_contributors(groups, limit=3)
        business_intel['top_contributors'] = top_contributors
        
        # Detect commission structures
        structures = self._detect_commission_structures(tables)
        business_intel['commission_structures'] = structures
        
        # Detect patterns
        patterns = self._detect_patterns(entities, relationships, tables)
        business_intel['patterns_detected'] = patterns
        
        return business_intel
    
    def _calculate_total_commission(self, tables: List[Dict]) -> str:
        """Calculate total commission from tables"""
        for table in tables:
            rows = table.get('rows', [])
            summary_rows = table.get('summaryRows', []) or table.get('summary_rows', [])
            
            # Look for total rows
            for row_idx in summary_rows:
                if row_idx < len(rows):
                    row = rows[row_idx]
                    for cell in row:
                        cell_str = str(cell)
                        if '$' in cell_str and any(c.isdigit() for c in cell_str):
                            return cell_str.strip()
        
        return "Not specified"
    
    def _find_top_contributors(
        self,
        groups: List[Dict],
        limit: int = 3
    ) -> List[Dict[str, str]]:
        """Find top contributing groups by commission amount"""
        # Parse amounts and sort
        group_amounts = []
        
        for group in groups:
            amount_str = group.get('paid_amount', '$0')
            if amount_str and '$' in str(amount_str):
                try:
                    # Parse dollar amount
                    amount_clean = str(amount_str).replace('$', '').replace(',', '').strip()
                    amount_float = float(amount_clean)
                    group_amounts.append({
                        'name': group.get('group_name', 'Unknown'),
                        'amount': amount_str,
                        'amount_float': amount_float
                    })
                except ValueError:
                    continue
        
        # Sort by amount descending
        group_amounts.sort(key=lambda x: x['amount_float'], reverse=True)
        
        # Return top N
        return [
            {'name': g['name'], 'amount': g['amount']}
            for g in group_amounts[:limit]
        ]
    
    def _detect_commission_structures(self, tables: List[Dict]) -> List[str]:
        """Detect types of commission structures used"""
        structures = set()
        
        for table in tables:
            headers = table.get('headers', []) or table.get('header', [])
            rows = table.get('rows', [])
            
            # Look for structure indicators in headers and data
            all_text = ' '.join(str(h) for h in headers)
            all_text += ' '.join(' '.join(str(cell) for cell in row) for row in rows)
            all_text_lower = all_text.lower()
            
            if 'pepm' in all_text_lower or 'per employee per month' in all_text_lower:
                structures.add('PEPM')
            if '%' in all_text or 'percent' in all_text_lower:
                structures.add('Percentage-based')
            if 'premium equivalent' in all_text_lower:
                structures.add('Premium Equivalent')
            if 'flat' in all_text_lower or 'lump sum' in all_text_lower:
                structures.add('Flat rates')
            if 'tiered' in all_text_lower or 'tier' in all_text_lower:
                structures.add('Tiered')
        
        return list(structures) if structures else ['Standard']
    
    def _detect_patterns(
        self,
        entities: Dict[str, Any],
        relationships: Dict[str, Any],
        tables: List[Dict]
    ) -> List[str]:
        """Detect business patterns and notable characteristics"""
        patterns = []
        
        # Check for multiple writing agents
        writing_agents = entities.get('writing_agents', [])
        if len(writing_agents) > 1:
            patterns.append(f"Multiple writing agents ({len(writing_agents)} total)")
        elif len(writing_agents) == 1:
            patterns.append("Single writing agent managing all groups")
        
        # Check for group distribution
        groups = entities.get('groups_and_companies', [])
        if len(groups) > 10:
            patterns.append(f"Large portfolio with {len(groups)} groups")
        
        # Check for special payments/adjustments
        for table in tables:
            rows = table.get('rows', [])
            for row in rows:
                row_text = ' '.join(str(cell) for cell in row).lower()
                if 'bonus' in row_text or 'incentive' in row_text:
                    patterns.append("Includes bonus or incentive payments")
                    break
                if 'adjustment' in row_text or 'correction' in row_text:
                    patterns.append("Contains adjustments or corrections")
                    break
        
        return patterns if patterns else ["Standard commission structure"]

