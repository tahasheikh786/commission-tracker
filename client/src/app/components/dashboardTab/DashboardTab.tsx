'use client'
import React, { useState } from "react";
import { useRouter } from 'next/navigation';
import StatCard from "./StatCard";
import CarriersModal from "./CarriersModal";
import { useDashboardStats, useCarriers } from "../../hooks/useDashboard";

export default function DashboardTab() {
  const router = useRouter();
  const { stats, loading } = useDashboardStats();
  const { carriers, loading: carriersLoading, fetchCarriers } = useCarriers();
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
      icon: "FileText",
      type: 'total_statements',
      disabled: false
    },
    { 
      label: "Total Carriers", 
      value: stats?.total_carriers || 0, 
      icon: "Database",
      type: 'total_carriers',
      disabled: false
    },
    { 
      label: "Total Premium", 
      value: null, 
      icon: "User",
      type: 'total_premium',
      disabled: true
    },
    { 
      label: "Policies Count", 
      value: null, 
      icon: "FileText",
      type: 'policies_count',
      disabled: true
    },
    { 
      label: "Pending Reviews", 
      value: stats?.pending_reviews || 0, 
      icon: "Database",
      type: 'pending_reviews',
      disabled: false
    },
    { 
      label: "Approved Statements", 
      value: stats?.approved_statements || 0, 
      icon: "FileText",
      type: 'approved_statements',
      disabled: false
    },
    { 
      label: "Rejected Statements", 
      value: stats?.rejected_statements || 0, 
      icon: "User",
      type: 'rejected_statements',
      disabled: false
    },
  ];

  return (
    <div className="w-full max-w-6xl mx-auto">
      <h2 className="text-3xl font-bold mb-6 text-gray-800 text-center">Dashboard Overview</h2>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 mb-8">
        {statCards.map((card, i) => (
          <StatCard 
            key={i} 
            label={card.label} 
            value={card.value} 
            icon={card.icon}
            onClick={() => handleCardClick(card.type)}
            disabled={card.disabled}
            loading={loading}
          />
        ))}
      </div>

      {/* Quick Actions Section */}
      <div className="bg-white/90 rounded-2xl p-6 shadow-sm">
        <h3 className="text-xl font-semibold text-gray-800 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            onClick={() => router.push('/upload')}
            className="p-4 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors text-left"
          >
            <div className="text-blue-600 font-semibold">Upload New Statement</div>
            <div className="text-sm text-gray-600 mt-1">Process a new commission statement</div>
          </button>
          <button
            onClick={() => router.push('/statements?tab=pending')}
            className="p-4 bg-yellow-50 hover:bg-yellow-100 rounded-xl transition-colors text-left"
          >
            <div className="text-yellow-600 font-semibold">Review Pending</div>
            <div className="text-sm text-gray-600 mt-1">Review statements awaiting approval</div>
          </button>
          <button
            onClick={() => router.push('/statements')}
            className="p-4 bg-green-50 hover:bg-green-100 rounded-xl transition-colors text-left"
          >
            <div className="text-green-600 font-semibold">View All Statements</div>
            <div className="text-sm text-gray-600 mt-1">Browse all uploaded statements</div>
          </button>
        </div>
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
