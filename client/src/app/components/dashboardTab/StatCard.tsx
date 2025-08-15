import { FileText, Database, User, AlertCircle, TrendingUp, Users, Clock, CheckCircle, XCircle, ArrowRight } from "lucide-react";
import React from "react";

type Props = {
  label: string;
  value: string | number | null;
  icon: string | React.ComponentType<any>;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  color?: 'blue' | 'purple' | 'green' | 'red' | 'amber' | 'gray';
  description?: string;
  gradient?: string;
};

const icons = { 
  FileText, 
  Database, 
  User, 
  AlertCircle, 
  TrendingUp, 
  Users, 
  Clock, 
  CheckCircle, 
  XCircle 
};

const colorClasses = {
  blue: 'text-blue-600',
  purple: 'text-purple-600',
  green: 'text-emerald-600',
  red: 'text-red-600',
  amber: 'text-amber-600',
  gray: 'text-slate-400'
};

const bgColorClasses = {
  blue: 'bg-blue-50',
  purple: 'bg-purple-50',
  green: 'bg-emerald-50',
  red: 'bg-red-50',
  amber: 'bg-amber-50',
  gray: 'bg-slate-50'
};

export default function StatCard({ 
  label, 
  value, 
  icon, 
  onClick, 
  disabled = false, 
  loading = false,
  color = 'blue',
  description,
  gradient = 'from-blue-500 to-indigo-600'
}: Props) {
  const Icon = typeof icon === 'string' ? (icons as any)[icon] || FileText : icon;
  
  const handleClick = () => {
    if (!disabled && !loading && onClick) {
      onClick();
    }
  };

  const cardClasses = `
    group relative bg-white/90 backdrop-blur-xl rounded-2xl border border-white/50 shadow-lg hover:shadow-2xl p-6
    transition-all duration-300 cursor-pointer
    ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105 hover:-translate-y-1'}
  `;

  return (
    <div 
      className={cardClasses}
      onClick={handleClick}
      title={disabled ? "Coming soon" : undefined}
    >
      {/* Background Gradient Overlay */}
      <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-0 group-hover:opacity-5 transition-opacity duration-300 rounded-2xl`}></div>
      
      {/* Content */}
      <div className="relative z-10">
        <div className="flex items-start justify-between mb-4">
          <div className={`w-12 h-12 rounded-xl bg-gradient-to-r ${gradient} flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300`}>
            <Icon className="text-white" size={24} />
          </div>
          
        </div>
        
        <div className="space-y-2">
          <div className={`text-3xl font-bold ${disabled ? 'text-slate-400' : 'text-slate-800'} group-hover:text-slate-900 transition-colors`}>
            {loading ? (
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 border-2 border-slate-200 border-t-slate-600 rounded-full animate-spin"></div>
                <span>Loading...</span>
              </div>
            ) : disabled ? '—' : value}
          </div>
          
          <div className={`font-semibold text-sm ${disabled ? 'text-slate-400' : 'text-slate-700'} group-hover:text-slate-800 transition-colors`}>
            {label}
          </div>
          
          {description && (
            <div className={`text-xs ${disabled ? 'text-slate-400' : 'text-slate-500'} group-hover:text-slate-600 transition-colors`}>
              {description}
            </div>
          )}
        </div>
        
        {/* Interactive Arrow */}
        {!disabled && onClick && (
          <div className="absolute bottom-4 right-4 w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center group-hover:bg-slate-200 transition-colors opacity-0 group-hover:opacity-100">
            <ArrowRight size={16} className="text-slate-600 group-hover:translate-x-0.5 transition-transform" />
          </div>
        )}
        
        {/* Disabled Indicator */}
        {disabled && (
          <div className="absolute bottom-4 right-4 flex items-center gap-1 px-2 py-1 bg-slate-100 rounded-full">
            <AlertCircle className="text-slate-400" size={14} />
            <span className="text-slate-400 text-xs font-medium">Coming Soon</span>
          </div>
        )}
      </div>
      
      {/* Hover Border Effect */}
      <div className={`absolute inset-0 rounded-2xl border-2 border-transparent group-hover:border-gradient-to-r ${gradient} opacity-0 group-hover:opacity-20 transition-all duration-300`}></div>
    </div>
  );
}
