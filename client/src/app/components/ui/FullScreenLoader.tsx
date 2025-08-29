import React, { useState, useEffect } from 'react';
import { Loader2, CheckCircle, AlertCircle, FileText, Brain, Calculator, Sparkles } from 'lucide-react';

interface FullScreenLoaderProps {
  isVisible: boolean;
  title: string;
  subtitle?: string;
  type?: 'extraction' | 'gpt-correction' | 'approval' | 'processing';
  progress?: number; // 0-100
  steps?: Array<{
    id: string;
    label: string;
    status: 'pending' | 'active' | 'completed' | 'error';
    description?: string;
  }>;
  onCancel?: () => void;
  showCancelButton?: boolean;
}

export default function FullScreenLoader({
  isVisible,
  title,
  subtitle,
  type = 'processing',
  progress = 0,
  steps = [],
  onCancel,
  showCancelButton = false
}: FullScreenLoaderProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [pulseAnimation, setPulseAnimation] = useState(false);

  useEffect(() => {
    if (isVisible) {
      setPulseAnimation(true);
      const timer = setTimeout(() => setPulseAnimation(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [isVisible]);

  useEffect(() => {
    if (steps.length > 0) {
      const activeStepIndex = steps.findIndex(step => step.status === 'active');
      if (activeStepIndex !== -1) {
        setCurrentStep(activeStepIndex);
      }
    }
  }, [steps]);

  console.log('🎯 FullScreenLoader rendered:', { isVisible, title, type, progress })
  
  if (!isVisible) {
    console.log('❌ FullScreenLoader not visible, returning null')
    return null;
  }

  const getIcon = () => {
    switch (type) {
      case 'extraction':
        return <FileText className="w-8 h-8 text-blue-500" />;
      case 'gpt-correction':
        return <Brain className="w-8 h-8 text-purple-500" />;
      case 'approval':
        return <Calculator className="w-8 h-8 text-green-500" />;
      case 'processing':
        return <Sparkles className="w-8 h-8 text-indigo-500" />;
      default:
        return <Loader2 className="w-8 h-8 text-blue-500" />;
    }
  };

  const getGradient = () => {
    switch (type) {
      case 'extraction':
        return 'from-blue-500 to-cyan-500';
      case 'gpt-correction':
        return 'from-purple-500 to-pink-500';
      case 'approval':
        return 'from-green-500 to-emerald-500';
      case 'processing':
        return 'from-indigo-500 to-purple-500';
      default:
        return 'from-blue-500 to-indigo-500';
    }
  };

  const getBackgroundGradient = () => {
    switch (type) {
      case 'extraction':
        return 'from-blue-50 to-cyan-50';
      case 'gpt-correction':
        return 'from-purple-50 to-pink-50';
      case 'approval':
        return 'from-green-50 to-emerald-50';
      case 'processing':
        return 'from-indigo-50 to-purple-50';
      default:
        return 'from-blue-50 to-indigo-50';
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/20 backdrop-blur-sm">
      <div className={`w-full max-w-2xl mx-4 bg-gradient-to-br ${getBackgroundGradient()} rounded-3xl shadow-2xl border border-white/20 overflow-hidden`}>
        {/* Header */}
        <div className={`bg-gradient-to-r ${getGradient()} p-8 text-white text-center relative overflow-hidden`}>
          {/* Animated background elements */}
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-4 left-4 w-20 h-20 bg-white rounded-full animate-ping"></div>
            <div className="absolute bottom-4 right-4 w-16 h-16 bg-white rounded-full animate-ping" style={{ animationDelay: '1s' }}></div>
            <div className="absolute top-1/2 left-1/4 w-12 h-12 bg-white rounded-full animate-ping" style={{ animationDelay: '2s' }}></div>
          </div>
          
          <div className="relative z-10">
            <div className={`inline-flex items-center justify-center w-20 h-20 bg-white/20 rounded-full mb-6 ${pulseAnimation ? 'animate-pulse' : ''}`}>
              {getIcon()}
            </div>
            <h2 className="text-3xl font-bold mb-2">{title}</h2>
            {subtitle && <p className="text-lg opacity-90">{subtitle}</p>}
          </div>
        </div>

        {/* Content */}
        <div className="p-8">
          {/* Progress Bar */}
          {progress > 0 && (
            <div className="mb-8">
              <div className="flex justify-between items-center mb-3">
                <span className="text-sm font-medium text-gray-700">Progress</span>
                <span className="text-sm font-bold text-gray-900">{Math.round(progress)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                <div 
                  className={`h-full bg-gradient-to-r ${getGradient()} rounded-full transition-all duration-500 ease-out`}
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
            </div>
          )}

          {/* Steps */}
          {steps.length > 0 && (
            <div className="space-y-4 mb-8">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Processing Steps</h3>
              {steps.map((step, index) => (
                <div key={step.id} className="flex items-center space-x-4">
                  <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                    step.status === 'completed' ? 'bg-green-500' :
                    step.status === 'active' ? `bg-gradient-to-r ${getGradient()}` :
                    step.status === 'error' ? 'bg-red-500' :
                    'bg-gray-300'
                  }`}>
                    {step.status === 'completed' ? (
                      <CheckCircle className="w-5 h-5 text-white" />
                    ) : step.status === 'error' ? (
                      <AlertCircle className="w-5 h-5 text-white" />
                    ) : step.status === 'active' ? (
                      <Loader2 className="w-5 h-5 text-white animate-spin" />
                    ) : (
                      <span className="text-sm font-medium text-gray-600">{index + 1}</span>
                    )}
                  </div>
                  <div className="flex-1">
                    <div className={`font-medium ${
                      step.status === 'completed' ? 'text-green-700' :
                      step.status === 'active' ? 'text-gray-900' :
                      step.status === 'error' ? 'text-red-700' :
                      'text-gray-500'
                    }`}>
                      {step.label}
                    </div>
                    {step.description && (
                      <div className="text-sm text-gray-500 mt-1">{step.description}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Loading Animation */}
          {steps.length === 0 && (
            <div className="text-center py-8">
              <div className={`inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r ${getGradient()} rounded-full mb-6 animate-pulse`}>
                <Loader2 className="w-8 h-8 text-white animate-spin" />
              </div>
              <p className="text-gray-600 text-lg">Please wait while we process your request...</p>
            </div>
          )}

          {/* Cancel Button */}
          {showCancelButton && onCancel && (
            <div className="text-center pt-4 border-t border-gray-200">
              <button
                onClick={onCancel}
                className="px-6 py-2 text-gray-600 hover:text-gray-800 font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Specialized loader components for different use cases
export function ExtractionLoader({ isVisible, progress, onCancel }: {
  isVisible: boolean;
  progress?: number;
  onCancel?: () => void;
}) {
  const steps = [
    { id: 'upload', label: 'Uploading document', status: 'completed' as const },
    { id: 'analyze', label: 'Analyzing document structure', status: 'completed' as const },
    { id: 'extract', label: 'Extracting tables and data', status: progress && progress > 50 ? 'completed' as const : 'active' as const },
    { id: 'process', label: 'Processing extracted data', status: progress && progress > 80 ? 'completed' as const : 'pending' as const },
    { id: 'complete', label: 'Finalizing extraction', status: progress === 100 ? 'completed' as const : 'pending' as const }
  ];

  return (
    <FullScreenLoader
      isVisible={isVisible}
      title="AI-Powered Document Extraction"
      subtitle="Our advanced AI is analyzing and extracting data from your document"
      type="extraction"
      progress={progress}
      steps={steps}
      onCancel={onCancel}
      showCancelButton={true}
    />
  );
}

export function GPTCorrectionLoader({ isVisible, progress, onCancel }: {
  isVisible: boolean;
  progress?: number;
  onCancel?: () => void;
}) {
  const steps = [
    { id: 'analyze', label: 'Analyzing row formats', status: 'completed' as const },
    { id: 'gpt', label: 'Using GPT-5 to correct formats', status: 'active' as const },
    { id: 'validate', label: 'Validating corrections', status: 'pending' as const },
    { id: 'apply', label: 'Applying corrections', status: 'pending' as const }
  ];

  return (
    <FullScreenLoader
      isVisible={isVisible}
      title="GPT-5 Format Correction"
      subtitle="Using advanced AI to fix row format issues"
      type="gpt-correction"
      progress={progress}
      steps={steps}
      onCancel={onCancel}
      showCancelButton={true}
    />
  );
}

export function ApprovalLoader({ isVisible, progress, totalRows, processedRows, onCancel }: {
  isVisible: boolean;
  progress?: number;
  totalRows?: number;
  processedRows?: number;
  onCancel?: () => void;
}) {
  console.log('🎯 ApprovalLoader rendered:', { isVisible, progress, totalRows, processedRows })
  
  const steps = [
    { id: 'validate', label: 'Validating data integrity', status: 'completed' as const },
    { id: 'calculate', label: `Calculating commission totals${totalRows ? ` (${processedRows || 0}/${totalRows} rows)` : ''}`, status: 'active' as const },
    { id: 'process', label: 'Processing statement data', status: 'pending' as const },
    { id: 'save', label: 'Saving to database', status: 'pending' as const },
    { id: 'complete', label: 'Finalizing approval', status: 'pending' as const }
  ];

  return (
    <FullScreenLoader
      isVisible={isVisible}
      title="Processing Statement Approval"
      subtitle={totalRows ? `Processing ${totalRows} rows of commission data` : "Calculating commissions and finalizing your statement"}
      type="approval"
      progress={progress}
      steps={steps}
      onCancel={onCancel}
      showCancelButton={false}
    />
  );
}
