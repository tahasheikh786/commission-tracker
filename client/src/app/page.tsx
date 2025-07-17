'use client'
import { useState } from "react";
import DashboardTab from "./components/dashboardTab/DashboardTab";
import CarrierTab from "./components/carrierTab/CarrierTab";
import UploadPage from "./upload/page";
import { User, UploadCloud, Database } from "lucide-react";

export default function HomePage() {
  const [tab, setTab] = useState<"dashboard" | "carriers" | "upload">("dashboard");

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-100 to-indigo-100 flex flex-col">
      {/* Top Nav / Tab Bar */}
      <header className="flex items-center justify-between p-6 border-b bg-white/80 backdrop-blur-lg shadow-sm">
        <div className="flex items-center gap-3">
          <Database className="text-blue-600" size={28} />
          <span className="font-extrabold text-2xl tracking-tight text-gray-800">
            Commission Tracker
          </span>
        </div>
      </header>

      {/* Tabs Bar */}
      <div className="flex justify-center mt-4">
        <div className="bg-white/60 rounded-full shadow flex border px-2">
          <button
            onClick={() => setTab("dashboard")}
            className={`flex items-center gap-2 px-6 py-2 rounded-full font-semibold transition
              ${tab === "dashboard" ? "bg-blue-600 text-white shadow" : "text-gray-700 hover:bg-blue-100"}`}>
            <User size={18} />
            Dashboard
          </button>
          <button
            onClick={() => setTab("carriers")}
            className={`flex items-center gap-2 px-6 py-2 rounded-full font-semibold transition
              ${tab === "carriers" ? "bg-indigo-600 text-white shadow" : "text-gray-700 hover:bg-indigo-100"}`}>
            <Database size={18} />
            Carriers
          </button>
          <button
            onClick={() => setTab("upload")}
            className={`flex items-center gap-2 px-6 py-2 rounded-full font-semibold transition
              ${tab === "upload" ? "bg-violet-600 text-white shadow" : "text-gray-700 hover:bg-violet-100"}`}>
            <UploadCloud size={18} />
            Statement File Upload
          </button>
        </div>
      </div>

      {/* Tab Panels */}
      <main className="flex-1 flex flex-col items-center justify-start w-full px-4 py-8">
        {tab === "dashboard" && <DashboardTab />}
        {tab === "carriers" && <CarrierTab />}
        {tab === "upload" && <UploadPage />}
      </main>
    </div>
  );
}
