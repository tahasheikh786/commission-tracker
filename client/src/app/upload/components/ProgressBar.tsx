'use client'
import React from 'react'
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

const ProgressBarComponent = ({ currentStep, steps = DEFAULT_STEPS }: ProgressBarProps) => {
  // Removed console.log to prevent excessive logging on every render
  
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
    <div className="w-full bg-white border-b border-slate-200 p-6 z-10 relative shadow-sm">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-center gap-8">
          {updatedSteps.map((step, index) => (
            <div key={step.id} className="flex items-center">
              <div className="flex items-center gap-3">
                <div className={`
                  w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold transition-all duration-300 shadow-sm
                  ${step.status === 'completed' 
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg' 
                    : step.status === 'current' 
                    ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg' 
                    : 'bg-slate-100 text-slate-500 border border-slate-200'
                  }
                `}>
                  {step.status === 'completed' ? (
                    <Check size={18} />
                  ) : (
                    index + 1
                  )}
                </div>
                <span className={`
                  text-sm font-semibold transition-all duration-300
                  ${step.status === 'completed' 
                    ? 'text-emerald-600' 
                    : step.status === 'current' 
                    ? 'text-blue-600' 
                    : 'text-slate-500'
                  }
                `}>
                  {step.label}
                </span>
              </div>
              {index < updatedSteps.length - 1 && (
                <div className={`
                  w-16 h-1 mx-6 transition-all duration-300 rounded-full
                  ${step.status === 'completed' ? 'bg-gradient-to-r from-emerald-500 to-teal-600' : 'bg-slate-200'}
                `} />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
};

ProgressBarComponent.displayName = 'ProgressBar';

const ProgressBar = React.memo(ProgressBarComponent);

export default ProgressBar;
