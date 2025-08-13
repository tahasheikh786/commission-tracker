import { FileText, Database, User, AlertCircle, TrendingUp, Users, Clock, CheckCircle, XCircle } from "lucide-react";
import React from "react";

type Props = {
  label: string;
  value: string | number | null;
  icon: string | React.ComponentType<any>;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  color?: 'blue' | 'purple' | 'green' | 'red' | 'amber' | 'gray';
  trend?: string | null;
  description?: string;
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
  blue: 'text-primary',
  purple: 'text-secondary',
  green: 'text-success',
  red: 'text-destructive',
  amber: 'text-warning',
  gray: 'text-gray-400'
};

export default function StatCard({ 
  label, 
  value, 
  icon, 
  onClick, 
  disabled = false, 
  loading = false,
  color = 'blue',
  trend,
  description
}: Props) {
  const Icon = typeof icon === 'string' ? (icons as any)[icon] || FileText : icon;
  
  const handleClick = () => {
    if (!disabled && !loading && onClick) {
      onClick();
    }
  };

  const cardClasses = `
    card card-interactive p-6 flex items-center gap-4
    ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
  `;

  return (
    <div 
      className={cardClasses}
      onClick={handleClick}
      title={disabled ? "Coming soon" : undefined}
    >
      <div className="relative">
        <Icon className={`${disabled ? 'text-gray-400' : colorClasses[color]}`} size={32} />
        {trend && !disabled && (
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white flex items-center justify-center">
            <span className="text-white text-xs font-bold">{trend}</span>
          </div>
        )}
      </div>
      
      <div className="flex-1 min-w-0">
        <div className={`text-2xl font-extrabold ${disabled ? 'text-gray-400' : 'text-gray-800'}`}>
          {loading ? '...' : disabled ? '—' : value}
        </div>
        <div className={`font-medium ${disabled ? 'text-gray-400' : 'text-gray-700'}`}>
          {label}
        </div>
        {description && (
          <div className={`text-xs ${disabled ? 'text-gray-400' : 'text-gray-500'} mt-1`}>
            {description}
          </div>
        )}
      </div>
      
      {disabled && (
        <AlertCircle className="text-gray-400" size={20} />
      )}
      
      {!disabled && onClick && (
        <div className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center group-hover:bg-gray-200 transition-colors">
          <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      )}
    </div>
  );
}
