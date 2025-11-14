"""
Statement Status Constants

CRITICAL: This module defines which statement statuses are allowed to be persisted to the database.
Only statements that have been fully processed and are ready for user action should be saved.

Rationale:
- Pending/Processing/Failed states are temporary and should NEVER be persisted
- Only finalized states (Approved, NeedsReview) should exist in the database
- This prevents "ghost" records and ensures data integrity
"""

# Valid statuses that can be persisted to the database
STATEMENT_STATUS_APPROVED = 'Approved'
STATEMENT_STATUS_NEEDS_REVIEW = 'needs_review'

# List of all valid persistent statuses
VALID_PERSISTENT_STATUSES = [
    STATEMENT_STATUS_APPROVED,
    STATEMENT_STATUS_NEEDS_REVIEW,
]

# Deprecated/Never save these to database:
# These are transitional states that should only exist in-memory during processing
# STATEMENT_STATUS_PENDING = 'Pending'
# STATEMENT_STATUS_PROCESSING = 'Processing'
# STATEMENT_STATUS_FAILED = 'Failed'
# STATEMENT_STATUS_REJECTED = 'rejected'  # Rejected statements are deleted, not saved


def is_valid_persistent_status(status: str) -> bool:
    """
    Check if a status is valid for persisting to the database.
    
    Args:
        status: The status string to validate
        
    Returns:
        True if the status can be persisted, False otherwise
    """
    return status in VALID_PERSISTENT_STATUSES


def get_status_description(status: str) -> str:
    """
    Get a human-readable description for a status.
    
    Args:
        status: The status to describe
        
    Returns:
        A description of what the status means
    """
    descriptions = {
        STATEMENT_STATUS_APPROVED: "Statement has been approved and is ready for use",
        STATEMENT_STATUS_NEEDS_REVIEW: "Statement needs manual review due to validation mismatch",
    }
    return descriptions.get(status, "Unknown status")

