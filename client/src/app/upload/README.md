# Upload Flow with Date Extraction Integration

## Overview

The upload flow now includes automatic date extraction from commission statement documents. When a user uploads a PDF and the table extraction is successful, the system automatically triggers date extraction and presents the user with a modal to select the appropriate statement date.

## Features

### Automatic Date Extraction
- Triggers automatically when the TableEditor component loads
- Extracts dates from the first page of the uploaded document
- Uses AI-powered OCR and pattern recognition to identify dates with context

### Date Selection Modal
- **Transparent Background**: Modal appears with a semi-transparent backdrop
- **Multiple Date Options**: Shows all detected dates with their labels and confidence scores
- **Date Types**: Categorizes dates as Statement Date, Payment Date, Billing Date, etc.
- **Confidence Indicators**: Visual indicators for high/medium/low confidence dates
- **Context Display**: Shows surrounding text for better context
- **Fallback Option**: Manual date picker if no suitable dates are found

### Integration Points

#### Frontend Components
1. **DateSelectionModal** (`components/DateSelectionModal.tsx`)
   - Main modal component for date selection
   - Handles user interactions and date selection
   - Provides fallback manual date picker

2. **DateExtractionService** (`services/dateExtractionService.ts`)
   - Handles API calls to the backend date extraction service
   - Provides error handling and logging
   - Supports both file and bytes-based extraction

3. **TableEditor** (`components/TableEditor/TableEditor.tsx`)
   - Integrates date extraction trigger
   - Shows selected date in header
   - Provides manual "Extract Dates" button

#### Backend API
- **Endpoint**: `/extract-dates/`
- **Method**: POST
- **Input**: File upload with company_id
- **Output**: Extracted dates with metadata

## Usage Flow

1. **Upload Document**: User uploads a commission statement PDF
2. **Table Extraction**: System extracts tables from the document
3. **TableEditor Loads**: User sees the extracted tables in the TableEditor
4. **Automatic Date Extraction**: System automatically triggers date extraction
5. **Date Selection Modal**: User sees a modal with detected dates
6. **Date Selection**: User selects the appropriate statement date
7. **Continue Flow**: User proceeds to field mapping with selected date

## API Response Format

```typescript
interface DateExtractionResponse {
  success: boolean
  filename: string
  company_id: string
  total_dates_found: number
  dates: ExtractedDate[]
  dates_by_type: Record<string, ExtractedDate[]>
  extraction_methods: string[]
  processing_time: number
  warnings: string[]
  errors: string[]
  metadata: {
    file_type: string
    extraction_timestamp: string
    service_version: string
  }
}

interface ExtractedDate {
  date: string
  label: string
  confidence: number
  date_type: string
  surrounding_text: string
  page_number: number
  bounding_box: number[]
}
```

## Error Handling

- **Network Errors**: Graceful fallback with user notification
- **No Dates Found**: Modal shows option for manual date selection
- **Extraction Failures**: Error messages with retry options
- **Invalid Files**: Clear error messages for unsupported formats

## Configuration

The date extraction service can be configured via:
- Backend configuration file: `configs/new_extraction_config.yaml`
- Frontend environment variables: `NEXT_PUBLIC_API_URL`

## Future Enhancements

- Batch date extraction for multiple documents
- Date validation and format correction
- Integration with calendar systems
- Advanced date pattern learning
- Multi-language date support
