'use client';

import React from 'react';

interface SectionDebugInfoProps {
  isFullyVisible: boolean;
  scrollProgress: number;
  isIntersecting: boolean;
  intersectionRatio: number;
  isStorytellingActive?: boolean;
  currentStep?: number;
  isAdjusting?: boolean;
  show?: boolean;
}

export default function SectionDebugInfo({
  isFullyVisible,
  scrollProgress,
  isIntersecting,
  intersectionRatio,
  isStorytellingActive = false,
  currentStep = 0,
  isAdjusting = false,
  show = false
}: SectionDebugInfoProps) {
  if (!show) return null;

  return (
    <div className="fixed top-4 right-4 z-50 bg-black/90 text-white p-4 rounded-lg text-sm font-mono min-w-[200px]">
      <div className="text-green-400 font-bold mb-2">🎯 Section Visibility Debug</div>
      
      <div className="space-y-1">
        <div className="flex justify-between">
          <span>100% Visible:</span>
          <span className={isFullyVisible ? 'text-green-400' : 'text-red-400'}>
            {isFullyVisible ? '✅ YES' : '❌ NO'}
          </span>
        </div>
        
        <div className="flex justify-between">
          <span>Scroll Progress:</span>
          <span className="text-blue-400">{Math.round(scrollProgress)}%</span>
        </div>
        
        <div className="flex justify-between">
          <span>Intersecting:</span>
          <span className={isIntersecting ? 'text-green-400' : 'text-red-400'}>
            {isIntersecting ? '✅' : '❌'}
          </span>
        </div>
        
        <div className="flex justify-between">
          <span>Intersection Ratio:</span>
          <span className="text-yellow-400">
            {Math.round(intersectionRatio * 100)}%
          </span>
        </div>
        
        <div className="flex justify-between">
          <span>Storytelling:</span>
          <span className={isStorytellingActive ? 'text-green-400' : 'text-red-400'}>
            {isStorytellingActive ? '🎬 ACTIVE' : '⏸️ INACTIVE'}
          </span>
        </div>
        
        <div className="flex justify-between">
          <span>Current Step:</span>
          <span className="text-purple-400">
            {currentStep} / 2
          </span>
        </div>
        
        <div className="flex justify-between">
          <span>Auto Adjust:</span>
          <span className={isAdjusting ? 'text-yellow-400' : 'text-gray-400'}>
            {isAdjusting ? '🔄 ADJUSTING' : '⏸️ IDLE'}
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mt-3">
        <div className="w-full bg-gray-700 rounded-full h-2">
          <div 
            className="bg-gradient-to-r from-blue-500 to-green-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${scrollProgress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
