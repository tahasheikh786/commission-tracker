'use client'
import React from "react";
import StatCard from "./StatCard";

const stats = [
  { label: "Total Statements", value: "1,285", icon: "FileText" },
  { label: "Total Carriers", value: "37", icon: "Database" },
  { label: "Total Premium", value: "$548,000", icon: "User" },
  { label: "Policies Count", value: "2,950", icon: "FileText" },
  { label: "Pending Reviews", value: "8", icon: "Database" },
  { label: "Approved Statements", value: "1,250", icon: "FileText" },
  { label: "Rejected Statements", value: "27", icon: "User" },
];

export default function DashboardTab() {
  return (
    <div className="w-full max-w-6xl mx-auto">
      <h2 className="text-3xl font-bold mb-6 text-gray-800 text-center">Dashboard Overview</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 mb-8">
        {stats.map((s, i) => (
          <StatCard key={i} label={s.label} value={s.value} icon={s.icon} />
        ))}
      </div>
      {/* Optional: Chart or recent activity */}
    </div>
  );
}
