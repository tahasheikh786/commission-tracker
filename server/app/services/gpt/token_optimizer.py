"""
Token optimization utilities for GPT-5 Vision API.

Provides tools for:
- Token calculation and estimation
- Cost tracking and prediction
- Image optimization for minimal tokens
- Model selection (GPT-5 vs GPT-5-mini)
"""

import math
import logging
from typing import Tuple, Dict, Any
from PIL import Image
import io

logger = logging.getLogger(__name__)


class TokenOptimizer:
    """
    Token optimization and cost management for GPT-5 Vision.
    
    ✅ CORRECTED Pricing (November 2025):
    - GPT-5: $1.25/1M input, $10.00/1M output
    - GPT-5-mini: $0.25/1M input, $2.00/1M output
    - GPT-5-nano: $0.05/1M input, $0.40/1M output
    """
    
    def __init__(self):
        # ✅ CORRECTED Pricing per 1M tokens (November 2025)
        # GPT-5 Pricing (November 2025 - CORRECT):
        # - Input: $1.25 per 1M tokens
        # - Output: $10.00 per 1M tokens
        # GPT-5-mini Pricing:
        # - Input: $0.25 per 1M tokens
        # - Output: $2.00 per 1M tokens
        self.pricing = {
            'gpt-5': {
                'input': 1.25 / 1_000_000,            # ✅ CORRECT: $1.25 per 1M input tokens
                'output': 10.00 / 1_000_000,          # ✅ CORRECT: $10.00 per 1M output tokens
                'reasoning_read': 0.50 / 1_000_000,   # Reasoning cache read
                'reasoning_write': 5.00 / 1_000_000,  # Reasoning cache write
                'reasoning': 5.00 / 1_000_000         # Default to write (conservative)
            },
            'gpt-5-mini': {
                'input': 0.25 / 1_000_000,            # ✅ CORRECT: $0.25 per 1M input tokens
                'output': 2.00 / 1_000_000,           # ✅ CORRECT: $2.00 per 1M output tokens
                'reasoning_read': 0.10 / 1_000_000,   # Reasoning cache read
                'reasoning_write': 1.00 / 1_000_000,  # Reasoning cache write
                'reasoning': 1.00 / 1_000_000         # Default to write (conservative)
            },
            'gpt-5-nano': {
                'input': 0.05 / 1_000_000,            # ✅ $0.05 per 1M input tokens
                'output': 0.40 / 1_000_000,           # ✅ $0.40 per 1M output tokens
                'reasoning': 0.20 / 1_000_000         # Conservative estimate
            }
        }
        
        # Vision token constants
        self.base_tokens_per_tile = 85
        self.overhead_tokens = 170
        self.tile_size = 512
        
        # Optimal settings
        self.max_dimension = 2048
        self.optimal_dpi = 150
    
    def calculate_vision_tokens(self, width: int, height: int, detail: str = "high") -> int:
        """
        Calculate GPT-5 Vision token usage for image.
        
        Formula (detail: high):
        - Base tokens: 85 per 512x512 tile
        - tiles = ceil(width/512) × ceil(height/512)
        - total = (tiles × 85) + 170 (overhead)
        
        Args:
            width: Image width in pixels
            height: Image height in pixels
            detail: "high" or "low" (low uses fixed 85 tokens)
        
        Returns:
            Estimated token count
        """
        if detail == "low":
            return 85
        
        tiles_x = math.ceil(width / self.tile_size)
        tiles_y = math.ceil(height / self.tile_size)
        tiles = tiles_x * tiles_y
        
        base_tokens = tiles * self.base_tokens_per_tile
        total_tokens = base_tokens + self.overhead_tokens
        
        logger.debug(f"Token calculation: {width}x{height} = {tiles_x}x{tiles_y} tiles = {total_tokens} tokens")
        
        return total_tokens
    
    def optimize_image_dimensions(
        self, 
        img: Image.Image,
        target_tokens: int = 680
    ) -> Tuple[Image.Image, int]:
        """
        Optimize image dimensions to minimize tokens while maintaining quality.
        
        Target: ~4 tiles per image (680 tokens) for optimal balance.
        
        Args:
            img: PIL Image
            target_tokens: Target token count
        
        Returns:
            Tuple of (optimized_image, token_count)
        """
        original_tokens = self.calculate_vision_tokens(img.width, img.height)
        
        # If already optimal, return as-is
        if original_tokens <= target_tokens:
            return img, original_tokens
        
        # Calculate optimal dimensions
        # Target: 2x2 tiles = 1024x1024
        target_dimension = min(self.max_dimension, 1024)
        
        if img.width > target_dimension or img.height > target_dimension:
            ratio = min(target_dimension / img.width, target_dimension / img.height)
            new_size = (int(img.width * ratio), int(img.height * ratio))
            img = img.resize(new_size, Image.Resampling.LANCZOS)
        
        new_tokens = self.calculate_vision_tokens(img.width, img.height)
        
        savings_pct = ((original_tokens - new_tokens) / original_tokens) * 100
        logger.info(f"Image optimized: {original_tokens} → {new_tokens} tokens ({savings_pct:.1f}% savings)")
        
        return img, new_tokens
    
    def calculate_cost(
        self,
        input_tokens: int,
        output_tokens: int,
        model: str = "gpt-5",
        reasoning_tokens: int = 0
    ) -> float:
        """
        Calculate API cost for token usage including GPT-5 reasoning tokens.
        
        ✅ CORRECTED GPT-5 Pricing (November 2025):
        - Input: $1.25 per 1M tokens
        - Output: $10.00 per 1M tokens
        - Reasoning (cache read): $0.50 per 1M tokens
        - Reasoning (cache write): $5.00 per 1M tokens
        
        Args:
            input_tokens: Number of input tokens
            output_tokens: Number of output tokens
            model: "gpt-5" or "gpt-5-mini"
            reasoning_tokens: Number of reasoning tokens (GPT-5 only)
        
        Returns:
            Cost in USD
        """
        pricing = self.pricing.get(model, self.pricing['gpt-5'])
        
        # Calculate costs
        input_cost = input_tokens * pricing['input']
        output_cost = output_tokens * pricing['output']
        
        # ✅ NEW: Account for reasoning tokens
        # Assuming reasoning is mostly write operations (conservative estimate)
        reasoning_cost = reasoning_tokens * pricing.get('reasoning_write', pricing.get('reasoning', 0))
        
        total_cost = input_cost + output_cost + reasoning_cost
        
        logger.debug(
            f"Cost breakdown ({model}): "
            f"input=${input_cost:.6f}, "
            f"output=${output_cost:.6f}, "
            f"reasoning=${reasoning_cost:.6f}, "
            f"total=${total_cost:.6f}"
        )
        
        return total_cost
    
    def estimate_page_cost(
        self,
        num_pages: int,
        avg_tokens_per_page: int = 700,
        model: str = "gpt-5",
        use_page_selection: bool = False,
        selection_ratio: float = 0.2
    ) -> Dict[str, Any]:
        """
        Estimate cost for processing PDF pages.
        
        Args:
            num_pages: Total number of pages
            avg_tokens_per_page: Average tokens per page (default: 700)
            model: Model to use
            use_page_selection: Whether to use intelligent page selection
            selection_ratio: Ratio of pages to process if using selection
        
        Returns:
            Cost breakdown dictionary
        """
        effective_pages = num_pages
        if use_page_selection and num_pages > 10:
            effective_pages = int(num_pages * selection_ratio)
        
        total_input_tokens = effective_pages * avg_tokens_per_page
        total_output_tokens = effective_pages * 500  # Estimated output
        
        cost = self.calculate_cost(total_input_tokens, total_output_tokens, model)
        
        return {
            'total_pages': num_pages,
            'effective_pages': effective_pages,
            'total_input_tokens': total_input_tokens,
            'total_output_tokens': total_output_tokens,
            'total_tokens': total_input_tokens + total_output_tokens,
            'estimated_cost_usd': cost,
            'cost_per_page': cost / num_pages if num_pages > 0 else 0,
            'model': model,
            'page_selection_enabled': use_page_selection
        }
    
    def should_use_mini_model(
        self,
        page_complexity_score: float,
        threshold: float = 0.5
    ) -> bool:
        """
        Decide whether to use GPT-5-mini based on page complexity.
        
        Use mini for simple pages (94% cost savings with minimal accuracy loss).
        
        Args:
            page_complexity_score: Score from 0-1 (0=simple, 1=complex)
            threshold: Threshold for using standard model
        
        Returns:
            True if mini model should be used, False for standard
        """
        return page_complexity_score < threshold
    
    def optimize_dpi(self, page_text_length: int, has_tables: bool) -> int:
        """
        Calculate optimal DPI based on page content.
        
        Args:
            page_text_length: Length of extracted text
            has_tables: Whether page contains tables
        
        Returns:
            Optimal DPI value
        """
        if not has_tables and page_text_length < 500:
            return 300  # Low complexity
        elif has_tables or page_text_length > 1000:
            return 400  # High complexity
        else:
            return self.optimal_dpi  # Medium complexity
    
    def calculate_batch_savings(
        self,
        num_pages: int,
        model: str = "gpt-5"
    ) -> Dict[str, Any]:
        """
        Calculate cost savings with batch API (50% discount).
        
        Args:
            num_pages: Number of pages to process
            model: Model to use
        
        Returns:
            Savings comparison dictionary
        """
        real_time_cost = self.estimate_page_cost(num_pages, model=model)
        batch_cost = real_time_cost['estimated_cost_usd'] * 0.5
        
        return {
            'real_time_cost': real_time_cost['estimated_cost_usd'],
            'batch_cost': batch_cost,
            'savings': real_time_cost['estimated_cost_usd'] - batch_cost,
            'savings_percent': 50.0,
            'processing_time_hours': 24,  # Batch API SLA
            'recommendation': 'Use batch for non-urgent extractions'
        }
    
    def compare_optimization_strategies(
        self,
        num_pages: int
    ) -> Dict[str, Dict[str, Any]]:
        """
        Compare different optimization strategies.
        
        Args:
            num_pages: Number of pages in document
        
        Returns:
            Dictionary comparing different strategies
        """
        strategies = {
            'baseline': self.estimate_page_cost(
                num_pages,
                model='gpt-5',
                use_page_selection=False
            ),
            'with_mini_model': self.estimate_page_cost(
                num_pages,
                model='gpt-5-mini',
                use_page_selection=False
            ),
            'with_page_selection': self.estimate_page_cost(
                num_pages,
                model='gpt-5',
                use_page_selection=True,
                selection_ratio=0.2
            ),
            'full_optimization': self.estimate_page_cost(
                num_pages,
                model='gpt-5-mini',
                use_page_selection=True,
                selection_ratio=0.2
            )
        }
        
        # Add batch option
        strategies['full_optimization_batch'] = {
            **strategies['full_optimization'],
            'estimated_cost_usd': strategies['full_optimization']['estimated_cost_usd'] * 0.5,
            'batch_enabled': True
        }
        
        # Calculate savings
        baseline_cost = strategies['baseline']['estimated_cost_usd']
        for name, strategy in strategies.items():
            if name != 'baseline':
                savings = baseline_cost - strategy['estimated_cost_usd']
                savings_pct = (savings / baseline_cost) * 100 if baseline_cost > 0 else 0
                strategy['savings_vs_baseline'] = f"${savings:.4f} ({savings_pct:.1f}%)"
        
        return strategies


