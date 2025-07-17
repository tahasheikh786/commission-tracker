import { FileText, Database, User } from "lucide-react";
import React from "react";

type Props = {
  label: string;
  value: string | number;
  icon: string;
};

const icons = { FileText, Database, User };

export default function StatCard({ label, value, icon }: Props) {
  const Icon = (icons as any)[icon] || FileText;
  return (
    <div className="bg-white/90 rounded-2xl p-6 flex items-center gap-4 shadow hover:shadow-xl transition">
      <Icon className="text-blue-600" size={34} />
      <div>
        <div className="text-2xl font-extrabold">{value}</div>
        <div className="text-gray-500">{label}</div>
      </div>
    </div>
  );
}
