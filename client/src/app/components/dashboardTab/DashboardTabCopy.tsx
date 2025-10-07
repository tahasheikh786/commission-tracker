'use client'
import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import StatCard from "./StatCard";
import CarriersModal from "./CarriersModal";
import { useDashboardStats, useCarriers, useEarnedCommissionStats } from "../../hooks/useDashboard";
import { TrendingUp, Upload, FileText, Users, Clock, CheckCircle, XCircle, AlertTriangle, ArrowRight, Sparkles, Building2, Database, Plus } from "lucide-react";
import CompanySelect from "../../upload/components/CompanySelect";
import BeautifulUploadZone from "../../upload/components/BeautifulUploadZone";
import CarrierUploadZone from "../CarrierUploadZone";
import DashboardTable from "../../upload/components/DashboardTable";
import DashboardTableFullPage from "@/app/upload/components/DashboardTableFullPage";
import TableEditor from "../../upload/components/TableEditor/TableEditor";
import FieldMapper from "../../upload/components/FieldMapper";
import toast from 'react-hot-toast';
import { useSubmission } from "@/context/SubmissionContext";
import { ApprovalLoader } from "../../components/ui/FullScreenLoader";
import StepIndicator from "../../components/ui/StepIndicator";

type FieldConfig = { field: string, label: string }

interface DashboardTabProps {
  showAnalytics?: boolean;
}