class TokenTracker:
    """Track token usage and costs across extractions."""
    
    def __init__(self):
        self.total_input_tokens = 0
        self.total_output_tokens = 0
        self.total_cost = 0.0
        self.extractions_count = 0
        self.optimizer = TokenOptimizer()
    
    def record_extraction(
        self,
        input_tokens: int,
        output_tokens: int,
        model: str = "gpt-5",
        reasoning_tokens: int = 0
    ) -> Dict[str, Any]:
        """
        Record token usage and calculate cost including reasoning tokens.
        
        Args:
            input_tokens: Input tokens used
            output_tokens: Output tokens used
            model: Model used
            reasoning_tokens: Reasoning tokens used (GPT-5)
        
        Returns:
            Extraction cost summary
        """
        cost = self.optimizer.calculate_cost(input_tokens, output_tokens, model, reasoning_tokens)
        
        self.total_input_tokens += input_tokens
        self.total_output_tokens += output_tokens
        self.total_cost += cost
        self.extractions_count += 1
        
        return {
            'input_tokens': input_tokens,
            'output_tokens': output_tokens,
            'reasoning_tokens': reasoning_tokens,
            'total_tokens': input_tokens + output_tokens + reasoning_tokens,
            'cost_usd': cost,
            'model': model
        }
    
    def get_summary(self) -> Dict[str, Any]:
        """Get cumulative token usage summary."""
        total_tokens = self.total_input_tokens + self.total_output_tokens
        avg_cost = self.total_cost / self.extractions_count if self.extractions_count > 0 else 0
        
        return {
            'total_extractions': self.extractions_count,
            'total_input_tokens': self.total_input_tokens,
            'total_output_tokens': self.total_output_tokens,
            'total_tokens': total_tokens,
            'total_cost_usd': self.total_cost,
            'average_cost_per_extraction': avg_cost,
            'average_tokens_per_extraction': total_tokens / self.extractions_count if self.extractions_count > 0 else 0
        }
    
    def reset(self):
        """Reset all counters."""
        self.total_input_tokens = 0
        self.total_output_tokens = 0
        self.total_cost = 0.0
        self.extractions_count = 0


