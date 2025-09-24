'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Upload, FileText, Shield } from 'lucide-react';

export default function UploadPageContent() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16">
            <button
              onClick={() => router.back()}
              className="flex items-center gap-2 px-3 py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <div className="flex items-center gap-3 ml-4">
              <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
                <Upload className="h-4 w-4 text-white" />
              </div>
              <h1 className="text-xl font-bold text-slate-900">Upload Statements</h1>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-8">
          <div className="text-center">
            <div className="w-20 h-20 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg">
              <Upload className="h-10 w-10 text-white" />
            </div>
            <h2 className="text-3xl font-bold text-slate-900 mb-3">Upload Commission Statements</h2>
            <p className="text-slate-600 mb-8 text-lg">
              Upload your commission statements for AI-powered processing and analysis
            </p>
            
            {/* Upload Area */}
            <div className="border-2 border-dashed border-slate-300 rounded-2xl p-16 hover:border-blue-400 hover:bg-blue-50/30 transition-all duration-300 group">
              <div className="w-16 h-16 bg-slate-100 rounded-xl flex items-center justify-center mx-auto mb-6 group-hover:bg-blue-100 transition-colors">
                <FileText className="h-8 w-8 text-slate-400 group-hover:text-blue-600 transition-colors" />
              </div>
              <p className="text-xl font-semibold text-slate-900 mb-3">Drop files here or click to upload</p>
              <p className="text-slate-500 mb-6">PDF, Excel, or other supported formats • Up to 50MB</p>
              <button className="px-8 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105">
                Choose Files
              </button>
            </div>

            {/* Security Notice */}
            <div className="mt-8 p-6 bg-emerald-50 border border-emerald-200 rounded-xl">
              <div className="flex items-center justify-center gap-3">
                <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
                  <Shield className="h-4 w-4 text-emerald-600" />
                </div>
                <p className="text-sm text-emerald-800 font-medium">
                  Your files are securely processed and stored with enterprise-grade security
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
