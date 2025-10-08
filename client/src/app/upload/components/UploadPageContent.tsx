'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Upload, Shield, Sparkles, Building2, Calendar } from 'lucide-react';
import BeautifulUploadZone from './BeautifulUploadZone';
import { useAuth } from '@/context/AuthContext';
import toast from 'react-hot-toast';

export default function UploadPageContent() {
  const router = useRouter();
  const { user } = useAuth();
  const [extractedCarrier, setExtractedCarrier] = useState<string | null>(null);
  const [extractedDate, setExtractedDate] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

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
    extracted_carrier?: string;
    extracted_date?: string;
    document_metadata?: any;
  }) => {
    // Handle successful upload
    toast.success('Document uploaded and processed successfully!');
    
    // Store extracted information
    if (result.extracted_carrier) {
      setExtractedCarrier(result.extracted_carrier);
    }
    if (result.extracted_date) {
      setExtractedDate(result.extracted_date);
    }
    
    // Navigate to dashboard with extracted information
    // The dashboard will use this information when saving tables
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
              <Sparkles className="h-10 w-10 text-white" />
            </div>
            <h2 className="text-3xl font-bold text-slate-900 mb-3">AI-Powered Commission Processing</h2>
            <p className="text-slate-600 mb-8 text-lg">
              Simply upload your statements - our AI will automatically detect the carrier and extract all data
            </p>
            
            {/* AI Extraction Status */}
            {isProcessing && (
              <div className="mb-8 p-6 bg-blue-50 border border-blue-200 rounded-xl">
                <div className="flex items-center justify-center gap-3">
                  <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-blue-800 font-medium">
                    AI is analyzing your document...
                  </p>
                </div>
              </div>
            )}

            {/* Extracted Information Display */}
            {(extractedCarrier || extractedDate) && (
              <div className="mb-8 p-6 bg-emerald-50 border border-emerald-200 rounded-xl">
                <h3 className="text-lg font-semibold text-emerald-800 mb-4">AI Detection Results</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {extractedCarrier && (
                    <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-emerald-200">
                      <Building2 className="h-5 w-5 text-emerald-600" />
                      <div>
                        <p className="text-sm text-emerald-600 font-medium">Carrier</p>
                        <p className="text-emerald-800 font-semibold">{extractedCarrier}</p>
                      </div>
                    </div>
                  )}
                  {extractedDate && (
                    <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-emerald-200">
                      <Calendar className="h-5 w-5 text-emerald-600" />
                      <div>
                        <p className="text-sm text-emerald-600 font-medium">Statement Date</p>
                        <p className="text-emerald-800 font-semibold">{extractedDate}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
            
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