export default function DashboardTab({ showAnalytics = false }: DashboardTabProps) {
  const router = useRouter();
  const { refreshTrigger } = useSubmission();
  
  // Only fetch stats when analytics are needed
  const { stats, loading, refetch: refetchStats } = useDashboardStats(showAnalytics);
  const { carriers, loading: carriersLoading, fetchCarriers } = useCarriers();
  const { stats: earnedCommissionStats, loading: earnedCommissionLoading, refetch: refetchEarnedCommissionStats } = useEarnedCommissionStats(undefined, showAnalytics);
  const [carriersModalOpen, setCarriersModalOpen] = useState(false);

  // Upload and processing states
  const [company, setCompany] = useState<{ id: string, name: string } | null>(null);
  const [uploaded, setUploaded] = useState<any>(null);
  const [mapping, setMapping] = useState<Record<string, string> | null>(null);
  const [fieldConfig, setFieldConfig] = useState<FieldConfig[]>([]);
  const [databaseFields, setDatabaseFields] = useState<FieldConfig[]>([]);
  const [loadingFields, setLoadingFields] = useState(false);
  const [finalTables, setFinalTables] = useState<any[]>([]);
  const [fetchingMapping, setFetchingMapping] = useState(false);
  const [showFieldMapper, setShowFieldMapper] = useState(false);
  const [showTableEditor, setShowTableEditor] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const [mappingAutoApplied, setMappingAutoApplied] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [savingMapping, setSavingMapping] = useState(false);
  const [planTypes, setPlanTypes] = useState<string[]>([]);
  const [editedTables, setEditedTables] = useState<any[]>([]);
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [formatLearning, setFormatLearning] = useState<any>(null);
  const [currentStep, setCurrentStep] = useState('upload');
  const [selectedStatementDate, setSelectedStatementDate] = useState<any>(null);
  const [approvalProgress, setApprovalProgress] = useState({ totalRows: 0, processedRows: 0 });
  const [extractionMethod, setExtractionMethod] = useState('smart');

  const fetchMappingRef = useRef(false);

  // Refresh earned commission stats when component mounts (only if analytics are shown)
  useEffect(() => {
    if (showAnalytics) {
      refetchEarnedCommissionStats();
    }
  }, [refetchEarnedCommissionStats, showAnalytics]);

  // Listen for global refresh events (only if analytics are shown)
  useEffect(() => {
    if (showAnalytics) {
      // Add a small delay to prevent race conditions with auth refresh
      const timeoutId = setTimeout(() => {
        refetchStats();
        refetchEarnedCommissionStats();
      }, 100);
      
      return () => clearTimeout(timeoutId);
    }
  }, [refreshTrigger, refetchStats, refetchEarnedCommissionStats, showAnalytics]);

  // Load selected statement date from upload progress
  const loadSelectedStatementDate = useCallback(async () => {
    if (uploaded?.upload_id) {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/pending/progress/${uploaded.upload_id}/table_editor`);
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.progress_data?.selected_statement_date) {
            setSelectedStatementDate(data.progress_data.selected_statement_date);
          }
        }
      } catch (error) {
        console.error('Error loading selected statement date:', error);
      }
    }
  }, [uploaded?.upload_id]);

  // Load selected statement date when upload changes
  useEffect(() => {
    loadSelectedStatementDate();
  }, [loadSelectedStatementDate]);



  const handleCardClick = (cardType: string) => {
    switch (cardType) {
      case 'total_statements':
        router.push('/statements');
        break;
      case 'total_carriers':
        fetchCarriers();
        setCarriersModalOpen(true);
        break;
      case 'total_earned_commission':
        router.push('/?tab=earned-commission');
        break;
      case 'pending_reviews':
        router.push('/statements?tab=pending');
        break;
      case 'approved_statements':
        router.push('/statements?tab=approved');
        break;
      case 'rejected_statements':
        router.push('/statements?tab=rejected');
        break;
      default:
        break;
    }
  };

  // Fetch database fields from backend
  useEffect(() => {
    async function fetchDatabaseFields() {
      try {
        setLoadingFields(true);
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/database-fields/?active_only=true`);
        if (response.ok) {
          const data = await response.json();
          const fieldsFromBackend = data.map((field: any) => ({
            field: field.field_key,
            label: field.display_name
          }));
          setDatabaseFields(fieldsFromBackend);
          
          if (fieldConfig.length === 0) {
            setFieldConfig([]);
          }
        } else {
          console.error('Failed to fetch database fields');
          toast.error('Failed to load database fields');
        }
      } catch (error) {
        console.error('Error fetching database fields:', error);
        toast.error('Failed to load database fields');
      } finally {
        setLoadingFields(false);
      }
    }

    if (databaseFields.length === 0) {
      fetchDatabaseFields();
    }
  }, [databaseFields.length, fieldConfig.length]);

  // Handle upload result
  function handleUploadResult({ tables, upload_id, file_name, file, plan_types, field_config, quality_summary, extraction_config, format_learning }: any) {
    if (file && !originalFile) {
      setOriginalFile(file);
    }
    
    setUploaded({ tables, upload_id, file_name, file });
    setFinalTables([]);
    setFieldConfig(field_config || []);
    setFormatLearning(format_learning);
    
    if (format_learning?.suggested_mapping && Object.keys(format_learning.suggested_mapping).length > 0) {
      setMapping(format_learning.suggested_mapping);
      setMappingAutoApplied(true);
      toast.success('Field mappings auto-populated from learned format!');
    } else {
      setMapping(null);
      setMappingAutoApplied(false);
    }
    
    fetchMappingRef.current = false;
    setShowFieldMapper(false);
    setShowTableEditor(true);
    setSkipped(false);
    setShowRejectModal(false);
    setRejectReason('');
    if (plan_types) setPlanTypes(plan_types);
  }

  // Apply mapping function
  function applyMapping(
    tables: any[],
    mapping: Record<string, string>,
    fieldConfigOverride: FieldConfig[],
    onComplete?: () => void
  ) {
    const mappedRows = [];
    const dashboardHeader = fieldConfigOverride.map(f => f.field);
    
    for (const table of tables) {
      const tableRows = [];
      for (const row of table.rows) {
        if (!Array.isArray(row)) {
          continue;
        }
        
        // Create an object with field names as keys instead of an array
        const mappedRow: Record<string, string> = {};
        for (const field of dashboardHeader) {
          const column = mapping[field];
          if (column) {
            // Check if this is an auto-fill field (Invoice Total with __AUTO_FILL_ZERO__)
            if (column === '__AUTO_FILL_ZERO__') {
              mappedRow[field] = '$0.00'
            } else {
              const colIndex = table.header.indexOf(column);
              if (colIndex !== -1 && row[colIndex] !== undefined) {
                mappedRow[field] = row[colIndex];
              } else {
                mappedRow[field] = '';
              }
            }
          } else {
            mappedRow[field] = '';
          }
        }
        tableRows.push(mappedRow);
      }
      mappedRows.push({
        ...table,
        header: dashboardHeader,
        rows: tableRows,
        field_config: fieldConfigOverride,
      });
    }
    
    setFinalTables(mappedRows);
    
    if (onComplete) {
      onComplete();
    }
  }

  // Handle approve
  async function handleApprove() {
    if (!company || !uploaded?.upload_id) return;
    
    // Calculate total rows for progress tracking
    const totalRows = finalTables.reduce((total, table) => {
      return total + (table.rows ? table.rows.length : 0);
    }, 0);
    
    setApprovalProgress({ totalRows, processedRows: 0 });
    setSubmitting(true);
    
    try {
      const requestBody = {
        upload_id: uploaded.upload_id,
        final_data: finalTables,
        field_config: fieldConfig,
        plan_types: planTypes,
        selected_statement_date: selectedStatementDate,
      };
      
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/review/approve/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      
      if (response.ok) {
        // Simulate progress updates during processing
        const progressInterval = setInterval(() => {
          setApprovalProgress(prev => {
            if (prev.processedRows < prev.totalRows) {
              return { ...prev, processedRows: Math.min(prev.processedRows + Math.ceil(prev.totalRows / 10), prev.totalRows) };
            }
            return prev;
          });
        }, 200);
        
        // Clear interval after a delay to simulate completion
        setTimeout(() => {
          clearInterval(progressInterval);
          setApprovalProgress({ totalRows, processedRows: totalRows });
        }, 2000);
        
        toast.success('Statement approved successfully!');
        // Refresh earned commission stats after approval
        refetchEarnedCommissionStats();
        setTimeout(() => {
          window.location.href = '/?tab=dashboard';
        }, 1000);
      } else {
        const error = await response.json();
        toast.error(error.detail || 'Failed to approve statement');
      }
    } catch (error) {
      console.error('Error approving statement:', error);
      toast.error('Failed to approve statement');
    } finally {
      setSubmitting(false);
      setApprovalProgress({ totalRows: 0, processedRows: 0 });
    }
  }

  // Handle reject
  function handleReject() {
    setShowRejectModal(true);
  }

  async function handleRejectSubmit() {
    if (!company || !uploaded?.upload_id || !rejectReason.trim()) return;
    
    setSubmitting(true);
    try {
      
      const requestBody = {
        upload_id: uploaded.upload_id,
        final_data: finalTables,
        rejection_reason: rejectReason,
        field_config: fieldConfig,
        plan_types: planTypes,
        selected_statement_date: selectedStatementDate,
      };
      
      
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/review/reject/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      
      if (response.ok) {
        toast.success('Statement rejected successfully!');
        setTimeout(() => {
          window.location.href = '/?tab=dashboard';
        }, 1000);
      } else {
        const error = await response.json();
        toast.error(error.detail || 'Failed to reject statement');
      }
    } catch (error) {
      console.error('Error rejecting statement:', error);
      toast.error('Failed to reject statement');
    } finally {
      setSubmitting(false);
      setShowRejectModal(false);
    }
  }

  // Handle reset
  function handleReset() {
    setCompany(null);
    setUploaded(null);
    setMapping(null);
    setCurrentStep('upload');
    setFinalTables([]);
    setFieldConfig([]);
    fetchMappingRef.current = false;
    setShowFieldMapper(false);
    setShowTableEditor(false);
    setSkipped(false);
    setMappingAutoApplied(false);
    setShowRejectModal(false);
    setRejectReason('');
    setSubmitting(false);
    setPlanTypes([]);
    setEditedTables([]);
    setOriginalFile(null);
    setFormatLearning(null);
    setSelectedStatementDate(null);
    setExtractionMethod('smart');
  }

  const statCards = [
    { 
      label: "Total Statements", 
      value: stats?.total_statements || 0, 
      icon: FileText,
      type: 'total_statements',
      disabled: false,
      color: 'blue' as const,
      description: 'From last month',
      gradient: 'from-blue-500 to-indigo-600'
    },
    { 
      label: "Total Carriers", 
      value: stats?.total_carriers || 0, 
      icon: Users,
      type: 'total_carriers',
      disabled: false,
      color: 'purple' as const,
      description: 'Active carriers',
      gradient: 'from-purple-500 to-violet-600'
    },
    { 
      label: "Total Earned Commission", 
      value: earnedCommissionStats?.total_commission ? `$${(earnedCommissionStats.total_commission / 1000).toFixed(1)}K` : '$0', 
      icon: TrendingUp,
      type: 'total_earned_commission',
      disabled: false,
      color: 'green' as const,
      description: 'Total commission earned',
      gradient: 'from-emerald-500 to-teal-600'
    },
    { 
      label: "Pending Reviews", 
      value: stats?.pending_reviews || 0, 
      icon: Clock,
      type: 'pending_reviews',
      disabled: false,
      color: 'amber' as const,
      description: 'Awaiting review',
      gradient: 'from-amber-500 to-orange-600'
    },
    { 
      label: "Approved Statements", 
      value: stats?.approved_statements || 0, 
      icon: CheckCircle,
      type: 'approved_statements',
      disabled: false,
      color: 'green' as const,
      description: 'Successfully processed',
      gradient: 'from-green-500 to-emerald-600'
    },
    { 
      label: "Rejected Statements", 
      value: stats?.rejected_statements || 0, 
      icon: XCircle,
      type: 'rejected_statements',
      disabled: false,
      color: 'red' as const,
      description: 'Requires attention',
      gradient: 'from-red-500 to-rose-600'
    },
  ];

  // Render full-page components if active
  if (showTableEditor) {
    return (
      <div className="fixed inset-0 bg-white dark:bg-slate-900 z-50">
        <TableEditor
          tables={uploaded?.tables || []}
          onTablesChange={(tables) => {
            setUploaded({ ...uploaded, tables });
          }}
          onSave={async (tables, selectedDate) => {
            try {
              // Save tables to backend to trigger format learning
              if (uploaded?.upload_id && company?.id) {
                const requestBody = {
                  upload_id: uploaded.upload_id,
                  company_id: company.id,
                  tables: tables,
                  selected_statement_date: selectedDate
                }
                
                
                const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/table-editor/save-tables/`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(requestBody),
                })
                
                if (!response.ok) {
                  throw new Error(`Failed to save tables: ${response.status}`)
                }
                
              }
              
              // Update local state
              setUploaded({ ...uploaded, tables });
              if (selectedDate) {
                setSelectedStatementDate(selectedDate);
              }
              setShowTableEditor(false);
              setShowFieldMapper(true);
              
            } catch (error) {
              console.error('❌ DashboardTab: Error saving tables:', error)
              toast.error('Failed to save tables and learn format')
            }
          }}
          onUseAnotherExtraction={() => {
            // Handle use another extraction
          }}
          onGoToFieldMapping={() => {
            setShowTableEditor(false);
            setShowFieldMapper(true);
          }}
          onClose={() => {
            setShowTableEditor(false);
            handleReset();
          }}
          onStatementDateSelect={(dateInfo) => {
            setSelectedStatementDate(dateInfo);
          }}
          uploaded={uploaded}
          companyId={company?.id}
          selectedStatementDate={selectedStatementDate}
          disableAutoDateExtraction={false}
        />
      </div>
    );
  }

  if (showFieldMapper && company) {

    return (
      <div className="fixed inset-0 bg-white dark:bg-slate-900 z-50">
        <FieldMapper
          company={company}
          columns={uploaded?.tables?.[0]?.header || []}
          isLoading={savingMapping}
          onSave={async (mapping, fields, planTypes, tableNames, selectedDate) => {
            setSavingMapping(true);
            try {
              // Save mapping to backend to trigger format learning
              const config = {
                mapping: mapping,
                plan_types: planTypes,
                table_names: tableNames || [],
                field_config: fields,
                table_data: uploaded?.tables?.length > 0 ? uploaded.tables[0]?.rows || [] : [],
                headers: uploaded?.tables?.length > 0 ? uploaded.tables[0]?.header || [] : [],
                selected_statement_date: selectedDate,
              }
              
              
              const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/companies/${company.id}/mapping/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config),
              })
              
              if (!response.ok) {
                throw new Error(`Failed to save mapping: ${response.status}`)
              }
              
              
              // Update local state
              setFieldConfig(fields);
              setPlanTypes(planTypes);
              setMapping(mapping);
              setShowFieldMapper(false);
              
              // Apply mapping to get final tables
              applyMapping(uploaded?.tables || [], mapping, fields);
              
            } catch (error) {
              console.error('❌ DashboardTab: Error saving mapping:', error)
              toast.error('Failed to save mapping and learn format')
            } finally {
              setSavingMapping(false);
            }
          }}
          onSkip={() => {
            setShowFieldMapper(false);
            handleReset();
          }}
          onGoToTableEditor={() => {
            setShowFieldMapper(false);
            setShowTableEditor(true);
          }}
          initialFields={databaseFields}
          initialMapping={mapping || {}}
          initialPlanTypes={planTypes}
          tableNames={uploaded?.tables?.map((t: any) => t.name || 'Table') || []}
          tableData={uploaded?.tables || []}
          selectedStatementDate={selectedStatementDate}
        />
      </div>
    );
  }

  // Render full-page dashboard table if we have final tables
  if (finalTables.length > 0 && !showFieldMapper && !showTableEditor) {
    return (
      <DashboardTableFullPage
        tables={finalTables}
        fieldConfig={fieldConfig}
        onEditMapping={() => {
          setShowFieldMapper(true);
          setSkipped(false);
        }}
        onApprove={handleApprove}
        onReject={handleReject}
        onReset={handleReset}
        company={company}
        fileName={uploaded?.file_name || "uploaded.pdf"}
        fileUrl={uploaded?.file?.url || null}
        readOnly={false}
        onTableChange={setFinalTables}
        planTypes={planTypes}
        uploadId={uploaded?.upload_id}
        submitting={submitting}
        showRejectModal={showRejectModal}
        rejectReason={rejectReason}
        onRejectReasonChange={setRejectReason}
        onRejectSubmit={handleRejectSubmit}
        onCloseRejectModal={() => setShowRejectModal(false)}
        selectedStatementDate={selectedStatementDate}
      />
    );
  }

  // If showing analytics, render the stats grid
  if (showAnalytics) {
    return (
      <div className="w-full space-y-8">
        {/* Premium Stats Grid - Full Width */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
          {statCards.map((card, i) => (
            <div 
              key={i} 
              className="animate-scale-in"
              style={{ animationDelay: `${i * 100}ms` }}
            >
              <StatCard 
                label={card.label} 
                value={card.value} 
                icon={card.icon}
                onClick={() => handleCardClick(card.type)}
                disabled={card.disabled}
                loading={loading || earnedCommissionLoading}
                color={card.color}
                description={card.description}
                gradient={card.gradient}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <ApprovalLoader 
        isVisible={submitting}
        progress={approvalProgress.totalRows > 0 ? Math.round((approvalProgress.processedRows / approvalProgress.totalRows) * 100) : 0}
        totalRows={approvalProgress.totalRows}
        processedRows={approvalProgress.processedRows}
        onCancel={() => {
          // Note: Approval process cannot be cancelled as it's a server-side process
          toast.error("Approval process is already in progress and cannot be cancelled");
        }}
      />
      
      {/* New Integrated Upload Interface - Full Height */}
      <div className="w-full h-full min-h-[calc(100vh-200px)] p-6">
        <div className="h-full">
          <CarrierUploadZone
            onParsed={handleUploadResult}
            selectedStatementDate={selectedStatementDate}
            extractionMethod={extractionMethod}
            onExtractionMethodChange={setExtractionMethod}
          />
        </div>
      </div>

      {/* Final Dashboard Table with Approve/Reject - Show when uploaded */}
      {uploaded && finalTables.length > 0 && (
        <div className="space-y-6 mt-8 p-6">
          {/* Enhanced Progress Indicator */}
          <StepIndicator
            steps={[
              {
                id: 'upload',
                title: 'Upload',
                description: 'Document uploaded',
                status: 'completed'
              },
              {
                id: 'process',
                title: 'Process',
                description: 'AI extraction complete',
                status: 'completed'
              },
              {
                id: 'review',
                title: 'Review',
                description: 'Ready for approval',
                status: 'active'
              }
            ]}
            currentStep="review"
            className="mb-8"
          />

          {/* Dashboard Table */}
          <div className="bg-slate-100 dark:bg-slate-700/30 rounded-xl border border-slate-200 dark:border-slate-600 p-6">
            <DashboardTable
              tables={finalTables}
              fieldConfig={fieldConfig}
              onEditMapping={() => {
                setShowFieldMapper(true);
                setSkipped(false);
              }}
              company={company}
              fileName={uploaded?.file_name || "uploaded.pdf"}
              fileUrl={uploaded?.file?.url || null}
              readOnly={false}
              onTableChange={setFinalTables}
              planTypes={planTypes}
              onSendToPending={() => {}}
              uploadId={uploaded?.upload_id}
              selectedStatementDate={selectedStatementDate}
            />
          </div>

          {/* Enhanced Action Buttons */}
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleReset}
              className="px-6 py-3 bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-xl hover:bg-slate-300 dark:hover:bg-slate-500 transition-all duration-200 font-semibold shadow-md hover:shadow-lg"
            >
              Upload Another PDF
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="bg-gradient-to-r from-green-500 to-emerald-600 text-white px-8 py-3 rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all duration-200"
              onClick={handleApprove}
              disabled={submitting}
            >
              {submitting ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Processing...
                </div>
              ) : (
                'Approve'
              )}
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="bg-gradient-to-r from-red-500 to-rose-600 text-white px-8 py-3 rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all duration-200"
              onClick={handleReject}
              disabled={submitting}
            >
              {submitting ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Processing...
                </div>
              ) : (
                'Reject'
              )}
            </motion.button>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-8 shadow-2xl max-w-md w-full mx-4 border border-slate-200 dark:border-slate-700">
          <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-4">Reject Submission</h3>
          <input
            className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 mb-6 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-400"
            placeholder="Enter rejection reason"
            value={rejectReason}
            onChange={e => setRejectReason(e.target.value)}
          />
            <div className="flex gap-3">
              <button
                className="flex-1 bg-gradient-to-r from-red-500 to-rose-600 text-white px-4 py-3 rounded-xl font-semibold disabled:opacity-50 cursor-pointer"
                disabled={!rejectReason.trim() || submitting}
                onClick={handleRejectSubmit}
              >
                Submit
              </button>
              <button
                className="flex-1 bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-300 px-4 py-3 rounded-xl font-semibold hover:bg-slate-300 dark:hover:bg-slate-500 transition-colors cursor-pointer"
                onClick={() => setShowRejectModal(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Carriers Modal */}
      <CarriersModal
        isOpen={carriersModalOpen}
        onClose={() => setCarriersModalOpen(false)}
        carriers={carriers}
        loading={carriersLoading}
      />

    </>
  );
}
