@echo off
curl.exe -X POST "http://localhost:8000/api/extract-tables-enhance/" -F "file=@Test 08.2025.pdf" -F "company_id=68b19b72-b540-4bdb-a80f-44c8bc527025" -F "enable_ai_mapping=true" -F "enable_quality_checks=true" -F "enable_format_learning=true"
