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
"""

import logging
from typing import Dict, Any, List, Optional
import json

logger = logging.getLogger(__name__)


class SemanticExtractionService:
    """
    Semantic entity extraction and relationship mapping service.
    
    Transforms raw extraction data into intelligent business relationships
    and patterns.
    """
    
    def __init__(self):
        """Initialize semantic extraction service"""
        logger.info("✅ Semantic Extraction Service initialized")
    
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
        """Extract group/company information"""
        # Try enhanced extraction first
        if 'groups_and_companies' in data and isinstance(data['groups_and_companies'], list):
            return data['groups_and_companies']
        
        # Extract from tables
        groups = []
        tables = data.get('tables', [])
        
        for table in tables:
            headers = table.get('headers', []) or table.get('header', [])
            rows = table.get('rows', [])
            
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
                for row in rows:
                    if group_name_idx < len(row):
                        group_name = str(row[group_name_idx]).strip()
                        
                        # Skip empty rows
                        if not group_name:
                            continue
                        
                        # Skip metadata rows (Writing Agent, Total, etc.)
                        skip_keywords = ['total', 'subtotal', 'grand', 'writing agent', 'agent number', 'agent name', 'agent 2']
                        if any(kw in group_name.lower() for kw in skip_keywords):
                            continue
                        
                        # Require a group number to be valid (if group_no column exists)
                        if group_no_idx is not None:
                            group_no = str(row[group_no_idx]).strip() if group_no_idx < len(row) else ''
                            if not group_no:
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

