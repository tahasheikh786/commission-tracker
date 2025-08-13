'use client'
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import DashboardTab from "./components/dashboardTab/DashboardTab";
import CarrierTab from "./components/carrierTab/CarrierTab";
import UploadPage from "./upload/page";
import EarnedCommissionTab from "./components/dashboardTab/EarnedCommissionTab";

import {  UploadCloud, Database, BarChart3, DollarSign } from "lucide-react";

export default function HomePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<"dashboard" | "carriers" | "upload" | "earned-commission">("dashboard");

  // Handle URL parameters for tab selection
  useEffect(() => {
    const tabParam = searchParams.get('tab')
    console.log('URL tab parameter:', tabParam)
    if (tabParam && ['dashboard', 'carriers', 'upload', 'earned-commission'].includes(tabParam)) {
      console.log('Setting tab to:', tabParam)
      setTab(tabParam as "dashboard" | "carriers" | "upload" | "earned-commission")
    } else {
      // Default to dashboard if no tab parameter or invalid tab
      console.log('Setting tab to dashboard (default)')
      setTab("dashboard")
    }
  }, [searchParams])

  const tabConfig = [
    {
      id: "dashboard" as const,
      label: "Dashboard",
      icon: BarChart3,
      description: "Overview & Analytics",
      gradient: "from-blue-500 to-cyan-500"
    },
    {
      id: "earned-commission" as const,
      label: "Earned Commission",
      icon: DollarSign,
      description: "Commission Tracking & Analysis",
      gradient: "from-green-500 to-emerald-500"
    },
    {
      id: "carriers" as const,
      label: "Carriers",
      icon: Database,
      description: "Manage Carriers & Statements",
      gradient: "from-purple-500 to-pink-500"
    },
    {
      id: "upload" as const,
      label: "Upload",
      icon: UploadCloud,
      description: "Process New Statements",
      gradient: "from-emerald-500 to-teal-500"
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex flex-col">
      {/* Enhanced Header */}
      <header className="glass border-b border-white/20 shadow-lg">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                <Database className="text-white" size={28} />
              </div>
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white animate-pulse"></div>
            </div>
            <div>
              <h1 className="font-bold text-2xl bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent">
                Commission Tracker
              </h1>
              <p className="text-sm text-gray-600">Professional Commission Management</p>
            </div>
          </div>
        </div>
      </header>

      {/* Enhanced Tab Navigation - Hidden for Earned Commission */}
      {tab !== "earned-commission" && (
        <div className="flex justify-center mt-6 px-4">
          <div className="glass rounded-2xl shadow-lg p-2 max-w-4xl w-full">
            <div className="flex gap-2">
              {tabConfig.map((tabItem) => {
                const Icon = tabItem.icon;
                const isActive = tab === tabItem.id;
                
                return (
                  <button
                    key={tabItem.id}
                    onClick={() => {
                      if (tabItem.id === 'dashboard') {
                        router.push('/');
                      } else {
                        router.push(`/?tab=${tabItem.id}`);
                      }
                    }}
                    className={`flex-1 flex flex-col items-center gap-2 px-6 py-4 rounded-xl font-medium transition-all duration-300 group relative overflow-hidden ${
                      isActive 
                        ? `bg-gradient-to-r ${tabItem.gradient} text-white shadow-lg transform scale-105` 
                        : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
                    }`}
                  >
                    {/* Background gradient for active state */}
                    {isActive && (
                      <div className="absolute inset-0 bg-gradient-to-r opacity-10 animate-pulse"></div>
                    )}
                    
                    <Icon 
                      size={24} 
                      className={`transition-transform duration-300 ${
                        isActive ? 'text-white' : 'text-gray-500 group-hover:text-gray-700'
                      } ${isActive ? 'scale-110' : 'group-hover:scale-105'}`}
                    />
                    
                    <div className="text-center">
                      <div className={`font-semibold ${isActive ? 'text-white' : 'text-gray-800'}`}>
                        {tabItem.label}
                      </div>
                      <div className={`text-xs ${isActive ? 'text-white/80' : 'text-gray-500'}`}>
                        {tabItem.description}
                      </div>
                    </div>
                    
                    {/* Active indicator */}
                    {isActive && (
                      <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-8 h-1 bg-white rounded-full"></div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Enhanced Main Content */}
      <main className="flex-1 flex flex-col items-center justify-start w-full px-4 py-8 animate-fade-in">
        {tab === "dashboard" && (
          <div className="w-full max-w-7xl animate-slide-in">
            <DashboardTab />
          </div>
        )}
        {tab === "earned-commission" && (
          <div className="w-full animate-slide-in">
            <EarnedCommissionTab />
          </div>
        )}
        {tab === "carriers" && (
          <div className="w-full max-w-7xl animate-slide-in">
            <CarrierTab />
          </div>
        )}
        {tab === "upload" && (
          <div className="w-full max-w-7xl animate-slide-in">
            <UploadPage />
          </div>
        )}
      </main>
    </div>
  );
}
