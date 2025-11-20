"""
Retry logic with exponential backoff for GPT-5 API calls.

Handles:
- Rate limits (429 errors)
- Transient failures (500, 502, 503, 504)
- Network timeouts
- API availability issues
- Circuit breaker coordination
"""

import time
import random
import logging
import json
from typing import Callable, Any, Optional, List
from functools import wraps
from openai import OpenAIError, RateLimitError, APIError, APIConnectionError, APITimeoutError

logger = logging.getLogger(__name__)


class RetryConfig:
    """Configuration for retry behavior."""
    
    def __init__(
        self,
        max_retries: int = 3,
        base_delay: float = 1.0,
        max_delay: float = 60.0,
        exponential_base: float = 2.0,
        jitter: bool = True
    ):
        self.max_retries = max_retries
        self.base_delay = base_delay
        self.max_delay = max_delay
        self.exponential_base = exponential_base
        self.jitter = jitter


class RetryHandler:
    """
    Handles retry logic with exponential backoff for API calls.
    
    Features:
    - Exponential backoff with jitter
    - Configurable retry count and delays
    - Specific handling for different error types
    - Detailed logging of retry attempts
    """
    
    def __init__(self, config: Optional[RetryConfig] = None):
        self.config = config or RetryConfig()
    
    def should_retry(self, error: Exception) -> bool:
        """
        Determine if error is retryable.
        
        Args:
            error: Exception that occurred
        
        Returns:
            True if should retry, False otherwise
        """
        # CRITICAL: Never retry circuit breaker errors
        error_type_name = type(error).__name__
        if error_type_name == "CircuitBreakerOpenError":
            logger.info("🚫 Circuit breaker open - not retrying")
            return False
        
        # Don't retry JSON decode errors (handled at extraction level)
        if isinstance(error, json.JSONDecodeError):
            logger.info(f"🚫 JSON decode error not retryable: {error}")
            return False
        
        # Don't retry ValueError (often indicates empty/invalid responses)
        if isinstance(error, ValueError):
            error_msg = str(error).lower()
            if any(keyword in error_msg for keyword in ['empty', 'invalid json', 'non-json', 'refused']):
                logger.info(f"🚫 Value error not retryable: {error}")
                return False
        
        # Always retry rate limits
        if isinstance(error, RateLimitError):
            return True
        
        # Retry API errors with specific status codes
        if isinstance(error, APIError):
            if hasattr(error, 'status_code'):
                # Retry on server errors (500-599)
                return 500 <= error.status_code < 600
        
        # Retry connection and timeout errors
        if isinstance(error, (APIConnectionError, APITimeoutError)):
            return True
        
        # Don't retry other errors
        return False
    
    def calculate_delay(self, attempt: int) -> float:
        """
        Calculate delay before next retry.
        
        Args:
            attempt: Current attempt number (0-indexed)
        
        Returns:
            Delay in seconds
        """
        # Calculate exponential delay
        delay = self.config.base_delay * (self.config.exponential_base ** attempt)
        
        # Cap at max delay
        delay = min(delay, self.config.max_delay)
        
        # Add jitter to prevent thundering herd
        if self.config.jitter:
            jitter = random.uniform(0, delay * 0.1)
            delay += jitter
        
        return delay
    
    def execute_with_retry(
        self,
        func: Callable,
        *args,
        **kwargs
    ) -> Any:
        """
        Execute function with retry logic.
        
        Args:
            func: Function to execute
            *args: Positional arguments for function
            **kwargs: Keyword arguments for function
        
        Returns:
            Function result
        
        Raises:
            Exception: If all retries exhausted
        """
        last_error = None
        
        for attempt in range(self.config.max_retries + 1):
            try:
                result = func(*args, **kwargs)
                
                # Log successful retry
                if attempt > 0:
                    logger.info(f"✅ Retry successful after {attempt} attempt(s)")
                
                return result
                
            except Exception as e:
                last_error = e
                
                # Check if we should retry
                if not self.should_retry(e):
                    logger.error(f"❌ Non-retryable error: {e}")
                    raise
                
                # Check if we have retries left
                if attempt >= self.config.max_retries:
                    logger.error(f"❌ Max retries ({self.config.max_retries}) exceeded: {e}")
                    raise
                
                # Calculate delay
                delay = self.calculate_delay(attempt)
                
                # Log retry attempt
                logger.warning(
                    f"⚠️ Attempt {attempt + 1}/{self.config.max_retries + 1} failed: {e}. "
                    f"Retrying in {delay:.2f}s..."
                )
                
                # Wait before retry
                time.sleep(delay)
        
        # Should never reach here, but just in case
        if last_error:
            raise last_error


