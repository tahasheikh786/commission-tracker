"""
Claude-specific prompts for PDF table extraction.

This module contains sophisticated prompts optimized for Claude's document analysis capabilities.
"""

PROMPT_TEMPLATES = [
    {
        "name": "United Health Care",
        "columns": "Look for 'UnitedHealthcare', 'UHC', 'United Health', 'United Health Group' in headers, logos, and document branding - often appears with distinctive blue branding",
        "rows": "Extract statement dates with focus on 'Statement Date:', 'Report Date:', 'Commission Summary For:' and handle UHC-specific date formats",
        "cells": "Handle UHC-specific commission structures including tiered rates, stop-loss calculations, and complex benefit calculations with multiple plan types",
        "additional": "UHC statements often have complex hierarchical data with multiple benefit categories, require special handling for regional variations, and use unique table layouts with nested benefit structures"
    },
    {
        "name": "Allied Benefit Systems",
        "columns": "Look for 'Allied Benefit Systems', 'ABSF', 'AlliedBenefit.com' in headers, footers, and logos - often appears at bottom of pages",
        "rows": "Extract commission statement dates with focus on 'Commission Summary For:' headers and period ranges",
        "cells": "Handle complex commission calculations and multi-tier commission structures specific to Allied format",
        "additional": "Allied uses unique table layouts with nested company sections and requires special handling for summary rows"
    },
    {
        "name": "Blue Cross Blue Shield",
        "columns": "Detect 'Blue Cross Blue Shield', 'BCBS', 'Anthem Blue Cross' variations in document headers and branding areas",
        "rows": "Extract statement periods with attention to regional variations (e.g., 'Highmark West', 'Anthem KY')",
        "cells": "Handle BCBS-specific commission structures including stop-loss calculations and tiered commission rates",
        "additional": "BCBS statements often have complex hierarchical data with multiple plan types and require special handling for regional carrier variations"
    }
]


class ClaudeDynamicPrompts:
    """Prompts for Claude Document AI extraction"""
    
    @staticmethod
    def get_prompt_templates() -> list:
        """Get the static array of prompt templates"""
        return PROMPT_TEMPLATES
    
    @staticmethod
    def get_prompt_by_name(name: str) -> dict:
        """Get a specific prompt template by name"""
        for template in PROMPT_TEMPLATES:
            if template["name"] == name:
                return template
        return None
    
    @staticmethod
    def get_columns_by_name(name: str) -> str:
        """Get columns for a specific template by name"""
        template = ClaudePrompts.get_prompt_by_name(name)
        return template["columns"] if template else None
    
    @staticmethod
    def get_rows_by_name(name: str) -> str:
        """Get rows for a specific template by name"""
        template = ClaudePrompts.get_prompt_by_name(name)
        return template["rows"] if template else None
    
    @staticmethod
    def get_cells_by_name(name: str) -> str:
        """Get cells for a specific template by name"""
        template = ClaudePrompts.get_prompt_by_name(name)
        return template["cells"] if template else None
    
    @staticmethod
    def get_additional_by_name(name: str) -> str:
        """Get additional for a specific template by name"""
        template = ClaudePrompts.get_prompt_by_name(name)
        return template["additional"] if template else None
    
    @staticmethod
    def create_dynamic_prompt(template_name: str, custom_context: str = "") -> str:
        """Create a dynamic prompt based on template and custom context"""
        template = ClaudePrompts.get_prompt_by_name(template_name)
        if not template:
            return f"Template '{template_name}' not found"
        
        base_prompt = f"""You are an expert document analyst specializing in insurance commission statements.

TASK: {template['name'].replace('_', ' ').title()}

COLUMNS: {template['columns']}
ROWS: {template['rows']}
CELLS: {template['cells']}
ADDITIONAL: {template['additional']}

{f"CONTEXT: {custom_context}" if custom_context else ""}

Analyze the document and extract data following these specific guidelines."""
        
        return base_prompt