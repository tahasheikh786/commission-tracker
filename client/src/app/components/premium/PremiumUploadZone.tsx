'use client';

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, Download, FileText, Shield, Zap, CheckCircle, ArrowRight } from 'lucide-react';
import { useDropzone } from 'react-dropzone';

interface PremiumUploadZoneProps {
  onFileUpload: (files: File[]) => void;
  isUploading: boolean;
}

const PremiumUploadButton = ({ onClick }: { onClick: (e: React.MouseEvent) => void }) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <motion.button
      onClick={onClick}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      type="button"
      className="relative group"
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.98 }}
    >
      {/* Glow Effect */}
      <motion.div
        className="absolute -inset-1 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 rounded-2xl blur-lg opacity-75"
        animate={{
          opacity: isHovered ? 1 : 0.75,
          scale: isHovered ? 1.05 : 1
        }}
        transition={{ duration: 0.3 }}
      />

      {/* Button Content */}
      <div className="relative px-8 py-4 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 rounded-2xl shadow-xl">
        <div className="flex items-center gap-3">
          <FileText className="w-5 h-5 text-white" />
          <span className="text-white font-semibold text-lg">
            Select Files to Upload
          </span>
          <motion.div
            animate={{
              x: isHovered ? 5 : 0
            }}
            transition={{ duration: 0.2 }}
          >
            <ArrowRight className="w-5 h-5 text-white" />
          </motion.div>
        </div>
      </div>

      {/* Shimmer Effect */}
      <motion.div
        className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none"
        initial={{ x: '-100%' }}
        animate={{ x: isHovered ? '100%' : '-100%' }}
        transition={{ duration: 0.6, ease: "easeInOut" }}
      >
        <div className="h-full w-1/2 bg-gradient-to-r from-transparent via-white/30 to-transparent skew-x-12" />
      </motion.div>
    </motion.button>
  );
};

export default function PremiumUploadZone({ onFileUpload, isUploading }: PremiumUploadZoneProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setIsDragActive(false);
      onFileUpload(acceptedFiles);
    }
  }, [onFileUpload]);

  const { getRootProps, getInputProps } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls', '.xlsm', '.xlsb']
    },
    multiple: false,
    disabled: isUploading,
    noClick: true,
    onDragEnter: () => setIsDragActive(true),
    onDragLeave: () => setIsDragActive(false)
  });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMousePosition({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
  };

  const handleSelectFilesClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (isUploading) return;
    
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.xlsx,.xls,.xlsm,.xlsb';
    input.multiple = false;
    
    input.onchange = (event) => {
      const files = (event.target as HTMLInputElement).files;
      if (files && files.length > 0) {
        onFileUpload([files[0]]);
      }
    };
    
    input.click();
  };

  const { ref, ...rootProps } = getRootProps();
  
  return (
    <motion.div
      className={`
        relative overflow-hidden rounded-3xl p-1 transition-all duration-500
        ${isDragActive 
          ? 'bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500' 
          : 'bg-gradient-to-br from-slate-200 via-blue-200 to-purple-200 dark:from-slate-700 dark:via-blue-900 dark:to-purple-900'
        }
      `}
      onMouseMove={handleMouseMove}
      onDragEnter={rootProps.onDragEnter}
      onDragOver={rootProps.onDragOver}
      onDragLeave={rootProps.onDragLeave}
      onDrop={rootProps.onDrop as any}
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay: 0.6 }}
    >
      <input {...getInputProps()} />

      {/* Spotlight Effect */}
      <div
        className="absolute pointer-events-none opacity-0 hover:opacity-100 transition-opacity duration-300"
        style={{
          background: `radial-gradient(600px circle at ${mousePosition.x}px ${mousePosition.y}px, rgba(255,255,255,0.1), transparent 40%)`,
          inset: 0
        }}
      />

      {/* Main Upload Area */}
      <motion.div
        className={`
          relative bg-white/90 dark:bg-slate-900/90 backdrop-blur-2xl rounded-3xl p-12 
          border-2 border-dashed transition-all duration-300
          ${isDragActive 
            ? 'border-blue-500 dark:border-blue-400 bg-blue-50/50 dark:bg-blue-900/30' 
            : 'border-slate-300 dark:border-slate-600'
          }
        `}
        animate={{
          scale: isDragActive ? 1.02 : 1,
          borderColor: isDragActive ? '#3b82f6' : undefined
        }}
      >
        {/* Animated Icon Container */}
        <motion.div
          className="relative w-32 h-32 mx-auto mb-8"
          animate={{
            y: isDragActive ? -10 : 0,
            scale: isDragActive ? 1.1 : 1
          }}
          transition={{ duration: 0.3 }}
        >
          {/* Outer Ring */}
          <motion.div
            className="absolute inset-0 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 opacity-20"
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.2, 0.3, 0.2]
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          />

          {/* Middle Ring */}
          <motion.div
            className="absolute inset-4 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 opacity-30"
            animate={{
              scale: [1, 1.15, 1],
              opacity: [0.3, 0.4, 0.3]
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 0.3
            }}
          />

          {/* Icon Container */}
          <div className="absolute inset-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-xl">
            <motion.div
              animate={{
                rotate: isDragActive ? 360 : 0
              }}
              transition={{ duration: 0.5 }}
            >
              {isDragActive ? (
                <Download className="w-10 h-10 text-white" />
              ) : (
                <Upload className="w-10 h-10 text-white" />
              )}
            </motion.div>
          </div>

          {/* Orbiting Dots */}
          {[0, 120, 240].map((angle, i) => (
            <motion.div
              key={i}
              className="absolute w-3 h-3 bg-blue-500 rounded-full"
              style={{
                top: '50%',
                left: '50%'
              }}
              animate={{
                x: [
                  Math.cos((angle * Math.PI) / 180) * 70,
                  Math.cos(((angle + 360) * Math.PI) / 180) * 70
                ],
                y: [
                  Math.sin((angle * Math.PI) / 180) * 70,
                  Math.sin(((angle + 360) * Math.PI) / 180) * 70
                ]
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: "linear"
              }}
            />
          ))}
        </motion.div>

        {/* Text Content */}
        <AnimatePresence mode="wait">
          {isDragActive ? (
            <motion.div
              key="drag-active"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="text-center"
            >
              <h3 className="text-3xl font-bold text-blue-600 dark:text-blue-400 mb-3">
                Drop it like it&apos;s hot! 🔥
              </h3>
              <p className="text-lg text-slate-600 dark:text-slate-300">
                Release to start processing your file
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="default"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="text-center space-y-6"
            >
              <div>
                <h3 className="text-3xl font-bold text-slate-900 dark:text-white mb-3">
                  Drop your file here
                </h3>
                <p className="text-lg text-slate-600 dark:text-slate-400">
                  or click the button below to browse
                </p>
              </div>

              {/* Premium Upload Button */}
              <PremiumUploadButton onClick={handleSelectFilesClick} />

              {/* Supported Features Row */}
              <div className="flex items-center justify-center gap-8 text-sm">
                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                  <Shield className="w-4 h-4 text-green-500" />
                  <span>256-bit Encryption</span>
                </div>
                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                  <Zap className="w-4 h-4 text-yellow-500" />
                  <span>Instant Processing</span>
                </div>
                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                  <CheckCircle className="w-4 h-4 text-blue-500" />
                  <span>99.9% Accuracy</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

