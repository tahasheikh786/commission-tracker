"""
Production monitoring and health checks for GPT-5 Vision service.

Features:
- Service health monitoring
- Token usage tracking
- Cost alerting
- Performance metrics
- Error tracking
- Rate limit monitoring
"""

import logging
import time
import json
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
from collections import deque

from openai import OpenAI

logger = logging.getLogger(__name__)


class ExtractionMonitor:
    """
    Production monitoring for extraction pipeline.
    
    Tracks:
    - Extraction success/failure rates
    - Token usage and costs
    - Processing times
    - Error patterns
    """
    
    def __init__(self, max_history: int = 1000):
        self.metrics = {
            'total_extractions': 0,
            'successful_extractions': 0,
            'failed_extractions': 0,
            'total_pages_processed': 0,
            'total_tokens_used': 0,
            'total_cost_usd': 0.0,
            'total_processing_time': 0.0
        }
        
        # Keep recent extraction history
        self.extraction_history = deque(maxlen=max_history)
        self.error_history = deque(maxlen=max_history)
        
        # Performance tracking
        self.start_time = time.time()
    
    def log_extraction(
        self,
        upload_id: str,
        success: bool,
        pages_processed: int = 0,
        tokens_used: int = 0,
        cost_usd: float = 0.0,
        processing_time: float = 0.0,
        error: Optional[str] = None
    ):
        """
        Log extraction metrics.
        
        Args:
            upload_id: Unique upload identifier
            success: Whether extraction succeeded
            pages_processed: Number of pages processed
            tokens_used: Total tokens used
            cost_usd: Total cost in USD
            processing_time: Processing time in seconds
            error: Error message if failed
        """
        self.metrics['total_extractions'] += 1
        
        if success:
            self.metrics['successful_extractions'] += 1
            self.metrics['total_pages_processed'] += pages_processed
            self.metrics['total_tokens_used'] += tokens_used
            self.metrics['total_cost_usd'] += cost_usd
            self.metrics['total_processing_time'] += processing_time
            
            logger.info(
                f"✅ Extraction success | "
                f"upload_id={upload_id} | "
                f"pages={pages_processed} | "
                f"tokens={tokens_used} | "
                f"cost=${cost_usd:.4f} | "
                f"time={processing_time:.2f}s"
            )
        else:
            self.metrics['failed_extractions'] += 1
            
            logger.error(
                f"❌ Extraction failed | "
                f"upload_id={upload_id} | "
                f"error={error}"
            )
            
            # Track error
            self.error_history.append({
                'timestamp': datetime.now().isoformat(),
                'upload_id': upload_id,
                'error': error
            })
        
        # Record in history
        self.extraction_history.append({
            'timestamp': datetime.now().isoformat(),
            'upload_id': upload_id,
            'success': success,
            'pages_processed': pages_processed,
            'tokens_used': tokens_used,
            'cost_usd': cost_usd,
            'processing_time': processing_time
        })
    
    def get_metrics(self) -> Dict[str, Any]:
        """Get current metrics summary."""
        total = self.metrics['total_extractions']
        successful = self.metrics['successful_extractions']
        
        success_rate = (successful / total * 100) if total > 0 else 0
        avg_cost = (
            self.metrics['total_cost_usd'] / successful 
            if successful > 0 else 0
        )
        avg_time = (
            self.metrics['total_processing_time'] / successful
            if successful > 0 else 0
        )
        avg_tokens = (
            self.metrics['total_tokens_used'] / successful
            if successful > 0 else 0
        )
        
        uptime = time.time() - self.start_time
        
        return {
            **self.metrics,
            'success_rate_pct': success_rate,
            'avg_cost_per_extraction': avg_cost,
            'avg_processing_time': avg_time,
            'avg_tokens_per_extraction': avg_tokens,
            'uptime_seconds': uptime,
            'timestamp': datetime.now().isoformat()
        }
    
    def get_recent_extractions(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Get recent extraction history."""
        return list(self.extraction_history)[-limit:]
    
    def get_recent_errors(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Get recent errors."""
        return list(self.error_history)[-limit:]
    
    def get_error_summary(self) -> Dict[str, Any]:
        """Get error statistics and patterns."""
        if not self.error_history:
            return {
                'total_errors': 0,
                'error_patterns': {}
            }
        
        # Analyze error patterns
        error_patterns = {}
        for error_entry in self.error_history:
            error_msg = error_entry.get('error', 'Unknown error')
            # Extract error type
            error_type = error_msg.split(':')[0] if ':' in error_msg else error_msg
            error_patterns[error_type] = error_patterns.get(error_type, 0) + 1
        
        return {
            'total_errors': len(self.error_history),
            'error_patterns': error_patterns,
            'recent_errors': self.get_recent_errors(5)
        }
    
    def check_cost_threshold(
        self,
        threshold_usd: float,
        time_window_hours: int = 24
    ) -> Dict[str, Any]:
        """
        Check if cost exceeds threshold in time window.
        
        Args:
            threshold_usd: Cost threshold in USD
            time_window_hours: Time window in hours
        
        Returns:
            Alert information if threshold exceeded
        """
        cutoff_time = datetime.now() - timedelta(hours=time_window_hours)
        
        cost_in_window = sum(
            entry['cost_usd']
            for entry in self.extraction_history
            if datetime.fromisoformat(entry['timestamp']) > cutoff_time
        )
        
        exceeds_threshold = cost_in_window > threshold_usd
        
        return {
            'exceeds_threshold': exceeds_threshold,
            'threshold_usd': threshold_usd,
            'actual_cost_usd': cost_in_window,
            'time_window_hours': time_window_hours,
            'alert': f'Cost ${cost_in_window:.2f} exceeds threshold ${threshold_usd:.2f}' if exceeds_threshold else None
        }


class HealthChecker:
    """
    Health check service for monitoring system availability.
    """
    
    def __init__(self, api_key: Optional[str] = None):
        try:
            self.client = OpenAI(api_key=api_key) if api_key else OpenAI()
            self.client_available = True
        except:
            self.client_available = False
    
    def check_openai_api(self) -> Dict[str, Any]:
        """
        Test OpenAI API connectivity.
        
        Returns:
            Health check result
        """
        if not self.client_available:
            return {
                'healthy': False,
                'service': 'openai_api',
                'error': 'Client not initialized'
            }
        
        try:
            # Make a minimal test call
            response = self.client.chat.completions.create(
                model="gpt-5-mini",
                messages=[{"role": "user", "content": "test"}],
                max_completion_tokens=5  # GPT-5 requires max_completion_tokens
            )
            
            return {
                'healthy': True,
                'service': 'openai_api',
                'latency_ms': None,  # Could track this
                'model': 'gpt-5-mini'
            }
            
        except Exception as e:
            return {
                'healthy': False,
                'service': 'openai_api',
                'error': str(e)
            }
    
    def check_all(self) -> Dict[str, Any]:
        """
        Run all health checks.
        
        Returns:
            Complete health status
        """
        checks = {
            'openai_api': self.check_openai_api()
        }
        
        # Determine overall health
        all_healthy = all(check['healthy'] for check in checks.values())
        
        return {
            'status': 'healthy' if all_healthy else 'degraded',
            'checks': checks,
            'timestamp': datetime.now().isoformat()
        }


class PerformanceAnalyzer:
    """
    Analyze performance trends and bottlenecks.
    """
    
    def __init__(self, monitor: ExtractionMonitor):
        self.monitor = monitor
    
    def analyze_processing_times(self) -> Dict[str, Any]:
        """
        Analyze processing time distribution.
        
        Returns:
            Processing time statistics
        """
        if not self.monitor.extraction_history:
            return {'error': 'No data available'}
        
        times = [
            entry['processing_time']
            for entry in self.monitor.extraction_history
            if entry.get('success') and entry.get('processing_time')
        ]
        
        if not times:
            return {'error': 'No successful extractions'}
        
        times_sorted = sorted(times)
        n = len(times_sorted)
        
        return {
            'count': n,
            'min': min(times),
            'max': max(times),
            'avg': sum(times) / n,
            'median': times_sorted[n // 2],
            'p95': times_sorted[int(n * 0.95)] if n > 0 else 0,
            'p99': times_sorted[int(n * 0.99)] if n > 0 else 0
        }
    
    def analyze_token_efficiency(self) -> Dict[str, Any]:
        """
        Analyze token usage efficiency.
        
        Returns:
            Token efficiency metrics
        """
        if not self.monitor.extraction_history:
            return {'error': 'No data available'}
        
        successful = [
            entry for entry in self.monitor.extraction_history
            if entry.get('success')
        ]
        
        if not successful:
            return {'error': 'No successful extractions'}
        
        # Calculate tokens per page
        tokens_per_page = [
            entry['tokens_used'] / entry['pages_processed']
            for entry in successful
            if entry.get('pages_processed', 0) > 0
        ]
        
        if not tokens_per_page:
            return {'error': 'No page data available'}
        
        avg_tokens_per_page = sum(tokens_per_page) / len(tokens_per_page)
        
        return {
            'total_tokens': self.monitor.metrics['total_tokens_used'],
            'total_pages': self.monitor.metrics['total_pages_processed'],
            'avg_tokens_per_page': avg_tokens_per_page,
            'estimated_cost_per_page': avg_tokens_per_page * 1.25 / 1_000_000  # ✅ CORRECTED: GPT-5 input pricing ($1.25/1M)
        }
    
    def generate_report(self) -> Dict[str, Any]:
        """
        Generate comprehensive performance report.
        
        Returns:
            Complete performance analysis
        """
        return {
            'metrics': self.monitor.get_metrics(),
            'processing_times': self.analyze_processing_times(),
            'token_efficiency': self.analyze_token_efficiency(),
            'error_summary': self.monitor.get_error_summary(),
            'generated_at': datetime.now().isoformat()
        }


# Global instances
extraction_monitor = ExtractionMonitor()
health_checker = HealthChecker()
performance_analyzer = PerformanceAnalyzer(extraction_monitor)


def get_service_status() -> Dict[str, Any]:
    """
    Get complete service status for monitoring dashboard.
    
    Returns:
        Complete service status
    """
    return {
        'health': health_checker.check_all(),
        'metrics': extraction_monitor.get_metrics(),
        'performance': performance_analyzer.generate_report()
    }


# Example usage
if __name__ == "__main__":
    # Simulate some extractions
    monitor = ExtractionMonitor()
    
    # Success
    monitor.log_extraction(
        upload_id="upload_1",
        success=True,
        pages_processed=10,
        tokens_used=7000,
        cost_usd=0.0525,
        processing_time=12.5
    )
    
    # Failure
    monitor.log_extraction(
        upload_id="upload_2",
        success=False,
        error="Rate limit exceeded"
    )
    
    # Another success
    monitor.log_extraction(
        upload_id="upload_3",
        success=True,
        pages_processed=5,
        tokens_used=3500,
        cost_usd=0.0263,
        processing_time=6.2
    )
    
    # Display metrics
    print("\n=== Extraction Metrics ===")
    metrics = monitor.get_metrics()
    for key, value in metrics.items():
        print(f"{key}: {value}")
    
    # Check health
    print("\n=== Health Check ===")
    health = health_checker.check_all()
    print(f"Status: {health['status']}")
    for service, check in health['checks'].items():
        status = "✅" if check['healthy'] else "❌"
        print(f"{status} {service}")
    
    # Performance analysis
    print("\n=== Performance Analysis ===")
    analyzer = PerformanceAnalyzer(monitor)
    report = analyzer.generate_report()
    print(json.dumps(report, indent=2))

