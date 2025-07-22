# Frontend Integration Guide for Advanced Table Extraction

## Overview

Your frontend has been enhanced to integrate with the new advanced table extraction system. This guide explains all the changes and new features available.

## 🚀 New Features Added

### 1. **Advanced Upload Zone**
- **AI-powered extraction** with multiple OCR engines
- **Quality assessment** and validation
- **Configurable profiles** for different document types
- **Real-time quality feedback**

### 2. **Quality Reporting System**
- **Detailed quality analysis** for each table
- **Visual quality indicators** and metrics
- **Issue identification** and recommendations
- **Comprehensive reporting** interface

### 3. **Configuration Management**
- **5 predefined extraction profiles**
- **Custom parameter tuning**
- **Quality threshold controls**
- **Validation toggles**

## 📁 New Components Created

### `AdvancedUploadZone.tsx`
**Location**: `client/src/app/upload/components/AdvancedUploadZone.tsx`

**Features**:
- Multi-engine OCR processing
- Quality assessment and validation
- Configurable extraction profiles
- Real-time quality feedback
- Enhanced table preview with quality metrics

**Key Props**:
```typescript
{
  onParsed: (result: {
    tables: TableData[],
    upload_id?: string,
    file_name: string,
    file: File,
    quality_summary?: QualitySummary,
    extraction_config?: any
  }) => void,
  disabled?: boolean,
  companyId: string
}
```

### `QualityReport.tsx`
**Location**: `client/src/app/upload/components/QualityReport.tsx`

**Features**:
- Detailed quality analysis modal
- Visual quality charts and metrics
- Issue identification and recommendations
- Table-by-table breakdown
- Export capabilities

**Key Props**:
```typescript
{
  uploadId: string,
  onClose: () => void
}
```

### `ExtractionConfigSelector.tsx`
**Location**: `client/src/app/upload/components/ExtractionConfigSelector.tsx`

**Features**:
- Configuration profile selection
- Parameter customization
- Visual configuration display
- Tips and guidance

## 🔄 Updated Components

### `page.tsx` (Main Upload Page)
**Location**: `client/src/app/upload/page.tsx`

**New Features**:
- **Extraction mode toggle** (Standard vs Advanced)
- **Quality summary banners** with real-time feedback
- **Quality report integration** with modal display
- **Enhanced upload result handling** with quality data

**Key Changes**:
```typescript
// New state variables
const [useAdvancedExtraction, setUseAdvancedExtraction] = useState(true)
const [qualitySummary, setQualitySummary] = useState<any>(null)
const [showQualityReport, setShowQualityReport] = useState(false)

// Enhanced upload result handling
function handleUploadResult({ 
  tables, 
  upload_id, 
  file_name, 
  file, 
  plan_types, 
  field_config, 
  quality_summary,  // NEW
  extraction_config // NEW
}: any) {
  // ... existing logic ...
  
  // Advanced extraction features
  if (quality_summary) {
    setQualitySummary(quality_summary)
    // Show quality summary toast
    const confidence = quality_summary.overall_confidence
    const score = (quality_summary.average_quality_score * 100).toFixed(1)
    
    if (confidence.includes('HIGH')) {
      toast.success(`Excellent extraction quality: ${score}%`)
    } else if (confidence.includes('MEDIUM')) {
      toast.success(`Good extraction quality: ${score}%`)
    } else {
      toast.error(`Low extraction quality: ${score}%. Consider using different settings.`)
    }
  }
}
```

## 🎛️ Configuration Profiles

### Available Profiles

1. **Default** - Balanced for most commission statements
2. **High Quality** - Optimized for clear, well-formatted PDFs
3. **Low Quality** - Enhanced preprocessing for poor-quality documents
4. **Multi-Page** - Specialized for tables spanning multiple pages
5. **Complex Structure** - For irregular table layouts

### Configuration Parameters

- **Quality Threshold** (0.1 - 1.0): Minimum quality score required
- **DPI** (200 - 400): Image processing resolution
- **Header Similarity** (0.7 - 0.9): Header matching threshold
- **Validation** (On/Off): Automatic corrections and validation

## 📊 Quality Metrics Display

### Quality Indicators
- **VERY_HIGH** (90%+): Green indicator
- **HIGH** (80-89%): Green indicator
- **MEDIUM_HIGH** (70-79%): Yellow indicator
- **MEDIUM** (60-69%): Yellow indicator
- **MEDIUM_LOW** (50-59%): Orange indicator
- **LOW** (<50%): Red indicator

### Quality Metrics
- **Overall Score**: Weighted combination of all metrics
- **Completeness**: Percentage of non-empty cells
- **Consistency**: Data type and format consistency
- **Accuracy**: Valid format compliance
- **Structure Quality**: Header quality and alignment
- **Data Quality**: Reasonableness of values

## 🎨 UI/UX Enhancements

