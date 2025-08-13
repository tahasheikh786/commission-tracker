'use client'
import React, { useState } from "react";
import { useRouter } from 'next/navigation';
import StatCard from "./StatCard";
import CarriersModal from "./CarriersModal";
import { useDashboardStats, useCarriers, useEarnedCommissionStats } from "../../hooks/useDashboard";
import { TrendingUp, Upload, FileText, Users, Clock, CheckCircle, XCircle, AlertTriangle } from "lucide-react";

export default function DashboardTab() {
  const router = useRouter();
  const { stats, loading } = useDashboardStats();
  const { carriers, loading: carriersLoading, fetchCarriers } = useCarriers();
  const { stats: earnedCommissionStats, loading: earnedCommissionLoading } = useEarnedCommissionStats();
  const [carriersModalOpen, setCarriersModalOpen] = useState(false);

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

  const statCards = [
    { 
      label: "Total Statements", 
      value: stats?.total_statements || 0, 
      icon: FileText,
      type: 'total_statements',
      disabled: false,
      color: 'blue' as const,
      trend: '+12%',
      description: 'From last month'
    },
    { 
      label: "Total Carriers", 
      value: stats?.total_carriers || 0, 
      icon: Users,
      type: 'total_carriers',
      disabled: false,
      color: 'purple' as const,
      trend: '+5%',
      description: 'Active carriers'
    },
    { 
      label: "Total Earned Commission", 
      value: earnedCommissionStats?.total_commission ? `$${(earnedCommissionStats.total_commission / 1000).toFixed(1)}K` : '$0', 
      icon: TrendingUp,
      type: 'total_earned_commission',
      disabled: false,
      color: 'green' as const,
      trend: null,
      description: 'Total commission earned'
    },
    { 
      label: "Policies Count", 
      value: null, 
      icon: FileText,
      type: 'policies_count',
      disabled: true,
      color: 'gray' as const,
      trend: null,
      description: 'Coming soon'
    },
    { 
      label: "Pending Reviews", 
      value: stats?.pending_reviews || 0, 
      icon: Clock,
      type: 'pending_reviews',
      disabled: false,
      color: 'amber' as const,
      trend: (stats?.pending_reviews || 0) > 0 ? '!' : null,
      description: 'Awaiting review'
    },
    { 
      label: "Approved Statements", 
      value: stats?.approved_statements || 0, 
      icon: CheckCircle,
      type: 'approved_statements',
      disabled: false,
      color: 'green' as const,
      trend: '+8%',
      description: 'Successfully processed'
    },
    { 
      label: "Rejected Statements", 
      value: stats?.rejected_statements || 0, 
      icon: XCircle,
      type: 'rejected_statements',
      disabled: false,
      color: 'red' as const,
      trend: (stats?.rejected_statements || 0) > 0 ? '!' : null,
      description: 'Requires attention'
    },
  ];

  const quickActions = [
    {
      title: "Upload New Statement",
      description: "Process a new commission statement",
      icon: Upload,
      action: () => router.push('/upload'),
      gradient: "from-blue-500 to-cyan-500"
    },
    {
      title: "View Earned Commission",
      description: "Track commission earnings and analysis",
      icon: TrendingUp,
      action: () => router.push('/?tab=earned-commission'),
      gradient: "from-green-500 to-emerald-500"
    },
    {
      title: "Review Pending",
      description: "Review statements awaiting approval",
      icon: AlertTriangle,
      action: () => router.push('/statements?tab=pending'),
      gradient: "from-amber-500 to-orange-500"
    },
    {
      title: "View All Statements",
      description: "Browse all uploaded statements",
      icon: FileText,
      action: () => router.push('/statements'),
      gradient: "from-purple-500 to-pink-500"
    }
  ];

  return (
    <div className="w-full max-w-7xl mx-auto animate-fade-in">
      {/* Enhanced Header */}
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent mb-2">
          Dashboard Overview
        </h1>
        <p className="text-gray-600 text-lg">
          Monitor your commission tracking system performance and take quick actions
        </p>
      </div>
      
      {/* Enhanced Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-12">
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
              trend={card.trend}
              description={card.description}
            />
          </div>
        ))}
      </div>

  

      {/* Carriers Modal */}
      <CarriersModal
        isOpen={carriersModalOpen}
        onClose={() => setCarriersModalOpen(false)}
        carriers={carriers}
        loading={carriersLoading}
      />
    </div>
  );
}