# Example usage and testing
if __name__ == "__main__":
    optimizer = TokenOptimizer()
    
    print("=== Token Optimization Examples ===\n")
    
    # Example 1: Image token calculation
    print("1. Image Token Calculation:")
    print(f"   1024x1536 image: {optimizer.calculate_vision_tokens(1024, 1536)} tokens")
    print(f"   2048x2048 image: {optimizer.calculate_vision_tokens(2048, 2048)} tokens")
    print()
    
    # Example 2: Cost estimation
    print("2. Cost Estimation (50-page document):")
    strategies = optimizer.compare_optimization_strategies(50)
    for name, strategy in strategies.items():
        print(f"   {name}:")
        print(f"      Cost: ${strategy['estimated_cost_usd']:.4f}")
        if 'savings_vs_baseline' in strategy:
            print(f"      Savings: {strategy['savings_vs_baseline']}")
    print()
    
    # Example 3: Batch savings
    print("3. Batch API Savings:")
    batch_savings = optimizer.calculate_batch_savings(50)
    print(f"   Real-time: ${batch_savings['real_time_cost']:.4f}")
    print(f"   Batch: ${batch_savings['batch_cost']:.4f}")
    print(f"   Savings: ${batch_savings['savings']:.4f} ({batch_savings['savings_percent']}%)")