def retry_with_backoff(
    max_retries: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 60.0,
    exponential_base: float = 2.0,
    jitter: bool = True
):
    """
    Decorator for automatic retry with exponential backoff.
    
    Usage:
        @retry_with_backoff(max_retries=3, base_delay=2.0)
        def my_api_call():
            return client.chat.completions.create(...)
    
    Args:
        max_retries: Maximum number of retry attempts
        base_delay: Initial delay in seconds
        max_delay: Maximum delay in seconds
        exponential_base: Multiplier for exponential backoff
        jitter: Add random jitter to prevent thundering herd
    
    Returns:
        Decorated function with retry logic
    """
    config = RetryConfig(
        max_retries=max_retries,
        base_delay=base_delay,
        max_delay=max_delay,
        exponential_base=exponential_base,
        jitter=jitter
    )
    handler = RetryHandler(config)
    
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs):
            return handler.execute_with_retry(func, *args, **kwargs)
        return wrapper
    
    return decorator


class RateLimitMonitor:
    """
    Monitor and enforce rate limits to prevent 429 errors.
    
    Tracks request timestamps and blocks when approaching limits.
    Now supports both sync and async usage with token bucket algorithm.
    """
    
    def __init__(
        self,
        requests_per_minute: int = 3000,
        tokens_per_minute: int = 1_000_000
    ):
        # Use 90% of limits as safety buffer
        self.requests_per_minute = int(requests_per_minute * 0.9)
        self.tokens_per_minute = int(tokens_per_minute * 0.9)
        
        # Token bucket tracking
        self.request_count = 0
        self.token_count = 0
        self.window_start = time.time()
        
        # Old tracking for backward compatibility
        self.request_timestamps: List[float] = []
        self.token_counts: List[tuple] = []  # (timestamp, token_count)
        
        logger.info(f"🔧 Rate limiter initialized: {self.requests_per_minute} RPM, {self.tokens_per_minute:,} TPM")
    
    def can_make_request(self, estimated_tokens: int = 0) -> bool:
        """
        Check if we're within rate limits.
        
        Args:
            estimated_tokens: Estimated tokens for this request
        
        Returns:
            True if within limits, False otherwise
        """
        now = time.time()
        one_minute_ago = now - 60
        
        # Clean old timestamps
        self.request_timestamps = [
            ts for ts in self.request_timestamps 
            if ts > one_minute_ago
        ]
        self.token_counts = [
            (ts, count) for ts, count in self.token_counts
            if ts > one_minute_ago
        ]
        
        # Check request limit
        if len(self.request_timestamps) >= self.requests_per_minute:
            return False
        
        # Check token limit
        current_tokens = sum(count for _, count in self.token_counts)
        if current_tokens + estimated_tokens > self.tokens_per_minute:
            return False
        
        return True
    
    def record_request(self, tokens_used: int = 0):
        """
        Record a request and its token usage.
        
        Args:
            tokens_used: Number of tokens used in this request
        """
        now = time.time()
        self.request_timestamps.append(now)
        if tokens_used > 0:
            self.token_counts.append((now, tokens_used))
    
    def wait_if_needed(self, estimated_tokens: int = 0) -> float:
        """
        Wait if necessary to stay within rate limits (synchronous version).
        
        Uses token bucket algorithm for proactive rate limit prevention.
        
        Args:
            estimated_tokens: Estimated tokens for next request
        
        Returns:
            Time waited in seconds
        """
        current_time = time.time()
        elapsed = current_time - self.window_start
        
        # Reset window if 60 seconds passed
        if elapsed >= 60:
            self.request_count = 0
            self.token_count = 0
            self.window_start = current_time
            elapsed = 0
            logger.debug("✅ Rate limit window reset")
        
        # Check if adding this request would exceed limits
        requests_ok = self.request_count < self.requests_per_minute
        tokens_ok = (self.token_count + estimated_tokens) <= self.tokens_per_minute
        
        if requests_ok and tokens_ok:
            # Reserve capacity
            self.request_count += 1
            self.token_count += estimated_tokens
            
            logger.debug(
                f"✅ Rate limit OK - "
                f"RPM: {self.request_count}/{self.requests_per_minute}, "
                f"TPM: {self.token_count:,}/{self.tokens_per_minute:,}"
            )
            
            return 0.0
        
        # Need to wait for window reset
        wait_time = 60 - elapsed
        
        logger.warning(
            f"⏳ Rate limit approaching - waiting {wait_time:.1f}s for reset. "
            f"RPM: {self.request_count}/{self.requests_per_minute}, "
            f"TPM: {self.token_count:,}/{self.tokens_per_minute:,}"
        )
        
        time.sleep(wait_time)
        
        # Reset after wait
        self.request_count = 1
        self.token_count = estimated_tokens
        self.window_start = time.time()
        
        return wait_time
    
    async def wait_if_needed_async(self, estimated_tokens: int = 0) -> float:
        """
        Async version: Wait if necessary to stay within rate limits.
        
        Uses token bucket algorithm for proactive rate limit prevention.
        This is the async version that should be used in async contexts.
        
        Args:
            estimated_tokens: Estimated tokens for next request
        
        Returns:
            Time waited in seconds
        """
        import asyncio
        
        current_time = time.time()
        elapsed = current_time - self.window_start
        
        # Reset window if 60 seconds passed
        if elapsed >= 60:
            self.request_count = 0
            self.token_count = 0
            self.window_start = current_time
            elapsed = 0
            logger.debug("✅ Rate limit window reset")
        
        # Check if adding this request would exceed limits
        requests_ok = self.request_count < self.requests_per_minute
        tokens_ok = (self.token_count + estimated_tokens) <= self.tokens_per_minute
        
        if requests_ok and tokens_ok:
            # Reserve capacity
            self.request_count += 1
            self.token_count += estimated_tokens
            
            logger.debug(
                f"✅ Rate limit OK - "
                f"RPM: {self.request_count}/{self.requests_per_minute}, "
                f"TPM: {self.token_count:,}/{self.tokens_per_minute:,}"
            )
            
            return 0.0
        
        # Need to wait for window reset
        wait_time = 60 - elapsed
        
        logger.warning(
            f"⏳ Rate limit approaching - waiting {wait_time:.1f}s for reset. "
            f"RPM: {self.request_count}/{self.requests_per_minute}, "
            f"TPM: {self.token_count:,}/{self.tokens_per_minute:,}"
        )
        
        await asyncio.sleep(wait_time)
        
        # Reset after wait
        self.request_count = 1
        self.token_count = estimated_tokens
        self.window_start = time.time()
        
        return wait_time
    
    def get_current_usage(self) -> dict:
        """Get current rate limit usage."""
        now = time.time()
        one_minute_ago = now - 60
        
        current_requests = len([
            ts for ts in self.request_timestamps 
            if ts > one_minute_ago
        ])
        
        current_tokens = sum(
            count for ts, count in self.token_counts
            if ts > one_minute_ago
        )
        
        return {
            'requests_per_minute': current_requests,
            'requests_limit': self.requests_per_minute,
            'requests_utilization': f"{(current_requests / self.requests_per_minute) * 100:.1f}%",
            'tokens_per_minute': current_tokens,
            'tokens_limit': self.tokens_per_minute,
            'tokens_utilization': f"{(current_tokens / self.tokens_per_minute) * 100:.1f}%"
        }


# Example usage
if __name__ == "__main__":
    # Example 1: Using decorator
    @retry_with_backoff(max_retries=3, base_delay=2.0)
    def simulate_api_call():
        """Simulated API call that might fail."""
        import random
        if random.random() < 0.7:  # 70% failure rate for testing
            raise RateLimitError("Rate limit exceeded")
        return {"success": True}
    
    # Example 2: Using RetryHandler directly
    config = RetryConfig(max_retries=3, base_delay=1.0)
    handler = RetryHandler(config)
    
    def another_api_call():
        return {"data": "success"}
    
    try:
        result = handler.execute_with_retry(another_api_call)
        print(f"Result: {result}")
    except Exception as e:
        print(f"Failed: {e}")
    
    # Example 3: Rate limit monitoring
    monitor = RateLimitMonitor(requests_per_minute=10)
    
    print("\n=== Rate Limit Monitoring ===")
    for i in range(12):
        if monitor.can_make_request():
            monitor.record_request()
            print(f"Request {i+1}: ✅ Allowed")
        else:
            print(f"Request {i+1}: ⛔ Rate limited")
            print(f"Current usage: {monitor.get_current_usage()}")
            break

