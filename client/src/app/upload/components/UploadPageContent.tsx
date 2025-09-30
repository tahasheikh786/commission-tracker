'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Upload, Shield } from 'lucide-react';
import BeautifulUploadZone from './BeautifulUploadZone';
import { useAuth } from '@/context/AuthContext';
import toast from 'react-hot-toast';

export default function UploadPageContent() {
  const router = useRouter();
  const { user } = useAuth();

  const handleUploadResult = (result: {
    tables: any[];
    upload_id?: string;
    file_name: string;
    file: File;
    quality_summary?: any;
    extraction_config?: any;
    format_learning?: any;
    gcs_url?: string;
    gcs_key?: string;
  }) => {
    // Handle successful upload
    toast.success('Document uploaded and processed successfully!');
    
    // Navigate to dashboard or show results
    router.push('/');
  };

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
            
            {/* Functional Upload Zone */}
            <BeautifulUploadZone
              onParsed={handleUploadResult}
              disabled={false}
              companyId={user?.company_id || ''}
            />

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
