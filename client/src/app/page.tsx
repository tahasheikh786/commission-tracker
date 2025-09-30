'use client'
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import DashboardTab from "./components/dashboardTab/DashboardTab";
import CarrierTab from "./components/carrierTab/CarrierTab";
import EarnedCommissionTab from "./components/dashboardTab/EarnedCommissionTab";

import { 
  Database, 
  BarChart3, 
  DollarSign, 
  Settings, 
  LogOut, 
  ChevronDown, 
  User, 
  Menu,
  X,
  Bell,
  Search,
  Moon,
  Sun,
  ChevronLeft,
  ChevronRight,
  Upload
} from "lucide-react";

function HomePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<"dashboard" | "carriers" | "earned-commission" | "analytics">("dashboard");
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [darkMode, setDarkMode] = useState(false);

  // Handle URL parameters for tab selection
  useEffect(() => {
    const tabParam = searchParams?.get('tab')
    if (tabParam && ['dashboard', 'carriers', 'earned-commission', 'analytics'].includes(tabParam)) {
      setTab(tabParam as "dashboard" | "carriers" | "earned-commission" | "analytics")
    } else {
      // Default to dashboard if no tab parameter or invalid tab
      setTab("dashboard")
    }
  }, [searchParams])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showUserDropdown) {
        setShowUserDropdown(false);
      }
    };

    if (showUserDropdown) {
      document.addEventListener('click', handleClickOutside);
    }

    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [showUserDropdown])

  const tabConfig = [
    {
      id: "dashboard" as const,
      label: "Upload",
      icon: Upload,
      description: "Upload & Process Documents",
      gradient: "from-blue-600 via-indigo-600 to-purple-600",
      bgGradient: "from-blue-50 via-indigo-50 to-purple-50"
    },
    {
      id: "analytics" as const,
      label: "Analytics",
      icon: BarChart3,
      description: "Overview & Analytics",
      gradient: "from-emerald-600 via-teal-600 to-cyan-600",
      bgGradient: "from-emerald-50 via-teal-50 to-cyan-50"
    },
    {
      id: "earned-commission" as const,
      label: "Earned Commission",
      icon: DollarSign,
      description: "Commission Tracking & Analysis",
      gradient: "from-violet-600 via-purple-600 to-fuchsia-600",
      bgGradient: "from-violet-50 via-purple-50 to-fuchsia-50"
    },
    {
      id: "carriers" as const,
      label: "Carriers",
      icon: Database,
      description: "Manage Carriers & Statements",
      gradient: "from-orange-600 via-red-600 to-pink-600",
      bgGradient: "from-orange-50 via-red-50 to-pink-50"
    },
  ];

  return (
    <div className={`min-h-screen flex ${darkMode ? 'dark' : ''}`}>
      {/* Sidebar */}
      <div 
        className={`${sidebarCollapsed ? 'w-16 hover:w-80' : 'w-80'} transition-all duration-300 bg-white border-r border-slate-200 flex flex-col shadow-xl group`}
        onMouseEnter={() => setSidebarCollapsed(false)}
        onMouseLeave={() => setSidebarCollapsed(true)}
      >
        {/* Sidebar Header */}
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center justify-center">
            <div className="relative">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                <Database className="text-white" size={20} />
              </div>
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-gradient-to-r from-emerald-400 to-teal-400 rounded-full border-2 border-white shadow-sm"></div>
            </div>
            <div className={`ml-3 transition-opacity duration-300 ${sidebarCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'}`}>
              <h1 className="font-bold text-lg bg-gradient-to-r from-slate-800 via-slate-700 to-slate-600 bg-clip-text text-transparent whitespace-nowrap">
                Commission Tracker
              </h1>
              <p className="text-xs text-slate-500 font-medium whitespace-nowrap">Professional SaaS</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-2">
          {tabConfig.map((tabItem) => {
            const Icon = tabItem.icon;
            const isActive = tab === tabItem.id;
            
            return (
              <div key={tabItem.id} className="relative group">
                <button
                  onClick={() => {
                    if (tabItem.id === 'dashboard') {
                      router.push('/');
                    } else {
                      router.push(`/?tab=${tabItem.id}`);
                    }
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all duration-200 ${
                    isActive 
                      ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg' 
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                  style={{
                    minHeight: '48px' // Ensure consistent height for proper background coverage
                  }}
                >
                  <Icon size={20} className="flex-shrink-0 flex items-center justify-center" />
                  <span className={`transition-opacity duration-300 ${
                    sidebarCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'
                  }`}>
                    {tabItem.label}
                  </span>
                  {!sidebarCollapsed && isActive && (
                    <div className="ml-auto w-2 h-2 bg-white rounded-full"></div>
                  )}
                </button>
                
                {/* Tooltip for collapsed state */}
                {sidebarCollapsed && (
                  <div className="absolute left-full ml-2 px-3 py-2 bg-slate-800 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
                    {tabItem.label}
                    <div className="absolute left-0 top-1/2 transform -translate-y-1/2 -translate-x-1 w-2 h-2 bg-slate-800 rotate-45"></div>
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* User Profile Section */}
        <div className="p-4 border-t border-slate-200">
          <div className="relative group">
            <button
              onClick={() => setShowUserDropdown(!showUserDropdown)}
              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-100 transition-colors"
            >
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-semibold text-sm shadow-lg flex-shrink-0">
                {user?.first_name?.[0] || user?.email?.[0]?.toUpperCase() || 'U'}
              </div>
              <div className={`flex-1 text-left transition-opacity duration-300 ${
                sidebarCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'
              }`}>
                <p className="text-sm font-medium text-slate-700 truncate">
                  {user?.first_name && user?.last_name 
                    ? `${user.first_name} ${user.last_name}`
                    : user?.email
                  }
                </p>
                <p className="text-xs text-slate-500 capitalize">{user?.role}</p>
              </div>
              {!sidebarCollapsed && (
                <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${showUserDropdown ? 'rotate-180' : ''}`} />
              )}
            </button>
            
            {/* Tooltip for collapsed state */}
            {sidebarCollapsed && (
              <div className="absolute left-full ml-2 px-3 py-2 bg-slate-800 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
                {user?.first_name && user?.last_name 
                  ? `${user.first_name} ${user.last_name}`
                  : user?.email
                }
                <div className="absolute left-0 top-1/2 transform -translate-y-1/2 -translate-x-1 w-2 h-2 bg-slate-800 rotate-45"></div>
              </div>
            )}

            {/* Dropdown Menu */}
            {showUserDropdown && !sidebarCollapsed && (
              <div className="absolute bottom-full left-0 right-0 mb-2 bg-white rounded-xl shadow-xl border border-slate-200 z-50">
                <div className="p-3 border-b border-slate-100">
                  <p className="font-medium text-slate-900 text-sm">
                    {user?.first_name && user?.last_name 
                      ? `${user.first_name} ${user.last_name}`
                      : user?.email
                    }
                  </p>
                  <p className="text-xs text-slate-500 capitalize">{user?.role}</p>
                </div>
                <div className="p-2">
                  <button
                    onClick={() => setDarkMode(!darkMode)}
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 rounded-lg transition-colors duration-200"
                  >
                    {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                    {darkMode ? 'Light Mode' : 'Dark Mode'}
                  </button>
                  {user?.role === 'admin' && (
                    <button
                      onClick={() => {
                        router.push('/admin/dashboard');
                        setShowUserDropdown(false);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 rounded-lg transition-colors duration-200"
                    >
                      <Settings className="w-4 h-4" />
                      Admin Dashboard
                    </button>
                  )}
                  <button
                    onClick={() => {
                      logout();
                      setShowUserDropdown(false);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors duration-200"
                  >
                    <LogOut className="w-4 h-4" />
                    Logout
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="bg-white border-b border-slate-200 px-6 py-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h2 className="text-2xl font-bold text-slate-800">
                {tabConfig.find(t => t.id === tab)?.label}
              </h2>
              <p className="text-sm text-slate-500">
                {tabConfig.find(t => t.id === tab)?.description}
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              <button className="p-2 rounded-lg hover:bg-slate-100 transition-colors">
                <Search className="w-5 h-5 text-slate-500" />
              </button>
              <button className="p-2 rounded-lg hover:bg-slate-100 transition-colors relative">
                <Bell className="w-5 h-5 text-slate-500" />
                <div className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></div>
              </button>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 p-6 bg-slate-50 overflow-y-auto">
          <div className="max-w-none">
            {tab === "dashboard" && <DashboardTab />}
            {tab === "analytics" && <DashboardTab showAnalytics={true} />}
            {tab === "earned-commission" && <EarnedCommissionTab />}
            {tab === "carriers" && <CarrierTab />}
          </div>
        </main>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <ProtectedRoute requireAuth={true}>
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
    </ProtectedRoute>
  );
}
