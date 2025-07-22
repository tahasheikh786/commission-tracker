'use client'
import { useState } from 'react'

type ExtractionConfig = {
  name: string
  description: string
  config_type: string
  quality_threshold: number
  dpi?: number
  header_similarity_threshold?: number
}

type ExtractionConfigSelectorProps = {
  selectedConfig: string
  qualityThreshold: number
  enableValidation: boolean
  onConfigChange: (config: string) => void
  onQualityThresholdChange: (threshold: number) => void
  onValidationToggle: (enabled: boolean) => void
}

const CONFIGURATIONS: Record<string, ExtractionConfig> = {
  default: {
    name: "Default",
    description: "Balanced configuration for most commission statements",
    config_type: "default",
    quality_threshold: 0.6,
    dpi: 300,
    header_similarity_threshold: 0.85
  },
  high_quality: {
    name: "High Quality",
    description: "Optimized for clear, well-formatted PDFs",
    config_type: "high_quality",
    quality_threshold: 0.7,
    dpi: 400,
    header_similarity_threshold: 0.9
  },
  low_quality: {
    name: "Low Quality",
    description: "Enhanced preprocessing for scanned or poor-quality documents",
    config_type: "low_quality",
    quality_threshold: 0.3,
    dpi: 200,
    header_similarity_threshold: 0.75
  },
  multi_page: {
    name: "Multi-Page",
    description: "Specialized for tables spanning multiple pages",
    config_type: "multi_page",
    quality_threshold: 0.6,
    dpi: 300,
    header_similarity_threshold: 0.8
  },
  complex_structure: {
    name: "Complex Structure",
    description: "For irregular table layouts and complex structures",
    config_type: "complex_structure",
    quality_threshold: 0.4,
    dpi: 300,
    header_similarity_threshold: 0.7
  }
}

export default function ExtractionConfigSelector({
  selectedConfig,
  qualityThreshold,
  enableValidation,
  onConfigChange,
  onQualityThresholdChange,
  onValidationToggle
}: ExtractionConfigSelectorProps) {
  const [showAdvanced, setShowAdvanced] = useState(false)

  const currentConfig = CONFIGURATIONS[selectedConfig]

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">Extraction Configuration</h3>
      
      {/* Configuration Profile Selection */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-3">
          Document Type Profile
        </label>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {Object.entries(CONFIGURATIONS).map(([key, config]) => (
            <button
              key={key}
              onClick={() => {
                onConfigChange(key)
                onQualityThresholdChange(config.quality_threshold)
              }}
              className={`p-4 rounded-lg border-2 text-left transition-all ${
                selectedConfig === key
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="font-medium text-gray-800 mb-1">{config.name}</div>
              <div className="text-sm text-gray-600 mb-2">{config.description}</div>
              <div className="text-xs text-gray-500">
                Quality Threshold: {(config.quality_threshold * 100).toFixed(0)}%
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Current Configuration Summary */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg">
        <h4 className="font-medium text-gray-800 mb-2">Current Configuration: {currentConfig.name}</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-gray-600">Quality Threshold:</span>
            <div className="font-medium">{(currentConfig.quality_threshold * 100).toFixed(0)}%</div>
          </div>
          <div>
            <span className="text-gray-600">DPI:</span>
            <div className="font-medium">{currentConfig.dpi}</div>
          </div>
          <div>
            <span className="text-gray-600">Header Similarity:</span>
            <div className="font-medium">{(currentConfig.header_similarity_threshold! * 100).toFixed(0)}%</div>
          </div>
          <div>
            <span className="text-gray-600">Validation:</span>
            <div className="font-medium">{enableValidation ? 'Enabled' : 'Disabled'}</div>
          </div>
        </div>
      </div>

      {/* Advanced Settings Toggle */}
      <div className="mb-4">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center text-sm text-blue-600 hover:text-blue-800"
        >
          <span className="mr-2">{showAdvanced ? '▼' : '▶'}</span>
          Advanced Settings
        </button>
      </div>

      {/* Advanced Settings */}
      {showAdvanced && (
        <div className="space-y-4 p-4 bg-blue-50 rounded-lg">
          {/* Quality Threshold Slider */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Quality Threshold: {(qualityThreshold * 100).toFixed(0)}%
            </label>
            <input
              type="range"
              min="0.1"
              max="1"
              step="0.1"
              value={qualityThreshold}
              onChange={(e) => onQualityThresholdChange(parseFloat(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
            />
            <p className="text-xs text-gray-500 mt-1">
              Minimum quality score required for table validation
            </p>
          </div>

          {/* Validation Toggle */}
          <div>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={enableValidation}
                onChange={(e) => onValidationToggle(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
              />
              <span className="ml-2 text-sm text-gray-700">
                Enable automatic validation and corrections
              </span>
            </label>
            <p className="text-xs text-gray-500 mt-1 ml-6">
              Automatically correct common OCR errors and validate data formats
            </p>
          </div>

          {/* Configuration Tips */}
          <div className="mt-4 p-3 bg-blue-100 rounded-lg">
            <h5 className="font-medium text-blue-800 mb-2">💡 Configuration Tips</h5>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• <strong>High Quality:</strong> Use for clear, digital PDFs</li>
              <li>• <strong>Low Quality:</strong> Use for scanned or poor-quality documents</li>
              <li>• <strong>Multi-Page:</strong> Use for tables spanning multiple pages</li>
              <li>• <strong>Complex Structure:</strong> Use for irregular table layouts</li>
              <li>• Lower quality threshold for more lenient validation</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  )
} 