'use client'
import React, { useState } from "react";
import { 
  TestTube, 
  Loader, 
  Table, 
  MapPin, 
  Eye, 
  Sparkles,
  Play,
  Settings,
  Zap
} from "lucide-react";
import { ApprovalLoader } from "../../components/ui/FullScreenLoader";
import MinimalLoader from "../../components/ui/MinimalLoader";
import EnhancedProgressLoader from "../../components/ui/EnhancedProgressLoader";
import TableEditorDemo from "../demo/TableEditorDemo";
import FieldMapperDemo from "../demo/FieldMapperDemo";
import ReviewDemo from "../demo/ReviewDemo";
import IntegratedDemoFlow from "../../upload/components/IntegratedDemoFlow";
import toast from 'react-hot-toast';

export default function DemosTab() {
  const [showMinimalLoader, setShowMinimalLoader] = useState(false);
  const [showEnhancedProgressLoader, setShowEnhancedProgressLoader] = useState(false);
  const [showTableEditorDemo, setShowTableEditorDemo] = useState(false);
  const [showFieldMapperDemo, setShowFieldMapperDemo] = useState(false);
  const [showReviewDemo, setShowReviewDemo] = useState(false);
  const [showIntegratedDemo, setShowIntegratedDemo] = useState(false);
  
  // Enhanced Progress Loader state
  const [progressLoaderProgress, setProgressLoaderProgress] = useState(0);
  const [progressLoaderStage, setProgressLoaderStage] = useState('Initializing');
  const [progressLoaderMessage, setProgressLoaderMessage] = useState('Starting document processing...');
  const [progressLoaderEstimatedTime, setProgressLoaderEstimatedTime] = useState('30-45 seconds');
  const [error, setError] = useState<string | null>(null);

  const demoCards = [
    {
      id: 'enhanced-progress-loader',
      title: 'Test Enhanced Progress Loader',
      description: 'Advanced progress modal with WebSocket simulation and real-time updates',
      icon: Settings,
      color: 'gradient',
      buttonText: 'Try Enhanced Loader',
      onClick: () => {
        setShowEnhancedProgressLoader(true);
        simulateProgressLoader();
      }
    },
    {
      id: 'minimal-loader-websocket',
      title: 'Test Minimal Loader WebSocket',
      description: 'Minimal loader with full WebSocket simulation and real-time progress tracking',
      icon: Loader,
      color: 'blue',
      buttonText: 'Try WebSocket Loader',
      onClick: () => {
        setShowMinimalLoader(true);
        simulateWebSocketProgress();
      }
    },
  ];

  const getColorClasses = (color: string) => {
    const colors = {
      blue: 'bg-blue-600 hover:bg-blue-700',
      green: 'bg-green-600 hover:bg-green-700',
      purple: 'bg-purple-600 hover:bg-purple-700',
      orange: 'bg-orange-600 hover:bg-orange-700',
      teal: 'bg-teal-600 hover:bg-teal-700',
      indigo: 'bg-indigo-600 hover:bg-indigo-700',
      gradient: 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700'
    };
    return colors[color as keyof typeof colors] || colors.blue;
  };

  // Simulate progress loader with realistic stages
  const simulateProgressLoader = () => {
    setProgressLoaderProgress(0);
    setProgressLoaderStage('Initializing');
    setProgressLoaderMessage('Starting document processing...');
    setProgressLoaderEstimatedTime('30-45 seconds');

    const stages = [
      { stage: 'document_processing', progress: 20, message: 'Analyzing document structure and format', time: '5-10 seconds' },
      { stage: 'table_detection', progress: 40, message: 'AI-powered table and data structure identification', time: '10-15 seconds' },
      { stage: 'data_extraction', progress: 65, message: 'Extracting text and financial data from tables', time: '15-20 seconds' },
      { stage: 'financial_processing', progress: 85, message: 'Processing commission calculations and financial data', time: '8-12 seconds' },
      { stage: 'quality_assurance', progress: 100, message: 'Validating extraction accuracy and completeness', time: '3-5 seconds' }
    ];

    let currentStage = 0;
    const interval = setInterval(() => {
      if (currentStage < stages.length) {
        const stage = stages[currentStage];
        setProgressLoaderStage(stage.stage);
        setProgressLoaderProgress(stage.progress);
        setProgressLoaderMessage(stage.message);
        setProgressLoaderEstimatedTime(stage.time);
        currentStage++;
      } else {
        clearInterval(interval);
        // Auto-close after completion
        setTimeout(() => {
          setShowEnhancedProgressLoader(false);
          toast.success('Enhanced progress loader demo completed!');
        }, 2000);
      }
    }, 2000);
  };

  // Simulate WebSocket progress for MinimalLoader
  const simulateWebSocketProgress = () => {
    setProgressLoaderProgress(0);
    setProgressLoaderStage('document_processing');
    setProgressLoaderMessage('Starting document processing...');
    setProgressLoaderEstimatedTime('25-35 seconds');
    setError(null);

    const stages = [
      { stage: 'document_processing', progress: 20, message: 'Analyzing document structure and format', time: '5-8 seconds' },
      { stage: 'table_detection', progress: 40, message: 'AI-powered table and data structure identification', time: '8-12 seconds' },
      { stage: 'data_extraction', progress: 65, message: 'Extracting text and financial data from tables', time: '10-15 seconds' },
      { stage: 'financial_processing', progress: 85, message: 'Processing commission calculations and financial data', time: '6-10 seconds' },
      { stage: 'quality_assurance', progress: 100, message: 'Validating extraction accuracy and completeness', time: '3-5 seconds' }
    ];

    let currentStage = 0;
    const interval = setInterval(() => {
      if (currentStage < stages.length) {
        const stage = stages[currentStage];
        setProgressLoaderStage(stage.stage);
        setProgressLoaderProgress(stage.progress);
        setProgressLoaderMessage(stage.message);
        setProgressLoaderEstimatedTime(stage.time);
        currentStage++;
      } else {
        clearInterval(interval);
        // Auto-close after completion
        setTimeout(() => {
          setShowMinimalLoader(false);
          toast.success('Minimal loader WebSocket demo completed!');
        }, 2000);
      }
    }, 1500);
  };

  return (
    <div className="w-full space-y-8">
      {/* Header Section */}
      <div className="text-center mb-12">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-primary to-primary/80 rounded-2xl mb-4 shadow-lg">
          <TestTube className="text-white" size={32} />
        </div>
        <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-200 mb-4">
          Demo Center
        </h1>
        <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
          Test all system functionalities with sample data. 
          Explore different components and workflows.
        </p>
      </div>

      {/* Featured Demo - Integrated Demo */}
      <div className="mb-12">
        <div className="bg-gradient-to-r from-blue-50 via-purple-50 to-pink-50 dark:from-slate-800/50 dark:via-slate-700/50 dark:to-slate-600/50 rounded-3xl border border-blue-200 dark:border-slate-700 shadow-2xl overflow-hidden">
          <div className="p-8 md:p-12">
            <div className="flex flex-col lg:flex-row items-center gap-8">
              <div className="flex-1">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-16 h-16 bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 rounded-2xl flex items-center justify-center shadow-lg">
                    <Sparkles className="text-white" size={32} />
                  </div>
                  <div>
                    <h2 className="text-3xl font-bold text-blue-800 dark:text-slate-200 mb-2">
                      Complete Integrated Demo
                    </h2>
                    <div className="flex items-center gap-2 text-blue-600 dark:text-slate-400">
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                      <span className="text-sm font-medium">Complete system experience</span>
                    </div>
                  </div>
                </div>
                
                <p className="text-lg text-blue-700 dark:text-slate-300 mb-8 leading-relaxed">
                  Complete integrated flow: Upload → Process → Mapping → Review with step-by-step navigation. 
                  Experience the entire commission document extraction and processing workflow.
                </p>
                
                <div className="flex flex-wrap gap-4 mb-6">
                  <div className="flex items-center gap-2 bg-white/50 dark:bg-slate-700/30 px-4 py-2 rounded-full">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-sm font-medium text-blue-800 dark:text-slate-200">Upload</span>
                  </div>
                  <button 
                    onClick={() => setShowTableEditorDemo(true)}
                    className="flex items-center gap-2 bg-white/50 dark:bg-slate-700/30 px-4 py-2 rounded-full hover:bg-white/70 dark:hover:bg-slate-600/40 transition-all duration-200 cursor-pointer"
                  >
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    <span className="text-sm font-medium text-blue-800 dark:text-slate-200">Process</span>
                  </button>
                  <button 
                    onClick={() => setShowFieldMapperDemo(true)}
                    className="flex items-center gap-2 bg-white/50 dark:bg-slate-700/30 px-4 py-2 rounded-full hover:bg-white/70 dark:hover:bg-slate-600/40 transition-all duration-200 cursor-pointer"
                  >
                    <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                    <span className="text-sm font-medium text-blue-800 dark:text-slate-200">Mapping</span>
                  </button>
                  <button 
                    onClick={() => setShowReviewDemo(true)}
                    className="flex items-center gap-2 bg-white/50 dark:bg-slate-700/30 px-4 py-2 rounded-full hover:bg-white/70 dark:hover:bg-slate-600/40 transition-all duration-200 cursor-pointer"
                  >
                    <div className="w-2 h-2 bg-pink-500 rounded-full"></div>
                    <span className="text-sm font-medium text-blue-800 dark:text-slate-200">Review</span>
                  </button>
                </div>
              </div>
              
              <div className="flex-shrink-0">
                <button
                  onClick={() => setShowIntegratedDemo(true)}
                  className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 hover:from-blue-700 hover:via-purple-700 hover:to-pink-700 text-white px-8 py-4 rounded-2xl font-bold text-lg transition-all duration-300 transform hover:scale-105 active:scale-95 shadow-xl hover:shadow-2xl cursor-pointer flex items-center gap-3"
                >
                  <Play size={20} />
                  Try Integrated Demo
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Demo Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {demoCards.map((demo, index) => {
          const Icon = demo.icon;
          return (
            <div 
              key={demo.id}
              className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-lg overflow-hidden hover:shadow-xl transition-all duration-300 transform hover:scale-105"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className="p-6">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-slate-100 dark:from-slate-700 to-slate-200 dark:to-slate-600 rounded-xl flex items-center justify-center">
                    <Icon className="text-slate-600 dark:text-slate-400" size={24} />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-1">
                      {demo.title}
                    </h3>
                  </div>
                </div>
                
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-6 leading-relaxed">
                  {demo.description}
                </p>
                
                <button
                  onClick={demo.onClick}
                  className={`w-full ${getColorClasses(demo.color)} text-white px-4 py-3 rounded-xl font-medium transition-all duration-200 transform hover:scale-105 active:scale-95 shadow-lg hover:shadow-xl cursor-pointer`}
                >
                  <div className="flex items-center justify-center gap-2">
                    <Play size={16} />
                    {demo.buttonText}
                  </div>
                </button>
              </div>
            </div>
          );
        })}
      </div>


      {/* Test Minimal Loader */}
      <MinimalLoader 
        isVisible={showMinimalLoader} 
        progress={progressLoaderProgress}
        stage={progressLoaderStage}
        message={progressLoaderMessage}
        estimatedTime={progressLoaderEstimatedTime}
        fileName="sample_commission_statement.pdf"
        onCancel={() => {
          setShowMinimalLoader(false);
          toast.success("Minimal loader cancelled");
        }}
        onRetry={() => {
          setShowMinimalLoader(false);
          setTimeout(() => {
            setShowMinimalLoader(true);
            simulateProgressLoader();
          }, 500);
        }}
        error={error}
      />

      {/* Test Table Editor Demo */}
      {showTableEditorDemo && (
        <TableEditorDemo onClose={() => setShowTableEditorDemo(false)} />
      )}


      {/* Test Field Mapper Demo */}
      {showFieldMapperDemo && (
        <FieldMapperDemo onClose={() => setShowFieldMapperDemo(false)} />
      )}


      {/* Test Review Demo */}
      {showReviewDemo && (
        <ReviewDemo onClose={() => setShowReviewDemo(false)} />
      )}

      {/* Test Integrated Demo Flow */}
      {showIntegratedDemo && (
        <IntegratedDemoFlow onClose={() => setShowIntegratedDemo(false)} />
      )}

      {/* Test Enhanced Progress Loader */}
      <EnhancedProgressLoader
        isVisible={showEnhancedProgressLoader}
        progress={progressLoaderProgress}
        stage={progressLoaderStage}
        message={progressLoaderMessage}
        estimatedTime={progressLoaderEstimatedTime}
        fileName="sample_commission_statement.pdf"
        onCancel={() => {
          setShowEnhancedProgressLoader(false);
          toast.success("Enhanced progress loader cancelled");
        }}
        onRetry={() => {
          setShowEnhancedProgressLoader(false);
          setTimeout(() => {
            setShowEnhancedProgressLoader(true);
            simulateProgressLoader();
          }, 500);
        }}
      />
    </div>
  );
}