### 1. **Extraction Mode Toggle**
```tsx
<div className="flex justify-center mb-6">
  <div className="bg-gray-100 rounded-lg p-1 flex">
    <button
      onClick={() => setUseAdvancedExtraction(false)}
      className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
        !useAdvancedExtraction
          ? 'bg-white text-blue-600 shadow-sm'
          : 'text-gray-600 hover:text-gray-800'
      }`}
    >
      Standard Extraction
    </button>
    <button
      onClick={() => setUseAdvancedExtraction(true)}
      className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
        useAdvancedExtraction
          ? 'bg-white text-blue-600 shadow-sm'
          : 'text-gray-600 hover:text-gray-800'
      }`}
    >
      🚀 Advanced Extraction
    </button>
  </div>
</div>
```

### 2. **Quality Summary Banner**
```tsx
{qualitySummary && (
  <div className="mb-6 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div className="text-2xl">📊</div>
        <div>
          <h3 className="font-semibold text-blue-800">
            Extraction Quality: {(qualitySummary.average_quality_score * 100).toFixed(1)}%
          </h3>
          <p className="text-sm text-blue-600">
            {qualitySummary.valid_tables} of {qualitySummary.total_tables} tables validated successfully
          </p>
        </div>
      </div>
      <button
        onClick={() => setShowQualityReport(true)}
        className="px-3 py-1 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
      >
        View Full Report
      </button>
    </div>
  </div>
)}
```

### 3. **Quality Report Modal**
```tsx
{showQualityReport && uploaded?.upload_id && (
  <QualityReport 
    uploadId={uploaded.upload_id} 
    onClose={() => setShowQualityReport(false)} 
  />
)}
```

## 🔧 Integration Steps

### 1. **Component Import**
Add the new components to your upload page:
```tsx
import AdvancedUploadZone from './components/AdvancedUploadZone'
import QualityReport from './components/QualityReport'
```

### 2. **State Management**
Add new state variables for advanced features:
```tsx
const [useAdvancedExtraction, setUseAdvancedExtraction] = useState(true)
const [qualitySummary, setQualitySummary] = useState<any>(null)
const [showQualityReport, setShowQualityReport] = useState(false)
```

### 3. **Upload Zone Integration**
Replace or conditionally render the upload zone:
```tsx
{useAdvancedExtraction ? (
  <AdvancedUploadZone
    onParsed={handleUploadResult}
    disabled={!company}
    companyId={company?.id || ''}
  />
) : (
  <UploadZone
    onParsed={handleUploadResult}
    disabled={!company}
    companyId={company?.id || ''}
  />
)}
```

### 4. **Quality Display**
Add quality summary banners and report modals where appropriate.

## 📱 User Experience Flow

### 1. **Initial Upload**
1. User selects company
2. User chooses extraction mode (Standard/Advanced)
3. User configures extraction settings (if Advanced)
4. User uploads PDF
5. System processes with AI-powered extraction
6. Quality assessment is performed
7. Results are displayed with quality indicators

### 2. **Quality Review**
1. User sees quality summary banner
2. User can view detailed quality report
3. User can adjust settings and re-extract if needed
4. User proceeds with field mapping

### 3. **Field Mapping**
1. Quality metrics are displayed alongside tables
2. User maps fields as before
3. Validation warnings are shown if applicable

### 4. **Final Review**
1. User reviews mapped data
2. Quality indicators remain visible
3. User can access full quality report
4. User approves or rejects submission

## 🎯 Benefits for Users

### 1. **Better Accuracy**
- Multi-engine OCR processing
- AI-powered preprocessing
- Automatic validation and corrections

### 2. **Quality Transparency**
- Real-time quality feedback
- Detailed quality reports
- Issue identification and recommendations

### 3. **Flexibility**
- Multiple configuration profiles
- Custom parameter tuning
- Adaptive processing for different document types

### 4. **User Confidence**
- Quality indicators and scores
- Validation warnings
- Detailed reporting and analysis

## 🔮 Future Enhancements

### Potential Additions
1. **Batch Processing** - Process multiple files at once
2. **Quality History** - Track quality improvements over time
3. **Custom Profiles** - Save user-defined configurations
4. **Export Reports** - Download quality reports as PDF/CSV
5. **Quality Alerts** - Notifications for low-quality extractions

## 📋 Testing Checklist

### Functionality Testing
- [ ] Advanced extraction mode works correctly
- [ ] Quality metrics are displayed properly
- [ ] Quality report modal opens and displays data
- [ ] Configuration profiles work as expected
- [ ] Quality thresholds are applied correctly
- [ ] Validation toggles work properly

### UI/UX Testing
- [ ] Quality indicators display correct colors
- [ ] Quality summary banners are responsive
- [ ] Configuration panel is user-friendly
- [ ] Error states are handled gracefully
- [ ] Loading states are clear and informative

### Integration Testing
- [ ] Advanced extraction integrates with existing workflow
- [ ] Quality data is passed through correctly
- [ ] Field mapping works with quality-enhanced tables
- [ ] Approval/rejection process includes quality data

## 🎉 Summary

Your frontend now provides a **comprehensive, AI-powered table extraction experience** with:

- **Advanced OCR processing** with multiple engines
- **Real-time quality assessment** and feedback
- **Configurable extraction profiles** for different document types
- **Detailed quality reporting** and analysis
- **Seamless integration** with existing workflow

The enhanced frontend transforms your commission statement processing from a basic extraction tool into a **sophisticated, quality-aware system** that provides users with confidence and transparency in their data extraction process. 