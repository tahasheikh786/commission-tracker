'use client';

import React, { useRef, useEffect, useState } from 'react';
import { Parallax, ParallaxLayer } from '@react-spring/parallax';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, FileSpreadsheet, CheckCircle, Upload, Brain, BarChart3, Mouse } from 'lucide-react';

const ScrollStorytellingCombined = () => {
  const parallaxRef = useRef<any>(null);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    if (parallaxRef.current) {
      parallaxRef.current.scrollTo(0);
    }
  }, []);

  // Scroll detection for steps
  useEffect(() => {
    if (!parallaxRef.current) return;
    const container = parallaxRef.current.container.current;
    if (!container) return;

    const handleScroll = () => {
      const scrollTop = container.scrollTop;
      const maxScroll = container.scrollHeight - container.clientHeight;
      const scrollPercent = scrollTop / maxScroll;

      // Sticky range: 1.8-3.8 of 4 pages (45%-95%)
      const startSticky = 0.45;
      const endSticky = 0.95;
      const stickyRange = endSticky - startSticky;

      const relativeProgress = Math.min(
        Math.max((scrollPercent - startSticky) / stickyRange, 0),
        1
      );

      if (relativeProgress < 0.33) setCurrentStep(0);
      else if (relativeProgress < 0.66) setCurrentStep(1);
      else setCurrentStep(2);
    };

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  // Step content
  const getStepContent = () => {
    const steps = [
      {
        title: "Upload Your Commission Documents",
        description: "Drag and drop your PDF statements or Excel spreadsheets. Our AI will automatically extract all commission data.",
        content: (stepTitle: string, stepDescription: string) => (
          <div className="space-y-1 sm:space-y-2 lg:space-y-4">
            {/* Title and Description for Mobile/Tablet */}
            <div className="block lg:hidden text-center mb-3 sm:mb-4">
              <h3 className="text-sm sm:text-base md:text-lg font-bold text-slate-800 dark:text-slate-200 mb-2">
                {stepTitle}
              </h3>
              <p className="text-xs sm:text-sm md:text-base text-slate-600 dark:text-slate-400 leading-relaxed px-2">
                {stepDescription}
              </p>
            </div>

            {/* Upload Zone */}
            <div className="border-2 border-dashed border-blue-300 dark:border-blue-600 rounded-lg sm:rounded-xl p-3 sm:p-4 md:p-6 lg:p-6 text-center bg-blue-50/50 dark:bg-blue-900/10">
              <div className="w-10 h-10 sm:w-14 sm:h-14 md:w-16 md:h-16 lg:w-16 lg:h-16 bg-blue-100 dark:bg-blue-900/30 rounded-lg sm:rounded-xl lg:rounded-2xl flex items-center justify-center mx-auto mb-2 sm:mb-3 lg:mb-3">
                <Upload className="w-5 h-5 sm:w-7 sm:h-7 md:w-8 md:h-8 lg:w-8 lg:h-8 text-blue-500" />
              </div>
              <h4 className="text-xs sm:text-sm md:text-base lg:text-sm font-semibold text-blue-800 dark:text-blue-200 mb-1 sm:mb-2">Drop your files here</h4>
              <p className="text-[10px] sm:text-xs md:text-sm lg:text-xs text-blue-600 dark:text-blue-400">PDF or Excel files supported</p>
            </div>
            
            {/* File Types */}
            <div className="flex justify-center space-x-2 sm:space-x-3 lg:space-x-3">
              <div className="flex flex-col items-center space-y-1 sm:space-y-1 lg:space-y-2">
                <div className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 lg:w-12 lg:h-12 bg-red-100 dark:bg-red-900/20 rounded-lg sm:rounded-xl border-2 border-red-200 dark:border-red-700 flex items-center justify-center">
                  <FileText className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 lg:w-5 lg:h-5 text-red-500" />
                </div>
                <p className="text-[10px] sm:text-xs md:text-sm lg:text-xs text-red-600 dark:text-red-400 font-medium">PDF</p>
              </div>
              <div className="flex flex-col items-center space-y-1 sm:space-y-1 lg:space-y-2">
                <div className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 lg:w-12 lg:h-12 bg-green-100 dark:bg-green-900/20 rounded-lg sm:rounded-xl border-2 border-green-200 dark:border-green-700 flex items-center justify-center">
                  <FileSpreadsheet className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 lg:w-5 lg:h-5 text-green-500" />
                </div>
                <p className="text-[10px] sm:text-xs md:text-sm lg:text-xs text-green-600 dark:text-green-400 font-medium">Excel</p>
              </div>
            </div>
          </div>
        )
      },
      {
        title: "AI-Powered Processing",
        description: "Our AI engine analyzes each document, identifies patterns and extracts commission data with 98.5% accuracy.",
        content: (stepTitle: string, stepDescription: string) => (
          <div className="space-y-1 sm:space-y-2 lg:space-y-4">
            {/* Title and Description for Mobile/Tablet */}
            <div className="block lg:hidden text-center mb-3 sm:mb-4">
              <h3 className="text-sm sm:text-base md:text-lg font-bold text-slate-800 dark:text-slate-200 mb-2">
                {stepTitle}
              </h3>
              <p className="text-xs sm:text-sm md:text-base text-slate-600 dark:text-slate-400 leading-relaxed px-2">
                {stepDescription}
              </p>
            </div>

            {/* Processing Header */}
            <div className="text-center">
              <div className="w-10 h-10 sm:w-14 sm:h-14 md:w-16 md:h-16 lg:w-16 lg:h-16 bg-gradient-to-r from-purple-100 to-pink-100 dark:from-purple-900/30 dark:to-pink-900/30 rounded-lg sm:rounded-xl lg:rounded-2xl flex items-center justify-center mx-auto mb-2 sm:mb-3 lg:mb-3">
                <Brain className="w-5 h-5 sm:w-7 sm:h-7 md:w-8 md:h-8 lg:w-8 lg:h-8 text-purple-500 animate-pulse" />
              </div>
              <h4 className="text-xs sm:text-sm md:text-base lg:text-sm font-semibold text-purple-800 dark:text-purple-200 mb-1 sm:mb-2">AI Processing</h4>
              <p className="text-[10px] sm:text-xs md:text-sm lg:text-xs text-purple-600 dark:text-purple-400">Analyzing documents...</p>
            </div>
            
            {/* Progress Bar */}
            <div className="space-y-2 sm:space-y-3 lg:space-y-3">
              <div className="h-2 sm:h-3 md:h-4 lg:h-3 bg-purple-200 dark:bg-purple-800 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-purple-500 via-pink-500 to-purple-600"
                  initial={{ width: 0 }}
                  animate={{ width: "85%" }}
                  transition={{ duration: 2.5, ease: "easeOut" }}
                />
              </div>
              <div className="flex justify-between text-[10px] sm:text-xs md:text-sm lg:text-xs">
                <span className="text-purple-600 dark:text-purple-400">85% Complete</span>
                <span className="text-purple-600 dark:text-purple-400">98.5% Accuracy</span>
              </div>
            </div>
            
            {/* Processing Steps */}
            <div className="space-y-1 sm:space-y-2 lg:space-y-2">
              <div className="flex items-center space-x-1 sm:space-x-2 lg:space-x-2">
                <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 md:w-2.5 md:h-2.5 lg:w-2 lg:h-2 bg-green-500 rounded-full"></div>
                <span className="text-[10px] sm:text-xs md:text-sm lg:text-xs text-slate-600 dark:text-slate-400">Document scanned</span>
              </div>
              <div className="flex items-center space-x-1 sm:space-x-2 lg:space-x-2">
                <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 md:w-2.5 md:h-2.5 lg:w-2 lg:h-2 bg-green-500 rounded-full"></div>
                <span className="text-[10px] sm:text-xs md:text-sm lg:text-xs text-slate-600 dark:text-slate-400">Data extracted</span>
              </div>
              <div className="flex items-center space-x-1 sm:space-x-2 lg:space-x-2">
                <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 md:w-2.5 md:h-2.5 lg:w-2 lg:h-2 bg-purple-500 rounded-full animate-pulse"></div>
                <span className="text-[10px] sm:text-xs md:text-sm lg:text-xs text-slate-600 dark:text-slate-400">Validating results...</span>
              </div>
            </div>
          </div>
        )
      },
      {
        title: "Real-Time Analytics Dashboard",
        description: "Visualize trends, performance metrics and get actionable insights to optimize your commission business.",
        content: (stepTitle: string, stepDescription: string) => (
          <div className="space-y-1 sm:space-y-2 lg:space-y-4">
            {/* Title and Description for Mobile/Tablet */}
            <div className="block lg:hidden text-center mb-3 sm:mb-4">
              <h3 className="text-sm sm:text-base md:text-lg font-bold text-slate-800 dark:text-slate-200 mb-2">
                {stepTitle}
              </h3>
              <p className="text-xs sm:text-sm md:text-base text-slate-600 dark:text-slate-400 leading-relaxed px-2">
                {stepDescription}
              </p>
            </div>

            {/* Dashboard Header */}
            <div className="text-center">
              <h4 className="text-xs sm:text-sm md:text-base lg:text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1 sm:mb-2">Analytics Dashboard</h4>
              <p className="text-[10px] sm:text-xs md:text-sm lg:text-xs text-slate-600 dark:text-slate-400">Real-time insights</p>
            </div>
            
            {/* Metrics Cards */}
            <div className="grid grid-cols-2 gap-0.5 sm:gap-1 lg:gap-2">
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 p-1.5 sm:p-2 lg:p-3 rounded-lg border border-blue-200 dark:border-blue-700">
                <div className="flex items-center space-x-0.5 sm:space-x-1 lg:space-x-2 mb-0.5 sm:mb-1">
                  <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 lg:w-2 lg:h-2 bg-blue-500 rounded-full"></div>
                  <p className="text-[8px] sm:text-[10px] lg:text-xs text-blue-600 dark:text-blue-400 font-medium">Total Revenue</p>
                </div>
                <div className="flex items-center space-x-0.5 sm:space-x-1">
                  <div className="w-4 h-2 sm:w-6 sm:h-3 lg:w-8 lg:h-4 bg-blue-200 dark:bg-blue-800 rounded"></div>
                  <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 lg:w-2 lg:h-2 bg-green-500 rounded-full"></div>
                </div>
              </div>
              <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 p-1.5 sm:p-2 lg:p-3 rounded-lg border border-green-200 dark:border-green-700">
                <div className="flex items-center space-x-0.5 sm:space-x-1 lg:space-x-2 mb-0.5 sm:mb-1">
                  <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 lg:w-2 lg:h-2 bg-green-500 rounded-full"></div>
                  <p className="text-[8px] sm:text-[10px] lg:text-xs text-green-600 dark:text-green-400 font-medium">Growth Rate</p>
                </div>
                <div className="flex items-center space-x-0.5 sm:space-x-1">
                  <div className="w-4 h-2 sm:w-6 sm:h-3 lg:w-8 lg:h-4 bg-green-200 dark:bg-green-800 rounded"></div>
                  <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 lg:w-2 lg:h-2 bg-green-500 rounded-full"></div>
                </div>
              </div>
            </div>
            
            {/* Chart */}
            <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-1.5 sm:p-2 lg:p-3">
              <div className="flex items-center justify-between mb-0.5 sm:mb-1 lg:mb-2">
                <h5 className="text-[8px] sm:text-[10px] lg:text-xs font-semibold text-slate-700 dark:text-slate-300">Performance Trends</h5>
                <div className="flex space-x-0.5 sm:space-x-1">
                  <div className="w-0.5 h-0.5 sm:w-1 sm:h-1 lg:w-1.5 lg:h-1.5 bg-blue-500 rounded-full"></div>
                  <div className="w-0.5 h-0.5 sm:w-1 sm:h-1 lg:w-1.5 lg:h-1.5 bg-green-500 rounded-full"></div>
                  <div className="w-0.5 h-0.5 sm:w-1 sm:h-1 lg:w-1.5 lg:h-1.5 bg-purple-500 rounded-full"></div>
                </div>
              </div>
              <div className="h-6 sm:h-8 lg:h-12 flex items-end justify-center space-x-0.5 sm:space-x-1">
                {Array.from({ length: 8 }).map((_, i) => (
                  <motion.div
                    key={i}
                    initial={{ height: 0 }}
                    animate={{ height: Math.random() * 15 + 3 }}
                    transition={{ duration: 0.8, delay: i * 0.1 }}
                    className="w-0.5 sm:w-1 lg:w-1.5 bg-gradient-to-t from-blue-500 to-purple-500 rounded-t"
                  />
                ))}
              </div>
            </div>
          </div>
        )
      }
    ];

    return steps[currentStep] || steps[0];
  };

  const currentStepData = getStepContent();

  return (
    <div className="relative w-full h-screen overflow-hidden bg-slate-50 dark:bg-slate-900">
      <Parallax ref={parallaxRef} pages={4}>
        
        {/* Title Section */}
        <ParallaxLayer offset={0} speed={0.1} className="flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: -100 }}
            transition={{ duration: 0.8 }}
            className="text-center z-10"
          >
            <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent mb-3 sm:mb-4 md:mb-6 px-4">
              From Documents to Data
            </h2>
            <p className="text-base sm:text-lg md:text-xl lg:text-2xl text-slate-600 dark:text-slate-300 max-w-2xl sm:max-w-3xl mx-auto px-4">
              Watch how we transform your PDF statements and Excel files into actionable insights
            </p>
          </motion.div>
        </ParallaxLayer>

        {/* PDF File */}
        <ParallaxLayer offset={0.3} speed={-0.5} className="flex items-center justify-center">
          <motion.div
            initial={{ x: -1000, opacity: 0, rotate: -15 }}
            animate={{ x: -150, opacity: 1, rotate: -5 }}
            transition={{ duration: 1.2, delay: 0.5 }}
            className="relative z-20"
          >
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 sm:p-6 lg:p-8 border-4 border-red-200 dark:border-red-700 max-w-sm sm:max-w-md lg:max-w-lg w-[250px] sm:w-[300px] md:w-[350px] lg:w-[400px] xl:w-[450px]">
              {/* Header */}
              <div className="flex items-center space-x-2 sm:space-x-3 mb-3 sm:mb-4">
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-red-500 rounded-lg flex items-center justify-center">
                  <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-base sm:text-xl font-bold text-slate-800 dark:text-slate-200">Commission Report</h3>
                  <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400">PDF Document</p>
                </div>
              </div>

              {/* Document Content */}
              <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-3 sm:p-4 lg:p-6 space-y-2 sm:space-y-3 lg:space-y-4">
                {/* Header */}
                <div className="text-center border-b border-slate-200 dark:border-slate-600 pb-2 sm:pb-3">
                  <h4 className="text-[10px] sm:text-sm lg:text-base font-bold text-slate-800 dark:text-slate-200">COMMISSION STATEMENT</h4>
                  <p className="text-[9px] sm:text-sm text-slate-600 dark:text-slate-400">Period: Oct 2025</p>
                </div>

                {/* Content Lines */}
                <div className="space-y-1 sm:space-y-2">
                  <div className="flex justify-between items-center">
                    <div className="h-2 sm:h-3 bg-slate-300 dark:bg-slate-600 rounded w-16 sm:w-20"></div>
                    <div className="h-2 sm:h-3 bg-green-400 rounded w-12 sm:w-16"></div>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="h-2 sm:h-3 bg-slate-300 dark:bg-slate-600 rounded w-20 sm:w-24"></div>
                    <div className="h-2 sm:h-3 bg-green-400 rounded w-16 sm:w-20"></div>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="h-2 sm:h-3 bg-slate-300 dark:bg-slate-600 rounded w-14 sm:w-18"></div>
                    <div className="h-2 sm:h-3 bg-green-400 rounded w-10 sm:w-14"></div>
                  </div>
                </div>

                {/* Total */}
                <div className="border-t border-slate-200 dark:border-slate-600 pt-1 sm:pt-2">
                  <div className="flex justify-between items-center">
                    <div className="h-3 sm:h-4 bg-slate-400 dark:bg-slate-500 rounded w-12 sm:w-16"></div>
                    <div className="h-3 sm:h-4 bg-green-500 rounded w-16 sm:w-20"></div>
                  </div>
                </div>
              </div>

              {/* File Info */}
              <div className="mt-3 sm:mt-4 flex items-center justify-between text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                <span>2.3 MB</span>
                <span>•</span>
                <span>3 pages</span>
              </div>
            </div>
          </motion.div>
        </ParallaxLayer>

        {/* Excel File */}
        <ParallaxLayer offset={0.3} speed={-0.5} className="flex items-center justify-center">
          <motion.div
            initial={{ x: 1000, opacity: 0, rotate: 15 }}
            animate={{ x: 150, opacity: 1, rotate: 5 }}
            transition={{ duration: 1.2, delay: 0.5 }}
            className="relative z-20"
          >
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 sm:p-6 lg:p-8 border-4 border-green-200 dark:border-green-700 max-w-sm sm:max-w-md lg:max-w-lg w-[250px] sm:w-[300px] md:w-[350px] lg:w-[400px] xl:w-[450px]">
              {/* Header */}
              <div className="flex items-center space-x-2 sm:space-x-3 mb-3 sm:mb-4">
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-green-500 rounded-lg flex items-center justify-center">
                  <FileSpreadsheet className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-base sm:text-xl font-bold text-slate-800 dark:text-slate-200">Commission Data</h3>
                  <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400">Excel Spreadsheet</p>
                </div>
              </div>

              {/* Spreadsheet Content */}
              <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-2 sm:p-3 lg:p-4">
                {/* Column Headers */}
                <div className="grid grid-cols-4 gap-1 sm:gap-2 mb-2 sm:mb-3">
                  <div className="h-5 sm:h-6 lg:h-7 bg-green-200 dark:bg-green-800 rounded text-[10px] sm:text-xs lg:text-sm flex items-center justify-center font-bold text-green-800 dark:text-green-200">A</div>
                  <div className="h-5 sm:h-6 lg:h-7 bg-green-200 dark:bg-green-800 rounded text-[10px] sm:text-xs lg:text-sm flex items-center justify-center font-bold text-green-800 dark:text-green-200">B</div>
                  <div className="h-5 sm:h-6 lg:h-7 bg-green-200 dark:bg-green-800 rounded text-[10px] sm:text-xs lg:text-sm flex items-center justify-center font-bold text-green-800 dark:text-green-200">C</div>
                  <div className="h-5 sm:h-6 lg:h-7 bg-green-200 dark:bg-green-800 rounded text-[10px] sm:text-xs lg:text-sm flex items-center justify-center font-bold text-green-800 dark:text-green-200">D</div>
                </div>

                {/* Row 1 - Headers */}
                <div className="grid grid-cols-4 gap-1 sm:gap-2 mb-2">
                  <div className="h-4 sm:h-5 lg:h-6 bg-blue-100 dark:bg-blue-900/30 rounded text-[9px] sm:text-xs lg:text-sm flex items-center justify-center font-semibold text-blue-800 dark:text-blue-200">Agent</div>
                  <div className="h-4 sm:h-5 lg:h-6 bg-blue-100 dark:bg-blue-900/30 rounded text-[9px] sm:text-xs lg:text-sm flex items-center justify-center font-semibold text-blue-800 dark:text-blue-200">Sales</div>
                  <div className="h-4 sm:h-5 lg:h-6 bg-blue-100 dark:bg-blue-900/30 rounded text-[9px] sm:text-xs lg:text-sm flex items-center justify-center font-semibold text-blue-800 dark:text-blue-200">Rate</div>
                  <div className="h-4 sm:h-5 lg:h-6 bg-blue-100 dark:bg-blue-900/30 rounded text-[9px] sm:text-xs lg:text-sm flex items-center justify-center font-semibold text-blue-800 dark:text-blue-200">Commission</div>
                </div>

                {/* Data Rows */}
                <div className="space-y-1 sm:space-y-2">
                  <div className="grid grid-cols-4 gap-1 sm:gap-2">
                    <div className="h-4 sm:h-5 bg-slate-200 dark:bg-slate-600 rounded"></div>
                    <div className="h-4 sm:h-5 bg-green-300 dark:bg-green-700 rounded"></div>
                    <div className="h-4 sm:h-5 bg-green-300 dark:bg-green-700 rounded"></div>
                    <div className="h-4 sm:h-5 bg-green-400 dark:bg-green-600 rounded"></div>
                  </div>
                  <div className="grid grid-cols-4 gap-1 sm:gap-2">
                    <div className="h-4 sm:h-5 bg-slate-200 dark:bg-slate-600 rounded"></div>
                    <div className="h-4 sm:h-5 bg-green-300 dark:bg-green-700 rounded"></div>
                    <div className="h-4 sm:h-5 bg-green-300 dark:bg-green-700 rounded"></div>
                    <div className="h-4 sm:h-5 bg-green-400 dark:bg-green-600 rounded"></div>
                  </div>
                  <div className="grid grid-cols-4 gap-1 sm:gap-2">
                    <div className="h-4 sm:h-5 bg-slate-200 dark:bg-slate-600 rounded"></div>
                    <div className="h-4 sm:h-5 bg-green-300 dark:bg-green-700 rounded"></div>
                    <div className="h-4 sm:h-5 bg-green-300 dark:bg-green-700 rounded"></div>
                    <div className="h-4 sm:h-5 bg-green-400 dark:bg-green-600 rounded"></div>
                  </div>
                </div>

                {/* Total Row */}
                <div className="border-t border-slate-300 dark:border-slate-600 mt-2 sm:mt-3 pt-1 sm:pt-2">
                  <div className="grid grid-cols-4 gap-1 sm:gap-2">
                    <div className="h-4 sm:h-5 bg-slate-300 dark:bg-slate-500 rounded"></div>
                    <div className="h-4 sm:h-5 bg-green-400 dark:bg-green-600 rounded"></div>
                    <div className="h-4 sm:h-5 bg-green-400 dark:bg-green-600 rounded"></div>
                    <div className="h-4 sm:h-5 bg-green-500 dark:bg-green-500 rounded"></div>
                  </div>
                </div>
              </div>

              {/* File Info */}
              <div className="mt-3 sm:mt-4 flex items-center justify-between text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                <span>1.8 MB</span>
                <span>•</span>
                <span>25 rows</span>
              </div>
            </div>
          </motion.div>
        </ParallaxLayer>

        {/* Merged Result */}
        <ParallaxLayer offset={1} speed={0.6} className="flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.5, y: 100 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 1, delay: 2 }}
            className="relative z-40 px-2 sm:px-4"
          >
            <div className="bg-white dark:bg-slate-800 rounded-2xl sm:rounded-3xl p-3 sm:p-4 lg:p-6 xl:p-8 border-4 border-purple-200 dark:border-purple-700 max-w-xs sm:max-w-lg lg:max-w-2xl w-full">
              {/* Header */}
              <div className="text-center mb-4 sm:mb-6 lg:mb-8">
                <div className="w-12 h-12 sm:w-16 sm:h-16 lg:w-20 lg:h-20 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-2xl sm:rounded-3xl flex items-center justify-center mx-auto mb-3 sm:mb-4 lg:mb-6">
                  <CheckCircle className="w-6 h-6 sm:w-8 sm:h-8 lg:w-10 lg:h-10 text-white" />
                </div>
                <h3 className="text-lg sm:text-xl lg:text-2xl font-bold text-slate-800 dark:text-slate-200 mb-1 sm:mb-2 lg:mb-3">
                  Unified Dashboard
                </h3>
                <p className="text-xs sm:text-sm lg:text-lg text-slate-600 dark:text-slate-400">
                  AI-powered insights from multiple data sources
                </p>
              </div>
              
                {/* Dashboard Preview */}
                <div className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-700 dark:to-slate-800 rounded-2xl p-4 sm:p-6 mb-4 sm:mb-6">

                {/* Document and Table */}
                <div className="bg-white dark:bg-slate-800 rounded-xl p-3 sm:p-4">
                  <div className="flex items-center justify-between mb-3 sm:mb-4">
                    <h4 className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300">Data Processing</h4>
                    <div className="flex space-x-1 sm:space-x-2">
                      <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-blue-500 rounded-full"></div>
                      <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-green-500 rounded-full"></div>
                      <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-purple-500 rounded-full"></div>
                    </div>
                  </div>
                  
                  <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-4">
                    {/* Document Preview */}
                    <div className="flex-1">
                      <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-2 sm:p-3 border border-slate-200 dark:border-slate-600">
                        <div className="flex items-center space-x-2 mb-2 sm:mb-3">
                          <div className="w-5 h-5 sm:w-6 sm:h-6 bg-red-500 rounded flex items-center justify-center">
                            <FileText className="w-3 h-3 text-white" />
                          </div>
                          <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Commission Report.pdf</span>
                        </div>
                        
                        {/* Document Content */}
                        <div className="space-y-1 sm:space-y-2">
                          <div className="h-1.5 sm:h-2 bg-slate-300 dark:bg-slate-600 rounded w-3/4"></div>
                          <div className="h-1.5 sm:h-2 bg-slate-300 dark:bg-slate-600 rounded w-1/2"></div>
                          <div className="h-1.5 sm:h-2 bg-slate-300 dark:bg-slate-600 rounded w-5/6"></div>
                          <div className="h-1.5 sm:h-2 bg-slate-300 dark:bg-slate-600 rounded w-2/3"></div>
                        </div>
                        
                        <div className="mt-2 sm:mt-3 pt-1 sm:pt-2 border-t border-slate-200 dark:border-slate-600">
                          <div className="flex justify-between items-center">
                            <div className="h-1.5 sm:h-2 bg-slate-400 dark:bg-slate-500 rounded w-1/3"></div>
                            <div className="h-1.5 sm:h-2 bg-green-400 dark:bg-green-600 rounded w-1/4"></div>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Table Preview */}
                    <div className="flex-1">
                      <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-2 sm:p-3 border border-slate-200 dark:border-slate-600">
                        <div className="flex items-center space-x-2 mb-2 sm:mb-3">
                          <div className="w-5 h-5 sm:w-6 sm:h-6 bg-green-500 rounded flex items-center justify-center">
                            <FileSpreadsheet className="w-3 h-3 text-white" />
                          </div>
                          <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Extracted Data</span>
                        </div>
                        
                        {/* Table Content */}
                        <div className="space-y-1">
                          {/* Header Row */}
                          <div className="grid grid-cols-3 gap-1">
                            <div className="h-2 sm:h-2.5 bg-blue-200 dark:bg-blue-800 rounded text-[8px] sm:text-[10px] flex items-center justify-center font-medium text-blue-800 dark:text-blue-200">Agent</div>
                            <div className="h-2 sm:h-2.5 bg-blue-200 dark:bg-blue-800 rounded text-[8px] sm:text-[10px] flex items-center justify-center font-medium text-blue-800 dark:text-blue-200">Amount</div>
                            <div className="h-2 sm:h-2.5 bg-blue-200 dark:bg-blue-800 rounded text-[8px] sm:text-[10px] flex items-center justify-center font-medium text-blue-800 dark:text-blue-200">Commission</div>
                          </div>
                          
                          {/* Data Rows */}
                          <div className="space-y-1">
                            <div className="grid grid-cols-3 gap-1">
                              <div className="h-1.5 sm:h-2 bg-slate-300 dark:bg-slate-600 rounded"></div>
                              <div className="h-1.5 sm:h-2 bg-green-300 dark:bg-green-700 rounded"></div>
                              <div className="h-1.5 sm:h-2 bg-green-400 dark:bg-green-600 rounded"></div>
                            </div>
                            <div className="grid grid-cols-3 gap-1">
                              <div className="h-1.5 sm:h-2 bg-slate-300 dark:bg-slate-600 rounded"></div>
                              <div className="h-1.5 sm:h-2 bg-green-300 dark:bg-green-700 rounded"></div>
                              <div className="h-1.5 sm:h-2 bg-green-400 dark:bg-green-600 rounded"></div>
                            </div>
                            <div className="grid grid-cols-3 gap-1">
                              <div className="h-1.5 sm:h-2 bg-slate-300 dark:bg-slate-600 rounded"></div>
                              <div className="h-1.5 sm:h-2 bg-green-300 dark:bg-green-700 rounded"></div>
                              <div className="h-1.5 sm:h-2 bg-green-400 dark:bg-green-600 rounded"></div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Features */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 lg:gap-4">
                <div className="flex items-center space-x-2 sm:space-x-3 p-2 sm:p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg sm:rounded-xl">
                  <div className="w-6 h-6 sm:w-8 sm:h-8 bg-blue-500 rounded-lg flex items-center justify-center">
                    <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm font-semibold text-blue-800 dark:text-blue-200">Auto Extraction</p>
                    <p className="text-[10px] sm:text-xs text-blue-600 dark:text-blue-400">Smart data parsing</p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-2 sm:space-x-3 p-2 sm:p-3 bg-green-50 dark:bg-green-900/20 rounded-lg sm:rounded-xl">
                  <div className="w-6 h-6 sm:w-8 sm:h-8 bg-green-500 rounded-lg flex items-center justify-center">
                    <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm font-semibold text-green-800 dark:text-green-200">Real-time Analytics</p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-2 sm:space-x-3 p-2 sm:p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg sm:rounded-xl">
                  <div className="w-6 h-6 sm:w-8 sm:h-8 bg-purple-500 rounded-lg flex items-center justify-center">
                    <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm font-semibold text-purple-800 dark:text-purple-200">Smart Insights</p>
                    <p className="text-[10px] sm:text-xs text-purple-600 dark:text-purple-400">AI-powered trends</p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </ParallaxLayer>

        {/* Scroll Indicator */}
        <ParallaxLayer offset={0.3} speed={0.2} className="flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.5 }}
            className="text-center"
          >
        <div className="flex flex-col items-center space-y-4">
          <Mouse className="w-12 h-12 text-transparent bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text animate-bounce" />

            </div>
          </motion.div>
        </ParallaxLayer>

        {/* Laptop Sticky Section */}
        <ParallaxLayer sticky={{ start: 1.8, end: 3.8 }} className="flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 100 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 1.2, delay: 0.3 }}
            className="relative z-40 px-2 sm:px-4 w-full"
          >
            <div className="text-center mb-4 sm:mb-6 lg:mb-8 px-2">
              <h2 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl xl:text-5xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent mb-2 sm:mb-3 lg:mb-4">
                Experience the Platform
              </h2>
              <p className="text-sm sm:text-base md:text-lg lg:text-xl xl:text-2xl text-slate-600 dark:text-slate-300 max-w-2xl mx-auto">
                See how our dashboard works in real-time
              </p>
            </div>

            {/* Laptop */}
            <div className="relative w-full max-w-[calc(100vw-2rem)] sm:max-w-[calc(100vw-3rem)] md:max-w-[calc(100vw-4rem)] lg:max-w-none">
              <div className="w-[calc(100vw-3rem)] h-[calc((100vw-3rem)*0.6)] sm:w-[calc(100vw-4rem)] sm:h-[calc((100vw-4rem)*0.6)] md:w-[calc(100vw-5rem)] md:h-[calc((100vw-5rem)*0.6)] lg:w-[400px] lg:h-[250px] xl:w-[450px] xl:h-[290px] bg-gradient-to-b from-slate-600 via-slate-700 to-slate-800 dark:from-slate-700 dark:via-slate-800 dark:to-slate-900 rounded-xl sm:rounded-2xl relative border border-slate-500 dark:border-slate-600 mx-auto">
                {/* Laptop hinge */}
                <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-16 h-2.5 bg-gradient-to-b from-slate-500 to-slate-600 dark:from-slate-600 dark:to-slate-700 rounded-full"></div>
                
                {/* Screen bezel */}
                <div className="absolute top-1 left-1 right-1 bottom-9 bg-slate-800 dark:bg-slate-900 rounded-lg border border-slate-600 dark:border-slate-700">
                  {/* Screen */}
                  <motion.div
                    initial={{ rotateX: 90 }}
                    animate={{ rotateX: 0 }}
                    transition={{ duration: 2, delay: 0.5, type: "spring", stiffness: 80, damping: 20 }}
                    className="absolute top-1 left-1 right-1 bottom-1 bg-slate-900 dark:bg-slate-950 rounded-md overflow-hidden border border-slate-700 dark:border-slate-800"
                    style={{ transformOrigin: "bottom" }}
                  >
                    {/* Screen content */}
                    <div className="absolute inset-0 bg-slate-800 dark:bg-slate-900 rounded-md p-1 sm:p-2">
                      <motion.div
                        key={currentStep}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.6 }}
                        className="h-full w-full bg-white dark:bg-slate-800 rounded-md p-2 sm:p-3 lg:p-4 border border-slate-200 dark:border-slate-700 overflow-hidden"
                      >
                        {currentStepData.content(currentStepData.title, currentStepData.description)}
                      </motion.div>
                    </div>
                  </motion.div>
                </div>

                {/* Keyboard */}
                <div className="absolute bottom-0 left-0 right-0 h-7 bg-gradient-to-b from-slate-500 via-slate-600 to-slate-700 dark:from-slate-600 dark:via-slate-700 dark:to-slate-800 rounded-b-2xl border-t border-slate-400 dark:border-slate-600">
                  <div className="flex justify-center items-center h-full">
                    <div className="w-14 h-1.5 bg-slate-400 dark:bg-slate-600 rounded-full"></div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </ParallaxLayer>

        {/* Sticky Container with Title and Description */}
        <ParallaxLayer sticky={{ start: 1.8, end: 5 }} className="flex items-center justify-center">
          <div className="w-full h-screen flex flex-col lg:flex-row items-center px-2 sm:px-4 md:px-8 lg:px-16">
            {/* Left: Title - Hidden on mobile/tablet, shown on desktop */}
            <div className="hidden lg:block w-1/3 pr-4 xl:pr-8">
              <AnimatePresence mode="wait">
                <motion.div
                  key={`title-${currentStep}`}
                  initial={{ opacity: 0, y: 100 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -100 }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                  className="text-left"
                >
                  <h2 className="text-3xl xl:text-4xl font-bold text-slate-800 dark:text-slate-200 leading-tight">
                    {currentStepData.title}
                  </h2>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Center: Empty space for laptop */}
            <div className="w-full lg:w-1/3 flex justify-center mb-4 sm:mb-6 lg:mb-0">
              {/* Laptop is handled by the Laptop Sticky Section above */}
            </div>

            {/* Right: Description - Hidden on mobile/tablet, shown on desktop */}
            <div className="hidden lg:block w-1/3 pl-4 xl:pl-8">
              <AnimatePresence mode="wait">
                <motion.div
                  key={`description-${currentStep}`}
                  initial={{ opacity: 0, y: 100 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -100 }}
                  transition={{ duration: 0.8, ease: "easeOut", delay: 0.3 }}
                  className="text-left"
                >
                  <p className="text-base lg:text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
                    {currentStepData.description}
                  </p>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          {/* Progress Indicator */}
          <div className="absolute top-1/2 right-1 sm:right-2 md:right-4 lg:right-6 transform -translate-y-1/2 z-50">
            <div className="text-slate-500 dark:text-slate-400">
              <div className="flex flex-col items-center space-y-2 sm:space-y-3">
                <div className="w-1 h-16 sm:h-20 bg-slate-300 dark:bg-slate-600 rounded-full overflow-hidden">
                  <motion.div
                    className="w-full bg-gradient-to-t from-blue-500 to-purple-500 rounded-full"
                    initial={{ height: 0 }}
                    animate={{ height: `${(currentStep + 1) * 33.33}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
                
                <div className="flex flex-col space-y-1 sm:space-y-2">
                  {[0, 1, 2].map((step) => (
                    <div
                      key={step}
                      className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full transition-all duration-300 ${
                        currentStep >= step 
                          ? 'bg-blue-500 scale-125' 
                          : 'bg-slate-300 dark:bg-slate-600'
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </ParallaxLayer>

      </Parallax>
    </div>
  );
};

export default ScrollStorytellingCombined;
