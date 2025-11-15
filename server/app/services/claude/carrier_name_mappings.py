"""
Carrier Name Standardization - Single Source of Truth

Maps all known carrier name variations to their canonical full names.
This solves the "Allied" vs "Allied Benefit Systems" duplication problem.
"""


class CarrierNameStandardizer:
    """
    Standardizes carrier names to prevent duplicate carrier entries.
    """
    
    # Canonical carrier names (use these for database storage)
    CARRIER_MAPPINGS = {
        # Allied Benefit Systems variations
        "allied": "Allied Benefit Systems",
        "allied benefit": "Allied Benefit Systems",
        "allied benefit systems": "Allied Benefit Systems",
        "absf": "Allied Benefit Systems",
        
        # UnitedHealthcare variations
        "united healthcare": "UnitedHealthcare",
        "unitedhealthcare": "UnitedHealthcare",
        "uhc": "UnitedHealthcare",
        "united health group": "UnitedHealthcare",
        "unitedhealth": "UnitedHealthcare",
        
        # Blue Cross Blue Shield variations
        "blue cross blue shield": "Blue Cross Blue Shield",
        "bcbs": "Blue Cross Blue Shield",
        "blue cross": "Blue Cross Blue Shield",
        
        # Aetna variations
        "aetna": "Aetna",
        "aetna inc": "Aetna",
        
        # Cigna variations
        "cigna": "Cigna",
        "cigna health": "Cigna",
        
        # Humana variations
        "humana": "Humana",
        "humana inc": "Humana",
        
        # Add more carriers as you encounter them
    }
    
    @classmethod
    def standardize(cls, carrier_name: str) -> str:
        """
        Standardize a carrier name to its canonical form.
        
        Args:
            carrier_name: Raw extracted carrier name
            
        Returns:
            Standardized carrier name
        """
        if not carrier_name:
            return carrier_name
        
        # Normalize: lowercase, strip whitespace
        normalized = carrier_name.lower().strip()
        
        # Remove common suffixes that don't affect identity
        normalized = normalized.replace(" llc", "").replace(" inc", "").replace(" inc.", "")
        normalized = normalized.replace(" corporation", "").replace(" corp", "")
        normalized = normalized.strip()
        
        # Look up in mappings
        standardized = cls.CARRIER_MAPPINGS.get(normalized)
        
        if standardized:
            return standardized
        
        # If not found, return original with proper casing
        return carrier_name.strip()
    
    @classmethod
    def add_mapping(cls, variation: str, canonical: str):
        """
        Add a new carrier name variation mapping.
        
        Args:
            variation: Variation of carrier name found in documents
            canonical: The canonical full name to use
        """
        cls.CARRIER_MAPPINGS[variation.lower().strip()] = canonical

