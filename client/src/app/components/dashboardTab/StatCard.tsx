import { FileText, Database, User, AlertCircle } from "lucide-react";
import React from "react";

type Props = {
  label: string;
  value: string | number | null;
  icon: string;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
};

const icons = { FileText, Database, User, AlertCircle };

export default function StatCard({ label, value, icon, onClick, disabled = false, loading = false }: Props) {
  const Icon = (icons as any)[icon] || FileText;
  
  const handleClick = () => {
    if (!disabled && !loading && onClick) {
      onClick();
    }
  };

  const cardClasses = `
    bg-white/90 rounded-2xl p-6 flex items-center gap-4 shadow transition-all duration-200
    ${disabled 
      ? 'opacity-50 cursor-not-allowed' 
      : loading 
        ? 'cursor-wait' 
        : onClick 
          ? 'cursor-pointer hover:shadow-xl hover:scale-105 active:scale-95' 
          : ''
    }
  `;

  return (
    <div 
      className={cardClasses}
      onClick={handleClick}
      title={disabled ? "Coming soon" : undefined}
    >
      <Icon className={`${disabled ? 'text-gray-400' : 'text-blue-600'}`} size={34} />
      <div className="flex-1">
        <div className={`text-2xl font-extrabold ${disabled ? 'text-gray-400' : 'text-gray-800'}`}>
          {loading ? '...' : disabled ? '—' : value}
        </div>
        <div className={`${disabled ? 'text-gray-400' : 'text-gray-500'}`}>
          {label}
        </div>
      </div>
      {disabled && (
        <AlertCircle className="text-gray-400" size={20} />
      )}
    </div>
  );
}
