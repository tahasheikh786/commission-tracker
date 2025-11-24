"""
Conversational Summary Service
Transforms technical extraction data into natural, user-friendly summaries

Inspired by Google Gemini's natural language approach to document summarization.

⭐ NOW USES GPT-5 (Responses API) for parity with the GPT-5 Vision extraction pipeline
"""

import logging
import asyncio
import json
from typing import Dict, Any, Optional, List
from datetime import datetime
from openai import AsyncOpenAI
import os
import httpx

from .gpt.retry_handler import RateLimitMonitor
from .gpt.circuit_breaker import CircuitBreaker
from .gpt.token_optimizer import TokenTracker

logger = logging.getLogger(__name__)


class ConversationalSummaryService:
    """
    Generates conversational, non-technical summaries from structured extraction data.
    
    Inspired by Google Gemini's natural language approach to document summarization.
    
    ⭐ NOW USES GPT-5 Responses API for consistency with GPT-5 Vision extraction pipeline
    """
    
    def __init__(self, api_key: Optional[str] = None):
        """Initialize GPT-5 Responses API client for conversational summaries."""
        api_key = api_key or os.getenv("OPENAI_API_KEY")
        timeout_seconds = float(os.getenv("OPENAI_HTTP_TIMEOUT", "600"))
        connect_timeout = float(os.getenv("OPENAI_HTTP_CONNECT_TIMEOUT", "10"))
        write_timeout = float(os.getenv("OPENAI_HTTP_WRITE_TIMEOUT", "60"))
        self._http_timeout = httpx.Timeout(
            timeout=timeout_seconds,
            connect=connect_timeout,
            write=write_timeout,
            read=timeout_seconds
        )
        max_retries = int(os.getenv("OPENAI_HTTP_MAX_RETRIES", "2"))
        try:
            self.client = AsyncOpenAI(
                api_key=api_key,
                timeout=self._http_timeout,
                max_retries=max_retries
            ) if api_key else None
        except Exception as exc:
            logger.warning("⚠️ OpenAI client initialization failed for summaries: %s", exc)
            self.client = None
        
        # Model + token planning mirrors GPT-5 Vision extractor
        self.primary_model = os.getenv("GPT5_SUMMARY_MODEL", os.getenv("GPT5_PRIMARY_MODEL", "gpt-5"))
        self.mini_model = os.getenv("GPT5_SUMMARY_MINI_MODEL", os.getenv("GPT5_MINI_MODEL", "gpt-5-mini"))
        self.reasoning_effort = os.getenv("GPT5_SUMMARY_REASONING", "medium")
        self.max_tokens_default = int(os.getenv("GPT5_SUMMARY_MAX_TOKENS", "2000"))
        self.mini_max_output_tokens = int(os.getenv("GPT5_SUMMARY_MINI_MAX_TOKENS", "1200"))
        self.min_output_tokens = int(os.getenv("GPT5_SUMMARY_MIN_OUTPUT_TOKENS", "600"))
        self.mini_output_tokens = int(os.getenv("GPT5_SUMMARY_MINI_MIN_TOKENS", "400"))
        self.token_retry_step = int(os.getenv("GPT5_SUMMARY_TOKEN_RETRY_STEP", "400"))
        self.max_token_retry_attempts = int(os.getenv("GPT5_SUMMARY_TOKEN_RETRY_ATTEMPTS", "2"))
        self.mini_prompt_char_limit = int(os.getenv("GPT5_SUMMARY_MINI_PROMPT_CHAR_LIMIT", "4000"))
        self.tokens_per_char_estimate = float(os.getenv("GPT5_SUMMARY_TOKENS_PER_CHAR", "0.35"))
        
        # Structured response + resiliency helpers
        self.structured_response_format = self._build_structured_output_schema()
        self._disabled_models: set[str] = set()
        self.rate_limiter = RateLimitMonitor(
            requests_per_minute=int(os.getenv("GPT5_SUMMARY_REQUESTS_PER_MINUTE", "60")),
            tokens_per_minute=int(os.getenv("GPT5_SUMMARY_TOKENS_PER_MINUTE", "200000"))
        )
        self.circuit_breaker = CircuitBreaker(
            failure_threshold=int(os.getenv("GPT5_SUMMARY_FAILURE_THRESHOLD", "5")),
            timeout=int(os.getenv("GPT5_SUMMARY_BREAKER_TIMEOUT", "45")),
            success_threshold=int(os.getenv("GPT5_SUMMARY_SUCCESS_THRESHOLD", "2"))
        )
        self.token_tracker = TokenTracker()
        
        if self.client:
            logger.info(
                "✅ ConversationalSummaryService initialized with GPT-5 responses "
                "(primary=%s, mini=%s)",
                self.primary_model,
                self.mini_model
            )
        else:
            logger.warning("⚠️ ConversationalSummaryService initialized without OpenAI API key")
        
    def is_available(self) -> bool:
        """Check if service is ready"""
        return self.client is not None and bool(os.getenv("OPENAI_API_KEY"))
    
    def _build_structured_output_schema(self) -> Dict[str, Any]:
        """Structured output schema to guarantee JSON with summary + key-value data."""
        return {
            "type": "json_schema",
            "json_schema": {
                "name": "ConversationalSummary",
                "strict": False,
                "schema": {
                    "type": "object",
                    "properties": {
                        "conversational_summary": {"type": "string"},
                        "key_value_data": {
                            "type": "object",
                            "properties": {
                                "carrier_name": {"type": ["string", "null"]},
                                "broker_company": {"type": ["string", "null"]},
                                "statement_date": {"type": ["string", "null"]},
                                "broker_id": {"type": ["string", "null"]},
                                "payment_type": {"type": ["string", "null"]},
                                "total_amount": {"type": ["string", "null", "number"]},
                                "company_count": {"type": ["integer", "string", "null"]},
                                "top_contributors": {
                                    "type": "array",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "name": {"type": "string"},
                                            "amount": {"type": "string"}
                                        },
                                        "required": ["name", "amount"]
                                    }
                                },
                                "commission_structure": {"type": ["string", "null"]},
                                "census_count": {"type": ["string", "integer", "null"]},
                                "billing_periods": {"type": ["string", "null"]}
                            },
                            "additionalProperties": True
                        }
                    },
                    "required": ["conversational_summary", "key_value_data"],
                    "additionalProperties": True
                }
            }
        }
    
    def _get_text_json_schema_payload(self) -> Dict[str, Any]:
        """Build Responses API structured output payload."""
        schema_payload = self.structured_response_format.get("json_schema", {})
        name = schema_payload.get("name", "ConversationalSummary")
        strict = schema_payload.get("strict", False)
        schema = schema_payload.get("schema", {})
        return {
            "format": {
                "type": "json_schema",
                "name": name,
                "schema": schema,
                "strict": strict,
                "json_schema": schema_payload
            }
        }
    
    def _is_model_disabled(self, model_name: Optional[str]) -> bool:
        return bool(model_name) and model_name in self._disabled_models
    
    def _disable_model(self, model_name: Optional[str]) -> None:
        if not model_name or model_name in self._disabled_models:
            return
        self._disabled_models.add(model_name)
        logger.warning("⚠️ Model %s disabled for conversational summaries.", model_name)
    
    def _get_model_fallback_candidates(self, failed_model: str) -> List[str]:
        candidates: List[Optional[str]] = []
        if failed_model == self.mini_model:
            env_override = os.getenv("GPT5_SUMMARY_MINI_FALLBACK_MODEL")
            candidates.extend([env_override, self.primary_model, "gpt-5"])
        else:
            env_override = os.getenv("GPT5_SUMMARY_PRIMARY_FALLBACK_MODEL")
            candidates.extend([env_override, self.mini_model, "gpt-5-mini", "gpt-5"])
        unique: List[str] = []
        for candidate in candidates:
            if candidate and candidate not in unique:
                unique.append(candidate)
        return unique
    
    def _next_fallback_model(self, failed_model: str, tried_models: List[str]) -> Optional[str]:
        for candidate in self._get_model_fallback_candidates(failed_model):
            if candidate in tried_models or self._is_model_disabled(candidate):
                continue
            return candidate
        return None
    
    def _select_available_model(self, preferred_model: Optional[str]) -> str:
        preferred = preferred_model or self.primary_model or "gpt-5"
        if not self._is_model_disabled(preferred):
            return preferred
        fallback = self._next_fallback_model(preferred, tried_models=[preferred])
        return fallback or "gpt-5"
    
    def _is_model_not_found_error(self, error: Exception) -> bool:
        if hasattr(error, "code") and getattr(error, "code") == "model_not_found":
            return True
        body = getattr(error, "body", None)
        if isinstance(body, dict):
            err = body.get("error", {})
            if err.get("code") == "model_not_found":
                return True
            message = err.get("message", "")
            if isinstance(message, str) and "does not exist" in message.lower():
                return True
        message = str(error).lower()
        return "model_not_found" in message or "does not exist" in message
    
    async def _execute_with_model_failover(self, response_kwargs: Dict[str, Any]):
        if not self.client:
            raise ValueError("OpenAI client not initialized")
        tried_models: List[str] = []
        while True:
            current_model = response_kwargs.get("model", self.primary_model)
            tried_models.append(current_model)
            try:
                return await self.client.responses.create(**response_kwargs)
            except Exception as api_error:
                if self._is_model_not_found_error(api_error):
                    self._disable_model(current_model)
                    fallback = self._next_fallback_model(current_model, tried_models)
                    if fallback:
                        logger.warning(
                            "⚠️ Model %s unavailable for summaries. Retrying with %s.",
                            current_model,
                            fallback
                        )
                        response_kwargs["model"] = fallback
                        continue
                raise
    
    def _plan_for_summary_request(self, prompt_length: int, use_enhanced: bool) -> Dict[str, Any]:
        use_mini = (
            bool(self.mini_model)
            and not use_enhanced
            and prompt_length <= self.mini_prompt_char_limit
            and not self._is_model_disabled(self.mini_model)
        )
        selected_model = self._select_available_model(self.mini_model if use_mini else self.primary_model)
        token_cap = self.mini_max_output_tokens if use_mini else self.max_tokens_default
        min_tokens = self.mini_output_tokens if use_mini else self.min_output_tokens
        estimated_tokens = max(min_tokens, int(prompt_length * self.tokens_per_char_estimate))
        max_tokens = min(token_cap, max(min_tokens, estimated_tokens))
        reasoning_effort = "low" if use_mini else self.reasoning_effort
        return {
            "model": selected_model,
            "max_tokens": max_tokens,
            "token_cap": token_cap,
            "use_mini": use_mini,
            "reasoning_effort": reasoning_effort
        }
    
    def _should_scale_output_tokens(
        self,
        current_tokens: int,
        plan: Dict[str, Any],
        attempts: int
    ) -> bool:
        return (
            attempts < self.max_token_retry_attempts
            and current_tokens < plan.get("token_cap", self.max_tokens_default)
        )
    
    def _next_token_budget(self, current_tokens: int, plan: Dict[str, Any]) -> int:
        token_cap = plan.get("token_cap", self.max_tokens_default)
        return min(token_cap, current_tokens + self.token_retry_step)
    
    def _estimate_input_tokens(self, prompt: str, system_prompt: str) -> int:
        combined_chars = len(prompt) + len(system_prompt or "")
        estimate = int(combined_chars * 0.25)
        return max(300, estimate)
    
    async def _generate_with_gpt5(
        self,
        prompt: str,
        system_prompt: str,
        use_enhanced: bool
    ) -> Dict[str, Any]:
        plan = self._plan_for_summary_request(len(prompt), use_enhanced)
        model = plan["model"]
        max_tokens = plan["max_tokens"]
        reasoning_effort = plan["reasoning_effort"]
        
        messages = [
            {
                "role": "system",
                "content": [{"type": "input_text", "text": system_prompt}]
            },
            {
                "role": "user",
                "content": [{"type": "input_text", "text": prompt}]
            }
        ]
        
        estimated_tokens = self._estimate_input_tokens(prompt, system_prompt) + max_tokens
        self.rate_limiter.wait_if_needed(estimated_tokens)
        
        response_kwargs = {
            "model": model,
            "input": messages,
            "text": self._get_text_json_schema_payload(),
            "max_output_tokens": max_tokens,
            "reasoning": {"effort": reasoning_effort}
        }
        
        token_retry_attempts = 0
        current_budget = max_tokens
        start_time = datetime.now()
        
        while True:
            response_kwargs["max_output_tokens"] = current_budget
            try:
                response = await self._execute_with_model_failover(response_kwargs)
            except TypeError as schema_error:
                # Fallback to json_object for older SDKs
                if "json_schema" in str(schema_error).lower():
                    logger.warning(
                        "⚠️ Structured outputs unsupported in current SDK for summaries. "
                        "Falling back to json_object format."
                    )
                    response_kwargs["text"] = {"format": {"type": "json_object"}}
                    response = await self._execute_with_model_failover(response_kwargs)
                else:
                    raise
            
            output_text = getattr(response, "output_text", "") or ""
            output_text = output_text.strip()
            if not output_text:
                raise ValueError("Empty summary response from GPT-5")
            
            incomplete = getattr(response, "status", "").lower() == "incomplete"
            truncated = not (output_text.endswith("}") or output_text.endswith("]"))
            
            if (incomplete or truncated) and self._should_scale_output_tokens(current_budget, plan, token_retry_attempts):
                token_retry_attempts += 1
                new_budget = self._next_token_budget(current_budget, plan)
                logger.warning(
                    "⚠️ Summary response truncated at %s tokens. Retrying with %s tokens "
                    "(attempt %s/%s).",
                    current_budget,
                    new_budget,
                    token_retry_attempts,
                    self.max_token_retry_attempts
                )
                current_budget = new_budget
                continue
            
            if truncated:
                logger.error("❌ Truncated JSON payload from GPT-5 summary response: ...%s", output_text[-120:])
                raise ValueError(
                    f"JSON response truncated at {len(output_text)} chars. "
                    f"Increase GPT5 summary max tokens (current budget: {current_budget})."
                )
            break
        
        processing_time = (datetime.now() - start_time).total_seconds()
        
        try:
            parsed = json.loads(output_text)
        except json.JSONDecodeError as exc:
            logger.error("❌ Failed to parse GPT-5 summary JSON at pos %s: %s", exc.pos, exc.msg)
            snippet = output_text[max(0, exc.pos - 80): exc.pos + 80]
            logger.error("Context: ...%s...", snippet)
            raise ValueError(f"Failed to parse GPT-5 summary JSON: {exc.msg}")
        
        usage = getattr(response, "usage", None)
        input_tokens = getattr(usage, "input_tokens", None) or getattr(usage, "prompt_tokens", 0) or 0
        output_tokens = getattr(usage, "output_tokens", None) or getattr(usage, "completion_tokens", 0) or 0
        reasoning_tokens = getattr(usage, "reasoning_tokens", 0)
        total_tokens = getattr(usage, "total_tokens", 0) or (input_tokens + output_tokens + reasoning_tokens)
        
        tokens_used = {
            "input": input_tokens,
            "output": output_tokens,
            "reasoning": reasoning_tokens,
            "total": total_tokens
        }
        
        cost_summary = self.token_tracker.record_extraction(
            input_tokens,
            output_tokens,
            model=model,
            reasoning_tokens=reasoning_tokens
        )
        self.rate_limiter.record_request(total_tokens)
        
        logger.info(
            "🗣️ GPT-5 summary complete (%s | %s tokens | $%.4f | %.2fs)",
            model,
            total_tokens,
            cost_summary["cost_usd"],
            processing_time
        )
        
        return {
            "parsed": parsed,
            "raw_output": output_text,
            "model_used": model,
            "tokens_used": tokens_used,
            "processing_time_seconds": processing_time,
            "estimated_cost_usd": cost_summary["cost_usd"],
            "use_mini": plan["use_mini"]
        }
    
    def extract_structured_summary_data(
        self,
        extraction_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Extract structured summary data for frontend display.
        This provides the individual fields for bullet-point display,
        separate from the conversational summary text.
        
        Returns:
            Dictionary with structured fields for UI display
        """
        try:
            # Get entities if enhanced extraction
            entities = extraction_data.get('entities', {})
            business_intel = extraction_data.get('business_intelligence', {})
            doc_meta = entities.get('document_metadata', {}) if entities else extraction_data.get('document_metadata', {})
            tables = extraction_data.get('tables', [])
            
            # ✅ BROKER COMPANY EXTRACTION - Multiple fallback paths for reliability
            # Priority order:
            # 1. entities.broker.company_name (Claude enhanced)
            # 2. document_metadata.broker_company (GPT-5 transformed)
            # 3. broker_agent.company_name (GPT-5 raw)
            # 4. Top-level broker_company (fallback)
            broker_company = None
            if entities and entities.get('broker', {}).get('company_name'):
                broker_company = entities['broker']['company_name']
                logger.debug(f"📋 Broker from entities.broker: {broker_company}")
            elif doc_meta.get('broker_company'):
                broker_company = doc_meta.get('broker_company')
                logger.debug(f"📋 Broker from document_metadata: {broker_company}")
            elif extraction_data.get('broker_agent', {}).get('company_name'):
                broker_company = extraction_data['broker_agent']['company_name']
                logger.debug(f"📋 Broker from broker_agent: {broker_company}")
            elif extraction_data.get('broker_company'):
                broker_company = extraction_data.get('broker_company')
                logger.debug(f"📋 Broker from top-level: {broker_company}")
            
            # ✅ CARRIER NAME EXTRACTION - Multiple fallback paths
            carrier_name = None
            if entities and entities.get('carrier', {}).get('name'):
                carrier_name = entities['carrier']['name']
            elif doc_meta.get('carrier_name'):
                carrier_name = doc_meta.get('carrier_name')
            elif extraction_data.get('carrier', {}).get('name'):
                carrier_name = extraction_data['carrier']['name']
            elif extraction_data.get('carrier_name'):
                carrier_name = extraction_data.get('carrier_name')
            
            # ✅ CRITICAL FIX: Get company count from groups_and_companies array (most reliable)
            # GPT sometimes returns row count in business_intelligence.number_of_groups
            # The actual unique companies are in the groups_and_companies array
            groups_and_companies = extraction_data.get('groups_and_companies', [])
            unique_company_count = len(groups_and_companies) if groups_and_companies else None
            
            # Fallback: Try business_intelligence if groups_and_companies is empty
            if not unique_company_count and business_intel:
                unique_company_count = business_intel.get('number_of_groups')
            
            # Extract structured fields
            structured_data = {
                'broker_id': doc_meta.get('statement_number') or doc_meta.get('document_number'),
                'carrier_name': carrier_name,
                'broker_company': broker_company,
                'statement_date': doc_meta.get('statement_date'),
                'payment_type': doc_meta.get('payment_type'),
                'total_amount': None,  # Will be processed below
                'company_count': unique_company_count,  # ✅ Use count from groups_and_companies array
                'broker_id_confidence': 0.95 if doc_meta.get('statement_number') else 0.7
            }
            
            # ✅ LOG EXTRACTION for debugging
            logger.info(f"📊 Extracted structured fields: broker_company='{broker_company}', carrier='{carrier_name}', company_count={unique_company_count} (from {len(groups_and_companies)} groups_and_companies)")
            
            # Convert total_amount (check doc_meta first, then business_intel)
            total_from_doc = doc_meta.get('total_amount')
            if total_from_doc:
                try:
                    structured_data['total_amount'] = str(float(total_from_doc))
                except (ValueError, TypeError):
                    pass
            
            if not structured_data.get('total_amount') and business_intel:
                # Try multiple field names for total commission
                raw_amount = (business_intel.get('total_commission_amount') or 
                             business_intel.get('total_commission') or
                             business_intel.get('total_amount'))
                if raw_amount:
                    try:
                        if isinstance(raw_amount, str):
                            cleaned = raw_amount.replace('$', '').replace(',', '').strip()
                            if cleaned and cleaned != 'Not specified':
                                structured_data['total_amount'] = cleaned
                        elif isinstance(raw_amount, (int, float)):
                            structured_data['total_amount'] = str(float(raw_amount))
                    except (ValueError, TypeError, AttributeError):
                        pass
            
            # Extract top_contributors from business_intelligence
            if business_intel and business_intel.get('top_contributors'):
                top_contributors = business_intel.get('top_contributors', [])
                # Format: [{'name': '...', 'amount': '$123.45'}]
                formatted_contributors = []
                for contrib in top_contributors[:3]:  # Top 3 only
                    if isinstance(contrib, dict) and 'name' in contrib and 'amount' in contrib:
                        amount_str = str(contrib['amount']).replace('$', '').replace(',', '').strip()
                        formatted_contributors.append({
                            'name': contrib['name'],
                            'amount': amount_str
                        })
                if formatted_contributors:
                    structured_data['top_contributors'] = formatted_contributors
            
            # Extract commission_structure from business_intelligence
            if business_intel and business_intel.get('commission_structures'):
                structures = business_intel.get('commission_structures', [])
                if structures:
                    structured_data['commission_structure'] = ', '.join(structures[:2])  # First 2
            
            # Extract census_count from business_intelligence first, then tables
            if business_intel and business_intel.get('total_census_count'):
                structured_data['census_count'] = str(business_intel.get('total_census_count'))
            
            # Extract billing_periods from business_intelligence first
            if business_intel and business_intel.get('billing_period_range'):
                structured_data['billing_periods'] = business_intel.get('billing_period_range')
            
            # Extract census_count from tables or groups
            if tables and len(tables) > 0:
                table = tables[0]
                headers = table.get('headers', []) or table.get('header', [])
                rows = table.get('rows', [])
                
                # Try to find census count column
                census_col_idx = None
                for idx, header in enumerate(headers):
                    if 'census' in str(header).lower():
                        census_col_idx = idx
                        break
                
                if census_col_idx is not None and rows:
                    total_census = 0
                    for row in rows:
                        if census_col_idx < len(row):
                            try:
                                val = str(row[census_col_idx]).replace(',', '').strip()
                                census = int(val)
                                if census > 0:  # Only positive values
                                    total_census += census
                            except (ValueError, TypeError):
                                pass
                    if total_census > 0:
                        structured_data['census_count'] = str(total_census)
                
                # Extract billing_periods from table rows
                billing_col_idx = None
                for idx, header in enumerate(headers):
                    if 'billing' in str(header).lower() or 'period' in str(header).lower():
                        billing_col_idx = idx
                        break
                
                if billing_col_idx is not None and rows:
                    periods = set()
                    for row in rows:
                        if billing_col_idx < len(row):
                            period = str(row[billing_col_idx]).strip()
                            if period and period != '':
                                periods.add(period)
                    if periods:
                        periods_list = sorted(list(periods))
                        if len(periods_list) == 1:
                            structured_data['billing_periods'] = periods_list[0]
                        elif len(periods_list) == 2:
                            structured_data['billing_periods'] = f"{periods_list[0]} - {periods_list[1]}"
                        else:
                            structured_data['billing_periods'] = f"{periods_list[0]} - {periods_list[-1]}"
            
            # Remove None values
            structured_data = {k: v for k, v in structured_data.items() if v is not None}
            
            logger.info(f"✅ Extracted structured summary data ({len(structured_data)} fields): {list(structured_data.keys())}")
            return structured_data
            
        except Exception as e:
            logger.error(f"❌ Error extracting structured summary data: {e}")
            logger.exception("Full traceback:")
            return {}
    
    async def generate_conversational_summary(
        self,
        extraction_data: Dict[str, Any],
        document_context: Dict[str, Any],
        use_enhanced: bool = False
    ) -> Dict[str, Any]:
        """
        Generate a conversational summary from technical extraction data using GPT-5.
        """
        if not self.is_available():
            logger.warning("⚠️ GPT-5 summary service unavailable. Falling back to template summary.")
            return self._generate_fallback_summary(extraction_data)
        
        logger.info("🗣️ Generating conversational summary with GPT-5 (Responses API)...")
        start_time = datetime.now()
        structured_data = self.extract_structured_summary_data(extraction_data) or {}
        
        try:
            prompt = self._build_summary_prompt(extraction_data, document_context, use_enhanced)
            system_prompt = self._get_system_prompt(use_enhanced)
            
            gpt_result = await self.circuit_breaker.call(
                self._generate_with_gpt5,
                prompt,
                system_prompt,
                use_enhanced
            )
            
            parsed = gpt_result.get("parsed", {}) or {}
            summary_text = parsed.get("conversational_summary", "").strip()
            if not summary_text:
                summary_text = parsed.get("summary", "").strip()
            key_value_data = parsed.get("key_value_data") or {}
            
            final_structured_data = {**structured_data, **key_value_data}
            logger.info(
                "📊 Summary fields merged: GPT=%s, fallback=%s",
                list(key_value_data.keys()),
                list(structured_data.keys())
            )
            logger.info("📄 Generated summary length: %s characters", len(summary_text))
            
            total_processing_time = (datetime.now() - start_time).total_seconds()
            
            return {
                "success": True,
                "summary": summary_text,
                "structured_data": final_structured_data,
                "processing_time": total_processing_time,
                "model": gpt_result.get("model_used", self.primary_model),
                "approach": "gpt5_responses_structured",
                "tokens_used": gpt_result.get("tokens_used"),
                "estimated_cost_usd": gpt_result.get("estimated_cost_usd"),
                "generation_stats": {
                    "processing_time_seconds": gpt_result.get("processing_time_seconds"),
                    "use_mini": gpt_result.get("use_mini"),
                    "rate_limit_usage": self.rate_limiter.get_current_usage(),
                    "token_tracker": self.token_tracker.get_summary()
                }
            }
        
        except Exception as e:
            logger.error("❌ GPT-5 summary generation failed: %s", e)
            logger.exception("Full traceback:")
            fallback_result = self._generate_fallback_summary(extraction_data)
            logger.warning("⚠️ Using fallback summary due to GPT-5 failure.")
            return fallback_result
    
    def _get_system_prompt(self, use_enhanced: bool = False) -> str:
        """
        Enhanced system prompt with research-backed techniques
        
        Based on:
        - Anthropic's prompt engineering guide (XML structure)
        - Google's CoT research
        - Industry best practices for conversational AI
        
        Args:
            use_enhanced: If True, use the enhanced summarization system prompt
        """
        if use_enhanced:
            # Import enhanced prompts (FIXED PATH)
            try:
                from app.services.claude.enhanced_prompts import EnhancedClaudePrompts
                logger.info("✅ SUCCESS: Enhanced prompts imported correctly")
                return EnhancedClaudePrompts.get_intelligent_summarization_system_prompt()
            except ImportError as e:
                logger.error(f"❌ CRITICAL: Enhanced prompts import failed: {e}")
                logger.error("Enhanced prompts should be at app/services/claude/enhanced_prompts.py")
                logger.error("Falling back to standard prompt - enhanced features will be disabled")
                # Don't raise - allow graceful fallback but log the error clearly
        
        return """You are an expert financial document analyst specializing in insurance commission statements, with a talent for explaining complex documents in clear, conversational language.

<role_definition>
Your expertise: You've analyzed thousands of commission statements from carriers like Aetna, UnitedHealthcare, Cigna, and Blue Cross. You understand:
- Different commission structures (PEPM, percentage-based, tiered)
- Plan types (Medical, Dental, Vision, Life)
- Industry terminology (subscribers, groups, base/incentive compensation)
- What brokers and agents care about most

Your communication style: Like Google Gemini's document summaries - natural, conversational, and information-rich. You speak like a knowledgeable colleague explaining a document over coffee, not a robot reading fields.
</role_definition>

<quality_standards>
Your summaries must be:
1. **Accurate**: Every number, date, and name must be exact from the source data
2. **Comprehensive**: Include WHO (carrier, broker), WHAT (commission breakdown), WHEN (date, period), HOW MUCH (total, top earners), and WHY (plan types, special payments)
3. **Conversational**: Use flowing sentences, not bullet points or labels
4. **Specific**: Mention actual company names, amounts, and plan types - not generic terms
5. **Contextual**: Highlight what's notable (largest payments, unusual items, plan diversity)
6. **Concise**: 3-4 sentences maximum, but packed with information
</quality_standards>

<communication_rules>
DO:
- Start with "This is a..." or "This document shows..."
- Mention specific numbers and names (e.g., "K&K SOLOMON LOGISTICS earned $1,071.80")
- Highlight interesting patterns (e.g., "including a $550 lump sum incentive")
- Use natural transitions ("The document shows...", "Notable payments include...")
- Write how a human would explain it

DON'T:
- Use field labels (❌ "Carrier: Aetna" → ✅ "This is an Aetna statement")
- List items with bullets (❌ "• Company 1\n• Company 2" → ✅ "across 8 companies including...")
- Be vague (❌ "various companies" → ✅ "8 logistics companies")
- Skip notable details (❌ ignore largest payment → ✅ "with K&K SOLOMON as the largest contributor")
- Add unnecessary pleasantries (❌ "I hope this helps!" → ✅ end with key facts)
</communication_rules>

<output_format>
⭐ **CRITICAL**: You MUST return your response as JSON with two parts:

{
  "conversational_summary": "Your natural language summary here...",
  "key_value_data": {
    "carrier_name": "Exact carrier name",
    "broker_company": "Exact broker company name",
    "statement_date": "YYYY-MM-DD format",
    "broker_id": "Document/statement number if present",
    "payment_type": "EFT/Check/Wire",
    "total_amount": "Numeric string (e.g., '1027.20')",
    "company_count": "Number of companies/groups",
    "top_contributors": [
      {"name": "Company Name", "amount": "123.45"}
    ],
    "commission_structure": "Brief description of commission types",
    "census_count": "Total census if present",
    "billing_periods": "Period range if present"
  }
}

Your conversational_summary structure (3-4 sentences):
Sentence 1: Document type, carrier, broker, and date
Sentence 2: Total amount, company count, and top 1-2 contributors with amounts
Sentence 3: Plan type breakdown or notable characteristics (lump sums, incentives, PEPM structure)
(Optional 4th): Additional context if document has unique features

Keep it flowing and natural - these sentences should read as one cohesive paragraph.

⚠️ IMPORTANT: Extract as many key_value_data fields as possible from the source data. Include ALL fields that have values.
</output_format>

Remember: You're not just reporting data - you're telling the story of this commission statement AND providing structured fields for the UI."""
    

    def _build_summary_prompt(
        self,
        extraction_data: Dict[str, Any],
        document_context: Dict[str, Any],
        use_enhanced: bool = False
    ) -> str:
        """Build a compact summary prompt that respects tight token limits."""
        has_enhanced_data = (
            'entities' in extraction_data or
            'business_intelligence' in extraction_data or
            'relationships' in extraction_data
        )

        logger.info("🔍 _build_summary_prompt called:")
        logger.info(f"   - use_enhanced: {use_enhanced}")
        logger.info(f"   - has_enhanced_data: {has_enhanced_data}")

        enhanced_context_block = ""
        if has_enhanced_data and use_enhanced:
            logger.info("✅ Attaching condensed enhanced context to prompt")
            enhanced_context_block = self._build_enhanced_context_block(extraction_data)
        elif use_enhanced:
            logger.warning("⚠️ Enhanced mode requested but enhanced data missing; defaulting to compact prompt")

        # ✅ Extract from structured_data if already populated (from extract_structured_summary_data)
        # This ensures we use the correctly extracted broker_company from multiple fallback paths
        carrier = extraction_data.get('carrier_name') or extraction_data.get('extracted_carrier') or 'Unknown'
        date = extraction_data.get('statement_metadata', {}).get('statement_date') or extraction_data.get('document_metadata', {}).get('statement_date') or extraction_data.get('extracted_date') or 'Unknown date'
        
        # ✅ CRITICAL: Check document_metadata first (transformed by GPT-5), then broker_agent (raw), then fallback
        broker = (extraction_data.get('document_metadata', {}).get('broker_company') or 
                 extraction_data.get('broker_agent', {}).get('company_name') or 
                 extraction_data.get('broker_company') or 
                 'Unknown')
        
        tables = extraction_data.get('tables', [])
        total_amount = self._extract_total_amount(tables)
        
        # ✅ CRITICAL FIX: Get company count from groups_and_companies array (most reliable source)
        # This array contains the actual extracted unique companies, not row count
        groups_and_companies = extraction_data.get('groups_and_companies', [])
        company_count = len(groups_and_companies) if groups_and_companies else None
        
        # Fallback: Try business_intelligence if groups_and_companies is empty
        if not company_count:
            business_intel = extraction_data.get('business_intelligence', {})
            company_count = business_intel.get('number_of_groups') if business_intel else None
        
        # Final fallback: Count from tables
        if not company_count:
            company_count = extraction_data.get('document_metadata', {}).get('company_count') or self._count_unique_companies(tables)
        top_companies = self._get_top_companies(tables, limit=3)
        special_payments = self._identify_special_payments(tables)
        plan_types = self._extract_plan_types(tables)
        payment_period = self._extract_payment_period(tables)
        broker_id = self._extract_broker_id(extraction_data, document_context)
        payment_type = extraction_data.get('document_metadata', {}).get('payment_type', 'Unknown')
        carrier_context = self._get_carrier_context(carrier.lower())
        carrier_type = self._get_carrier_type(carrier)
        formatted_date = self._format_date_conversational(date)
        document_metadata = extraction_data.get('document_metadata', {}) or {}
        business_intel = extraction_data.get('business_intelligence', {}) or {}
        metadata_total_str = self._format_currency_value(document_metadata.get('total_amount'))
        metadata_method = document_metadata.get('total_extraction_method', 'unknown')
        detail_sum_str = self._format_currency_value(document_metadata.get('detail_sum_amount'))
        bi_total_str = self._format_currency_value(
            business_intel.get('total_commission_amount') or business_intel.get('total_commission')
        )
        total_rows = sum(len(t.get('rows', [])) for t in tables)
        total_candidates = document_metadata.get('total_candidates') or []

        preferred_total_hint = metadata_total_str
        if preferred_total_hint == "Not captured" and detail_sum_str != "Not captured":
            preferred_total_hint = detail_sum_str
        if preferred_total_hint == "Not captured" and total_amount and total_amount != "Not specified":
            preferred_total_hint = total_amount
        if preferred_total_hint == "Not captured" and bi_total_str != "Not captured":
            preferred_total_hint = bi_total_str

        totals_section = [
            f"- Metadata total ({metadata_method}): {metadata_total_str}",
            f"- Detail rows sum: {detail_sum_str}",
            f"- Table heuristic total: {total_amount}",
            f"- Business intelligence total: {bi_total_str}"
        ]
        if total_candidates:
            strongest = max(total_candidates, key=lambda c: c.get('confidence', 0))
            totals_section.append(
                f"- Highest-confidence candidate: {strongest.get('method')} (${strongest.get('amount'):,.2f})"
            )

        prompt_sections = [
            f"""<context>
You are an insurance commission statement analyst producing a concise summary for broker operations.

Document Snapshot:
- Carrier: {carrier} ({carrier_type})
- Broker/Agent: {broker}
- Statement Date: {date} ({formatted_date})
- Document/Broker ID: {broker_id if broker_id else 'Not provided'}
- Payment Type: {payment_type}
- File Name: {document_context.get('file_name', 'Unknown')}
- Pages: {document_context.get('page_count', 'Unknown')}
- Extraction Method: {document_context.get('extraction_method', 'AI')}
{carrier_context.strip() if carrier_context else ''}
</context>""",
            "<totals>\n"
            + "\n".join(totals_section)
            + f"\nPreferred total to cite (apply judgment): {preferred_total_hint}\n</totals>",
            f"""<data_highlights>
- Company/group count: {company_count}
- Tables extracted: {len(tables)} with {total_rows} rows
- Billing / payment period cue: {payment_period if payment_period else 'Not specified'}
- Top contributors:
{self._format_top_companies(top_companies)}
- Commission / plan mix: {self._format_plan_types(plan_types)}
- Special payments or incentives:
{self._format_special_payments(special_payments)}
</data_highlights>""",
            """<instructions>
1. Write a natural 3-4 sentence paragraph beginning with "This is..." that covers carrier, broker, statement date, payment type, and document type.
2. Always mention the most authoritative total (metadata > detail sum > table heuristic > business intelligence) and reuse that number in key_value_data.total_amount (numeric string, no $ or commas).
3. Include company/group count, top contributors with exact amounts, notable plan types or commission structures, and any incentives/adjustments.
4. Mention payment period cues when available and keep the tone conversational—no bullet points or field labels.
</instructions>""",
            f"""<output_format>
Return ONLY valid JSON:
{{
  "conversational_summary": "3-4 sentence natural paragraph...",
  "key_value_data": {{
    "carrier_name": "{carrier}",
    "broker_company": "{broker}",
    "statement_date": "{date}",
    "broker_id": "{broker_id if broker_id else 'null'}",
    "payment_type": "{payment_type}",
    "total_amount": "numeric string for the same total cited above (no $ or commas)",
    "company_count": {company_count},
    "top_contributors": [
      {{"name": "Name", "amount": "1234.56"}}
    ],
    "commission_structure": "Summarize plan/commission mix",
    "census_count": "If known else null",
    "billing_periods": "{payment_period if payment_period else 'null'}"
  }}
}}
</output_format>"""
        ]

        if enhanced_context_block:
            prompt_sections.append(f"<enhanced_context>\n{enhanced_context_block}\n</enhanced_context>")

        return "\n\n".join(prompt_sections)
    def _get_carrier_context(self, carrier_lower: str) -> str:
        """
        Provide carrier-specific context to make summaries more accurate
        
        Different carriers have different document structures and terminology.
        This helps the AI generate more appropriate summaries.
        """
        
        # Normalize carrier name for matching
        carrier_lower = carrier_lower.strip()
        
        # UnitedHealthcare / UHC variations
        if any(name in carrier_lower for name in ['united', 'uhc', 'unitedhealthcare']):
            return """
**Carrier-Specific Context (UnitedHealthcare):**
- UHC statements typically include enrollment data (subscribers, member counts)
- Often shows commission breakdowns by plan type (Medical, Dental, Vision, etc.)
- May include PEPM (Per Employee Per Month) rates
- Group names are usually client companies with enrollment numbers
- Statement format: Usually separates base commission, overrides, and bonuses
"""
        
        # Aetna
        elif 'aetna' in carrier_lower:
            return """
**Carrier-Specific Context (Aetna):**
- Aetna statements focus on commission amounts by client company
- Typically shows Base Compensation, Incentive Compensation, and Lump Sum payments
- Format is usually straightforward with customer names and net compensation
- May include producer/broker information and location details
"""
        
        # Cigna
        elif 'cigna' in carrier_lower:
            return """
**Carrier-Specific Context (Cigna):**
- Cigna statements often include detailed breakdown by case/group
- May show medical, dental, and behavioral health separately
- Commission structure can include tiered rates based on performance
- Group information typically includes size and premium details
"""
        
        # Blue Cross Blue Shield variations
        elif any(name in carrier_lower for name in ['blue cross', 'bcbs', 'blue shield']):
            return """
**Carrier-Specific Context (Blue Cross Blue Shield):**
- BCBS statements vary by state and may include regional information
- Often shows breakdown by product line (HMO, PPO, etc.)
- May include renewal vs new business distinction
- Group information typically includes member counts and premium
"""
        
        # Humana
        elif 'humana' in carrier_lower:
            return """
**Carrier-Specific Context (Humana):**
- Humana statements often separate Medicare from commercial business
- May include member counts and PEPM details
- Commission structure can vary by product line
- Typically shows group names with enrollment and commission details
"""
        
        # Kaiser Permanente
        elif 'kaiser' in carrier_lower:
            return """
**Carrier-Specific Context (Kaiser Permanente):**
- Kaiser statements are typically regional (specific service areas)
- May include enrollment data and member months
- Commission structure often based on group size tiers
- Shows detailed breakdown by medical group
"""
        
        # Generic fallback for unknown carriers
        else:
            return f"""
**Carrier-Specific Context ({carrier_lower.title()}):**
- This is a commission statement from {carrier_lower.title()}
- Statement likely includes client/group names with corresponding commission amounts
- May show breakdown by plan type, enrollment data, or payment structure
- Focus on the key financial details and what they mean for the broker
"""
    
    def _format_date_conversational(self, date_str: str) -> str:
        """Convert date to conversational format"""
        try:
            # Try parsing common formats
            if isinstance(date_str, str):
                from dateutil import parser
                date_obj = parser.parse(date_str)
                return date_obj.strftime("%B %d, %Y")  # "March 11, 2025"
        except:
            pass
        return date_str

    def _format_currency_value(self, value: Any) -> str:
        """Normalize numeric or string values into $X,XXX.XX strings."""
        if value in (None, "", "Not specified"):
            return "Not captured"
        try:
            if isinstance(value, str):
                cleaned = (
                    value.replace("$", "")
                    .replace(",", "")
                    .replace("(", "-")
                    .replace(")", "")
                    .strip()
                )
                if not cleaned:
                    return "Not captured"
                numeric = float(cleaned)
            else:
                numeric = float(value)
            return f"${numeric:,.2f}"
        except (ValueError, TypeError):
            return str(value)
    
    def _extract_total_amount(self, tables: list) -> str:
        """
        Extract total commission amount from tables using multi-strategy approach.
        Returns formatted string like "$1,027.20" or "Not specified"
        """
        try:
            # STRATEGY 1: Check summary rows first (most reliable)
            for table in tables:
                rows = table.get('rows', [])
                summary_rows = table.get('summaryRows', [])
                
                for row_idx in summary_rows:
                    if row_idx < len(rows):
                        row = rows[row_idx]
                        row_text = ' '.join(str(cell).lower() for cell in row)
                        
                        # Check if this is a total row
                        if any(kw in row_text for kw in ['total', 'vendor', 'grand', 'net payment']):
                            for cell in row:
                                cell_str = str(cell)
                                if '$' in cell_str or (cell_str.replace(',', '').replace('.', '').isdigit() and '.' in cell_str):
                                    # Clean and return
                                    amount_clean = cell_str.strip().replace('$', '').replace(',', '')
                                    try:
                                        amount_float = float(amount_clean)
                                        if amount_float > 0:
                                            return f"${amount_float:,.2f}"
                                    except ValueError:
                                        continue
            
            # STRATEGY 2: Check last 5 rows of each table
            for table in tables:
                rows = table.get('rows', [])
                if not rows:
                    continue
                
                for row in reversed(rows[-5:]):
                    row_text = ' '.join(str(cell).lower() for cell in row)
                    
                    # Look for total indicators
                    if any(kw in row_text for kw in ['total', 'vendor', 'grand']):
                        for cell in row:
                            cell_str = str(cell)
                            # Match dollar amounts
                            if '$' in cell_str:
                                amount_clean = cell_str.strip().replace('$', '').replace(',', '')
                                try:
                                    amount_float = float(amount_clean)
                                    if amount_float > 10:  # Reasonable minimum
                                        return f"${amount_float:,.2f}"
                                except ValueError:
                                    continue
            
            # STRATEGY 3: Calculate from data (if no explicit total found)
            logger.debug("No explicit total found, attempting to calculate from data rows")
            for table in tables:
                headers = table.get('headers', []) or table.get('header', [])
                rows = table.get('rows', [])
                
                # Find amount column
                amount_col = None
                for idx, header in enumerate(headers):
                    h_lower = str(header).lower()
                    if any(kw in h_lower for kw in ['paid amount', 'commission', 'net compensation', 'amount paid']):
                        amount_col = idx
                        break
                
                if amount_col is not None:
                    calculated = 0.0
                    for row in rows:
                        if amount_col < len(row):
                            cell_str = str(row[amount_col])
                            # Parse amount
                            amount_clean = cell_str.replace('$', '').replace(',', '').replace('(', '-').replace(')', '')
                            try:
                                amount = float(amount_clean)
                                calculated += amount
                            except ValueError:
                                continue
                    
                    if calculated > 0:
                        logger.info(f"Calculated total from data rows: ${calculated:,.2f}")
                        return f"${calculated:,.2f} (calculated)"
            
            return "Not specified"
            
        except Exception as e:
            logger.error(f"Error extracting total amount: {e}")
            return "Not specified"
    
    def _count_unique_companies(self, tables: list) -> int:
        """Count unique companies in commission data"""
        try:
            companies = set()
            for table in tables:
                rows = table.get('rows', [])
                headers = table.get('header', []) or table.get('headers', [])
                
                # Find company/customer column
                company_col_idx = None
                for idx, header in enumerate(headers):
                    header_lower = str(header).lower()
                    if any(keyword in header_lower for keyword in ['company', 'customer', 'client', 'name', 'group']):
                        company_col_idx = idx
                        break
                
                if company_col_idx is not None:
                    for row in rows:
                        if company_col_idx < len(row):
                            company_name = str(row[company_col_idx]).strip()
                            # Only add non-empty, non-total rows
                            if company_name and not any(keyword in company_name.lower() for keyword in ['total', 'subtotal', 'grand']):
                                companies.add(company_name)
            
            return len(companies)
        except Exception as e:
            logger.debug(f"Error counting companies: {e}")
            return 0
    
    def _generate_fallback_summary(self, extraction_data: Dict[str, Any]) -> Dict[str, Any]:
        """Fallback to structured format if AI generation fails"""
        logger.warning("🔄 Generating fallback summary...")
        structured_data = self.extract_structured_summary_data(extraction_data) or {}
        doc_metadata = extraction_data.get('document_metadata', {}) or {}
        
        # Try to extract from entities if available (enhanced extraction)
        entities = extraction_data.get('entities', {})
        if entities:
            carrier = entities.get('carrier', {}).get('name') or 'Unknown'
            broker = entities.get('broker', {}).get('company_name') or 'Unknown'
            doc_meta = entities.get('document_metadata', {})
            date = doc_meta.get('statement_date') or 'Unknown'
            doc_metadata = doc_meta or doc_metadata
            logger.info(f"   Using entity data: carrier={carrier}, broker={broker}, date={date}")
        else:
            # Fall back to standard extraction data
            carrier = extraction_data.get('carrier_name') or extraction_data.get('extracted_carrier') or 'Unknown'
            date = extraction_data.get('statement_date') or extraction_data.get('extracted_date') or 'Unknown'
            
            # ✅ CRITICAL: Check multiple paths for broker_company (same as structured data extraction)
            broker = (doc_metadata.get('broker_company') or 
                     extraction_data.get('broker_agent', {}).get('company_name') or 
                     extraction_data.get('broker_company') or 
                     'Unknown')
            
            logger.info(f"   Using standard data: carrier={carrier}, broker={broker}, date={date}")
        
        # Try to get document metadata from root level too
        if doc_metadata and carrier == 'Unknown':
            carrier = doc_metadata.get('carrier_name', 'Unknown')
        if doc_metadata and date == 'Unknown':
            date = doc_metadata.get('statement_date', 'Unknown')
        
        # ✅ ENHANCED: Build more detailed fallback summary
        summary_parts = [f"Commission statement from {carrier}"]
        
        # Add date if available
        if date and date != 'Unknown':
            summary_parts.append(f"for period ending {date}")
        
        # Add broker if available
        if broker and broker != 'Unknown':
            summary_parts.append(f"prepared for {broker}")
        
        # Add total amount if available
        total_amount = doc_metadata.get('total_amount') if doc_metadata else None
        formatted_total = self._format_currency_value(total_amount)
        if formatted_total != "Not captured":
            summary_parts.append(f"Total commission: {formatted_total}")
        
        # Add number of groups if available
        tables = extraction_data.get('tables', [])
        if tables:
            total_rows = sum(len(table.get('rows', [])) for table in tables)
            if total_rows > 0:
                summary_parts.append(f"{total_rows} commission entries across {len(tables)} table(s)")
        
        summary = ". ".join(summary_parts) + "."
        
        logger.warning(f"   Fallback summary: {summary}")
        
        return {
            "success": True,
            "summary": summary,
            "processing_time": 0,
            "model": "fallback",
            "approach": "template_based",
            "structured_data": structured_data
        }
    
    # ============================================
    # Data Analysis Helper Methods (Research-Based)
    # ============================================
    
    def _get_top_companies(self, tables: list, limit: int = 3) -> list:
        """
        Extract top N companies by commission amount
        
        Returns list of (company_name, amount) tuples
        """
        try:
            company_amounts = []
            
            for table in tables:
                rows = table.get('rows', [])
                headers = table.get('header', []) or table.get('headers', [])
                
                # Find company and amount columns
                company_col = None
                amount_col = None
                
                for idx, header in enumerate(headers):
                    header_lower = str(header).lower()
                    if any(kw in header_lower for kw in ['company', 'customer', 'client', 'name', 'group']):
                        company_col = idx
                    if any(kw in header_lower for kw in ['total', 'net compensation', 'amount', 'commission']):
                        amount_col = idx
                
                if company_col is not None and amount_col is not None:
                    for row in rows:
                        if len(row) > max(company_col, amount_col):
                            company = str(row[company_col]).strip()
                            amount_str = str(row[amount_col]).strip()
                            
                            # Skip total rows
                            if any(kw in company.lower() for kw in ['total', 'subtotal', 'grand']):
                                continue
                            
                            # Parse amount
                            try:
                                amount = float(amount_str.replace('$', '').replace(',', ''))
                                if amount > 0:
                                    company_amounts.append((company, amount))
                            except:
                                continue
            
            # Sort by amount descending and return top N
            company_amounts.sort(key=lambda x: x[1], reverse=True)
            return company_amounts[:limit]
            
        except Exception as e:
            logger.debug(f"Error extracting top companies: {e}")
            return []
    
    def _identify_special_payments(self, tables: list) -> list:
        """
        Identify special payments like bonuses, lump sums, incentives
        
        Returns list of (description, amount) tuples
        """
        special_keywords = [
            'bonus', 'incentive', 'lump sum', 'override', 'adjustment',
            'new business', 'production', 'annual', 'quarterly'
        ]
        
        special_payments = []
        
        try:
            for table in tables:
                rows = table.get('rows', [])
                
                for row in rows:
                    row_text = ' '.join(str(cell) for cell in row).lower()
                    
                    # Check if row contains special payment keywords
                    for keyword in special_keywords:
                        if keyword in row_text:
                            # Extract amount from row
                            for cell in row:
                                cell_str = str(cell)
                                if '$' in cell_str:
                                    special_payments.append((keyword, cell_str.strip()))
                                    break
            
            return special_payments
            
        except Exception as e:
            logger.debug(f"Error identifying special payments: {e}")
            return []
    
    def _extract_plan_types(self, tables: list) -> list:
        """
        Extract plan types mentioned in the document
        
        Returns list of plan types found
        """
        plan_keywords = {
            'Medical': ['medical', 'md medical', 'health'],
            'Dental': ['dental'],
            'Vision': ['vision'],
            'Life': ['life insurance', 'life'],
            'Disability': ['disability', 'std', 'ltd'],
            'Behavioral Health': ['behavioral', 'mental health'],
            'PEPM': ['pepm', 'per employee per month']
        }
        
        found_plans = set()
        
        try:
            # Search through all table content
            for table in tables:
                rows = table.get('rows', [])
                headers = table.get('header', []) or table.get('headers', [])
                
                all_text = ' '.join(str(cell) for row in [headers] + rows for cell in row).lower()
                
                for plan_type, keywords in plan_keywords.items():
                    if any(keyword in all_text for keyword in keywords):
                        found_plans.add(plan_type)
            
            return list(found_plans)
            
        except Exception as e:
            logger.debug(f"Error extracting plan types: {e}")
            return []
    
    def _extract_payment_period(self, tables: list) -> str:
        """
        Extract the payment or activity period (e.g., "Feb 2025 Subscribers")
        
        Returns period description or empty string
        """
        months = ['january', 'february', 'march', 'april', 'may', 'june',
                  'july', 'august', 'september', 'october', 'november', 'december',
                  'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
        
        try:
            for table in tables:
                rows = table.get('rows', [])
                
                for row in rows:
                    row_text = ' '.join(str(cell) for cell in row).lower()
                    
                    # Look for patterns like "Feb 2025 Subscribers" or "January 2025"
                    if any(month in row_text for month in months):
                        if 'subscriber' in row_text or '2025' in row_text or '2024' in row_text:
                            # Extract the relevant part
                            for cell in row:
                                cell_str = str(cell)
                                if any(month in cell_str.lower() for month in months):
                                    return cell_str.strip()
            
            return ""
            
        except Exception as e:
            logger.debug(f"Error extracting payment period: {e}")
            return ""
    
    def _format_top_companies(self, top_companies: list) -> str:
        """Format top companies for display in prompt"""
        if not top_companies:
            return "No specific top earners identified"
        
        lines = []
        for idx, (company, amount) in enumerate(top_companies, 1):
            lines.append(f"{idx}. {company}: ${amount:,.2f}")
        
        return '\n'.join(lines)
    
    def _format_plan_types(self, plan_types: list) -> str:
        """Format plan types for display in prompt"""
        if not plan_types:
            return "Plan types not clearly identified"
        
        return ', '.join(plan_types)
    
    def _format_special_payments(self, special_payments: list) -> str:
        """Format special payments for display in prompt"""
        if not special_payments:
            return "No special payments or bonuses identified"
        
        lines = []
        seen = set()
        for payment_type, amount in special_payments:
            key = (payment_type, amount)
            if key not in seen:
                lines.append(f"- {payment_type.title()}: {amount}")
                seen.add(key)
        
        return '\n'.join(lines)
    
    def _get_carrier_type(self, carrier: str) -> str:
        """Determine carrier type/category"""
        carrier_lower = carrier.lower()
        
        if any(name in carrier_lower for name in ['united', 'uhc']):
            return "National carrier (enrollment-focused)"
        elif 'aetna' in carrier_lower:
            return "National carrier (commission-focused)"
        elif 'cigna' in carrier_lower:
            return "National carrier (tiered structure)"
        elif any(name in carrier_lower for name in ['blue cross', 'bcbs']):
            return "Regional carrier (state-specific)"
        else:
            return "Insurance carrier"
    
    def _extract_broker_id(self, extraction_data: dict, document_context: dict) -> str:
        """
        Extract broker ID, document number, or statement ID.
        Common formats: G0227540, #12345, Statement: 001234, NPN: 123456
        """
        try:
            # Check document metadata first
            doc_meta = extraction_data.get('document_metadata', {})
            
            # Check for statement number/document ID
            if 'statement_number' in doc_meta:
                return doc_meta['statement_number']
            if 'document_number' in doc_meta:
                return doc_meta['document_number']
            if 'document_id' in doc_meta:
                return doc_meta['document_id']
            
            # Check file name for ID patterns
            filename = document_context.get('file_name', '')
            
            # Pattern 1: Alphanumeric starting with letter (e.g., G0227540)
            import re
            match = re.search(r'[A-Z]\d{6,10}', filename.upper())
            if match:
                return match.group(0)
            
            # Pattern 2: Pure numeric ID (e.g., 12345678)
            match = re.search(r'\b\d{6,10}\b', filename)
            if match:
                return match.group(0)
            
            return None
            
        except Exception as e:
            logger.debug(f"Error extracting broker ID: {e}")
            return None
    

    def _build_enhanced_context_block(
        self,
        extraction_data: Dict[str, Any]
    ) -> str:
        """Create a lightweight context block from enhanced entities/BI data."""
        entities = extraction_data.get('entities', {}) or {}
        relationships = extraction_data.get('relationships', {}) or {}
        business_intel = (
            extraction_data.get('business_intelligence')
            or entities.get('business_intelligence')
            or {}
        )
        groups = (
            entities.get('groups_and_companies')
            or extraction_data.get('groups_and_companies')
            or []
        )
        writing_agents = (
            entities.get('writing_agents')
            or extraction_data.get('writing_agents')
            or []
        )

        lines = []

        if business_intel:
            lines.append("Business Intelligence Highlights:")
            if business_intel.get('total_commission_amount'):
                lines.append(
                    f"- BI total commission: {self._format_currency_value(business_intel.get('total_commission_amount'))}"
                )
            if business_intel.get('number_of_groups'):
                lines.append(f"- Groups detected: {business_intel.get('number_of_groups')}")
            if business_intel.get('top_contributors'):
                top_bi = business_intel.get('top_contributors', [])[:3]
                formatted = [
                    f"{item.get('name')}: {item.get('amount')}"
                    for item in top_bi
                    if isinstance(item, dict)
                ]
                if formatted:
                    lines.append("- BI top contributors: " + "; ".join(formatted))
            if business_intel.get('commission_structures'):
                structures = ', '.join(business_intel.get('commission_structures')[:3])
                lines.append(f"- Commission structures: {structures}")
            if business_intel.get('patterns_detected'):
                patterns = ', '.join(business_intel.get('patterns_detected')[:3])
                lines.append(f"- Patterns observed: {patterns}")

        if writing_agents:
            agent_lines = []
            for agent in writing_agents[:3]:
                name = agent.get('name') or agent.get('writing_agent_name')
                if not name:
                    continue
                groups_count = agent.get('group_count') or agent.get('groups_managed')
                agent_lines.append(
                    f"{name}{' (' + str(groups_count) + ' groups)' if groups_count else ''}"
                )
            if agent_lines:
                lines.append("Writing Agents: " + ", ".join(agent_lines))

        if groups:
            group_lines = []
            for group in groups[:5]:
                name = group.get('name') or group.get('group_name') or group.get('company_name')
                amount = group.get('total_amount') or group.get('paid_amount')
                if not name:
                    continue
                snippet = name
                if amount:
                    snippet += f" ({self._format_currency_value(amount)})"
                group_lines.append(snippet)
            if group_lines:
                lines.append("Sample Groups: " + "; ".join(group_lines))

        if relationships:
            rel_keys = ", ".join(list(relationships.keys())[:5])
            if rel_keys:
                lines.append(f"Relationship maps available: {rel_keys}")

        return "\n".join(lines[:8])

