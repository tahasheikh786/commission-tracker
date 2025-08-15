'use client'
import { Check } from 'lucide-react'

type ProgressStep = {
  id: string
  label: string
  status: 'completed' | 'current' | 'pending'
}

type ProgressBarProps = {
  currentStep: string
  steps?: ProgressStep[]
}

const DEFAULT_STEPS = [
  { id: 'upload', label: 'Upload', status: 'pending' as const },
  { id: 'table_editor', label: 'Process', status: 'pending' as const },
  { id: 'field_mapper', label: 'Mapping', status: 'pending' as const },
  { id: 'dashboard', label: 'Review', status: 'pending' as const }
]

export default function ProgressBar({ currentStep, steps = DEFAULT_STEPS }: ProgressBarProps) {
  console.log('ProgressBar rendered with currentStep:', currentStep)
  
  const getStepStatus = (stepId: string): 'completed' | 'current' | 'pending' => {
    const stepOrder = ['upload', 'table_editor', 'field_mapper', 'dashboard']
    const currentIndex = stepOrder.indexOf(currentStep)
    const stepIndex = stepOrder.indexOf(stepId)
    
    if (stepIndex < currentIndex) return 'completed'
    if (stepIndex === currentIndex) return 'current'
    return 'pending'
  }

  const updatedSteps = steps.map(step => ({
    ...step,
    status: getStepStatus(step.id)
  }))

  return (
    <div className="w-full bg-white border-b border-gray-200 p-4 z-10 relative shadow-sm">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-center space-x-4">
          {updatedSteps.map((step, index) => (
            <div key={step.id} className="flex items-center">
              <div className="flex items-center">
                <div className={`
                  w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-200
                  ${step.status === 'completed' 
                    ? 'bg-green-500 text-white' 
                    : step.status === 'current' 
                    ? 'bg-blue-500 text-white' 
                    : 'bg-gray-300 text-gray-600'
                  }
                `}>
                  {step.status === 'completed' ? (
                    <Check size={16} />
                  ) : (
                    index + 1
                  )}
                </div>
                <span className={`
                  ml-2 text-sm font-medium transition-all duration-200
                  ${step.status === 'completed' 
                    ? 'text-green-600' 
                    : step.status === 'current' 
                    ? 'text-blue-600' 
                    : 'text-gray-500'
                  }
                `}>
                  {step.label}
                </span>
              </div>
              {index < updatedSteps.length - 1 && (
                <div className={`
                  w-12 h-1 mx-4 transition-all duration-200
                  ${step.status === 'completed' ? 'bg-green-500' : 'bg-gray-300'}
                `} />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
