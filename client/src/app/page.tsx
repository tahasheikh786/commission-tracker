'use client'
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import DashboardTab from "./components/dashboardTab/DashboardTab";
import CarrierTab from "./components/carrierTab/CarrierTab";
import EarnedCommissionTab from "./components/dashboardTab/EarnedCommissionTab";

import { Database, BarChart3, DollarSign, ChevronRight } from "lucide-react";

function HomePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<"dashboard" | "carriers" | "earned-commission">("dashboard");

  // Handle URL parameters for tab selection
  useEffect(() => {
    const tabParam = searchParams.get('tab')
    if (tabParam && ['dashboard', 'carriers', 'earned-commission'].includes(tabParam)) {
      setTab(tabParam as "dashboard" | "carriers" | "earned-commission")
    } else {
      // Default to dashboard if no tab parameter or invalid tab
      setTab("dashboard")
    }
  }, [searchParams])

  const tabConfig = [
    {
      id: "dashboard" as const,
      label: "Dashboard",
      icon: BarChart3,
      description: "Overview & Analytics",
      gradient: "from-blue-600 via-indigo-600 to-purple-600",
      bgGradient: "from-blue-50 via-indigo-50 to-purple-50"
    },
    {
      id: "earned-commission" as const,
      label: "Earned Commission",
      icon: DollarSign,
      description: "Commission Tracking & Analysis",
      gradient: "from-emerald-600 via-teal-600 to-cyan-600",
      bgGradient: "from-emerald-50 via-teal-50 to-cyan-50"
    },
    {
      id: "carriers" as const,
      label: "Carriers",
      icon: Database,
      description: "Manage Carriers & Statements",
      gradient: "from-violet-600 via-purple-600 to-fuchsia-600",
      bgGradient: "from-violet-50 via-purple-50 to-fuchsia-50"
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-100/50">
      {/* Premium Header with Enhanced Navigation */}
      <header className="bg-white/90 backdrop-blur-xl border-b border-slate-200/60 shadow-lg sticky top-0 z-50">
        <div className="w-[90%] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Enhanced Logo and Title */}
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                  <Database className="text-white" size={24} />
                </div>
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-gradient-to-r from-emerald-400 to-teal-400 rounded-full border-2 border-white shadow-sm"></div>
              </div>
              <div>
                <h1 className="font-bold text-2xl bg-gradient-to-r from-slate-800 via-slate-700 to-slate-600 bg-clip-text text-transparent">
                  Commission Tracker
                </h1>
                <p className="text-sm text-slate-500 font-medium">Professional Commission Management</p>
              </div>
            </div>

            {/* Enhanced Navigation Tabs */}
            <nav className="flex items-center gap-2 bg-slate-100/80 backdrop-blur-sm rounded-2xl p-2 shadow-inner">
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
                    className={`group relative flex items-center gap-3 px-6 py-3 rounded-xl font-semibold transition-all duration-300 ${
                      isActive 
                        ? `bg-gradient-to-r ${tabItem.gradient} text-white shadow-lg transform scale-105` 
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/70 hover:shadow-md'
                    }`}
                  >
                    <Icon size={18} className={`transition-transform duration-200 ${isActive ? 'scale-110' : 'group-hover:scale-105'}`} />
                    <span className="hidden sm:inline font-medium">{tabItem.label}</span>
                    {isActive && (
                      <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-white rounded-full shadow-sm"></div>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>
      </header>

      {/* Enhanced Main Content - 90% Width */}
      <main className="w-[90%] mx-auto px-6 py-8">
        <div className={`rounded-3xl p-8 bg-gradient-to-br ${tabConfig.find(t => t.id === tab)?.bgGradient} shadow-xl border border-white/50`}>
          {tab === "dashboard" && <DashboardTab />}
          {tab === "earned-commission" && <EarnedCommissionTab />}
          {tab === "carriers" && <CarrierTab />}
        </div>
      </main>
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-100/50 flex items-center justify-center">
        <div className="text-center">
          <div className="relative">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg animate-pulse">
              <Database className="text-white" size={32} />
            </div>
            <div className="absolute -top-2 -right-2 w-6 h-6 bg-gradient-to-r from-emerald-400 to-teal-400 rounded-full animate-ping"></div>
          </div>
          <p className="mt-6 text-slate-600 font-medium">Loading Commission Tracker...</p>
        </div>
      </div>
    }>
      <HomePageContent />
    </Suspense>
  );
}
