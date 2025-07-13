// src/app/context/SubmissionContext.tsx
'use client'
import React, { createContext, useContext, useState, ReactNode } from "react";

export type FieldConfig = { field: string; label: string };

export type Submission = {
  id: string;
  companyName: string;
  fileName: string;
  fileUrl: string | null;
  tableData: any; // The DashboardTable data, for preview
  fieldConfig?: FieldConfig[]; // <-- Added for preview columns
  status: "Approved" | "Rejected";
  rejectionReason?: string;
};

type SubmissionContextType = {
  submissions: Submission[];
  addSubmission: (sub: Submission) => void;
  clearSubmissions: () => void;
};

const SubmissionContext = createContext<SubmissionContextType | undefined>(undefined);

export function SubmissionProvider({ children }: { children: ReactNode }) {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  function addSubmission(sub: Submission) {
    setSubmissions((prev) => [...prev, sub]);
  }
  function clearSubmissions() {
    setSubmissions([]);
  }
  return (
    <SubmissionContext.Provider value={{ submissions, addSubmission, clearSubmissions }}>
      {children}
    </SubmissionContext.Provider>
  );
}

export function useSubmission() {
  const ctx = useContext(SubmissionContext);
  if (!ctx) throw new Error("useSubmission must be used within SubmissionProvider");
  return ctx;
}
