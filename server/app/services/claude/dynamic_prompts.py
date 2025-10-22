"""
Claude-specific prompts for PDF table extraction.

This module contains sophisticated prompts optimized for Claude's document analysis capabilities.
"""

from .uhc import get_uhc_prompt

PROMPT_TEMPLATES = [
    {
        "name": "UnitedHealthcare",
        "configuration": get_uhc_prompt()
    }
]


class ClaudeDynamicPrompts:
    """Prompts for Claude Document AI extraction"""
    
    @staticmethod
    def get_prompt_by_name(name: str) -> str:
        """Get configuration (prompt) for a specific template by name"""
        # Normalize the input name: remove spaces, convert to lowercase
        normalized_input = name.replace(" ", "").replace("-", "").lower()
        
        for template in PROMPT_TEMPLATES:
            # Normalize template name for comparison
            normalized_template = template["name"].replace(" ", "").replace("-", "").lower()
            if normalized_template == normalized_input:
                return template["configuration"]
        return None