'use client'
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import AuthGuard from "@/components/AuthGuard";
import DashboardTab from "./components/dashboardTab/DashboardTab";
import CarrierTab from "./components/carrierTab/CarrierTab";
import EarnedCommissionTab from "./components/dashboardTab/EarnedCommissionTab";
import DemosTab from "./components/demosTab/DemosTab";

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
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  TestTube
} from "lucide-react";
import { ThemeToggle } from "./components/ui/ThemeToggle";

function HomePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<"dashboard" | "carriers" | "earned-commission" | "analytics" | "demos">("dashboard");
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Handle URL parameters for tab selection
  useEffect(() => {
    const tabParam = searchParams?.get('tab')
    if (tabParam && ['dashboard', 'carriers', 'earned-commission', 'analytics', 'demos'].includes(tabParam)) {
      setTab(tabParam as "dashboard" | "carriers" | "earned-commission" | "analytics" | "demos")
    } else {
      // Default to dashboard if no tab parameter or invalid tab
      setTab("dashboard")
    }
  }, [searchParams])

  // Handle responsive behavior
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) {
        setSidebarOpen(false);
      }
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showUserDropdown) {
        // Check if the click is inside the user dropdown or theme toggle
        const target = event.target as Element;
        const userDropdown = document.querySelector('[role="menu"]');
        const themeToggle = document.querySelector('[aria-label="Select theme"]');
        
        if (userDropdown && userDropdown.contains(target)) {
          return; // Don't close if clicking inside user dropdown
        }
        
        if (themeToggle && themeToggle.contains(target)) {
          return; // Don't close if clicking inside theme toggle
        }
        
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
      label: "Dashboard",
      icon: BarChart3,
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
    {
      id: "demos" as const,
      label: "Demos",
      icon: TestTube,
      description: "Test & Demo Center",
      gradient: "from-orange-600 via-red-600 to-pink-600",
      bgGradient: "from-orange-50 via-red-50 to-pink-50"
    },
  ];

  return (
    <div className="min-h-screen flex">
      {/* Mobile Overlay */}
      {isMobile && sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      
      {/* Sidebar */}
      <div className={`
        ${isMobile 
          ? `fixed top-0 left-0 h-full z-50 transform transition-transform duration-300 ${
              sidebarOpen ? 'translate-x-0' : '-translate-x-full'
            } w-80`
          : `fixed top-0 left-0 h-full ${sidebarCollapsed ? 'w-20' : 'w-80'} transition-all duration-300 z-30`
        } 
        bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 flex flex-col shadow-xl
      `}>
        {/* Sidebar Header */}
        <div className={`${sidebarCollapsed ? 'p-4' : 'p-6'} border-b border-slate-200 dark:border-slate-700`}>
          <div className="flex items-center justify-between">
            {!sidebarCollapsed ? (
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                    <Database className="text-white" size={20} />
                  </div>
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-gradient-to-r from-emerald-400 to-teal-400 rounded-full border-2 border-white shadow-sm"></div>
                </div>
                <div>
                  <h1 className="font-bold text-lg bg-gradient-to-r from-gray-800 via-gray-700 to-gray-600 dark:from-slate-100 dark:via-slate-200 dark:to-slate-300 bg-clip-text text-transparent">
                    Commission Tracker
                  </h1>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Professional SaaS</p>
                </div>
              </div>
            ) : (
              <div className="flex justify-center">
                <div className="relative">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                    <Database className="text-white" size={20} />
                  </div>
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-gradient-to-r from-emerald-400 to-teal-400 rounded-full border-2 border-white shadow-sm"></div>
                </div>
              </div>
            )}
            <button
              onClick={() => {
                if (isMobile) {
                  setSidebarOpen(false);
                } else {
                  setSidebarCollapsed(!sidebarCollapsed);
                }
              }}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-all duration-200 focus:outline-none transform hover:scale-105 active:scale-95 cursor-pointer"
              aria-label={isMobile ? "Close sidebar" : (sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar")}
              title={isMobile ? "Close sidebar" : (sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar")}
            >
              {isMobile ? <X size={16} /> : (sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />)}
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav className={`flex-1 ${sidebarCollapsed ? 'p-2' : 'p-4'} space-y-2`}>
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
                  // Close sidebar on mobile after navigation
                  if (isMobile) {
                    setSidebarOpen(false);
                  }
                }}
                className={`w-full flex items-center justify-between p-3 rounded-lg transition-all cursor-pointer border border-transparent ${
                  isActive 
                    ? 'bg-blue-100 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-300' 
                    : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
                }`}
                aria-label={`Navigate to ${tabItem.label}`}
                title={sidebarCollapsed ? `${tabItem.label} - ${tabItem.description}` : tabItem.description}
                aria-current={isActive ? "page" : undefined}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-gradient-to-br from-primary to-primary/80 dark:from-primary/90 dark:to-primary/70 rounded-lg flex items-center justify-center shadow-sm">
                    <Icon size={16} className="text-white" />
                  </div>
                  {!sidebarCollapsed && (
                    <div className="text-left flex-1 min-w-0">
                      <div className="font-medium text-slate-700 dark:text-slate-300 truncate">{tabItem.label}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{tabItem.description}</div>
                    </div>
                  )}
                </div>
                {!sidebarCollapsed && (
                  <div className="w-4 h-4 flex items-center justify-center">
                    {isActive && (
                      <div className="w-2 h-2 bg-primary rounded-full shadow-sm animate-pulse"></div>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </nav>

        {/* User Profile Section */}
        <div className={`${sidebarCollapsed ? 'p-2' : 'p-4'} border-t border-slate-200 dark:border-slate-700`}>
          <div className="relative">
            <button
              onClick={() => setShowUserDropdown(!showUserDropdown)}
              className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center p-2' : 'gap-3 p-3'} rounded-lg transition-all cursor-pointer border border-transparent hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300`}
              aria-label={`User menu for ${user?.first_name || user?.email || 'User'}`}
              title={sidebarCollapsed ? `${user?.first_name || user?.email || 'User'} (${user?.role})` : `User menu - ${user?.first_name || user?.email || 'User'}`}
              aria-expanded={showUserDropdown}
              aria-haspopup="menu"
            >
              <div className="w-8 h-8 bg-gradient-to-br from-primary to-primary/80 dark:from-primary/90 dark:to-primary/70 rounded-lg flex items-center justify-center text-white font-semibold text-sm shadow-sm">
                {user?.first_name?.[0] || user?.email?.[0]?.toUpperCase() || 'U'}
              </div>
              <div className={`flex-1 text-left transition-opacity duration-300 ${
                sidebarCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'
              }`}>
                <div className="font-medium text-slate-700 dark:text-slate-300 truncate">
                  {user?.first_name && user?.last_name 
                    ? `${user.first_name} ${user.last_name}`
                    : user?.email
                  }
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 capitalize">{user?.role}</div>
              </div>
              {!sidebarCollapsed && (
                <div className="w-4 h-4 flex items-center justify-center">
                  <ChevronDown className={`w-4 h-4 text-slate-500 dark:text-slate-400 transition-transform duration-200 ${showUserDropdown ? 'rotate-180' : ''}`} />
                </div>
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
              <div 
                className="absolute bottom-full left-0 right-0 mb-2 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 z-50 animate-in fade-in-0 zoom-in-95 duration-200"
                role="menu"
                aria-label="User menu options"
              >
                <div className="p-3 border-b border-slate-200 dark:border-slate-700">
                  <div className="font-medium text-slate-700 dark:text-slate-300 text-sm">
                    {user?.first_name && user?.last_name 
                      ? `${user.first_name} ${user.last_name}`
                      : user?.email
                    }
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 capitalize">{user?.role}</div>
                </div>
                <div className="p-2">
                  <div className="w-full mb-4" onClick={(e) => e.stopPropagation()}>
                    <ThemeToggle />
                  </div>
                  {user?.role === 'admin' && (
                    <button
                      onClick={() => {
                        router.push('/admin/dashboard');
                        setShowUserDropdown(false);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 mb-2 cursor-pointer"
                      aria-label="Open admin dashboard"
                      role="menuitem"
                    >
                      <Settings className="w-4 h-4" />
                      <span>Admin Dashboard</span>
                    </button>
                  )}
                  <button
                    onClick={() => {
                      logout();
                      setShowUserDropdown(false);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 cursor-pointer"
                    aria-label="Logout from application"
                    role="menuitem"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Logout</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className={`flex-1 flex flex-col min-w-0 ${isMobile ? '' : (sidebarCollapsed ? 'ml-20' : 'ml-80')} transition-all duration-300`}>
        {/* Top Header */}
        <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-6 py-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* Breadcrumbs */}
              <nav className="flex items-center space-x-2 text-sm text-slate-500 dark:text-slate-400" aria-label="Breadcrumb">
                <span className="text-slate-400 dark:text-slate-500">Dashboard</span>
                <span className="text-slate-300 dark:text-slate-600">/</span>
                <span className="text-slate-700 dark:text-slate-300 font-medium">
                  {tabConfig.find(t => t.id === tab)?.label}
                </span>
              </nav>
            </div>
            
            <div className="flex-1 flex justify-center">
              <p className="text-2xl font-bold text-slate-700 dark:text-slate-300">
                {tabConfig.find(t => t.id === tab)?.description}
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              <button 
                className="p-2 rounded-lg hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 dark:hover:from-blue-900/20 dark:hover:to-indigo-900/20 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transform hover:scale-105 active:scale-95 cursor-pointer"
                aria-label="Search in application"
                title="Search"
              >
                <Search className="w-5 h-5 text-slate-500 dark:text-slate-400" />
              </button>
              <button 
                className="p-2 rounded-lg hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 dark:hover:from-blue-900/20 dark:hover:to-indigo-900/20 transition-all duration-200 relative focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transform hover:scale-105 active:scale-95 cursor-pointer"
                aria-label="View notifications"
                title="Notifications"
              >
                <Bell className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                <div className="absolute top-1 right-1 w-2 h-2 bg-red-500 dark:bg-red-400 rounded-full" aria-label="New notification"></div>
              </button>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className={`flex-1 p-6 overflow-y-auto ${isMobile ? 'ml-0' : ''}`}>
          {/* Mobile Header */}
          {isMobile && (
            <div className="flex items-center justify-between mb-6 lg:hidden">
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-2 rounded-lg hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 dark:hover:from-blue-900/20 dark:hover:to-indigo-900/20 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transform hover:scale-105 active:scale-95 cursor-pointer"
                aria-label="Open navigation menu"
                title="Open menu"
              >
                <Menu size={20} />
              </button>
              <h1 className="text-xl font-bold text-slate-700 dark:text-slate-300">Commission Tracker</h1>
              <div className="w-10" aria-hidden="true" /> {/* Spacer for centering */}
            </div>
          )}
          
          <div className="dashboard-main-content">
            <div className="dashboard-content-wrapper">
              <div className="dashboard-inner-content">
                {tab === "dashboard" && <DashboardTab />}
                {tab === "analytics" && <DashboardTab showAnalytics={true} />}
                {tab === "earned-commission" && <EarnedCommissionTab />}
                {tab === "carriers" && <CarrierTab />}
                {tab === "demos" && <DemosTab />}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <AuthGuard requireAuth={true}>
      <Suspense fallback={
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-100/50 dark:from-slate-900 dark:via-slate-800/50 dark:to-slate-700/30 flex items-center justify-center">
          <div className="text-center">
            <div className="relative">
              <div className="w-16 h-16 bg-gradient-to-br from-primary via-primary/80 to-secondary rounded-2xl flex items-center justify-center shadow-lg animate-pulse">
                <Database className="text-primary-foreground" size={32} />
              </div>
              <div className="absolute -top-2 -right-2 w-6 h-6 bg-gradient-to-r from-success to-accent rounded-full animate-ping"></div>
            </div>
            <p className="mt-6 text-slate-700 dark:text-slate-300 font-medium">Loading Commission Tracker...</p>
          </div>
        </div>
      }>
        <HomePageContent />
      </Suspense>
    </AuthGuard>
  );
}
