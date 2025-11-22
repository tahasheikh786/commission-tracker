"""
GPT-specific prompts for PDF table extraction with carrier-specific rules.

This module contains sophisticated prompts optimized for GPT's document analysis capabilities.
Uses the same carrier-specific prompts as Claude for consistency.
"""

from typing import List, Optional, Dict, Any

from ..claude.uhc import get_uhc_prompt
from ..claude.redirect_health import get_redirect_health_prompt

PROMPT_TEMPLATES = [
    {
        "name": "UnitedHealthcare",
        "configuration": get_uhc_prompt(),
        "options": {}
    },
    {
        "name": "United Healthcare",
        "configuration": get_uhc_prompt(),
        "options": {}
    },
    {
        "name": "UHC",
        "configuration": get_uhc_prompt(),
        "options": {}
    },
    {
        "name": "United Health Group",
        "configuration": get_uhc_prompt(),
        "options": {}
    },
    {
        "name": "UnitedHealth",
        "configuration": get_uhc_prompt(),
        "options": {}
    },
    {
        "name": "Redirect Health",
        "configuration": get_redirect_health_prompt(),
        "options": {
            "merge_similar_tables": True,
            "summary_keywords": [
                "total",
                "grand total",
                "subtotal",
                "sum",
                "broker total",
                "group invoices total",
                "commission summary"
            ],
            "summary_row_templates": [
                "Group Invoices for Broker Commissions",
                "Group ID / Group Name rollups",
                "Lines that start with 'Total' or end with 'Totals'"
            ],
            "expected_rollups": [
                "Group Total",
                "Group Invoices Total",
                "Commission Amount Total",
                "Allowance Type Total",
                "Grand Total"
            ],
            "numeric_tolerance_bps": 65,
            "row_role_examples": [
                {
                    "label": "GroupSummary",
                    "signature": "Identifier columns blank or show 'Group Total' but dollar columns populated with the sum of above rows."
                },
                {
                    "label": "AllowanceSummary",
                    "signature": "Rows where only the Allowance Type and numeric columns are populated and the numeric values equal the prior block."
                },
                {
                    "label": "CarrierSummary",
                    "signature": "Rows near the end of a table that restate Invoice Amount, Commissionable Amount, and Commission Amount."
                }
            ],
            "domain_notes": "Redirect Health statements bundle 1-2 page tables where writing agent subtotals appear above grand totals. Summary rows frequently blank out the Group ID column but repeat invoice, commissionable, and commission totals."
        }
    }
]

CARRIER_LOGO_HINTS = {
    "breckpoint": {
        "display_name": "breckpoint",
        "logo_description": "Colorful starburst/firework icon with lowercase 'breckpoint' text.",
        "logo_position": "Top-left header next to the commission title.",
        "logo_colors": ["multi-color", "rainbow", "orange/blue/green"],
        "common_mistake": "The following line 'Innovative BPS' is the broker, not the carrier.",
        "validation_hint": "If you see the breckpoint starburst, breckpoint is always the carrier."
    },
    "unitedhealthcare": {
        "display_name": "UnitedHealthcare",
        "logo_description": "Blue/orange text logo often accompanied by a sphere icon.",
        "logo_position": "Top-left or centered above the statement title.",
        "logo_colors": ["blue", "orange"],
        "common_mistake": "Sometimes abbreviated as UHC or United Health Group in headers.",
        "validation_hint": "Any variation of UnitedHealthcare/UHC should map to the UnitedHealthcare carrier."
    },
    "redirecthealth": {
        "display_name": "Redirect Health",
        "logo_description": "Directional arrow or chevron followed by 'Redirect Health'.",
        "logo_position": "Top-center header block.",
        "logo_colors": ["teal", "blue"],
        "common_mistake": "Logo text split across two lines causing partial extraction.",
        "validation_hint": "If arrow/chevron logo is present, Redirect Health is the carrier."
    },
    "alliedbenefitsystems": {
        "display_name": "Allied Benefit Systems",
        "logo_description": "Text logo 'Allied Benefit Systems' or acronym 'ABSF'.",
        "logo_position": "Top-left header.",
        "logo_colors": ["blue", "black"],
        "common_mistake": "Abbreviated as 'Allied' or 'ABS' and confused with broker names.",
        "validation_hint": "Any 'Allied Benefit Systems/ABSF' branding marks the carrier."
    }
}


