"""
GPT-specific prompts for PDF table extraction with carrier-specific rules.

This module contains sophisticated prompts optimized for GPT's document analysis capabilities.
Uses the same carrier-specific prompts as Claude for consistency.
"""

from ..claude.uhc import get_uhc_prompt
from ..claude.redirect_health import get_redirect_health_prompt

PROMPT_TEMPLATES = [
    {
        "name": "UnitedHealthcare",
        "configuration": get_uhc_prompt()
    },
    {
        "name": "United Healthcare",
        "configuration": get_uhc_prompt()
    },
    {
        "name": "UHC",
        "configuration": get_uhc_prompt()
    },
    {
        "name": "United Health Group",
        "configuration": get_uhc_prompt()
    },
    {
        "name": "UnitedHealth",
        "configuration": get_uhc_prompt()
    },
    {
        "name": "Redirect Health",
        "configuration": get_redirect_health_prompt()
    }
]


class GPTDynamicPrompts:
    """Prompts for GPT Document AI extraction"""
    
    @staticmethod
    def get_prompt_by_name(name: str) -> str:
        """Get configuration (prompt) for a specific template by name"""
        import logging
        logger = logging.getLogger(__name__)
        
        # Handle None or empty carrier name
        if not name:
            logger.info("No carrier name provided, using standard prompt only")
            return ""
        
        # Normalize the input name: remove spaces, convert to lowercase
        normalized_input = name.replace(" ", "").replace("-", "").lower()
        logger.info(f"🔍 GPT: Looking up carrier prompt: '{name}' → normalized: '{normalized_input}'")
        
        for template in PROMPT_TEMPLATES:
            # Normalize template name for comparison
            normalized_template = template["name"].replace(" ", "").replace("-", "").lower()
            logger.info(f"   Comparing with template: '{template['name']}' → normalized: '{normalized_template}'")
            if normalized_template == normalized_input:
                logger.info(f"✅ MATCH FOUND! Using carrier-specific prompt for: {name}")
                return template["configuration"]
        
        # No matching carrier-specific prompt found - return empty string
        logger.info(f"❌ No carrier-specific prompt found for '{name}', using standard prompt only")
        logger.info(f"   Available carriers: {[t['name'] for t in PROMPT_TEMPLATES]}")
        return ""

