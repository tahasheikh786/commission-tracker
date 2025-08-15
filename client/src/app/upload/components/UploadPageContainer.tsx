'use client'
import { useEffect } from 'react'
import Loader from './Loader'
import UploadInterface from './UploadInterface'
import TableEditorSection from './TableEditorSection'
import FieldMapperSection from './FieldMapperSection'
import DashboardSection from './DashboardSection'
import { useUploadPage } from '../hooks/useUploadPage'

export default function UploadPageContainer() {
  const {
    // State
    company,
    uploaded,
    mapping,
    fieldConfig,
    databaseFields,
    loadingFields,
    finalTables,
    fetchingMapping,
    showFieldMapper,
    showTableEditor,
    skipped,
    showRejectModal,
    rejectReason,
    submitting,
    savingMapping,
    planTypes,
    editedTables,
    originalFile,
    formatLearning,
    extractionHistory,
    currentExtractionIndex,
    isUsingAnotherExtraction,
    hasUsedAnotherExtraction,
    isImprovingExtraction,
    selectedStatementDate,

    // Actions
    setCompany,
    setUploaded,
    setMapping,
    setFieldConfig,
    setFinalTables,
    setShowFieldMapper,
    setShowTableEditor,
    setSkipped,
    setShowRejectModal,
    setRejectReason,
    setSubmitting,
    setSavingMapping,
    setPlanTypes,
    setEditedTables,
    setOriginalFile,
    setFormatLearning,
    setExtractionHistory,
    setCurrentExtractionIndex,
    setIsUsingAnotherExtraction,
    setHasUsedAnotherExtraction,
    setIsImprovingExtraction,
    setSelectedStatementDate,

    // Handlers
    handleReset,
    handleUploadResult,
    handleExtractedTablesChange,
    handleSaveEditedTables,
    handleUseAnotherExtraction,
    handleImproveExtraction,
    handleGoToFieldMapping,
    handleGoToPreviousExtraction,
    handleCloseTableEditor,
    applyMapping,
    handleApprove,
    handleReject,
    handleRejectSubmit,
    handleSendToPending,
    handleUseSuggestedMapping,
    handleFieldMapperSave,
    handleFieldMapperSkip,
    handleResumeFile,
    checkForActiveSession,
    handleStatementDateSelect,
  } = useUploadPage()

  // Debug state changes
  useEffect(() => {
    console.log('🔄 State changed:', {
      mapping: !!mapping,
      showFieldMapper,
      showTableEditor,
      skipped,
      finalTablesLength: finalTables.length,
      dashboardCondition: (mapping && !showFieldMapper) || skipped || (finalTables.length > 0 && !showFieldMapper),
      selectedStatementDate: selectedStatementDate
    })
  }, [mapping, showFieldMapper, showTableEditor, skipped, finalTables.length, selectedStatementDate])

  // 1. Show upload interface if no company selected or no upload yet
  if (!company || !uploaded) {
    return (
      <UploadInterface
        company={company}
        setCompany={setCompany}
        onUploadResult={handleUploadResult}
        onReset={handleReset}
        onResumeFile={handleResumeFile}
        onDeleteFile={(fileId) => {
          console.log('Pending file deleted:', fileId)
        }}
        selectedStatementDate={selectedStatementDate}
      />
    )
  }

  if (fetchingMapping && !showFieldMapper) {
    return (
      <div className="w-full flex items-center justify-center py-12">
        <Loader message="Loading saved mapping..." />
      </div>
    )
  }

  // 2. Show Table Editor first (new step)
  if (uploaded?.tables?.length && company && showTableEditor) {
    return (
      <TableEditorSection
        tables={uploaded.tables}
        onTablesChange={handleExtractedTablesChange}
        onSave={handleSaveEditedTables}
        onUseAnotherExtraction={handleUseAnotherExtraction}
        onGoToFieldMapping={handleGoToFieldMapping}
        onGoToPreviousExtraction={handleGoToPreviousExtraction}
        onClose={handleCloseTableEditor}
        uploaded={uploaded}
        loading={submitting || isUsingAnotherExtraction}
        extractionHistory={extractionHistory}
        currentExtractionIndex={currentExtractionIndex}
        isUsingAnotherExtraction={isUsingAnotherExtraction}
        hasUsedAnotherExtraction={hasUsedAnotherExtraction}
        onImproveExtraction={handleImproveExtraction}
        isImprovingExtraction={isImprovingExtraction}
        onStatementDateSelect={handleStatementDateSelect}
        companyId={company?.id}
        selectedStatementDate={selectedStatementDate}
        disableAutoDateExtraction={false}
      />
    )
  }

  // 3. Show Field Mapper
  if ((uploaded?.tables?.length || finalTables.length > 0) && company && !fetchingMapping && showFieldMapper) {
    console.log('🎯 UploadPageContainer: Rendering FieldMapperSection with selectedStatementDate:', selectedStatementDate)
    return (
      <FieldMapperSection
        company={company}
        uploaded={uploaded}
        editedTables={editedTables}
        finalTables={finalTables}
        fieldConfig={fieldConfig}
        databaseFields={databaseFields}
        mapping={mapping}
        planTypes={planTypes}
        selectedStatementDate={selectedStatementDate}
        savingMapping={savingMapping}
        fetchingMapping={fetchingMapping}
        onSave={handleFieldMapperSave}
        onSkip={handleFieldMapperSkip}
        onTablesChange={handleExtractedTablesChange}
        onGoToTableEditor={() => setShowTableEditor(true)}
        onReset={handleReset}
      />
    )
  }

  // 4. Show Dashboard
  if ((mapping && !showFieldMapper) || skipped || (finalTables.length > 0 && !showFieldMapper)) {
    return (
      <DashboardSection
        company={company}
        uploaded={uploaded}
        finalTables={finalTables}
        fieldConfig={fieldConfig}
        planTypes={planTypes}
        submitting={submitting}
        showRejectModal={showRejectModal}
        rejectReason={rejectReason}
        onEditMapping={() => {
          console.log('🎯 Edit Field Mapping clicked:', {
            currentCompany: company,
            showFieldMapper: showFieldMapper,
            skipped: skipped,
            uploaded: uploaded,
            finalTables: finalTables
          })
          setShowFieldMapper(true);
          setSkipped(false);
          console.log('🎯 States set - showFieldMapper: true, skipped: false')
        }}
        onApprove={handleApprove}
        onReject={handleReject}
        onRejectSubmit={handleRejectSubmit}
        onRejectReasonChange={setRejectReason}
        onCloseRejectModal={() => setShowRejectModal(false)}
        onTableChange={setFinalTables}
        onSendToPending={handleSendToPending}
        selectedStatementDate={selectedStatementDate}
      />
    )
  }

  // fallback: shouldn't ever get here
  return null
}