class GPTDynamicPrompts:
    """Prompts for GPT Document AI extraction"""
    
    @staticmethod
    def _normalize(value: str) -> str:
        return value.replace(" ", "").replace("-", "").lower() if value else ""

    @staticmethod
    def _match_template(name: str) -> Optional[Dict[str, Any]]:
        if not name:
            return None
        normalized_input = GPTDynamicPrompts._normalize(name)
        for template in PROMPT_TEMPLATES:
            normalized_template = GPTDynamicPrompts._normalize(template["name"])
            if normalized_input == normalized_template:
                return template
        return None
    
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
        normalized_input = GPTDynamicPrompts._normalize(name)
        logger.info(f"🔍 GPT: Looking up carrier prompt: '{name}' → normalized: '{normalized_input}'")
        
        template = GPTDynamicPrompts._match_template(name)
        if template:
            logger.info(f"✅ MATCH FOUND! Using carrier-specific prompt for: {template['name']}")
            return template["configuration"]
        
        # No matching carrier-specific prompt found - return empty string
        logger.info(f"❌ No carrier-specific prompt found for '{name}', using standard prompt only")
        logger.info(f"   Available carriers: {[t['name'] for t in PROMPT_TEMPLATES]}")
        return ""

    @staticmethod
    def list_supported_carriers() -> List[str]:
        """Return a list of carrier names that have bespoke prompts."""
        return [template["name"] for template in PROMPT_TEMPLATES]
    
    @staticmethod
    def detect_carrier_in_text(text: str, logger=None) -> Optional[str]:
        """
        Roughly detect a carrier name inside arbitrary text (file names, PDF text, etc.).
        Returns the canonical template name if a match is found.
        """
        if not text:
            return None
        
        normalized_text = GPTDynamicPrompts._normalize(text)
        for template in PROMPT_TEMPLATES:
            normalized_template = GPTDynamicPrompts._normalize(template["name"])
            if normalized_template and normalized_template in normalized_text:
                if logger:
                    logger.info(
                        "🔎 Detected carrier '%s' from contextual text match.",
                        template["name"]
                    )
                return template["name"]
        if logger:
            logger.info("No carrier match detected inside provided text snippet.")
        return None

    @staticmethod
    def resolve_supported_carrier(name: Optional[str]) -> Optional[str]:
        """Return canonical carrier name if a template exists for the provided name."""
        template = GPTDynamicPrompts._match_template(name)
        return template["name"] if template else None

    @staticmethod
    def has_supported_prompt(name: Optional[str]) -> bool:
        return GPTDynamicPrompts.resolve_supported_carrier(name) is not None

    @staticmethod
    def get_prompt_options(name: Optional[str]) -> Dict[str, Any]:
        """Return carrier-specific behavioral options (e.g., table merge hints)."""
        template = GPTDynamicPrompts._match_template(name)
        return template.get("options", {}) if template else {}

    @staticmethod
    def get_carrier_logo_hint(name: Optional[str]) -> str:
        """Return carrier-specific logo extraction hints for the prompt."""
        if not name:
            return ""
        
        normalized_input = GPTDynamicPrompts._normalize(name)
        for carrier_key, hint in CARRIER_LOGO_HINTS.items():
            normalized_key = carrier_key.replace(" ", "")
            if normalized_key in normalized_input or normalized_input in normalized_key:
                colors = ", ".join(hint["logo_colors"])
                return (
                    f"\n\n🔍 CARRIER LOGO HINT for {hint['display_name']}:\n"
                    f"- Logo Description: {hint['logo_description']}\n"
                    f"- Typical Position: {hint['logo_position']}\n"
                    f"- Logo Colors: {colors}\n"
                    f"- ⚠️ Common Mistake: {hint['common_mistake']}\n"
                    f"- ✅ Validation: {hint['validation_hint']}\n"
                )
        
        return ""

