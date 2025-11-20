"""
Circuit Breaker Pattern for API Failure Management

Prevents cascading failures by:
- Opening circuit after N consecutive failures
- Fast-failing subsequent requests during cooldown
- Auto-recovery with half-open state testing
"""

import time
import logging
from typing import Any, Callable, Optional
from functools import wraps

logger = logging.getLogger(__name__)


class CircuitBreakerOpenError(Exception):
    """Raised when circuit breaker is open and blocking requests."""
    pass


class CircuitBreaker:
    """
    Circuit breaker to prevent cascading API failures.
    
    States:
    - CLOSED: Normal operation, requests pass through
    - OPEN: Failure threshold reached, blocking all requests
    - HALF_OPEN: Testing if service recovered
    
    Args:
        failure_threshold: Number of failures before opening circuit
        timeout: Seconds to wait before attempting reset
        success_threshold: Successes needed in HALF_OPEN to close circuit
    """
    
    def __init__(
        self,
        failure_threshold: int = 3,
        timeout: int = 60,
        success_threshold: int = 2
    ):
        self.failure_threshold = failure_threshold
        self.timeout = timeout
        self.success_threshold = success_threshold
        
        self.failure_count = 0
        self.success_count = 0
        self.last_failure_time: Optional[float] = None
        self.state = "CLOSED"  # CLOSED, OPEN, HALF_OPEN
        
        logger.info(
            f"🔌 Circuit breaker initialized: "
            f"threshold={failure_threshold}, timeout={timeout}s"
        )
    
    async def call(self, func: Callable, *args, **kwargs) -> Any:
        """
        Execute function through circuit breaker.
        
        Args:
            func: Async function to execute
            *args, **kwargs: Arguments to pass to function
            
        Returns:
            Result from function call
            
        Raises:
            CircuitBreakerOpenError: If circuit is open
            Exception: Original exception from function if circuit allows
        """
        
        # Check if we should attempt reset
        if self.state == "OPEN":
            if self._should_attempt_reset():
                self.state = "HALF_OPEN"
                self.success_count = 0
                logger.info("🔄 Circuit breaker entering HALF_OPEN state (testing recovery)")
            else:
                time_remaining = self._time_until_reset()
                raise CircuitBreakerOpenError(
                    f"Circuit breaker is OPEN due to repeated failures. "
                    f"Retry in {time_remaining}s. "
                    f"This prevents wasting resources on failing API endpoint."
                )
        
        # Attempt the call
        try:
            result = await func(*args, **kwargs)
            self._on_success()
            return result
            
        except Exception as e:
            self._on_failure(e)
            raise
    
    def _on_success(self):
        """Handle successful call."""
        
        if self.state == "HALF_OPEN":
            self.success_count += 1
            
            if self.success_count >= self.success_threshold:
                # Recovered! Close circuit
                self.state = "CLOSED"
                self.failure_count = 0
                logger.info(
                    f"✅ Circuit breaker CLOSED - service recovered "
                    f"({self.success_count} successful requests)"
                )
        
        elif self.state == "CLOSED":
            # Reset failure count on success in normal operation
            self.failure_count = 0
    
    def _on_failure(self, error: Exception):
        """Handle failed call."""
        
        self.failure_count += 1
        self.last_failure_time = time.time()
        
        error_msg = str(error)[:100]
        
        if self.state == "HALF_OPEN":
            # Failed during recovery - reopen circuit
            self.state = "OPEN"
            logger.error(
                f"⛔ Circuit breaker reopened OPEN - recovery failed "
                f"(error: {error_msg})"
            )
        
        elif self.failure_count >= self.failure_threshold:
            # Threshold reached - open circuit
            self.state = "OPEN"
            logger.error(
                f"⛔ Circuit breaker opened OPEN - {self.failure_count} consecutive failures "
                f"(last error: {error_msg})"
            )
    
    def _should_attempt_reset(self) -> bool:
        """Check if enough time has passed to attempt reset."""
        if self.last_failure_time is None:
            return True
        
        elapsed = time.time() - self.last_failure_time
        return elapsed >= self.timeout
    
    def _time_until_reset(self) -> int:
        """Calculate seconds until reset attempt."""
        if self.last_failure_time is None:
            return 0
        
        elapsed = time.time() - self.last_failure_time
        remaining = max(0, self.timeout - elapsed)
        return int(remaining)
    
    def reset(self):
        """Manually reset circuit breaker."""
        self.state = "CLOSED"
        self.failure_count = 0
        self.success_count = 0
        self.last_failure_time = None
        logger.info("🔄 Circuit breaker manually reset to CLOSED")
    
    def get_state(self) -> dict:
        """Get current circuit breaker state for monitoring."""
        return {
            "state": self.state,
            "failure_count": self.failure_count,
            "success_count": self.success_count,
            "time_until_reset": self._time_until_reset() if self.state == "OPEN" else None
        }

