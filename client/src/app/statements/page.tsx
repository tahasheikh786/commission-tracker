'use client'
import React, { useState, useEffect } from 'react';
import { ArrowLeft, FileText, CheckCircle, XCircle, Clock, Download, Eye } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useStatements } from '../hooks/useDashboard';

interface Statement {
  id: string;
  file_name: string;
  company_name: string;
  status: 'extracted' | 'success' | 'completed' | 'Approved' | 'rejected' | 'pending';
  uploaded_at: string;
  last_updated: string;
  completed_at?: string;
  rejection_reason?: string;
  plan_types?: string[];
  raw_data?: any;
  edited_tables?: any;
  final_data?: any;
}

export default function StatementsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'all' | 'approved' | 'rejected' | 'pending'>('all');
  const { statements, loading, fetchStatements } = useStatements();
  const [groupedStatements, setGroupedStatements] = useState<Record<string, Statement[]>>({});
  const [allStatements, setAllStatements] = useState<Statement[]>([]);
  
  // Handle URL parameters for initial tab
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');
    if (tabParam && ['all', 'approved', 'rejected', 'pending'].includes(tabParam)) {
      setActiveTab(tabParam as any);
    }
  }, []);

  // Fetch all statements on component mount for tab counts
  useEffect(() => {
    const fetchAllStatements = async () => {
      try {
        const response = await fetch('/api/dashboard/statements');
        if (response.ok) {
          const data = await response.json();
          setAllStatements(data);
        }
      } catch (error) {
        console.error('Error fetching all statements:', error);
      }
    };
    fetchAllStatements();
  }, []);

  useEffect(() => {
    if (activeTab === 'all') {
      fetchStatements();
    } else {
      fetchStatements(activeTab);
    }
  }, [activeTab, fetchStatements]);

  useEffect(() => {
    // Group statements by company
    const grouped = statements.reduce((acc: Record<string, Statement[]>, statement: Statement) => {
      if (!acc[statement.company_name]) {
        acc[statement.company_name] = [];
      }
      acc[statement.company_name].push(statement);
      return acc;
    }, {});
    
    setGroupedStatements(grouped);
  }, [statements]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
      case 'Approved':
        return <CheckCircle className="text-green-500" size={20} />;
      case 'rejected':
        return <XCircle className="text-red-500" size={20} />;
      case 'extracted':
      case 'success':
      case 'pending':
        return <Clock className="text-yellow-500" size={20} />;
      default:
        return <FileText className="text-gray-500" size={20} />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
      case 'Approved':
        return 'bg-green-100 text-green-800';
      case 'rejected':
        return 'bg-red-100 text-red-800';
      case 'extracted':
      case 'success':
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const tabs = [
    { id: 'all', label: 'All', count: allStatements.length },
    { id: 'approved', label: 'Approved', count: allStatements.filter(s => ['completed', 'Approved'].includes(s.status)).length },
    { id: 'rejected', label: 'Rejected', count: allStatements.filter(s => s.status === 'rejected').length },
    { id: 'pending', label: 'Pending', count: allStatements.filter(s => ['extracted', 'success'].includes(s.status)).length },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => router.back()}
            className="p-2 hover:bg-white rounded-full transition-colors"
          >
            <ArrowLeft size={24} className="text-gray-600" />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-gray-800">Statements Management</h1>
            <p className="text-gray-600">View and manage all uploaded statements</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-2xl shadow-sm mb-6">
          <div className="flex border-b border-gray-200">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex-1 px-6 py-4 text-center font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  {tab.label}
                  <span className="bg-gray-200 text-gray-700 px-2 py-1 rounded-full text-sm">
                    {tab.count}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="space-y-6">
          {loading ? (
            <div className="bg-white rounded-2xl shadow-sm p-12 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
              <p className="text-gray-600 mt-4">Loading statements...</p>
            </div>
          ) : Object.keys(groupedStatements).length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm p-12 text-center">
              <FileText className="mx-auto text-gray-400" size={48} />
              <h3 className="text-xl font-semibold text-gray-600 mt-4">No statements found</h3>
              <p className="text-gray-500 mt-2">
                {activeTab === 'all' 
                  ? 'No statements have been uploaded yet.'
                  : `No ${activeTab} statements found.`
                }
              </p>
            </div>
          ) : (
            Object.entries(groupedStatements).map(([companyName, companyStatements]) => (
              <div key={companyName} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-4 border-b border-gray-200">
                  <h2 className="text-xl font-semibold text-gray-800">{companyName}</h2>
                  <p className="text-gray-600 text-sm">
                    {companyStatements.length} statement{companyStatements.length !== 1 ? 's' : ''}
                  </p>
                </div>
                
                <div className="divide-y divide-gray-200">
                  {companyStatements.map((statement) => (
                    <div key={statement.id} className="p-6 hover:bg-gray-50 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          {getStatusIcon(statement.status)}
                          <div>
                            <h3 className="font-semibold text-gray-800">{statement.file_name}</h3>
                            <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                              <span>Uploaded: {formatDate(statement.uploaded_at)}</span>
                              {statement.completed_at && (
                                <span>Completed: {formatDate(statement.completed_at)}</span>
                              )}
                            </div>
                            {statement.plan_types && statement.plan_types.length > 0 && (
                              <div className="flex gap-2 mt-2">
                                {statement.plan_types.map((plan, index) => (
                                  <span
                                    key={index}
                                    className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full"
                                  >
                                    {plan}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        
                                                  <div className="flex items-center gap-3">
                            <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(statement.status)}`}>
                              {statement.status === 'extracted' || statement.status === 'success' || statement.status === 'pending' ? 'Pending' :
                               statement.status === 'completed' || statement.status === 'Approved' ? 'Approved' :
                               statement.status === 'rejected' ? 'Rejected' :
                               statement.status}
                            </span>
                          
                          <div className="flex gap-2">
                            <button
                              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                              title="View details"
                            >
                              <Eye size={16} className="text-gray-500" />
                            </button>
                            <button
                              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                              title="Download"
                            >
                              <Download size={16} className="text-gray-500" />
                            </button>
                            {(statement.status === 'extracted' || statement.status === 'success' || statement.status === 'pending') && (
                              <button
                                onClick={() => router.push(`/upload?resume=${statement.id}`)}
                                className="px-3 py-1 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors"
                                title="Complete Review"
                              >
                                Complete Review
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      {statement.rejection_reason && (
                        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                          <p className="text-sm text-red-700">
                            <strong>Rejection Reason:</strong> {statement.rejection_reason}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
} 