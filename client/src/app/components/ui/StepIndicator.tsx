'use client'

import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, Circle } from 'lucide-react';

interface Step {
  id: string;
  title: string;
  description?: string;
  status: 'completed' | 'active' | 'pending';
}

interface StepIndicatorProps {
  steps: Step[];
  currentStep: string;
  className?: string;
}

export default function StepIndicator({ steps, currentStep, className = '' }: StepIndicatorProps) {
  return (
    <div className={`flex items-center justify-center space-x-2 sm:space-x-4 ${className}`}>
      {steps.map((step, index) => {
        const isCompleted = step.status === 'completed';
        const isActive = step.status === 'active';
        const isPending = step.status === 'pending';
        
        return (
          <React.Fragment key={step.id}>
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.1 }}
              className="flex flex-col items-center space-y-2"
            >
              <div className="relative">
                <motion.div
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${
                    isCompleted 
                      ? 'bg-green-500 text-white shadow-lg' 
                      : isActive 
                      ? 'bg-blue-500 text-white shadow-lg ring-4 ring-blue-200' 
                      : 'bg-gray-200 text-gray-500'
                  }`}
                  animate={{
                    scale: isActive ? [1, 1.1, 1] : 1,
                  }}
                  transition={{
                    duration: 2,
                    repeat: isActive ? Infinity : 0,
                    ease: "easeInOut"
                  }}
                >
                  {isCompleted ? (
                    <CheckCircle className="w-5 h-5" />
                  ) : (
                    <Circle className="w-5 h-5" />
                  )}
                </motion.div>
                
                {/* Active step pulse animation */}
                {isActive && (
                  <motion.div
                    className="absolute inset-0 w-10 h-10 rounded-full bg-blue-500 opacity-30"
                    animate={{
                      scale: [1, 1.5, 1],
                      opacity: [0.3, 0, 0.3],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: "easeInOut"
                    }}
                  />
                )}
              </div>
              
              <div className="text-center">
                <motion.p
                  className={`text-sm font-medium transition-colors duration-300 ${
                    isCompleted 
                      ? 'text-green-600' 
                      : isActive 
                      ? 'text-blue-600' 
                      : 'text-gray-500'
                  }`}
                  animate={{
                    color: isActive ? ['#2563eb', '#1d4ed8', '#2563eb'] : undefined
                  }}
                  transition={{
                    duration: 2,
                    repeat: isActive ? Infinity : 0,
                    ease: "easeInOut"
                  }}
                >
                  {step.title}
                </motion.p>
                {step.description && (
                  <p className="text-xs text-gray-500 mt-1">{step.description}</p>
                )}
              </div>
            </motion.div>
            
            {/* Connector line */}
            {index < steps.length - 1 && (
              <motion.div
                className={`w-8 sm:w-12 h-1 rounded-full transition-all duration-500 ${
                  isCompleted ? 'bg-green-500' : 'bg-gray-200'
                }`}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ delay: index * 0.1 + 0.2 }}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
