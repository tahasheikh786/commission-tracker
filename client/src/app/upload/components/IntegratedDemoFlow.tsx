'use client'
import { useState, useEffect } from 'react'
import { 
  ChevronLeft,
  ChevronRight,
  Upload,
  Settings,
  MapPin,
  Eye,
  CheckCircle,
  Calendar,
  Sparkles,
  Save,
  ArrowRight
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import ProgressBar from './ProgressBar'
import MinimalLoader from '../../components/ui/MinimalLoader'
import SpinnerLoader from '../../components/ui/SpinnerLoader'
import TableEditorDemo from '../../components/demo/TableEditorDemo'
import FieldMapperDemo from '../../components/demo/FieldMapperDemo'
import ReviewDemo from '../../components/demo/ReviewDemo'

type Step = 'upload' | 'process' | 'mapping' | 'review'

export default function IntegratedDemoFlow({
  onClose
}: {
  onClose?: () => void
}) {
  
  // Step management
  const [currentStep, setCurrentStep] = useState<Step>('process')
  const [completedSteps, setCompletedSteps] = useState<Set<Step>>(new Set(['upload']))
  const [showMinimalLoader, setShowMinimalLoader] = useState(false)
  const [showSpinnerLoader, setShowSpinnerLoader] = useState(false)
  
  // Step navigation
  const steps = [
    { key: 'upload', label: 'Upload', icon: Upload, description: 'Document uploaded' },
    { key: 'process', label: 'Process', icon: Settings, description: 'Table editing' },
    { key: 'mapping', label: 'Mapping', icon: MapPin, description: 'Field mapping' },
    { key: 'review', label: 'Review', icon: Eye, description: 'Final review' }
  ] as const

  const getStepIcon = (step: Step, isCompleted: boolean, isCurrent: boolean) => {
    const IconComponent = steps.find(s => s.key === step)?.icon || Upload
    if (isCompleted) {
      return <CheckCircle className="w-6 h-6 text-green-600" />
    }
    if (isCurrent) {
      return <IconComponent className="w-6 h-6 text-blue-600" />
    }
    return <IconComponent className="w-6 h-6 text-muted-foreground" />
  }

  const nextStep = () => {
    const currentIndex = steps.findIndex(s => s.key === currentStep)
    if (currentIndex < steps.length - 1) {
      const nextStepKey = steps[currentIndex + 1].key as Step
      setCurrentStep(nextStepKey)
      setCompletedSteps(prev => new Set([...prev, currentStep]))
    } else {
      // Último paso - completar demo
      toast.success('Demo completed successfully!')
      if (onClose) onClose()
    }
  }

  const handleSaveAndContinue = () => {
    setShowSpinnerLoader(true)
    
    // El SpinnerLoader maneja su propia duración y auto-cierre
    // No necesitamos setTimeout aquí, el loader se cerrará automáticamente
    // y llamará a onCancel cuando esté completo
  }

  const renderStepContent = () => {
    switch (currentStep) {
      case 'upload':
        return (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-foreground mb-2">Upload Complete</h3>
              <p className="text-muted-foreground">Document has been successfully uploaded and processed.</p>
            </div>
          </div>
        )

      case 'process':
        return (
          <div className="h-full">
            <TableEditorDemo 
              onClose={() => {
                // Al cerrar el TableEditor, regresar al flujo principal
                if (onClose) onClose()
              }}
              onSaveAndContinue={() => {
                // Al guardar y continuar, avanzar al siguiente paso
                nextStep()
              }}
            />
          </div>
        )

      case 'mapping':
        return (
          <div className="h-full">
            <FieldMapperDemo 
              onClose={() => {
                // Al cerrar el FieldMapper, regresar al flujo principal
                if (onClose) onClose()
              }}
              onSaveAndContinue={() => {
                // Al guardar y continuar, avanzar al siguiente paso
                nextStep()
              }}
            />
          </div>
        )

      case 'review':
        return (
          <div className="h-full">
            <ReviewDemo 
              onClose={() => {
                // Al cerrar el Review, regresar al flujo principal
                if (onClose) onClose()
              }}
              onSaveAndContinue={() => {
                // Al guardar y continuar, completar el demo
                toast.success('Demo completed successfully!')
                if (onClose) onClose()
              }}
            />
          </div>
        )

      default:
        return null
    }
  }

  // Si estamos en un paso que usa un componente demo completo, renderizarlo directamente
  if (currentStep === 'process' || currentStep === 'mapping' || currentStep === 'review') {
    return renderStepContent()
  }

  // Para el paso de upload, mostrar la interfaz simplificada
  return (
    <div className="fixed inset-0 bg-background z-50 flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border bg-card flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4 flex-wrap">
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-all duration-200 flex items-center cursor-pointer"
              title="Regresar"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}
          <h2 className="text-2xl font-bold text-foreground">Integrated Demo Flow</h2>
          <span className="text-sm text-muted-foreground bg-muted px-4 py-2 rounded-lg border border-border shadow-sm">
            commission_statement_demo.pdf
          </span>
          <div className="flex items-center gap-2 bg-emerald-100 dark:bg-emerald-900/30 px-4 py-2 rounded-lg border border-emerald-200 dark:border-emerald-800">
            <Calendar className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span className="text-sm text-emerald-800 dark:text-emerald-300 font-medium">
              Statement Date: 2024-01-20
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Step Navigation */}
          <div className="flex items-center gap-2">
            {steps.map((step, index) => {
              const isCompleted = completedSteps.has(step.key as Step)
              const isCurrent = currentStep === step.key
              
              return (
                <div
                  key={step.key}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200 ${
                    isCurrent
                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 border border-blue-200 dark:border-blue-800'
                      : isCompleted
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 border border-green-200 dark:border-green-800'
                      : 'bg-muted/50 text-muted-foreground/50 border border-border'
                  }`}
                >
                  {getStepIcon(step.key as Step, isCompleted, isCurrent)}
                  <span className="text-sm font-medium">{step.label}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-row gap-4 p-4 bg-background min-h-0 overflow-hidden max-h-full">
        {renderStepContent()}
      </div>

      {/* Footer Actions */}
      <div className="bg-card border-t border-border px-4 py-3 shadow-lg flex-shrink-0">
        <div className="flex items-center justify-between">
          {/* Left side - Info */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              Step {steps.findIndex(s => s.key === currentStep) + 1} of {steps.length}: {steps.find(s => s.key === currentStep)?.label}
            </span>
            <div className="flex items-center gap-1 text-sm text-green-600">
              <Calendar className="w-3 h-3" />
              <span>Date: 2024-01-20</span>
            </div>
          </div>

          {/* Center - Progress Bar */}
          <div className="flex-1 flex justify-center px-4">
            <div className="scale-75">
              <ProgressBar currentStep="dashboard" />
            </div>
          </div>

          {/* Right side - Save & Continue Button */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleSaveAndContinue}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 font-medium cursor-pointer transition-all duration-200"
            >
              <Save className="w-4 h-4" />
              Save & Continue
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Spinner Loader */}
      <SpinnerLoader 
        isVisible={showSpinnerLoader} 
        onCancel={() => {
          setShowSpinnerLoader(false);
          // Cuando el loader se completa, avanzar al siguiente paso
          nextStep();
        }}
        duration={1500}
      />
    </div>
  )
}