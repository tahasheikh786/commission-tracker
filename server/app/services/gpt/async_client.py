"""
Native async OpenAI client wrapper.

⚠️ DEPRECATED (November 2025):
This module is deprecated in favor of direct PDF upload via Responses API.
The new vision_extractor.py with GPT5VisionExtractorWithPDF class uses
direct PDF input which is faster, cheaper, and simpler.

This module is kept for backward compatibility only.

Replaces ThreadPoolExecutor with true async/await patterns (legacy).
"""

import asyncio
import base64
import json
import logging
from typing import Dict, List, Any, Optional
from openai import AsyncOpenAI, OpenAIError

logger = logging.getLogger(__name__)


class AsyncVisionClient:
    """
    Async wrapper for OpenAI Vision API.
    
    Benefits over sync client:
    - True async/await (no ThreadPoolExecutor)
    - Better timeout control with asyncio.wait_for
    - Streaming support
    - Cleaner error handling
    """
    
    def __init__(self, api_key: Optional[str] = None, model: str = "gpt-5"):
        """
        Initialize async OpenAI client for GPT-5 Vision with Chat Completions API.
        
        Args:
            api_key: Optional OpenAI API key
            model: Model to use (default: "gpt-5" for vision)
        """
        try:
            self.client = AsyncOpenAI(api_key=api_key) if api_key else AsyncOpenAI()
        except Exception as e:
            logger.warning(f"⚠️ Async OpenAI client initialization failed: {e}")
            self.client = None
        
        self.model = model
        
        if self.client:
            logger.info(f"✅ Async Vision Client initialized with model: {self.model}")
        else:
            logger.warning("⚠️ Async Vision Client initialized without API key")
    
    def is_available(self) -> bool:
        """Check if async client is available."""
        return self.client is not None
    
    async def extract_with_timeout(
        self,
        image_data: bytes,
        page_number: int,
        system_prompt: str,
        user_prompt: str,
        response_schema: Dict,
        timeout: int = 150
    ) -> Dict[str, Any]:
        """
        Extract with native async timeout.
        
        Args:
            image_data: Image bytes
            page_number: Page number for logging
            system_prompt: System prompt
            user_prompt: User prompt
            response_schema: JSON schema for structured output
            timeout: Timeout in seconds
            
        Returns:
            Parsed JSON response
            
        Raises:
            asyncio.TimeoutError: If extraction times out
            OpenAIError: On API errors
        """
        
        try:
            # Execute with timeout
            result = await asyncio.wait_for(
                self._call_api(
                    image_data,
                    page_number,
                    system_prompt,
                    user_prompt,
                    response_schema
                ),
                timeout=timeout
            )
            
            return result
            
        except asyncio.TimeoutError:
            logger.error(
                f"⏱️ Page {page_number} extraction timed out after {timeout}s"
            )
            raise
    
    async def _call_api(
        self,
        image_data: bytes,
        page_number: int,
        system_prompt: str,
        user_prompt: str,
        response_schema: Dict
    ) -> Dict[str, Any]:
        """Make async API call using Chat Completions API (correct for vision)."""
        
        # Encode image
        base64_image = base64.b64encode(image_data).decode('utf-8')
        
        # ✅ CORRECT: Chat Completions API for GPT-5 Vision with images
        messages = [
            {
                "role": "system",
                "content": system_prompt
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",  # ✅ CORRECT for Chat Completions
                        "text": user_prompt
                    },
                    {
                        "type": "image_url",  # ✅ CORRECT for Chat Completions
                        "image_url": {
                            "url": f"data:image/jpeg;base64,{base64_image}"
                        }
                    }
                ]
            }
        ]
        
        # Call API
        logger.debug(f"🔄 Calling async API for page {page_number}")
        
        # ✅ CORRECT: Use Chat Completions API for vision
        response = await self.client.chat.completions.create(
            model=self.model,
            messages=messages,  # ✅ CORRECT: 'messages' for Chat Completions
            response_format={"type": "json_object"},
            max_completion_tokens=6000,  # ✅ INCREASED token limit
            temperature=0
        )
        
        # ✅ Parse response from Chat Completions API
        if not response.choices or not response.choices[0].message.content:
            logger.error(f"❌ Page {page_number}: Empty response from API")
            raise ValueError(f"Empty response for page {page_number}")
        
        message_content = response.choices[0].message.content.strip()
        
        # Check for refusal
        if response.choices[0].message.refusal:
            logger.error(f"❌ Page {page_number}: Model refused - {response.choices[0].message.refusal}")
            raise ValueError(f"Model refused extraction: {response.choices[0].message.refusal}")
        
        # Parse JSON
        try:
            result = json.loads(message_content)
        except json.JSONDecodeError as e:
            logger.error(f"❌ JSON parse error for page {page_number}: {e}")
            logger.debug(f"Content: {message_content[:200]}")
            raise
        
        # ✅ Track token usage from Chat Completions API
        usage = response.usage
        result['tokens_used'] = {
            'input': usage.prompt_tokens,
            'output': usage.completion_tokens,
            'total': usage.total_tokens
        }
        
        return result
    
    async def extract_with_streaming(
        self,
        image_data: bytes,
        page_number: int,
        system_prompt: str,
        user_prompt: str,
        timeout: int = 150
    ) -> Dict[str, Any]:
        """
        Extract with streaming for timeout resilience.
        
        Streaming provides incremental progress, preventing timeouts
        on slow API responses.
        
        Args:
            image_data: Image bytes
            page_number: Page number for logging
            system_prompt: System prompt
            user_prompt: User prompt
            timeout: Timeout in seconds
            
        Returns:
            Parsed JSON response with accumulated content
        """
        
        base64_image = base64.b64encode(image_data).decode('utf-8')
        
        # ✅ CORRECT: Chat Completions API for vision with images
        messages = [
            {
                "role": "system",
                "content": system_prompt
            },
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": user_prompt},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/jpeg;base64,{base64_image}"
                        }
                    }
                ]
            }
        ]
        
        # Stream response
        accumulated_content = ""
        tokens_used = {"input": 0, "output": 0, "total": 0}
        
        try:
            logger.debug(f"🔄 Starting streaming extraction for page {page_number}")
            
            # ✅ CORRECT: Use Chat Completions streaming for vision
            stream = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                response_format={"type": "json_object"},
                max_completion_tokens=6000,
                temperature=0,
                stream=True
            )
            
            async for chunk in stream:
                # Chat Completions streaming structure
                if chunk.choices and chunk.choices[0].delta.content:
                    accumulated_content += chunk.choices[0].delta.content
                
                # Update token usage if available (usually in last chunk)
                if hasattr(chunk, 'usage') and chunk.usage:
                    tokens_used['input'] = chunk.usage.prompt_tokens
                    tokens_used['output'] = chunk.usage.completion_tokens
                    tokens_used['total'] = chunk.usage.total_tokens
            
            if not accumulated_content:
                raise ValueError(f"Empty streaming content for page {page_number}")
            
            # Parse accumulated JSON
            try:
                result = json.loads(accumulated_content)
            except json.JSONDecodeError as e:
                logger.error(f"❌ Streaming JSON parse error for page {page_number}: {e}")
                logger.debug(f"Accumulated content: {accumulated_content[:200]}")
                raise
            
            result['tokens_used'] = tokens_used
            
            logger.debug(f"✅ Streaming complete for page {page_number}")
            
            return result
            
        except asyncio.TimeoutError:
            logger.error(f"⏱️ Streaming timeout for page {page_number}")
            raise
        except Exception as e:
            logger.error(f"❌ Streaming error for page {page_number}: {e}")
            raise

